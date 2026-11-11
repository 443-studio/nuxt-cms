<template>
   <KDrawer v-model:open="open" :title="title" size="lg" :before-close="confirmClose">
      <template v-if="drafts && !loading" #title-trailing>
         <KBadge
            dot
            :tone="published ? 'success' : 'neutral'"
            :variant="published ? 'soft' : 'outline'"
            :label="published ? 'Published' : 'Draft'"
         />
      </template>

      <template v-if="!loading" #actions>
         <CmsTranslationMenu
            v-model="formState"
            :fields="config.fields"
            :disabled="!!lock"
            size="sm"
         />
      </template>

      <KStack v-if="loading" align="center" justify="center" class="cms-drawer-loading">
         <KSpinner size="lg" label="Loading" />
      </KStack>

      <CmsEntryForm
         v-else
         ref="formRef"
         v-model="formState"
         :fields="config.fields"
         :tabs="config.tabs"
         :entry-name="collection"
         :drafts="drafts"
         :form-id="FORM_ID"
         :loading="saving"
         :footer="false"
         :lock="lock"
         :can-publish="canPublish"
         :locked="locked"
         @submit="save"
         @error="revertStatus"
      />

      <template #footer>
         <KStack direction="row" justify="between" gap="sm" wrap class="cms-drawer-actions">
            <KStack v-if="!isNew && (canDelete || canCreate)" direction="row" gap="sm">
               <KButton
                  v-if="canDelete"
                  label="Delete"
                  icon="trash"
                  variant="ghost"
                  tone="danger"
                  :disabled="saving || loading"
                  @click="remove"
               />
               <KButton
                  v-if="canCreate"
                  label="Duplicate"
                  :icon="cmsIcon('document-duplicate')"
                  variant="ghost"
                  tone="neutral"
                  :disabled="saving || loading"
                  @click="duplicate"
               />
            </KStack>
            <span v-else />
            <KStack v-if="!lock" direction="row" gap="sm">
               <KButton
                  v-if="drafts && canPublish"
                  type="submit"
                  :form="FORM_ID"
                  :label="published ? 'Make draft' : 'Publish'"
                  variant="soft"
                  :loading="saving"
                  :disabled="loading"
                  @click="togglePublished"
               />
               <KButton
                  type="submit"
                  :form="FORM_ID"
                  label="Save"
                  :loading="saving"
                  :disabled="loading"
               />
            </KStack>
         </KStack>
      </template>
   </KDrawer>
</template>

<script setup lang="ts">
import type { CmsEntry } from '#nuxt-cms'
import { isTranslatableField, selectDisplayValue } from '#nuxt-cms'
import {
   Badge as KBadge,
   Button as KButton,
   Drawer as KDrawer,
   Spinner as KSpinner,
   Stack as KStack,
} from '@xleddyl/443-components-vue'
import { computed, ref, watch } from '#imports'
import { duplicateEntryValues } from '../../../shared/duplicate'
import { entryDefaults, lockedFieldKeys } from '../../../shared/field-options'
import { useCmsConfirm } from '../../composables/cms-confirm'
import { useCmsPermissions } from '../../composables/cms-permissions'
import { useCmsRuntime } from '../../composables/cms-runtime'
import { useCmsToast } from '../../composables/cms-toast'
import { cmsApi } from '../../utils/api'
import type { CmsResponseIssue } from '../../utils/ui'
import { cmsIcon, errorIssues, errorMessage } from '../../utils/ui'

const FORM_ID = 'cms-entry-drawer-form'

const props = defineProps<{
   collection: string
   config: CmsEntry
   entryId: string | null
   initial?: Record<string, unknown> | null
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
   saved: []
   deleted: []
   duplicate: [values: Record<string, unknown>]
}>()

const toast = useCmsToast()
const confirmAction = useCmsConfirm()

const endpoint = computed(() => `/api/cms/admin/${props.collection}`)
const isNew = computed(() => props.entryId === null)
const drafts = computed(() => !!props.config.drafts)
const formKeys = computed(() =>
   drafts.value ? [...Object.keys(props.config.fields), 'status'] : Object.keys(props.config.fields)
)

const { i18n: contentI18n } = useCmsRuntime()

const loading = ref(false)
const saving = ref(false)
const formState = ref<Record<string, unknown>>({})
const snapshot = ref('')

