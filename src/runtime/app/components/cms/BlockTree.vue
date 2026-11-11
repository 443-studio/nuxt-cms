<template>
   <div ref="root" class="cms-tree" @pointerover="onPointerOver" @pointerleave="setHover(null)">
      <KTree
         :nodes="nodes"
         :selected="selectedId"
         :label="label"
         size="sm"
         :bordered="false"
         :move-buttons="false"
         reorderable
         empty-variant="plain"
         :empty-icon="cmsIcon('rectangle-stack')"
         empty-text="No blocks yet"
         :empty-description="canAdd ? 'Add the first block to start the page.' : undefined"
         @select="onSelect"
         @move="onMove"
      >
         <template #label="{ node }">
            <span
               class="cms-tree-text"
               :class="{
                  'is-hidden': rowOf(node)?.hidden,
                  'is-highlighted': rowOf(node)?.index === highlighted,
               }"
               :data-cms-tree-index="rowOf(node)?.index"
            >
               <span class="cms-tree-label">{{ node.label }}</span>
               <span v-if="node.description" class="cms-tree-summary">{{ node.description }}</span>
            </span>
         </template>
         <template #meta="{ node }">
            <span class="cms-tree-meta" @click.stop>
               <span class="cms-tree-actions">
                  <CmsBlockPickerPopover
                     v-if="canAdd"
                     :blocks="field.blocks ?? {}"
                     :paste-count="pasteCount"
                     @pick="(type: string) => emit('pick', (rowOf(node)?.index ?? 0) + 1, type)"
                     @paste="emit('paste', (rowOf(node)?.index ?? 0) + 1)"
                  >
                     <KButton
                        :icon="cmsIcon('plus')"
                        size="xs"
                        variant="ghost"
                        tone="neutral"
                        tabindex="-1"
                        :aria-label="`Add a block after ${node.label}`"
                     />
                  </CmsBlockPickerPopover>
                  <KDropdownMenu :items="menu(rowOf(node)?.index ?? 0)" placement="bottom-end">
                     <KButton
                        :icon="cmsIcon('ellipsis-horizontal')"
                        size="xs"
                        variant="ghost"
                        tone="neutral"
                        tabindex="-1"
                        :aria-label="`${node.label} actions`"
                     />
                  </KDropdownMenu>
               </span>
               <template v-if="rowOf(node)?.invalid">
                  <span class="cms-tree-error" aria-hidden="true" />
                  <KVisuallyHidden>Has errors</KVisuallyHidden>
               </template>
               <template v-if="rowOf(node)?.hidden">
                  <KIcon :name="cmsIcon('eye-slash')" class="cms-tree-hidden" />
                  <KVisuallyHidden>Hidden</KVisuallyHidden>
               </template>
            </span>
         </template>
         <template v-if="canAdd" #empty-actions>
            <CmsBlockPickerPopover
               :blocks="field.blocks ?? {}"
               :paste-count="pasteCount"
               @pick="(type: string) => emit('pick', 0, type)"
               @paste="emit('paste', 0)"
            >
               <KButton
                  :icon="cmsIcon('plus')"
                  label="Add a block"
                  size="sm"
                  variant="soft"
                  tone="neutral"
               />
            </CmsBlockPickerPopover>
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
   invalid: boolean
}

const props = defineProps<{
   items: CmsBlockValue[]
   field: FieldConfig
   locale: string
   selected: number | null
   highlighted: number | null
   errors: ReadonlySet<number>
   canAdd: boolean
   pasteCount: number
   label: string
   menu: (index: number) => MenuItems
}>()

const emit = defineEmits<{
   select: [index: number]
   move: [from: number, to: number]
   hover: [index: number | null]
   pick: [index: number, type: string]
   paste: [index: number]
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
            { index, hidden: isHiddenBlock(item), invalid: props.errors.has(index) },
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
      }
   })
)

const selectedId = computed(() =>
   props.selected === null ? null : ids.value[props.selected] ?? null
)

function onSelect(node: TreeNode) {
   const row = rowOf(node)
   if (row) emit('select', row.index)
}

function onMove(move: TreeMove) {
   emit('move', move.from.index, move.to.index)
}

let hovered: number | null = null

function setHover(index: number | null) {
   if (index === hovered) return
   hovered = index
   emit('hover', index)
}

function onPointerOver(event: PointerEvent) {
   const row = event.target instanceof Element ? event.target.closest('[role="treeitem"]') : null
   const index = Number(
      row?.querySelector<HTMLElement>('[data-cms-tree-index]')?.dataset.cmsTreeIndex
   )
   setHover(Number.isInteger(index) ? index : null)
}

watch(
   () => props.selected,
   async (index) => {
      if (index === null) return
      await nextTick()
      root.value
         ?.querySelector(`[data-cms-tree-index="${index}"]`)
         ?.closest('[role="treeitem"]')
         ?.scrollIntoView({ block: 'nearest' })
   }
)
</script>
