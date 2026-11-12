<template>
   <KWorkspaceLayout
      ref="workspace"
      v-model:pane="pane"
      v-model:right-collapsed="inspectorCollapsed"
      storage-key="visual-editor"
      :left="leftPane"
      :main="{ label: 'Preview' }"
      :right="rightPane"
      panes-label="Editor panels"
   >
      <template #start="{ compact }">
         <slot name="start" />
         <KPageHeader
            size="sm"
            class="cms-editor-head"
            :title="title"
            :trail="compact ? undefined : trail"
            :level="1"
            truncate
         >
            <template v-if="$slots.status" #badge><slot name="status" /></template>
         </KPageHeader>
      </template>

      <template #center="{ compact }">
         <CmsLocaleSwitch
            v-if="i18n.locales.length > 1"
            v-model="locale"
            :progress="translations"
         />
         <KSegmentedControl
            v-model="device"
            :options="deviceOptions"
            size="sm"
            icon-only
            required
            aria-label="Preview width"
         />
         <CmsEditorHistory
            v-if="!readonly && compact"
            :can-undo="canUndo"
            :can-redo="canRedo"
            @undo="undo"
            @redo="redo"
         />
      </template>

      <template #end="{ compact }">
         <CmsEditorHistory
            v-if="!readonly && !compact"
            :can-undo="canUndo"
            :can-redo="canRedo"
            @undo="undo"
            @redo="redo"
         />
         <slot name="actions" :compact="compact" />
      </template>

      <template #left-header>
         <KPageHeader
            size="sm"
            class="cms-editor-head"
            :title="blocksField.label"
            :level="2"
            truncate
         >
            <template #badge>
               <KBadge size="sm" variant="outline" :label="blockCount" />
            </template>
         </KPageHeader>
      </template>

      <template #left>
         <div class="cms-editor-tree">
            <KFieldMessage v-if="blocksFieldError" :message="blocksFieldError" />
            <KFieldMessage v-else tone="warning" :message="form.warnings[fieldKey]" />
            <CmsBlockTree
               :items="blocks"
               :field="blocksField"
               :field-key="fieldKey"
               :locale="locale"
               :selected="selected"
               :highlighted="canvasHover"
               :errors="blockErrors"
               :can-add="canAddTo"
               :label="blocksField.label"
               :menu="blockMenu"
               :readonly="readonly"
               @select="selectFromTree"
               @move="move"
               @hover="highlight"
               @insert="openPalette"
            />
            <template v-if="blocks.length && !readonly">
               <KButton
                  v-if="canAdd"
                  :icon="cmsIcon('plus')"
                  label="Add a block"
                  size="sm"
                  variant="soft"
                  tone="neutral"
                  block
                  aria-haspopup="dialog"
                  @click="
                     (event: MouseEvent) =>
                        openPalette([fieldKey], blocks.length, event.currentTarget as HTMLElement)
                  "
               />
               <KFieldMessage v-else tone="neutral" :icon="false" :message="maxReached" />
            </template>
         </div>
      </template>

      <template #main-header="{ compact, collapsed, toggle }">
         <div class="cms-editor-canvas-bar">
            <KButton
               v-if="!compact"
               class="cms-editor-canvas-toggle"
               :icon="cmsIcon('queue-list')"
               size="sm"
               :variant="collapsed.left ? 'ghost' : 'soft'"
               tone="neutral"
               aria-label="Blocks panel"
               :tooltip="collapsed.left ? 'Show blocks' : 'Hide blocks'"
               :aria-pressed="!collapsed.left"
               @click="toggle('left')"
            />
            <div class="cms-editor-canvas-tools">
               <span v-if="canvasWidth" class="cms-editor-width" aria-live="polite">
                  {{ canvasWidth }} px
               </span>
               <KButton
                  :icon="cmsIcon('arrow-path')"
                  size="sm"
                  variant="ghost"
                  tone="neutral"
                  aria-label="Reload preview"
                  @click="reloadPreview"
               />
            </div>
            <KButton
               v-if="!compact"
               class="cms-editor-canvas-toggle is-end"
               :icon="cmsIcon('adjustments-horizontal')"
               size="sm"
               :variant="collapsed.right ? 'ghost' : 'soft'"
               tone="neutral"
               aria-label="Fields panel"
               :tooltip="collapsed.right ? 'Show fields' : 'Hide fields'"
               :aria-pressed="!collapsed.right"
               @click="toggle('right')"
            />
         </div>
      </template>

      <template #main="{ compact }">
         <div class="cms-editor-stage" :class="{ 'is-compact': compact }">
            <div
               ref="frameBox"
               class="cms-editor-frame"
               :class="{ 'is-fixed': deviceWidth !== null }"
               :style="deviceWidth === null ? undefined : { width: `${deviceWidth}px` }"
            >
               <iframe
                  ref="frame"
                  :src="previewPath"
                  title="Live preview"
                  class="cms-editor-iframe"
                  @load="sendState"
               />
            </div>
         </div>
      </template>

      <template v-if="selectedItem && selected" #right-header>
         <KPageHeader
            size="sm"
            class="cms-editor-head"
            :title="selectedBlock?.label ?? String(selectedItem.type)"
            :description="selectedSummary || selectedPosition"
            :icon="cmsIcon(selectedBlock?.icon ?? 'rectangle-stack')"
            :breadcrumbs="breadcrumbs"
            breadcrumbs-ancestors
            :level="2"
            truncate
         >
            <template v-if="isHiddenBlock(selectedItem)" #badge>
               <KBadge size="sm" label="Hidden" />
            </template>
            <template #actions>
               <KDropdownMenu :items="blockMenu(selected)" placement="bottom-end">
                  <KButton
                     :icon="cmsIcon('ellipsis-horizontal')"
                     size="sm"
                     variant="ghost"
                     tone="neutral"
                     aria-label="Block actions"
                  />
               </KDropdownMenu>
               <KTooltip text="Close" shortcut="escape">
                  <KButton
                     :icon="cmsIcon('x-mark')"
                     size="sm"
                     variant="ghost"
                     tone="neutral"
                     aria-label="Close the block"
                     @click="select(null)"
                  />
               </KTooltip>
            </template>
         </KPageHeader>
      </template>

      <template #right>
         <KForm
            as="div"
            :form="form"
            :alerts="false"
            :disabled="readonly"
            class="cms-editor-inspector"
         >
            <div v-if="selectedItem && selected" class="cms-editor-panel-body">
               <KFormAlerts />
               <KFieldMessage
                  v-if="form.errors[selectedName]"
                  :message="form.errors[selectedName]"
               />
               <KFieldMessage v-else tone="warning" :message="form.warnings[selectedName]" />
               <CmsFormSections
                  v-if="selectedBlock"
                  ref="sectionsRef"
                  :key="selectedKey"
                  :layout="selectedLayout"
                  :shown="isBlockFieldShown"
               >
                  <template #field="{ fieldKey: blockKey }">
                     <KFormField
                        :name="`${selectedName}.${blockKey}`"
                        :label="selectedBlock.fields[blockKey]!.label"
                        :description="selectedBlock.fields[blockKey]!.description"
                        :icon="cmsIcon(fieldIcon(selectedBlock.fields[blockKey]!))"
                        :required="selectedBlock.fields[blockKey]!.required"
                        :highlight="highlighted === blockKey"
                     >
                        <CmsNestedBlockList
                           v-if="selectedBlock.fields[blockKey]!.type === 'blocks'"
                           :field="selectedBlock.fields[blockKey]!"
                           :items="selectedItem[blockKey]"
                           :locale="locale"
                           :invalid="(index: number) => childInvalid(blockKey, index)"
                           :readonly="readonly"
                           @select="(index: number) => selectChild(blockKey, index)"
                           @insert="(anchor: HTMLElement) => insertChild(blockKey, anchor)"
                        />
                        <CmsFieldInput
                           v-else
                           :model-value="selectedItem[blockKey]"
                           :field="selectedBlock.fields[blockKey]!"
                           :locale="locale"
                           @update:model-value="
                              (value: unknown) => updateBlockField(blockKey, value)
                           "
                        />
                     </KFormField>
                  </template>
               </CmsFormSections>
            </div>

            <component
               :is="tabbed ? KTabs : 'div'"
               v-else-if="content"
               v-bind="tabsBinding"
               class="cms-editor-tabs"
            >
               <template #[panelSlot]>
                  <div class="cms-editor-panel-body">
                     <KFormAlerts />
                     <slot v-if="activeTab === 'content'" name="content-start" :locale="locale" />
                     <CmsFormSections
                        ref="sectionsRef"
                        :key="activeTab"
                        :layout="tabLayout"
                        :shown="isShown"
                     >
                        <template #field="{ fieldKey: key }">
                           <KFormField
                              :name="key"
                              :label="fields[key]!.label"
                              :description="fields[key]!.description"
                              :icon="cmsIcon(fieldIcon(fields[key]!))"
                              :required="fields[key]!.required"
                              :disabled="locked?.includes(key) || undefined"
                              :highlight="highlighted === key"
                           >
                              <CmsFieldInput
                                 :model-value="state[key]"
                                 :field="fields[key]!"
                                 :locale="locale"
                                 :slug-source="slugSource(fields[key]!)"
                                 :entry-name="entryName"
                                 :field-key="key"
                                 @update:model-value="(value: unknown) => setValue(key, value, key)"
                              />
                           </KFormField>
                        </template>
                     </CmsFormSections>
                  </div>
               </template>
            </component>

            <div v-else class="cms-editor-panel-body is-empty">
               <KFormAlerts />
               <KEmptyState
                  :icon="cmsIcon('cursor-arrow-rays')"
                  title="No block selected"
                  description="Pick a block in the list or in the preview to edit its fields."
                  variant="plain"
                  size="sm"
               />
            </div>
         </KForm>
      </template>
   </KWorkspaceLayout>

   <CmsBlockPickerPopover
      v-model:open="paletteOpen"
      :anchor="paletteAnchor"
      :blocks="pickerField?.blocks ?? {}"
      :disabled-reason="canAddTo(picker.list) ? undefined : maxReachedIn(picker.list)"
      :paste-count="pasteCount"
      :presets="presets"
      @pick="insertFromPalette"
      @paste="pasteFromPalette"
      @preset="insertPresetFromPalette"
   />

   <CmsPresetModal
      v-model:open="presetOpen"
      title="Save as preset"
      submit-label="Save preset"
      :hint="presetHint"
      :save="savePreset"
   />
