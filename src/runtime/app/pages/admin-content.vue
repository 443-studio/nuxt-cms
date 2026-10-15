<template>
   <CmsVisualEditor
      ref="editor"
      v-model:state="formState"
      :entry-name="name"
      :field-key="CONTENT_BODY_FIELD"
      :fields="config.fields"
      :title="headerTitle"
      :focus="focus"
      content
   >
      <template #start>
         <KButton
            :icon="cmsIcon('arrow-left')"
            size="sm"
            variant="ghost"
            tone="neutral"
            :aria-label="`Back to ${config.label}`"
            :title="`Back to ${config.label}`"
            @click="goBack"
         />
      </template>

      <template #status>
         <CmsStatusBadge :published="published" :scheduled="scheduled" :at="scheduledAt" />
         <span v-if="dirty" class="cms-editor-dirty">Unsaved changes</span>
      </template>

      <template #actions>
         <KPopover v-model:open="scheduleOpen" placement="bottom-end" label="Schedule">
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
            label="Save"
            size="sm"
            variant="soft"
            tone="neutral"
            :loading="saving"
            @click="save()"
         />
         <KButton
            :label="published ? 'Unpublish' : 'Publish'"
            size="sm"
            :variant="published ? 'soft' : 'solid'"
            :tone="published ? 'neutral' : 'accent'"
            :loading="saving"
            @click="save(published ? 'draft' : 'published')"
         />
         <KDropdownMenu
            v-if="!isNew"
            :items="[
               { label: 'Duplicate', onSelect: duplicate },
               { label: 'Delete', onSelect: remove },
            ]"
            placement="bottom-end"
         >
            <KButton
               :icon="cmsIcon('ellipsis-horizontal')"
               size="sm"
               variant="ghost"
               tone="neutral"
               aria-label="More actions"
               title="More actions"
            />
         </KDropdownMenu>
      </template>
   </CmsVisualEditor>
</template>

<script setup lang="ts">
import type { CmsConfig, FieldConfig } from '#nuxt-cms'
import {
   CONTENT_BODY_FIELD,
   CONTENT_PUBLISHED_AT_FIELD,
   CONTENT_TITLE_FIELD,
   isScheduledContent,
} from '#nuxt-cms'
import {
   computed,
   createError,
   definePageMeta,
   navigateTo,
   onBeforeRouteLeave,
   onBeforeUnmount,
   onMounted,
   ref,
   useFetch,
   useHead,
   useRoute,
   watch,
} from '#imports'
import {
   Button as KButton,
   DropdownMenu as KDropdownMenu,
   FormField as KFormField,
   Popover as KPopover,
   Stack as KStack,
} from '@xleddyl/443-components-vue'
import cmsConfig from '#cms-config'
import { duplicateEntryValues } from '../../shared/duplicate'
import { readSearchFocus } from '../../shared/search'
import { useCmsConfirm } from '../composables/cms-confirm'
import { useCmsRuntime } from '../composables/cms-runtime'
import { useCmsToast } from '../composables/cms-toast'
import { cmsApi } from '../utils/api'
import { cmsIcon, errorMessage } from '../utils/ui'

definePageMeta({
   layout: 'cms-editor',
   middleware: 'cms-auth',
   key: (route) => route.fullPath,
})

type Status = 'draft' | 'published'

const route = useRoute()
const toast = useCmsToast()
const confirmAction = useCmsConfirm()
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

const editor = ref<{ validate: () => boolean } | null>(null)

function pickFields(row: Record<string, unknown>) {
   return Object.fromEntries(formKeys.map((key) => [key, row[key] ?? null]))
}

const blankState = Object.fromEntries(
   formKeys.map((key) => [key, key === 'status' ? 'draft' : null])
)

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
const dirty = computed(() => JSON.stringify(formState.value) !== snapshot.value)

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

function onBeforeUnload(event: BeforeUnloadEvent) {
   event.preventDefault()
}

watch(dirty, (value) => {
   if (value) window.addEventListener('beforeunload', onBeforeUnload)
   else window.removeEventListener('beforeunload', onBeforeUnload)
})

onMounted(() => {
   mounted.value = true
   if (dirty.value) window.addEventListener('beforeunload', onBeforeUnload)
})

onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

onBeforeRouteLeave(async () => {
   if (dirty.value && !(await confirmAction('You have unsaved changes. Leave anyway?')))
      return false
})

function goBack() {
   navigateTo(`/cms/${name}`)
}

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
      toast.add({ title: 'Check the highlighted fields', color: 'error' })
      return false
   }
   saving.value = true
   try {
      const row = await (isNew
         ? cmsApi<Record<string, unknown>>(endpoint, { method: 'POST', body: formState.value })
         : cmsApi<Record<string, unknown>>(`${endpoint}/${id}`, {
              method: 'PUT',
              body: formState.value,
           }))
      formState.value = pickFields(row)
      snapshot.value = JSON.stringify(formState.value)
      toast.add({ title: SUCCESS[notice ?? status ?? 'save'] ?? 'Saved', color: 'success' })
      if (isNew && row.id) await navigateTo(`/cms/${name}/${row.id}`, { replace: true })
      return true
   } catch (error) {
      formState.value = {
         ...formState.value,
         status: before.status,
         ...pickRevert(before, changes),
      }
      toast.add({ title: 'Save failed', description: errorMessage(error), color: 'error' })
      return false
   } finally {
      saving.value = false
   }
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
   if (!(await confirmAction('Delete this item?'))) return
   saving.value = true
   try {
      await cmsApi(`${endpoint}/${id}`, { method: 'DELETE' })
      snapshot.value = JSON.stringify(formState.value)
      toast.add({ title: 'Deleted', color: 'success' })
      goBack()
   } catch (error) {
      toast.add({ title: 'Delete failed', description: errorMessage(error), color: 'error' })
   } finally {
      saving.value = false
   }
}
</script>
