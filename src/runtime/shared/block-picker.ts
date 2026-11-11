import type { BlockConfig } from './index'

export const CMS_BLOCK_PICKER_MODAL_QUERY = '(max-width: 639px)'

export const CMS_BLOCK_PICKER_OTHER_GROUP = 'Other'

export const CMS_BLOCK_ICON = 'rectangle-stack'

export interface CmsBlockPickerItem {
   type: string
   label: string
   description?: string
   icon: string
   keywords: string[]
   disabled: boolean
}

export interface CmsBlockPickerGroup {
   id: string
   label: string | null
   items: CmsBlockPickerItem[]
}

export function blockPickerGroups(
   blocks: Record<string, BlockConfig>,
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
      group.items.push({
         type,
         label: block.label,
         description: block.description || undefined,
         icon: block.icon ?? CMS_BLOCK_ICON,
         keywords: [type, ...(name ? [name] : []), ...(block.tags ?? [])],
         disabled: disabled(type),
      })
   }
   return [...groups.values(), other].filter((group) => group.items.length)
}