</template>

<script setup lang="ts">
import type {
   CmsBlockPath,
   CmsConfig,
   CmsFormLayout,
   CmsInsertionPoint,
   FieldConfig,
   MediaItem,
} from '#nuxt-cms'
import {
   blockAt,
   blockFormLayout,
   blockListAt,
   blockListPath,
   blockPathIndex,
   blockSchemaPath,
   blocksFieldAt,
   canAddBlock,
   formatBlockPath,
   insertBlocks,
   isBlockListPath,
   isFieldVisible,
   isHiddenBlock,
   isTranslatableField,
   moveBlock,
   movedBlockPath,
   parentBlockPath,
   pathAfterInsert,
   pathAfterMove,
   pathAfterRemove,
   remapInsertionPoint,
   removeBlock,
   resolveBlockPath,
   slugSourceValue,
   updateBlockAt,
   updateBlockList,
} from '#nuxt-cms'
import type {
   BreadcrumbItem,
   FormIssuePath,
   MenuItems,
   OverlayAnchorTarget,
   OverlayVirtualAnchor,
   WorkspacePane,
   WorkspaceSideOptions,
} from '@xleddyl/443-components-vue'
import {
   Badge as KBadge,
   Breadcrumbs as KBreadcrumbs,
   Button as KButton,
   DropdownMenu as KDropdownMenu,
   EmptyState as KEmptyState,
   FieldMessage as KFieldMessage,
   Form as KForm,
   FormAlerts as KFormAlerts,
   FormField as KFormField,
   PageHeader as KPageHeader,
   SegmentedControl as KSegmentedControl,
   Tabs as KTabs,
   Tooltip as KTooltip,
   WorkspaceLayout as KWorkspaceLayout,
   useFieldHighlight,
   useForm,
   useTheme,
} from '@xleddyl/443-components-vue'
import {
   computed,
   nextTick,
   onBeforeUnmount,
   onMounted,
   ref,
   shallowRef,
   useTemplateRef,
   watch,
} from '#imports'
import cmsConfig from '#cms-config'
import type { CmsPreviewDevice } from '../../../shared/editor-layout'
import { CMS_EDITOR_PANES, CMS_PREVIEW_DEVICE_WIDTHS } from '../../../shared/editor-layout'
import type { CmsSearchFocus } from '../../../shared/search'
import { buildEntrySchema, entryValidationWarnings } from '../../../shared/validation'
import {
   clampInlineText,
   inlineFieldPath,
   inlineFieldValue,
   inlineTextLimit,
   isInlineTextField,
   lockedInlineFields,
   normalizeInlineText,
} from '../../../shared/inline-text'
import { copyNotice, pasteBlocks, pasteNotice, pasteableCount } from '../../../shared/clipboard'
import type { CmsPresetDetails } from '../../../shared/presets'
import { CMS_PRESET_ICON, presetInsertNotice } from '../../../shared/presets'
import type {
   CmsBlockValue,
   CmsClipboardAction,
   CmsEditorShortcut,
   CmsPreviewFrameMessage,
   CmsPreviewHostMessage,
   CmsPreviewState,
} from '../../../shared/preview'
import {
   DEFAULT_CMS_PREVIEW_PATH,
   blockErrorPaths,
   blockSummary,
   canHideBlock,
   canMoveBlock,
   clipboardActionApplies,
   collectMediaKeys,
   duplicateBlockAt,
   editorIssueKeys,
   editorShortcut,
   emptyBlock,
   firstBlockError,
   isTrustedPreviewEvent,
   parseFrameMessage,
   previewEnvelope,
   previewFieldConfig,
   previewMedia,
   shortcutApplies,
   toggleBlockHiddenAt,
} from '../../../shared/preview'
import { translationProgress } from '../../../shared/translations'
import { useCmsClipboard } from '../../composables/cms-clipboard'
import { useCmsHistory } from '../../composables/cms-history'
import { useCmsPermissions } from '../../composables/cms-permissions'
import { useCmsPresets } from '../../composables/cms-presets'
import { useCmsPageQuery } from '../../composables/cms-route'
import { useCmsRuntime } from '../../composables/cms-runtime'
import { entryFormLayout, useCmsSettingsState } from '../../composables/cms-settings'
import {
   clipboardTarget,
   isInForeignOverlay,
   onApplePlatform,
   shortcutTarget,
} from '../../utils/keyboard'
import type { CmsResponseIssue } from '../../utils/ui'
import { cmsIcon, fieldIcon } from '../../utils/ui'

