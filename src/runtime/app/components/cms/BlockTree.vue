<template>
   <div ref="root" class="cms-block-tree">
      <KTree
         v-model:expanded="expanded"
         :nodes="nodes"
         :selected="selectedId"
         :highlighted="highlightedId"
         :label="label"
         size="sm"
         :bordered="false"
         :move-buttons="false"
         :reorderable="!readonly"
         nestable
         :can-drop="canDrop"
         empty-variant="plain"
         :empty-icon="cmsIcon('rectangle-stack')"
         empty-text="No blocks yet"
         :empty-description="
            canAdd([fieldKey]) ? 'Add the first block to start the page.' : undefined
         "
         @select="onSelect"
         @move="onMove"
         @hover="onHover"
      >
         <template #label="{ node }">
            <span v-if="rowOf(node)?.kind === 'add'" class="cms-block-tree-add">
               {{ node.label }}
            </span>
            <span
               v-else
               class="cms-block-tree-text"
               :class="{ 'is-group': rowOf(node)?.kind === 'field' }"
            >
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
            <template v-if="blockRow(node)">
               <KButton
                  v-if="!readonly && canAdd(blockListPath(blockRow(node)!.path))"
                  :icon="cmsIcon('plus')"
                  size="xs"
                  variant="ghost"
                  tone="neutral"
                  aria-haspopup="dialog"
                  :aria-label="`Add a block after ${node.label}`"
                  @click="(event: MouseEvent) => insertAfter(blockRow(node)!.path, event)"
               />
               <KDropdownMenu :items="menu(blockRow(node)!.path)" placement="bottom-end">
                  <KButton
                     :icon="cmsIcon('ellipsis-horizontal')"
                     size="xs"
                     variant="ghost"
                     tone="neutral"
                     :aria-label="`${node.label} actions`"
                  />
               </KDropdownMenu>
            </template>
            <KButton
               v-else-if="fieldRow(node) && !readonly && canAdd(fieldRow(node)!.list)"
               :icon="cmsIcon('plus')"
               size="xs"
               variant="ghost"
               tone="neutral"
               aria-haspopup="dialog"
               :aria-label="`Add a block to ${node.label}`"
               @click="(event: MouseEvent) => appendTo(fieldRow(node)!.list, event)"
            />
         </template>
         <template v-if="canAdd([fieldKey]) && !readonly" #empty-actions>
            <KButton
               :icon="cmsIcon('plus')"
               label="Add a block"
               size="sm"
               variant="soft"
               tone="neutral"
               aria-haspopup="dialog"
               @click="(event: MouseEvent) => appendTo([fieldKey], event)"
            />
         </template>
      </KTree>
   </div>
</template>

<script setup lang="ts">
import type { CmsBlockPath, FieldConfig } from '#nuxt-cms'
import {
   blockListAt,
   blockListPath,
   blockPathIndex,
   formatBlockPath,
   isFieldVisible,
   isHiddenBlock,
   sameBlockPath,
} from '#nuxt-cms'
import type { MenuItems, TreeMove, TreeNode, TreeNodeId } from '@xleddyl/443-components-vue'
import {
   Button as KButton,
   DropdownMenu as KDropdownMenu,
   Icon as KIcon,
   Tree as KTree,
   VisuallyHidden as KVisuallyHidden,
} from '@xleddyl/443-components-vue'
import { computed, nextTick, ref, watch } from '#imports'
import type { CmsBlockIdSnapshot, CmsBlockValue } from '../../../shared/preview'
import {
   blockSummary,
   blockTreeVisits,
   canMoveBlock,
   stableBlockTreeIds,
} from '../../../shared/preview'
import { useCmsRuntime } from '../../composables/cms-runtime'
import { cmsIcon } from '../../utils/ui'

type Row =
   | {
        kind: 'block'
        path: CmsBlockPath
        hidden: boolean
        dimmed: boolean
        list: CmsBlockPath | null
     }
   | { kind: 'field'; owner: CmsBlockPath; list: CmsBlockPath; hidden: false; dimmed: boolean }
   | { kind: 'add'; list: CmsBlockPath; hidden: false; dimmed: boolean }

