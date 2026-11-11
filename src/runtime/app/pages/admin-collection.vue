<template>
   <div v-if="config.kind === 'single'" class="k-page cms-page is-form">
      <KPageHeader
         :title="config.label"
         :icon="cmsIcon(kindMeta.icon)"
         :description="kindMeta.description"
      >
         <template v-if="!singleLock" #actions>
            <CmsTranslationMenu v-model="formState" :fields="config.fields" size="sm" />
            <KButton type="submit" :form="FORM_ID" label="Save" size="sm" :loading="saving" />
         </template>
      </KPageHeader>

      <KEmptyState
         v-if="error"
         :icon="cmsIcon('exclamation-triangle')"
         title="Could not load entries"
         :description="errorMessage(error)"
      >
         <template #actions>
            <KButton
               label="Retry"
               :icon="cmsIcon('arrow-path')"
               variant="soft"
               tone="neutral"
               size="sm"
               :loading="status === 'pending'"
               @click="reload"
            />
         </template>
      </KEmptyState>

      <KCard v-else variant="outline" padding="lg">
         <CmsEntryForm
            ref="singleForm"
            v-model="formState"
            :fields="config.fields"
            :tabs="config.tabs"
            :entry-name="name"
            :form-id="FORM_ID"
            :footer="false"
            :loading="saving"
            :focus="focus"
            :lock="singleLock"
            :locked="singleLocked"
            @submit="saveSingle"
         />
      </KCard>
   </div>

   <KListPage
      v-else
      v-model:page="page"
      v-model:page-size="pageSize"
      v-model:search="search"
      v-model:sort="sort"
      v-model:selected="selected"
      class="cms-page"
      :title="config.label"
      :icon="cmsIcon(kindMeta.icon)"
      :description="kindMeta.description"
      :rows="rows"
      :columns="columns"
      :row-key="rowKey"
      :table-label="config.label"
      :selectable="selectable"
      :loading="pending"
      :error="error ? errorMessage(error) : undefined"
      error-title="Could not load entries"
      :total="total"
      :page-sizes="PAGE_SIZES"
      searchable
      :search-placeholder="isPages ? 'Search pages' : 'Search entries'"
      :search-label="isPages ? 'Search pages' : 'Search entries'"
      toolbar-label="Search and filters"
      :filtered="filterCount > 0"
      :empty-icon="cmsIcon(isPages ? 'document-text' : 'sparkles')"
      :empty-title="isPages ? 'No pages yet' : 'Nothing here yet'"
      :empty-description="
         isPages
            ? 'Pages come from the routes of the app.'
            : 'Entries you create will show up here.'
      "
      no-results-title="No matching entries"
      no-results-description="Try another search or clear the filters."
      clear-label="Clear filters"
      :selected-text="(count: number) => `${count} selected`"
      :results-text="resultsLabel"
      @retry="reload"
      @clear="clearNarrowing"
      @row-click="onSelect"
   >
      <template v-if="isCollectionKind(config)" #actions>
         <KDropdownMenu v-if="transferItems.length" :items="transferItems" placement="bottom-end">
            <KButton
               :icon="cmsIcon('arrows-up-down')"
               variant="ghost"
               tone="neutral"
               size="sm"
               square
               :loading="exporting"
               aria-label="Import and export"
            />
         </KDropdownMenu>
         <KCommandButton v-if="newCommand" :command="newCommand" size="sm" />
      </template>

      <template v-if="newCommand" #empty-actions>
         <KCommandButton :command="newCommand" size="sm" />
      </template>

      <template v-if="filterKeys.length" #toolbar>
         <CmsListFilters
            v-model="filters"
            :config="config"
            :keys="filterKeys"
            :relations="relations"
         />
      </template>

      <template v-if="selectable" #bulk>
         <template v-if="canBulkStatus">
            <KButton
               label="Draft"
               :icon="cmsIcon('pencil-square')"
               variant="soft"
               tone="neutral"
               size="sm"
               :disabled="saving"
               @click="bulkStatus('draft')"
            />
            <KButton
               label="Publish"
               :icon="cmsIcon('check-circle')"
               variant="soft"
               tone="neutral"
               size="sm"
               :disabled="saving"
               @click="bulkStatus('published')"
            />
         </template>
         <KButton
            v-if="canCreate"
            label="Duplicate"
            :icon="cmsIcon('document-duplicate')"
            variant="soft"
            tone="neutral"
            size="sm"
            :disabled="saving || selected.length !== 1"
            disabled-reason="Select one entry to duplicate"
            @click="duplicateSelected"
         />
         <KButton
            v-if="canDelete"
            label="Delete"
            icon="trash"
            variant="soft"
            tone="danger"
            size="sm"
            :loading="saving"
            @click="bulkDelete"
         />
      </template>

      <template v-if="isPages" #table>
         <KSkeletonList
            v-if="pending && !pageTree.length"
            :rows="6"
            :lines="2"
            class="cms-list-loading"
         />
         <div v-else-if="pageTree.length" class="cms-tree" role="list" aria-label="Pages">
            <NuxtLink
               v-for="(node, index) in pageTree"
               :key="String(node.row.id)"
               :to="`/cms/${name}/${node.row.id}`"
               class="cms-tree-row"
               role="listitem"
               :style="{
                  paddingLeft: `${1.125 + node.depth * 1.5}rem`,
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
               <CmsTranslationBadges
                  v-if="pageTranslations"
                  :progress="pageProgress(node.row)"
                  class="cms-tree-translations"
               />
               <span class="cms-tree-meta">{{ lastEdit(node.row.updatedAt) }}</span>
               <KIcon name="chevron-right" class="cms-tree-chevron" />
            </NuxtLink>
         </div>
         <KEmptyState
            v-else
            variant="plain"
            size="sm"
            icon="magnifying-glass"
            title="No matching pages"
            class="cms-list-loading"
         >
            <template #actions>
               <KButton
                  label="Clear search"
                  variant="soft"
                  tone="neutral"
                  size="sm"
                  @click="clearNarrowing"
               />
            </template>
         </KEmptyState>
      </template>

      <template v-for="key in mediaKeys" #[`cell-${key}`]="{ row }" :key="key">
         <CmsMediaThumb :value="mediaThumbValue(key, row[key])" />
      </template>
      <template v-if="translationsShown" #[`cell-${TRANSLATIONS_COLUMN}`]="{ row }">
         <CmsTranslationBadges :progress="rowProgress(row)" />
      </template>
      <template v-if="drafts" #cell-status="{ row }">
         <CmsStatusBadge
            :published="row.status === 'published'"
            :scheduled="mounted && isContent && isScheduledContent(row)"
            :at="formatDateTime(row.publishedAt)"
         />
      </template>

      <template v-if="isCollectionKind(config)">
         <CmsEntryDrawer
            v-if="!isContent"
            v-model:open="drawerOpen"
            :collection="name"
            :config="config"
            :entry-id="entryRecord.isNew.value ? null : entryRecord.id.value"
            :duplicate-id="duplicateId"
            :focus="drawerFocus"
            @saved="() => refresh()"
            @created="onCreated"
            @deleted="onDrawerDeleted"
            @duplicate="(id: string) => openRecord(CMS_NEW_RECORD, { duplicate: id })"
            @missing="entryRecord.close()"
         />

         <CmsImportModal
            v-model:open="importOpen"
            :collection="name"
            :config="config"
            @imported="refresh"
         />
      </template>
   </KListPage>
