<template>
   <div ref="root" class="cms-editor" :class="{ 'is-compact': compact, 'is-resizing': resizing }">
      <header class="cms-editor-bar">
         <div class="cms-editor-bar-start">
            <slot name="start" />
            <div class="cms-editor-heading">
               <span class="cms-editor-title" :title="title">{{ title }}</span>
               <slot name="status" />
            </div>
         </div>
         <div class="cms-editor-bar-center">
            <CmsLocaleSwitch
               v-if="i18n.locales.length > 1"
               v-model="locale"
               :progress="translations"
            />
         </div>
         <div class="cms-editor-bar-end">
            <KTooltip text="Undo" shortcut="mod+z">
               <KButton
                  :icon="cmsIcon('arrow-uturn-left')"
                  size="sm"
                  variant="ghost"
                  tone="neutral"
                  aria-label="Undo"
                  :disabled="!canUndo"
                  @click="undo"
               />
            </KTooltip>
            <KTooltip text="Redo" shortcut="mod+shift+z">
               <KButton
                  :icon="cmsIcon('arrow-uturn-right')"
                  size="sm"
                  variant="ghost"
                  tone="neutral"
                  aria-label="Redo"
                  :disabled="!canRedo"
                  @click="redo"
               />
            </KTooltip>
            <slot name="actions" />
         </div>
      </header>

      <KTabs
         v-if="compact"
         v-model="pane"
         :items="paneItems"
         :controls="bodyId"
         label="Editor panels"
         size="sm"
         fill
         inset
         class="cms-editor-panes"
      />

      <div :id="bodyId" class="cms-editor-body" :role="compact ? 'tabpanel' : undefined">
         <aside
            v-if="compact || !layout.tree.collapsed"
            class="cms-editor-side is-tree"
            :class="{ 'is-active': pane === 'blocks' }"
            :style="compact ? undefined : { width: `${layout.tree.width}px` }"
            :aria-label="blocksField.label"
         >
            <div class="cms-editor-side-head">
               <span class="cms-editor-side-title">{{ blocksField.label }}</span>
               <span class="cms-editor-side-count">{{ blockCount }}</span>
            </div>
            <div class="cms-editor-side-body">
               <KFieldMessage v-if="blocksFieldError" :message="blocksFieldError" />
               <KFieldMessage v-else tone="warning" :message="form.warnings[fieldKey]" />
               <CmsBlockTree
                  :items="blocks"
                  :field="blocksField"
                  :locale="locale"
                  :selected="selected"
                  :highlighted="canvasHover"
                  :errors="blockErrors"
                  :can-add="canAdd"
                  :label="blocksField.label"
                  :menu="blockMenu"
                  @select="selectFromTree"
                  @move="move"
                  @hover="highlight"
                  @insert="openPalette"
               />
            </div>
            <div v-if="blocks.length" class="cms-editor-side-foot">
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
                        openPalette(blocks.length, event.currentTarget as HTMLElement)
                  "
               />
               <p v-else class="cms-field-hint">{{ maxReached }}</p>
            </div>
         </aside>

         <CmsEditorResizer
            v-if="!compact && !layout.tree.collapsed"
            v-model:width="layout.tree.width"
            v-model:dragging="resizing"
            :limits="CMS_EDITOR_PANEL_LIMITS.tree"
            label="Resize the blocks panel"
            grows="right"
         />

         <div class="cms-editor-canvas" :class="{ 'is-active': pane === 'preview' }">
            <div class="cms-editor-canvas-bar">
               <div class="cms-editor-canvas-side">
                  <KButton
                     v-if="!compact"
                     :icon="cmsIcon('queue-list')"
                     size="sm"
                     :variant="layout.tree.collapsed ? 'ghost' : 'soft'"
                     tone="neutral"
                     aria-label="Blocks panel"
                     :tooltip="layout.tree.collapsed ? 'Show blocks' : 'Hide blocks'"
                     :aria-pressed="!layout.tree.collapsed"
                     @click="layout.tree.collapsed = !layout.tree.collapsed"
                  />
               </div>
               <div class="cms-editor-canvas-tools">
                  <KSegmentedControl
                     v-model="device"
                     :options="deviceOptions"
                     size="sm"
                     icon-only
                     aria-label="Preview width"
                  />
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
               <div class="cms-editor-canvas-side is-end">
                  <KButton
                     v-if="!compact"
                     :icon="cmsIcon('adjustments-horizontal')"
                     size="sm"
                     :variant="layout.inspector.collapsed ? 'ghost' : 'soft'"
                     tone="neutral"
                     aria-label="Fields panel"
                     :tooltip="layout.inspector.collapsed ? 'Show fields' : 'Hide fields'"
                     :aria-pressed="!layout.inspector.collapsed"
                     @click="layout.inspector.collapsed = !layout.inspector.collapsed"
                  />
               </div>
            </div>
            <div class="cms-editor-stage">
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
         </div>

         <CmsEditorResizer
            v-if="!compact && !layout.inspector.collapsed"
            v-model:width="layout.inspector.width"
            v-model:dragging="resizing"
            :limits="CMS_EDITOR_PANEL_LIMITS.inspector"
            label="Resize the fields panel"
            grows="left"
         />

         <aside
            v-if="compact || !layout.inspector.collapsed"
            class="cms-editor-side is-inspector"
            :class="{ 'is-active': pane === 'fields' }"
            :style="compact ? undefined : { width: `${layout.inspector.width}px` }"
            aria-label="Fields"
         >
            <KForm
               as="div"
               :form="form"
               :alerts="false"
               :disabled="readonly"
               class="cms-editor-inspector"
            >
               <template v-if="selectedItem && selected !== null">
                  <div class="cms-editor-block-head">
                     <span class="cms-editor-block-icon" aria-hidden="true">
                        <KIcon :name="cmsIcon(selectedBlock?.icon ?? 'rectangle-stack')" />
                     </span>
                     <div class="cms-editor-block-heading">
                        <span class="cms-editor-block-title">
                           <span class="cms-editor-block-label">
                              {{ selectedBlock?.label ?? selectedItem.type }}
                           </span>
                           <KBadge v-if="isHiddenBlock(selectedItem)" size="sm" label="Hidden" />
                        </span>
                        <span class="cms-editor-block-subtitle">
                           {{ selectedSummary || `Block ${selected + 1} of ${blocks.length}` }}
                        </span>
                     </div>
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
                  </div>
                  <div ref="panelBody" class="cms-editor-panel-body">
                     <KFormAlerts />
                     <KFieldMessage
                        v-if="form.errors[`${fieldKey}.${selected}`]"
                        :message="form.errors[`${fieldKey}.${selected}`]"
                     />
                     <KFieldMessage
                        v-else
                        tone="warning"
                        :message="form.warnings[`${fieldKey}.${selected}`]"
                     />
                     <CmsFormSections
                        v-if="selectedBlock"
                        ref="sectionsRef"
                        :key="selectedKey"
                        :layout="selectedLayout"
                        :shown="isBlockFieldShown"
                     >
                        <template #field="{ fieldKey: blockKey }">
                           <KFormField
                              :name="`${fieldKey}.${selected}.${blockKey}`"
                              :label="selectedBlock.fields[blockKey]!.label"
                              :description="selectedBlock.fields[blockKey]!.description"
                              :icon="cmsIcon(fieldIcon(selectedBlock.fields[blockKey]!))"
                              :required="selectedBlock.fields[blockKey]!.required"
                              :data-cms-field="blockKey"
                              :class="{ 'cms-search-focus': highlighted === blockKey }"
                           >
                              <CmsFieldInput
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
               </template>

               <component
                  :is="tabbed ? KTabs : 'div'"
                  v-else-if="content"
                  v-bind="tabsBinding"
                  class="cms-editor-tabs"
               >
                  <template #[panelSlot]>
                     <div ref="panelBody" class="cms-editor-panel-body">
                        <KFormAlerts />
                        <slot
                           v-if="activeTab === 'content'"
                           name="content-start"
                           :locale="locale"
                        />
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
                                 :data-cms-field="key"
                                 :class="{ 'cms-search-focus': highlighted === key }"
                              >
                                 <CmsFieldInput
                                    :model-value="state[key]"
                                    :field="fields[key]!"
                                    :locale="locale"
                                    :slug-source="slugSource(fields[key]!)"
                                    :entry-name="entryName"
                                    :field-key="key"
                                    @update:model-value="
                                       (value: unknown) => setValue(key, value, key)
                                    "
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
         </aside>
      </div>

      <CmsBlockPickerPopover
         v-model:open="paletteOpen"
         :anchor="paletteAnchor"
         :blocks="blocksField.blocks ?? {}"
         :disabled-reason="canAdd ? undefined : maxReached"
         :paste-count="pasteCount"
         @pick="insertFromPalette"
         @paste="pasteFromPalette"
      />
   </div>
