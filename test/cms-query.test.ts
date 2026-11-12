import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { $cmsQuery, cmsQueryKey, useCms } from '../src/runtime/app/composables/cms-query'
import { CMS_GRAPHQL_BATCH_LIMIT, PREVIEW_HEADER } from '../src/runtime/shared/index'
import { nuxtAppStub } from './stubs/imports'

interface Body {
   query: string
   variables?: Record<string, unknown>
}

type Fetch = (
   url: string,
   options: { method: string; body: Body | Body[]; headers?: Record<string, string> }
) => Promise<unknown>

const answer = (body: Body) => ({ data: { echo: body.query, variables: body.variables ?? null } })

let fetchMock: ReturnType<typeof vi.fn<Fetch>>

beforeEach(() => {
   fetchMock = vi.fn<Fetch>(async (_url, { body }) =>
      Array.isArray(body) ? body.map(answer) : answer(body)
   )
   vi.stubGlobal('$fetch', fetchMock)
})

afterEach(() => {
   vi.unstubAllGlobals()
   nuxtAppStub.current = null
})

const TOKEN = 'a'.repeat(43)

describe('$cmsQuery coalescing', () => {
   it('sends the queries of one tick in one request and dedupes identical ones', async () => {
      const results = await Promise.all([
         $cmsQuery('query A { a }', { locale: 'it' }),
         $cmsQuery('query B { b }'),
         $cmsQuery('query A { a }', { locale: 'it' }),
         $cmsQuery('query A { a }', { locale: 'en' }),
      ])
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, options] = fetchMock.mock.calls[0]!
      expect(url).toBe('/api/cms/graphql')
      expect(options.method).toBe('POST')
      expect(options.body).toEqual([
         { query: 'query A { a }', variables: { locale: 'it' } },
         { query: 'query B { b }' },
         { query: 'query A { a }', variables: { locale: 'en' } },
      ])
      expect(results).toEqual([
         { echo: 'query A { a }', variables: { locale: 'it' } },
         { echo: 'query B { b }', variables: null },
         { echo: 'query A { a }', variables: { locale: 'it' } },
         { echo: 'query A { a }', variables: { locale: 'en' } },
      ])
   })

   it('keeps the plain request body for a single query', async () => {
      await $cmsQuery('query Only { only }', { locale: 'de' })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock.mock.calls[0]![1].body).toEqual({
         query: 'query Only { only }',
         variables: { locale: 'de' },
      })
   })

   it('sends queries of different ticks separately and forgets settled ones', async () => {
      await $cmsQuery('query A { a }')
      await $cmsQuery('query A { a }')
      expect(fetchMock).toHaveBeenCalledTimes(2)
   })

   it('splits a tick larger than the server batch limit', async () => {
      const count = CMS_GRAPHQL_BATCH_LIMIT + 3
      await Promise.all(
         Array.from({ length: count }, (_, index) => $cmsQuery(`query Q${index} { q }`))
      )
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect((fetchMock.mock.calls[0]![1].body as Body[]).length).toBe(CMS_GRAPHQL_BATCH_LIMIT)
      expect((fetchMock.mock.calls[1]![1].body as Body[]).length).toBe(3)
   })

   it('rejects only the query whose result has errors', async () => {
      fetchMock.mockImplementationOnce(async () => [
         { data: { ok: true } },
         { errors: [{ message: 'Unknown locale: xx' }] },
      ])
      const [ok, failed] = await Promise.allSettled([
         $cmsQuery('query Ok { ok }'),
         $cmsQuery('query Bad { bad }', { locale: 'xx' }),
      ])
      expect(ok).toEqual({ status: 'fulfilled', value: { ok: true } })
      expect(failed).toMatchObject({
         status: 'rejected',
         reason: { message: 'Unknown locale: xx' },
      })
   })

   it('rejects every query of the request when the request fails', async () => {
      fetchMock.mockImplementationOnce(async () => {
         throw new Error('network down')
      })
      const settled = await Promise.allSettled([
         $cmsQuery('query A { a }'),
         $cmsQuery('query B { b }'),
      ])
      expect(settled.map((result) => result.status)).toEqual(['rejected', 'rejected'])
   })

   it('rejects when the server does not answer a batch with a list', async () => {
      fetchMock.mockImplementationOnce(async () => ({
         errors: [{ message: 'Batching is disabled' }],
      }))
      const settled = await Promise.allSettled([
         $cmsQuery('query A { a }'),
         $cmsQuery('query B { b }'),
      ])
      expect(settled).toMatchObject([
         { status: 'rejected', reason: { message: 'Batching is disabled' } },
         { status: 'rejected', reason: { message: 'Batching is disabled' } },
      ])
   })
})

describe('useCms keys', () => {
   it('keeps the async data keys and batches the handlers of one tick', async () => {
      const first = useCms('query A { a }', { locale: 'it' })
      const second = useCms('query B { b }', undefined, { key: 'cms-page:/:it' })
      await first
      await second
      expect((first as unknown as { key: string }).key).toBe(
         cmsQueryKey('query A { a }', { locale: 'it' })
      )
      expect((second as unknown as { key: string }).key).toBe('cms-page:/:it')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(first.data.value).toEqual({ echo: 'query A { a }', variables: { locale: 'it' } })
   })
})

describe('preview token forwarding', () => {
   it('sends the token of the current route as a header in its own batch, never deduped', async () => {
      const plain = $cmsQuery('query A { a }')
      nuxtAppStub.current = { _route: { query: { 'cms-preview': TOKEN } } }
      const previewed = [$cmsQuery('query A { a }'), $cmsQuery('query A { a }')]
      nuxtAppStub.current = null
      await Promise.all([plain, ...previewed])
      expect(fetchMock).toHaveBeenCalledTimes(2)
      const [publicCall, previewCall] = fetchMock.mock.calls.map((call) => call[1])
      expect(publicCall!.headers).toBeUndefined()
      expect(publicCall!.body).toEqual({ query: 'query A { a }' })
      expect(previewCall!.headers).toEqual({ [PREVIEW_HEADER]: TOKEN })
      expect(previewCall!.body).toEqual([{ query: 'query A { a }' }, { query: 'query A { a }' }])
   })

   it('ignores a malformed token', async () => {
      nuxtAppStub.current = { _route: { query: { 'cms-preview': 'not-a-token' } } }
      await $cmsQuery('query A { a }')
      expect(fetchMock.mock.calls[0]![1].headers).toBeUndefined()
   })

   it('gives preview data its own async data key', async () => {
      nuxtAppStub.current = { _route: { query: { 'cms-preview': [TOKEN] } } }
      const result = useCms('query A { a }')
      nuxtAppStub.current = null
      await result
      expect((result as unknown as { key: string }).key).toBe(
         `${cmsQueryKey('query A { a }')}:cms-preview`
      )
      expect(fetchMock.mock.calls[0]![1].headers).toEqual({ [PREVIEW_HEADER]: TOKEN })
   })
})
