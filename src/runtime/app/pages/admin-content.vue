<template>
   <CmsVisualEditor
      ref="editor"
      v-model:state="formState"
      :entry-name="name"
      :field-key="CONTENT_BODY_FIELD"
      :fields="config.fields"
      :title="headerTitle"
      :focus="focus"
      :locked="locked"
      :readonly="!!lock"
      :tab-query="CMS_TAB_QUERY"
      content
      @save="saveShortcut"
   >
      <template #start>
         <KButton
            :icon="cmsIcon('arrow-left')"
            size="sm"
            variant="ghost"
            tone="neutral"
            :aria-label="`Back to ${config.label}`"
            @click="goBack"
         />
      </template>

      <template #status>
         <CmsStatusBadge :published="published" :scheduled="scheduled" :at="scheduledAt" />
         <span v-if="dirty" class="cms-editor-dirty">Unsaved changes</span>
         <KBadge v-if="lock" size="sm" variant="outline" label="Read only" :title="lock" />
      </template>

      <template v-if="config.route" #content-start="{ locale }">
         <div class="cms-editor-address">
            <span class="k-label">Page address</span>
            <div class="cms-editor-address-row">
               <span
                  class="cms-editor-address-path k-mono"
                  :class="{ 'is-empty': !addressOf(formState, locale) }"
               >
                  {{ addressOf(formState, locale) ?? 'No address yet' }}
               </span>
               <KButton
                  v-if="livePath(locale)"
                  :href="livePath(locale)!"
                  target="_blank"
                  label="Open"
                  :icon="cmsIcon('arrow-top-right-on-square')"
                  size="sm"
                  variant="ghost"
                  tone="neutral"
               />
            </div>
            <span v-if="addressHint(locale)" class="cms-field-hint">
               {{ addressHint(locale) }}
            </span>
         </div>
      </template>

      <template #actions>
         <KPopover
            v-if="!lock && canPublish"
            v-model:open="scheduleOpen"
            placement="bottom-end"
            label="Schedule"
         >
            <KButton
               :icon="cmsIcon('clock')"
               size="sm"
               variant="ghost"
               tone="neutral"
               :label="scheduled ? 'Reschedule' : 'Schedule'"
               :disabled="saving"
            />
            <template #content>
               <KStack gap="md" class="cms-editor-schedule-panel">
                  <KFormField
                     label="Publish at"
                     description="The item stays hidden from the site until this moment."
                  >
                     <CmsFieldInput v-model="scheduleDraft" :field="publishedAtField" />
                  </KFormField>
                  <KStack direction="row" justify="end" gap="sm">
                     <KButton
                        label="Cancel"
                        size="sm"
                        variant="ghost"
                        tone="neutral"
                        @click="scheduleOpen = false"
                     />
                     <KButton
                        label="Schedule"
                        size="sm"
                        :disabled="!scheduleDraft"
                        :loading="saving"
                        @click="schedule"
                     />
                  </KStack>
               </KStack>
            </template>
         </KPopover>
         <KButton
            v-if="!lock"
            label="Save"
            size="sm"
            variant="soft"
            tone="neutral"
            :loading="saving"
            @click="save()"
         />
         <KButton
            v-if="!lock && canPublish"
            :label="published ? 'Unpublish' : 'Publish'"
            size="sm"
            :variant="published ? 'soft' : 'solid'"
            :tone="published ? 'neutral' : 'accent'"
            :loading="saving"
            @click="save(published ? 'draft' : 'published')"
         />
         <KDropdownMenu v-if="moreItems.length" :items="moreItems" placement="bottom-end">
            <KButton
               :icon="cmsIcon('ellipsis-horizontal')"
               size="sm"
               variant="ghost"
               tone="neutral"
               aria-label="More actions"
            />
         </KDropdownMenu>
         <CmsSharePreview
            v-if="canShare"
            v-model:open="shareOpen"
            :entry-name="name"
            :item-id="id!"
            :dirty="dirty"
            :locale="editor?.locale"
            :save="() => save()"
         />
      </template>
   </CmsVisualEditor>
