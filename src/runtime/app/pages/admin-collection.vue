<template>
   <div class="cms-page" :class="{ 'is-fill': isCollectionKind(config) && !error }">
      <KPageHeader
         :title="config.label"
         :icon="cmsIcon(kindMeta.icon)"
         :description="kindMeta.description"
      >
         <template v-if="config.kind !== 'single' && total" #badge>
            <span :key="total" class="cms-count">{{ total }}</span>
         </template>
         <template v-if="config.kind === 'single'" #actions>
            <KButton type="submit" :form="FORM_ID" label="Save" :loading="saving" />
         </template>
      </KPageHeader>

      <KEmptyState
         v-if="error"
         :icon="cmsIcon('exclamation-triangle')"
         title="Could not load entries"
      >
         <template #actions>
            <KButton
               label="Retry"
               :icon="cmsIcon('arrow-path')"
               variant="soft"
               :loading="status === 'pending'"
               @click="reload"
            />
         </template>
      </KEmptyState>

      <KCard v-else-if="config.kind === 'single'" variant="outline" padding="lg">
         <CmsEntryForm
            v-model="formState"
            :fields="config.fields"
            :tabs="config.tabs"
            :entry-name="name"
            :form-id="FORM_ID"
            :loading="saving"
            :focus="focus"
            @submit="saveSingle"
         />
      </KCard>

      <template v-else-if="config.kind === 'page'">
         <div v-if="total || searchTerm" class="cms-toolbar">
            <KInput
               v-model="search"
               :icon="cmsIcon('magnifying-glass')"
               placeholder="Search…"
               aria-label="Search pages"
               class="cms-toolbar-search"
            />
         </div>

         <KCard v-if="pageTree.length" variant="outline" padding="none" class="cms-tree">
            <NuxtLink
               v-for="(node, index) in pageTree"
               :key="String(node.row.id)"
               :to="`/cms/${name}/${node.row.id}`"
               class="cms-tree-row"
               :style="{
                  paddingLeft: `${1 + node.depth * 1.5}rem`,
                  '--cms-row-delay': `${Math.min(index, 14) * 24}ms`,
               }"
            >
               <KIcon
                  v-if="node.depth"
                  :name="cmsIcon('arrow-turn-left-up')"
                  class="cms-tree-branch"
               />
               <span class="cms-tree-doc">
                  <KIcon :name="cmsIcon('document-text')" />
               </span>
               <span class="cms-tree-text">
                  <span class="cms-tree-title">{{ node.row.label }}</span>
                  <span class="cms-tree-path">{{ node.row.path }}</span>
               </span>
               <span class="cms-tree-meta">{{ lastEdit(node.row.updatedAt) }}</span>
               <KIcon name="chevron-right" class="cms-tree-chevron" />
            </NuxtLink>
         </KCard>

         <KSpinner v-else-if="status === 'pending'" block />

         <KEmptyState
            v-else-if="searchTerm"
            :icon="cmsIcon('magnifying-glass')"
            title="No matching pages"
         />

         <KEmptyState
            v-else
            :icon="cmsIcon('document-text')"
            title="No pages yet"
            description="Pages come from the routes of the app."
         />

         <KPagination
            v-model:page="page"
            :total="total"
            :page-size="PAGE_SIZE"
            :show-summary="false"
         />
      </template>

      <template v-else>
         <div class="cms-toolbar">
            <KInput
               v-if="total || narrowed"
               v-model="search"
               :icon="cmsIcon('magnifying-glass')"
               placeholder="Search…"
               aria-label="Search entries"
               class="cms-toolbar-search"
            />
            <div class="cms-toolbar-actions">
               <KSelectionBar
                  :count="selected.length"
                  :total="rows.length"
                  :on-select-all="selectAll"
                  :on-clear="clearSelection"
               >
                  <template #actions>
                     <template v-if="drafts">
                        <KButton
                           label="Draft"
                           :icon="cmsIcon('pencil-square')"
                           variant="soft"
                           :disabled="saving"
                           @click="bulkStatus('draft')"
                        />
                        <KButton
                           label="Publish"
                           :icon="cmsIcon('check-circle')"
                           variant="soft"
                           :disabled="saving"
                           @click="bulkStatus('published')"
                        />
                     </template>
                     <KButton
                        v-if="selected.length === 1"
                        label="Duplicate"
                        :icon="cmsIcon('document-duplicate')"
                        variant="soft"
                        :disabled="saving"
                        @click="duplicateSelected"
                     />
                     <KButton
                        label="Delete"
                        :icon="cmsIcon('trash')"
                        tone="danger"
                        :loading="saving"
                        @click="bulkDelete"
                     />
                  </template>
               </KSelectionBar>
               <template v-if="!selected.length">
                  <KDropdownMenu :items="transferItems" placement="bottom-end">
                     <KButton
                        :icon="cmsIcon('arrows-up-down')"
                        variant="soft"
                        tone="neutral"
                        :loading="exporting"
                        aria-label="Import and export"
                        title="Import and export"
                     />
                  </KDropdownMenu>
                  <KButton label="New entry" icon="plus" @click="openCreate" />
               </template>
            </div>
         </div>

         <CmsListFilters
            v-if="filterKeys.length && (total || narrowed)"
            v-model="filters"
            :config="config"
            :keys="filterKeys"
            :relations="relations"
         />

         <KTable
            v-if="rows.length"
            v-model:selected="selected"
            v-model:sort="sort"
            selectable
            :rows="rows"
            :columns="columns"
            :row-key="rowKey"
            @row-click="onSelect"
         >
            <template v-for="key in mediaKeys" #[`cell-${key}`]="{ row }" :key="key">
               <CmsMediaThumb :value="mediaThumbValue(key, row[key])" />
            </template>
            <template v-if="drafts" #cell-status="{ row }">
               <CmsStatusBadge
                  :published="row.status === 'published'"
                  :scheduled="mounted && isContent && isScheduledContent(row)"
                  :at="formatDateTime(row.publishedAt)"
               />
            </template>
         </KTable>

         <KSpinner v-else-if="status === 'pending'" block />

         <KEmptyState
            v-else-if="narrowed"
            :icon="cmsIcon('magnifying-glass')"
            title="No matching entries"
            fill
         >
            <template v-if="filterCount" #actions>
               <KButton label="Clear filters" icon="x-mark" variant="soft" @click="filters = {}" />
            </template>
         </KEmptyState>

         <KEmptyState
            v-else
            :icon="cmsIcon('sparkles')"
            title="Nothing here yet"
            description="Entries you create will show up here."
            fill
         >
            <template #actions>
               <KButton label="New entry" icon="plus" variant="soft" @click="openCreate" />
            </template>
         </KEmptyState>

         <KPagination
            v-model:page="page"
            :total="total"
            :page-size="PAGE_SIZE"
            :show-summary="false"
         />

         <CmsEntryDrawer
            v-if="!isContent"
            v-model:open="drawerOpen"
            :collection="name"
            :config="config"
            :entry-id="drawerEntryId"
            :initial="drawerInitial"
            @saved="refresh"
            @deleted="onDrawerDeleted"
            @duplicate="openDuplicate"
         />

         <CmsImportModal
            v-model:open="importOpen"
            :collection="name"
            :config="config"
            @imported="refresh"
         />
      </template>
   </div>
