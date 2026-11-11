<template>
   <KStack gap="sm" class="cms-blocks-field">
      <div class="cms-blocks-grid" @copy="onClipboard" @cut="onClipboard" @paste="onClipboard">
         <div
            v-for="(item, index) in items"
            :key="uidFor(item)"
            class="cms-block-tile"
            :class="{
               'is-muted': isHidden(item),
               'is-dragging': dragIndex === index,
               'is-drop-target': dropIndex === index && dragIndex !== index,
               'is-missing': hasMissingMedia(item),
               'is-media-only': mediaOnly,
               'is-disabled': disabled,
            }"
            :draggable="disabled ? undefined : 'true'"
            :data-cms-tile="index"
            :tabindex="mediaOnly && !disabled ? 0 : undefined"
            :aria-label="
               mediaOnly && !disabled
                  ? `${barTitle(item)}, use the arrow keys to reorder`
                  : undefined
            "
            @dragstart="onDragStart(index, $event)"
            @dragover.prevent="dropIndex = index"
            @dragleave="onDragLeave(index)"
            @drop.prevent="onDrop(index)"
            @dragend="onDragEnd"
            @keydown.self="onTileKey($event, index)"
         >
            <component
               :is="mediaOnly ? 'div' : 'button'"
               :type="mediaOnly ? undefined : 'button'"
               class="cms-block-preview"
               :aria-label="mediaOnly ? undefined : `Edit ${labelOf(item)}`"
               @click="onPreviewClick(index)"
            >
               <img
                  v-if="previewOf(item)?.kind === 'image'"
                  :src="previewOf(item)!.url"
                  alt=""
                  loading="lazy"
               />
               <video
                  v-else-if="previewOf(item)?.kind === 'video'"
                  :src="previewOf(item)!.url"
                  preload="metadata"
                  muted
                  playsinline
               />
               <span v-else-if="summaryOf(item)" class="cms-block-summary">
                  {{ summaryOf(item) }}
               </span>
               <KIcon v-else :name="cmsIcon(iconOf(item))" class="cms-block-icon" />

               <KIcon v-if="isHidden(item)" name="eye-slash" class="cms-block-hidden" />

               <template v-if="mediaOnly">
                  <span
                     v-if="hasMissingMedia(item)"
                     class="cms-block-missing"
                     title="Not found in the media library"
                  >
                     <KIcon name="exclamation-triangle" />
                  </span>
                  <button
                     v-if="!disabled"
                     type="button"
                     class="cms-block-remove"
                     :aria-label="`Remove ${barTitle(item)}`"
                     title="Remove"
                     @click.stop="remove(index)"
                  >
                     <KIcon name="x-mark" />
                  </button>
               </template>
            </component>

            <div v-if="!mediaOnly" class="cms-block-bar">
               <button
                  v-if="!disabled"
                  type="button"
                  class="cms-block-grip"
                  :aria-label="`Reorder ${labelOf(item)}, use the arrow keys`"
                  @keydown.left.prevent="index > 0 && move(index, -1)"
                  @keydown.right.prevent="index < items.length - 1 && move(index, 1)"
               >
                  <KIcon :name="cmsIcon('bars-2')" />
               </button>
               <span class="cms-block-bar-name" :title="barTitle(item)">{{ barLabel(item) }}</span>
               <span
                  v-if="hasMissingMedia(item)"
                  class="cms-block-missing-icon"
                  title="Not found in the media library"
               >
                  <KIcon name="exclamation-triangle" />
               </span>
               <KDropdownMenu :items="tileMenu(index)" placement="bottom-end">
                  <KButton
                     :icon="cmsIcon('ellipsis-horizontal')"
                     size="xs"
                     variant="ghost"
                     tone="neutral"
                     :aria-label="`${labelOf(item)} actions`"
                  />
               </KDropdownMenu>
               <KButton
                  v-if="!disabled"
                  icon="trash"
                  size="xs"
                  variant="ghost"
                  tone="danger"
                  aria-label="Remove block"
                  @click="remove(index)"
               />
            </div>
         </div>

         <CmsBlockPickerPopover
            v-if="canAdd && !disabled && Object.keys(blocks).length > 1"
            :blocks="blocks"
            :paste-count="pasteCount"
            @pick="add"
            @paste="paste(items.length, null)"
         >
            <button type="button" class="cms-block-add">
               <KIcon name="plus" />
               <span>Add</span>
            </button>
         </CmsBlockPickerPopover>
         <button
            v-else
            type="button"
            class="cms-block-add"
            :disabled="!canAdd || disabled"
            :title="canAdd ? undefined : countHint"
            @click="addFirst"
         >
            <KIcon name="plus" />
            <span>{{ mediaOnly ? addMediaLabel : 'Add' }}</span>
         </button>
      </div>

      <p v-if="countHint" class="cms-field-hint">{{ countHint }}</p>

      <div v-if="visual && !disabled">
         <KButton
            label="Open visual editor"
            :icon="cmsIcon('window')"
            size="sm"
            variant="soft"
            tone="neutral"
            @click="visualOpen = true"
         />
      </div>

      <KModal
         v-if="visual"
         v-model:open="visualOpen"
         size="fullscreen"
         flush
         hide-close
         class="cms-editor-modal"
         aria-label="Visual editor"
      >
         <CmsVisualEditor
            :state="{ [fieldKey!]: model }"
            :entry-name="entryName!"
            :field-key="fieldKey!"
            :fields="{ [fieldKey!]: field }"
            :title="field.label"
            @update:state="onVisualUpdate"
         >
            <template #start>
               <KButton
                  icon="arrow-left"
                  size="sm"
                  variant="ghost"
                  tone="neutral"
                  aria-label="Back to the form"
                  title="Back to the form"
                  @click="visualOpen = false"
               />
            </template>
            <template #actions>
               <KButton label="Done" size="sm" @click="visualOpen = false" />
            </template>
         </CmsVisualEditor>
      </KModal>

      <KModal v-if="mediaOnly" v-model:open="pickerOpen" title="Media" size="lg">
         <CmsMediaGallery
            v-model:folder="pickerFolder"
            selectable
            :media-type="mediaOnly.field.mediaType"
            :accept="mediaOnly.field.accept"
            @select="addMedia"
         />
      </KModal>

      <KModal v-model:open="editorOpen" :title="editorTitle" :size="editorWide ? 'lg' : 'md'">
         <CmsFormSections
            v-if="editorBlock"
            :key="editorIndex ?? ''"
            :layout="editorLayout"
            :shown="isEditorFieldShown"
         >
            <template #field="{ fieldKey: blockKey }">
               <KFormField
                  :label="editorBlock.fields[blockKey]!.label"
                  :description="editorBlock.fields[blockKey]!.description"
                  :icon="cmsIcon(fieldIcon(editorBlock.fields[blockKey]!))"
                  :required="editorBlock.fields[blockKey]!.required"
               >
                  <CmsFieldInput
                     :model-value="editorItem?.[blockKey]"
                     :field="editorBlock.fields[blockKey]!"
                     :locale="locale"
                     @update:model-value="(value: unknown) => updateEditorField(blockKey, value)"
                  />
               </KFormField>
            </template>
         </CmsFormSections>

         <template #footer>
            <KStack v-if="disabled" direction="row" justify="end">
               <KButton label="Done" @click="editorOpen = false" />
            </KStack>
            <KStack
               v-else
               direction="row"
               justify="between"
               gap="sm"
               wrap
               class="cms-block-editor-actions"
            >
               <KStack direction="row" gap="sm" wrap>
                  <KButton
                     icon="chevron-left"
                     variant="soft"
                     tone="neutral"
                     aria-label="Move earlier"
                     :disabled="editorIndex === 0"
                     @click="moveCurrent(-1)"
                  />
                  <KButton
                     icon="chevron-right"
                     variant="soft"
                     tone="neutral"
                     aria-label="Move later"
                     :disabled="editorIndex === items.length - 1"
                     @click="moveCurrent(1)"
                  />
                  <KButton
                     label="Duplicate"
                     :icon="cmsIcon('document-duplicate')"
                     variant="soft"
                     tone="neutral"
                     :disabled="!canAdd"
                     @click="duplicateCurrent"
                  />
                  <KButton
                     v-if="editorItem && !declaresHiddenField(blockOf(editorItem))"
                     :label="isHidden(editorItem) ? 'Show' : 'Hide'"
                     :icon="cmsIcon(isHidden(editorItem) ? 'eye' : 'eye-slash')"
                     variant="soft"
                     tone="neutral"
                     @click="toggleHiddenCurrent"
                  />
               </KStack>
               <KStack direction="row" gap="sm">
                  <KButton
                     label="Remove"
                     icon="trash"
                     variant="soft"
                     tone="danger"
                     @click="removeCurrent"
                  />
                  <KButton label="Done" @click="editorOpen = false" />
               </KStack>
            </KStack>
         </template>
      </KModal>
   </KStack>
