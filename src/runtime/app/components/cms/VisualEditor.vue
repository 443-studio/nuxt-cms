<template>
   <div class="cms-editor">
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
               :value="localeFilled"
            />
            <KSegmentedControl
               v-model="device"
               :options="deviceOptions"
               size="sm"
               icon-only
               aria-label="Preview width"
            />
         </div>
         <div class="cms-editor-bar-end">
            <slot name="actions" />
         </div>
      </header>

      <div class="cms-editor-body">
         <div class="cms-editor-canvas">
            <div class="cms-editor-frame" :class="`is-${device}`">
               <iframe
                  ref="frame"
                  :src="previewPath"
                  title="Live preview"
                  class="cms-editor-iframe"
                  @load="sendState"
               />
            </div>
         </div>

         <aside class="cms-editor-panel" aria-label="Inspector">
            <component
               :is="tabbed ? KTabs : 'div'"
               v-bind="tabsBinding"
               class="cms-editor-inspector"
            >
               <template #[panelSlot]>
                  <KForm ref="panel" as="div" :form="form" class="cms-editor-panel-body">
                     <template v-if="activeTab === 'block'">
                        <template v-if="selectedItem && selected !== null">
                           <div class="cms-editor-block-head">
                              <KButton
                                 icon="arrow-left"
                                 size="sm"
                                 variant="ghost"
                                 tone="neutral"
                                 label="All blocks"
                                 @click="select(null)"
                              />
                              <span class="cms-editor-block-position k-mono">
                                 {{ selected + 1 }} / {{ blocks.length }}
                              </span>
                           </div>
                           <div class="cms-editor-block-title">
                              <KIcon :name="cmsIcon(selectedBlock?.icon ?? 'rectangle-stack')" />
                              <span>{{ selectedBlock?.label ?? selectedItem.type }}</span>
                              <KBadge v-if="isHiddenBlock(selectedItem)" size="sm" label="Hidden" />
                           </div>
                           <KStack direction="row" gap="sm" wrap class="cms-editor-block-actions">
                              <KButton
                                 icon="arrow-up"
                                 size="sm"
                                 variant="soft"
                                 tone="neutral"
                                 aria-label="Move up"
                                 title="Move up"
                                 :disabled="selected === 0"
                                 @click="moveSelected(-1)"
                              />
                              <KButton
                                 icon="arrow-down"
                                 size="sm"
                                 variant="soft"
                                 tone="neutral"
                                 aria-label="Move down"
                                 title="Move down"
                                 :disabled="selected === blocks.length - 1"
                                 @click="moveSelected(1)"
                              />
                              <KButton
                                 :icon="cmsIcon('document-duplicate')"
                                 size="sm"
                                 variant="soft"
                                 tone="neutral"
                                 label="Duplicate"
                                 :disabled="!canAdd"
                                 @click="duplicate(selected)"
                              />
                              <KButton
                                 v-if="canHideBlock(selectedBlock)"
                                 :icon="cmsIcon(isHiddenBlock(selectedItem) ? 'eye' : 'eye-slash')"
                                 size="sm"
                                 variant="soft"
                                 tone="neutral"
                                 :label="isHiddenBlock(selectedItem) ? 'Show' : 'Hide'"
                                 @click="toggleHidden(selected)"
                              />
                              <KButton
                                 icon="trash"
                                 size="sm"
                                 variant="soft"
                                 tone="danger"
                                 aria-label="Delete block"
                                 title="Delete"
                                 @click="remove(selected)"
                              />
                           </KStack>
                           <KFieldMessage
                              v-if="form.errors[`${fieldKey}.${selected}`]"
                              :message="form.errors[`${fieldKey}.${selected}`]"
                           />
                           <KFieldMessage
                              v-else
                              tone="warning"
                              :message="form.warnings[`${fieldKey}.${selected}`]"
                           />
                           <KStack gap="md" class="cms-editor-fields">
                              <KFormField
                                 v-for="(blockField, blockKey) in selectedBlock?.fields ?? {}"
                                 :key="`${selected}-${blockKey}`"
                                 :name="`${fieldKey}.${selected}.${blockKey}`"
                                 :label="blockField.label"
                                 :description="blockField.description"
                                 :icon="cmsIcon(fieldIcon(blockField))"
                                 :required="blockField.required"
                              >
                                 <CmsFieldInput
                                    :model-value="selectedItem[blockKey]"
                                    :field="blockField"
                                    :locale="locale"
                                    @update:model-value="
                                       (value: unknown) => updateBlockField(String(blockKey), value)
                                    "
                                 />
                              </KFormField>
                           </KStack>
                        </template>

                        <template v-else>
                           <KFieldMessage
                              v-if="form.errors[fieldKey]"
                              :message="form.errors[fieldKey]"
                           />
                           <KFieldMessage
                              v-else
                              tone="warning"
                              :message="form.warnings[fieldKey]"
                           />
                           <KStack v-if="blocks.length" gap="sm">
                              <span class="k-label">{{ blocksField.label }}</span>
                              <CmsBlockOutline
                                 :items="blocks"
                                 :field="blocksField"
                                 :locale="locale"
                                 :selected="selected"
                                 @select="select"
                                 @move="move"
                              />
                           </KStack>
                           <KStack v-if="canAdd" gap="sm">
                              <span class="k-label">Add a block</span>
                              <CmsBlockPalette
                                 :blocks="blocksField.blocks ?? {}"
                                 @pick="(type: string) => insert(blocks.length, type)"
                              />
                           </KStack>
                           <p v-else class="cms-field-hint">{{ maxReached }}</p>
                        </template>
                     </template>

                     <KStack v-else gap="md" class="cms-editor-fields">
                        <template v-for="section in sections" :key="section.id">
                           <div v-if="section.title" class="cms-editor-section-title">
                              <span class="k-label">{{ section.title }}</span>
                              <span v-if="section.description" class="cms-field-hint">
                                 {{ section.description }}
                              </span>
                           </div>
                           <KFormField
                              v-for="key in section.keys"
                              :key="key"
                              :name="key"
                              :label="fields[key]!.label"
                              :description="fields[key]!.description"
                              :icon="cmsIcon(fieldIcon(fields[key]!))"
                              :required="fields[key]!.required"
                              :data-cms-field="key"
                              :class="{ 'cms-search-focus': highlighted === key }"
                           >
                              <CmsFieldInput
                                 :model-value="state[key]"
                                 :field="fields[key]!"
                                 :locale="locale"
                                 :slug-source="slugSource(fields[key]!)"
                                 @update:model-value="(value: unknown) => setValue(key, value)"
                              />
                           </KFormField>
                        </template>
                     </KStack>
                  </KForm>
               </template>
            </component>
         </aside>
      </div>

      <KModal v-model:open="paletteOpen" title="Insert a block">
         <CmsBlockPalette :blocks="blocksField.blocks ?? {}" @pick="insertFromPalette" />
      </KModal>
   </div>
