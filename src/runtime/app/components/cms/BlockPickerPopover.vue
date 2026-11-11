<template>
   <KPopover
      v-if="!narrow"
      v-model:open="open"
      :anchor="anchor"
      :label="label"
      placement="bottom-start"
   >
      <template v-if="$slots.default" #default><slot /></template>
      <template #content>
         <CmsBlockPicker
            v-if="open"
            :blocks="blocks"
            :disabled-reason="disabledReason"
            :paste-count="pasteCount"
            @pick="pick"
            @paste="paste"
            @close="open = false"
         />
      </template>
   </KPopover>
   <template v-else>
      <span v-if="$slots.default" class="cms-picker-trigger" @click="open = true"><slot /></span>
      <KModal v-model:open="open" :title="label">
         <CmsBlockPicker
            v-if="open"
            :blocks="blocks"
            :disabled-reason="disabledReason"
            :paste-count="pasteCount"
            @pick="pick"
            @paste="paste"
         />
      </KModal>
   </template>
</template>

<script setup lang="ts">
import type { BlockConfig } from '#nuxt-cms'
import type { OverlayAnchorTarget } from '@xleddyl/443-components-vue'
import { Modal as KModal, Popover as KPopover } from '@xleddyl/443-components-vue'
import { onBeforeUnmount, onMounted, ref } from '#imports'
import { CMS_BLOCK_PICKER_MODAL_QUERY } from '../../../shared/block-picker'

withDefaults(
   defineProps<{
      blocks: Record<string, BlockConfig>
      disabledReason?: string
      pasteCount?: number
      label?: string
      anchor?: OverlayAnchorTarget | null
   }>(),
   { disabledReason: undefined, pasteCount: 0, label: 'Insert a block', anchor: null }
)

const emit = defineEmits<{ pick: [type: string]; paste: [] }>()

const open = defineModel<boolean>('open', { default: false })
const narrow = ref(false)
let query: MediaQueryList | null = null

function onQueryChange() {
   narrow.value = !!query?.matches
   open.value = false
}

function pick(type: string) {
   open.value = false
   emit('pick', type)
}

function paste() {
   open.value = false
   emit('paste')
}

onMounted(() => {
   query = window.matchMedia(CMS_BLOCK_PICKER_MODAL_QUERY)
   narrow.value = query.matches
   query.addEventListener('change', onQueryChange)
})

onBeforeUnmount(() => {
   query?.removeEventListener('change', onQueryChange)
})
</script>