</template>

<script setup lang="ts">
import type { CmsConfig, FieldConfig } from '#nuxt-cms'
import {
   CONTENT_BODY_FIELD,
   CONTENT_PUBLISHED_AT_FIELD,
   CONTENT_TITLE_FIELD,
   contentItemPath,
   contentRoutePattern,
   isScheduledContent,
} from '#nuxt-cms'
import {
   computed,
   createError,
   definePageMeta,
   navigateTo,
   onMounted,
   ref,
   useFetch,
   useHead,
   useRoute,
   watch,
} from '#imports'
import type { MenuEntry } from '@xleddyl/443-components-vue'
import {
   Badge as KBadge,
   Button as KButton,
   DropdownMenu as KDropdownMenu,
   FormField as KFormField,
   Popover as KPopover,
   Stack as KStack,
   toast,
   useLeaveGuard,
} from '@xleddyl/443-components-vue'
import cmsConfig from '#cms-config'
import { duplicateEntryValues } from '../../shared/duplicate'
import { entryDefaults, lockedFieldKeys } from '../../shared/field-options'
import { cloneState, mergeSavedState } from '../../shared/save-state'
import { CMS_TAB_QUERY, cmsPageKey, readSearchFocus } from '../../shared/search'
import { useCmsPermissions } from '../composables/cms-permissions'
import { useCmsRouteFlag } from '../composables/cms-route'
import { useCmsLinkedDelete } from '../composables/cms-link-usage'
import { useCmsRuntime } from '../composables/cms-runtime'
import { useCmsSaveHandoff } from '../composables/cms-save-handoff'
import { useCmsTranslationActions } from '../composables/cms-translation-actions'
import { cmsApi } from '../utils/api'
import type { CmsResponseIssue } from '../utils/ui'
import { cmsIcon, errorIssues, errorMessage } from '../utils/ui'

definePageMeta({
   layout: 'cms-editor',
   middleware: 'cms-auth',
   key: (route) => cmsPageKey(route, [CMS_TAB_QUERY]),
})

type Status = 'draft' | 'published'

const route = useRoute()
const confirmLinkedDelete = useCmsLinkedDelete()
const focus = readSearchFocus(route.query)
const { i18n } = useCmsRuntime()

const name = String(route.meta.cmsEntry ?? route.path.split('/')[2] ?? '')
const config = (cmsConfig as CmsConfig)[name]
if (!config || config.kind !== 'content') {
   throw createError({ statusCode: 404, statusMessage: 'Unknown content entry', fatal: true })
}

const id = route.params.id as string | undefined
const isNew = id === undefined
const endpoint: string = `/api/cms/admin/${name}`
const formKeys = [...Object.keys(config.fields), 'status']

const editor = ref<{
   validate: () => boolean
   setIssues: (issues: CmsResponseIssue[]) => void
   applyChange: (values: Record<string, unknown>) => void
   locale: string
} | null>(null)

function pickFields(row: Record<string, unknown>) {
   return Object.fromEntries(formKeys.map((key) => [key, row[key] ?? null]))
}

const blankState = {
   ...Object.fromEntries(formKeys.map((key) => [key, key === 'status' ? 'draft' : null])),
   ...entryDefaults(config.fields, i18n, { local: true }),
}

const formState = ref<Record<string, unknown>>({ ...blankState })

const duplicateOf =
   isNew && typeof route.query.duplicate === 'string' && route.query.duplicate
      ? route.query.duplicate
      : null

const sourceId = isNew ? duplicateOf : id

if (sourceId) {
   const { data, error } = await useFetch<Record<string, unknown> | null>(`${endpoint}/${sourceId}`)
   if (error.value || !data.value) {
      const statusCode = error.value?.statusCode ?? 404
      throw createError({
         statusCode,
         statusMessage: statusCode === 404 ? 'Entry not found' : 'Failed to load entry',
         fatal: true,
      })
   }
   formState.value = duplicateOf ? duplicateEntryValues(config, data.value) : pickFields(data.value)
}

const snapshot = ref(JSON.stringify(duplicateOf ? blankState : formState.value))

