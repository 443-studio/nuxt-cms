<template>
   <div class="cms-page">
      <KPageHeader :title="headerTitle" :breadcrumbs="breadcrumb" breadcrumbs-ancestors>
         <template v-if="drafts" #badge>
            <CmsStatusBadge :published="published" />
         </template>
         <template #actions>
            <CmsTranslationMenu v-model="formState" :fields="fields" :disabled="!!lock" />
            <KButton label="Back" icon="arrow-left" variant="soft" @click="goBack" />
            <KButton v-if="!lock" type="submit" :form="FORM_ID" label="Save" :loading="saving" />
            <KButton
               v-if="drafts && !lock && canPublish"
               type="submit"
               :form="FORM_ID"
               :label="published ? 'Make draft' : 'Publish'"
               :loading="saving"
               @click="togglePublished"
            />
         </template>
      </KPageHeader>

      <KCard variant="outline" padding="lg">
         <CmsEntryForm
            ref="formRef"
            v-model="formState"
            :fields="fields"
            :tabs="config.tabs"
            :entry-name="name"
            :drafts="drafts"
            :form-id="FORM_ID"
            :loading="saving"
            :focus="focus"
            :path="pageRoute?.path"
            :lock="lock"
            :can-publish="canPublish"
            :locked="locked"
            @submit="save"
            @error="revertStatus"
         />
      </KCard>
   </div>
</template>

<script setup lang="ts">
import type { CmsConfig } from '#nuxt-cms'
import { pageFields, pageParentPath, pageRouteOf, pageRoutes } from '#nuxt-cms'
import {
   computed,
   createError,
   definePageMeta,
   navigateTo,
   ref,
   useFetch,
   useRoute,
   watch,
} from '#imports'
import type { BreadcrumbItem } from '@xleddyl/443-components-vue'
import {
   Button as KButton,
   Card as KCard,
   PageHeader as KPageHeader,
   toast,
   useLeaveGuard,
} from '@xleddyl/443-components-vue'
import cmsConfig from '#cms-config'
import { entryDefaults, lockedFieldKeys } from '../../shared/field-options'
import { cloneState, mergeSavedState } from '../../shared/save-state'
import { cmsEntryLink, readSearchFocus } from '../../shared/search'
import { useCmsPermissions } from '../composables/cms-permissions'
import { CMS_NEW_RECORD } from '../composables/cms-route'
import { useCmsRuntime } from '../composables/cms-runtime'
import { useCmsSaveHandoff } from '../composables/cms-save-handoff'
import { cmsApi } from '../utils/api'
import type { CmsResponseIssue } from '../utils/ui'
import { errorIssues, errorMessage } from '../utils/ui'

const FORM_ID = 'cms-entry-form'

definePageMeta({
   layout: 'cms-admin',
   middleware: 'cms-auth',
   content: 'page',
   validate: (route) => Object.hasOwn(cmsConfig, route.params.collection as string),
   key: (route) => route.fullPath,
})

const route = useRoute()
const focus = readSearchFocus(route.query)

const name = route.params.collection as string
const config = (cmsConfig as CmsConfig)[name]
if (!config || (config.kind !== 'collection' && config.kind !== 'page')) {
   throw createError({ statusCode: 404, statusMessage: 'Unknown collection', fatal: true })
}

const id = route.params.id as string | undefined
const isPage = config.kind === 'page'

if (!isPage) {
   const text = (key: string) => {
      const value = route.query[key]
      return typeof value === 'string' ? value : undefined
   }
   await navigateTo(
      cmsEntryLink(name, id ?? CMS_NEW_RECORD, {
         field: text('field'),
         locale: text('locale'),
         block: text('block'),
         tab: text('tab'),
      }),
      { replace: true }
   )
}
const pageRoute = isPage && id ? pageRouteOf(config, id) : undefined
if (isPage && !pageRoute) {
   throw createError({ statusCode: 404, statusMessage: 'Unknown page', fatal: true })
}

