import type { CmsConfig, MediaUsage } from '#nuxt-cms'
import { groupMediaUsage, isLinkTargetEntry, linkTargetKey } from '#nuxt-cms'
import cmsConfig from '#cms-config'
import { cmsApi } from '../utils/api'
import { useCmsConfirm } from './cms-confirm'
import { usageItem } from './cms-media-library'

function linksLabel(count: number) {
   return `${count} ${count === 1 ? 'entry' : 'entries'}`
}

async function loadUsage(entry: string, ids: string[]) {
   try {
      const { usage } = await cmsApi<{ usage: Record<string, MediaUsage[]> }>(
         '/api/cms/link-usage',
         { method: 'POST', body: { targets: ids.map((id) => ({ entry, id })) } }
      )
      return usage
   } catch {
      return null
   }
}

export function useCmsLinkedDelete() {
   const confirmAction = useCmsConfirm()
   return async (
      entry: string,
      ids: string[],
      question: string,
      titles: Record<string, string> = {}
   ): Promise<boolean> => {
      if (!ids.length || !isLinkTargetEntry((cmsConfig as CmsConfig)[entry]))
         return confirmAction({ title: question })
      const usage = await loadUsage(entry, ids)
      if (!usage)
         return confirmAction({
            title: question,
            description: 'Could not check where it is linked.',
         })
      const groups = ids
         .map((id) => ({ id, entries: groupMediaUsage(usage[linkTargetKey(entry, id)] ?? []) }))
         .filter((group) => group.entries.length > 0)
      if (!groups.length) return confirmAction({ title: question })
      const single = ids.length === 1
      const linked = single
         ? `It is linked from ${linksLabel(groups[0]!.entries.length)}.`
         : `${groups.length} of ${ids.length} are linked from your content.`
      return confirmAction({
         title: single ? 'Item is linked' : 'Items are linked',
         description: `${question} ${linked} Those links disappear from the site until they point somewhere else.`,
         confirmLabel: 'Delete anyway',
         groups: groups.map((group) => ({
            title: titles[group.id] ?? `#${group.id}`,
            items: group.entries.map(usageItem),
         })),
      })
   }
}
