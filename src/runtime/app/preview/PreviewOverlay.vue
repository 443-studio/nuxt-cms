<template>
   <div
      ref="root"
      class="cms-preview-overlay"
      :class="{ 'is-dragging': drag?.moved }"
      v-bind="cmsTokenRoot(cmsPreviewTheme)"
   >
      <div
         v-for="box in outlined"
         :key="`outline-${box.key}`"
         class="cms-preview-outline"
         :class="{
            'is-selected': box.key === selectedKey,
            'is-highlighted': box.key === highlightedKey && box.key !== selectedKey,
            'is-drop-target': box.key === dropTarget?.parent,
         }"
         :style="rectStyle(box)"
      >
         <span class="cms-preview-label">{{ box.label }}</span>
      </div>
      <div
         v-for="tool in toolbars"
         :key="`toolbar-${tool.box.key}`"
         class="cms-preview-toolbar"
         :class="{ 'is-selected': tool.selected }"
         :style="{ top: `${tool.top}px`, left: `${tool.right}px` }"
         role="toolbar"
         :aria-label="`${tool.box.label} block`"
      >
         <button
            type="button"
            class="cms-preview-tool cms-preview-handle"
            :aria-label="`Move ${tool.box.label}: drag, or use the arrow keys`"
            title="Drag to reorder"
            @pointerdown="startDrag($event, tool.box)"
            @keydown="onHandleKey($event, tool.box)"
            @click="onHandleClick(tool.box)"
         >
            <KIcon :name="cmsIcon('bars-2')" />
         </button>
         <button
            v-if="tool.box.path.length > 2"
            type="button"
            class="cms-preview-tool"
            aria-label="Select the parent block"
            title="Select the parent block"
            @click="emit('message', { type: 'select', path: parentBlockPath(tool.box.path) })"
         >
            <KIcon :name="cmsIcon('arrow-up-left')" />
         </button>
         <button
            type="button"
            class="cms-preview-tool"
            :aria-label="tool.horizontal ? 'Move left' : 'Move up'"
            :title="tool.horizontal ? 'Move left' : 'Move up'"
            :disabled="tool.box.index === 0"
            @click="moveBy(tool.box, -1)"
         >
            <KIcon :name="cmsIcon(tool.horizontal ? 'arrow-left' : 'arrow-up')" />
         </button>
         <button
            type="button"
            class="cms-preview-tool"
            :aria-label="tool.horizontal ? 'Move right' : 'Move down'"
            :title="tool.horizontal ? 'Move right' : 'Move down'"
            :disabled="tool.box.index >= listLength(tool.box.list) - 1"
            @click="moveBy(tool.box, 1)"
         >
            <KIcon :name="cmsIcon(tool.horizontal ? 'arrow-right' : 'arrow-down')" />
         </button>
         <span class="cms-preview-separator" />
         <button
            type="button"
            class="cms-preview-tool"
            aria-label="Duplicate"
            title="Duplicate"
            :disabled="!canAddTo(tool.box.list)"
            @click="emit('message', { type: 'duplicate', path: tool.box.path })"
         >
            <KIcon :name="cmsIcon('document-duplicate')" />
         </button>
         <button
            v-if="tool.hideable"
            type="button"
            class="cms-preview-tool"
            aria-label="Hide"
            title="Hide"
            @click="emit('message', { type: 'toggle-hidden', path: tool.box.path })"
         >
            <KIcon :name="cmsIcon('eye-slash')" />
         </button>
         <button
            type="button"
            class="cms-preview-tool is-danger"
            aria-label="Delete"
            title="Delete"
            @click="emit('message', { type: 'remove', path: tool.box.path })"
         >
            <KIcon :name="cmsIcon('trash')" />
         </button>
      </div>

      <div
         v-if="fieldBox && !drag"
         class="cms-preview-field"
         :class="{ 'is-editing': fieldBox.editing }"
         :style="{
            top: `${fieldBox.top}px`,
            left: `${fieldBox.left}px`,
            width: `${fieldBox.width}px`,
            height: `${fieldBox.height}px`,
         }"
      >
         <span
            class="cms-preview-field-label"
            :class="{ 'is-above': fieldBox.top + fieldBox.height > viewportHeight - 32 }"
         >
            {{ fieldBox.label }}
         </span>
      </div>

      <button
         v-for="slot in insertSlots"
         :key="`insert-${slot.key}-${slot.edge}`"
         type="button"
         class="cms-preview-insert"
         :class="{ 'is-near': slot.near }"
         :style="{ top: `${slot.y}px`, left: `${slot.x}px` }"
         :data-cms-insert="slot.key"
         :aria-label="slot.label"
         title="Insert a block"
         @click="emit('message', { type: 'insert', path: slot.path })"
      >
         <KIcon :name="cmsIcon('plus')" />
      </button>

      <div
         v-if="drag?.moved && dropTarget"
         class="cms-preview-dropline"
         :class="{ 'is-vertical': dropTarget.line.vertical }"
         :style="{
            top: `${dropTarget.line.y}px`,
            left: `${dropTarget.line.x}px`,
            width: dropTarget.line.vertical ? undefined : `${dropTarget.line.size}px`,
            height: dropTarget.line.vertical ? `${dropTarget.line.size}px` : undefined,
         }"
      />
   </div>