const entryName = computed(() => {
   const key = props.config.titleField
   const field = key ? props.config.fields[key] : undefined
   const value = key ? formState.value[key] : undefined
   if (!field || value == null || value === '') return ''
   if (isTranslatableField(field)) {
      const record = value as Record<string, string>
      return record[contentI18n.defaultLocale] ?? Object.values(record)[0] ?? ''
   }
   if (field.type === 'select') return selectDisplayValue(field, value)
   return String(value)
})

const title = computed(() => {
   if (isNew.value) return props.initial ? 'Duplicate entry' : 'Add entry'
   return entryName.value || 'Untitled'
})

function emptyState() {
   return Object.fromEntries(formKeys.value.map((key) => [key, null]))
}

function newState() {
   return { ...emptyState(), ...entryDefaults(props.config.fields, contentI18n, { local: true }) }
}

function pickFields(row: Record<string, unknown>) {
   return Object.fromEntries(formKeys.value.map((key) => [key, row[key] ?? null]))
}

function setState(state: Record<string, unknown>) {
   formState.value = state
   snapshot.value = JSON.stringify(state)
}

const { can, entryLock } = useCmsPermissions()
const canPublish = computed(() => can(`${props.collection}.publish`))
const canCreate = computed(() => can(`${props.collection}.create`))
const canDelete = computed(() => can(`${props.collection}.delete`))
const lock = computed(() =>
   loading.value
      ? null
      : entryLock(props.collection, props.config, {
           isNew: isNew.value,
           status: snapshot.value
              ? (JSON.parse(snapshot.value) as Record<string, unknown>).status
              : null,
        })
)

const locked = computed(() =>
   isNew.value || !snapshot.value
      ? []
      : lockedFieldKeys(props.config.fields, JSON.parse(snapshot.value) as Record<string, unknown>)
)

const formRef = ref<{ setIssues: (issues: CmsResponseIssue[]) => void } | null>(null)

const dirty = computed(() => !lock.value && JSON.stringify(formState.value) !== snapshot.value)

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
   if (!drafts.value) return
   formState.value.status = (JSON.parse(snapshot.value) as Record<string, unknown>).status ?? null
}

let loadRequest = 0

async function load() {
   const request = ++loadRequest
   const id = props.entryId
   if (id === null) {
      loading.value = false
      setState(props.initial ? emptyState() : newState())
      if (props.initial) formState.value = { ...emptyState(), ...pickFields(props.initial) }
      return
   }
   const isStale = () => request !== loadRequest || props.entryId !== id || !open.value
   loading.value = true
   try {
      const entry = await cmsApi<Record<string, unknown>>(`${endpoint.value}/${id}`)
      if (isStale()) return
      setState(pickFields(entry))
   } catch (error) {
      if (isStale()) return
      toast.add({
         title: 'Could not load entry',
         description: errorMessage(error),
         color: 'error',
      })
      open.value = false
   } finally {
      if (request === loadRequest) loading.value = false
   }
}

watch(
   () => [open.value, props.entryId, props.initial] as const,
   ([isOpen]) => {
      if (isOpen) load()
   },
   { immediate: true }
)

function confirmClose() {
   return !dirty.value || confirmAction('You have unsaved changes. Close anyway?')
}

async function save() {
   if (saving.value) return
   saving.value = true
   try {
      await (isNew.value
         ? cmsApi(endpoint.value, { method: 'POST', body: formState.value })
         : cmsApi(`${endpoint.value}/${props.entryId}`, {
              method: 'PUT',
              body: formState.value,
           }))
      snapshot.value = JSON.stringify(formState.value)
      toast.add({ title: 'Saved', color: 'success' })
      emit('saved')
      open.value = false
   } catch (error) {
      revertStatus()
      formRef.value?.setIssues(errorIssues(error))
      toast.add({
         title: 'Save failed',
         description: errorMessage(error),
         color: 'error',
      })
   } finally {
      saving.value = false
   }
}

async function duplicate() {
   if (
      dirty.value &&
      !(await confirmAction('You have unsaved changes. Duplicate the saved entry anyway?'))
   )
      return
   emit('duplicate', duplicateEntryValues(props.config, JSON.parse(snapshot.value)))
}

async function remove() {
   if (!(await confirmAction('Delete this row?'))) return
   saving.value = true
   try {
      await cmsApi(`${endpoint.value}/${props.entryId}`, { method: 'DELETE' })
      snapshot.value = JSON.stringify(formState.value)
      emit('deleted')
      open.value = false
   } catch (error) {
      toast.add({
         title: 'Delete failed',
         description: errorMessage(error),
         color: 'error',
      })
   } finally {
      saving.value = false
   }
}
</script>
