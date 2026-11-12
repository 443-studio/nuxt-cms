import type { MediaUsage } from '../../shared/index'
import { linkReferences, linkTargetKey } from '../../shared/index'
import type { MediaUsageSource } from './media-references'
import { usageFields, usageTitle } from './media-references'
import { usageSources } from './media-usage'

export function collectLinkUsage(
   sources: MediaUsageSource[],
   keys: string[]
): Record<string, MediaUsage[]> {
   const usage: Record<string, MediaUsage[]> = Object.fromEntries(keys.map((key) => [key, []]))
   for (const { name, entry, rows } of sources) {
      for (const row of rows) {
         const id = entry.kind === 'single' ? null : String(row.id)
         for (const reference of linkReferences(usageFields(entry, row), row)) {
            if (reference.entry === name && reference.id === id) continue
            const list = usage[linkTargetKey(reference.entry, reference.id)]
            if (!list) continue
            list.push({
               collection: name,
               label: entry.label,
               kind: entry.kind,
               id,
               title: usageTitle(entry, row),
               field: reference.field,
            })
         }
      }
   }
   return usage
}

export async function loadLinkUsage(
   keys: string[],
   include?: (name: string) => boolean
): Promise<Record<string, MediaUsage[]>> {
   return collectLinkUsage(await usageSources(include), keys)
}