</template>

<script setup lang="ts">
import { Icon as KIcon } from '@xleddyl/443-components-vue'
import { cmsIcon } from '../utils/ui'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from '#imports'
import type { CmsBlockPath } from '../../shared/block-paths'
import {
   blockAt,
   blockListAt,
   blockListPath,
   blockPathIndex,
   blockPathStartsWith,
   blocksFieldAt,
   formatBlockPath,
   isBlockItemPath,
   parentBlockPath,
   parseBlockPath,
   resolveBlockPath,
} from '../../shared/block-paths'
import type { FieldConfig } from '../../shared/index'
import type { CmsInlineOverride } from '../../shared/inline-text'
import {
   editableText,
   inlineFieldPath,
   inlineTextLimit,
   isInlineTextField,
   isPlainTextContent,
   matchesInlineValue,
   normalizeInlineText,
} from '../../shared/inline-text'
import { canAddBlock } from '../../shared/index'
import type {
   CmsClipboardAction,
   CmsDropBox,
   CmsFieldTarget,
   CmsPreviewFrameMessage,
} from '../../shared/preview'
import {
   CMS_CLIPBOARD_MAX_LENGTH,
   canHideBlock,
   canMoveBlock,
   clipboardActionApplies,
   editorShortcut,
   insertionIndex,
   isHorizontalList,
   previewFieldConfig,
   shortcutApplies,
} from '../../shared/preview'
import { clipboardTarget, onApplePlatform, shortcutTarget } from '../utils/keyboard'
import type { CmsInlineTextSession } from './inline-text'
import { startInlineText } from './inline-text'
import { cmsPreviewTheme, cmsTokenRoot } from './field-marker'

interface Box extends CmsDropBox {
   key: string
   path: CmsBlockPath
   list: string
   type: string
   label: string
   width: number
   height: number
}

interface Placeholder {
   list: string
   index: number
   top: number
   bottom: number
   left: number
   right: number
}

interface FieldHit extends CmsFieldTarget {
   element: HTMLElement
   field: FieldConfig
}

interface FieldBox {
   top: number
   left: number
   width: number
   height: number
   label: string
   editing: boolean
}

interface DropLine {
   x: number
   y: number
   size: number
   vertical: boolean
}

interface DropTarget {
   list: CmsBlockPath
   index: number
   parent: string | null
   line: DropLine
}

const props = defineProps<{
   field: FieldConfig
   fieldKey: string
   fields: Record<string, FieldConfig> | null
   blocks: readonly Record<string, unknown>[]
   item: Record<string, unknown> | null
   locale: string
   editable: boolean
   lockedFields: readonly string[]
   selected: CmsBlockPath | null
   highlighted: CmsBlockPath | null
   version: number
}>()

const emit = defineEmits<{
   message: [message: CmsPreviewFrameMessage]
   inline: [override: CmsInlineOverride | null]
}>()

