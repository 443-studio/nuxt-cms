<template>
   <KStack gap="sm" class="cms-blocks-field">
      <KTileGrid
         :items="items"
         :item-key="(item: Record<string, unknown>) => uidFor(item)"
         :item-label="barTitle"
         :label="field.label"
         :columns="4"
         min-item-width="9rem"
         sortable
         :handle="mediaOnly ? undefined : '[data-cms-grip]'"
         :disabled="disabled"
         @update:items="onReorder"
         @keydown="onTileKey"
         @copy="onClipboard"
         @cut="onClipboard"
         @paste="onClipboard"
      >
         <template #tile="{ item, index }">
            <KCard
               variant="outline"
               padding="none"
               :animated="false"
               class="cms-block-tile"
               :class="{
                  'is-muted': isHidden(item),
                  'is-missing': hasMissingMedia(item),
                  'is-invalid': tileInvalid(index),
               }"
               :data-cms-tile="index"
            >
               <component
                  :is="mediaOnly ? 'div' : 'button'"
                  :type="mediaOnly ? undefined : 'button'"
                  class="cms-tile-preview"
                  :aria-label="mediaOnly ? undefined : `Edit ${labelOf(item)}`"
                  @click="onPreviewClick(index)"
               >
                  <KThumbnail
                     :src="previewOf(item)?.url"
                     :kind="previewOf(item)?.kind ?? 'icon'"
                     :icon="previewOf(item) ? undefined : cmsIcon(iconOf(item))"
                     :aspect="mediaOnly ? 1 : '4/3'"
                     rounded="none"
                     :missing="mediaKeys.isMissing(mediaKeyOf(item))"
                     missing-text="Not found in the media library"
                     :reveal="['top-end']"
                  >
                     <template v-if="!previewOf(item) && summaryOf(item)" #default>
                        <span class="cms-block-summary">{{ summaryOf(item) }}</span>
                     </template>
                     <template v-if="isHidden(item)" #top-start>
                        <KIcon name="eye-slash" label="Hidden" />
                     </template>
                     <template v-if="mediaOnly && !disabled" #top-end>
                        <KButton
                           icon="x-mark"
                           size="xs"
                           variant="solid"
                           tone="neutral"
                           square
                           tooltip="Remove"
                           :aria-label="`Remove ${barTitle(item)}`"
                           @click.stop="remove(index)"
                        />
                     </template>
                  </KThumbnail>
               </component>

               <div v-if="!mediaOnly" class="cms-tile-bar">
                  <KButton
                     v-if="!disabled"
                     data-cms-grip
                     :icon="cmsIcon('bars-2')"
                     size="xs"
                     variant="ghost"
                     tone="neutral"
                     :aria-label="`Reorder ${labelOf(item)}, Alt with the arrow keys moves it`"
                     tooltip="Drag to reorder"
                  />
                  <KTooltip :text="barTitle(item)">
                     <span class="cms-tile-name">{{ barLabel(item) }}</span>
                  </KTooltip>
                  <KTooltip v-if="hasMissingMedia(item)" text="Not found in the media library">
                     <span class="cms-block-missing-icon">
                        <KIcon name="exclamation-triangle" label="Not found in the media library" />
                     </span>
                  </KTooltip>
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
            </KCard>
         </template>

         <template #add>
            <CmsBlockPickerPopover
               v-if="
                  canAdd &&
                  !disabled &&
                  !mediaOnly &&
                  (Object.keys(blocks).length > 1 || presets.length)
               "
               v-model:open="pickerMenuOpen"
               :blocks="blocks"
               :paste-count="pasteCount"
               :presets="presets"
               @pick="add"
               @paste="paste(items.length, null)"
               @preset="insertPreset"
            >
               <KCard variant="dashed" as="button" icon="plus" title="Add" />
            </CmsBlockPickerPopover>
            <KCard
               v-else
               variant="dashed"
               as="button"
               icon="plus"
               :title="mediaOnly ? addMediaLabel : 'Add'"
               :disabled="!canAdd || disabled"
               :disabled-reason="disabled ? undefined : fullReason"
               @click="addFirst"
            />
         </template>
      </KTileGrid>

      <KFieldMessage v-if="countHint" tone="neutral" :icon="false" :message="countHint" />

      <div v-if="visual">
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
            :readonly="disabled"
            @update:state="onVisualUpdate"
         >
            <template #start>
               <KButton
                  icon="arrow-left"
                  size="sm"
                  variant="ghost"
                  tone="neutral"
                  aria-label="Back to the form"
                  @click="visualOpen = false"
               />
            </template>
            <template #actions>
               <KButton label="Done" size="sm" @click="visualOpen = false" />
            </template>
         </CmsVisualEditor>
      </KModal>

      <CmsPresetModal
         v-if="presetsEnabled"
         v-model:open="presetOpen"
         title="Save as preset"
         submit-label="Save preset"
         :hint="presetHint"
         :save="savePreset"
      />

      <KModal v-if="mediaOnly" v-model:open="pickerOpen" title="Media" size="lg">
         <CmsMediaGallery
            v-model:folder="pickerFolder"
            selectable
            :media-type="mediaOnly.field.mediaType"
            :accept="mediaOnly.field.accept"
            @select="addMedia"
         />
      </KModal>

      <KModal
         v-if="!nested"
         v-model:open="editorOpen"
         :title="editorTitle"
         :trail="editorTrail"
         :size="editorWide ? 'lg' : 'md'"
         @navigate="navigateEditor"
      >
         <CmsBlockEditorProvider :scope="editorScope">
            <CmsFormSections
               v-if="editorBlock"
               :key="editorKey"
               :layout="editorLayout"
               :shown="isEditorFieldShown"
            >
               <template #field="{ fieldKey: blockKey }">
                  <KFormField
                     :name="editorFieldName(blockKey)"
                     :label="editorBlock.fields[blockKey]!.label"
                     :description="editorBlock.fields[blockKey]!.description"
                     :icon="cmsIcon(fieldIcon(editorBlock.fields[blockKey]!))"
                     :required="editorBlock.fields[blockKey]!.required"
                  >
                     <CmsFieldInput
                        :model-value="editorItem?.[blockKey]"
                        :field="editorBlock.fields[blockKey]!"
                        :locale="locale"
                        :entry-name="entryName"
                        :field-key="
                           editorBlock.fields[blockKey]!.type === 'blocks' ? blockKey : undefined
                        "
                        @update:model-value="(value: unknown) => updateEditorField(blockKey, value)"
                     />
                  </KFormField>
               </template>
            </CmsFormSections>
         </CmsBlockEditorProvider>

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
                     :disabled="editorPosition === 0"
                     @click="moveCurrent(-1)"
                  />
                  <KButton
                     icon="chevron-right"
                     variant="soft"
                     tone="neutral"
                     aria-label="Move later"
                     :disabled="editorPosition === editorList.length - 1"
                     @click="moveCurrent(1)"
                  />
                  <KButton
                     label="Duplicate"
                     :icon="cmsIcon('document-duplicate')"
                     variant="soft"
                     tone="neutral"
                     :disabled="!editorCanAdd"
                     @click="duplicateCurrent"
                  />
                  <KButton
                     v-if="editorItem && !declaresHiddenField(editorBlock)"
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
import type { CmsBlockPath, FieldConfig } from '#nuxt-cms'
import {
   blockAt,
   blockFormLayout,
   blockListAt,
   blockListPath,
   blockPathIndex,
   blockSchemaPath,
   canAddBlock,
   formatBlockPath,
   parseBlockPath,
   insertBlocks,
   moveBlock,
   removeBlock,
   resolveBlockPath,
   updateBlockAt,
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
   Card as KCard,
   DropdownMenu as KDropdownMenu,
   FieldMessage as KFieldMessage,
   FormField as KFormField,
   Icon as KIcon,
   Modal as KModal,
   Stack as KStack,
   Thumbnail as KThumbnail,
   TileGrid as KTileGrid,
   Tooltip as KTooltip,
   useFieldControl,
   useFormContext,
   useRouteState,
} from '@xleddyl/443-components-vue'
import { computed, inject, nextTick, onMounted, ref, useState, watch } from '#imports'
import { copyNotice, pasteBlocks, pasteNotice, pasteableCount } from '../../../shared/clipboard'
import type { CmsPresetDetails } from '../../../shared/presets'
import { CMS_PRESET_ICON, presetInsertNotice } from '../../../shared/presets'
import type { CmsBlockValue, CmsClipboardAction } from '../../../shared/preview'
import { blockSummary, clipboardActionApplies, emptyBlock } from '../../../shared/preview'
import { useCmsClipboard } from '../../composables/cms-clipboard'
import { useCmsMediaKeys } from '../../composables/cms-media-keys'
import { useCmsPermissions } from '../../composables/cms-permissions'
import { useCmsPresets } from '../../composables/cms-presets'
import { useCmsRuntime } from '../../composables/cms-runtime'
import { useCmsOverlayFlag } from '../../composables/cms-route'
import type { CmsBlockEditorScope } from '../../utils/block-editor'
import { CMS_BLOCK_EDITOR, CmsBlockEditorProvider } from '../../utils/block-editor'
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

