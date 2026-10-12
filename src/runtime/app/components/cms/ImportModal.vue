<template>
   <CmsModal v-model:open="open" :title="`Import ${config.label}`" size="lg">
      <div class="cms-form">
         <p class="cms-form-description">
            {{ csv ? 'A JSON or CSV file' : 'A JSON file' }} in the format of the export, up to
            {{ maxSize }} and {{ IMPORT_MAX_ROWS }} rows. Media fields take keys of files that are
            already in the media library. Nothing is written until you confirm.
         </p>

         <div class="cms-import-file">
            <input
               ref="input"
               type="file"
               class="hidden"
               :accept="csv ? '.json,.csv,application/json,text/csv' : '.json,application/json'"
               @change="onFile"
            />
            <CmsButton
               :label="file ? 'Choose another file' : 'Choose file'"
               icon="document-arrow-up"
               variant="soft"
               color="neutral"
               :disabled="busy"
               @click="input?.click()"
            />
            <span v-if="file" class="cms-import-file-name">
               {{ file.name }} · {{ formatFileSize(file.size) }}
            </span>
         </div>

         <CmsFormField
            label="Mode"
            :description="
               mode === 'create'
                  ? 'Every row becomes a new entry. A row with the id of an existing entry is an error.'
                  : 'A row with the id of an existing entry replaces it. Other rows become new entries.'
            "
         >
            <div class="cms-media-filters">
               <button
                  v-for="option in MODE_OPTIONS"
                  :key="option.value"
                  type="button"
                  class="cms-pill"
                  :class="{ 'is-active': mode === option.value }"
                  :disabled="busy"
                  @click="setMode(option.value)"
               >
                  {{ option.label }}
               </button>
            </div>
         </CmsFormField>

         <CmsSpinner v-if="checking" />

         <CmsAlert v-else-if="fileErrors.length" color="error" title="The file cannot be imported">
            <ul class="cms-import-list">
               <li v-for="message in fileErrors" :key="message">{{ message }}</li>
            </ul>
         </CmsAlert>

         <template v-else-if="preview">
            <CmsAlert :color="invalidCount ? 'warning' : 'success'" :title="summary" />
            <div class="cms-card cms-table-shell cms-import-preview">
               <div class="cms-table-scroll">
                  <table class="cms-table">
                     <thead>
                        <tr>
                           <th>Row</th>
                           <th>Entry</th>
                           <th>Action</th>
                           <th>Problems</th>
                        </tr>
                     </thead>
                     <tbody>
                        <tr v-for="row in shownRows" :key="row.index">
                           <td>{{ row.index }}</td>
                           <td class="cms-import-title">{{ row.title || row.id || 'Untitled' }}</td>
                           <td>
                              <span class="cms-tag">
                                 {{ row.action === 'update' ? 'Update' : 'New' }}
                              </span>
                           </td>
                           <td>
                              <ul
                                 v-if="row.errors.length"
                                 class="cms-import-list cms-import-issues"
                              >
                                 <li v-for="(issue, index) in row.errors" :key="index">
                                    {{ issue.path ? `${issue.path}: ` : '' }}{{ issue.message }}
                                 </li>
                              </ul>
                              <span v-else class="cms-import-ok">
                                 <CmsIcon name="check" class="size-3.5" />Ready
                              </span>
                           </td>
                        </tr>
                     </tbody>
                  </table>
               </div>
            </div>
         </template>

         <div class="cms-actions is-end">
            <CmsButton label="Cancel" variant="soft" color="neutral" @click="open = false" />
            <CmsButton
               :label="importLabel"
               icon="arrow-down-tray"
               :disabled="!canImport"
               :loading="importing"
               @click="commit"
            />
         </div>
      </div>
   </CmsModal>
</template>

<script setup lang="ts">
import type { CmsEntry } from '#nuxt-cms'
import { formatFileSize } from '#nuxt-cms'
import { computed, ref, watch } from '#imports'
import type { CmsImportMode, CmsImportPreview, CmsTransferFormat } from '../../../shared/transfer'
import { canTransferCsv, IMPORT_MAX_BYTES, IMPORT_MAX_ROWS } from '../../../shared/transfer'
import { useCmsToast } from '../../composables/cms-toast'
import { errorMessage } from '../../utils/ui'

const MODE_OPTIONS: { value: CmsImportMode; label: string }[] = [
   { value: 'create', label: 'Create only' },
   { value: 'upsert', label: 'Create or update by id' },
]