</template>

<script setup lang="ts">
import type { FieldConfig } from '#nuxt-cms'
import {
   blockFormLayout,
   canAddBlock,
   declaresHiddenField,
   isFieldVisible,
   isHiddenBlock,
   isTranslatableMediaField,
   linkDisplayText,
   mediaFilename,
   mediaIconFor,
   mediaPublicUrl,
   mediaTypeForKey,
   pickTranslatedMedia,
} from '#nuxt-cms'
import type { MenuItems } from '@xleddyl/443-components-vue'
import {
   Button as KButton,
   DropdownMenu as KDropdownMenu,
   FormField as KFormField,
   Icon as KIcon,
   Modal as KModal,
   Stack as KStack,
   useFieldControl,
} from '@xleddyl/443-components-vue'
import { computed, ref, useState } from '#imports'
import { copyNotice, pasteBlocks, pasteNotice, pasteableCount } from '../../../shared/clipboard'
import type { CmsBlockValue, CmsClipboardAction } from '../../../shared/preview'
import { clipboardActionApplies } from '../../../shared/preview'
import { useCmsClipboard } from '../../composables/cms-clipboard'
import { useCmsMediaKeys } from '../../composables/cms-media-keys'
import { useCmsRuntime } from '../../composables/cms-runtime'
import { clipboardTarget } from '../../utils/keyboard'
import { cmsIcon, fieldIcon } from '../../utils/ui'