</template>

<script setup lang="ts">
import type { CmsConfig, FieldConfig } from '#nuxt-cms'
import {
   isCollectionKind,
   isScheduledContent,
   isTranslatableField,
   isTranslatableMediaField,
   pageParentPath,
   pickTranslatedMedia,
   selectDisplayValue,
} from '#nuxt-cms'
import {
   computed,
   createError,
   definePageMeta,
   navigateTo,
   onMounted,
   ref,
   useFetch,
   useRoute,
   watch,
} from '#imports'
import type { MenuEntry, RowKey, TableColumn, TableSort } from '@xleddyl/443-components-vue'
import {
   Button as KButton,
   Card as KCard,
   DropdownMenu as KDropdownMenu,
   EmptyState as KEmptyState,
   Icon as KIcon,
   Input as KInput,
   PageHeader as KPageHeader,
   Pagination as KPagination,
   SelectionBar as KSelectionBar,
   Spinner as KSpinner,
   Table as KTable,
} from '@xleddyl/443-components-vue'
import cmsConfig from '#cms-config'
import { duplicateEntryValues } from '../../shared/duplicate'
import type { CmsListFilters } from '../../shared/list-filters'
import {
   entryListFilterKeys,
   listFilterQuery,
   parseListFilters,
   withoutListFilterQuery,
} from '../../shared/list-filters'
import { readSearchFocus } from '../../shared/search'
import type { CmsTransferFormat } from '../../shared/transfer'
import { canTransferCsv, exportFileName } from '../../shared/transfer'
import { useCmsConfirm } from '../composables/cms-confirm'
import { useCmsRuntime } from '../composables/cms-runtime'
import { entryListColumns, useCmsSettingsState } from '../composables/cms-settings'
import { useCmsToast } from '../composables/cms-toast'
import { cmsApi } from '../utils/api'
import { cmsIcon, errorMessage } from '../utils/ui'