</template>

<script setup lang="ts">
import type { CmsConfig, FieldConfig } from '#nuxt-cms'
import {
   isCollectionKind,
   isScheduledContent,
   isTranslatableField,
   isTranslatableMediaField,
   linkDisplayText,
   pageFields,
   pageParentPath,
   pickTranslatedMedia,
   relationTarget,
   selectDisplayValue,
} from '#nuxt-cms'
import {
   computed,
   createError,
   definePageMeta,
   navigateTo,
   onMounted,
   useRouter,
   useState,
   ref,
   useFetch,
   useRoute,
   watch,
} from '#imports'
import type {
   CommandItem,
   MenuEntry,
   PageSize,
   RowKey,
   TableColumn,
   TableSort,
} from '@xleddyl/443-components-vue'
import {
   Button as KButton,
   Card as KCard,
   CommandButton as KCommandButton,
   DropdownMenu as KDropdownMenu,
   EmptyState as KEmptyState,
   Icon as KIcon,
   ListPage as KListPage,
   PageHeader as KPageHeader,
   SkeletonList as KSkeletonList,
   routeHashValue,
   toast,
   useLeaveGuard,
   usePageCommands,
   useRouteRecord,
} from '@xleddyl/443-components-vue'
import cmsConfig from '#cms-config'
import { entryDefaults, lockedFieldKeys } from '../../shared/field-options'
import type { CmsListFilters } from '../../shared/list-filters'
import {
   LIST_FILTER_PREFIX,
   LIST_SEARCH_PARAM as CMS_LIST_SEARCH_PARAM,
   entryListFilterKeys,
   listFilterQuery,
   parseListFilters,
   withoutListFilterQuery,
} from '../../shared/list-filters'
import {
   CMS_ENTRY_FOCUS_KEYS,
   CMS_ENTRY_ROUTE_KEY,
   CMS_ENTRY_TAB_ROUTE_KEY,
   readSearchFocus,
} from '../../shared/search'
import type { CmsTransferFormat } from '../../shared/transfer'
import {
   TRANSLATIONS_COLUMN,
   entryHasTranslations,
   translationProgress,
} from '../../shared/translations'
import { canTransferCsv, exportFileName } from '../../shared/transfer'
import { useCmsPermissions } from '../composables/cms-permissions'
import { CMS_NEW_RECORD, useCmsPageQuery, useCmsRouteFlag } from '../composables/cms-route'
import { useCmsLinkedDelete } from '../composables/cms-link-usage'
import { useCmsRuntime } from '../composables/cms-runtime'
import { entryListColumns, useCmsSettingsState } from '../composables/cms-settings'
import { cmsApi } from '../utils/api'
import type { CmsResponseIssue } from '../utils/ui'
import { cmsIcon, errorIssues, errorMessage } from '../utils/ui'

