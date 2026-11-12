<template>
   <div class="cms-preview" :data-cms-preview="state ? 'ready' : 'waiting'">
      <template v-if="state && field">
         <component
            :is="wrapper"
            v-if="wrapper && rendered.item"
            :item="rendered.item"
            :locale="state.locale"
         >
            <CmsBlocks
               :blocks="rendered.blocks"
               :entry="blockEntry"
               :field="state.field"
               annotate
            />
            <div v-if="!visibleCount && canAdd" class="cms-preview-empty" v-bind="tokenRoot">
               <button
                  type="button"
                  class="cms-preview-empty-button"
                  :data-cms-insert="`${state.field}.${state.blocks.length}`"
               >
                  <KIcon name="plus" />
                  <span>Add a block</span>
               </button>
            </div>
         </component>
         <template v-else>
            <CmsBlocks
               :blocks="rendered.blocks"
               :entry="blockEntry"
               :field="state.field"
               annotate
            />
            <div v-if="!visibleCount && canAdd" class="cms-preview-empty" v-bind="tokenRoot">
               <button
                  type="button"
                  class="cms-preview-empty-button"
                  :data-cms-insert="`${state.field}.${state.blocks.length}`"
               >
                  <KIcon name="plus" />
                  <span>Add a block</span>
               </button>
            </div>
         </template>
         <PreviewOverlay
            ref="overlay"
            :field="field"
            :field-key="state.field"
            :fields="item ? fields : null"
            :blocks="blocks"
            :item="item"
            :locale="state.locale"
            :editable="state.editable"
            :locked-fields="state.lockedFields"
            :selected="state.selected"
            :highlighted="highlighted"
            :version="version"
            @message="post"
            @inline="inline = $event"
         />
      </template>
      <p v-else-if="standalone" class="cms-preview-notice" v-bind="tokenRoot">
         This page shows the live preview of the visual editor. Open an item in the admin to use it.
      </p>
   </div>
</template>

<script setup lang="ts">
import type { CmsBlockEntryName } from '#cms-types'
import type { CmsBlockPath, CmsConfig } from '#nuxt-cms'
import {
   canAddBlock,
   contentItemPath,
   entryFieldsFor,
   isHiddenBlock,
   isRoutedContent,
   readLinkValue,
   resolveCmsLink,
} from '#nuxt-cms'
import {
   computed,
   definePageMeta,
   onBeforeUnmount,
   onMounted,
   ref,
   shallowRef,
   useHead,
   watch,
} from '#imports'
import { Icon as KIcon } from '@xleddyl/443-components-vue'
import tokensCss from '@xleddyl/443-components-vue/tokens.css?inline'
import cmsConfig from '#cms-config'
import { cmsPreviewComponents } from '#cms-blocks'
import type { CmsBlockValue, CmsPreviewFrameMessage, CmsPreviewState } from '../../shared/preview'
import {
   isTrustedPreviewEvent,
   parseHostMessage,
   previewBlocks,
   previewEnvelope,
   previewItem,
} from '../../shared/preview'
import type { CmsInlineOverride } from '../../shared/inline-text'
import { applyInlineOverride } from '../../shared/inline-text'
import type { CmsBlockItem } from '../blocks/resolve'
import { useCmsLinkTargets } from '../composables/cms-link-targets'
import { useCmsRuntime } from '../composables/cms-runtime'
import PreviewOverlay from '../preview/PreviewOverlay.vue'
import {
   cmsFieldMarking,
   cmsPreviewEditable,
   cmsPreviewTheme,
   cmsTokenRoot,
} from '../preview/field-marker'

definePageMeta({ middleware: 'cms-auth' })

const { i18n } = useCmsRuntime()

const state = shallowRef<CmsPreviewState | null>(null)
const version = ref(0)
const highlighted = shallowRef<CmsBlockPath | null>(null)
const overlay = ref<InstanceType<typeof PreviewOverlay> | null>(null)
const standalone = ref(false)
const inline = shallowRef<CmsInlineOverride | null>(null)

useHead({
   title: 'Preview',
   meta: [{ name: 'robots', content: 'noindex, nofollow' }],
   style: [{ key: 'cms-tokens', innerHTML: tokensCss }],
   htmlAttrs: { lang: computed(() => state.value?.locale) },
})

const entry = computed(() =>
   state.value ? (cmsConfig as CmsConfig)[state.value.entry] : undefined
)

const tokenRoot = computed(() => cmsTokenRoot(cmsPreviewTheme.value))

const blockEntry = computed(() => state.value?.entry as CmsBlockEntryName | undefined)

const fields = computed(() => (entry.value ? entryFieldsFor(entry.value) : {}))

const field = computed(() => {
   const candidate = state.value ? fields.value[state.value.field] : undefined
   return candidate?.type === 'blocks' ? candidate : undefined
})

const linkTargets = useCmsLinkTargets(cmsConfig as CmsConfig)