const root = ref<HTMLElement | null>(null)
const boxes = ref<Box[]>([])
const placeholders = ref<Placeholder[]>([])
const hovered = ref<string | null>(null)
const hoveredField = ref<FieldHit | null>(null)
const fieldBox = ref<FieldBox | null>(null)
const editing = shallowRef<{ hit: FieldHit; session: CmsInlineTextSession } | null>(null)
const viewportWidth = ref(0)
const viewportHeight = ref(0)

const drag = ref<{
   from: CmsBlockPath
   startX: number
   startY: number
   x: number
   y: number
   moved: boolean
} | null>(null)
let refocus = false
let suppressClick = false
let frame = 0

const rootFields = computed(() => ({ [props.fieldKey]: props.field }))
const rootValues = computed(() => ({ [props.fieldKey]: props.blocks as unknown[] }))

const selectedKey = computed(() => (props.selected ? formatBlockPath(props.selected) : null))
const highlightedKey = computed(() =>
   props.highlighted ? formatBlockPath(props.highlighted) : null
)

const boxIndex = computed(() => new Map(boxes.value.map((box) => [box.key, box])))

const groups = computed(() => {
   const map = new Map<string, Box[]>()
   for (const box of boxes.value) {
      const list = map.get(box.list) ?? []
      list.push(box)
      map.set(box.list, list)
   }
   for (const list of map.values()) list.sort((a, b) => a.index - b.index)
   return map
})

function listLength(list: string) {
   const path = parseBlockPath(list)
   return path ? blockListAt(rootValues.value, path)?.length ?? 0 : 0
}

function canAddTo(list: string) {
   const path = parseBlockPath(list)
   const field = path ? blocksFieldAt(rootFields.value, rootValues.value, path) : null
   return !!field && canAddBlock(field, listLength(list))
}

function blockLabel(path: CmsBlockPath, type: string) {
   return resolveBlockPath(rootFields.value, rootValues.value, path)?.block?.label ?? type
}

function readPath(text: string | undefined): CmsBlockPath | null {
   const path = parseBlockPath(text)
   return path && isBlockItemPath(path) && path[0] === props.fieldKey ? path : null
}

function measure() {
   frame = 0
   viewportWidth.value = window.innerWidth
   viewportHeight.value = window.innerHeight
   const found = new Map<string, Box>()
   for (const element of document.querySelectorAll<HTMLElement>('[data-cms-block-path]')) {
      const path = readPath(element.dataset.cmsBlockPath)
      if (!path) continue
      const key = formatBlockPath(path)
      if (found.has(key)) continue
      const rect = element.getBoundingClientRect()
      const type = element.dataset.cmsBlockType ?? ''
      found.set(key, {
         key,
         path,
         list: formatBlockPath(blockListPath(path)),
         index: blockPathIndex(path),
         type,
         label: blockLabel(path, type),
         top: rect.top,
         left: rect.left,
         width: rect.width,
         height: rect.height,
         bottom: rect.bottom,
         right: rect.right,
      })
   }
   boxes.value = [...found.values()].sort((a, b) => a.path.length - b.path.length || a.top - b.top)
   const slots: Placeholder[] = []
   for (const element of document.querySelectorAll<HTMLElement>('[data-cms-insert]')) {
      if (root.value?.contains(element)) continue
      const path = readPath(element.dataset.cmsInsert)
      if (!path) continue
      const rect = element.getBoundingClientRect()
      slots.push({
         list: formatBlockPath(blockListPath(path)),
         index: blockPathIndex(path),
         top: rect.top,
         bottom: rect.bottom,
         left: rect.left,
         right: rect.right,
      })
   }
   placeholders.value = slots
   measureField()
}

function measureField() {
   const hit = editing.value?.hit ?? hoveredField.value
   if (!hit || !hit.element.isConnected) {
      fieldBox.value = null
      return
   }
   const rect = hit.element.getBoundingClientRect()
   fieldBox.value = {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      label: hit.field.label,
      editing: hit === editing.value?.hit,
   }
}

function fieldValue(hit: FieldHit) {
   return hit.path ? blockAt(rootValues.value, hit.path)?.[hit.key] : props.item?.[hit.key]
}