definePageMeta({
   layout: 'cms-admin',
   middleware: 'cms-auth',
   validate: (route) => Object.hasOwn(cmsConfig, route.params.collection as string),
   content: 'fill',
   key: (route) => {
      const { [CMS_LIST_SEARCH_PARAM]: _search, ...query } = withoutListFilterQuery(route.query)
      return `${route.path}${JSON.stringify(query)}`
   },
})

const FORM_ID = 'cms-single-form'

const route = useRoute()
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
const isPages = config.kind === 'page'
const drafts = isCollectionKind(config) && !!config.drafts
const formKeys = drafts ? [...fieldKeys, 'status'] : fieldKeys

const { can, entryLock } = useCmsPermissions()
const canCreate = computed(() => can(`${name}.create`))
const canDelete = computed(() => can(`${name}.delete`))
const canBulkStatus = computed(() => drafts && can(`${name}.update`) && can(`${name}.publish`))
const selectable = computed(
   () => isCollectionKind(config) && (canCreate.value || canDelete.value || canBulkStatus.value)
)
const singleLock = computed(() =>
   config.kind === 'single' ? entryLock(name, config, { isNew: false }) : null
)

type Row = Record<string, unknown>

const endpoint: string = `/api/cms/admin/${name}`

const PAGE_SIZES: PageSize[] = [25, 50, 100]
const page = ref(1)
const pageSize = ref<PageSize>(25)
const limit = computed(() => (typeof pageSize.value === 'number' ? pageSize.value : 100))
const routeSearch = useCmsPageQuery(CMS_LIST_SEARCH_PARAM)
const search = ref(routeSearch.value)
const searchTerm = ref(search.value.trim())
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
   clearTimeout(searchTimer)
   searchTimer = setTimeout(() => {
      if (searchTerm.value === value.trim()) return
      searchTerm.value = value.trim()
      routeSearch.value = searchTerm.value
      page.value = 1
   }, 300)
})
const router = useRouter()
const listPath = route.path

function onListPage() {
   return router.currentRoute.value.path === listPath
}

watch(routeSearch, (value) => {
   if (value === searchTerm.value || !onListPage()) return
   search.value = value
   searchTerm.value = value
   page.value = 1
})
watch(pageSize, () => {
   page.value = 1
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
         {
            query: { ...withoutListFilterQuery(route.query), ...listFilterQuery(value) },
            hash: route.hash,
         },
         { replace: true }
      )
   },
})