const handoff = useCmsSaveHandoff(name)
const handedOver = id ? handoff.take(id) : null
if (handedOver) formState.value = handedOver

const { can, entryLock } = useCmsPermissions()
const canPublish = computed(() => can(`${name}.publish`))
const lock = computed(() =>
   entryLock(name, config, {
      isNew,
      status: (JSON.parse(snapshot.value) as Record<string, unknown>).status,
   })
)
const { items: translationItems } = useCmsTranslationActions({
   fields: config.fields,
   state: formState,
   locale: () => editor.value?.locale,
   disabled: () => !!lock.value,
   apply: (values) => editor.value?.applyChange(values),
})
const canShare = computed(() => !isNew && !!config.route && can(`${name}.update`))
const shareOpen = useCmsRouteFlag('share')
const itemActions = computed<MenuEntry[]>(() =>
   isNew
      ? []
      : [
           ...(canShare.value
              ? [
                   {
                      label: 'Share preview',
                      icon: cmsIcon('link'),
                      onSelect: () => (shareOpen.value = true),
                   },
                ]
              : []),
           ...(can(`${name}.create`)
              ? [
                   {
                      label: 'Duplicate',
                      icon: cmsIcon('document-duplicate'),
                      onSelect: duplicate,
                   },
                ]
              : []),
        ]
)
const canDeleteItem = computed(
   () =>
      can(`${name}.delete`) &&
      ((JSON.parse(snapshot.value) as Record<string, unknown>).status !== 'published' ||
         canPublish.value)
)
const deleteActions = computed<MenuEntry[]>(() =>
   !isNew && canDeleteItem.value
      ? [{ label: 'Delete', icon: cmsIcon('trash'), tone: 'danger', onSelect: remove }]
      : []
)
const moreItems = computed<MenuEntry[][]>(() =>
   [itemActions.value, translationItems.value, deleteActions.value].filter((group) => group.length)
)

const locked = computed(() =>
   isNew
      ? []
      : lockedFieldKeys(config.fields, JSON.parse(snapshot.value) as Record<string, unknown>)
)

const dirty = computed(() => !lock.value && JSON.stringify(formState.value) !== snapshot.value)

const titleText = computed(() => {
   const value = formState.value[CONTENT_TITLE_FIELD]
   if (typeof value === 'string') return value
   if (value && typeof value === 'object') {
      const values = value as Record<string, string>
      return values[i18n.defaultLocale] || Object.values(values).find(Boolean) || ''
   }
   return ''
})

const headerTitle = computed(() => titleText.value || (isNew ? 'New item' : 'Untitled'))

useHead({ title: computed(() => `${headerTitle.value} · ${config.label}`) })

const published = computed(() => formState.value.status === 'published')

const mounted = ref(false)
const scheduled = computed(() => mounted.value && isScheduledContent(formState.value))

const scheduledAt = computed(() => {
   const value = formState.value[CONTENT_PUBLISHED_AT_FIELD]
   if (!mounted.value || typeof value !== 'string' || !value) return ''
   return new Date(value).toLocaleString()
})

const savedState = computed<Record<string, unknown>>(() =>
   isNew ? {} : (JSON.parse(snapshot.value) as Record<string, unknown>)
)

const live = computed(
   () =>
      mounted.value &&
      savedState.value.status === 'published' &&
      !isScheduledContent(savedState.value)
)

function addressOf(values: Record<string, unknown>, locale: string) {
   return contentItemPath(config!, { ...values, id }, locale)
}

function livePath(locale: string) {
   return live.value ? addressOf(savedState.value, locale) : null
}

function missingAddressHint(locale: string) {
   const pattern = contentRoutePattern(config!.route, locale) ?? ''
   if (isNew && pattern.includes('[id]')) return 'Save the item to get its address.'
   if (/\[(?:year|month|day)\]/.test(pattern) && !formState.value[CONTENT_PUBLISHED_AT_FIELD])
      return 'The address needs a publish date.'
   return 'The address needs a slug.'
}