function resolveLink(value: unknown) {
   const locale = state.value?.locale ?? i18n.defaultLocale
   const link = readLinkValue(value)
   const target = link?.entry && link.id && !link.url ? link : null
   if (target) linkTargets.load(target.entry!, target.id!)
   const live = target && linkTargets.state(target) === 'live'
   const row = live ? linkTargets.target(target.entry!, target.id!) : null
   return resolveCmsLink(cmsConfig as CmsConfig, value, locale, i18n.defaultLocale, row)
}

const blocks = computed<CmsBlockValue[]>(() =>
   state.value && field.value
      ? previewBlocks(
           field.value,
           state.value.blocks,
           state.value.locale,
           i18n.defaultLocale,
           state.value.media,
           resolveLink
        )
      : []
)

const visibleCount = computed(
   () => rendered.value.blocks.filter((block) => !isHiddenBlock(block)).length
)

const canAdd = computed(
   () => !!state.value && !!field.value && canAddBlock(field.value, state.value.blocks.length)
)

const item = computed(() => {
   if (!state.value?.item || entry.value?.kind !== 'content') return null
   const preview = previewItem(
      fields.value,
      state.value.item,
      state.value.locale,
      i18n.defaultLocale,
      state.value.media,
      resolveLink
   )
   if (!isRoutedContent(entry.value)) return preview
   return { ...preview, path: contentItemPath(entry.value, state.value.item, state.value.locale) }
})

const rendered = computed(() => {
   const view = applyInlineOverride(blocks.value, item.value, inline.value)
   return { blocks: view.blocks as unknown as CmsBlockItem[], item: view.item }
})

const wrapper = computed(() =>
   state.value && entry.value?.kind === 'content'
      ? cmsPreviewComponents[state.value.entry]
      : undefined
)

function post(message: CmsPreviewFrameMessage) {
   if (window.parent === window) return
   const plain = JSON.parse(JSON.stringify(message)) as CmsPreviewFrameMessage
   window.parent.postMessage(previewEnvelope(plain), window.location.origin)
}

function onMessage(event: MessageEvent) {
   if (!isTrustedPreviewEvent(event, window.location.origin, window.parent)) return
   const message = parseHostMessage(event.data)
   if (!message) return
   switch (message.type) {
      case 'render':
         if (inline.value?.settled) inline.value = null
         state.value = message.state
         cmsPreviewTheme.value = message.state.theme
         version.value++
         break
      case 'highlight':
         highlighted.value = message.path
         break
      case 'reveal':
         void overlay.value?.reveal(message.path)
         break
   }
}

onMounted(() => {
   cmsFieldMarking.value = true
   standalone.value = window.parent === window
   window.addEventListener('message', onMessage)
   post({ type: 'ready' })
})

watch(
   () => !!state.value?.editable && !!field.value,
   (editable) => {
      cmsPreviewEditable.value = editable
   }
)

onBeforeUnmount(() => {
   cmsFieldMarking.value = false
   cmsPreviewEditable.value = false
   window.removeEventListener('message', onMessage)
})
</script>

<style>
.cms-preview-overlay {
   position: fixed;
   inset: 0;
   z-index: 2147483000;
   pointer-events: none;
   font-family: var(--k-font-sans);
   font-size: 12px;
   line-height: 1;
}

.cms-preview-outline {
   position: absolute;
   box-sizing: border-box;
   border: 1px dashed color-mix(in oklab, var(--k-accent) 70%, transparent);
   border-radius: var(--k-radius-xs);
}

.cms-preview-outline.is-highlighted {
   border-style: solid;
   background: color-mix(in oklab, var(--k-accent) 8%, transparent);
}

.cms-preview-outline.is-selected {
   border: 2px solid var(--k-accent);
   box-shadow: 0 0 0 4px var(--k-ring-soft);
}

.cms-preview-outline.is-drop-target {
   border: 2px dashed var(--k-accent);
   background: color-mix(in oklab, var(--k-accent) 6%, transparent);
}

.cms-preview-label {
   position: absolute;
   top: -1px;
   left: -1px;
   padding: 4px 7px;
   border-radius: var(--k-radius-xs) 0 var(--k-radius-sm) 0;
   background: var(--k-accent);
   color: var(--k-accent-contrast);
   font-weight: 600;
   letter-spacing: 0.01em;
   white-space: nowrap;
}

.cms-preview-field {
   position: absolute;
   box-sizing: border-box;
   outline: 1px solid color-mix(in oklab, var(--k-accent) 55%, transparent);
   outline-offset: 2px;
   border-radius: var(--k-radius-xs);
   background: color-mix(in oklab, var(--k-accent) 5%, transparent);
}

.cms-preview-field.is-editing {
   outline: 2px solid var(--k-accent);
   background: none;
}

