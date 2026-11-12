<template>
   <KCommandList
      :groups="groups"
      :pinned="pinned"
      :label="label"
      placeholder="Search blocks"
      :empty-text="emptyText"
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
import type { CmsBlockPreset } from '../../../shared/presets'
import { CMS_PRESET_ICON, CMS_PRESET_PICKER_GROUP, presetPickerItem } from '../../../shared/presets'
import { cmsIcon } from '../../utils/ui'

const PASTE_ID = 'cms:paste'

const PRESET_PREFIX = 'cms:preset:'

const props = withDefaults(
   defineProps<{
      blocks: Record<string, BlockConfig>
      disabledReason?: string
      pasteCount?: number
      presets?: CmsBlockPreset[]
      label?: string
   }>(),
   { disabledReason: undefined, pasteCount: 0, presets: () => [], label: 'Available blocks' }
)

const emit = defineEmits<{ pick: [type: string]; paste: []; preset: [id: string]; close: [] }>()

const disabledState = computed(() =>
   props.disabledReason ? { disabled: true, disabledReason: props.disabledReason } : {}
)

const presetGroup = computed<CommandGroup<string>[]>(() =>
   props.presets.length
      ? [
           {
              id: 'cms:presets',
              label: CMS_PRESET_PICKER_GROUP,
              items: props.presets.map((preset) => {
                 const item = presetPickerItem(preset)
                 return {
                    ...item,
                    id: `${PRESET_PREFIX}${item.id}`,
                    icon: cmsIcon(CMS_PRESET_ICON),
                    ...disabledState.value,
                 }
              }),
           },
        ]
      : []
)

const groups = computed<CommandGroup<string>[]>(() => [
   ...blockPickerGroups(props.blocks, () => props.disabledReason).map((group) => ({
      id: group.id || 'other',
      label: group.label ?? (presetGroup.value.length ? 'Blocks' : undefined),
      items: group.items.map((item) => ({
         id: item.type,
         label: item.label,
         description: item.description,
         icon: cmsIcon(item.icon),
         keywords: item.keywords,
         disabled: item.disabled,
         disabledReason: item.disabledReason,
         data: item.type,
      })),
   })),
   ...presetGroup.value,
])

function pinned(query: string): CommandItem<string>[] {
   const count = props.pasteCount
   if (!count || query) return []
   return [
      {
         id: PASTE_ID,
         label: `Paste ${count} ${count === 1 ? 'block' : 'blocks'}`,
         description: 'From the clipboard',
         icon: cmsIcon('clipboard'),
         ...disabledState.value,
      },
   ]
}

function emptyText(query: string) {
   return `No block matches "${query}".`
}

function choose(item: CommandItem<string>) {
   if (item.id === PASTE_ID) emit('paste')
   else if (item.id.startsWith(PRESET_PREFIX)) emit('preset', item.id.slice(PRESET_PREFIX.length))
   else if (item.data) emit('pick', item.data)
}
</script>
