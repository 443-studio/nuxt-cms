<template>
   <div class="cms-mdc" :class="{ 'is-inset': inset }">
      <div class="cms-mdc-bar" role="toolbar" aria-label="Text actions">
         <template v-if="!readonly">
            <KTooltip text="Apply the text" shortcut="mod+enter">
               <KButton
                  label="Apply"
                  :icon="cmsIcon('check')"
                  size="sm"
                  :disabled="!dirty"
                  @click="apply"
               />
            </KTooltip>
            <KButton
               label="Revert"
               :icon="cmsIcon('arrow-uturn-left')"
               size="sm"
               variant="ghost"
               tone="neutral"
               :disabled="!dirty"
               @click="revert"
            />
         </template>
         <span class="cms-mdc-status" aria-live="polite">
            <KTooltip
               v-if="stale"
               text="The values changed after this text was loaded. Apply replaces them, Revert reloads them."
            >
               <KBadge size="sm" tone="warning" label="Changed outside the text" />
            </KTooltip>
            <KBadge v-else-if="dirty && !readonly" size="sm" tone="warning" label="Not applied" />
            <KBadge v-if="readonly" size="sm" variant="outline" label="Read only" />
         </span>
         <span class="cms-mdc-spacer" />
         <KButton
            label="Copy text"
            :icon="cmsIcon('clipboard-document')"
            size="sm"
            variant="ghost"
            tone="neutral"
            @click="copyText"
         />
         <KButton
            label="Copy AI guide"
            :icon="cmsIcon('sparkles')"
            size="sm"
            variant="soft"
            tone="neutral"
            :tooltip="GUIDE_HINT"
            @click="copyGuide"
         />
      </div>

      <KAlert
         v-if="shownIssues.length"
         :tone="errorCount ? 'danger' : 'warning'"
         :title="issuesTitle"
         class="cms-mdc-issues"
         dismissible
         @dismiss="issues = []"
      >
         <ul class="cms-mdc-issue-list">
            <li v-for="(issue, index) in shownIssues" :key="index">
               <button
                  v-if="issue.line"
                  type="button"
                  class="cms-mdc-issue"
                  :class="{ 'is-warning': issue.level === 'warning' }"
                  @click="goToLine(issue.line)"
               >
                  <span class="cms-mdc-issue-line">Line {{ issue.line }}</span>
                  <span>{{ issue.message }}</span>
               </button>
               <span
                  v-else
                  class="cms-mdc-issue"
                  :class="{ 'is-warning': issue.level === 'warning' }"
               >
                  <span class="cms-mdc-issue-line">Item</span>
                  <span>{{ issue.message }}</span>
               </span>
            </li>
         </ul>
      </KAlert>

      <div ref="box" class="cms-mdc-editor">
         <KTextarea
            v-model="text"
            class="cms-mdc-input k-mono"
            :rows="12"
            :readonly="readonly"
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            :aria-label="label"
            @keydown="onKeydown"
         />
      </div>
   </div>
</template>

<script setup lang="ts">
import type { CmsConfig, CmsMdcIssue, CmsValidate, FieldConfig } from '#nuxt-cms'
import {
   blocksMdcGuide,
   blocksToMdc,
   entryMdcGuide,
   entryToMdc,
   hasMdcErrors,
   mdcToBlocks,
   mdcToEntry,
} from '#nuxt-cms'
import {
   Alert as KAlert,
   Badge as KBadge,
   Button as KButton,
   Textarea as KTextarea,
   Tooltip as KTooltip,
   toast,
   useLeaveGuard,
} from '@xleddyl/443-components-vue'
import { computed, nextTick, ref, shallowRef, watch } from '#imports'
import cmsConfig from '#cms-config'
import { mdcSchemaCheck } from '../../../shared/mdc-check'
import { useCmsMediaKeys } from '../../composables/cms-media-keys'
import { useCmsRuntime } from '../../composables/cms-runtime'
import { cmsIcon } from '../../utils/ui'

const GUIDE_HINT = 'Paste it in an AI chat, ask for the content, then paste the answer here'

const props = defineProps<{
   mode: 'entry' | 'blocks'
   fields: Record<string, FieldConfig>
   fieldKey: string
   values: Record<string, unknown>
   locale: string
   title: string
   readonly?: boolean
   validate?: CmsValidate
   inset?: boolean
}>()

const emit = defineEmits<{ apply: [values: Record<string, unknown>] }>()

const { i18n } = useCmsRuntime()
const mediaKeys = useCmsMediaKeys()

const box = ref<HTMLElement | null>(null)
const issues = shallowRef<CmsMdcIssue[]>([])

const label = computed(() =>
   props.mode === 'entry' ? `${props.title} as text` : `${props.title} blocks as text`
)