const props = defineProps<{
   items: CmsBlockValue[]
   field: FieldConfig
   fieldKey: string
   locale: string
   selected: CmsBlockPath | null
   highlighted: CmsBlockPath | null
   errors: ReadonlySet<string>
   canAdd: (list: CmsBlockPath) => boolean
   label: string
   menu: (path: CmsBlockPath) => MenuItems
   readonly?: boolean
}>()

const emit = defineEmits<{
   select: [path: CmsBlockPath]
   move: [from: CmsBlockPath, toList: CmsBlockPath, toIndex: number]
   hover: [path: CmsBlockPath | null]
   insert: [list: CmsBlockPath, index: number, anchor: HTMLElement]
}>()

const { i18n } = useCmsRuntime()

const root = ref<HTMLElement | null>(null)

const rootFields = computed(() => ({ [props.fieldKey]: props.field }))
const rootValues = computed(() => ({ [props.fieldKey]: props.items }))

let counter = 0
let snapshot: CmsBlockIdSnapshot<number> | null = null

const ids = computed(() => {
   const result = stableBlockTreeIds(
      blockTreeVisits(rootFields.value, rootValues.value),
      snapshot,
      () => ++counter
   )
   snapshot = result.snapshot
   return result.ids
})

function idOf(path: CmsBlockPath): TreeNodeId {
   const key = formatBlockPath(path)
   return ids.value.get(key) ?? key
}

function fieldRowId(owner: CmsBlockPath, key: string): TreeNodeId {
   return `field:${idOf(owner)}:${key}`
}

function listInvalid(list: CmsBlockPath) {
   const prefix = `${formatBlockPath(list)}.`
   for (const path of props.errors) if (path.startsWith(prefix)) return true
   return false
}

const tree = computed(() => {
   const rows = new Map<TreeNodeId, Row>()

   function addRow(list: CmsBlockPath, owner: TreeNodeId, dimmed: boolean): TreeNode[] {
      if (props.readonly) return []
      const id = `add:${String(owner)}:${String(list.at(-1))}`
      rows.set(id, { kind: 'add', list, hidden: false, dimmed })
      return [{ id, label: 'Add a block', icon: cmsIcon('plus') }]
   }

   function listNodes(
      list: CmsBlockPath,
      field: FieldConfig,
      value: unknown,
      owner: TreeNodeId,
      dimmed: boolean
   ): TreeNode[] {
      const items = Array.isArray(value) ? (value as CmsBlockValue[]) : []
      if (!items.length) return addRow(list, owner, dimmed)
      return items.map((item, index) => blockNode([...list, index], field, item, dimmed))
   }

   function blockNode(
      path: CmsBlockPath,
      field: FieldConfig,
      item: CmsBlockValue,
      parentDimmed: boolean
   ): TreeNode {
      const block = field.blocks?.[String(item.type)]
      const id = idOf(path)
      const hidden = isHiddenBlock(item)
      const dimmed = parentDimmed || hidden
      const nested = Object.entries(block?.fields ?? {}).filter(
         ([, subfield]) =>
            subfield.type === 'blocks' && isFieldVisible(subfield, item, block!.fields)
      )
      const single = nested.length === 1 ? [...path, nested[0]![0]] : null
      rows.set(id, { kind: 'block', path, hidden, dimmed, list: single })
      let children: TreeNode[] | undefined
      if (single) children = listNodes(single, nested[0]![1], item[nested[0]![0]], id, dimmed)
      else if (nested.length)
         children = nested.map(([key, subfield]) => {
            const list = [...path, key]
            const fieldId = fieldRowId(path, key)
            rows.set(fieldId, { kind: 'field', owner: path, list, hidden: false, dimmed })
            return {
               id: fieldId,
               label: subfield.label,
               icon: cmsIcon('queue-list'),
               invalid: listInvalid(list),
               muted: dimmed,
               children: listNodes(list, subfield, item[key], fieldId, dimmed),
            }
         })
      return {
         id,
         label: block?.label ?? String(item.type),
         description: blockSummary(block, item, props.locale, i18n.defaultLocale, 60) || undefined,
         icon: cmsIcon(block?.icon ?? 'rectangle-stack'),
         invalid: props.errors.has(formatBlockPath(path)),
         muted: dimmed,
         children,
      }
   }

   const nodes = props.items.map((item, index) =>
      blockNode([props.fieldKey, index], props.field, item, false)
   )
   return { nodes, rows }
})

const nodes = computed(() => tree.value.nodes)