const props = defineProps<{
   collection: string
   config: CmsEntry
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{ imported: [] }>()

const toast = useCmsToast()

const csv = canTransferCsv(props.config)
const maxSize = formatFileSize(IMPORT_MAX_BYTES)

const input = ref<HTMLInputElement | null>(null)
const file = ref<File | null>(null)
const text = ref('')
const mode = ref<CmsImportMode>('create')
const preview = ref<CmsImportPreview | null>(null)
const fileErrors = ref<string[]>([])
const checking = ref(false)
const importing = ref(false)

const busy = computed(() => checking.value || importing.value)

const invalidCount = computed(() => (preview.value ? preview.value.total - preview.value.valid : 0))

const summary = computed(() => {
   const current = preview.value
   if (!current) return ''
   if (!current.total) return 'The file has no rows'
   const parts = [
      current.create ? `${current.create} new` : '',
      current.update ? `${current.update} to update` : '',
   ].filter(Boolean)
   const ready = parts.length ? parts.join(', ') : 'nothing ready'
   return invalidCount.value
      ? `${invalidCount.value} of ${current.total} rows have problems; fix the file and choose it again`
      : `${current.total} rows checked: ${ready}`
})

const shownRows = computed(() => {
   const rows = preview.value?.rows ?? []
   return invalidCount.value ? rows.filter((row) => row.errors.length) : rows
})

const canImport = computed(
   () =>
      !!preview.value &&
      !busy.value &&
      !fileErrors.value.length &&
      preview.value.total > 0 &&
      !invalidCount.value
)

const importLabel = computed(() => {
   const total = preview.value?.total ?? 0
   return total ? `Import ${total} ${total === 1 ? 'entry' : 'entries'}` : 'Import'
})

function formatOf(name: string): CmsTransferFormat {
   return name.toLowerCase().endsWith('.csv') ? 'csv' : 'json'
}

function reset() {
   file.value = null
   text.value = ''
   preview.value = null
   fileErrors.value = []
   mode.value = 'create'
   if (input.value) input.value.value = ''
}

watch(open, (value) => {
   if (value) reset()
})

function send(dryRun: boolean) {
   return $fetch<CmsImportPreview>(`/api/cms/import/${props.collection}`, {
      method: 'POST',
      query: { format: formatOf(file.value!.name), mode: mode.value, dryRun: String(dryRun) },
      body: text.value,
      headers: { 'content-type': 'text/plain' },
   })
}

function readPreview(error: unknown): CmsImportPreview | null {
   const data = (error as { data?: { data?: unknown } }).data?.data
   return data && typeof data === 'object' && Array.isArray((data as CmsImportPreview).rows)
      ? (data as CmsImportPreview)
      : null
}

async function check() {
   if (!file.value) return
   checking.value = true
   preview.value = null
   fileErrors.value = []
   try {
      const result = await send(true)
      preview.value = result
      fileErrors.value = result.errors
   } catch (error) {
      fileErrors.value = [errorMessage(error) ?? 'The file could not be checked']
   } finally {
      checking.value = false
   }
}

async function onFile(event: Event) {
   const picked = (event.target as HTMLInputElement).files?.[0]
   if (!picked) return
   file.value = picked
   preview.value = null
   if (picked.size > IMPORT_MAX_BYTES) {
      fileErrors.value = [`The file is larger than ${maxSize}`]
      return
   }
   if (formatOf(picked.name) === 'csv' && !csv) {
      fileErrors.value = ['This entry has blocks or many-to-many fields: use a JSON file']
      return
   }
   text.value = await picked.text()
   await check()
}

function setMode(value: CmsImportMode) {
   if (mode.value === value) return
   mode.value = value
   if (text.value) void check()
}

async function commit() {
   if (!canImport.value) return
   importing.value = true
   try {
      const result = await send(false)
      const count = result.create + result.update
      toast.add({
         title: `Imported ${count} ${count === 1 ? 'entry' : 'entries'}`,
         color: 'success',
      })
      emit('imported')
      open.value = false
   } catch (error) {
      const returned = readPreview(error)
      if (returned) {
         preview.value = returned
         fileErrors.value = returned.errors
      }
      toast.add({ title: 'Import failed', description: errorMessage(error), color: 'error' })
   } finally {
      importing.value = false
   }
}
</script>