type EntryTab = 'content' | 'seo'
type Values = Record<string, unknown>

const SEO_KEYS = ['seoTitle', 'seoDescription', 'seoImage', 'seoNoindex']

const deviceOptions: { value: CmsPreviewDevice; label: string; icon: string }[] = [
   { value: 'desktop', label: 'Desktop width', icon: cmsIcon('computer-desktop') },
   { value: 'tablet', label: 'Tablet width, 768 px', icon: cmsIcon('device-tablet') },
   { value: 'mobile', label: 'Mobile width, 390 px', icon: cmsIcon('device-phone-mobile') },
]

const props = defineProps<{
   entryName: string
   fieldKey: string
   fields: Record<string, FieldConfig>
   title: string
   content?: boolean
   focus?: CmsSearchFocus | null
   locked?: string[]
   readonly?: boolean
   tabQuery?: string
   trail?: BreadcrumbItem[]
}>()

const state = defineModel<Record<string, unknown>>('state', { required: true })

const emit = defineEmits<{ save: [] }>()

const runtime = useCmsRuntime()
const { i18n } = runtime
const previewPath = runtime.previewPath ?? DEFAULT_CMS_PREVIEW_PATH
const settings = useCmsSettingsState()
const workspace = useTemplateRef<InstanceType<typeof KWorkspaceLayout>>('workspace')

const locale = ref(i18n.defaultLocale)
const device = ref<CmsPreviewDevice>('desktop')
const pane = ref<WorkspacePane>('main')
const inspectorCollapsed = ref(false)
const selected = shallowRef<CmsBlockPath | null>(null)
const canvasHover = shallowRef<CmsBlockPath | null>(null)
const canvasWidth = ref<number | null>(null)
const paletteOpen = ref(false)
const picker = shallowRef<{ list: CmsBlockPath; index: number }>({
   list: [props.fieldKey],
   index: 0,
})
const paletteAnchor = shallowRef<OverlayAnchorTarget | null>(null)
const frame = ref<HTMLIFrameElement | null>(null)
const frameBox = ref<HTMLElement | null>(null)
const library = shallowRef(new Map<string, MediaItem>())

const deviceWidth = computed(() => CMS_PREVIEW_DEVICE_WIDTHS[device.value])

const blocksField = computed(() => props.fields[props.fieldKey]!)

const blocks = computed<CmsBlockValue[]>(() => {
   const value = state.value[props.fieldKey]
   return Array.isArray(value) ? (value as CmsBlockValue[]) : []
})

function inField(path: CmsBlockPath | null | undefined): path is CmsBlockPath {
   return !!path && path[0] === props.fieldKey
}

function listField(list: CmsBlockPath) {
   return inField(list) ? blocksFieldAt(props.fields, state.value, list) : null
}

function listLength(list: CmsBlockPath) {
   return blockListAt(state.value, list)?.length ?? 0
}

function canAddTo(list: CmsBlockPath) {
   const field = listField(list)
   return !!field && !props.readonly && canAddBlock(field, listLength(list))
}

function maxReachedIn(list: CmsBlockPath) {
   const max = listField(list)?.max ?? 0
   return `This field holds at most ${max} ${max === 1 ? 'block' : 'blocks'}.`
}

const canAdd = computed(() => canAddBlock(blocksField.value, blocks.value.length))

const blockCount = computed(() => {
   const max = blocksField.value.max
   return max === undefined ? String(blocks.value.length) : `${blocks.value.length} / ${max}`
})

const maxReached = computed(() => maxReachedIn([props.fieldKey]))

function locate(path: CmsBlockPath | null) {
   return inField(path) ? resolveBlockPath(props.fields, state.value, path) : null
}

const selectedLocation = computed(() => locate(selected.value))

const selectedItem = computed(() => selectedLocation.value?.item)