const props = defineProps<{
   field: FieldConfig
   locale?: string
   entryName?: string
   fieldKey?: string
}>()

const model = defineModel<Record<string, unknown>[] | null>({ required: true })

const { mediaBaseUrl, i18n } = useCmsRuntime()
const mediaKeys = useCmsMediaKeys()
const { disabled } = useFieldControl()

const blocks = computed(() => props.field.blocks ?? {})
const items = computed(() => (Array.isArray(model.value) ? model.value : []))

const canAdd = computed(() => canAddBlock(props.field, items.value.length))

function blockCount(count: number) {
   return `${count} ${count === 1 ? 'block' : 'blocks'}`
}

const countHint = computed(() => {
   const min = props.field.min || undefined
   const max = props.field.max
   if (min !== undefined && max !== undefined)
      return min === max ? `Exactly ${blockCount(min)}.` : `From ${min} to ${blockCount(max)}.`
   if (max !== undefined) return `At most ${blockCount(max)}.`
   if (min !== undefined) return `At least ${blockCount(min)}.`
   return ''
})

const mediaOnly = computed(() => {
   const types = Object.entries(blocks.value)
   if (types.length !== 1) return null
   const [type, block] = types[0]!
   const fields = Object.entries(block.fields)
   if (fields.length !== 1) return null
   const [key, field] = fields[0]!
   if (field.type !== 'media' || isTranslatableMediaField(field)) return null
   return { type, key, field }
})