</template>

<script setup lang="ts">
import type { CmsConfig, FieldConfig, MediaItem } from '#nuxt-cms'
import {
   canAddBlock,
   isFieldVisible,
   isHiddenBlock,
   isTranslatableField,
   slugSourceValue,
} from '#nuxt-cms'
import type { FormIssuePath } from '@xleddyl/443-components-vue'
import {
   Badge as KBadge,
   Button as KButton,
   FieldMessage as KFieldMessage,
   Form as KForm,
   FormField as KFormField,
   Icon as KIcon,
   Modal as KModal,
   SegmentedControl as KSegmentedControl,
   Stack as KStack,
   Tabs as KTabs,
   useForm,
} from '@xleddyl/443-components-vue'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from '#imports'
import cmsConfig from '#cms-config'
import type { CmsSearchFocus } from '../../../shared/search'
import { buildEntrySchema, entryValidationWarnings } from '../../../shared/validation'
import type {
   CmsBlockValue,
   CmsPreviewFrameMessage,
   CmsPreviewState,
} from '../../../shared/preview'
import {
   DEFAULT_CMS_PREVIEW_PATH,
   canHideBlock,
   collectMediaKeys,
   duplicateBlock,
   emptyBlock,
   insertBlock,
   isTrustedPreviewEvent,
   moveBlock,
   parseFrameMessage,
   previewEnvelope,
   previewMedia,
   removeBlock,
   selectionAfterMove,
   selectionAfterRemove,
   toggleBlockHidden,
} from '../../../shared/preview'
import { useCmsConfirm } from '../../composables/cms-confirm'
import { useCmsFieldFocus } from '../../composables/cms-field-focus'
import { useCmsRuntime } from '../../composables/cms-runtime'
import { entryFormLayout, useCmsSettingsState } from '../../composables/cms-settings'
import { cmsIcon, fieldIcon } from '../../utils/ui'

