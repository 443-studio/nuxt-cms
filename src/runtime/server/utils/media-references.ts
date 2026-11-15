import { createError } from 'h3'
import type { CmsEntry, CmsSiteSettings, MediaUsage, MediaUsageReport } from '../../shared/index'
import {
   CMS_SITE_SETTINGS_KEY,
   PAGE_PATH_FIELD,
   pageFields,
   pageRouteOf,
   selectOptionLabel,
} from '../../shared/index'
import type { MediaLookup, MediaReference } from './media-keys'
import { mediaReferences } from './media-keys'

export type { MediaLookup, MediaReference } from './media-keys'
export { mediaKeysInTable, mediaReferences } from './media-keys'

export interface MediaUsageSource {
   name: string
   entry: CmsEntry
   rows: Record<string, unknown>[]
}

export function usageTitle(entry: CmsEntry, row: Record<string, unknown>): string | null {
   if (entry.kind === 'page') {
      const path = row[PAGE_PATH_FIELD]
      return pageRouteOf(entry, String(row.id))?.label ?? (typeof path === 'string' ? path : null)
   }
   const value = entry.titleField ? row[entry.titleField] : undefined
   const titleField = entry.titleField ? entry.fields[entry.titleField] : undefined
   if (typeof value === 'string' && titleField?.type === 'select')
      return selectOptionLabel(titleField, value) || null
   if (typeof value === 'string') return value || null
   if (value && typeof value === 'object') {
      const first = Object.values(value).find(
         (candidate): candidate is string => typeof candidate === 'string' && candidate !== ''
      )
      return first ?? null
   }
   return null
}

export function usageFields(entry: CmsEntry, row: Record<string, unknown>) {
   const path = row[PAGE_PATH_FIELD]
   return entry.kind === 'page' && typeof path === 'string' ? pageFields(entry, path) : entry.fields
}

export function collectMediaUsage(
   sources: MediaUsageSource[],
   keys: string[]
): Record<string, MediaUsage[]> {
   const usage: Record<string, MediaUsage[]> = Object.fromEntries(keys.map((key) => [key, []]))
   for (const { name, entry, rows } of sources) {
      for (const row of rows) {
         for (const reference of mediaReferences(usageFields(entry, row), row)) {
            const list = usage[reference.key]
            if (!list) continue
            list.push({
               collection: name,
               label: entry.label,
               kind: entry.kind,
               id: entry.kind === 'single' ? null : String(row.id),
               title: usageTitle(entry, row),
               field: reference.field,
            })
         }
      }
   }
   return usage
}

export const SITE_MEDIA_USAGE: Omit<MediaUsage, 'field'> = {
   collection: CMS_SITE_SETTINGS_KEY,
   label: 'Settings',
   kind: 'site',
   id: null,
   title: 'Site settings',
}

export function addSiteMediaUsage(
   usage: Record<string, MediaUsage[]>,
   settings: Pick<CmsSiteSettings, 'image'>
): Record<string, MediaUsage[]> {
   const list = settings.image ? usage[settings.image] : undefined
   if (list) list.push({ ...SITE_MEDIA_USAGE, field: 'Share image' })
   return usage
}

export function redactMediaUsage(
   usage: Record<string, MediaUsage[]>,
   visible: (usage: MediaUsage) => boolean
): MediaUsageReport {
   const report: MediaUsageReport = { usage: {}, hidden: {} }
   for (const [key, list] of Object.entries(usage)) {
      const hidden = new Set<string>()
      report.usage[key] = list.filter((item) => {
         if (visible(item)) return true
         hidden.add(`${item.collection}\u0000${item.id ?? ''}`)
         return false
      })
      report.hidden[key] = hidden.size
   }
   return report
}

export async function assertKnownMedia(references: MediaReference[], lookup: MediaLookup) {
   if (!references.length) return
   const known = await lookup([...new Set(references.map((reference) => reference.key))])
   const missing = references.filter((reference) => !known.has(reference.key))
   if (!missing.length) return
   throw createError({
      statusCode: 400,
      statusMessage: `Media not found in the library: ${missing
         .map((reference) => `'${reference.key}' (${reference.field})`)
         .join(', ')}`,
   })
}
