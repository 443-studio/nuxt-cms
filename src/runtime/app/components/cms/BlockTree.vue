<template>
   <div ref="root" class="cms-block-tree">
      <KTree
         :nodes="nodes"
         :selected="selectedId"
         :highlighted="highlightedId"
         :label="label"
         size="sm"
         :bordered="false"
         :move-buttons="false"
         :reorderable="!readonly"
         empty-variant="plain"
         :empty-icon="cmsIcon('rectangle-stack')"
         empty-text="No blocks yet"
         :empty-description="canAdd ? 'Add the first block to start the page.' : undefined"
         @select="onSelect"
         @move="onMove"
         @hover="onHover"
      >
         <template #label="{ node }">
            <span class="cms-block-tree-text" :class="{ 'is-hidden': rowOf(node)?.hidden }">
               <span class="cms-block-tree-label">{{ node.label }}</span>
               <span v-if="node.description" class="cms-block-tree-summary">
                  {{ node.description }}
               </span>
            </span>
         </template>
         <template #meta="{ node }">
            <template v-if="rowOf(node)?.hidden">
               <KIcon :name="cmsIcon('eye-slash')" class="cms-block-tree-hidden" />
               <KVisuallyHidden>Hidden</KVisuallyHidden>
            </template>
         </template>
         <template #actions="{ node }">
            <KButton
               v-if="canAdd"
               :icon="cmsIcon('plus')"
               size="xs"
               variant="ghost"
               tone="neutral"
               aria-haspopup="dialog"
               :aria-label="`Add a block after ${node.label}`"
               @click="(event: MouseEvent) => insertAt((rowOf(node)?.index ?? 0) + 1, event)"
            />
            <KDropdownMenu :items="menu(rowOf(node)?.index ?? 0)" placement="bottom-end">
               <KButton
                  :icon="cmsIcon('ellipsis-horizontal')"
                  size="xs"
                  variant="ghost"
                  tone="neutral"
                  :aria-label="`${node.label} actions`"
               />
            </KDropdownMenu>
         </template>
         <template v-if="canAdd" #empty-actions>
            <KButton
               :icon="cmsIcon('plus')"
               label="Add a block"
               size="sm"
               variant="soft"
               tone="neutral"
               aria-haspopup="dialog"
               @click="(event: MouseEvent) => insertAt(0, event)"
            />
         </template>
      </KTree>
   </div>
</template>

<script setup lang="ts">
import type { FieldConfig } from '#nuxt-cms'
import { isHiddenBlock } from '#nuxt-cms'
import type { MenuItems, TreeMove, TreeNode } from '@xleddyl/443-components-vue'
import {
   Button as KButton,
   DropdownMenu as KDropdownMenu,
   Icon as KIcon,
   Tree as KTree,
   VisuallyHidden as KVisuallyHidden,
} from '@xleddyl/443-components-vue'
import { computed, nextTick, ref, watch } from '#imports'
import type { CmsBlockValue } from '../../../shared/preview'
import { blockSummary, stableBlockIds } from '../../../shared/preview'
import { useCmsRuntime } from '../../composables/cms-runtime'
import { cmsIcon } from '../../utils/ui'

interface Row {
   index: number
   hidden: boolean
}

const props = defineProps<{
   items: CmsBlockValue[]
   field: FieldConfig
   locale: string
   selected: number | null
   highlighted: number | null
   errors: ReadonlySet<number>
   canAdd: boolean
   label: string
   menu: (index: number) => MenuItems
   readonly?: boolean
}>()

const emit = defineEmits<{
   select: [index: number]
   move: [from: number, to: number]
   hover: [index: number | null]
   insert: [index: number, anchor: HTMLElement]
}>()

const { i18n } = useCmsRuntime()

const root = ref<HTMLElement | null>(null)

let counter = 0
let previousItems: CmsBlockValue[] = []
let previousIds: number[] = []

const ids = computed(() => {
   const next = stableBlockIds(previousItems, previousIds, props.items, () => ++counter)
   previousItems = props.items
   previousIds = next
   return next
})

const rows = computed(
   () =>
      new Map<TreeNode['id'], Row>(
         props.items.map((item, index) => [
            ids.value[index]!,
            { index, hidden: isHiddenBlock(item) },
         ])
      )
)

function rowOf(node: TreeNode) {
   return rows.value.get(node.id)
}

const nodes = computed<TreeNode[]>(() =>
   props.items.map((item, index) => {
      const block = props.field.blocks?.[String(item.type)]
      return {
         id: ids.value[index]!,
         label: block?.label ?? String(item.type),
         description: blockSummary(block, item, props.locale, i18n.defaultLocale, 60) || undefined,
         icon: cmsIcon(block?.icon ?? 'rectangle-stack'),
         invalid: props.errors.has(index),
      }
   })
)

function idAt(index: number | null) {
   return index === null ? null : ids.value[index] ?? null
}

const selectedId = computed(() => idAt(props.selected))

const highlightedId = computed(() => idAt(props.highlighted))

function onSelect(node: TreeNode) {
   const row = rowOf(node)
   if (row) emit('select', row.index)
}

function onMove(move: TreeMove) {
   if (props.readonly) return
   emit('move', move.from.index, move.to.index)
}

function insertAt(index: number, event: MouseEvent) {
   emit('insert', index, event.currentTarget as HTMLElement)
}

function onHover(node: TreeNode | null) {
   emit('hover', node ? rowOf(node)?.index ?? null : null)
}

watch(
   () => props.selected,
   async (index) => {
      if (index === null) return
      await nextTick()
      root.value
         ?.querySelector('[role="treeitem"][aria-selected="true"]')
         ?.scrollIntoView({ block: 'nearest' })
   }
)
</script>