definePageMeta({
   layout: 'cms-admin',
   middleware: 'cms-auth',
   validate: (route) => Object.hasOwn(cmsConfig, route.params.collection as string),
   key: (route) => `${route.path}${JSON.stringify(withoutListFilterQuery(route.query))}`,
})

const FORM_ID = 'cms-single-form'

const route = useRoute()
const toast = useCmsToast()
const focus = readSearchFocus(route.query)

const name = route.params.collection as string
const config = (cmsConfig as CmsConfig)[name]
if (!config) {
   throw createError({ statusCode: 404, statusMessage: 'Unknown collection', fatal: true })
}
const KIND_META = {
   collection: { icon: 'square-3-stack-3d', description: 'Collection of entries.' },
   single: { icon: 'document-text', description: 'Single entry, edited in place.' },
   page: { icon: 'window', description: 'Content for the routes of your app.' },
   content: { icon: 'newspaper', description: 'Items built from blocks, with scheduling.' },
}
const kindMeta = { ...KIND_META[config.kind], icon: config.icon ?? KIND_META[config.kind].icon }
const fieldKeys = Object.keys(config.fields)
const mediaKeys = fieldKeys.filter((key) => config.fields[key]!.type === 'media')
const isContent = config.kind === 'content'
const drafts = isCollectionKind(config) && !!config.drafts
const formKeys = drafts ? [...fieldKeys, 'status'] : fieldKeys

type Row = Record<string, unknown>

const endpoint: string = `/api/cms/admin/${name}`

const PAGE_SIZE = 25
const page = ref(1)
const search = ref('')
const searchTerm = ref('')
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
   clearTimeout(searchTimer)
   searchTimer = setTimeout(() => {
      searchTerm.value = value.trim()
      page.value = 1
   }, 300)
})

interface ListResponse {
   items: Row[]
   total: number
   relations?: Record<string, Record<string, unknown>>
}

const sort = ref<TableSort | null>(null)

watch(sort, () => {
   page.value = 1
})

const filters = computed<CmsListFilters>({
   get: () => (isCollectionKind(config) ? parseListFilters(config, route.query).filters : {}),
   set: (value) => {
      void navigateTo(
         { query: { ...withoutListFilterQuery(route.query), ...listFilterQuery(value) } },
         { replace: true }
      )
   },
})

const filterQuery = computed(() => listFilterQuery(filters.value))
const filterCount = computed(() => Object.keys(filterQuery.value).length)
const narrowed = computed(() => !!searchTerm.value || filterCount.value > 0)

