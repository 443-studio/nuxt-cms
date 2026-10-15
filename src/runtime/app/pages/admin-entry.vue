<template>
   <div class="cms-page">
      <KPageHeader :title="headerTitle" :breadcrumbs="breadcrumb" breadcrumbs-ancestors>
         <template v-if="drafts" #badge>
            <CmsStatusBadge :published="published" />
         </template>
         <template #actions>
            <KButton label="Back" icon="arrow-left" variant="soft" @click="goBack" />
            <KButton type="submit" :form="FORM_ID" label="Save" :loading="saving" />
            <KButton
               v-if="drafts"
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
            v-model="formState"
            :fields="fields"
            :tabs="config.tabs"
            :entry-name="name"
            :drafts="drafts"
            :form-id="FORM_ID"
            :loading="saving"
            :focus="focus"
            :path="pageRoute?.path"
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
   onBeforeRouteLeave,
   onBeforeUnmount,
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
} from '@xleddyl/443-components-vue'
import cmsConfig from '#cms-config'
import { readSearchFocus } from '../../shared/search'
import { useCmsConfirm } from '../composables/cms-confirm'
import { useCmsToast } from '../composables/cms-toast'
import { cmsApi } from '../utils/api'
import { errorMessage } from '../utils/ui'

const FORM_ID = 'cms-entry-form'

definePageMeta({
   layout: 'cms-admin',
   middleware: 'cms-auth',
   validate: (route) => Object.hasOwn(cmsConfig, route.params.collection as string),
   key: (route) => route.fullPath,
})

const route = useRoute()
const toast = useCmsToast()
const focus = readSearchFocus(route.query)

const name = route.params.collection as string
const config = (cmsConfig as CmsConfig)[name]
if (!config || (config.kind !== 'collection' && config.kind !== 'page')) {
   throw createError({ statusCode: 404, statusMessage: 'Unknown collection', fatal: true })
}

const id = route.params.id as string | undefined
const isPage = config.kind === 'page'
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

function emptyState() {
   return Object.fromEntries(formKeys.map((k) => [k, null]))
}

function pickFields(row: Record<string, unknown>) {
   return Object.fromEntries(formKeys.map((k) => [k, row[k] ?? null]))
}

const formState = ref<Record<string, unknown>>(emptyState())

if (!isNew) {
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
const dirty = computed(() => JSON.stringify(formState.value) !== snapshot.value)

function onBeforeUnload(event: BeforeUnloadEvent) {
   event.preventDefault()
}

watch(dirty, (value) => {
   if (value) window.addEventListener('beforeunload', onBeforeUnload)
   else window.removeEventListener('beforeunload', onBeforeUnload)
})

onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

const confirmAction = useCmsConfirm()

onBeforeRouteLeave(async () => {
   if (dirty.value && !(await confirmAction('You have unsaved changes. Leave anyway?')))
      return false
})

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
   try {
      await (isNew
         ? cmsApi(endpoint, { method: 'POST', body: formState.value })
         : cmsApi(`${endpoint}/${id}`, { method: 'PUT', body: formState.value }))
      snapshot.value = JSON.stringify(formState.value)
      toast.add({ title: 'Saved', color: 'success' })
      goBack()
   } catch (error) {
      revertStatus()
      toast.add({
         title: 'Save failed',
         description: errorMessage(error),
         color: 'error',
      })
   } finally {
      saving.value = false
   }
}
</script>
