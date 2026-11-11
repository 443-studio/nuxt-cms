import type { BlockConfig } from './index'

export const CMS_BLOCK_PICKER_MODAL_QUERY = '(max-width: 639px)'

export const CMS_BLOCK_PICKER_OTHER_GROUP = 'Other'

export const CMS_BLOCK_ICON = 'rectangle-stack'

export interface CmsBlockPickerItem {
   type: string
   label: string
   description?: string
   icon: string
   disabled: boolean
}

export interface CmsBlockPickerGroup {
   id: string
   label: string | null
   items: CmsBlockPickerItem[]
}

export function normalizeSearchText(text: string): string {
   return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

export function blockMatchesQuery(type: string, block: BlockConfig, query: string): boolean {
   const words = normalizeSearchText(query).split(/\s+/).filter(Boolean)
   if (!words.length) return true
   const haystack = normalizeSearchText(
      [type, block.label, block.description, block.group, ...(block.tags ?? [])]
         .filter(Boolean)
         .join(' ')
   )
   return words.every((word) => haystack.includes(word))
}

export function blockPickerGroups(
   blocks: Record<string, BlockConfig>,
   query = '',
   disabled: (type: string) => boolean = () => false
): CmsBlockPickerGroup[] {
   const entries = Object.entries(blocks)
   const grouped = entries.some(([, block]) => !!block.group?.trim())
   const groups = new Map<string, CmsBlockPickerGroup>()
   const other: CmsBlockPickerGroup = {
      id: '',
      label: grouped ? CMS_BLOCK_PICKER_OTHER_GROUP : null,
      items: [],
   }
   for (const [type, block] of entries) {
      const name = block.group?.trim()
      let group = other
      if (name) {
         group = groups.get(name) ?? { id: name, label: name, items: [] }
         groups.set(name, group)
      }
      if (!blockMatchesQuery(type, block, query)) continue
      group.items.push({
         type,
         label: block.label,
         description: block.description || undefined,
         icon: block.icon ?? CMS_BLOCK_ICON,
         disabled: disabled(type),
      })
   }
   return [...groups.values(), other].filter((group) => group.items.length)
}

export function nextPickerIndex(
   items: readonly { disabled: boolean }[],
   from: number,
   step: 1 | -1
): number {
   const count = items.length
   if (!count) return -1
   for (let offset = 1; offset <= count; offset++) {
      const index = (((from + offset * step) % count) + count) % count
      if (!items[index]!.disabled) return index
   }
   return -1
}