watch(
   () => JSON.stringify(filterQuery.value),
   () => {
      page.value = 1
   }
)

const sortQuery = computed(() =>
   sort.value ? { sort: sort.value.key, order: sort.value.direction } : {}
)

const listQuery = computed(() => ({
   limit: PAGE_SIZE,
   offset: (page.value - 1) * PAGE_SIZE,
   ...(searchTerm.value ? { search: searchTerm.value } : {}),
   ...sortQuery.value,
   ...filterQuery.value,
}))

const { data, refresh, error, status } = await useFetch<ListResponse | Row | null>(endpoint, {
   query: config.kind === 'single' ? undefined : listQuery,
})

function isList(value: ListResponse | Row | null | undefined): value is ListResponse {
   return !!value && Array.isArray((value as ListResponse).items)
}

const rows = computed<Row[]>(() => (isList(data.value) ? data.value.items : []))

const mounted = ref(false)

onMounted(() => {
   mounted.value = true
})

function lastEdit(value: unknown) {
   if (typeof value !== 'string' || !value) return 'Never saved'
   const stamp = value.includes('T') ? value : value.replace(' ', 'T') + 'Z'
   const date = new Date(stamp)
   if (Number.isNaN(date.getTime())) return `Last edit ${value.slice(0, 10)}`
   if (!mounted.value) return `Last edit ${value.slice(0, 10)}`
   return `Last edit ${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
   })}`
}

const pageTree = computed(() => {
   const byPath = new Set(rows.value.map((row) => String(row.path)))
   const depthOf = (path: string) => {
      let depth = 0
      let parent = pageParentPath(path)
      while (parent) {
         if (byPath.has(parent)) depth++
         parent = pageParentPath(parent)
      }
      return depth
   }
   return rows.value.map((row) => ({ row, depth: depthOf(String(row.path)) }))
})
const total = computed(() => (isList(data.value) ? data.value.total : 0))
const relations = computed(() => (isList(data.value) ? data.value.relations ?? {} : {}))

const reload = async () => {
   await refresh()
   if (config.kind === 'single' && !error.value) {
      formState.value =
         data.value && !isList(data.value) ? pickFields(data.value as Row) : emptyState()
   }
}

const saving = ref(false)
const formState = ref<Record<string, unknown>>({})

function emptyState() {
   return Object.fromEntries(formKeys.map((k) => [k, null]))
}

function pickFields(row: Record<string, unknown>) {
   return Object.fromEntries(formKeys.map((k) => [k, row[k] ?? null]))
}

async function submit(action: () => Promise<unknown>) {
   if (saving.value) return false
   saving.value = true
   try {
      await action()
      await refresh()
      return true
   } catch (error) {
      toast.add({
         title: 'Save failed',
         description: errorMessage(error),
         color: 'error',
      })
      return false
   } finally {
      saving.value = false
   }
}

if (config.kind === 'single') {
   formState.value =
      data.value && !isList(data.value) ? pickFields(data.value as Row) : emptyState()
}

async function saveSingle() {
   const ok = await submit(() => cmsApi(endpoint, { method: 'PUT', body: formState.value }))
   if (ok) toast.add({ title: 'Saved', color: 'success' })
}

const { i18n: contentI18n } = useCmsRuntime()

function stripHtml(html: string) {
   return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
}

function truncate(value: string) {
   return value.length > 60 ? `${value.slice(0, 57)}…` : value
}

function localized(value: unknown): string {
   const record = value as Record<string, string>
   return record[contentI18n.defaultLocale] ?? Object.values(record)[0] ?? ''
}

function mediaThumbValue(key: string, value: unknown): string | null {
   const field = config?.fields[key]
   if (!field || !isTranslatableMediaField(field)) return (value as string | null) ?? null
   const locale = contentI18n.defaultLocale
   return pickTranslatedMedia(value as Record<string, string> | null, locale, locale)
}

