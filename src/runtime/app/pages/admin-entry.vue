<template>
   <div class="k-page cms-page">
      <KPageHeader
         :trail="breadcrumb"
         trail-label="Page"
         :title="headerTitle"
         :icon="cmsIcon(config.icon ?? 'window')"
      >
         <template #actions>
            <CmsTranslationMenu v-model="formState" :fields="fields" :disabled="!!lock" size="sm" />
            <KButton
               v-if="!lock"
               type="submit"
               :form="FORM_ID"
               label="Save"
               size="sm"
               :loading="saving"
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
            :form-id="FORM_ID"
            :tab-query="CMS_TAB_QUERY"
            :focus="focus"
            :path="pageRoute?.path"
            :lock="lock"
            :locked="locked"
            @submit="save"
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
import { CMS_TAB_QUERY, cmsEntryLink, cmsPageKey, readSearchFocus } from '../../shared/search'
import { useCmsPermissions } from '../composables/cms-permissions'
import { CMS_NEW_RECORD } from '../composables/cms-route'
import { useCmsRuntime } from '../composables/cms-runtime'
import { cmsApi } from '../utils/api'
import type { CmsResponseIssue } from '../utils/ui'
import { cmsIcon, errorIssues, errorMessage } from '../utils/ui'

const FORM_ID = 'cms-entry-form'

definePageMeta({
   layout: 'cms-admin',
   middleware: 'cms-auth',
   content: 'page',
   validate: (route) => Object.hasOwn(cmsConfig, route.params.collection as string),
   key: (route) => cmsPageKey(route, [CMS_TAB_QUERY]),
})

const route = useRoute()
const focus = readSearchFocus(route.query)

const name = route.params.collection as string
const config = (cmsConfig as CmsConfig)[name]
if (!config || (config.kind !== 'collection' && config.kind !== 'page')) {
   throw createError({ statusCode: 404, statusMessage: 'Unknown collection', fatal: true })
}

const id = route.params.id as string | undefined

if (config.kind === 'collection') {
   const text = (key: string) => {
      const value = route.query[key]
      return typeof value === 'string' ? value : undefined
   }
   await navigateTo(
      cmsEntryLink(name, id ?? CMS_NEW_RECORD, {
         field: text('field'),
         locale: text('locale'),
         block: text('block'),
         tab: text(CMS_TAB_QUERY),
      }),
      { replace: true }
   )
}
const pageRoute = config.kind === 'page' && id ? pageRouteOf(config, id) : undefined
if (config.kind === 'page' && !pageRoute) {
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

const fields = pageRoute ? pageFields(config, pageRoute.path) : config.fields
const headerTitle = pageRoute?.label ?? config.label
const formKeys = Object.keys(fields)

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

if (pageRoute) {
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

const { entryLock } = useCmsPermissions()
const lock = computed(() => entryLock(name, config, { isNew: false }))

const locked = computed(() =>
   lockedFieldKeys(fields, JSON.parse(snapshot.value) as Record<string, unknown>)
)

const formRef = ref<{ setIssues: (issues: CmsResponseIssue[]) => void } | null>(null)

const dirty = computed(() => !lock.value && JSON.stringify(formState.value) !== snapshot.value)

useLeaveGuard(dirty)

async function save() {
   saving.value = true
   const submitted = cloneState(formState.value)
   try {
      const row = await cmsApi<Record<string, unknown>>(`${endpoint}/${id}`, {
         method: 'PUT',
         body: submitted,
      })
      const saved = pickFields(row ?? submitted)
      const merged = mergeSavedState(submitted, formState.value, saved)
      snapshot.value = JSON.stringify(saved)
      formState.value = merged.state
      if (merged.clean) {
         toast.success('Saved')
         await navigateTo(`/cms/${name}`)
         return
      }
      toast.success('Saved', { description: 'Changes made while saving are not saved yet.' })
   } catch (error) {
      formRef.value?.setIssues(errorIssues(error))
      toast.error('Save failed', { description: errorMessage(error) })
   } finally {
      saving.value = false
   }
}
</script>