const filterQuery = computed(() => listFilterQuery(filters.value))
const filterCount = computed(() => Object.keys(filterQuery.value).length)
const narrowed = computed(() => !!searchTerm.value || filterCount.value > 0)

const rememberedQuery = useState<Record<string, string>>(`cms-list-query-${name}`, () => ({}))

watch([filterQuery, searchTerm], () => {
   if (!onListPage()) return
   rememberedQuery.value = {
      ...filterQuery.value,
      ...(searchTerm.value ? { [CMS_LIST_SEARCH_PARAM]: searchTerm.value } : {}),
   }
})

onMounted(() => {
   const remembered = rememberedQuery.value
   const hasListQuery = Object.keys(route.query).some(
      (key) => key === CMS_LIST_SEARCH_PARAM || key.startsWith(LIST_FILTER_PREFIX)
   )
   if (hasListQuery || !Object.keys(remembered).length || !isCollectionKind(config)) return
   void navigateTo(
      { query: { ...route.query, ...remembered }, hash: route.hash },
      { replace: true }
   )
})

function clearNarrowing() {
   search.value = ''
   searchTerm.value = ''
   routeSearch.value = ''
   filters.value = {}
}

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
   limit: limit.value,
   offset: (page.value - 1) * limit.value,
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
const pending = computed(() => status.value === 'pending')

const reload = async () => {
   await refresh()
   if (config.kind === 'single' && !error.value) resetSingle()
}

const saving = ref(false)
const formState = ref<Record<string, unknown>>({})

const { i18n: contentI18n } = useCmsRuntime()

function emptyState() {
   return {
      ...Object.fromEntries(formKeys.map((k) => [k, null])),
      ...entryDefaults(config!.fields, contentI18n, { local: true }),
   }
}

const singleForm = ref<{ setIssues: (issues: CmsResponseIssue[]) => void } | null>(null)

const singleLocked = computed(() =>
   config!.kind === 'single' && data.value && !isList(data.value)
      ? lockedFieldKeys(config!.fields, data.value as Row)
      : []
)

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
      singleForm.value?.setIssues(errorIssues(error))
      toast.error('Save failed', { description: errorMessage(error) })
      return false
   } finally {
      saving.value = false
   }
}

const singleSnapshot = ref('')

function resetSingle() {
   formState.value =
      data.value && !isList(data.value) ? pickFields(data.value as Row) : emptyState()
   singleSnapshot.value = JSON.stringify(formState.value)
}

if (config.kind === 'single') resetSingle()

useLeaveGuard(
   () =>
      config!.kind === 'single' &&
      !singleLock.value &&
      JSON.stringify(formState.value) !== singleSnapshot.value
)

async function saveSingle() {
   const submitted = JSON.stringify(formState.value)
   const ok = await submit(() => cmsApi(endpoint, { method: 'PUT', body: formState.value }))
   if (ok) singleSnapshot.value = submitted
   if (ok) toast.success('Saved')
}

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
   const target = (cmsConfig as CmsConfig)[relationTarget(field)]
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
      case 'link':
         return truncate(
            linkDisplayText(value, contentI18n.defaultLocale, contentI18n.defaultLocale)
         )
      case 'datetime':
         return formatDateTime(value)
      case 'select':
         return truncate(selectDisplayValue(field, value))
      case 'tags':
         return Array.isArray(value) ? truncate(value.join(', ')) : ''
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
   if (field.type === 'blocks' || field.type === 'link') return false
   return !(field.type === 'relation' && field.cardinality === 'many-to-many')
}

const settings = useCmsSettingsState()

const listColumns = computed(() => entryListColumns(name, settings.value, contentI18n))

const translationsShown = computed(() => listColumns.value.includes(TRANSLATIONS_COLUMN))

const pageTranslations =
   config.kind === 'page' && contentI18n.locales.length > 1 && entryHasTranslations(config)

function rowProgress(row: Row) {
   return translationProgress(config!.fields, row, contentI18n)
}

function pageProgress(row: Row) {
   return translationProgress(pageFields(config!, String(row.path)), row, contentI18n)
}