</template>

<script setup lang="ts">
import type { CmsConfig, CmsFormLayout, FieldConfig, MediaItem } from '#nuxt-cms'
import {
   blockFormLayout,
   canAddBlock,
   isFieldVisible,
   isHiddenBlock,
   isTranslatableField,
   slugSourceValue,
} from '#nuxt-cms'
import type {
   FormIssuePath,
   MenuItems,
   OverlayAnchorTarget,
   OverlayVirtualAnchor,
} from '@xleddyl/443-components-vue'
import {
   Badge as KBadge,
   Button as KButton,
   DropdownMenu as KDropdownMenu,
   EmptyState as KEmptyState,
   FieldMessage as KFieldMessage,
   Form as KForm,
   FormAlerts as KFormAlerts,
   FormField as KFormField,
   Icon as KIcon,
   SegmentedControl as KSegmentedControl,
   Tabs as KTabs,
   Tooltip as KTooltip,
   useForm,
} from '@xleddyl/443-components-vue'
import {
   computed,
   nextTick,
   onBeforeUnmount,
   onMounted,
   ref,
   shallowRef,
   useId,
   watch,
} from '#imports'
import cmsConfig from '#cms-config'
import type { CmsPreviewDevice } from '../../../shared/editor-layout'
import { CMS_EDITOR_PANEL_LIMITS, CMS_PREVIEW_DEVICE_WIDTHS } from '../../../shared/editor-layout'
import type { CmsSearchFocus } from '../../../shared/search'
import { buildEntrySchema, entryValidationWarnings } from '../../../shared/validation'
import {
   inlineFieldValue,
   isInlineTextField,
   normalizeInlineText,
} from '../../../shared/inline-text'
import { copyNotice, pasteBlocks, pasteNotice, pasteableCount } from '../../../shared/clipboard'
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
   blockErrorIndexes,
   blockSummary,
   canHideBlock,
   clipboardActionApplies,
   collectMediaKeys,
   duplicateBlock,
   editorShortcut,
   emptyBlock,
   insertBlock,
   isTrustedPreviewEvent,
   moveBlock,
   parseFrameMessage,
   previewEnvelope,
   previewFieldConfig,
   previewMedia,
   removeBlock,
   selectionAfterMove,
   selectionAfterRemove,
   shortcutApplies,
   toggleBlockHidden,
} from '../../../shared/preview'
import { translationProgress } from '../../../shared/translations'
import { useCmsClipboard } from '../../composables/cms-clipboard'
import { useCmsEditorLayout } from '../../composables/cms-editor-layout'
import { useCmsFieldFocus } from '../../composables/cms-field-focus'
import { useCmsHistory } from '../../composables/cms-history'
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

