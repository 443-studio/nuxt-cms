import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CmsEntryChange, CmsMediaChange } from '../src/runtime/shared/hooks'
import type { CmsWebhookFetch, CmsWebhookTarget } from '../src/runtime/server/utils/webhooks'
import {
   deliverWebhook,
   deliverWebhooks,
   entryWebhookPayload,
   mediaWebhookPayload,
   webhookTargets,
   webhookWants,
} from '../src/runtime/server/utils/webhooks'
import {
   CMS_WEBHOOK_SIGNATURE_HEADER,
   parseCmsWebhookSignature,
   signCmsWebhook,
   verifyCmsWebhook,
} from '../src/runtime/webhooks'
import { resolveWebhooks, webhookEnvName } from '../src/webhooks-config'

const SECRET = 'a-very-long-webhook-secret'
const USER = { id: null, email: 'admin@example.com', name: null, role: 'superadmin' as const }

const entryChange: CmsEntryChange = {
   entry: 'news',
   kind: 'content',
   action: 'publish',
   ids: ['news_1'],
   path: null,
   status: 'published',
   item: { id: 'news_1', title: 'Hello', secretNote: 'private' },
   user: USER,
   at: '2026-11-11T10:00:00.000Z',
}

const mediaChange: CmsMediaChange = {
   action: 'folder-rename',
   keys: ['new/a.png'],
   folder: 'new',
   from: 'old',
   user: USER,
   at: '2026-11-11T10:00:00.000Z',
}

function nowSeconds() {
   return Math.floor(Date.now() / 1000)
}

afterEach(() => {
   vi.useRealTimers()
})

describe('webhook signature', () => {
   it('signs t.<body> with HMAC-SHA256 in hex', async () => {
      const body = JSON.stringify({ event: 'entry:update' })
      const header = await signCmsWebhook(body, SECRET, 1700000000)
      const expected = createHmac('sha256', SECRET).update(`1700000000.${body}`).digest('hex')
      expect(header).toBe(`t=1700000000,v1=${expected}`)
   })

   it('parses the header and ignores unknown parts', () => {
      const signature = 'a'.repeat(64)
      expect(parseCmsWebhookSignature(`t=12, v0=zz, v1=${signature}`)).toEqual({
         timestamp: 12,
         signatures: [signature],
      })
      expect(parseCmsWebhookSignature('t=12')).toBeNull()
      expect(parseCmsWebhookSignature(`v1=${signature}`)).toBeNull()
      expect(parseCmsWebhookSignature(`t=abc,v1=${signature}`)).toBeNull()
   })

   it('verifies a fresh signed body and returns the payload', async () => {
      const payload = entryWebhookPayload(entryChange)
      const body = JSON.stringify(payload)
      const header = await signCmsWebhook(body, SECRET)
      expect(await verifyCmsWebhook(body, header, SECRET)).toEqual(payload)
   })

   it('reads the body and the header from a Request', async () => {
      const body = JSON.stringify(entryWebhookPayload(entryChange))
      const request = new Request('https://site.example/api/cms-hook', {
         method: 'POST',
         body,
         headers: { [CMS_WEBHOOK_SIGNATURE_HEADER]: await signCmsWebhook(body, SECRET) },
      })
      expect(await verifyCmsWebhook(request, null, SECRET)).toMatchObject({
         event: 'entry:publish',
      })
   })

   it('rejects a tampered body, a wrong secret and a missing header', async () => {
      const body = JSON.stringify({ event: 'entry:update' })
      const header = await signCmsWebhook(body, SECRET)
      expect(await verifyCmsWebhook(`${body} `, header, SECRET)).toBeNull()
      expect(await verifyCmsWebhook(body, header, `${SECRET}-other`)).toBeNull()
      expect(await verifyCmsWebhook(body, null, SECRET)).toBeNull()
      expect(await verifyCmsWebhook(body, header, '')).toBeNull()
   })

   it('rejects a timestamp outside the tolerance', async () => {
      const body = JSON.stringify({ event: 'entry:update' })
      const old = await signCmsWebhook(body, SECRET, nowSeconds() - 301)
      const future = await signCmsWebhook(body, SECRET, nowSeconds() + 301)
      expect(await verifyCmsWebhook(body, old, SECRET)).toBeNull()
      expect(await verifyCmsWebhook(body, future, SECRET)).toBeNull()
      expect(await verifyCmsWebhook(body, old, SECRET, 600)).toEqual({ event: 'entry:update' })
   })

   it('accepts any matching v1 signature, for secret rotation', async () => {
      const body = JSON.stringify({ event: 'media:upload' })
      const t = nowSeconds()
      const current = (await signCmsWebhook(body, SECRET, t)).split(',')[1]
      const header = `t=${t},v1=${'0'.repeat(64)},${current}`
      expect(await verifyCmsWebhook(body, header, SECRET)).toEqual({ event: 'media:upload' })
   })

   it('rejects a correctly signed body that is not JSON', async () => {
      const header = await signCmsWebhook('not json', SECRET)
      expect(await verifyCmsWebhook('not json', header, SECRET)).toBeNull()
   })
})