const parentEditor = inject(CMS_BLOCK_EDITOR, null)
const nested = computed(() => !!parentEditor && !!props.fieldKey)
const nestedListPath = computed<CmsBlockPath | null>(() =>
   parentEditor && props.fieldKey ? [...parentEditor.path.value, props.fieldKey] : null
)

const presetFieldKey = computed(() => {
   if (!nested.value) return props.fieldKey
   const schema = parentEditor?.schemaPath.value
   return schema && props.fieldKey ? [...schema, props.fieldKey].join('.') : undefined
})

const form = useFormContext()

const formPath = computed(() => {
   if (!nested.value) return props.fieldKey ?? null
   const base = parentEditor?.formPath.value
   return base && nestedListPath.value ? `${base}.${formatBlockPath(nestedListPath.value)}` : null
})

function tileInvalid(index: number) {
   const base = formPath.value
   if (!base || !form) return false
   const prefix = `${base}.${index}`
   return Object.entries(form.errors).some(
      ([key, message]) => !!message && (key === prefix || key.startsWith(`${prefix}.`))
   )
}

const blocks = computed(() => props.field.blocks ?? {})
const items = computed(() => (Array.isArray(model.value) ? model.value : []))

const canAdd = computed(() => canAddBlock(props.field, items.value.length))