const visual = computed(() => {
   const list = Object.values(blocks.value)
   return (
      !mediaOnly.value &&
      !!props.entryName &&
      !!props.fieldKey &&
      !!list.length &&
      list.every((block) => typeof block.component === 'string' && !!block.component.trim())
   )
})

const visualOpen = ref(false)

function onVisualUpdate(state: Record<string, unknown>) {
   if (disabled.value) return
   const value = props.fieldKey ? state[props.fieldKey] : null
   model.value = Array.isArray(value) && value.length ? (value as Record<string, unknown>[]) : null
}

const addMediaLabel = computed(() => {
   const types = [mediaOnly.value?.field.mediaType ?? []].flat()
   return types.length === 1 && types[0] === 'image' ? 'Add photo' : 'Add media'
})

const pickerOpen = ref(false)
const pickerFolder = useState<string | null>('cms-media-picker-folder', () => null)

function addMedia(media: { key: string }) {
   const target = mediaOnly.value
   if (!target || !canAdd.value || disabled.value) return
   mediaKeys.remember(media.key)
   model.value = [...items.value, { type: target.type, [target.key]: media.key }]
   pickerOpen.value = false
}

let uidCounter = 0
const uids = new WeakMap<Record<string, unknown>, number>()

function uidFor(item: Record<string, unknown>) {
   let uid = uids.get(item)
   if (uid === undefined) {
      uid = ++uidCounter
      uids.set(item, uid)
   }
   return uid
}

function blockOf(item: Record<string, unknown>) {
   return blocks.value[item.type as string]
}

function labelOf(item: Record<string, unknown>) {
   return blockOf(item)?.label ?? String(item.type)
}

function barLabel(item: Record<string, unknown>) {
   const key = mediaKeyOf(item)
   return key ? mediaFilename(key) : labelOf(item)
}

function barTitle(item: Record<string, unknown>) {
   return mediaKeyOf(item) ?? labelOf(item)
}

function mediaKeyOf(item: Record<string, unknown>) {
   const locale = props.locale ?? i18n.defaultLocale
   for (const [key, field] of Object.entries(blockOf(item)?.fields ?? {})) {
      if (field.type !== 'media') continue
      const raw = item[key]
      const value = isTranslatableMediaField(field)
         ? pickTranslatedMedia(raw as Record<string, string> | null, locale, i18n.defaultLocale)
         : raw
      if (typeof value === 'string' && value) return value
   }
   return null
}

function hasMissingMedia(item: Record<string, unknown>) {
   return Object.entries(blockOf(item)?.fields ?? {}).some(([key, field]) => {
      if (field.type !== 'media') return false
      const raw = item[key]
      const values = raw && typeof raw === 'object' ? Object.values(raw) : [raw]
      return values.some((value) => mediaKeys.isMissing(value))
   })
}

function previewOf(item: Record<string, unknown>) {
   const key = mediaKeyOf(item)
   if (!key) return null
   const url = mediaPublicUrl(mediaBaseUrl, key)
   if (!url) return null
   return { url, kind: mediaTypeForKey(key) }
}

function iconOf(item: Record<string, unknown>) {
   const key = mediaKeyOf(item)
   return key ? mediaIconFor(mediaTypeForKey(key)) : 'rectangle-stack'
}

function summaryOf(item: Record<string, unknown>) {
   const locale = props.locale ?? i18n.defaultLocale
   for (const [key, field] of Object.entries(blockOf(item)?.fields ?? {})) {
      if (field.type === 'link') {
         const text = linkDisplayText(item[key], locale, i18n.defaultLocale)
         if (text) return text.length > 80 ? `${text.slice(0, 77)}…` : text
         continue
      }
      if (field.type !== 'text' && field.type !== 'richtext') continue
      const raw = item[key]
      const value =
         typeof raw === 'string' ? raw : (raw as Record<string, string> | null)?.[locale] ?? ''
      const text = value.replace(/<[^>]*>/g, ' ').trim()
      if (text) return text.length > 80 ? `${text.slice(0, 77)}…` : text
   }
   return ''
}