function rowOf(node: TreeNode) {
   return tree.value.rows.get(node.id)
}

function blockRow(node: TreeNode) {
   const row = rowOf(node)
   return row?.kind === 'block' ? row : null
}

function fieldRow(node: TreeNode) {
   const row = rowOf(node)
   return row?.kind === 'field' ? row : null
}

const selectedId = computed(() => (props.selected ? idOf(props.selected) : null))

const highlightedId = computed(() => (props.highlighted ? idOf(props.highlighted) : null))

const expanded = ref<TreeNodeId[]>([])
const seen = new Set<TreeNodeId>()

watch(
   nodes,
   (list) => {
      const fresh: TreeNodeId[] = []
      const walk = (items: TreeNode[]) => {
         for (const node of items) {
            if (!node.children?.length) continue
            if (!seen.has(node.id)) {
               seen.add(node.id)
               fresh.push(node.id)
            }
            walk(node.children)
         }
      }
      walk(list)
      if (fresh.length) expanded.value = [...expanded.value, ...fresh]
   },
   { immediate: true }
)

function ancestorIds(path: CmsBlockPath): TreeNodeId[] {
   const found: TreeNodeId[] = []
   for (let end = 2; end < path.length; end += 2) {
      const owner = path.slice(0, end)
      found.push(idOf(owner))
      const row = tree.value.rows.get(idOf(owner))
      if (row?.kind === 'block' && !row.list) found.push(fieldRowId(owner, String(path[end])))
   }
   return found
}

function destination(
   move: TreeMove
): { from: CmsBlockPath; list: CmsBlockPath; index: number } | null {
   const source = rowOf(move.node)
   if (source?.kind !== 'block') return null
   const parent = move.to.parent === null ? null : tree.value.rows.get(move.to.parent)
   let list: CmsBlockPath | null = null
   if (move.to.parent === null) list = [props.fieldKey]
   else if (parent?.kind === 'field') list = parent.list
   else if (parent?.kind === 'block') list = parent.list
   if (!list) return null
   const length = blockListAt(rootValues.value, list)?.length ?? 0
   const sameList = sameBlockPath(blockListPath(source.path), list)
   const index = Math.max(Math.min(move.to.index, sameList ? length - 1 : length), 0)
   const insertion = sameList && index >= blockPathIndex(source.path) ? index + 1 : index
   return { from: source.path, list, index: insertion }
}

function canDrop(move: TreeMove) {
   if (props.readonly) return false
   const target = destination(move)
   return !!target && canMoveBlock(rootFields.value, rootValues.value, target.from, target.list)
}

function onMove(move: TreeMove) {
   const target = destination(move)
   if (!target || !canDrop(move)) return
   emit('move', target.from, target.list, target.index)
}

function focusedRow() {
   const active = document.activeElement
   return active instanceof HTMLElement && root.value?.contains(active) ? active : root.value!
}

function onSelect(node: TreeNode) {
   const row = rowOf(node)
   if (row?.kind === 'block') emit('select', row.path)
   else if (row?.kind === 'field') emit('select', row.owner)
   else if (row?.kind === 'add' && props.canAdd(row.list))
      emit('insert', row.list, blockListAt(rootValues.value, row.list)?.length ?? 0, focusedRow())
}

function insertAfter(path: CmsBlockPath, event: MouseEvent) {
   emit('insert', blockListPath(path), blockPathIndex(path) + 1, event.currentTarget as HTMLElement)
}

function appendTo(list: CmsBlockPath, event: MouseEvent) {
   emit(
      'insert',
      list,
      blockListAt(rootValues.value, list)?.length ?? 0,
      event.currentTarget as HTMLElement
   )
}

function onHover(node: TreeNode | null) {
   const row = node ? rowOf(node) : undefined
   emit('hover', row?.kind === 'block' ? row.path : row?.kind === 'field' ? row.owner : null)
}

watch(
   () => (props.selected ? formatBlockPath(props.selected) : null),
   async () => {
      const path = props.selected
      if (!path) return
      const missing = ancestorIds(path).filter((id) => !expanded.value.includes(id))
      if (missing.length) expanded.value = [...expanded.value, ...missing]
      await nextTick()
      root.value
         ?.querySelector('[role="treeitem"][aria-selected="true"]')
         ?.scrollIntoView({ block: 'nearest' })
   }
)
</script>
