<template>
   <KCard
      v-if="editing"
      variant="subtle"
      :title="editing === NEW ? 'New redirect' : 'Edit redirect'"
      class="cms-redirect-form"
   >
      <KForm :form="draft">
         <KGrid :columns="2">
            <KFormField label="From" name="from" :error="fromError" required>
               <KInput
                  v-model="draft.values.from"
                  :icon="cmsIcon('arrow-uturn-right')"
                  placeholder="/old-page"
                  autocomplete="off"
               />
            </KFormField>
            <KFormField label="To" name="to" :error="toError" required>
               <KInput
                  v-model="draft.values.to"
                  :icon="cmsIcon('arrow-right')"
                  placeholder="/new-page or https://example.com"
                  autocomplete="off"
               />
            </KFormField>
         </KGrid>
         <KGrid :columns="2">
            <KFormField label="Status" name="status">
               <KSelect v-model="draft.values.status" :options="STATUS_OPTIONS" />
            </KFormField>
            <KFormField label="Query string" name="keepQuery">
               <KSwitch v-model="draft.values.keepQuery" label="Keep the visitor's query" />
            </KFormField>
         </KGrid>
         <KStack direction="row" justify="end" gap="sm">
            <KButton label="Cancel" variant="ghost" tone="neutral" size="sm" @click="cancel" />
            <KButton
               type="submit"
               :label="editing === NEW ? 'Add redirect' : 'Save'"
               size="sm"
               :disabled="!!fromError || !!toError || !draft.values.from || !draft.values.to"
            />
         </KStack>
      </KForm>
   </KCard>

   <KStack direction="row" gap="sm" align="center" class="cms-redirect-toolbar">
      <KInput
         v-model="search"
         :icon="cmsIcon('magnifying-glass')"
         placeholder="Search redirects"
         clearable
         class="cms-redirect-search"
         aria-label="Search redirects"
      />
      <KDropdownMenu :items="menuItems" placement="bottom-end" label="Import and export">
         <KButton
            :icon="cmsIcon('ellipsis-horizontal')"
            variant="ghost"
            tone="neutral"
            size="sm"
            title="Import and export"
            aria-label="Import and export"
            :loading="importing"
         />
      </KDropdownMenu>
      <input
         ref="fileInput"
         type="file"
         accept=".csv,.json,text/csv,application/json"
         class="cms-redirect-file"
         @change="importFile"
      />
   </KStack>

   <KSpinner v-if="loading" />

   <template v-else-if="filtered.length">
      <ul class="cms-redirect-list">
         <li v-for="redirect in shown" :key="redirect.id" class="cms-redirect-row">
            <div class="cms-redirect-text">
               <span class="cms-redirect-paths">
                  <span class="cms-redirect-path">{{ redirect.from }}</span>
                  <KIcon :name="cmsIcon('arrow-right')" class="cms-redirect-arrow" />
                  <span class="cms-redirect-path">{{ redirect.to }}</span>
               </span>
               <span class="cms-redirect-meta">
                  {{ STATUS_LABELS[redirect.status] }}
                  · {{ redirect.keepQuery ? 'Keeps the query' : 'Drops the query' }} ·
                  {{ redirect.source === 'auto' ? 'Added when a page moved' : 'Added by hand' }}
               </span>
            </div>
            <KBadge :label="String(redirect.status)" size="sm" variant="outline" />
            <KStack direction="row" gap="none">
               <KButton
                  :icon="cmsIcon('pencil-square')"
                  variant="ghost"
                  tone="neutral"
                  size="sm"
                  title="Edit redirect"
                  aria-label="Edit redirect"
                  @click="startEdit(redirect)"
               />
               <KButton
                  :icon="cmsIcon('trash')"
                  variant="ghost"
                  tone="danger"
                  size="sm"
                  title="Delete redirect"
                  aria-label="Delete redirect"
                  @click="remove(redirect)"
               />
            </KStack>
         </li>
      </ul>
      <p v-if="filtered.length > shown.length" class="cms-redirect-hint">
         Showing {{ shown.length }} of {{ filtered.length }}. Search to narrow them down.
      </p>
   </template>

   <KEmptyState
      v-else-if="search"
      :icon="cmsIcon('magnifying-glass')"
      title="No redirects found"
      :description="`Nothing matches “${search}”.`"
   />

   <KEmptyState
      v-else-if="!editing"
      :icon="cmsIcon('arrow-uturn-right')"
      title="No redirects yet"
      description="A redirect sends visitors from an old path to a new one. Changing the slug of a published item adds one for you."
   />