function addressHint(locale: string) {
   const current = addressOf(formState.value, locale)
   if (!current) return missingAddressHint(locale)
   if (!live.value)
      return scheduled.value ? 'Live from the scheduled date.' : 'Live once published.'
   if (current !== livePath(locale)) return 'Save to move the page to this address.'
   return ''
}

const publishedAtField = computed<FieldConfig>(() => ({
   ...config.fields[CONTENT_PUBLISHED_AT_FIELD]!,
   required: true,
}))

const saving = ref(false)
const scheduleOpen = ref(false)
const scheduleDraft = ref<string | null>(null)

watch(scheduleOpen, (open) => {
   if (!open) return
   const current = formState.value[CONTENT_PUBLISHED_AT_FIELD]
   const future = typeof current === 'string' && new Date(current).getTime() > Date.now()
   scheduleDraft.value = future
      ? current
      : new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000 + 3_600_000).toISOString()
})

const leave = useLeaveGuard(dirty)

onMounted(() => {
   mounted.value = true
})

function goBack() {
   navigateTo(`/cms/${name}`)
}

const LATER_CHANGES = 'Changes made while saving are not saved yet.'

const SUCCESS: Record<string, string> = {
   save: 'Saved',
   published: 'Published',
   draft: 'Moved to drafts',
   scheduled: 'Scheduled',
}

async function save(status?: Status, changes: Record<string, unknown> = {}, notice?: string) {
   const before = formState.value
   formState.value = { ...before, ...changes, ...(status ? { status } : {}) }
   if (!editor.value?.validate()) {
      formState.value = {
         ...formState.value,
         status: before.status,
         ...pickRevert(before, changes),
      }
      toast.error('Check the highlighted fields')
      return false
   }
   saving.value = true
   const submitted = cloneState(formState.value)
   try {
      const row = await (isNew
         ? cmsApi<Record<string, unknown>>(endpoint, { method: 'POST', body: submitted })
         : cmsApi<Record<string, unknown>>(`${endpoint}/${id}`, {
              method: 'PUT',
              body: submitted,
           }))
      const saved = pickFields(row)
      const merged = mergeSavedState(submitted, formState.value, saved)
      formState.value = merged.state
      snapshot.value = JSON.stringify(saved)
      toast.success(SUCCESS[notice ?? status ?? 'save'] ?? 'Saved', {
         description: merged.clean ? undefined : LATER_CHANGES,
      })
      if (isNew && row.id) {
         if (!merged.clean) handoff.stash(String(row.id), merged.state)
         leave.allowNext()
         await navigateTo(`/cms/${name}/${row.id}`, { replace: true })
      }
      return true
   } catch (error) {
      formState.value = {
         ...formState.value,
         status: before.status,
         ...pickRevert(before, changes),
      }
      editor.value?.setIssues(errorIssues(error))
      toast.error('Save failed', { description: errorMessage(error) })
      return false
   } finally {
      saving.value = false
   }
}

function saveShortcut() {
   if (!saving.value) void save()
}

function pickRevert(before: Record<string, unknown>, changes: Record<string, unknown>) {
   return Object.fromEntries(Object.keys(changes).map((key) => [key, before[key] ?? null]))
}

async function schedule() {
   if (!scheduleDraft.value) return
   const saved = await save(
      'published',
      { [CONTENT_PUBLISHED_AT_FIELD]: scheduleDraft.value },
      new Date(scheduleDraft.value).getTime() > Date.now() ? 'scheduled' : 'published'
   )
   if (saved) scheduleOpen.value = false
}

function duplicate() {
   void navigateTo({ path: `/cms/${name}/new`, query: { duplicate: id } })
}

async function remove() {
   if (!(await confirmLinkedDelete(name, id ? [id] : [], 'Delete this item?'))) return
   saving.value = true
   try {
      await cmsApi(`${endpoint}/${id}`, { method: 'DELETE' })
      snapshot.value = JSON.stringify(formState.value)
      toast.success('Deleted')
      goBack()
   } catch (error) {
      toast.error('Delete failed', { description: errorMessage(error) })
   } finally {
      saving.value = false
   }
}
</script>