function startEditing(hit: FieldHit, point: { x: number; y: number }) {
   const { path, key, field } = hit
   const locale = props.locale
   const multiline = !!field.textarea
   emit('inline', { path, key, value: fieldValue(hit), settled: false })
   const session = startInlineText(hit.element, {
      multiline,
      maxLength: inlineTextLimit(field),
      point,
      onInput: (value, commit) =>
         emit(
            'message',
            commit
               ? { type: 'field-input', path, key, locale, value, commit: true }
               : { type: 'field-input', path, key, locale, value }
         ),
      onStop: (value) => {
         editing.value = null
         emit('inline', { path, key, value: value === '' ? null : value, settled: true })
         measureField()
      },
   })
   editing.value = { hit, session }
   measureField()
}

function canEditInline(hit: FieldHit) {
   if (!props.editable || !isInlineTextField(hit.field) || !isPlainTextContent(hit.element))
      return false
   if (props.lockedFields.includes(inlineFieldPath(hit.path, hit.key))) return false
   const text = normalizeInlineText(editableText(hit.element), !!hit.field.textarea)
   return matchesInlineValue(text, fieldValue(hit))
}

function onDoubleClick(event: MouseEvent) {
   if (editing.value || drag.value || insideOverlay(event.target)) return
   const hit = fieldHitOf(event.target)
   if (!hit || !canEditInline(hit)) return
   event.preventDefault()
   startEditing(hit, { x: event.clientX, y: event.clientY })
}

function insideEditing(target: EventTarget | null) {
   return target instanceof Node && !!editing.value?.hit.element.contains(target)
}

function blockElementOf(target: EventTarget | null) {
   return target instanceof Element ? target.closest<HTMLElement>('[data-cms-block-path]') : null
}

function fieldHitOf(target: EventTarget | null): FieldHit | null {
   const element =
      target instanceof Element ? target.closest<HTMLElement>('[data-cms-field]') : null
   const key = element?.dataset.cmsField
   if (!element || !key) return null
   const block = blockElementOf(element)
   const path = block ? readPath(block.dataset.cmsBlockPath) : null
   if (block && !path) return null
   const field = previewFieldConfig(
      { path, key },
      rootFields.value,
      rootValues.value,
      props.fields,
      props.fieldKey
   )
   return field ? { element, path, key, field } : null
}

function scheduleMeasure() {
   if (!frame) frame = requestAnimationFrame(measure)
}