const SEO_KEYS = ['seoTitle', 'seoDescription', 'seoImage']

const deviceOptions = [
   { value: 'desktop', label: 'Desktop width', icon: cmsIcon('computer-desktop') },
   { value: 'mobile', label: 'Mobile width', icon: cmsIcon('device-phone-mobile') },
]

const props = defineProps<{
   entryName: string
   fieldKey: string
   fields: Record<string, FieldConfig>
   title: string
   content?: boolean
   focus?: CmsSearchFocus | null
}>()

const state = defineModel<Record<string, unknown>>('state', { required: true })

const runtime = useCmsRuntime()
const { i18n } = runtime
const previewPath = runtime.previewPath ?? DEFAULT_CMS_PREVIEW_PATH
const confirmAction = useCmsConfirm()
const settings = useCmsSettingsState()

const locale = ref(i18n.defaultLocale)
const device = ref<string | null>('desktop')
const selected = ref<number | null>(null)
const paletteOpen = ref(false)
const paletteIndex = ref(0)
const frame = ref<HTMLIFrameElement | null>(null)
const library = shallowRef(new Map<string, MediaItem>())

const blocksField = computed(() => props.fields[props.fieldKey]!)

const blocks = computed<CmsBlockValue[]>(() => {
   const value = state.value[props.fieldKey]
   return Array.isArray(value) ? (value as CmsBlockValue[]) : []
})

const canAdd = computed(() => canAddBlock(blocksField.value, blocks.value.length))

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

const tabList = computed(() => {
   if (!props.content) return [{ id: 'block', label: 'Block' }]
   const tabs = [
      { id: 'content', label: 'Content' },
      { id: 'block', label: 'Block' },
   ]
   if (seoKeys.value.length) tabs.push({ id: 'seo', label: 'SEO' })
   return tabs
})

const activeTab = ref(props.content ? 'content' : 'block')

const tabbed = computed(() => tabList.value.length > 1)

const panelSlot = computed(() => (tabbed.value ? 'panel' : 'default'))

const tabsBinding = computed(() =>
   tabbed.value
      ? {
           items: tabList.value.map((tab) => {
              const errorCount = tabErrorCount(tab.id)
              return {
                 value: tab.id,
                 label: tab.label,
                 badge: errorCount || undefined,
                 badgeTone: 'danger' as const,
                 badgeLabel: errorCount
                    ? `${errorCount} ${errorCount === 1 ? 'error' : 'errors'}`
                    : undefined,
              }
           }),
           modelValue: activeTab.value,
           panelFocusable: false,
           stretch: true,
           inset: true,
           'onUpdate:modelValue': (value: string | number | undefined) => {
              activeTab.value = String(value ?? '')
           },
        }
      : {}
)

const seoKeys = computed(() => SEO_KEYS.filter((key) => Object.hasOwn(props.fields, key)))

const contentFields = computed(() =>
   Object.fromEntries(
      Object.entries(props.fields).filter(
         ([key]) => key !== props.fieldKey && !SEO_KEYS.includes(key)
      )
   )
)

