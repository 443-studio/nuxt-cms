import type { CmsConfig, CmsLinkValue } from '#nuxt-cms'
import { isScheduledContent, linkTargetKey, pageLinkPath } from '#nuxt-cms'
import { reactive } from '#imports'
import { useCmsPermissions } from './cms-permissions'

type Row = Record<string, unknown>

export type CmsLinkTargetState = 'loading' | 'live' | 'draft' | 'scheduled' | 'missing'

const rows = reactive(new Map<string, Row | null>())
const pending = new Set<string>()

function statusOf(error: unknown): number | undefined {
   return (
      (error as { statusCode?: number; status?: number })?.statusCode ??
      (error as { status?: number })?.status
   )
}

export function useCmsLinkTargets(config: CmsConfig) {
   const { can } = useCmsPermissions()

   function load(entry: string, id: string) {
      const key = linkTargetKey(entry, id)
      if (!import.meta.client || rows.has(key) || pending.has(key)) return
      if (config[entry]?.kind !== 'content' || !can(`${entry}.read`)) return
      pending.add(key)
      $fetch<Row>(`/api/cms/admin/${entry}/${encodeURIComponent(id)}`)
         .then((row) => rows.set(key, row))
         .catch((error) => {
            if (statusOf(error) === 404) rows.set(key, null)
         })
         .finally(() => pending.delete(key))
   }

   function remember(entry: string, row: Row) {
      if (row.id == null) return
      const key = linkTargetKey(entry, String(row.id))
      rows.set(key, { ...rows.get(key), ...row })
   }

   function target(entry: string, id: string): Row | null | undefined {
      return rows.get(linkTargetKey(entry, id))
   }

   function state(link: CmsLinkValue | null | undefined): CmsLinkTargetState | null {
      if (!link?.entry || !link.id || link.url) return null
      const entry = config[link.entry]
      if (!entry) return 'missing'
      if (entry.kind === 'page') return pageLinkPath(entry, link.id) ? 'live' : 'missing'
      const row = target(link.entry, link.id)
      if (row === undefined) return 'loading'
      if (row === null) return 'missing'
      if (row.status !== 'published') return 'draft'
      return isScheduledContent(row) ? 'scheduled' : 'live'
   }

   return { load, remember, target, state }
}