function isHidden(item: Record<string, unknown>) {
   return isHiddenBlock(item)
}

function updateField(index: number, key: string, value: unknown) {
   const current = items.value[index]
   if (!current || disabled.value) return
   const updated = { ...current, [key]: value }
   uids.set(updated, uidFor(current))
   model.value = items.value.map((item, i) => (i === index ? updated : item))
}

function add(type: string) {
   const block = blocks.value[type]
   if (!block || !canAdd.value || disabled.value) return
   const empty = Object.fromEntries(Object.keys(block.fields).map((k) => [k, null]))
   const index = items.value.length
   model.value = [...items.value, { type, ...empty }]
   openEditor(index)
}

function onTileKey(event: KeyboardEvent, index: number) {
   if (!mediaOnly.value || disabled.value) return
   const action =
      event.key === 'ArrowLeft'
         ? () => move(index, -1)
         : event.key === 'ArrowRight'
           ? () => move(index, 1)
           : event.key === 'Delete' || event.key === 'Backspace'
             ? () => remove(index)
             : null
   if (!action) return
   event.preventDefault()
   action()
}

function onPreviewClick(index: number) {
   if (!mediaOnly.value) openEditor(index)
}

function addFirst() {
   if (!canAdd.value || disabled.value) return
   if (mediaOnly.value) {
      pickerOpen.value = true
      return
   }
   const first = Object.keys(blocks.value)[0]
   if (first) add(first)
}

function remove(index: number) {
   if (disabled.value) return
   const next = items.value.filter((_, i) => i !== index)
   model.value = next.length ? next : null
}

function duplicate(index: number) {
   const current = items.value[index]
   if (!current || !canAdd.value || disabled.value) return
   const copy = JSON.parse(JSON.stringify(current)) as Record<string, unknown>
   const next = [...items.value]
   next.splice(index + 1, 0, copy)
   model.value = next
}

function move(index: number, delta: number) {
   moveTo(index, index + delta)
}

function moveTo(from: number, to: number) {
   if (disabled.value || from === to || to < 0 || to >= items.value.length) return
   const next = [...items.value]
   const [item] = next.splice(from, 1)
   next.splice(to, 0, item!)
   model.value = next
}

const dragIndex = ref<number | null>(null)
const dropIndex = ref<number | null>(null)

function onDragStart(index: number, event: DragEvent) {
   if (disabled.value) {
      event.preventDefault()
      return
   }
   dragIndex.value = index
   if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', String(index))
   }
}

function onDragLeave(index: number) {
   if (dropIndex.value === index) dropIndex.value = null
}

function onDrop(index: number) {
   if (dragIndex.value !== null) moveTo(dragIndex.value, index)
   onDragEnd()
}

function onDragEnd() {
   dragIndex.value = null
   dropIndex.value = null
}

const editorIndex = ref<number | null>(null)

const editorOpen = computed({
   get: () => editorIndex.value !== null,
   set: (value: boolean) => {
      if (!value) editorIndex.value = null
   },
})

const editorItem = computed(() =>
   editorIndex.value === null ? undefined : items.value[editorIndex.value]
)

const editorBlock = computed(() => (editorItem.value ? blockOf(editorItem.value) : undefined))

const editorLayout = computed(() =>
   editorBlock.value ? blockFormLayout(editorBlock.value) : { main: [] }
)

const editorWide = computed(() =>
   editorLayout.value.main.some((section) => section.rows.some((row) => row.length > 1))
)

function isEditorFieldShown(key: string) {
   const fields = editorBlock.value?.fields ?? {}
   const field = fields[key]
   return !!field && isFieldVisible(field, editorItem.value, fields)
}

