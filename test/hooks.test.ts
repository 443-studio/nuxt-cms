import type { H3Event } from 'h3'
import { describe, expect, it } from 'vitest'
import type { CmsEntryChange } from '../src/runtime/shared/hooks'
import { entryStatus, entryWriteAction } from '../src/runtime/shared/hooks'
import type { CmsHookHost } from '../src/runtime/server/utils/hooks'
import { dispatchCmsHook, hookUser, runHooksIsolated } from '../src/runtime/server/utils/hooks'

type Callback = (...args: unknown[]) => unknown

function host(hooks: Callback[]): CmsHookHost {
   return {
      callHookWith: (caller, _name, ...args) => caller(hooks, args),
   }
}

const change: CmsEntryChange = {
   entry: 'events',
   kind: 'collection',
   action: 'create',
   ids: ['events_1'],
   path: null,
   status: 'draft',
   item: { id: 'events_1' },
   user: { id: 'u1', email: 'editor@example.com', name: 'Editor', role: 'admin' },
   at: '2026-11-11T10:00:00.000Z',
}

describe('entryWriteAction', () => {
   it('reports create, publish, unpublish and update', () => {
      expect(entryWriteAction(true, null, 'published')).toBe('create')
      expect(entryWriteAction(false, 'draft', 'published')).toBe('publish')
      expect(entryWriteAction(false, null, 'published')).toBe('publish')
      expect(entryWriteAction(false, 'published', 'draft')).toBe('unpublish')
      expect(entryWriteAction(false, 'published', 'published')).toBe('update')
      expect(entryWriteAction(false, 'draft', 'draft')).toBe('update')
      expect(entryWriteAction(false, null, null)).toBe('update')
   })

   it('reads only known statuses', () => {
      expect(entryStatus('draft')).toBe('draft')
      expect(entryStatus('published')).toBe('published')
      expect(entryStatus('archived')).toBeNull()
      expect(entryStatus(undefined)).toBeNull()
   })
})

describe('hookUser', () => {
   it('maps the session user', () => {
      expect(hookUser({ email: 'root@example.com', role: 'superadmin' })).toEqual({
         id: null,
         email: 'root@example.com',
         name: null,
         role: 'superadmin',
      })
      expect(hookUser({ id: 'u1', email: 'a@example.com', name: 'A' })).toEqual({
         id: 'u1',
         email: 'a@example.com',
         name: 'A',
         role: 'admin',
      })
   })
})

describe('runHooksIsolated', () => {
   it('runs every hook even when some throw, and logs the failures', async () => {
      const calls: string[] = []
      const logs: unknown[] = []
      await runHooksIsolated(
         'cms:entry:change',
         [
            () => {
               throw new Error('sync boom')
            },
            async () => {
               throw new Error('async boom')
            },
            (payload) => {
               calls.push((payload as CmsEntryChange).ids[0]!)
            },
         ],
         [change],
         (message, error) => logs.push([message, (error as Error).message])
      )
      expect(calls).toEqual(['events_1'])
      expect(logs).toEqual([
         ["[nuxt-cms] a 'cms:entry:change' hook failed:", 'sync boom'],
         ["[nuxt-cms] a 'cms:entry:change' hook failed:", 'async boom'],
      ])
   })
})

describe('dispatchCmsHook', () => {
   it('defers the hooks, passes the event and hands the task to waitUntil', async () => {
      const waited: Promise<unknown>[] = []
      const event = { waitUntil: (promise: Promise<unknown>) => waited.push(promise) }
      const received: unknown[][] = []
      const task = dispatchCmsHook(
         () => host([(...args) => received.push(args)]),
         event as unknown as H3Event,
         'cms:entry:change',
         change
      )
      expect(received).toEqual([])
      expect(waited).toEqual([task])
      await task
      expect(received).toEqual([[change, { event }]])
   })

   it('never rejects, even when the host itself fails', async () => {
      const logs: string[] = []
      await expect(
         dispatchCmsHook(
            () => {
               throw new Error('no nitro')
            },
            {} as H3Event,
            'cms:media:change',
            {
               action: 'upload',
               keys: ['a.png'],
               folder: null,
               from: null,
               user: change.user,
               at: change.at,
            },
            (message) => logs.push(message)
         )
      ).resolves.toBeUndefined()
      expect(logs).toEqual(["[nuxt-cms] the 'cms:media:change' hooks failed:"])
   })
})
