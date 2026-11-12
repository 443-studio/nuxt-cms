<template>
   <KPopover v-model:open="open" :anchor="anchor" :label="label" placement="bottom-start" sheet>
      <template v-if="$slots.default" #default><slot /></template>
      <template #content>
         <CmsBlockPicker
            v-if="open"
            :blocks="blocks"
            :disabled-reason="disabledReason"
            :paste-count="pasteCount"
            :presets="presets"
            @pick="pick"
            @paste="paste"
            @preset="preset"
            @close="open = false"
         />
      </template>
   </KPopover>
</template>

<script setup lang="ts">
import type { BlockConfig } from '#nuxt-cms'
import type { OverlayAnchorTarget } from '@xleddyl/443-components-vue'
import { Popover as KPopover } from '@xleddyl/443-components-vue'
import type { CmsBlockPreset } from '../../../shared/presets'

withDefaults(
   defineProps<{
      blocks: Record<string, BlockConfig>
      disabledReason?: string
      pasteCount?: number
      presets?: CmsBlockPreset[]
      label?: string
      anchor?: OverlayAnchorTarget | null
   }>(),
   {
      disabledReason: undefined,
      pasteCount: 0,
      presets: () => [],
      label: 'Insert a block',
      anchor: null,
   }
)

const emit = defineEmits<{ pick: [type: string]; paste: []; preset: [id: string] }>()

const open = defineModel<boolean>('open', { default: false })

function pick(type: string) {
   open.value = false
   emit('pick', type)
}

function paste() {
   open.value = false
   emit('paste')
}

function preset(id: string) {
   open.value = false
   emit('preset', id)
}
</script>