function rectStyle(box: Box) {
   return {
      top: `${box.top}px`,
      left: `${box.left}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
   }
}

const outlined = computed(() => {
   const keys = new Set([hovered.value, selectedKey.value, highlightedKey.value])
   if (dropTarget.value?.parent) keys.add(dropTarget.value.parent)
   return boxes.value.filter((box) => keys.has(box.key))
})

const TOOLBAR_WIDTH = 240
const TOOLBAR_HEIGHT = 40

function toolbarPlace(box: Box, avoid: { top: number; right: number } | null) {
   const above = box.top - TOOLBAR_HEIGHT - 2
   let top =
      box.path.length > 2 && above >= 8
         ? above
         : Math.min(Math.max(box.top + 8, 8), Math.max(box.bottom - 44, 8))
   const right = Math.min(box.right, viewportWidth.value) - 8
   if (
      avoid &&
      Math.abs(top - avoid.top) < TOOLBAR_HEIGHT &&
      Math.abs(right - avoid.right) < TOOLBAR_WIDTH
   )
      top = avoid.top + TOOLBAR_HEIGHT
   return { top, right }
}

function horizontalList(list: string) {
   return isHorizontalList(groups.value.get(list) ?? [])
}

const toolbars = computed(() => {
   if (!props.editable) return []
   const selectedBox = selectedKey.value ? boxIndex.value.get(selectedKey.value) : undefined
   const hoveredBox =
      hovered.value && hovered.value !== selectedKey.value
         ? boxIndex.value.get(hovered.value)
         : undefined
   const tools = []
   let first: { top: number; right: number } | null = null
   for (const [box, selected] of [
      [selectedBox, true],
      [hoveredBox, false],
   ] as const) {
      if (!box) continue
      const place = toolbarPlace(box, first)
      first ??= place
      tools.push({
         box,
         selected,
         ...place,
         horizontal: horizontalList(box.list),
         hideable: canHideBlock(
            resolveBlockPath(rootFields.value, rootValues.value, box.path)?.block
         ),
      })
   }
   return tools
})

const INSERT_MARGIN = 14

const insertSlots = computed(() => {
   if (!props.editable) return []
   const lists = new Set([props.fieldKey])
   const near = new Set([hovered.value, selectedKey.value])
   for (const key of near) {
      const box = key ? boxIndex.value.get(key) : undefined
      if (!box) continue
      lists.add(box.list)
      for (const list of groups.value.keys())
         if (list.startsWith(`${box.key}.`) && list.split('.').length === box.path.length + 1)
            lists.add(list)
   }
   const maxY = viewportHeight.value - INSERT_MARGIN
   const clampY = (y: number) => Math.min(Math.max(y, INSERT_MARGIN), Math.max(maxY, INSERT_MARGIN))
   return [...lists].flatMap((list) => {
      const members = groups.value.get(list)
      const listPath = parseBlockPath(list)
      if (!members?.length || !listPath || !canAddTo(list)) return []
      const horizontal = isHorizontalList(members)
      const nested = listPath.length > 1
      const fieldLabel = nested
         ? blocksFieldAt(rootFields.value, rootValues.value, listPath)?.label
         : undefined
      const slot = (index: number, edge: string, x: number, y: number, isNear: boolean) => ({
         key: `${list}.${index}`,
         path: [...listPath, index],
         edge,
         x,
         y: clampY(y),
         near: isNear,
         label: `Insert a block${fieldLabel ? ` in ${fieldLabel}` : ''} at position ${index + 1}`,
      })
      return members.flatMap((box, position) => {
         const next = members[position + 1]
         const isNear = near.has(box.key) || (!!next && near.has(next.key))
         const middleY = (box.top + box.bottom) / 2
         const after =
            next && horizontal && next.left >= box.right - 1
               ? slot(box.index + 1, 'after', (box.right + next.left) / 2, middleY, isNear)
               : horizontal && !next
                 ? slot(box.index + 1, 'after', box.right, middleY, isNear)
                 : slot(
                      box.index + 1,
                      'after',
                      box.left + box.width / 2,
                      next ? (box.bottom + next.top) / 2 : box.bottom,
                      isNear
                   )
         if (position > 0) return [after]
         const before = horizontal
            ? slot(box.index, 'before', box.left, middleY, near.has(box.key))
            : slot(box.index, 'before', box.left + box.width / 2, box.top, near.has(box.key))
         return [before, after]
      })
   })
})

function contains(
   rect: { top: number; bottom: number; left: number; right: number },
   x: number,
   y: number
) {
   return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

function dropLine(members: Box[], index: number): DropLine {
   const horizontal = isHorizontalList(members)
   const position = members.findIndex((box) => box.index >= index)
   const previous = position === -1 ? members.at(-1) : members[position - 1]
   const current = position === -1 ? undefined : members[position]
   const top = Math.min(...members.map((box) => box.top))
   const bottom = Math.max(...members.map((box) => box.bottom))
   const left = Math.min(...members.map((box) => box.left))
   const right = Math.max(...members.map((box) => box.right))
   if (horizontal) {
      const x =
         previous && current
            ? (previous.right + current.left) / 2
            : current
              ? current.left
              : previous!.right
      return { x, y: top, size: bottom - top, vertical: true }
   }
   const y =
      previous && current
         ? (previous.bottom + current.top) / 2
         : current
           ? current.top
           : previous!.bottom
   return { x: left, y, size: right - left, vertical: false }
}

const dropTarget = computed<DropTarget | null>(() => {
   const current = drag.value
   if (!current?.moved) return null
   const candidates = new Map<string, { members: Box[]; placeholder?: Placeholder }>()
   for (const [list, members] of groups.value) candidates.set(list, { members })
   for (const placeholder of placeholders.value) {
      const entry = candidates.get(placeholder.list) ?? { members: [] }
      entry.placeholder = placeholder
      candidates.set(placeholder.list, entry)
   }
   let best: {
      list: CmsBlockPath
      parent: string | null
      members: Box[]
      placeholder?: Placeholder
   } | null = null
   for (const [list, entry] of candidates) {
      const listPath = parseBlockPath(list)
      if (!listPath || !canMoveBlock(rootFields.value, rootValues.value, current.from, listPath))
         continue
      const parent = listPath.length > 1 ? formatBlockPath(listPath.slice(0, -1)) : null
      const region = parent ? boxIndex.value.get(parent) : null
      if (parent && (!region || !contains(region, current.x, current.y))) continue
      if (best && best.list.length >= listPath.length) continue
      best = { list: listPath, parent, ...entry }
   }
   if (!best) return null
   const fromList = blockListPath(current.from)
   const fromIndex = blockPathIndex(current.from)
   const sameList = formatBlockPath(fromList) === formatBlockPath(best.list)
   const visible = best.members.filter((box) => !blockPathStartsWith(box.path, current.from))
   if (!visible.length) {
      const placeholder = best.placeholder
      if (!placeholder) return null
      return {
         list: best.list,
         index: placeholder.index,
         parent: best.parent,
         line: {
            x: placeholder.left,
            y: (placeholder.top + placeholder.bottom) / 2,
            size: placeholder.right - placeholder.left,
            vertical: false,
         },
      }
   }
   const index = insertionIndex(
      best.members,
      { x: current.x, y: current.y },
      listLength(formatBlockPath(best.list))
   )
   if (sameList && (index === fromIndex || index === fromIndex + 1)) return null
   return { list: best.list, index, parent: best.parent, line: dropLine(best.members, index) }
})

function emitMove(from: CmsBlockPath, list: CmsBlockPath, index: number, focus = false) {
   const to = [...list, index]
   emit('message', focus ? { type: 'move', from, to, focus: true } : { type: 'move', from, to })
}

function moveBy(box: Box, delta: number, focus = false) {
   const target = box.index + delta
   if (target < 0 || target >= listLength(box.list)) return
   emitMove(box.path, blockListPath(box.path), delta > 0 ? target + 1 : target, focus)
}

function onHandleKey(event: KeyboardEvent, box: Box) {
   const delta =
      event.key === 'ArrowUp' || event.key === 'ArrowLeft'
         ? -1
         : event.key === 'ArrowDown' || event.key === 'ArrowRight'
           ? 1
           : 0
   if (!delta) return
   event.preventDefault()
   refocus = true
   moveBy(box, delta, true)
}

function onHandleClick(box: Box) {
   if (drag.value?.moved) return
   emit('message', { type: 'select', path: box.path })
}

function startDrag(event: PointerEvent, box: Box) {
   if (event.button !== 0 || !props.editable) return
   drag.value = {
      from: box.path,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      moved: false,
   }
   window.addEventListener('pointermove', onDragMove)
   window.addEventListener('pointerup', onDragEnd)
   window.addEventListener('pointercancel', cancelDrag)
}

function onDragMove(event: PointerEvent) {
   const current = drag.value
   if (!current) return
   current.x = event.clientX
   current.y = event.clientY
   const distance = Math.hypot(event.clientX - current.startX, event.clientY - current.startY)
   if (!current.moved && distance > 4) {
      current.moved = true
      document.documentElement.classList.add('cms-preview-grabbing')
   }
   if (current.moved) {
      event.preventDefault()
      const edge = 48
      if (event.clientY < edge) window.scrollBy(0, -12)
      else if (event.clientY > window.innerHeight - edge) window.scrollBy(0, 12)
   }
}

function stopDrag() {
   window.removeEventListener('pointermove', onDragMove)
   window.removeEventListener('pointerup', onDragEnd)
   window.removeEventListener('pointercancel', cancelDrag)
   document.documentElement.classList.remove('cms-preview-grabbing')
}

function onDragEnd() {
   const current = drag.value
   const target = dropTarget.value
   stopDrag()
   if (current?.moved) {
      suppressClick = true
      if (target) emitMove(current.from, target.list, target.index)
   }
   setTimeout(() => {
      drag.value = null
      suppressClick = false
   })
}

function cancelDrag() {
   stopDrag()
   drag.value = null
}

function blockPathOf(target: EventTarget | null): CmsBlockPath | null {
   const element = blockElementOf(target)
   return element ? readPath(element.dataset.cmsBlockPath) : null
}

function insideOverlay(target: EventTarget | null) {
   return target instanceof Node && !!root.value?.contains(target)
}

function onPointerMove(event: PointerEvent) {
   if (drag.value || insideOverlay(event.target)) return
   const path = blockPathOf(event.target)
   hovered.value = path ? formatBlockPath(path) : null
   const hit = fieldHitOf(event.target)
   if (hit?.element !== hoveredField.value?.element) {
      hoveredField.value = hit
      measureField()
   }
}

function onPointerLeave() {
   if (drag.value) return
   hovered.value = null
   hoveredField.value = null
   fieldBox.value = null
}

function insertTargetOf(target: Element | null): CmsBlockPath | null {
   const element = target?.closest<HTMLElement>('[data-cms-insert]')
   return element ? readPath(element.dataset.cmsInsert) : null
}

function onClick(event: MouseEvent) {
   if (suppressClick) {
      suppressClick = false
      event.preventDefault()
      event.stopPropagation()
      return
   }
   if (insideOverlay(event.target)) return
   if (insideEditing(event.target)) {
      event.preventDefault()
      event.stopPropagation()
      return
   }
   const target = event.target instanceof Element ? event.target : null
   const insert = insertTargetOf(target)
   if (insert) {
      event.preventDefault()
      event.stopPropagation()
      if (props.editable) emit('message', { type: 'insert', path: insert })
      return
   }
   if (target?.closest('a, button, input, select, textarea, label, summary')) event.preventDefault()
   if (target?.closest('[data-cms-preview-keep]')) return
   event.stopPropagation()
   const hit = fieldHitOf(event.target)
   emit(
      'message',
      hit
         ? { type: 'focus-field', path: hit.path, key: hit.key }
         : { type: 'select', path: blockPathOf(event.target) }
   )
}

function onSubmit(event: Event) {
   event.preventDefault()
}

function selectedBlock() {
   const path = props.selected
   return path && blockAt(rootValues.value, path) ? path : null
}

function onKeydown(event: KeyboardEvent) {
   if (event.defaultPrevented || event.isComposing) return
   const action = editorShortcut(event, onApplePlatform())
   const path = selectedBlock()
   if (!action || !shortcutApplies(action, shortcutTarget(event, path !== null))) return
   if (!props.editable && action !== 'deselect') return
   event.preventDefault()
   if (action === 'undo' || action === 'redo' || action === 'save') {
      emit('message', { type: action })
      return
   }
   if (!path) return
   const list = blockListPath(path)
   const index = blockPathIndex(path)
   const key = formatBlockPath(list)
   switch (action) {
      case 'remove':
         emit('message', { type: 'remove', path })
         break
      case 'duplicate':
         if (canAddTo(key)) emit('message', { type: 'duplicate', path })
         break
      case 'move-up':
      case 'move-down': {
         const box = boxIndex.value.get(formatBlockPath(path))
         if (box) moveBy(box, action === 'move-up' ? -1 : 1)
         break
      }
      case 'insert-after':
      case 'insert-before':
         if (canAddTo(key))
            emit('message', {
               type: 'insert',
               path: [...list, action === 'insert-after' ? index + 1 : index],
            })
         break
      case 'deselect':
         emit('message', { type: 'select', path: parentBlockPath(path) })
         break
   }
}

function onClipboard(event: ClipboardEvent) {
   if (event.defaultPrevented) return
   const action = event.type as CmsClipboardAction
   if (!props.editable && action !== 'copy') return
   const path = selectedBlock()
   if (!clipboardActionApplies(action, clipboardTarget(event, path !== null))) return
   if (action !== 'paste') {
      if (path) emit('message', { type: action, path })
      return
   }
   event.preventDefault()
   const at = path
      ? [...blockListPath(path), blockPathIndex(path) + 1]
      : [props.fieldKey, props.blocks.length]
   const text = event.clipboardData?.getData('text/plain') ?? ''
   emit(
      'message',
      text && text.length <= CMS_CLIPBOARD_MAX_LENGTH
         ? { type: 'paste', path: at, text }
         : { type: 'paste', path: at }
   )
}

function blockElement(path: CmsBlockPath) {
   for (let end = path.length; end >= 2; end -= 2) {
      const key = formatBlockPath(path.slice(0, end))
      const element = document.querySelector<HTMLElement>(`[data-cms-block-path="${key}"]`)
      if (element?.getClientRects().length) return element
   }
   return null
}

function revealSelected() {
   if (!props.selected || drag.value) return
   const element = blockElement(props.selected)
   if (!element) return
   const rect = element.getBoundingClientRect()
   if (rect.bottom < 0 || rect.top > window.innerHeight) {
      element.scrollIntoView({ block: 'center', behavior: 'smooth' })
   }
}

async function reveal(path: CmsBlockPath) {
   await nextTick()
   const element = blockElement(path)
   if (!element || drag.value) return
   const rect = element.getBoundingClientRect()
   if (rect.top >= 0 && rect.bottom <= window.innerHeight) return
   const tall = rect.height > window.innerHeight * 0.8
   element.scrollIntoView({ block: tall ? 'start' : 'center', behavior: 'smooth' })
}

watch(hovered, (key) => emit('message', { type: 'hover', path: key ? parseBlockPath(key) : null }))

defineExpose({ reveal })

watch(
   () => props.version,
   async () => {
      await nextTick()
      if (editing.value && !editing.value.hit.element.isConnected) editing.value.session.stop(true)
      measure()
      if (refocus) {
         refocus = false
         root.value
            ?.querySelector<HTMLElement>('.cms-preview-toolbar.is-selected .cms-preview-handle')
            ?.focus()
      }
   }
)

watch(
   () => selectedKey.value,
   async () => {
      await nextTick()
      revealSelected()
   }
)

let resizeObserver: ResizeObserver | null = null
let mutationObserver: MutationObserver | null = null

onMounted(() => {
   measure()
   document.addEventListener('pointermove', onPointerMove, { passive: true })
   document.documentElement.addEventListener('pointerleave', onPointerLeave)
   document.addEventListener('click', onClick, true)
   document.addEventListener('dblclick', onDoubleClick, true)
   document.addEventListener('submit', onSubmit, true)
   document.addEventListener('keydown', onKeydown)
   document.addEventListener('copy', onClipboard)
   document.addEventListener('cut', onClipboard)
   document.addEventListener('paste', onClipboard)
   document.addEventListener('load', scheduleMeasure, true)
   window.addEventListener('scroll', scheduleMeasure, { passive: true, capture: true })
   window.addEventListener('resize', scheduleMeasure)
   resizeObserver = new ResizeObserver(scheduleMeasure)
   resizeObserver.observe(document.body)
   mutationObserver = new MutationObserver((records) => {
      if (records.some((record) => !root.value?.contains(record.target))) scheduleMeasure()
   })
   mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: true })
})

onBeforeUnmount(() => {
   stopDrag()
   editing.value?.session.stop(true)
   if (frame) cancelAnimationFrame(frame)
   document.removeEventListener('pointermove', onPointerMove)
   document.documentElement.removeEventListener('pointerleave', onPointerLeave)
   document.removeEventListener('click', onClick, true)
   document.removeEventListener('dblclick', onDoubleClick, true)
   document.removeEventListener('submit', onSubmit, true)
   document.removeEventListener('keydown', onKeydown)
   document.removeEventListener('copy', onClipboard)
   document.removeEventListener('cut', onClipboard)
   document.removeEventListener('paste', onClipboard)
   document.removeEventListener('load', scheduleMeasure, true)
   window.removeEventListener('scroll', scheduleMeasure, { capture: true })
   window.removeEventListener('resize', scheduleMeasure)
   resizeObserver?.disconnect()
   mutationObserver?.disconnect()
})
</script>
