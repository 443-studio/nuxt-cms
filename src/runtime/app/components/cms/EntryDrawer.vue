<template>
   <KFormDrawer
      v-model:open="open"
      size="lg"
      :title="title"
      :tabs="drawerTabs"
      :tab-route="CMS_ENTRY_TAB_ROUTE_KEY"
      :form="form"
      :loading="loading"
      :creating="isNew"
      :readonly="!!lock"
      :deletable="!isNew && canDelete"
      @delete="remove"
   >
      <template v-if="drafts && !loading" #title-trailing>
         <CmsStatusBadge :published="savedStatus === 'published'" />
      </template>

      <template v-if="!loading" #actions>
         <CmsTranslationMenu
            v-model="formState"
            :fields="config.fields"
            :disabled="!!lock"
            size="sm"
         />
         <KButton
            v-if="!isNew && canCreate"
            variant="soft"
            tone="neutral"
            size="sm"
            :icon="cmsIcon('document-duplicate')"
            :disabled="form.dirty.value"
            disabled-reason="Save the changes first"
            @click="emit('duplicate', String(entryId))"
         >
            Duplicate
         </KButton>
         <KButton
            v-if="drafts && !lock && canPublish"
            variant="soft"
            tone="neutral"
            size="sm"
            :icon="cmsIcon(published ? 'pencil-square' : 'check-circle')"
            :loading="form.submitting.value"
            @click="togglePublished"
         >
            {{ published ? 'Make draft' : 'Publish' }}
         </KButton>
      </template>

      <template #default="{ tab }">
         <CmsEntryForm
            ref="formRef"
            v-model="formState"
            :form="form"
            :tab="tab === undefined ? undefined : String(tab)"
            :fields="config.fields"
            :tabs="config.tabs"
            :entry-name="collection"
            :lock="lock"
            :locked="locked"
            :focus="focus"
            @update:tab="selectTab"
         />
      </template>
   </KFormDrawer>
</template>

<script setup lang="ts">
import type { CmsEntry } from '#nuxt-cms'
import { fieldTab, isTranslatableField, selectDisplayValue } from '#nuxt-cms'
import type { FormDrawerTab } from '@xleddyl/443-components-vue'
import {
   Button as KButton,
   FormDrawer as KFormDrawer,
   toast,
   useConfirm,
   useRouteState,
} from '@xleddyl/443-components-vue'
import { computed, nextTick, ref, watch } from '#imports'
import { duplicateEntryValues } from '../../../shared/duplicate'
import { entryDefaults, lockedFieldKeys } from '../../../shared/field-options'
import { cloneState, mergeSavedState } from '../../../shared/save-state'
import type { CmsSearchFocus } from '../../../shared/search'
import { CMS_ENTRY_TAB_ROUTE_KEY } from '../../../shared/search'
import { useCmsEntryForm } from '../../composables/cms-entry-form'
import { useCmsPermissions } from '../../composables/cms-permissions'
import { useCmsRuntime } from '../../composables/cms-runtime'
import { cmsApi } from '../../utils/api'
import type { CmsResponseIssue } from '../../utils/ui'
import { cmsIcon, errorMessage } from '../../utils/ui'

type Row = Record<string, unknown>

const props = withDefaults(
   defineProps<{
      collection: string
      config: CmsEntry
      entryId: string | null
      duplicateId?: string | null
      focus?: CmsSearchFocus | null
   }>(),
   { duplicateId: null, focus: null }
)

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
   saved: [id: string]
   created: [id: string]
   deleted: []
   duplicate: [id: string]
   missing: []
}>()

const confirm = useConfirm()
const routeTab = useRouteState(CMS_ENTRY_TAB_ROUTE_KEY, { location: 'hash', history: 'replace' })

const endpoint = computed(() => `/api/cms/admin/${props.collection}`)
const isNew = computed(() => props.entryId === null)
const drafts = computed(() => !!props.config.drafts)
const formKeys = computed(() =>
   drafts.value ? [...Object.keys(props.config.fields), 'status'] : Object.keys(props.config.fields)
)

const { i18n } = useCmsRuntime()

const loading = ref(false)
const formState = ref<Row>({})
const savedState = ref<Row>({})
const loadedId = ref<string | null>(null)
const formRef = ref<{
   setIssues: (issues: CmsResponseIssue[]) => void
   revealErrors: (errors: Record<string, string | undefined>) => void
} | null>(null)

const savedStatus = computed(() => savedState.value.status)

function emptyState(): Row {
   return Object.fromEntries(formKeys.value.map((key) => [key, null]))
}

function newState(): Row {
   return { ...emptyState(), ...entryDefaults(props.config.fields, i18n, { local: true }) }
}

function pickFields(row: Row): Row {
   return Object.fromEntries(formKeys.value.map((key) => [key, row[key] ?? null]))
}