const fullReason = computed(() => {
   const max = props.field.max ?? 0
   return canAdd.value ? undefined : `This field holds at most ${blockCount(max)}.`
})

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
      !nested.value &&
      !!props.entryName &&
      !!props.fieldKey &&
      !!list.length &&
      list.every((block) => typeof block.component === 'string' && !!block.component.trim())
   )
})

const visualOpen = useCmsOverlayFlag('visual', !!props.fieldKey, props.fieldKey)

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
   const block = blockOf(item)
   const hasNested = Object.values(block?.fields ?? {}).some((field) => field.type === 'blocks')
   return hasNested ? blockSummary(block, item as CmsBlockValue, locale, i18n.defaultLocale) : ''
}

function isHidden(item: Record<string, unknown>) {
   return isHiddenBlock(item)
}

function add(type: string) {
   const block = blocks.value[type]
   if (!block || !canAdd.value || disabled.value) return
   const index = items.value.length
   model.value = [...items.value, emptyBlock(type, block)]
   openEditor(index)
}

function onReorder(next: Record<string, unknown>[]) {
   if (!disabled.value) model.value = next
}

function onTileKey(event: KeyboardEvent) {
   if (!mediaOnly.value || disabled.value || event.altKey) return
   if (event.key !== 'Delete' && event.key !== 'Backspace') return
   const index = focusedTileIndex(event.target)
   if (index === null) return
   event.preventDefault()
   remove(index)
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

const ROOT = '_'

const localEditorPath = ref<CmsBlockPath | null>(null)
const editorRoute = useRouteState('editblock', { location: 'hash' })
const editorRouted = computed(() => !nested.value && !!props.fieldKey)

const editorPath = computed<CmsBlockPath | null>({
   get: () => {
      if (!editorRouted.value) return localEditorPath.value
      const path = parseBlockPath(editorRoute.value)
      return path && path[0] === props.fieldKey && path.length > 1 ? path.slice(1) : null
   },
   set: (path) => {
      if (!editorRouted.value) localEditorPath.value = path
      else editorRoute.value = path ? formatBlockPath([props.fieldKey!, ...path]) : undefined
   },
})

const rootFields = computed(() => ({ [ROOT]: props.field }))
const rootValues = computed(() => ({ [ROOT]: items.value }))

function fullPath(path: CmsBlockPath): CmsBlockPath {
   return [ROOT, ...path]
}

const editorLocation = computed(() =>
   editorPath.value
      ? resolveBlockPath(rootFields.value, rootValues.value, fullPath(editorPath.value))
      : null
)

const editorOpen = computed({
   get: () => editorPath.value !== null,
   set: (value: boolean) => {
      if (!value) editorPath.value = null
   },
})

const editorItem = computed(() => editorLocation.value?.item)

const editorBlock = computed(() => editorLocation.value?.block)

const editorPosition = computed(() => editorLocation.value?.index ?? -1)

const editorList = computed(() =>
   editorPath.value
      ? blockListAt(rootValues.value, blockListPath(fullPath(editorPath.value))) ?? []
      : []
)

const editorCanAdd = computed(() =>
   editorLocation.value
      ? canAddBlock(editorLocation.value.field, editorList.value.length)
      : canAdd.value
)

const editorKey = computed(() => (editorPath.value ? formatBlockPath(editorPath.value) : ''))

const editorLayout = computed(() =>
   editorBlock.value ? blockFormLayout(editorBlock.value) : { main: [] }
)

const editorWide = computed(
   () =>
      editorLayout.value.main.some((section) => section.rows.some((row) => row.length > 1)) ||
      Object.values(editorBlock.value?.fields ?? {}).some((field) => field.type === 'blocks')
)

function isEditorFieldShown(key: string) {
   const fields = editorBlock.value?.fields ?? {}
   const field = fields[key]
   return !!field && isFieldVisible(field, editorItem.value, fields)
}

function itemLabel(item: Record<string, unknown>, block: { label: string } | undefined) {
   return block?.label ?? String(item.type)
}

const editorTitle = computed(() =>
   editorItem.value ? itemLabel(editorItem.value, editorBlock.value) : ''
)

const editorAncestors = computed(() => {
   const path = editorPath.value
   if (!path) return []
   const ancestors: CmsBlockPath[] = []
   for (let end = 1; end < path.length - 1; end += 2) ancestors.push(path.slice(0, end))
   return ancestors
})

const editorTrail = computed(() =>
   editorAncestors.value.map((path) => {
      const location = resolveBlockPath(rootFields.value, rootValues.value, fullPath(path))
      return location ? itemLabel(location.item, location.block) : ''
   })
)

function navigateEditor(index: number) {
   const target = editorAncestors.value[index]
   if (target) editorPath.value = target
}

const editorScope: CmsBlockEditorScope = {
   path: computed(() => editorPath.value ?? []),
   schemaPath: computed(() => {
      if (!editorPath.value || !props.fieldKey) return null
      const schema = blockSchemaPath(rootFields.value, rootValues.value, fullPath(editorPath.value))
      const type = editorItem.value?.type
      return schema && type ? [props.fieldKey, ...schema.slice(1), String(type)] : null
   }),
   formPath: computed(() => (props.fieldKey && !nested.value ? props.fieldKey : null)),
   open: (path) => {
      editorPath.value = path
   },
}

watch(editorLocation, (location) => {
   if (location || !editorPath.value) return
   const path = editorPath.value
   void nextTick(() => {
      if (editorPath.value === path && !blockAt(rootValues.value, fullPath(path)))
         editorPath.value = null
   })
})

function editorFieldName(key: string) {
   const base = editorScope.formPath.value
   return base && editorPath.value
      ? `${base}.${formatBlockPath(editorPath.value)}.${key}`
      : undefined
}

function commitRoot(values: Record<string, unknown>) {
   const next = values[ROOT]
   const list = Array.isArray(next) ? (next as Record<string, unknown>[]) : []
   const previous = items.value
   if (list.length === previous.length) {
      list.forEach((item, index) => {
         const before = previous[index]
         if (before && item !== before && !uids.has(item)) uids.set(item, uidFor(before))
      })
   }
   model.value = list.length ? list : null
}

function openEditor(index: number) {
   if (nested.value && parentEditor && nestedListPath.value) {
      parentEditor.open([...nestedListPath.value, index])
      return
   }
   editorPath.value = [index]
}

function updateEditorField(key: string, value: unknown) {
   if (!editorPath.value || disabled.value) return
   commitRoot(
      updateBlockAt(rootValues.value, fullPath(editorPath.value), (item) => ({
         ...item,
         [key]: value,
      }))
   )
}

function leaveEditorItem() {
   const path = editorPath.value
   editorPath.value = path && path.length > 2 ? path.slice(0, -2) : null
}

function removeCurrent() {
   if (!editorPath.value || disabled.value) return
   const path = editorPath.value
   commitRoot(removeBlock(rootValues.value, fullPath(path)))
   leaveEditorItem()
}

function moveCurrent(delta: number) {
   const path = editorPath.value
   if (!path || disabled.value) return
   const index = blockPathIndex(path)
   const target = index + delta
   if (target < 0 || target >= editorList.value.length) return
   const full = fullPath(path)
   commitRoot(
      moveBlock(rootValues.value, full, blockListPath(full), delta > 0 ? target + 1 : target)
   )
   editorPath.value = [...path.slice(0, -1), target]
}

function toggleHiddenCurrent() {
   if (!editorPath.value || !editorItem.value || disabled.value) return
   commitRoot(
      updateBlockAt(rootValues.value, fullPath(editorPath.value), (current) => {
         const { hidden: _hidden, ...rest } = current
         return isHidden(current) ? rest : { ...rest, hidden: true }
      })
   )
}

function duplicateCurrent() {
   const path = editorPath.value
   const current = editorItem.value
   if (!path || !current || !editorCanAdd.value || disabled.value) return
   const copy = JSON.parse(JSON.stringify(current)) as Record<string, unknown>
   const full = fullPath(path)
   commitRoot(insertBlocks(rootValues.value, blockListPath(full), blockPathIndex(path) + 1, [copy]))
   leaveEditorItem()
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

function tileIndex(tile: HTMLElement | null | undefined) {
   const index = tile ? Number(tile.dataset.cmsTile) : NaN
   return Number.isInteger(index) ? index : null
}

function focusedTileIndex(target: EventTarget | null) {
   return target instanceof Element
      ? tileIndex(target.querySelector<HTMLElement>(':scope > * > [data-cms-tile]'))
      : null
}

function tileIndexOf(target: EventTarget | null) {
   if (!(target instanceof Element)) return null
   return tileIndex(target.closest<HTMLElement>('[data-cms-tile]')) ?? focusedTileIndex(target)
}

function onClipboard(event: ClipboardEvent) {
   if (event.defaultPrevented) return
   const action = event.type as CmsClipboardAction
   if (disabled.value && action !== 'copy') return
   const index = tileIndexOf(event.target)
   const target = { ...clipboardTarget(event, index !== null), interactive: false }
   if (!clipboardActionApplies(action, target)) return
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

const { can } = useCmsPermissions()

const presetsEnabled = computed(
   () =>
      !mediaOnly.value &&
      !disabled.value &&
      !!props.entryName &&
      !!presetFieldKey.value &&
      can(`${props.entryName}.update`)
)

const {
   presets: fieldPresets,
   load: loadPresets,
   create: createPreset,
} = useCmsPresets(
   () => (presetsEnabled.value ? props.entryName : undefined),
   () => presetFieldKey.value
)

const presets = computed(() => (presetsEnabled.value ? fieldPresets.value : []))

const pickerMenuOpen = ref(false)
const presetOpen = ref(false)
const presetItems = ref<CmsBlockValue[]>([])

const presetHint = computed(() => {
   const types = presetItems.value.map((item) => labelOf(item))
   return `A copy of ${types.join(
      ', '
   )}. Insert it from the block picker of any field with the same blocks.`
})

function openPresetSave(index: number) {
   const item = items.value[index]
   if (!item) return
   presetItems.value = [JSON.parse(JSON.stringify(item)) as CmsBlockValue]
   presetOpen.value = true
}

async function savePreset(details: CmsPresetDetails) {
   const preset = await createPreset({ ...details, items: presetItems.value })
   clipboard.notify({ title: `Preset "${preset.name}" saved`, color: 'success' })
}

function insertPreset(id: string) {
   const preset = presets.value.find((candidate) => candidate.id === id)
   if (!preset || !canAdd.value || disabled.value) return
   const result = pasteBlocks(
      items.value as CmsBlockValue[],
      items.value.length,
      preset.items,
      props.field,
      i18n
   )
   if (result.pasted) model.value = result.list
   clipboard.notify(presetInsertNotice(result, props.field, preset))
}

watch(pickerMenuOpen, (open) => {
   if (open) void loadPresets()
})

onMounted(() => {
   if (presetsEnabled.value) void loadPresets()
})

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
         ...(presetsEnabled.value
            ? [
                 {
                    label: 'Save as preset',
                    icon: cmsIcon(CMS_PRESET_ICON),
                    onSelect: () => openPresetSave(index),
                 },
              ]
            : []),
      ],
   ]
}
</script>