type EditorPane = 'blocks' | 'preview' | 'fields'
type EntryTab = 'content' | 'seo'

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
}>()

const state = defineModel<Record<string, unknown>>('state', { required: true })

const emit = defineEmits<{ save: [] }>()

const runtime = useCmsRuntime()
const { i18n } = runtime
const previewPath = runtime.previewPath ?? DEFAULT_CMS_PREVIEW_PATH
const settings = useCmsSettingsState()
const { layout, compact, resizing } = useCmsEditorLayout()
const bodyId = `${useId()}-body`

const locale = ref(i18n.defaultLocale)
const device = ref<CmsPreviewDevice>('desktop')
const pane = ref<EditorPane>('preview')
const selected = ref<number | null>(null)
const canvasHover = ref<number | null>(null)
const canvasWidth = ref<number | null>(null)
const paletteOpen = ref(false)
const paletteIndex = ref(0)
const paletteAnchor = shallowRef<OverlayAnchorTarget | null>(null)
const frame = ref<HTMLIFrameElement | null>(null)
const frameBox = ref<HTMLElement | null>(null)
const panelBody = ref<HTMLElement | null>(null)
const root = ref<HTMLElement | null>(null)
const library = shallowRef(new Map<string, MediaItem>())

const deviceWidth = computed(() => CMS_PREVIEW_DEVICE_WIDTHS[device.value])