describe('webhook payloads', () => {
   it('keeps the entry payload to ids and metadata, without item or user', () => {
      expect(entryWebhookPayload(entryChange)).toEqual({
         event: 'entry:publish',
         action: 'publish',
         entry: 'news',
         kind: 'content',
         ids: ['news_1'],
         path: null,
         status: 'published',
         at: '2026-11-11T10:00:00.000Z',
      })
   })

   it('builds the media payload', () => {
      expect(mediaWebhookPayload(mediaChange)).toEqual({
         event: 'media:folder-rename',
         action: 'folder-rename',
         keys: ['new/a.png'],
         folder: 'new',
         from: 'old',
         at: '2026-11-11T10:00:00.000Z',
      })
   })

   it('matches events by group or by exact name', () => {
      expect(webhookWants([], 'entry:create')).toBe(true)
      expect(webhookWants(['entry'], 'entry:delete')).toBe(true)
      expect(webhookWants(['entry'], 'media:upload')).toBe(false)
      expect(webhookWants(['entry:publish', 'media'], 'entry:publish')).toBe(true)
      expect(webhookWants(['entry:publish'], 'entry:update')).toBe(false)
   })

   it('reads targets from runtime config, skipping the ones without a url', () => {
      expect(
         webhookTargets({
            deploy: { url: 'https://hooks.example/deploy', secret: 1234, events: [], timeout: 0 },
            search: { url: '', secret: '', events: ['entry'], timeout: 2000 },
         })
      ).toEqual([
         {
            name: 'deploy',
            url: 'https://hooks.example/deploy',
            secret: '1234',
            events: [],
            timeout: 5000,
         },
      ])
      expect(webhookTargets(undefined)).toEqual([])
   })
})

describe('webhook delivery', () => {
   const target: CmsWebhookTarget = {
      name: 'deploy',
      url: 'https://hooks.example/deploy?token=abc',
      secret: SECRET,
      events: [],
      timeout: 1000,
   }

   it('posts signed JSON that verifyCmsWebhook accepts', async () => {
      const calls: { url: string; headers: Record<string, string>; body: string }[] = []
      const fetcher: CmsWebhookFetch = async (url, init) => {
         calls.push({ url, headers: init.headers, body: init.body })
         return { ok: true, status: 204 }
      }
      const payload = entryWebhookPayload(entryChange)
      await deliverWebhook(target, payload, fetcher)
      expect(calls).toHaveLength(1)
      const [call] = calls
      expect(call!.url).toBe(target.url)
      expect(call!.headers['content-type']).toBe('application/json')
      expect(call!.headers['x-cms-event']).toBe('entry:publish')
      expect(call!.headers['x-cms-delivery']).toMatch(/^[0-9a-f-]{36}$/)
      expect(
         await verifyCmsWebhook(call!.body, call!.headers[CMS_WEBHOOK_SIGNATURE_HEADER], SECRET)
      ).toEqual(payload)
   })

   it('sends no signature without a secret', async () => {
      let headers: Record<string, string> = {}
      await deliverWebhook(
         { ...target, secret: '' },
         mediaWebhookPayload(mediaChange),
         async (_, init) => {
            headers = init.headers
            return { ok: true, status: 200 }
         }
      )
      expect(headers[CMS_WEBHOOK_SIGNATURE_HEADER]).toBeUndefined()
   })

   it('throws on a non-2xx response', async () => {
      await expect(
         deliverWebhook(target, entryWebhookPayload(entryChange), async () => ({
            ok: false,
            status: 500,
         }))
      ).rejects.toThrow('HTTP 500')
   })

   it('filters by events, logs failures and timeouts without throwing', async () => {
      const posted: string[] = []
      const logs: string[] = []
      const fetcher: CmsWebhookFetch = (url, init) => {
         posted.push(url)
         if (url.includes('slow'))
            return new Promise((_, reject) =>
               init.signal.addEventListener('abort', () => reject(init.signal.reason))
            )
         if (url.includes('down')) return Promise.reject(new Error('connect ECONNREFUSED'))
         return Promise.resolve({ ok: true, status: 200 })
      }
      await deliverWebhooks(
         [
            { ...target, name: 'ok', url: 'https://ok.example/' },
            { ...target, name: 'media', url: 'https://media.example/', events: ['media'] },
            { ...target, name: 'down', url: 'https://down.example/' },
            { ...target, name: 'slow', url: 'https://slow.example/', timeout: 20 },
         ],
         entryWebhookPayload(entryChange),
         fetcher,
         (message) => logs.push(message)
      )
      expect(posted.sort()).toEqual([
         'https://down.example/',
         'https://ok.example/',
         'https://slow.example/',
      ])
      expect(logs.sort()).toEqual([
         "[nuxt-cms] webhook 'down' (down.example) failed on entry:publish: connect ECONNREFUSED",
         "[nuxt-cms] webhook 'slow' (slow.example) failed on entry:publish: timed out after 20 ms",
      ])
   })
})