const { can, entryLock } = useCmsPermissions()
const canPublish = computed(() => can(`${props.collection}.publish`))
const canCreate = computed(() => can(`${props.collection}.create`))
const canDelete = computed(
   () =>
      can(`${props.collection}.delete`) &&
      (!drafts.value || canPublish.value || savedStatus.value !== 'published')
)
const lock = computed(() =>
   loading.value
      ? null
      : entryLock(props.collection, props.config, {
           isNew: isNew.value,
           status: savedStatus.value,
        })
)

const locked = computed(() =>
   isNew.value ? [] : lockedFieldKeys(props.config.fields, savedState.value)
)

const entryName = computed(() => {
   const key = props.config.titleField
   const field = key ? props.config.fields[key] : undefined
   const value = key ? formState.value[key] : undefined
   if (!field || value == null || value === '') return ''
   if (isTranslatableField(field)) {
      const record = value as Record<string, string>
      return record[i18n.defaultLocale] ?? Object.values(record)[0] ?? ''
   }
   if (field.type === 'select') return selectDisplayValue(field, value)
   return String(value)
})

const title = computed(() => {
   if (isNew.value) return props.duplicateId ? 'Duplicate entry' : 'Add entry'
   return entryName.value || 'Untitled'
})

const drawerTabs = computed<FormDrawerTab[] | undefined>(() => {
   const tabs = props.config.tabs ?? []
   if (tabs.length < 2) return undefined
   return tabs.map((tab) => ({
      value: tab.id,
      label: tab.label,
      fields: Object.entries(props.config.fields)
         .filter(([, field]) => fieldTab(field, tabs) === tab.id)
         .map(([key]) => key),
   }))
})

function selectTab(value: string) {
   routeTab.value = value === drawerTabs.value?.[0]?.value ? undefined : value
}

const published = computed(() => formState.value.status === 'published')

function revertStatus() {
   if (drafts.value) formState.value.status = savedState.value.status ?? null
}

const form = useCmsEntryForm({
   state: formState,
   fields: () => props.config.fields,
   entryName: () => props.collection,
   drafts,
   onSubmit: save,
   onInvalid: (errors) => {
      revertStatus()
      formRef.value?.revealErrors(errors)
   },
})

function togglePublished() {
   formState.value.status = published.value ? 'draft' : 'published'
   void form.submit()
}

function applyState(saved: Row, current: Row = saved) {
   savedState.value = saved
   form.reset(saved)
   if (current !== saved) formState.value = current
}

let loadRequest = 0

async function load() {
   const request = ++loadRequest
   const id = props.entryId
   const source = id === null ? props.duplicateId : id
   const isStale = () => request !== loadRequest || props.entryId !== id || !open.value
   loadedId.value = id
   if (!source) {
      loading.value = false
      applyState(newState())
      return
   }
   loading.value = true
   try {
      const entry = await cmsApi<Row>(`${endpoint.value}/${source}`)
      if (isStale()) return
      if (id === null) {
         applyState(newState(), {
            ...emptyState(),
            ...pickFields(duplicateEntryValues(props.config, entry)),
         })
      } else {
         applyState(pickFields(entry))
      }
   } catch (error) {
      if (isStale()) return
      toast.error('Could not load entry', { description: errorMessage(error) })
      emit('missing')
   } finally {
      if (request === loadRequest) loading.value = false
   }
}

watch(
   () => [open.value, props.entryId, props.duplicateId] as const,
   ([isOpen], previous) => {
      if (!isOpen) return
      if (previous?.[0] && props.entryId !== null && loadedId.value === props.entryId) return
      void load()
   },
   { immediate: true }
)

async function save(values: Row) {
   const submitted = cloneState(values)
   try {
      const row = await (isNew.value
         ? cmsApi<Row>(endpoint.value, { method: 'POST', body: submitted })
         : cmsApi<Row>(`${endpoint.value}/${props.entryId}`, { method: 'PUT', body: submitted }))
      const saved = pickFields(row ?? submitted)
      const merged = mergeSavedState(submitted, formState.value, saved)
      const id = row?.id != null ? String(row.id) : props.entryId
      applyState(saved, merged.state)
      loadedId.value = id
      if (merged.clean) {
         toast.success('Saved')
         if (id) emit('saved', id)
         open.value = false
         return
      }
      toast.success('Saved', { description: 'Changes made while saving are not saved yet.' })
      if (id && isNew.value) emit('created', id)
      else if (id) emit('saved', id)
   } catch (error) {
      revertStatus()
      throw error
   }
}

async function remove() {
   if (
      !(await confirm.delete('Delete this entry?', {
         description: entryName.value
            ? `"${entryName.value}" is deleted for good.`
            : 'The entry is deleted for good.',
      }))
   )
      return
   try {
      await cmsApi(`${endpoint.value}/${props.entryId}`, { method: 'DELETE' })
      form.markClean()
      toast.success('Entry deleted')
      emit('deleted')
      await nextTick()
      open.value = false
   } catch (error) {
      toast.error('Delete failed', { description: errorMessage(error) })
   }
}
</script>