</template>

<script setup lang="ts">
import type { CmsRedirect, CmsRedirectInput, CmsRedirectStatus } from '#nuxt-cms'
import {
   REDIRECT_IMPORT_MAX_ROWS,
   normalizeRedirectPath,
   redirectFromErrors,
   redirectRowsFromTable,
   redirectToErrors,
   redirectsToTable,
} from '#nuxt-cms'
import {
   Badge as KBadge,
   Button as KButton,
   Card as KCard,
   DropdownMenu as KDropdownMenu,
   EmptyState as KEmptyState,
   Form as KForm,
   FormField as KFormField,
   Grid as KGrid,
   Icon as KIcon,
   Input as KInput,
   Select as KSelect,
   Spinner as KSpinner,
   Stack as KStack,
   Switch as KSwitch,
   useForm,
} from '@xleddyl/443-components-vue'
import { computed, onMounted, ref, watch } from '#imports'
import { encodeCsv, parseCsv } from '../../../shared/transfer'
import { useCmsConfirm } from '../../composables/cms-confirm'
import { useCmsToast } from '../../composables/cms-toast'
import { cmsApi } from '../../utils/api'
import { cmsIcon, errorMessage } from '../../utils/ui'

const NEW = 'new'
const MAX_SHOWN = 200

const STATUS_LABELS: Record<CmsRedirectStatus, string> = {
   301: 'Moved permanently',
   302: 'Found (temporary)',
   307: 'Temporary redirect',
   308: 'Permanent redirect',
}

const STATUS_OPTIONS = (Object.entries(STATUS_LABELS) as [string, string][]).map(
   ([status, label]) => ({ value: Number(status), label: `${status} ${label}` })
)

const toast = useCmsToast()
const confirmAction = useCmsConfirm()

const creating = defineModel<boolean>('creating', { default: false })

const redirects = ref<CmsRedirect[]>([])
const loading = ref(true)
const search = ref('')
const editing = ref<string | null>(null)
const importing = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

async function load() {
   try {
      redirects.value = await cmsApi<CmsRedirect[]>('/api/cms/redirects')
   } catch (error) {
      toast.add({
         title: 'Could not load redirects',
         description: errorMessage(error),
         color: 'error',
      })
   } finally {
      loading.value = false
   }
}

onMounted(load)

const filtered = computed(() => {
   const term = search.value.trim().toLowerCase()
   if (!term) return redirects.value
   return redirects.value.filter(
      (redirect) =>
         redirect.from.toLowerCase().includes(term) || redirect.to.toLowerCase().includes(term)
   )
})

const shown = computed(() => filtered.value.slice(0, MAX_SHOWN))

const draft = useForm({
   schema: {
      from: { initial: (): string | null | undefined => '' },
      to: { initial: (): string | null | undefined => '' },
      status: { initial: (): CmsRedirectStatus | null => 301 },
      keepQuery: { initial: (): boolean => true },
   },
   onSubmit: save,
})

const fromError = computed(() => {
   const value = draft.values.from ?? ''
   return value ? redirectFromErrors(value)[0] : undefined
})

const toError = computed(() => {
   const value = draft.values.to ?? ''
   return value ? redirectToErrors(value)[0] : undefined
})

watch(creating, (value) => {
   if (!value) return
   startEdit(null)
})

function startEdit(redirect: CmsRedirect | null) {
   editing.value = redirect?.id ?? NEW
   draft.reset({
      from: redirect?.from ?? '',
      to: redirect?.to ?? '',
      status: redirect?.status ?? 301,
      keepQuery: redirect?.keepQuery ?? true,
   })
}

function cancel() {
   editing.value = null
   creating.value = false
}

function draftInput(): CmsRedirectInput {
   return {
      from: String(draft.values.from ?? '').trim(),
      to: String(draft.values.to ?? '').trim(),
      status: (draft.values.status ?? 301) as CmsRedirectStatus,
      keepQuery: !!draft.values.keepQuery,
   }
}

function sortRedirects(list: CmsRedirect[]) {
   return [...list].sort((a, b) => a.from.localeCompare(b.from))
}

