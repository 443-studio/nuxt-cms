<template>
   <KCommandList
      :groups="groups"
      :pinned="pinned"
      :label="label"
      placeholder="Search blocks"
      :empty-text="emptyText"
      :notice="disabledReason"
      @select="choose"
      @close="emit('close')"
   />
</template>

<script setup lang="ts">
import type { BlockConfig } from '#nuxt-cms'
import type { CommandGroup, CommandItem } from '@xleddyl/443-components-vue'
import { CommandList as KCommandList } from '@xleddyl/443-components-vue'
import { computed } from '#imports'
import { blockPickerGroups } from '../../../shared/block-picker'
import { cmsIcon } from '../../utils/ui'

const PASTE_ID = 'cms:paste'

const props = withDefaults(
   defineProps<{
      blocks: Record<string, BlockConfig>
      disabledReason?: string
      pasteCount?: number
      label?: string
   }>(),
   { disabledReason: undefined, pasteCount: 0, label: 'Available blocks' }
)

const emit = defineEmits<{ pick: [type: string]; paste: []; close: [] }>()

const groups = computed<CommandGroup<string>[]>(() =>
   blockPickerGroups(props.blocks, () => !!props.disabledReason).map((group) => ({
      id: group.id || 'other',
      label: group.label ?? undefined,
      items: group.items.map((item) => ({
         id: item.type,
         label: item.label,
         description: item.description,
         icon: cmsIcon(item.icon),
         keywords: item.keywords,
         disabled: item.disabled,
         data: item.type,
      })),
   }))
)

function pinned(query: string): CommandItem<string>[] {
   const count = props.pasteCount
   if (!count || query) return []
   return [
      {
         id: PASTE_ID,
         label: `Paste ${count} ${count === 1 ? 'block' : 'blocks'}`,
         description: 'From the clipboard',
         icon: cmsIcon('clipboard'),
         disabled: !!props.disabledReason,
      },
   ]
}

function emptyText(query: string) {
   return `No block matches "${query}".`
}

function choose(item: CommandItem<string>) {
   if (item.id === PASTE_ID) emit('paste')
   else if (item.data) emit('pick', item.data)
}
</script>