const sections = computed(() => {
   if (activeTab.value === 'seo')
      return [{ id: 'seo', title: undefined, description: undefined, keys: seoKeys.value }]
   const layout = entryFormLayout(props.entryName, settings.value, contentFields.value)
   return layout.main
      .map((section, index) => ({
         id: `${index}-${section.title ?? ''}`,
         title: section.title,
         description: section.description,
         keys: section.rows.flat().filter((key) => {
            const field = props.fields[key]
            return !!field && isFieldVisible(field, state.value)
         }),
      }))
      .filter((section) => section.keys.length)
})

const localeFilled = computed(() => {
   const title = props.content ? state.value.title : null
   return title && typeof title === 'object' ? (title as Record<string, string>) : null
})

function setValue(key: string, value: unknown) {
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
   if (selected.value !== null) activeTab.value = 'block'
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

function openPalette(index: number) {
   if (!canAdd.value) return
   paletteIndex.value = index
   paletteOpen.value = true
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

async function remove(index: number) {
   const label = blockConfigAt(index)?.label ?? 'block'
   if (!(await confirmAction(`Delete this ${label.toLowerCase()} block?`))) return
   setBlocks(removeBlock(blocks.value, index))
   selected.value = selectionAfterRemove(selected.value, index)
}

function updateBlockField(key: string, value: unknown) {
   const index = selected.value
   const current = index === null ? undefined : blocks.value[index]
   if (index === null || !current) return
   setBlocks(blocks.value.map((item, i) => (i === index ? { ...current, [key]: value } : item)))
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
}))

function sendState() {
   const target = frame.value?.contentWindow
   if (!target) return
   const snapshot = JSON.parse(JSON.stringify(previewState.value)) as CmsPreviewState
   target.postMessage(previewEnvelope({ type: 'render', state: snapshot }), window.location.origin)
}

watch(previewState, sendState, { deep: true })

function onFrameMessage(message: CmsPreviewFrameMessage) {
   switch (message.type) {
      case 'ready':
         sendState()
         break
      case 'select':
         select(message.index)
         break
      case 'insert':
         openPalette(message.index)
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
         void remove(message.index)
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

const panel = ref<{ el: HTMLElement | null } | null>(null)
const { highlighted, reveal } = useCmsFieldFocus()

function applyFocus(focus: CmsSearchFocus) {
   if (focus.locale && i18n.locales.includes(focus.locale)) locale.value = focus.locale
   const key = focus.field
   if (!key || !Object.hasOwn(props.fields, key)) return
   if (key === props.fieldKey) {
      activeTab.value = 'block'
      if (focus.block != null && focus.block < blocks.value.length) select(focus.block)
      return
   }
   activeTab.value = tabOfKey(key)
   reveal(() => panel.value?.el, key)
}

onMounted(() => {
   window.addEventListener('message', onMessage)
   void loadLibrary()
   if (props.focus) applyFocus(props.focus)
})

onBeforeUnmount(() => {
   window.removeEventListener('message', onMessage)
})

const validateHook = computed(() =>
   props.content ? (cmsConfig as CmsConfig)[props.entryName]?.validate : undefined
)

const schema = computed(() =>
   buildEntrySchema(
      { fields: props.fields, drafts: props.content, validate: validateHook.value },
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

function tabOfKey(key: string) {
   if (key === props.fieldKey) return 'block'
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
   return { name, index: indexes.length ? Math.min(...indexes) : null }
}

function validate(): boolean {
   form.submitCount.value++
   if (form.validateSync()) return true
   const first = firstError()
   if (!first) return false
   const field = props.fields[first.name]
   if (first.name === props.fieldKey) {
      select(first.index)
      activeTab.value = 'block'
   } else if (field) {
      activeTab.value = tabOfKey(first.name)
      if (isTranslatableField(field)) locale.value = i18n.defaultLocale
   }
   return false
}

watch(
   () => blocks.value.length,
   (length) => {
      if (selected.value !== null && selected.value >= length) selected.value = null
   }
)

defineExpose({ validate, locale })
</script>