const breadcrumb = ((): BreadcrumbItem[] => {
   const links: BreadcrumbItem[] = [{ label: config.label, to: `/cms/${name}` }]
   if (!pageRoute) return links
   const ancestors: string[] = []
   let parent = pageParentPath(pageRoute.path)
   while (parent) {
      ancestors.unshift(parent)
      parent = pageParentPath(parent)
   }
   for (const path of ancestors) {
      const route = pageRoutes(config).find((candidate) => candidate.path === path)
      if (route) links.push({ label: route.label, to: `/cms/${name}/${route.key}` })
   }
   return links
})()

const isNew = !isPage && id === undefined
const drafts = !isPage && !!config.drafts
const fields = pageRoute ? pageFields(config, pageRoute.path) : config.fields
const headerTitle = pageRoute ? pageRoute.label : isNew ? 'New entry' : 'Edit entry'
const fieldKeys = Object.keys(fields)
const formKeys = drafts ? [...fieldKeys, 'status'] : fieldKeys

const endpoint: string = `/api/cms/admin/${name}`

const { i18n } = useCmsRuntime()

function emptyState() {
   return {
      ...Object.fromEntries(formKeys.map((k) => [k, null])),
      ...entryDefaults(fields, i18n, { local: true }),
   }
}

function pickFields(row: Record<string, unknown>) {
   return Object.fromEntries(formKeys.map((k) => [k, row[k] ?? null]))
}

const formState = ref<Record<string, unknown>>(emptyState())

if (!isNew && isPage) {
   const { data, error } = await useFetch<Record<string, unknown> | null>(`${endpoint}/${id}`)
   if (error.value || !data.value) {
      const statusCode = error.value?.statusCode ?? 404
      throw createError({
         statusCode,
         statusMessage: statusCode === 404 ? 'Entry not found' : 'Failed to load entry',
         fatal: true,
      })
   }
   formState.value = pickFields(data.value)
}

const saving = ref(false)

const snapshot = ref(JSON.stringify(formState.value))

const handoff = useCmsSaveHandoff(name)
const handedOver = id && !isNew ? handoff.take(id) : null
if (handedOver) formState.value = handedOver

const { can, entryLock } = useCmsPermissions()
const canPublish = computed(() => can(`${name}.publish`))
const lock = computed(() =>
   entryLock(name, config, {
      isNew,
      status: (JSON.parse(snapshot.value) as Record<string, unknown>).status,
   })
)

const locked = computed(() =>
   isNew ? [] : lockedFieldKeys(fields, JSON.parse(snapshot.value) as Record<string, unknown>)
)

const formRef = ref<{ setIssues: (issues: CmsResponseIssue[]) => void } | null>(null)

const dirty = computed(() => !lock.value && JSON.stringify(formState.value) !== snapshot.value)

const leave = useLeaveGuard(dirty)

const published = computed({
   get: () => formState.value.status === 'published',
   set: (value: boolean) => {
      formState.value.status = value ? 'published' : 'draft'
   },
})

function togglePublished() {
   published.value = !published.value
}

function revertStatus() {
   if (!drafts) return
   formState.value.status = (JSON.parse(snapshot.value) as Record<string, unknown>).status ?? null
}

function goBack() {
   navigateTo(`/cms/${name}`)
}

async function save() {
   saving.value = true
   const submitted = cloneState(formState.value)
   try {
      const row = await (isNew
         ? cmsApi<Record<string, unknown>>(endpoint, { method: 'POST', body: submitted })
         : cmsApi<Record<string, unknown>>(`${endpoint}/${id}`, {
              method: 'PUT',
              body: submitted,
           }))
      const saved = pickFields(row ?? submitted)
      const merged = mergeSavedState(submitted, formState.value, saved)
      snapshot.value = JSON.stringify(saved)
      if (merged.clean) {
         formState.value = merged.state
         toast.success('Saved')
         goBack()
         return
      }
      formState.value = merged.state
      toast.success('Saved', { description: 'Changes made while saving are not saved yet.' })
      const createdId = isNew && row?.id ? String(row.id) : null
      if (createdId) {
         handoff.stash(createdId, merged.state)
         leave.allowNext()
         await navigateTo(`/cms/${name}/${createdId}`, { replace: true })
      }
   } catch (error) {
      revertStatus()
      formRef.value?.setIssues(errorIssues(error))
      toast.error('Save failed', { description: errorMessage(error) })
   } finally {
      saving.value = false
   }
}
</script>
