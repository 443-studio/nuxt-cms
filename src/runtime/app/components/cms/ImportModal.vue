<template>
   <KModal v-model:open="open" :title="`Import ${config.label}`" size="lg">
      <KStack gap="md">
         <p class="cms-settings-hint">
            {{ csv ? 'A JSON or CSV file' : 'A JSON file' }} in the format of the export, up to
            {{ maxSize }} and {{ IMPORT_MAX_ROWS }} rows. Media fields take keys of files that are
            already in the media library. Nothing is written until you confirm.
         </p>

         <KStack direction="row" gap="sm" wrap>
            <input
               ref="input"
               type="file"
               hidden
               :accept="csv ? '.json,.csv,application/json,text/csv' : '.json,application/json'"
               @change="onFile"
            />
            <KButton
               :label="file ? 'Choose another file' : 'Choose file'"
               :icon="cmsIcon('document-arrow-up')"
               variant="soft"
               tone="neutral"
               :disabled="busy"
               @click="input?.click()"
            />
            <span v-if="file" class="cms-import-file-name">
               {{ file.name }} · {{ formatFileSize(file.size) }}
            </span>
         </KStack>

         <KFormField
            label="Mode"
            :description="
               mode === 'create'
                  ? 'Every row becomes a new entry. A row with the id of an existing entry is an error.'
                  : 'A row with the id of an existing entry replaces it. Other rows become new entries.'
            "
         >
            <KSegmentedControl
               :model-value="mode"
               :options="MODE_OPTIONS"
               size="sm"
               required
               :disabled="busy"
               @update:model-value="setMode"
            />
         </KFormField>

         <KSpinner v-if="checking" />

         <KAlert
            v-else-if="fileErrors.length"
            tone="danger"
            role="alert"
            title="The file cannot be imported"
         >
            <ul class="cms-import-list">
               <li v-for="message in fileErrors" :key="message">{{ message }}</li>
            </ul>
         </KAlert>

         <template v-else-if="preview">
            <KAlert :tone="invalidCount ? 'warning' : 'success'" role="status" :title="summary" />
            <KTable
               :rows="shownRows"
               :columns="PREVIEW_COLUMNS"
               row-key="index"
               density="compact"
               max-height="20rem"
               label="Rows of the file"
            >
               <template #cell-title="{ row }">
                  <span class="cms-import-title">{{ row.title || row.id || 'Untitled' }}</span>
               </template>
               <template #cell-action="{ row }">
                  <KBadge :label="row.action === 'update' ? 'Update' : 'New'" size="sm" />
               </template>
               <template #cell-errors="{ row }">
                  <ul v-if="row.errors.length" class="cms-import-list cms-import-issues">
                     <li v-for="(issue, index) in row.errors" :key="index">
                        {{ issue.path ? `${issue.path}: ` : '' }}{{ issue.message }}
                     </li>
                  </ul>
                  <span v-else class="cms-import-ok">
                     <KIcon name="check" />
                     Ready
                  </span>
               </template>
            </KTable>
         </template>
      </KStack>

      <template #footer>
         <KButton label="Cancel" variant="soft" tone="neutral" @click="open = false" />
         <KButton
            :label="importLabel"
            :icon="cmsIcon('arrow-down-tray')"
            :disabled="!canImport"
            :loading="importing"
            @click="commit"
         />
      </template>
   </KModal>
</template>

<script setup lang="ts">
import type { CmsEntry } from '#nuxt-cms'
import { formatFileSize } from '#nuxt-cms'
import type { ChoiceOption, TableColumn } from '@xleddyl/443-components-vue'
import {
   Alert as KAlert,
   Badge as KBadge,
   Button as KButton,
   FormField as KFormField,
   Icon as KIcon,
   Modal as KModal,
   SegmentedControl as KSegmentedControl,
   Spinner as KSpinner,
   Stack as KStack,
   Table as KTable,
} from '@xleddyl/443-components-vue'
import { computed, ref, watch } from '#imports'
import type {
   CmsImportMode,
   CmsImportPreview,
   CmsImportPreviewRow,
   CmsTransferFormat,
} from '../../../shared/transfer'
import { canTransferCsv, IMPORT_MAX_BYTES, IMPORT_MAX_ROWS } from '../../../shared/transfer'
import { useCmsToast } from '../../composables/cms-toast'
import { cmsIcon, errorMessage } from '../../utils/ui'

const MODE_OPTIONS: ChoiceOption<CmsImportMode>[] = [
   { value: 'create', label: 'Create only' },
   { value: 'upsert', label: 'Create or update by id' },
]

const PREVIEW_COLUMNS: TableColumn<CmsImportPreviewRow>[] = [
   { key: 'index', label: 'Row', numeric: true, align: 'start' },
   { key: 'title', label: 'Entry' },
   { key: 'action', label: 'Action' },
   { key: 'errors', label: 'Problems' },
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