const selectedBlock = computed(() => selectedLocation.value?.block)

const selectedName = computed(() => (selected.value ? formatBlockPath(selected.value) : ''))

const selectedSummary = computed(() =>
   selectedItem.value
      ? blockSummary(selectedBlock.value, selectedItem.value, locale.value, i18n.defaultLocale)
      : ''
)

const selectedPosition = computed(() => {
   const path = selected.value
   if (!path) return ''
   return `Block ${blockPathIndex(path) + 1} of ${listLength(blockListPath(path))}`
})

function blockLabelAt(path: CmsBlockPath) {
   const location = locate(path)
   return location?.block?.label ?? String(location?.item.type ?? '')
}

const breadcrumbs = computed<BreadcrumbItem[]>(() => {
   const path = selected.value
   if (!path) return []
   const items: BreadcrumbItem[] = []
   for (let end = 2; end < path.length; end += 2) {
      const ancestor = path.slice(0, end)
      items.push({ label: blockLabelAt(ancestor), onClick: () => selectFromTree(ancestor) })
   }
   return items
})

const seoKeys = computed(() => SEO_KEYS.filter((key) => Object.hasOwn(props.fields, key)))

const tabList = computed(() => {
   const tabs: { id: EntryTab; label: string }[] = [{ id: 'content', label: 'Content' }]
   if (seoKeys.value.length) tabs.push({ id: 'seo', label: 'SEO' })
   return tabs
})

const localTab = ref<EntryTab>('content')

const routeTab = props.tabQuery ? useCmsPageQuery(props.tabQuery) : null

const activeTab = computed<EntryTab>({
   get: () => {
      const wanted = routeTab ? routeTab.value : localTab.value
      return tabList.value.some((tab) => tab.id === wanted) ? (wanted as EntryTab) : 'content'
   },
   set: (value) => {
      if (!routeTab) localTab.value = value
      else routeTab.value = value === 'content' ? '' : value
   },
})

const tabbed = computed(() => tabList.value.length > 1)

const panelSlot = computed(() => (tabbed.value ? 'panel' : 'default'))

function errorBadge(count: number) {
   return {
      badge: count || undefined,
      badgeTone: 'danger' as const,
      badgeLabel: count ? `${count} ${count === 1 ? 'error' : 'errors'}` : undefined,
   }
}

const tabsBinding = computed(() =>
   tabbed.value
      ? {
           items: tabList.value.map((tab) => ({
              value: tab.id,
              label: tab.label,
              ...errorBadge(tabErrorCount(tab.id)),
           })),
           label: 'Entry fields',
           modelValue: activeTab.value,
           panelFocusable: false,
           stretch: true,
           inset: true,
           fill: true,
           'onUpdate:modelValue': (value: string | number | undefined) => {
              activeTab.value = value === 'seo' ? 'seo' : 'content'
           },
        }
      : {}
)

const leftPane = computed<WorkspaceSideOptions>(() => ({
   label: 'Blocks',
   ...CMS_EDITOR_PANES.left,
   ...errorBadge(topLevelErrorCount.value + (blocksFieldError.value ? 1 : 0)),
}))

const rightPane = computed<WorkspaceSideOptions>(() => ({
   label: 'Fields',
   ...CMS_EDITOR_PANES.right,
   ...errorBadge(tabErrorCount('content') + tabErrorCount('seo')),
}))

const contentFields = computed(() =>
   Object.fromEntries(
      Object.entries(props.fields).filter(
         ([key]) => key !== props.fieldKey && !SEO_KEYS.includes(key)
      )
   )
)

const tabLayout = computed<CmsFormLayout>(() =>
   activeTab.value === 'seo'
      ? { main: [{ rows: seoKeys.value.map((key) => [key]) }] }
      : entryFormLayout(props.entryName, settings.value, contentFields.value)
)

function isShown(key: string) {
   const field = props.fields[key]
   return !!field && isFieldVisible(field, state.value, props.fields)
}

function isBlockFieldShown(key: string) {
   const fields = selectedBlock.value?.fields ?? {}
   const field = fields[key]
   return !!field && isFieldVisible(field, selectedItem.value, fields)
}

const selectedKey = computed(() =>
   selected.value ? `${selectedName.value}-${String(selectedItem.value?.type)}` : ''
)

const selectedLayout = computed<CmsFormLayout>(() =>
   selectedBlock.value ? blockFormLayout(selectedBlock.value) : { main: [] }
)

const sectionsRef = ref<{ reveal: (key: string) => void } | null>(null)

function expandSection(key: string) {
   void nextTick(() => sectionsRef.value?.reveal(key))
}

function revealInPanel(key: string) {
   void nextTick(() => {
      sectionsRef.value?.reveal(key)
      highlightField(key)
   })
}

const translations = computed(() => translationProgress(props.fields, state.value, i18n))

let ownBlocks: unknown = state.value[props.fieldKey]

const pendingPastes = new Set<CmsInsertionPoint>()

function setValue(key: string, value: unknown, coalesce?: string, hold = false) {
   if (props.readonly) return
   change(coalesce, hold)
   const next = { ...state.value, [key]: value }
   ownBlocks = next[props.fieldKey]
   state.value = next
}

function commitValues(next: Values, coalesce?: string, hold = false) {
   if (props.readonly || next === state.value) return false
   change(coalesce, hold)
   ownBlocks = next[props.fieldKey]
   state.value = next
   return true
}

function dropInsertionPoints() {
   paletteOpen.value = false
   picker.value = { list: [props.fieldKey], index: 0 }
   pendingPastes.clear()
}

function remapPaths(remap: (path: CmsBlockPath) => CmsBlockPath | null) {
   if (selected.value) selected.value = remap(selected.value)
   canvasHover.value = null
   const target = remapInsertionPoint(picker.value, remap)
   if (target) picker.value = target
   else {
      paletteOpen.value = false
      picker.value = { list: [props.fieldKey], index: 0 }
   }
   for (const point of [...pendingPastes]) {
      pendingPastes.delete(point)
      const next = remapInsertionPoint(point, remap)
      if (next) pendingPastes.add(Object.assign(point, next))
   }
}

function slugSource(field: FieldConfig) {
   if (!field.from) return undefined
   return slugSourceValue(props.fields[field.from], state.value[field.from], i18n.defaultLocale)
}