const blocksField = computed(() => props.fields[props.fieldKey]!)

const blocks = computed<CmsBlockValue[]>(() => {
   const value = state.value[props.fieldKey]
   return Array.isArray(value) ? (value as CmsBlockValue[]) : []
})

const canAdd = computed(() => canAddBlock(blocksField.value, blocks.value.length))

const blockCount = computed(() => {
   const max = blocksField.value.max
   return max === undefined ? String(blocks.value.length) : `${blocks.value.length} / ${max}`
})

const maxReached = computed(() => {
   const max = blocksField.value.max ?? 0
   return `This field holds at most ${max} ${max === 1 ? 'block' : 'blocks'}.`
})

const selectedItem = computed(() =>
   selected.value === null ? undefined : blocks.value[selected.value]
)

const selectedBlock = computed(() =>
   selectedItem.value ? blocksField.value.blocks?.[String(selectedItem.value.type)] : undefined
)

const selectedSummary = computed(() =>
   selectedItem.value
      ? blockSummary(selectedBlock.value, selectedItem.value, locale.value, i18n.defaultLocale)
      : ''
)

const seoKeys = computed(() => SEO_KEYS.filter((key) => Object.hasOwn(props.fields, key)))

const activeTab = ref<EntryTab>('content')

const tabList = computed(() => {
   const tabs: { id: EntryTab; label: string }[] = [{ id: 'content', label: 'Content' }]
   if (seoKeys.value.length) tabs.push({ id: 'seo', label: 'SEO' })
   return tabs
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

const paneItems = computed(() => [
   {
      value: 'blocks',
      label: 'Blocks',
      ...errorBadge(blockErrors.value.size + (blocksFieldError.value ? 1 : 0)),
   },
   { value: 'preview', label: 'Preview' },
   {
      value: 'fields',
      label: 'Fields',
      ...errorBadge(tabErrorCount('content') + tabErrorCount('seo')),
   },
])

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
   selected.value === null ? '' : `${selected.value}-${String(selectedItem.value?.type)}`
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
      reveal(() => panelBody.value, key)
   })
}

const translations = computed(() => translationProgress(props.fields, state.value, i18n))

function setValue(key: string, value: unknown, coalesce?: string, hold = false) {
   change(coalesce, hold)
   state.value = { ...state.value, [key]: value }
}

function setBlocks(list: CmsBlockValue[]) {
   setValue(props.fieldKey, list.length ? list : null)
}

function slugSource(field: FieldConfig) {
   if (!field.from) return undefined
   return slugSourceValue(props.fields[field.from], state.value[field.from], i18n.defaultLocale)
}

function select(index: number | null) {
   selected.value = index
}

function showPanel(name: 'tree' | 'inspector') {
   if (compact.value) pane.value = name === 'tree' ? 'blocks' : 'fields'
   else layout.value[name].collapsed = false
}

function selectFromTree(index: number) {
   select(index)
   post({ type: 'reveal', index })
   if (compact.value) pane.value = 'fields'
}

function highlight(index: number | null) {
   post({ type: 'highlight', index })
}

function blockConfigAt(index: number) {
   return blocksField.value.blocks?.[String(blocks.value[index]?.type)]
}

function insert(index: number, type: string) {
   const block = blocksField.value.blocks?.[type]
   if (!block || !canAdd.value) return
   const at = Math.min(Math.max(index, 0), blocks.value.length)
   setBlocks(insertBlock(blocks.value, at, emptyBlock(type, block)))
   select(at)
}

