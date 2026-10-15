<template>
   <KTree
      :nodes="nodes"
      :selected="selectedId"
      label="Blocks"
      size="sm"
      :bordered="false"
      reorderable
      @select="onSelect"
      @move="onMove"
   >
      <template #label="{ node }">
         <span class="cms-outline-text" :class="{ 'is-hidden': hiddenIds.has(node.id) }">
            <span class="cms-outline-label">{{ node.label }}</span>
            <span v-if="node.description" class="cms-outline-summary">
               {{ node.description }}
            </span>
         </span>
      </template>
      <template #meta="{ node }">
         <template v-if="hiddenIds.has(node.id)">
            <KIcon name="eye-slash" class="cms-outline-hidden" />
            <KVisuallyHidden>Hidden</KVisuallyHidden>
         </template>
      </template>
   </KTree>
</template>

<script setup lang="ts">
import type { FieldConfig } from '#nuxt-cms'
import { isHiddenBlock } from '#nuxt-cms'
import type { TreeMove, TreeNode } from '@xleddyl/443-components-vue'
import {
   Icon as KIcon,
   Tree as KTree,
   VisuallyHidden as KVisuallyHidden,
} from '@xleddyl/443-components-vue'
import { computed } from '#imports'
import type { CmsBlockValue } from '../../../shared/preview'
import { blockSummary } from '../../../shared/preview'
import { useCmsRuntime } from '../../composables/cms-runtime'
import { cmsIcon } from '../../utils/ui'

const props = defineProps<{
   items: CmsBlockValue[]
   field: FieldConfig
   locale: string
   selected: number | null
}>()

const emit = defineEmits<{ select: [index: number]; move: [from: number, to: number] }>()

const { i18n } = useCmsRuntime()

let uidCounter = 0
const uids = new WeakMap<CmsBlockValue, number>()

function uidFor(item: CmsBlockValue) {
   let uid = uids.get(item)
   if (uid === undefined) {
      uid = ++uidCounter
      uids.set(item, uid)
   }
   return uid
}

function blockOf(item: CmsBlockValue) {
   return props.field.blocks?.[String(item.type)]
}

const nodes = computed<TreeNode[]>(() =>
   props.items.map((item) => {
      const block = blockOf(item)
      return {
         id: uidFor(item),
         label: block?.label ?? String(item.type),
         description: blockSummary(block, item, props.locale, i18n.defaultLocale, 60) || undefined,
         icon: cmsIcon(block?.icon ?? 'rectangle-stack'),
      }
   })
)

const hiddenIds = computed(
   () =>
      new Set<TreeNode['id']>(
         props.items.filter((item) => isHiddenBlock(item)).map((item) => uidFor(item))
      )
)

const selectedId = computed(() => {
   const item = props.selected === null ? undefined : props.items[props.selected]
   return item ? uidFor(item) : null
})

function onSelect(node: TreeNode) {
   const index = nodes.value.findIndex((entry) => entry.id === node.id)
   if (index !== -1) emit('select', index)
}

function onMove(move: TreeMove) {
   emit('move', move.from.index, move.to.index)
}
</script>
