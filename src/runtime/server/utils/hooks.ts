import type { H3Event } from 'h3'
import { useNitroApp } from 'nitropack/runtime'
import type {
   CmsEntryChange,
   CmsHookContext,
   CmsHookName,
   CmsHookUser,
   CmsMediaChange,
   CmsRuntimeHooks,
} from '../../shared/hooks'
import { CMS_ENTRY_CHANGE_HOOK, CMS_MEDIA_CHANGE_HOOK } from '../../shared/hooks'
import type { CmsSessionUser } from '../../shared/users'

type HookCallback = (...args: unknown[]) => unknown

export interface CmsHookHost {
   callHookWith: (
      caller: (hooks: HookCallback[], args: unknown[]) => Promise<void>,
      name: string,
      ...args: unknown[]
   ) => Promise<void>
}

export type CmsHookLogger = (message: string, error: unknown) => void

const logHookError: CmsHookLogger = (message, error) => console.error(message, error)

export function hookUser(user: CmsSessionUser): CmsHookUser {
   return {
      id: user.id ?? null,
      email: user.email,
      name: user.name ?? null,
      role: user.role ?? (user.id ? 'admin' : 'superadmin'),
   }
}

export function runHooksIsolated(
   name: string,
   hooks: HookCallback[],
   args: unknown[],
   log: CmsHookLogger = logHookError
): Promise<void> {
   return Promise.all(
      hooks.map((hook) =>
         Promise.resolve()
            .then(() => hook(...args))
            .catch((error: unknown) => {
               log(`[nuxt-cms] a '${name}' hook failed:`, error)
            })
      )
   ).then(() => undefined)
}

export function dispatchCmsHook<Name extends CmsHookName>(
   host: () => CmsHookHost,
   event: H3Event,
   name: Name,
   payload: Parameters<CmsRuntimeHooks[Name]>[0],
   log: CmsHookLogger = logHookError
): Promise<void> {
   const context: CmsHookContext = { event }
   const task = Promise.resolve()
      .then(() =>
         host().callHookWith(
            (hooks, args) => runHooksIsolated(name, hooks, args, log),
            name,
            payload,
            context
         )
      )
      .catch((error: unknown) => {
         log(`[nuxt-cms] the '${name}' hooks failed:`, error)
      })
   const waitUntil = (event as { waitUntil?: (promise: Promise<unknown>) => void }).waitUntil
   if (typeof waitUntil === 'function') {
      try {
         waitUntil.call(event, task)
      } catch (error) {
         log(`[nuxt-cms] waitUntil failed for '${name}':`, error)
      }
   }
   return task
}

function cloneItem(item: Record<string, unknown>): Record<string, unknown> {
   try {
      return structuredClone(item)
   } catch {
      return { ...item }
   }
}

function hookHost(): CmsHookHost {
   return useNitroApp().hooks as unknown as CmsHookHost
}

export function emitEntryChange(
   event: H3Event,
   user: CmsSessionUser,
   change: Omit<CmsEntryChange, 'user' | 'at' | 'path' | 'status' | 'item'> &
      Partial<Pick<CmsEntryChange, 'path' | 'status' | 'item'>>
): Promise<void> {
   return dispatchCmsHook(hookHost, event, CMS_ENTRY_CHANGE_HOOK, {
      path: null,
      status: null,
      ...change,
      item: change.item ? cloneItem(change.item) : null,
      user: hookUser(user),
      at: new Date().toISOString(),
   })
}

export function emitMediaChange(
   event: H3Event,
   user: CmsSessionUser,
   change: Pick<CmsMediaChange, 'action' | 'keys'> &
      Partial<Pick<CmsMediaChange, 'folder' | 'from'>>
): Promise<void> {
   return dispatchCmsHook(hookHost, event, CMS_MEDIA_CHANGE_HOOK, {
      folder: null,
      from: null,
      ...change,
      user: hookUser(user),
      at: new Date().toISOString(),
   })
}