const editorTitle = computed(() => (editorItem.value ? labelOf(editorItem.value) : ''))

function openEditor(index: number) {
   editorIndex.value = index
}

function updateEditorField(key: string, value: unknown) {
   if (editorIndex.value === null) return
   updateField(editorIndex.value, key, value)
}

function removeCurrent() {
   if (editorIndex.value === null) return
   remove(editorIndex.value)
   editorIndex.value = null
}

function moveCurrent(delta: number) {
   if (editorIndex.value === null) return
   const next = editorIndex.value + delta
   move(editorIndex.value, delta)
   editorIndex.value = next
}

function toggleHiddenCurrent() {
   if (editorIndex.value === null || !editorItem.value || disabled.value) return
   const index = editorIndex.value
   const current = items.value[index]
   if (!current) return
   const { hidden: _hidden, ...rest } = current
   const updated = isHidden(current) ? rest : { ...rest, hidden: true }
   uids.set(updated, uidFor(current))
   model.value = items.value.map((item, i) => (i === index ? updated : item))
}

function duplicateCurrent() {
   if (editorIndex.value === null) return
   duplicate(editorIndex.value)
   editorIndex.value = null
}

const clipboard = useCmsClipboard()

const pasteCount = computed(() => pasteableCount(clipboard.items.value, props.field))

function copy(index: number, event?: ClipboardEvent) {
   const item = items.value[index]
   if (!item) return
   clipboard.copy([item as CmsBlockValue], event)
   clipboard.notify(copyNotice(1))
}

function cut(index: number, event?: ClipboardEvent) {
   const item = items.value[index]
   if (!item || disabled.value) return
   clipboard.copy([item as CmsBlockValue], event)
   remove(index)
   clipboard.notify(copyNotice(1, true))
}

async function paste(index: number, text?: string | null) {
   if (disabled.value) return
   const pasted = await clipboard.read(text)
   const result = pasted
      ? pasteBlocks(items.value as CmsBlockValue[], index, pasted, props.field, i18n)
      : null
   if (result?.pasted) model.value = result.list
   clipboard.notify(pasteNotice(result, props.field))
}

function tileIndexOf(target: EventTarget | null) {
   const tile = target instanceof Element ? target.closest<HTMLElement>('[data-cms-tile]') : null
   const index = tile ? Number(tile.dataset.cmsTile) : NaN
   return Number.isInteger(index) ? index : null
}

function onClipboard(event: ClipboardEvent) {
   if (event.defaultPrevented) return
   const action = event.type as CmsClipboardAction
   if (disabled.value && action !== 'copy') return
   const index = tileIndexOf(event.target)
   if (!clipboardActionApplies(action, clipboardTarget(event, index !== null))) return
   if (action === 'paste') {
      event.preventDefault()
      void paste(
         index === null ? items.value.length : index + 1,
         event.clipboardData?.getData('text/plain') ?? null
      )
   } else if (index !== null) {
      if (action === 'copy') copy(index, event)
      else cut(index, event)
   }
}

function tileMenu(index: number): MenuItems {
   const copyItem = {
      label: 'Copy',
      icon: cmsIcon('clipboard-document'),
      shortcut: 'mod+c',
      onSelect: () => copy(index),
   }
   if (disabled.value) return [[copyItem]]
   const full = canAdd.value ? undefined : countHint.value
   return [
      [
         copyItem,
         {
            label: 'Cut',
            icon: cmsIcon('scissors'),
            shortcut: 'mod+x',
            onSelect: () => cut(index),
         },
         {
            label: 'Paste after',
            icon: cmsIcon('clipboard'),
            shortcut: 'mod+v',
            disabled: !!full,
            disabledReason: full,
            onSelect: () => void paste(index + 1),
         },
      ],
      [
         {
            label: 'Duplicate',
            icon: cmsIcon('document-duplicate'),
            disabled: !!full,
            disabledReason: full,
            onSelect: () => duplicate(index),
         },
      ],
   ]
}
</script>