function select(path: CmsBlockPath | null) {
   selected.value = inField(path) ? path : null
}

function isCompact() {
   return !!workspace.value?.compact
}

function showPanel(name: 'left' | 'right') {
   workspace.value?.reveal(name)
}

function selectFromTree(path: CmsBlockPath) {
   select(locate(path) ? path : null)
   if (selected.value) post({ type: 'reveal', path: selected.value })
   if (isCompact()) pane.value = 'right'
}

function highlight(path: CmsBlockPath | null) {
   post({ type: 'highlight', path })
}

function insert(list: CmsBlockPath, index: number, type: string) {
   const field = listField(list)
   const block = field?.blocks?.[type]
   if (!block || !canAddTo(list)) return
   const at = Math.min(Math.max(index, 0), listLength(list))
   if (!commitValues(insertBlocks(state.value, list, at, [emptyBlock(type, block)]))) return
   remapPaths((path) => pathAfterInsert(path, list, at))
   select([...list, at])
}

function insertFromPalette(type: string) {
   paletteOpen.value = false
   insert(picker.value.list, picker.value.index, type)
}

function pasteFromPalette() {
   paletteOpen.value = false
   void paste(picker.value.list, picker.value.index, null)
}

function openPalette(list: CmsBlockPath, index: number, anchor: OverlayAnchorTarget | null = null) {
   if (props.readonly || !canAddTo(list)) return
   picker.value = { list, index }
   presetList.value = list
   paletteAnchor.value = anchor ?? canvasAnchor([...list, index]) ?? focusedElement() ?? frame.value
   paletteOpen.value = true
}

const pickerField = computed(() => listField(picker.value.list))

function insertButton(path: CmsBlockPath) {
   let element: HTMLElement | null = null
   try {
      element =
         frame.value?.contentDocument?.querySelector<HTMLElement>(
            `[data-cms-insert="${formatBlockPath(path)}"]`
         ) ?? null
   } catch {
      return null
   }
   return element?.getClientRects().length ? element : null
}

function canvasAnchor(path: CmsBlockPath): OverlayVirtualAnchor | null {
   const element = insertButton(path)
   const host = frame.value
   if (!element || !host) return null
   let last = new DOMRect()
   return {
      getBoundingClientRect() {
         if (!element.isConnected || !host.isConnected) return last
         const box = host.getBoundingClientRect()
         const rect = element.getBoundingClientRect()
         last = new DOMRect(
            box.left + host.clientLeft + rect.left,
            box.top + host.clientTop + rect.top,
            rect.width,
            rect.height
         )
         return last
      },
   }
}

function focusedElement() {
   const element = document.activeElement
   return element instanceof HTMLElement && element !== document.body ? element : null
}

function move(from: CmsBlockPath, toList: CmsBlockPath, toIndex: number) {
   if (!inField(from) || !inField(toList) || !isBlockListPath(toList)) return false
   if (!canMoveBlock(props.fields, state.value, from, toList)) return false
   if (!commitValues(moveBlock(state.value, from, toList, toIndex))) return false
   remapPaths((path) => pathAfterMove(path, from, toList, toIndex))
   return true
}

function moveBy(path: CmsBlockPath, delta: number) {
   const index = blockPathIndex(path)
   const target = index + delta
   if (target < 0 || target >= listLength(blockListPath(path))) return
   move(path, blockListPath(path), delta > 0 ? target + 1 : target)
}

function duplicate(path: CmsBlockPath) {
   const list = blockListPath(path)
   if (!canAddTo(list) || !commitValues(duplicateBlockAt(state.value, path))) return
   const at = blockPathIndex(path) + 1
   remapPaths((current) => pathAfterInsert(current, list, at))
   select([...list, at])
}

function toggleHidden(path: CmsBlockPath) {
   commitValues(toggleBlockHiddenAt(state.value, path, locate(path)?.block))
}

function remove(path: CmsBlockPath) {
   if (!locate(path) || !commitValues(removeBlock(state.value, path))) return
   remapPaths((current) => pathAfterRemove(current, path))
}

function selectChild(key: string, index: number) {
   if (selected.value) selectFromTree([...selected.value, key, index])
}

function insertChild(key: string, anchor: HTMLElement) {
   if (!selected.value) return
   const list = [...selected.value, key]
   openPalette(list, listLength(list), anchor)
}

function childInvalid(key: string, index: number) {
   return blockErrors.value.has(`${selectedName.value}.${key}.${index}`)
}

const clipboard = useCmsClipboard()

const PASTE_CANCELLED = {
   title: 'Nothing pasted',
   description: 'The blocks changed while the clipboard was read. Paste again.',
   color: 'error',
} as const

const pasteCount = computed(() =>
   pickerField.value ? pasteableCount(clipboard.items.value, pickerField.value) : 0
)

function copy(path: CmsBlockPath, event?: ClipboardEvent) {
   const item = locate(path)?.item
   if (!item) return
   clipboard.copy([item], event)
   clipboard.notify(copyNotice(1))
}

function cut(path: CmsBlockPath, event?: ClipboardEvent) {
   const item = locate(path)?.item
   if (!item || props.readonly) return
   clipboard.copy([item], event)
   remove(path)
   clipboard.notify(copyNotice(1, true))
}

function insertItems(list: CmsBlockPath, index: number, items: readonly CmsBlockValue[]) {
   const field = listField(list)
   if (!field) return null
   const current = (blockListAt(state.value, list) ?? []) as CmsBlockValue[]
   const result = pasteBlocks(current, index, items, field, i18n)
   if (result.pasted && commitValues(updateBlockList(state.value, list, () => result.list))) {
      remapPaths((path) => pathAfterInsert(path, list, result.at, result.pasted))
      select([...list, result.at])
      if (selected.value) post({ type: 'reveal', path: selected.value })
   }
   return result
}

async function paste(list: CmsBlockPath, index: number, text?: string | null) {
   if (props.readonly || !listField(list)) return
   const point: CmsInsertionPoint = { list, index }
   pendingPastes.add(point)
   let cancelled = false
   let items: CmsBlockValue[] | null
   try {
      items = await clipboard.read(text)
   } finally {
      cancelled = !pendingPastes.delete(point)
   }
   const field = listField(point.list)
   if (cancelled || !field) {
      clipboard.notify(PASTE_CANCELLED)
      return
   }
   const result = items ? insertItems(point.list, point.index, items) : null
   clipboard.notify(pasteNotice(result, field))
}