function formatDateTime(value: unknown): string {
   if (typeof value !== 'string' || !value) return ''
   const date = new Date(value)
   if (Number.isNaN(date.getTime()) || !mounted.value) return value.slice(0, 16).replace('T', ' ')
   return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
   })}`
}

function relationLabel(field: FieldConfig, key: string, id: unknown): string {
   const title = relations.value[key]?.[String(id)]
   if (title == null || title === '') return `#${id}`
   const target = (cmsConfig as CmsConfig)[field.to!]
   const titleField = target?.titleField ? target.fields[target.titleField] : undefined
   const label =
      titleField && isTranslatableField(titleField)
         ? localized(title)
         : titleField?.type === 'select'
           ? selectDisplayValue(titleField, title)
           : String(title)
   return label || `#${id}`
}

function displayValue(field: FieldConfig, key: string, value: unknown): string {
   if (value == null || value === '') return ''
   if (isTranslatableField(field)) {
      const raw = localized(value)
      return truncate(field.type === 'richtext' ? stripHtml(raw) : raw)
   }
   switch (field.type) {
      case 'boolean':
         return value ? '✓' : '—'
      case 'richtext':
         return truncate(stripHtml(String(value)))
      case 'json':
         return truncate(JSON.stringify(value))
      case 'datetime':
         return formatDateTime(value)
      case 'select':
         return truncate(selectDisplayValue(field, value))
      case 'blocks':
         return `${(value as unknown[]).length} ▤`
      case 'relation': {
         const ids = Array.isArray(value) ? value : [value]
         if (!ids.length) return ''
         return truncate(ids.map((id) => relationLabel(field, key, id)).join(', '))
      }
      default:
         return truncate(String(value))
   }
}

function isSortable(field: FieldConfig) {
   if (field.type === 'blocks') return false
   return !(field.type === 'relation' && field.cardinality === 'many-to-many')
}

const settings = useCmsSettingsState()

const columns = computed<TableColumn<Row>[]>(() =>
   entryListColumns(name, settings.value).map((key) =>
      key === 'status' && !config.fields.status
         ? { key: 'status', label: 'Status', sortable: true }
         : {
              key,
              label: config.fields[key]!.label,
              value: (row: Row) => displayValue(config.fields[key]!, key, row[key]),
              sortable: isSortable(config.fields[key]!),
           }
   )
)

function rowKey(row: Row) {
   return String(row.id)
}

const filterKeys = computed(() => {
   if (!isCollectionKind(config)) return []
   const shown = entryListFilterKeys(config, entryListColumns(name, settings.value))
   const active = Object.keys(filters.value).filter((key) => !shown.includes(key))
   return [...shown, ...active]
})

const drawerOpen = ref(false)
const drawerEntryId = ref<string | null>(null)
const drawerInitial = ref<Row | null>(null)

function onSelect(row: Row) {
   if (isContent) {
      void navigateTo(`/cms/${name}/${row.id}`)
      return
   }
   drawerInitial.value = null
   drawerEntryId.value = String(row.id)
   drawerOpen.value = true
}

function openCreate() {
   if (isContent) {
      void navigateTo(`/cms/${name}/new`)
      return
   }
   drawerInitial.value = null
   drawerEntryId.value = null
   drawerOpen.value = true
}

function openDuplicate(values: Row) {
   drawerInitial.value = values
   drawerEntryId.value = null
   drawerOpen.value = true
}

async function duplicateSelected() {
   const id = selected.value.map(String)[0]
   if (!id || saving.value) return
   if (isContent) {
      void navigateTo({ path: `/cms/${name}/new`, query: { duplicate: id } })
      return
   }
   saving.value = true
   try {
      const entry = await cmsApi<Row>(`${endpoint}/${id}`)
      selected.value = []
      openDuplicate(duplicateEntryValues(config!, entry))
   } catch (error) {
      toast.add({ title: 'Could not load entry', description: errorMessage(error), color: 'error' })
   } finally {
      saving.value = false
   }
}