const columns = computed<TableColumn<Row>[]>(() =>
   listColumns.value.map((key) =>
      key === TRANSLATIONS_COLUMN
         ? { key, label: 'Translations' }
         : key === 'status' && !config.fields.status
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
   const shown = entryListFilterKeys(config, listColumns.value)
   const active = Object.keys(filters.value).filter((key) => !shown.includes(key))
   return [...shown, ...active]
})

const entryRecord = useRouteRecord(CMS_ENTRY_ROUTE_KEY, {
   canCreate: () => canCreate.value,
   linkedKeys: [CMS_ENTRY_TAB_ROUTE_KEY, 'duplicate', ...CMS_ENTRY_FOCUS_KEYS],
})
const { openRecord } = entryRecord

const drawerOpen = computed({
   get: () => !isContent && !!entryRecord.param.value,
   set: (value: boolean) => {
      if (!value) void entryRecord.close()
   },
})

const duplicateId = computed(() =>
   entryRecord.isNew.value ? routeHashValue(route.hash, 'duplicate') ?? null : null
)

const drawerFocus = computed(() =>
   readSearchFocus(
      Object.fromEntries(CMS_ENTRY_FOCUS_KEYS.map((key) => [key, routeHashValue(route.hash, key)]))
   )
)

function onSelect(row: Row) {
   if (isContent) {
      void navigateTo(`/cms/${name}/${row.id}`)
      return
   }
   void openRecord(String(row.id))
}

function openCreate() {
   if (isContent) {
      void navigateTo(`/cms/${name}/new`)
      return
   }
   void openRecord(CMS_NEW_RECORD)
}

const newCommand = computed<CommandItem | null>(() =>
   isCollectionKind(config) && canCreate.value
      ? {
           id: 'new-entry',
           label: 'New entry',
           icon: 'plus',
           keywords: [config.label],
           onSelect: openCreate,
        }
      : null
)

usePageCommands(() => (newCommand.value ? [newCommand.value] : []))

function onCreated(id: string) {
   void refresh()
   void entryRecord.replaceId(id)
}

function duplicateSelected() {
   const id = selected.value.map(String)[0]
   if (!id) return
   if (isContent) {
      void navigateTo({ path: `/cms/${name}/new`, query: { duplicate: id } })
      return
   }
   selected.value = []
   void openRecord(CMS_NEW_RECORD, { duplicate: id })
}

const importOpen = useCmsRouteFlag('import')
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
      toast.error('Export failed', { description: errorMessage(error) })
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
      ...(can(`${name}.export`)
         ? [...(narrowed.value ? exports(true) : []), ...exports(false)]
         : []),
      ...(can(`${name}.import`) && canCreate.value
         ? [
              {
                 label: 'Import from file…',
                 onSelect: () => {
                    importOpen.value = true
                 },
              },
           ]
         : []),
   ]
})

async function onDrawerDeleted() {
   if (rows.value.length === 1 && page.value > 1) page.value -= 1
   else await refresh()
}

const confirmLinkedDelete = useCmsLinkedDelete()

const selected = ref<RowKey[]>([])

watch(rows, (current) => {
   const ids = new Set(current.map((row) => String(row.id)))
   selected.value = selected.value.filter((id) => ids.has(String(id)))
})

function entriesLabel(count: number) {
   return `${count} ${count === 1 ? 'entry' : 'entries'}`
}

function resultsLabel(count: number) {
   return isPages ? `${count} ${count === 1 ? 'page' : 'pages'}` : entriesLabel(count)
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
   if (succeeded) toast.success(`${done}: ${entriesLabel(succeeded)}`)
   if (failed.length) {
      toast.error(`${entriesLabel(failed.length)} not changed`, {
         description: errorMessage(failed[0]!.reason),
      })
   }
}

async function bulkDelete() {
   const ids = selected.value.map(String)
   if (!ids.length || saving.value) return
   const titles = Object.fromEntries(
      ids.map((id) => {
         const row = rows.value.find((candidate) => String(candidate.id) === id)
         const field = config?.titleField ? config.fields[config.titleField] : undefined
         const title =
            row && field && config?.titleField
               ? displayValue(field, config.titleField, row[config.titleField])
               : ''
         return [id, title || `#${id}`]
      })
   )
   if (!(await confirmLinkedDelete(name, ids, `Delete ${entriesLabel(ids.length)}?`, titles)))
      return
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