const { can } = useCmsPermissions()

const presetsAllowed = computed(() => !props.readonly && can(`${props.entryName}.update`))

const presetList = shallowRef<CmsBlockPath>([props.fieldKey])

const presetFieldKey = computed(() => {
   const list = presetList.value
   return inField(list) ? blockSchemaPath(props.fields, state.value, list)?.join('.') : undefined
})

const {
   presets,
   load: loadPresets,
   create: createPreset,
} = useCmsPresets(
   () => (presetsAllowed.value ? props.entryName : undefined),
   () => presetFieldKey.value
)

const presetOpen = ref(false)
const presetItems = ref<CmsBlockValue[]>([])
const presetField = shallowRef<FieldConfig | null>(null)

const presetHint = computed(() => {
   const types = presetItems.value.map(
      (item) => presetField.value?.blocks?.[String(item.type)]?.label ?? String(item.type)
   )
   return `A copy of ${types.join(
      ', '
   )}. Insert it from the block picker of any field with the same blocks.`
})

function openPresetSave(path: CmsBlockPath) {
   const location = locate(path)
   if (!location) return
   presetList.value = blockListPath(path)
   presetField.value = location.field
   presetItems.value = [JSON.parse(JSON.stringify(location.item)) as CmsBlockValue]
   presetOpen.value = true
}

async function savePreset(details: CmsPresetDetails) {
   const preset = await createPreset({ ...details, items: presetItems.value })
   clipboard.notify({ title: `Preset "${preset.name}" saved`, color: 'success' })
}

function insertPresetFromPalette(id: string) {
   paletteOpen.value = false
   const preset = presets.value.find((candidate) => candidate.id === id)
   const { list, index } = picker.value
   const field = listField(list)
   if (!preset || !field || !canAddTo(list)) return
   const result = insertItems(list, index, preset.items)
   if (result) clipboard.notify(presetInsertNotice(result, field, preset))
}

watch(paletteOpen, (open) => {
   if (open) void loadPresets()
})

function selectedPath() {
   return selected.value && locate(selected.value) ? selected.value : null
}

function after(path: CmsBlockPath | null): [CmsBlockPath, number] {
   return path
      ? [blockListPath(path), blockPathIndex(path) + 1]
      : [[props.fieldKey], blocks.value.length]
}

function onClipboard(event: ClipboardEvent) {
   if (event.defaultPrevented || paletteOpen.value) return
   if (isInForeignOverlay(event.target, workspaceElement())) return
   const action = event.type as CmsClipboardAction
   if (props.readonly && action !== 'copy') return
   const path = selectedPath()
   if (!clipboardActionApplies(action, clipboardTarget(event, path !== null))) return
   if (action === 'paste') {
      event.preventDefault()
      void paste(...after(path), event.clipboardData?.getData('text/plain') ?? null)
   } else if (path) {
      if (action === 'copy') copy(path, event)
      else cut(path, event)
   }
}

function copyMenuItem(path: CmsBlockPath) {
   return {
      label: 'Copy',
      icon: cmsIcon('clipboard-document'),
      shortcut: 'mod+c',
      onSelect: () => copy(path),
   }
}

function nestedLists(path: CmsBlockPath) {
   const location = locate(path)
   const fields = location?.block?.fields ?? {}
   return Object.entries(fields)
      .filter(
         ([, field]) => field.type === 'blocks' && isFieldVisible(field, location!.item, fields)
      )
      .map(([key, field]) => ({ key, label: field.label, list: [...path, key] }))
}

function blockMenu(path: CmsBlockPath): MenuItems {
   const location = locate(path)
   if (!location) return []
   if (props.readonly) return [[copyMenuItem(path)]]
   const list = blockListPath(path)
   const index = blockPathIndex(path)
   const full = canAddTo(list) ? undefined : maxReachedIn(list)
   const hidden = isHiddenBlock(location.item)
   const length = listLength(list)
   return [
      [
         {
            label: 'Add a block before',
            icon: cmsIcon('bars-arrow-up'),
            disabled: !!full,
            disabledReason: full,
            onSelect: () => openPalette(list, index),
         },
         {
            label: 'Add a block after',
            icon: cmsIcon('bars-arrow-down'),
            disabled: !!full,
            disabledReason: full,
            onSelect: () => openPalette(list, index + 1),
         },
         ...nestedLists(path).map((nested) => {
            const reason = canAddTo(nested.list) ? undefined : maxReachedIn(nested.list)
            return {
               label: `Add to ${nested.label}`,
               icon: cmsIcon('plus'),
               disabled: !!reason,
               disabledReason: reason,
               onSelect: () => openPalette(nested.list, listLength(nested.list)),
            }
         }),
      ],
      [
         {
            label: 'Move up',
            icon: cmsIcon('arrow-up'),
            disabled: index === 0,
            onSelect: () => moveBy(path, -1),
         },
         {
            label: 'Move down',
            icon: cmsIcon('arrow-down'),
            disabled: index === length - 1,
            onSelect: () => moveBy(path, 1),
         },
         {
            label: 'Duplicate',
            icon: cmsIcon('document-duplicate'),
            disabled: !!full,
            disabledReason: full,
            onSelect: () => duplicate(path),
         },
         ...(canHideBlock(location.block)
            ? [
                 {
                    label: hidden ? 'Show' : 'Hide',
                    icon: cmsIcon(hidden ? 'eye' : 'eye-slash'),
                    onSelect: () => toggleHidden(path),
                 },
              ]
            : []),
      ],
      [
         copyMenuItem(path),
         {
            label: 'Cut',
            icon: cmsIcon('scissors'),
            shortcut: 'mod+x',
            onSelect: () => cut(path),
         },
         {
            label: 'Paste after',
            icon: cmsIcon('clipboard'),
            shortcut: 'mod+v',
            disabled: !!full,
            disabledReason: full,
            onSelect: () => void paste(list, index + 1),
         },
         ...(presetsAllowed.value
            ? [
                 {
                    label: 'Save as preset',
                    icon: cmsIcon(CMS_PRESET_ICON),
                    onSelect: () => openPresetSave(path),
                 },
              ]
            : []),
      ],
      [
         {
            label: 'Delete',
            icon: cmsIcon('trash'),
            tone: 'danger' as const,
            onSelect: () => remove(path),
         },
      ],
   ]
}