.cms-preview-field-label {
   position: absolute;
   top: 100%;
   left: -3px;
   margin-top: 6px;
   padding: 3px 6px;
   border-radius: var(--k-radius-xs);
   background: var(--k-elevated);
   color: var(--k-accent-text);
   box-shadow: 0 0 0 1px var(--k-accent-line);
   font-size: 11px;
   font-weight: 600;
   white-space: nowrap;
}

.cms-preview-field-label.is-above {
   top: auto;
   bottom: 100%;
   margin: 0 0 6px;
}

.cms-preview-toolbar {
   position: absolute;
   display: flex;
   align-items: center;
   gap: 2px;
   padding: 3px;
   transform: translateX(-100%);
   border-radius: var(--k-radius-md);
   background: var(--k-elevated);
   box-shadow: var(--k-shadow-overlay);
   pointer-events: auto;
}

.cms-preview-toolbar:not(.is-selected) {
   opacity: 0.92;
}

.cms-preview-tool,
.cms-preview-insert,
.cms-preview-empty-button {
   all: unset;
   box-sizing: border-box;
   display: inline-flex;
   align-items: center;
   justify-content: center;
   cursor: pointer;
}

.cms-preview-tool {
   width: 28px;
   height: 28px;
   border-radius: var(--k-radius-sm);
   color: var(--k-text);
   transition: background-color var(--k-duration) var(--k-ease);
}

.cms-preview-tool:hover:not(:disabled) {
   background: var(--k-hover);
}

.cms-preview-tool:disabled {
   opacity: 0.35;
   cursor: default;
}

.cms-preview-tool.is-danger {
   color: var(--k-danger-text);
}

.cms-preview-handle {
   cursor: grab;
   touch-action: none;
}

.cms-preview-overlay .cms-preview-tool:focus-visible,
.cms-preview-overlay .cms-preview-insert:focus-visible,
.cms-preview .cms-preview-empty-button:focus-visible {
   outline: 2px solid var(--k-ring);
   outline-offset: 2px;
}

.cms-preview-separator {
   width: 1px;
   height: 18px;
   margin: 0 2px;
   background: var(--k-line);
}

.cms-preview-overlay svg {
   width: 16px;
   height: 16px;
   flex-shrink: 0;
}

.cms-preview-insert {
   position: absolute;
   width: 26px;
   height: 26px;
   margin: -13px 0 0 -13px;
   border-radius: var(--k-radius-full);
   background: var(--k-accent);
   color: var(--k-accent-contrast);
   box-shadow: var(--k-shadow-sm);
   opacity: 0;
   transform: scale(0.85);
   transition:
      opacity var(--k-duration) var(--k-ease),
      transform var(--k-duration) var(--k-ease);
   pointer-events: auto;
}

.cms-preview-insert.is-near,
.cms-preview-insert:hover,
.cms-preview-insert:focus-visible {
   opacity: 1;
   transform: scale(1);
}

.cms-preview-overlay.is-dragging .cms-preview-insert,
.cms-preview-overlay.is-dragging .cms-preview-toolbar:not(.is-selected) {
   visibility: hidden;
}

.cms-preview-dropline {
   position: absolute;
   height: 3px;
   margin-top: -1.5px;
   border-radius: var(--k-radius-full);
   background: var(--k-accent);
   box-shadow: 0 0 0 3px var(--k-ring-soft);
}

.cms-preview-dropline.is-vertical {
   width: 3px;
   margin: 0 0 0 -1.5px;
}

.cms-preview-grabbing,
.cms-preview-grabbing * {
   cursor: grabbing !important;
   user-select: none !important;
}

.cms-preview [data-cms-editing] {
   outline: none;
   cursor: text;
}

.cms-preview-empty {
   display: flex;
   justify-content: center;
   padding: 48px 16px;
}

.cms-preview-empty-button {
   gap: 8px;
   padding: 12px 18px;
   border: 1px dashed var(--k-accent-line);
   border-radius: var(--k-radius-lg);
   color: var(--k-accent-text);
   font-family: var(--k-font-sans);
   font-size: 14px;
   font-weight: 600;
   transition: background-color var(--k-duration) var(--k-ease);
}

.cms-preview-empty-button:hover {
   background: color-mix(in oklab, var(--k-accent) 6%, transparent);
}

.cms-preview-empty-button svg {
   width: 18px;
   height: 18px;
}

.cms-preview-empty-button.is-nested {
   justify-content: center;
   width: 100%;
   min-height: 56px;
   padding: 10px 14px;
   font-size: 13px;
   opacity: 0.8;
}

.cms-preview-empty-button.is-nested:hover {
   opacity: 1;
}

.cms-preview-empty-button.is-nested svg {
   width: 16px;
   height: 16px;
}

.cms-preview-notice {
   max-width: 32rem;
   margin: 64px auto;
   padding: 0 16px;
   font-family: var(--k-font-sans);
   color: var(--k-text-muted);
   text-align: center;
}
</style>