function insertFromPalette(type: string) {
   paletteOpen.value = false
   insert(paletteIndex.value, type)
}

function pasteFromPalette() {
   paletteOpen.value = false
   void paste(paletteIndex.value, null)
}

function openPalette(index: number, anchor: OverlayAnchorTarget | null = null) {
   if (!canAdd.value) return
   paletteIndex.value = index
   paletteAnchor.value = anchor ?? canvasAnchor(index) ?? focusedElement() ?? frame.value
   paletteOpen.value = true
}

function insertButton(index: number) {
   let element: HTMLElement | null = null
   try {
      element =
         frame.value?.contentDocument?.querySelector<HTMLElement>(`[data-cms-insert="${index}"]`) ??
         null
   } catch {
      return null
   }
   return element?.getClientRects().length ? element : null
}

function canvasAnchor(index: number): OverlayVirtualAnchor | null {
   const element = insertButton(index)
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

function move(from: number, to: number) {
   if (to < 0 || to >= blocks.value.length || from === to) return
   setBlocks(moveBlock(blocks.value, from, to))
   selected.value = selectionAfterMove(selected.value, from, to)
}

function moveSelected(delta: number) {
   if (selected.value === null) return
   move(selected.value, selected.value + delta)
}

function duplicate(index: number) {
   if (!canAdd.value) return
   setBlocks(duplicateBlock(blocks.value, index))
   select(index + 1)
}

function toggleHidden(index: number) {
   setBlocks(toggleBlockHidden(blocks.value, index, blockConfigAt(index)))
}

function remove(index: number) {
   if (!blocks.value[index]) return
   setBlocks(removeBlock(blocks.value, index))
   selected.value = selectionAfterRemove(selected.value, index)
}

const clipboard = useCmsClipboard()

const pasteCount = computed(() => pasteableCount(clipboard.items.value, blocksField.value))

function copy(index: number, event?: ClipboardEvent) {
   const item = blocks.value[index]
   if (!item) return
   clipboard.copy([item], event)
   clipboard.notify(copyNotice(1))
}

function cut(index: number, event?: ClipboardEvent) {
   const item = blocks.value[index]
   if (!item) return
   clipboard.copy([item], event)
   remove(index)
   clipboard.notify(copyNotice(1, true))
}

async function paste(index: number, text?: string | null) {
   const items = await clipboard.read(text)
   const result = items ? pasteBlocks(blocks.value, index, items, blocksField.value, i18n) : null
   if (result?.pasted) {
      setBlocks(result.list)
      select(result.at)
      post({ type: 'reveal', index: result.at })
   }
   clipboard.notify(pasteNotice(result, blocksField.value))
}

function onClipboard(event: ClipboardEvent) {
   if (event.defaultPrevented || paletteOpen.value) return
   if (isInForeignOverlay(event.target, root.value)) return
   const action = event.type as CmsClipboardAction
   const index = selected.value
   if (!clipboardActionApplies(action, clipboardTarget(event, index !== null))) return
   if (action === 'paste') {
      event.preventDefault()
      void paste(
         index === null ? blocks.value.length : index + 1,
         event.clipboardData?.getData('text/plain') ?? null
      )
   } else if (index !== null) {
      if (action === 'copy') copy(index, event)
      else cut(index, event)
   }
}

function blockMenu(index: number): MenuItems {
   const item = blocks.value[index]
   if (!item) return []
   const full = canAdd.value ? undefined : maxReached.value
   const hidden = isHiddenBlock(item)
   return [
      [
         {
            label: 'Add a block before',
            icon: cmsIcon('bars-arrow-up'),
            disabled: !!full,
            disabledReason: full,
            onSelect: () => openPalette(index),
         },
         {
            label: 'Add a block after',
            icon: cmsIcon('bars-arrow-down'),
            disabled: !!full,
            disabledReason: full,
            onSelect: () => openPalette(index + 1),
         },
      ],
      [
         {
            label: 'Move up',
            icon: cmsIcon('arrow-up'),
            disabled: index === 0,
            onSelect: () => move(index, index - 1),
         },
         {
            label: 'Move down',
            icon: cmsIcon('arrow-down'),
            disabled: index === blocks.value.length - 1,
            onSelect: () => move(index, index + 1),
         },
         {
            label: 'Duplicate',
            icon: cmsIcon('document-duplicate'),
            disabled: !!full,
            disabledReason: full,
            onSelect: () => duplicate(index),
         },
         ...(canHideBlock(blockConfigAt(index))
            ? [
                 {
                    label: hidden ? 'Show' : 'Hide',
                    icon: cmsIcon(hidden ? 'eye' : 'eye-slash'),
                    onSelect: () => toggleHidden(index),
                 },
              ]
            : []),
      ],
      [
         {
            label: 'Copy',
            icon: cmsIcon('clipboard-document'),
            shortcut: 'mod+c',
            onSelect: () => copy(index),
         },
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
            label: 'Delete',
            icon: cmsIcon('trash'),
            tone: 'danger' as const,
            onSelect: () => remove(index),
         },
      ],
   ]
}