function serialize() {
   const options = { i18n, locale: props.locale }
   if (props.mode === 'entry')
      return entryToMdc(props.fields, props.values, { ...options, body: props.fieldKey })
   const field = props.fields[props.fieldKey]
   return field ? blocksToMdc(field, props.values[props.fieldKey], options) : ''
}

function snapshot() {
   return JSON.stringify(props.values)
}

const text = ref(serialize())
const loaded = ref(text.value)
const source = ref(snapshot())

const dirty = computed(() => text.value !== loaded.value)

useLeaveGuard(() => dirty.value && !props.readonly, {
   title: 'Discard the text edits?',
   description: 'The text has edits that are not applied yet.',
})

const stale = computed(() => source.value !== snapshot())

function load() {
   text.value = serialize()
   loaded.value = text.value
   source.value = snapshot()
}

watch(
   () => props.values,
   () => {
      if (!dirty.value) load()
   },
   { deep: true }
)

watch(
   () => props.locale,
   () => {
      load()
      issues.value = []
   }
)

const errorCount = computed(() => issues.value.filter((issue) => issue.level === 'error').length)

const shownIssues = computed(() => issues.value.slice(0, 50))

const issuesTitle = computed(() => {
   const count = errorCount.value
   if (count) return `${count} ${count === 1 ? 'problem' : 'problems'}: nothing was applied`
   const warnings = issues.value.length
   return `Applied with ${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`
})

const check = computed(() =>
   mdcSchemaCheck(
      { fields: props.fields, validate: props.mode === 'entry' ? props.validate : undefined },
      i18n,
      cmsConfig as CmsConfig
   )
)

function parse() {
   const options = {
      i18n,
      locale: props.locale,
      check: check.value,
      media: mediaKeys.keys.value,
   }
   if (props.mode === 'entry') {
      const result = mdcToEntry(text.value, props.fields, {
         ...options,
         body: props.fieldKey,
         current: props.values,
      })
      return { values: result.values, issues: result.issues }
   }
   const field = props.fields[props.fieldKey]!
   const result = mdcToBlocks(text.value, field, {
      ...options,
      key: props.fieldKey,
      current: props.values[props.fieldKey],
   })
   return { values: { ...props.values, [props.fieldKey]: result.value }, issues: result.issues }
}

function apply(): boolean {
   if (props.readonly) return false
   const result = parse()
   issues.value = result.issues
   if (hasMdcErrors(result.issues)) {
      toast.error('The text has problems', {
         description: 'Fix the lines listed above the text, then apply again.',
      })
      return false
   }
   emit('apply', result.values)
   void nextTick(load)
   toast.success('Text applied')
   return true
}

function revert() {
   load()
   issues.value = []
}

async function writeClipboard(value: string) {
   try {
      await navigator.clipboard.writeText(value)
      return true
   } catch {
      return false
   }
}

async function copyText() {
   if (await writeClipboard(text.value)) toast.success('Text copied')
   else toast.error('Copy failed', { description: 'The browser denied access to the clipboard.' })
}

function guide() {
   const options = {
      i18n,
      locale: props.locale,
      title: props.title,
      media: mediaKeys.keys.value ? [...mediaKeys.keys.value] : null,
   }
   if (props.mode === 'entry')
      return entryMdcGuide(props.fields, { ...options, body: props.fieldKey })
   return blocksMdcGuide(props.fields[props.fieldKey]!, options)
}

async function copyGuide() {
   if (await writeClipboard(guide()))
      toast.success('AI guide copied', {
         description: 'Paste it in an AI chat with your request, then paste the answer here.',
      })
   else toast.error('Copy failed', { description: 'The browser denied access to the clipboard.' })
}

function textarea() {
   return box.value?.querySelector('textarea') ?? null
}

function goToLine(line: number) {
   const element = textarea()
   if (!element) return
   const lines = text.value.split('\n')
   const index = Math.min(Math.max(line, 1), lines.length) - 1
   const start = lines.slice(0, index).reduce((total, current) => total + current.length + 1, 0)
   element.focus()
   element.setSelectionRange(start, start + (lines[index]?.length ?? 0))
   const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight) || 20
   element.scrollTop = Math.max(index * lineHeight - element.clientHeight / 3, 0)
}

function onKeydown(event: KeyboardEvent) {
   if (!(event.metaKey || event.ctrlKey) || event.isComposing || props.readonly) return
   const key = event.key.toLowerCase()
   if (key === 'enter') {
      event.preventDefault()
      if (dirty.value) apply()
      return
   }
   if (key === 's' && dirty.value && !apply()) {
      event.preventDefault()
      event.stopPropagation()
   }
}

defineExpose({ dirty, reload: revert })
</script>