function updateBlockField(key: string, value: unknown) {
   const path = selectedPath()
   if (!path) return
   commitValues(
      updateBlockAt(state.value, path, (item) => ({ ...item, [key]: value })),
      `${formatBlockPath(path)}.${key}`
   )
}

const { canUndo, canRedo, change, release, undo, redo } = useCmsHistory<CmsBlockPath | null>({
   state: () => state.value,
   selected: () => selected.value,
   restore: (values, path) => {
      state.value = values
      select(path)
   },
   omit: props.content ? ['status'] : [],
})

function runShortcut(event: KeyboardEvent) {
   if (event.defaultPrevented || event.isComposing || paletteOpen.value) return
   if (isInForeignOverlay(event.target, workspaceElement())) return
   const action = editorShortcut(event, onApplePlatform())
   const path = selectedPath()
   if (!action || !shortcutApplies(action, shortcutTarget(event, path !== null))) return
   if (props.readonly && action !== 'deselect') return
   event.preventDefault()
   if (action === 'undo') undo()
   else if (action === 'redo') redo()
   else if (action === 'save') emit('save')
   else if (path) runBlockShortcut(action, path)
}

function runBlockShortcut(action: CmsEditorShortcut, path: CmsBlockPath) {
   const list = blockListPath(path)
   const index = blockPathIndex(path)
   switch (action) {
      case 'remove':
         remove(path)
         break
      case 'duplicate':
         duplicate(path)
         break
      case 'move-up':
      case 'move-down':
         moveBy(path, action === 'move-up' ? -1 : 1)
         break
      case 'insert-after':
         openPalette(list, index + 1)
         break
      case 'insert-before':
         openPalette(list, index)
         break
      case 'deselect':
         select(parentBlockPath(path))
         break
   }
}

const media = computed(() =>
   Object.fromEntries(
      collectMediaKeys(props.fields, state.value).map((key) => [
         key,
         previewMedia(key, library.value.get(key), runtime.mediaBaseUrl),
      ])
   )
)

const blocksFields = computed(() => ({ [props.fieldKey]: blocksField.value }))

const { resolved: adminTheme } = useTheme()

const previewState = computed<CmsPreviewState>(() => ({
   entry: props.entryName,
   field: props.fieldKey,
   locale: locale.value,
   blocks: blocks.value,
   item: props.content ? state.value : null,
   media: media.value,
   selected: selected.value,
   editable: !props.readonly,
   theme: adminTheme.value,
   lockedFields: lockedInlineFields({
      fields: props.content ? props.fields : null,
      values: state.value,
      blocksFields: blocksFields.value,
      blocksValues: state.value,
      locked: props.locked,
   }),
}))

const READONLY_FRAME_MESSAGES = new Set(['ready', 'select', 'hover', 'copy', 'focus-field'])

function post(message: CmsPreviewHostMessage) {
   const target = frame.value?.contentWindow
   if (!target) return
   const plain = JSON.parse(JSON.stringify(message)) as CmsPreviewHostMessage
   target.postMessage(previewEnvelope(plain), window.location.origin)
}

function sendState() {
   post({ type: 'render', state: previewState.value })
}

watch(previewState, sendState, { deep: true })

function reloadPreview() {
   canvasHover.value = null
   frame.value?.contentWindow?.location.reload()
}

function onFrameMessage(message: CmsPreviewFrameMessage) {
   if (props.readonly && !READONLY_FRAME_MESSAGES.has(message.type)) return
   switch (message.type) {
      case 'ready':
         sendState()
         break
      case 'select':
         paletteOpen.value = false
         select(locate(message.path) ? message.path : null)
         break
      case 'hover':
         canvasHover.value = inField(message.path) ? message.path : null
         break
      case 'insert':
         if (inField(message.path))
            openPalette(
               blockListPath(message.path),
               blockPathIndex(message.path),
               insertButton(message.path)
            )
         break
      case 'move': {
         const list = blockListPath(message.to)
         const index = blockPathIndex(message.to)
         const target = movedBlockPath(message.from, list, index)
         if (move(message.from, list, index) && target) select(target)
         break
      }
      case 'duplicate':
         if (inField(message.path)) duplicate(message.path)
         break
      case 'toggle-hidden':
         if (inField(message.path)) toggleHidden(message.path)
         break
      case 'remove':
         if (inField(message.path)) remove(message.path)
         break
      case 'copy':
         if (inField(message.path)) copy(message.path)
         break
      case 'cut':
         if (inField(message.path)) cut(message.path)
         break
      case 'paste':
         if (inField(message.path))
            void paste(
               blockListPath(message.path),
               blockPathIndex(message.path),
               message.text ?? null
            )
         break
      case 'focus-field':
         focusField(message.path, message.key)
         break
      case 'field-input':
         inlineInput(message)
         break
      case 'undo':
         undo()
         break
      case 'redo':
         redo()
         break
      case 'save':
         emit('save')
         break
   }
}

function onMessage(event: MessageEvent) {
   if (!isTrustedPreviewEvent(event, window.location.origin, frame.value?.contentWindow)) return
   const message = parseFrameMessage(event.data)
   if (message) onFrameMessage(message)
}

async function loadLibrary() {
   try {
      const result = await $fetch<{ items: MediaItem[] }>('/api/cms/admin/media')
      library.value = new Map(result.items.map((item) => [item.key, item]))
   } catch {
      library.value = new Map()
   }
}

const { highlighted, highlight: highlightField } = useFieldHighlight()

function workspaceElement() {
   const element: unknown = workspace.value?.$el
   return element instanceof Element ? element : null
}

function revealBlock(path: CmsBlockPath | null) {
   select(path)
   if (!selected.value) {
      showPanel('left')
      return
   }
   showPanel('right')
   post({ type: 'reveal', path: selected.value })
}

function revealField(key: string) {
   select(null)
   activeTab.value = tabOfKey(key) === 'seo' ? 'seo' : 'content'
   showPanel('right')
}