describe('resolveWebhooks', () => {
   it('accepts a valid list and keys it by name', () => {
      const result = resolveWebhooks([
         { name: 'deploy', url: 'https://api.netlify.com/build_hooks/x', secret: SECRET },
         {
            name: 'searchIndex',
            url: 'http://localhost:4000/hook',
            events: ['entry:publish', 'media'],
            timeout: 2000,
         },
      ])
      expect(result.errors).toEqual([])
      expect(result.warnings).toEqual([])
      expect(result.webhooks).toEqual({
         deploy: {
            url: 'https://api.netlify.com/build_hooks/x',
            secret: SECRET,
            events: [],
            timeout: 5000,
         },
         searchIndex: {
            url: 'http://localhost:4000/hook',
            secret: '',
            events: ['entry:publish', 'media'],
            timeout: 2000,
         },
      })
   })

   it('accepts no webhooks', () => {
      expect(resolveWebhooks(undefined)).toEqual({ webhooks: {}, errors: [], warnings: [] })
   })

   it('maps names to env vars', () => {
      expect(webhookEnvName('deploy', 'secret')).toBe('NUXT_CMS_WEBHOOKS_DEPLOY_SECRET')
      expect(webhookEnvName('searchIndex2', 'url')).toBe('NUXT_CMS_WEBHOOKS_SEARCH_INDEX2_URL')
   })

   it('warns when the url is missing at build time and not set in env', () => {
      expect(resolveWebhooks([{ name: 'deploy' }]).warnings).toEqual([
         "webhooks 'deploy' has no url: set NUXT_CMS_WEBHOOKS_DEPLOY_URL at runtime or it never fires",
      ])
      expect(
         resolveWebhooks([{ name: 'deploy' }], {
            NUXT_CMS_WEBHOOKS_DEPLOY_URL: 'https://x.example',
         }).warnings
      ).toEqual([])
   })

   it('reports every invalid option', () => {
      const errors = (input: unknown) => resolveWebhooks(input).errors
      expect(errors({})).toEqual(['webhooks must be an array of { name, url, secret, events }'])
      expect(errors(['x'])).toEqual(['webhooks[0] must be an object'])
      expect(errors([{ url: 'https://x.example' }])[0]).toContain('webhooks[0].name')
      expect(errors([{ name: 'my-hook' }])[0]).toContain('camelCase')
      expect(errors([{ name: 'myURL' }])[0]).toContain('camelCase')
      expect(errors([{ name: 'a' }, { name: 'a' }])).toEqual(["webhooks 'a' is declared twice"])
      expect(errors([{ name: 'a', url: 'not a url' }])).toEqual([
         "webhooks 'a'.url 'not a url' is not a valid URL",
      ])
      expect(errors([{ name: 'a', url: 'ftp://x.example' }])).toEqual([
         "webhooks 'a'.url 'ftp://x.example' must use http or https",
      ])
      expect(errors([{ name: 'a', url: 'https://x.example', secret: 'short' }])).toEqual([
         "webhooks 'a'.secret must be at least 16 characters",
      ])
      expect(errors([{ name: 'a', url: 'https://x.example', events: [] }])[0]).toContain(
         'non-empty array'
      )
      expect(
         errors([{ name: 'a', url: 'https://x.example', events: ['entry:save'] }])[0]
      ).toContain('unknown event "entry:save"')
      expect(errors([{ name: 'a', url: 'https://x.example', timeout: 60000 }])[0]).toContain(
         'timeout'
      )
      expect(errors([{ name: 'a', url: 'https://x.example', secrete: SECRET }])).toEqual([
         "webhooks[0] has an unknown key 'secrete'",
      ])
   })
})
