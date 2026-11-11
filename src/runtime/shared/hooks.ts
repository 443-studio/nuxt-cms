import type { H3Event } from 'h3'
import type { CmsEntryKind } from './index'
import type { CmsUserRole } from './users'

export const CMS_ENTRY_CHANGE_HOOK = 'cms:entry:change'
export const CMS_MEDIA_CHANGE_HOOK = 'cms:media:change'

export const CMS_ENTRY_ACTIONS = [
   'create',
   'update',
   'delete',
   'publish',
   'unpublish',
   'import',
] as const

export const CMS_MEDIA_ACTIONS = [
   'upload',
   'update',
   'move',
   'delete',
   'folder-create',
   'folder-rename',
   'folder-delete',
] as const

export type CmsEntryAction = (typeof CMS_ENTRY_ACTIONS)[number]

export type CmsMediaAction = (typeof CMS_MEDIA_ACTIONS)[number]

export type CmsEntryStatus = 'draft' | 'published'

export interface CmsHookUser {
   id: string | null
   email: string
   name: string | null
   role: CmsUserRole
}

export interface CmsEntryChange {
   entry: string
   kind: CmsEntryKind
   action: CmsEntryAction
   ids: string[]
   path: string | null
   status: CmsEntryStatus | null
   item: Record<string, unknown> | null
   user: CmsHookUser
   at: string
}

export interface CmsMediaChange {
   action: CmsMediaAction
   keys: string[]
   folder: string | null
   from: string | null
   user: CmsHookUser
   at: string
}

export interface CmsHookContext {
   event: H3Event
}

export interface CmsRuntimeHooks {
   [CMS_ENTRY_CHANGE_HOOK]: (
      change: CmsEntryChange,
      context: CmsHookContext
   ) => void | Promise<void>
   [CMS_MEDIA_CHANGE_HOOK]: (
      change: CmsMediaChange,
      context: CmsHookContext
   ) => void | Promise<void>
}

export type CmsHookName = keyof CmsRuntimeHooks

export function entryStatus(value: unknown): CmsEntryStatus | null {
   return value === 'draft' || value === 'published' ? value : null
}

export function entryWriteAction(
   created: boolean,
   previous: CmsEntryStatus | null,
   next: CmsEntryStatus | null
): CmsEntryAction {
   if (created) return 'create'
   if (previous !== 'published' && next === 'published') return 'publish'
   if (previous === 'published' && next === 'draft') return 'unpublish'
   return 'update'
}