const importOpen = ref(false)
const exporting = ref(false)
const csvAvailable = canTransferCsv(config)

async function exportEntries(format: CmsTransferFormat, narrow: boolean) {
   if (exporting.value) return
   exporting.value = true
   try {
      const query = {
         format,
         ...sortQuery.value,
         ...(narrow && searchTerm.value ? { search: searchTerm.value } : {}),
         ...(narrow ? filterQuery.value : {}),
      }
      const blob = await $fetch<Blob>(`/api/cms/export/${name}`, { query, responseType: 'blob' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = exportFileName(name, format)
      link.click()
      URL.revokeObjectURL(url)
   } catch (error) {
      toast.add({ title: 'Export failed', description: errorMessage(error), color: 'error' })
   } finally {
      exporting.value = false
   }
}

const transferItems = computed<MenuEntry[]>(() => {
   const formats: CmsTransferFormat[] = csvAvailable ? ['json', 'csv'] : ['json']
   const exports = (narrow: boolean) =>
      formats.map((format) => ({
         label: `Export ${narrow ? 'filtered' : 'all'} as ${format.toUpperCase()}`,
         onSelect: () => void exportEntries(format, narrow),
      }))
   return [
      ...(narrowed.value ? exports(true) : []),
      ...exports(false),
      {
         label: 'Import from file…',
         onSelect: () => {
            importOpen.value = true
         },
      },
   ]
})

async function onDrawerDeleted() {
   if (rows.value.length === 1 && page.value > 1) page.value -= 1
   else await refresh()
}

const confirmAction = useCmsConfirm()

const selected = ref<RowKey[]>([])

watch(rows, (current) => {
   const ids = new Set(current.map((row) => String(row.id)))
   selected.value = selected.value.filter((id) => ids.has(String(id)))
})

function selectAll() {
   selected.value = rows.value.map(rowKey)
}

function clearSelection() {
   selected.value = []
}

function entriesLabel(count: number) {
   return `${count} ${count === 1 ? 'entry' : 'entries'}`
}

async function runBulk(ids: string[], action: (id: string) => Promise<unknown>) {
   saving.value = true
   try {
      const results = await Promise.allSettled(ids.map(action))
      const failed = results.flatMap((result, index) =>
         result.status === 'rejected' ? [{ id: ids[index]!, reason: result.reason }] : []
      )
      await refresh()
      selected.value = failed.map((f) => f.id)
      return failed
   } finally {
      saving.value = false
   }
}

function reportBulk(done: string, total: number, failed: { reason: unknown }[]) {
   const succeeded = total - failed.length
   if (succeeded) toast.add({ title: `${done}: ${entriesLabel(succeeded)}`, color: 'success' })
   if (failed.length) {
      toast.add({
         title: `${entriesLabel(failed.length)} not changed`,
         description: errorMessage(failed[0]!.reason),
         color: 'error',
      })
   }
}

async function bulkDelete() {
   const ids = selected.value.map(String)
   if (!ids.length || saving.value) return
   if (!(await confirmAction(`Delete ${entriesLabel(ids.length)}?`))) return
   const emptiesPage = ids.length >= rows.value.length && page.value > 1
   const failed = await runBulk(ids, (id) => cmsApi(`${endpoint}/${id}`, { method: 'DELETE' }))
   reportBulk('Deleted', ids.length, failed)
   if (!failed.length && emptiesPage) page.value -= 1
}

async function bulkStatus(status: 'draft' | 'published') {
   const ids = selected.value.map(String)
   if (!ids.length || saving.value) return
   const failed = await runBulk(ids, async (id) => {
      const entry = await cmsApi<Row>(`${endpoint}/${id}`)
      const body = Object.fromEntries(formKeys.map((key) => [key, entry[key] ?? null]))
      return cmsApi(`${endpoint}/${id}`, { method: 'PUT', body: { ...body, status } })
   })
   reportBulk(status === 'published' ? 'Published' : 'Moved to draft', ids.length, failed)
}
</script>