function updateBlockField(key: string, value: unknown) {
   const index = selected.value
   const current = index === null ? undefined : blocks.value[index]
   if (index === null || !current) return
   const list = blocks.value.map((item, i) => (i === index ? { ...current, [key]: value } : item))
   setValue(props.fieldKey, list.length ? list : null, `${props.fieldKey}.${index}.${key}`)
}

const { canUndo, canRedo, change, release, undo, redo } = useCmsHistory({
   state: () => state.value,
   selected: () => selected.value,
   restore: (values, index) => {
      state.value = values
      if (index !== selected.value) select(index)
   },
   omit: props.content ? ['status'] : [],
})

function runShortcut(event: KeyboardEvent) {
   if (event.defaultPrevented || event.isComposing || paletteOpen.value) return
   if (isInForeignOverlay(event.target, root.value)) return
   const action = editorShortcut(event, onApplePlatform())
   const index = selected.value
   if (!action || !shortcutApplies(action, shortcutTarget(event, index !== null))) return
   event.preventDefault()
   if (action === 'undo') undo()
   else if (action === 'redo') redo()
   else if (action === 'save') emit('save')
   else if (index !== null) runBlockShortcut(action, index)
}

function runBlockShortcut(action: CmsEditorShortcut, index: number) {
   switch (action) {
      case 'remove':
         remove(index)
         break
      case 'duplicate':
         duplicate(index)
         break
      case 'move-up':
      case 'move-down':
         moveSelected(action === 'move-up' ? -1 : 1)
         break
      case 'insert-after':
         openPalette(index + 1)
         break
      case 'insert-before':
         openPalette(index)
         break
      case 'deselect':
         select(null)
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

const previewState = computed<CmsPreviewState>(() => ({
   entry: props.entryName,
   field: props.fieldKey,
   locale: locale.value,
   blocks: blocks.value,
   item: props.content ? state.value : null,
   media: media.value,
   selected: selected.value,
   editable: !props.readonly,
}))

function post(message: CmsPreviewHostMessage) {
   const target = frame.value?.contentWindow
   if (!target) return
   target.postMessage(previewEnvelope(message), window.location.origin)
}

function sendState() {
   const snapshot = JSON.parse(JSON.stringify(previewState.value)) as CmsPreviewState
   post({ type: 'render', state: snapshot })
}

watch(previewState, sendState, { deep: true })

function reloadPreview() {
   canvasHover.value = null
   frame.value?.contentWindow?.location.reload()
}

function onFrameMessage(message: CmsPreviewFrameMessage) {
   switch (message.type) {
      case 'ready':
         sendState()
         break
      case 'select':
         paletteOpen.value = false
         select(message.index)
         break
      case 'hover':
         canvasHover.value = message.index
         break
      case 'insert':
         openPalette(message.index, insertButton(message.index))
         break
      case 'move':
         move(message.from, message.to)
         select(message.to)
         break
      case 'duplicate':
         duplicate(message.index)
         break
      case 'toggle-hidden':
         toggleHidden(message.index)
         break
      case 'remove':
         remove(message.index)
         break
      case 'copy':
         copy(message.index)
         break
      case 'cut':
         cut(message.index)
         break
      case 'paste':
         void paste(message.index, message.text ?? null)
         break
      case 'focus-field':
         focusField(message.index, message.key)
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

const { highlighted, reveal } = useCmsFieldFocus()

function revealBlock(index: number | null) {
   select(index)
   if (index === null) {
      showPanel('tree')
      return
   }
   showPanel('inspector')
   post({ type: 'reveal', index })
}

function revealField(key: string) {
   select(null)
   activeTab.value = tabOfKey(key) === 'seo' ? 'seo' : 'content'
   showPanel('inspector')
}

function fieldAt(index: number | null, key: string) {
   return previewFieldConfig(
      { index, key, blockType: index === null ? null : String(blocks.value[index]?.type) },
      blocksField.value,
      props.content ? props.fields : null,
      props.fieldKey
   )
}

function focusField(index: number | null, key: string) {
   if (index !== null && index >= blocks.value.length) return
   if (!fieldAt(index, key)) return
   select(index)
   if (index === null) activeTab.value = tabOfKey(key) === 'seo' ? 'seo' : 'content'
   if (!compact.value) layout.value.inspector.collapsed = false
   revealInPanel(key)
}

function inlineInput(message: Extract<CmsPreviewFrameMessage, { type: 'field-input' }>) {
   const { index, key, locale: code } = message
   const field = fieldAt(index, key)
   if (props.readonly || !isInlineTextField(field)) return
   if (isTranslatableField(field) && !i18n.locales.includes(code)) return
   const item = index === null ? undefined : blocks.value[index]
   const text = normalizeInlineText(message.value, !!field.textarea)
   const value = inlineFieldValue(
      field,
      item ? item[key] : state.value[key],
      code,
      i18n.defaultLocale,
      text
   )
   const coalesce = `inline:${index ?? ''}.${key}`
   if (!item) setValue(key, value, coalesce, true)
   else
      setValue(
         props.fieldKey,
         blocks.value.map((current, i) => (i === index ? { ...item, [key]: value } : current)),
         coalesce,
         true
      )
   if (message.commit) void nextTick(release)
}

function applyFocus(focus: CmsSearchFocus) {
   if (focus.locale && i18n.locales.includes(focus.locale)) locale.value = focus.locale
   const key = focus.field
   if (!key || !Object.hasOwn(props.fields, key)) return
   if (key === props.fieldKey) {
      const index = focus.block != null && focus.block < blocks.value.length ? focus.block : null
      revealBlock(index)
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
   const [key, index, blockKey] = path
   const keys = [String(key)]
   if (String(key) === props.fieldKey && typeof index === 'number')
      keys.push(
         blockKey === undefined
            ? `${String(key)}.${index}`
            : `${String(key)}.${index}.${String(blockKey)}`
      )
   return keys
}

const form = useForm({
   values: state,
   validator: schema,
   warnings: (values) =>
      entryValidationWarnings({ fields: props.fields, validate: validateHook.value }, values, i18n),
   issueKey,
})

const blockErrors = computed(() => blockErrorIndexes(form.errors, props.fieldKey))

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

function firstError() {
   const keys = Object.keys(form.errors).filter((key) => form.errors[key])
   const name = Object.keys(props.fields).find((field) =>
      keys.some((key) => key === field || key.startsWith(`${field}.`))
   )
   if (!name) return undefined
   const indexes = keys
      .filter((key) => key.startsWith(`${name}.`))
      .map((key) => Number(key.split('.')[1]))
      .filter(Number.isInteger)
   const index = indexes.length ? Math.min(...indexes) : null
   const blockKey = keys
      .find((key) => index !== null && key.startsWith(`${name}.${index}.`))
      ?.split('.')[2]
   return { name, index, blockKey }
}

function revealFirstError() {
   const first = firstError()
   if (!first) return
   const field = props.fields[first.name]
   if (first.name === props.fieldKey) {
      revealBlock(first.index)
      if (first.blockKey) expandSection(first.blockKey)
   } else if (field) {
      revealField(first.name)
      expandSection(first.name)
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

watch(
   () => blocks.value.length,
   (length) => {
      if (selected.value !== null && selected.value >= length) selected.value = null
   }
)

defineExpose({ validate, setIssues, locale })
</script>