async function save() {
   const id = editing.value
   try {
      const saved = await cmsApi<CmsRedirect>(
         id === NEW ? '/api/cms/redirects' : `/api/cms/redirects/${id}`,
         { method: id === NEW ? 'POST' : 'PUT', body: draftInput() }
      )
      redirects.value = sortRedirects([
         ...redirects.value.filter((redirect) => redirect.id !== saved.id),
         saved,
      ])
      toast.add({ title: id === NEW ? 'Redirect added' : 'Redirect saved', color: 'success' })
      cancel()
   } catch (error) {
      draft.setError('', errorMessage(error) ?? 'Redirect not saved.')
   }
}

async function remove(redirect: CmsRedirect) {
   if (!(await confirmAction(`Delete the redirect from ${redirect.from}?`))) return
   try {
      await cmsApi(`/api/cms/redirects/${redirect.id}`, { method: 'DELETE' })
      redirects.value = redirects.value.filter((candidate) => candidate.id !== redirect.id)
      if (editing.value === redirect.id) cancel()
      toast.add({ title: 'Redirect deleted', color: 'success' })
   } catch (error) {
      toast.add({ title: 'Redirect not deleted', description: errorMessage(error), color: 'error' })
   }
}

function download(content: string, type: string, extension: string) {
   const url = URL.createObjectURL(new Blob([content], { type }))
   const link = document.createElement('a')
   link.href = url
   link.download = `redirects.${extension}`
   link.click()
   URL.revokeObjectURL(url)
}

function exportCsv() {
   download(encodeCsv(redirectsToTable(redirects.value)), 'text/csv', 'csv')
}

function exportJson() {
   const rows = redirects.value.map(({ from, to, status, keepQuery }) => ({
      from,
      to,
      status,
      keepQuery,
   }))
   download(`${JSON.stringify(rows, null, 2)}\n`, 'application/json', 'json')
}

function parseImport(name: string, text: string): CmsRedirectInput[] {
   if (name.toLowerCase().endsWith('.json') || text.trim().startsWith('[')) {
      const rows = JSON.parse(text) as unknown
      if (!Array.isArray(rows)) throw new Error('The JSON file must hold an array of redirects')
      return rows as CmsRedirectInput[]
   }
   return redirectRowsFromTable(parseCsv(text))
}

async function importFile(event: Event) {
   const input = event.target as HTMLInputElement
   const file = input.files?.[0]
   input.value = ''
   if (!file) return
   importing.value = true
   try {
      const rows = parseImport(file.name, await file.text())
      if (!rows.length) throw new Error('The file holds no redirects')
      if (rows.length > REDIRECT_IMPORT_MAX_ROWS)
         throw new Error(`Import at most ${REDIRECT_IMPORT_MAX_ROWS} redirects at a time`)
      const updates = rows.filter((row) =>
         redirects.value.some(
            (redirect) => redirect.from === normalizeRedirectPath(String(row.from ?? ''))
         )
      ).length
      const question = updates
         ? `Import ${rows.length} redirects? ${updates} replace a redirect with the same From.`
         : `Import ${rows.length} redirects?`
      if (!(await confirmAction(question, { title: 'Import redirects', confirmLabel: 'Import' })))
         return
      const result = await cmsApi<{ created: number; updated: number }>(
         '/api/cms/redirects/import',
         { method: 'POST', body: { redirects: rows } }
      )
      await load()
      toast.add({
         title: 'Redirects imported',
         description: `${result.created} added, ${result.updated} updated.`,
         color: 'success',
      })
   } catch (error) {
      toast.add({ title: 'Import failed', description: errorMessage(error), color: 'error' })
   } finally {
      importing.value = false
   }
}

const menuItems = computed(() => [
   {
      label: 'Import CSV or JSON',
      icon: cmsIcon('arrow-up-tray'),
      onSelect: () => fileInput.value?.click(),
   },
   { type: 'separator' as const },
   {
      label: 'Export CSV',
      icon: cmsIcon('arrow-down-tray'),
      disabled: !redirects.value.length,
      onSelect: exportCsv,
   },
   {
      label: 'Export JSON',
      icon: cmsIcon('arrow-down-tray'),
      disabled: !redirects.value.length,
      onSelect: exportJson,
   },
])
</script>