function fieldAt(path: CmsBlockPath | null, key: string) {
   if (path && !inField(path)) return undefined
   return previewFieldConfig(
      { path, key },
      blocksFields.value,
      state.value,
      props.content ? props.fields : null,
      props.fieldKey
   )
}

function focusField(path: CmsBlockPath | null, key: string) {
   if (!fieldAt(path, key)) return
   select(path)
   if (!path) activeTab.value = tabOfKey(key) === 'seo' ? 'seo' : 'content'
   if (!isCompact()) inspectorCollapsed.value = false
   revealInPanel(key)
}

function inlineInput(message: Extract<CmsPreviewFrameMessage, { type: 'field-input' }>) {
   if (!applyInlineInput(message)) sendState()
}

function applyInlineInput(message: Extract<CmsPreviewFrameMessage, { type: 'field-input' }>) {
   const { path, key, locale: code } = message
   const declared = fieldAt(path, key)
   if (props.readonly || !isInlineTextField(declared)) return false
   if (previewState.value.lockedFields.includes(inlineFieldPath(path, key))) return false
   const localized = isTranslatableField(declared) && i18n.locales.length > 0
   if (localized && !i18n.locales.includes(code)) return false
   const field = localized ? declared : { ...declared, translatable: false }
   const item = path ? blockAt(state.value, path) : null
   if (path && !item) return false
   const text = clampInlineText(
      normalizeInlineText(message.value, !!field.textarea),
      inlineTextLimit(field)
   )
   const value = inlineFieldValue(
      field,
      item ? item[key] : state.value[key],
      code,
      i18n.defaultLocale,
      text
   )
   const coalesce = `inline:${path ? formatBlockPath(path) : ''}.${key}`
   if (!path) setValue(key, value, coalesce, true)
   else
      commitValues(
         updateBlockAt(state.value, path, (current) => ({ ...current, [key]: value })),
         coalesce,
         true
      )
   if (message.commit) void nextTick(release)
   return true
}

function applyFocus(focus: CmsSearchFocus) {
   if (focus.locale && i18n.locales.includes(focus.locale)) locale.value = focus.locale
   const key = focus.field
   if (!key || !Object.hasOwn(props.fields, key)) return
   if (key === props.fieldKey) {
      const path = focus.blockPath ?? (focus.block != null ? [key, focus.block] : null)
      revealBlock(locate(path) ? path : null)
      return
   }
   revealField(key)
   revealInPanel(key)
}

let frameObserver: ResizeObserver | null = null

onMounted(() => {
   window.addEventListener('message', onMessage)
   document.addEventListener('keydown', runShortcut)
   document.addEventListener('copy', onClipboard)
   document.addEventListener('cut', onClipboard)
   document.addEventListener('paste', onClipboard)
   frameObserver = new ResizeObserver(([entry]) => {
      canvasWidth.value = entry ? Math.round(entry.contentRect.width) : null
   })
   watch(
      frameBox,
      (element, previous) => {
         if (previous) frameObserver?.unobserve(previous)
         if (element) frameObserver?.observe(element)
      },
      { immediate: true }
   )
   void loadLibrary()
   void loadPresets()
   if (props.focus) applyFocus(props.focus)
})

onBeforeUnmount(() => {
   window.removeEventListener('message', onMessage)
   document.removeEventListener('keydown', runShortcut)
   document.removeEventListener('copy', onClipboard)
   document.removeEventListener('cut', onClipboard)
   document.removeEventListener('paste', onClipboard)
   frameObserver?.disconnect()
})

const validateHook = computed(() =>
   props.content ? (cmsConfig as CmsConfig)[props.entryName]?.validate : undefined
)

const schema = computed(() =>
   buildEntrySchema(
      {
         fields: props.fields,
         drafts: props.content,
         validate: validateHook.value,
         config: cmsConfig as CmsConfig,
      },
      i18n
   )
)

function issueKey(path: FormIssuePath): string[] {
   return editorIssueKeys(props.fields, state.value, path, props.fieldKey)
}

const form = useForm({
   values: state,
   validator: schema,
   warnings: (values) =>
      entryValidationWarnings({ fields: props.fields, validate: validateHook.value }, values, i18n),
   issueKey,
})

const blockErrors = computed(() => blockErrorPaths(form.errors, props.fieldKey))

const topLevelErrorCount = computed(
   () => [...blockErrors.value].filter((path) => path.split('.').length === 2).length
)

const blocksFieldError = computed(() =>
   blockErrors.value.size ? undefined : form.errors[props.fieldKey]
)

function tabOfKey(key: string) {
   if (key === props.fieldKey) return 'blocks'
   return SEO_KEYS.includes(key) ? 'seo' : 'content'
}

function tabErrorCount(tab: string) {
   const keys = new Set(
      Object.keys(form.errors)
         .filter((key) => form.errors[key])
         .map((key) => key.split('.')[0]!)
         .filter((key) => tabOfKey(key) === tab)
   )
   return keys.size
}

function revealFirstError() {
   const keys = Object.keys(form.errors).filter((key) => form.errors[key])
   const name = Object.keys(props.fields).find((field) =>
      keys.some((key) => key === field || key.startsWith(`${field}.`))
   )
   if (!name) return
   const field = props.fields[name]
   if (name === props.fieldKey) {
      const first = firstBlockError(form.errors, props.fieldKey)
      revealBlock(first?.path ?? null)
      if (first?.key) revealInPanel(first.key)
   } else if (field) {
      revealField(name)
      expandSection(name)
      if (isTranslatableField(field)) locale.value = i18n.defaultLocale
   }
}

function validate(): boolean {
   form.submitCount.value++
   if (form.validateSync()) return true
   revealFirstError()
   return false
}

function setIssues(issues: CmsResponseIssue[]) {
   const fieldIssues = issues.filter((issue) => issue.path.length)
   if (!fieldIssues.length) return
   form.setIssues(fieldIssues)
   revealFirstError()
}

watch(state, (values) => {
   if (values[props.fieldKey] !== ownBlocks) {
      ownBlocks = values[props.fieldKey]
      dropInsertionPoints()
   }
   if (selected.value && !blockAt(values, selected.value)) selected.value = null
})

function applyChange(values: Record<string, unknown>) {
   if (props.readonly) return
   change()
   state.value = values
}

defineExpose({ validate, setIssues, applyChange, locale })
</script>
