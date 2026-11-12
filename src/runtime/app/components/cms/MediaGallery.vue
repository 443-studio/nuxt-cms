<template>
   <KEmptyState
      v-if="notConfigured"
      :icon="cmsIcon('bolt')"
      title="Media storage not configured"
      description="Set cms.media in nuxt.config to enable uploads."
   />

   <div v-else ref="gallery" class="cms-media-gallery" :class="{ 'is-compact': selectable }">
      <div class="cms-media-toolbar">
         <KInput
            v-model="search"
            :icon="cmsIcon('magnifying-glass')"
            :placeholder="
               folder && !searchEverywhere
                  ? `Search in ${mediaFolderName(folder)}…`
                  : 'Search media…'
            "
            aria-label="Search media"
            clearable
            clear-label="Clear search"
            class="cms-media-search"
         />
         <KStack direction="row" gap="sm" align="center" wrap>
            <KDropdownMenu :items="sortItems" placement="bottom-end" label="Sort by">
               <KButton
                  :label="sortLabels[activeSort]"
                  :icon="cmsIcon('arrows-up-down')"
                  variant="ghost"
                  tone="neutral"
                  size="sm"
               />
            </KDropdownMenu>
            <KSegmentedControl
               v-model="view"
               :options="viewOptions"
               required
               icon-only
               size="sm"
               aria-label="View"
            />
            <template v-if="canUpload">
               <KButton
                  label="New folder"
                  :icon="cmsIcon('folder-plus')"
                  variant="soft"
                  tone="neutral"
                  size="sm"
                  :disabled="!canNest"
                  :disabled-reason="`Folders go ${MEDIA_FOLDER_MAX_DEPTH} levels deep at most`"
                  @click="openNewFolder"
               />
               <KButton
                  label="Upload"
                  :icon="cmsIcon('cloud-arrow-up')"
                  size="sm"
                  @click="uploadOpen = true"
               />
            </template>
         </KStack>
      </div>

      <KFieldMessage v-if="sourceHint" tone="neutral" :icon="false" :message="sourceHint" />

      <KStack direction="row" justify="between" align="center" gap="sm" wrap>
         <KBreadcrumbs :items="crumbs" :separator="cmsIcon('chevron-right')" label="Folder" />
         <KStack v-if="folder && canManage" direction="row" gap="xs" align="center">
            <KButton
               v-if="canMove"
               label="Rename"
               :icon="cmsIcon('pencil-square')"
               variant="ghost"
               tone="neutral"
               size="xs"
               @click="openRename"
            />
            <KButton
               v-if="canDeleteMedia"
               label="Delete folder"
               :icon="cmsIcon('trash')"
               variant="ghost"
               tone="danger"
               size="xs"
               @click="removeFolder(folder)"
            />
         </KStack>
      </KStack>

      <KProgress
         v-if="uploader.uploading.value"
         :value="uploader.done.value"
         :max="uploader.total.value"
         :label="uploadLabel"
         show-label
         show-value
      />

      <KSelectionBar
         :count="selection.length"
         :total="visibleFiles.length"
         :selected-text="(count) => `${count} selected`"
         placement="sticky"
         class="cms-media-selection-bar"
         @select-all="selectAll"
         @clear="clearSelection"
      >
         <template #actions>
            <KButton
               v-if="canMove"
               label="Move to…"
               :icon="cmsIcon('folder-arrow-down')"
               variant="soft"
               tone="neutral"
               size="xs"
               @click="openMove"
            />
            <KButton
               v-if="canDeleteMedia"
               label="Delete"
               :icon="cmsIcon('trash')"
               variant="soft"
               tone="danger"
               size="xs"
               @click="removeItems(selectedItems)"
            />
         </template>
      </KSelectionBar>

      <KStack
         v-if="!selection.length && (showTypeFilters || (query && folder))"
         direction="row"
         align="center"
         gap="sm"
         wrap
      >
         <KFilterPills
            v-if="showTypeFilters"
            v-model="filter"
            :options="filterOptions"
            label="File type"
            required
         />
         <KFilterPills
            v-if="query && folder"
            v-model="scopeValue"
            :options="scopeOptions"
            label="Search scope"
         />
      </KStack>

      <KSkeletonList v-if="library.loading.value" :rows="6" avatar class="cms-media-loading" />

      <KEmptyState
         v-else-if="loadError"
         :icon="cmsIcon('exclamation-triangle')"
         title="Could not load media"
      >
         <template #actions>
            <KButton
               label="Retry"
               :icon="cmsIcon('arrow-path')"
               variant="soft"
               tone="neutral"
               @click="library.reload()"
            />
         </template>
      </KEmptyState>

      <template v-else>
         <KStack v-if="recent.length" as="section" gap="sm">
            <KSeparator variant="heading" label="Recent" :level="3" :lines="false" />
            <KGrid :columns="6" min-item-width="4.5rem" gap="sm" class="cms-media-grid is-recent">
               <KTooltip v-for="item in recent" :key="item.key" :text="mediaFilename(item.key)">
                  <KCard
                     as="button"
                     type="button"
                     variant="outline"
                     padding="none"
                     :animated="false"
                     class="cms-media-tile is-selectable"
                     :aria-label="mediaFilename(item.key)"
                     @click="emitSelect(item)"
                  >
                     <KThumbnail :src="item.url ?? undefined" :kind="item.type" rounded="none" />
                  </KCard>
               </KTooltip>
            </KGrid>
         </KStack>

         <KStack v-if="visibleFolders.length" as="section" gap="sm">
            <KSeparator v-if="query" variant="heading" label="Folders" :level="3" :lines="false" />
            <KGrid :columns="6" min-item-width="13rem" gap="sm">
               <KTooltip v-for="child in visibleFolders" :key="child" :text="child">
                  <KCard
                     as="button"
                     type="button"
                     variant="outline"
                     padding="sm"
                     :icon="cmsIcon(dropTarget === targetId(child) ? 'folder-open' : 'folder')"
                     :title="query ? child : mediaFolderName(child)"
                     :description="folderMeta(child)"
                     :selected="dropTarget === targetId(child) || undefined"
                     :draggable="canMove"
                     @click="openFolder(child)"
                     @dragstart="onFolderDragStart($event, child)"
                     @dragend="onDragEnd"
                     @dragover="onTargetDragOver($event, child)"
                     @dragleave="onTargetDragLeave(child)"
                     @drop="onTargetDrop($event, child)"
                  />
               </KTooltip>
            </KGrid>
         </KStack>

         <KStack v-if="visibleFiles.length" as="section" gap="sm">
            <KSeparator
               v-if="query || visibleFolders.length || recent.length"
               variant="heading"
               :label="
                  query
                     ? `${visibleFiles.length} file${visibleFiles.length > 1 ? 's' : ''}`
                     : 'Files'
               "
               :level="3"
               :lines="false"
            />

            <KGrid
               v-if="view === 'grid'"
               :columns="selectable ? 3 : 5"
               min-item-width="10rem"
               class="cms-media-grid"
            >
               <KCard
                  v-for="item in paged"
                  :key="item.key"
                  variant="outline"
                  padding="none"
                  :animated="false"
                  :selected="canManage ? isSelected(item.key) : undefined"
                  role="button"
                  tabindex="0"
                  class="cms-media-tile is-selectable"
                  :class="{ 'is-dragging': draggingKeys.includes(item.key) }"
                  :draggable="canMove"
                  :aria-pressed="canManage ? isSelected(item.key) : undefined"
                  @click="onItemClick(item, $event)"
                  @keydown.enter.prevent="onItemClick(item, $event)"
                  @keydown.space.prevent="
                     canManage ? toggleSelect(item.key, $event) : onItemClick(item, $event)
                  "
                  @dragstart="onItemDragStart($event, item)"
                  @dragend="onDragEnd"
               >
                  <KThumbnail
                     :src="item.url ?? undefined"
                     :kind="item.type"
                     rounded="none"
                     :caption="tileInfo(item)"
                     :reveal="selection.length ? ['caption'] : ['caption', 'top-start']"
                  >
                     <template v-if="canManage" #top-start>
                        <span @click.stop>
                           <KCheckbox
                              :model-value="isSelected(item.key)"
                              :aria-label="`Select ${mediaFilename(item.key)}`"
                              tabindex="-1"
                              @update:model-value="toggleSelect(item.key)"
                           />
                        </span>
                     </template>
                  </KThumbnail>
                  <div class="cms-media-meta">
                     <KTooltip :text="item.key">
                        <div class="cms-media-name">{{ mediaFilename(item.key) }}</div>
                     </KTooltip>
                     <div v-if="query && item.folder" class="cms-media-folder">
                        <KIcon :name="cmsIcon('folder')" />{{ item.folder }}
                     </div>
                     <KStack v-if="!selectable" direction="row">
                        <KBadge
                           v-if="usageCount(item.key) !== null"
                           v-bind="usageBadge(item.key)"
                           size="sm"
                        />
                        <KSkeleton v-else width="5rem" />
                     </KStack>
                  </div>
               </KCard>
            </KGrid>

            <KTable
               v-else
               v-model:selected="selection"
               :rows="paged"
               :columns="listColumns"
               row-key="key"
               link-key="name"
               :selectable="canManage"
               label="Files"
               @row-click="
                  (item: MediaItem, _index: number, event: MouseEvent) => onItemClick(item, event)
               "
            >
               <template #cell-thumb="{ row }">
                  <span
                     :draggable="canMove || undefined"
                     @dragstart="onItemDragStart($event, row)"
                     @dragend="onDragEnd"
                  >
                     <CmsMediaThumb :value="row.key" />
                  </span>
               </template>
               <template #cell-name="{ row }">
                  {{ mediaFilename(row.key) }}
                  <span v-if="query && row.folder" class="cms-media-folder">
                     <KIcon :name="cmsIcon('folder')" />{{ row.folder }}
                  </span>
               </template>
               <template #cell-usage="{ row }">
                  <KBadge
                     v-if="usageCount(row.key) !== null"
                     v-bind="usageBadge(row.key)"
                     size="sm"
                  />
               </template>
            </KTable>
         </KStack>

         <KEmptyState
            v-if="!visibleFiles.length && !visibleFolders.length"
            :icon="cmsIcon(emptyState.icon)"
            :title="emptyState.title"
            :description="emptyState.description"
         >
            <template v-if="query || (canUpload && !hasTypedFiles)" #actions>
               <KButton
                  v-if="query"
                  label="Clear search"
                  :icon="cmsIcon('x-mark')"
                  variant="soft"
                  tone="neutral"
                  size="sm"
                  @click="search = ''"
               />
               <KButton
                  v-else
                  label="Upload"
                  :icon="cmsIcon('cloud-arrow-up')"
                  size="sm"
                  @click="uploadOpen = true"
               />
            </template>
         </KEmptyState>

         <KPagination
            v-if="visibleFiles.length > PAGE_SIZE"
            v-model:page="page"
            :total="visibleFiles.length"
            :page-size="PAGE_SIZE"
            size="sm"
            class="cms-media-pagination"
         />
      </template>

      <div v-if="fileDragActive" class="cms-media-drop-overlay">
         <KIcon :name="cmsIcon('cloud-arrow-up')" class="cms-media-drop-icon" />
         <span
            >Drop to upload to <strong>{{ dropTargetLabel }}</strong></span
         >
      </div>
   </div>

   <template v-if="!notConfigured">
      <KModal
         v-if="canUpload"
         v-model:open="uploadOpen"
         title="Upload media"
         description="Tip: you can also drop files or folders anywhere on the library, or on a folder."
      >
         <CmsMediaUpload
            :multiple="!selectable"
            :media-type="mediaType"
            :accept="accept"
            :folder="folder"
            :directories="!selectable"
            @uploaded="onUploaded"
         />
      </KModal>

      <KFormModal
         v-if="canUpload"
         v-model:open="newFolderOpen"
         title="New folder"
         size="sm"
         :form="newFolderForm"
         :guard="false"
         creating
         :submit-icon="cmsIcon('folder-plus')"
      >
         <KFormField
            label="Name"
            name="name"
            required
            :description="
               newFolderPath ? `Creates ${newFolderPath}/` : 'Letters, numbers and dashes.'
            "
         >
            <KInput v-model="folderDraft.name" autofocus placeholder="e.g. covers" />
         </KFormField>
      </KFormModal>

      <KFormModal
         v-if="canManage"
         v-model:open="renameOpen"
         title="Rename folder"
         size="sm"
         :form="renameForm"
         :guard="false"
      >
         <KFormField
            label="Name"
            name="name"
            required
            :description="
               renamePath ? `Moves ${folder}/ to ${renamePath}/` : 'Letters, numbers and dashes.'
            "
         >
            <KInput v-model="folderDraft.name" autofocus />
         </KFormField>
         <KFormField label="Location" name="parent">
            <CmsMediaFolderPicker
               v-model="folderDraft.parent"
               :folders="parentCandidates"
               :exclude="folder"
            />
         </KFormField>
      </KFormModal>

      <KFormModal
         v-if="canManage"
         v-model:open="moveOpen"
         :title="`Move ${selection.length} file${selection.length > 1 ? 's' : ''}`"
         size="sm"
         :form="moveForm"
         :guard="false"
         :require-dirty="false"
         submit-label="Move here"
      >
         <KFormField label="Folder" name="target">
            <CmsMediaFolderPicker v-model="moveDraft.target" :folders="library.folders.value" />
         </KFormField>
      </KFormModal>

      <CmsMediaDetail
         v-if="!selectable"
         :item="detail"
         :library="library"
         :read-only="readOnly"
         :can-edit="canWrite"
         :can-delete="canDeleteMedia"
         @close="detailKey = null"
         @delete="(item) => removeItems([item])"
      />
   </template>
</template>

<script setup lang="ts">
import type { MediaItem, MediaType, MediaUsageReport } from '#nuxt-cms'
import type {
   BreadcrumbItem,
   ChoiceOption,
   FilterPillOption,
   TableColumn,
} from '@xleddyl/443-components-vue'
import { computed, onMounted, ref, useTemplateRef, watch } from '#imports'
import {
   Badge as KBadge,
   Breadcrumbs as KBreadcrumbs,
   Button as KButton,
   Card as KCard,
   Checkbox as KCheckbox,
   DropdownMenu as KDropdownMenu,
   EmptyState as KEmptyState,
   FieldMessage as KFieldMessage,
   FilterPills as KFilterPills,
   FormField as KFormField,
   FormModal as KFormModal,
   Grid as KGrid,
   Icon as KIcon,
   Input as KInput,
   Modal as KModal,
   Pagination as KPagination,
   Progress as KProgress,
   SegmentedControl as KSegmentedControl,
   SelectionBar as KSelectionBar,
   Separator as KSeparator,
   Skeleton as KSkeleton,
   SkeletonList as KSkeletonList,
   Stack as KStack,
   Table as KTable,
   Thumbnail as KThumbnail,
   Tooltip as KTooltip,
   toast,
   useFileDrop,
   useForm,
   useRouteState,
} from '@xleddyl/443-components-vue'
import {
   isWithinMediaFolder,
   MEDIA_FOLDER_MAX_DEPTH,
   MEDIA_TYPES,
   formatFileSize,
   mediaFilename,
   mediaFolderAncestors,
   mediaFolderDepth,
   mediaFolderName,
   mediaFolderParent,
   groupMediaUsage,
   mediaUsageGroups,
   otherEntriesLabel,
   mediaTypeAccept,
   mediaTypeFilter,
   rebaseMediaFolder,
   slugify,
} from '#nuxt-cms'
import { useCmsConfirm } from '../../composables/cms-confirm'
import { useCmsPermissions } from '../../composables/cms-permissions'
import { useCmsMediaLibrary, usageLink } from '../../composables/cms-media-library'
import type { UploadTree } from '../../composables/cms-media-uploader'
import {
   uploadTreeFromDrop,
   uploadTreeFromFiles,
   useCmsMediaUploader,
} from '../../composables/cms-media-uploader'
import { CMS_MEDIA_ROUTE_KEY, useCmsOverlayFlag } from '../../composables/cms-route'
import { useCmsRuntime } from '../../composables/cms-runtime'
import { cmsIcon } from '../../utils/ui'

type SortKey = 'newest' | 'oldest' | 'name' | 'size'
type ViewMode = 'grid' | 'list'

const MEDIA_DRAG = 'application/x-cms-media'
const FOLDER_DRAG = 'application/x-cms-folder'
const VIEW_STORAGE_KEY = 'cms-media-view'
const PAGE_SIZE = 24
const RECENT_COUNT = 6

const filterLabels: Record<string, string> = {
   all: 'All',
   image: 'Images',
   video: 'Videos',
   file: 'Files',
}

const sortLabels: Record<SortKey, string> = {
   newest: 'Newest',
   oldest: 'Oldest',
   name: 'Name',
   size: 'Largest',
}

const viewOptions: ChoiceOption<ViewMode>[] = [
   { value: 'grid', label: 'Grid view', icon: cmsIcon('squares-2x2') },
   { value: 'list', label: 'List view', icon: cmsIcon('list-bullet') },
]

const SCOPE_EVERYWHERE = 'everywhere'

const scopeOptions: FilterPillOption<typeof SCOPE_EVERYWHERE>[] = [
   { value: SCOPE_EVERYWHERE, label: 'Search all folders', icon: cmsIcon('magnifying-glass') },
]

const props = defineProps<{
   selectable?: boolean
   mediaType?: MediaType | MediaType[]
   accept?: string[]
}>()

const emit = defineEmits<{ select: [item: { key: string; url: string | null }] }>()

const folder = defineModel<string | null>('folder', { default: null })
const confirmAction = useCmsConfirm()
const runtime = useCmsRuntime()
const library = useCmsMediaLibrary()
const uploader = useCmsMediaUploader()

const { can } = useCmsPermissions()
const readOnly = computed(() => runtime.mediaStorage === 'local')
const canWrite = computed(() => can('media.write'))
const canDeleteMedia = computed(() => can('media.delete'))
const canUpload = computed(() => !readOnly.value && canWrite.value)
const canManage = computed(
   () => !readOnly.value && !props.selectable && (canWrite.value || canDeleteMedia.value)
)
const canMove = computed(() => canManage.value && canWrite.value)
const canNest = computed(() => mediaFolderDepth(folder.value) < MEDIA_FOLDER_MAX_DEPTH)

onMounted(() => library.reload())

const notConfigured = computed(() => library.errorCode.value === 501)
const loadError = computed(
   () => library.errorCode.value !== null && library.errorCode.value !== 501
)

const sourceHint = computed(() => {
   const source = library.source.value
   if (!readOnly.value || !source) return null
   const { kind, root, builtAt } = source
   if (kind === 'filesystem') return `Read live from ${root}`
   if (kind === 'manifest') {
      const when = builtAt ? new Date(builtAt).toLocaleString() : 'the last build'
      return `From the build of ${when}. Add files to ${root} and redeploy to update.`
   }
   return 'No media folder was found at build time. Check cms.media.publicBaseUrl.'
})

watch(
   () => [library.loading.value, library.folders.value] as const,
   ([loading, folders]) => {
      if (loading || !folder.value || folders.includes(folder.value)) return
      folder.value =
         mediaFolderAncestors(folder.value)
            .reverse()
            .find((ancestor) => folders.includes(ancestor)) ?? null
   }
)

const allowedTypes = computed(() => mediaTypeFilter(props.mediaType))
const acceptAttr = computed(
   () => (props.accept?.length ? props.accept : mediaTypeAccept(props.mediaType))?.join(',')
)
const filters = computed<('all' | MediaType)[]>(() => [
   'all',
   ...(allowedTypes.value ?? MEDIA_TYPES),
])
const filter = ref<'all' | MediaType>('all')

const filterOptions = computed(() =>
   filters.value.map((value) => ({ value, label: filterLabels[value] ?? value }))
)

watch(filters, (list) => {
   if (!list.includes(filter.value)) filter.value = 'all'
})

const typedItems = computed(() => {
   const allowed = allowedTypes.value
   return allowed
      ? library.items.value.filter((item) => allowed.includes(item.type))
      : library.items.value
})

const hasTypedFiles = computed(() => typedItems.value.length > 0)
const showTypeFilters = computed(() => filters.value.length > 2 && hasTypedFiles.value)

const search = ref('')
const searchEverywhere = ref(false)
const query = computed(() => search.value.trim().toLowerCase())
const scope = computed(() => (searchEverywhere.value ? null : folder.value))

const scopeValue = computed<typeof SCOPE_EVERYWHERE | null>({
   get: () => (searchEverywhere.value ? SCOPE_EVERYWHERE : null),
   set: (value) => {
      searchEverywhere.value = value === SCOPE_EVERYWHERE
   },
})

const hasDates = computed(() => library.items.value.some((item) => item.createdAt))
const sort = ref<SortKey>('newest')

const activeSort = computed<SortKey>(() =>
   !hasDates.value && (sort.value === 'newest' || sort.value === 'oldest') ? 'name' : sort.value
)

const sortItems = computed(() =>
   (Object.keys(sortLabels) as SortKey[])
      .filter((key) => hasDates.value || (key !== 'newest' && key !== 'oldest'))
      .map((key) => ({
         label: sortLabels[key],
         type: 'radio' as const,
         checked: activeSort.value === key,
         onSelect: () => {
            sort.value = key
         },
      }))
)

function compareItems(a: MediaItem, b: MediaItem) {
   const byName = mediaFilename(a.key).localeCompare(mediaFilename(b.key))
   if (activeSort.value === 'name') return byName
   if (activeSort.value === 'size') return (b.size ?? 0) - (a.size ?? 0) || byName
   const delta = (Date.parse(b.createdAt ?? '') || 0) - (Date.parse(a.createdAt ?? '') || 0)
   return (activeSort.value === 'newest' ? delta : -delta) || byName
}

function matchesQuery(value: string | null | undefined) {
   return !!value && value.toLowerCase().includes(query.value)
}

const visibleFolders = computed(() => {
   if (!query.value) return library.childFolders(folder.value)
   return library.folders.value.filter(
      (candidate) =>
         candidate !== scope.value &&
         isWithinMediaFolder(candidate, scope.value) &&
         matchesQuery(mediaFolderName(candidate))
   )
})

const visibleFiles = computed(() => {
   let list = typedItems.value
   if (filter.value !== 'all') list = list.filter((item) => item.type === filter.value)
   if (query.value) {
      list = list.filter(
         (item) =>
            isWithinMediaFolder(item.folder, scope.value) &&
            [mediaFilename(item.key), item.alt, item.folder].some(matchesQuery)
      )
   } else {
      list = list.filter((item) => (item.folder ?? null) === folder.value)
   }
   return [...list].sort(compareItems)
})

const recent = computed(() => {
   if (!props.selectable || query.value || folder.value || page.value > 1) return []
   if (typedItems.value.length <= RECENT_COUNT) return []
   return typedItems.value
      .filter((item) => item.createdAt)
      .sort((a, b) => Date.parse(b.createdAt!) - Date.parse(a.createdAt!))
      .slice(0, RECENT_COUNT)
})

const page = ref(1)

watch([filter, folder, query, searchEverywhere, sort], () => {
   page.value = 1
})

watch(visibleFiles, (list) => {
   const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
   if (page.value > pageCount) page.value = pageCount
})

const paged = computed(() =>
   visibleFiles.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE)
)

const usageReport = ref<MediaUsageReport>({ usage: {}, hidden: {} })
let usageRequest = 0

watch(
   () => [props.selectable, library.loading.value, paged.value] as const,
   async ([selectable, loading, items]) => {
      const request = ++usageRequest
      if (selectable || loading || !items.length) return
      const usage = await library.usage(items.map((item) => item.key))
      if (request !== usageRequest) return
      usageReport.value = usage ?? { usage: {}, hidden: {} }
   },
   { immediate: true }
)

const usageCounts = computed(
   () =>
      new Map(
         Object.entries(usageReport.value.usage).map(([key, list]) => [
            key,
            groupMediaUsage(list).length + (usageReport.value.hidden[key] ?? 0),
         ])
      )
)

function usageCount(key: string) {
   return usageCounts.value.get(key) ?? null
}

function entriesLabel(count: number) {
   return `${count} entr${count === 1 ? 'y' : 'ies'}`
}

function usageLabel(key: string) {
   const count = usageCount(key)
   if (count === null) return ''
   return count ? `Used in ${entriesLabel(count)}` : 'Unused'
}

const emptyState = computed<{ icon: string; title: string; description?: string }>(() => {
   if (query.value) {
      return {
         icon: 'magnifying-glass',
         title: 'No matching media',
         description:
            searchEverywhere.value || !folder.value
               ? 'Try a different search or filter.'
               : 'Nothing here matches. Try searching all folders.',
      }
   }
   if (!library.items.value.length && !library.folders.value.length) {
      return {
         icon: 'photo',
         title: readOnly.value ? 'No media' : 'No media yet',
         description: readOnly.value
            ? 'No media registered.'
            : 'Drop files here or use Upload to add some.',
      }
   }
   if (folder.value) {
      return {
         icon: 'folder-open',
         title: 'This folder is empty',
         description: canUpload.value ? 'Drop files here or use Upload to add some.' : undefined,
      }
   }
   return {
      icon: 'photo',
      title: hasTypedFiles.value ? 'No files in the library root' : 'No matching media',
      description: hasTypedFiles.value
         ? 'Open a folder to see its files.'
         : 'No files of this type yet.',
   }
})

const view = ref<ViewMode>('grid')

onMounted(() => {
   try {
      if (localStorage.getItem(VIEW_STORAGE_KEY) === 'list') view.value = 'list'
   } catch {}
})

watch(view, (value) => {
   try {
      localStorage.setItem(VIEW_STORAGE_KEY, value)
   } catch {}
})

const crumbs = computed<BreadcrumbItem[]>(() =>
   [null, ...(folder.value ? mediaFolderAncestors(folder.value) : [])].map((path) => ({
      label: path ? mediaFolderName(path) : 'Library',
      icon: path ? undefined : cmsIcon('home'),
      onClick: () => openFolder(path),
      attrs: {
         class: { 'is-drop-target': dropTarget.value === targetId(path) },
         onDragover: (event: DragEvent) => onTargetDragOver(event, path),
         onDragleave: () => onTargetDragLeave(path),
         onDrop: (event: DragEvent) => onTargetDrop(event, path),
      },
   }))
)

function openFolder(target: string | null) {
   folder.value = target
   search.value = ''
   searchEverywhere.value = false
}

function folderMeta(path: string) {
   const stats = library.stats.value.get(path)
   if (!stats) return 'Empty'
   const parts: string[] = []
   if (stats.folders) parts.push(`${stats.folders} folder${stats.folders > 1 ? 's' : ''}`)
   if (stats.files) parts.push(`${stats.files} file${stats.files > 1 ? 's' : ''}`)
   return parts.join(' · ') || 'Empty'
}

const selection = ref<string[]>([])
const lastSelected = ref<string | null>(null)

const selectedItems = computed(() => {
   const keys = new Set(selection.value)
   return library.items.value.filter((item) => keys.has(item.key))
})

watch(folder, () => clearSelection())

watch(
   () => library.items.value,
   (items) => {
      const keys = new Set(items.map((item) => item.key))
      selection.value = selection.value.filter((key) => keys.has(key))
   }
)

function isSelected(key: string) {
   return selection.value.includes(key)
}

function toggleSelect(key: string, event?: Event) {
   const shift = (event as MouseEvent | undefined)?.shiftKey
   if (shift && lastSelected.value) {
      const keys = visibleFiles.value.map((item) => item.key)
      const from = keys.indexOf(lastSelected.value)
      const to = keys.indexOf(key)
      if (from !== -1 && to !== -1) {
         const range = keys.slice(Math.min(from, to), Math.max(from, to) + 1)
         selection.value = [...new Set([...selection.value, ...range])]
         lastSelected.value = key
         return
      }
   }
   selection.value = isSelected(key)
      ? selection.value.filter((entry) => entry !== key)
      : [...selection.value, key]
   lastSelected.value = key
}

function selectAll() {
   selection.value = visibleFiles.value.map((item) => item.key)
}

function clearSelection() {
   selection.value = []
   lastSelected.value = null
}

const detailRoute = useRouteState(CMS_MEDIA_ROUTE_KEY, { location: 'hash' })
const detailKey = computed<string | null>({
   get: () => (props.selectable ? null : detailRoute.value ?? null),
   set: (value) => {
      if (!props.selectable) detailRoute.value = value ?? undefined
   },
})
const detail = computed(
   () => library.items.value.find((item) => item.key === detailKey.value) ?? null
)

function emitSelect(item: MediaItem) {
   emit('select', { key: item.key, url: item.url })
}

function onItemClick(item: MediaItem, event: Event) {
   if (props.selectable) {
      emitSelect(item)
      return
   }
   if (
      canManage.value &&
      (selection.value.length ||
         (event as MouseEvent).metaKey ||
         (event as MouseEvent).ctrlKey ||
         (event as MouseEvent).shiftKey)
   ) {
      toggleSelect(item.key, event)
      return
   }
   detailKey.value = item.key
}

const busy = ref(false)

async function run(action: () => Promise<boolean>) {
   if (busy.value) return false
   busy.value = true
   try {
      return await action()
   } finally {
      busy.value = false
   }
}

const newFolderOpen = useCmsOverlayFlag('newfolder', !props.selectable)
const folderDraft = ref<{ name: string; parent: string | null }>({ name: '', parent: null })
const folderSlug = computed(() => slugify(folderDraft.value.name))
const newFolderPath = computed(() =>
   folderSlug.value
      ? folder.value
         ? `${folder.value}/${folderSlug.value}`
         : folderSlug.value
      : null
)

function openNewFolder() {
   newFolderOpen.value = true
}

watch(newFolderOpen, (open) => {
   if (open) newFolderForm.reset({ name: '', parent: null })
})

const folderNameRule = {
   required: true,
   maxLength: 64,
   validate: (value: string) => (slugify(value) ? undefined : 'Use letters, numbers or dashes'),
}

const newFolderForm = useForm({
   values: folderDraft,
   schema: { name: folderNameRule },
   guard: false,
   onSubmit: async () => {
      const path = newFolderPath.value
      if (!path) return
      if (!library.folders.value.includes(path) && !(await library.createFolder(path))) return
      newFolderOpen.value = false
      openFolder(path)
   },
})

const renameOpen = useCmsOverlayFlag('renamefolder', !props.selectable)

const parentCandidates = computed(() => {
   const own = folder.value
   if (!own) return []
   const subtreeDepth = Math.max(
      ...library.folders.value
         .filter((candidate) => isWithinMediaFolder(candidate, own))
         .map((candidate) => mediaFolderDepth(candidate) - mediaFolderDepth(own) + 1)
   )
   return library.folders.value.filter(
      (candidate) => mediaFolderDepth(candidate) + subtreeDepth <= MEDIA_FOLDER_MAX_DEPTH
   )
})

const renamePath = computed(() => {
   if (!folderSlug.value) return null
   const parent = folderDraft.value.parent
   return parent ? `${parent}/${folderSlug.value}` : folderSlug.value
})

function openRename() {
   if (folder.value) renameOpen.value = true
}

watch(renameOpen, (open) => {
   if (!open) return
   if (!folder.value) {
      renameOpen.value = false
      return
   }
   renameForm.reset({
      name: mediaFolderName(folder.value),
      parent: mediaFolderParent(folder.value),
   })
})

const renameForm = useForm({
   values: folderDraft,
   schema: { name: folderNameRule },
   guard: false,
   onSubmit: async () => {
      const from = folder.value
      const to = renamePath.value
      if (!from || !to || from === to) {
         renameOpen.value = false
         return
      }
      if (!(await library.moveFolder(from, to))) return
      renameOpen.value = false
      openFolder(to)
   },
})

async function confirmDelete(keys: string[], question: string) {
   const usage = await library.usage(keys)
   const groups = usage ? mediaUsageGroups(usage.usage, keys, usage.hidden) : []
   if (!groups.length) {
      const warning = usage ? '' : ' Could not check where the files are used.'
      return confirmAction({ title: question, description: warning.trim() || undefined })
   }
   const single = keys.length === 1
   const usedIn = single
      ? `This file is used in ${entriesLabel(groups[0]!.entries.length + groups[0]!.hidden)}.`
      : `${groups.length} of ${keys.length} files are used in your content.`
   return confirmAction({
      title: single ? 'File in use' : 'Files in use',
      description: `${question} ${usedIn} Deleting ${
         single ? 'it' : 'them'
      } leaves broken links there.`,
      confirmLabel: 'Delete anyway',
      groups: groups.map((group) => ({
         title: group.key,
         links: group.entries.map((entry) => ({
            title: entry.title ?? entry.label,
            meta: `${entry.label} · ${entry.fields.join(', ')}`,
            to: usageLink(entry),
         })),
         note: group.hidden ? otherEntriesLabel(group.hidden) : undefined,
      })),
   })
}

async function removeFolder(path: string) {
   const files = library.itemsWithin(path)
   const subfolders = library.folders.value.filter(
      (candidate) => candidate !== path && isWithinMediaFolder(candidate, path)
   ).length
   const contents: string[] = []
   if (subfolders) contents.push(`${subfolders} subfolder${subfolders > 1 ? 's' : ''}`)
   if (files.length) contents.push(`${files.length} file${files.length > 1 ? 's' : ''}`)
   const question = contents.length
      ? `Delete "${mediaFolderName(path)}" with ${contents.join(' and ')}?`
      : `Delete the empty folder "${mediaFolderName(path)}"?`
   if (
      !(await confirmDelete(
         files.map((item) => item.key),
         question
      ))
   )
      return
   const ok = await run(() => library.deleteFolder(path))
   if (ok && folder.value && isWithinMediaFolder(folder.value, path)) {
      openFolder(mediaFolderParent(path))
   }
}

async function removeItems(items: MediaItem[]) {
   if (!items.length) return
   const keys = items.map((item) => item.key)
   const question =
      keys.length === 1 ? `Delete "${mediaFilename(keys[0]!)}"?` : `Delete ${keys.length} files?`
   if (!(await confirmDelete(keys, question))) return
   const ok = await run(() => library.deleteItems(keys))
   if (!ok) return
   if (detailKey.value && keys.includes(detailKey.value)) detailKey.value = null
   clearSelection()
}

const moveOpen = useCmsOverlayFlag('move', !props.selectable)
const moveDraft = ref<{ target: string | null }>({ target: null })

function openMove() {
   moveOpen.value = true
}

watch(moveOpen, (open) => {
   if (!open) return
   if (!selection.value.length) {
      moveOpen.value = false
      return
   }
   moveForm.reset({ target: folder.value })
})

const moveForm = useForm({
   values: moveDraft,
   guard: false,
   onSubmit: async (values) => {
      if (!(await moveKeys(selection.value, values.target))) return
      moveOpen.value = false
      clearSelection()
   },
})

async function moveKeys(keys: string[], target: string | null) {
   const moving = keys.filter(
      (key) => (library.items.value.find((item) => item.key === key)?.folder ?? null) !== target
   )
   if (!moving.length) return true
   const ok = await run(() => library.moveItems(moving, target))
   if (ok) {
      toast.success(
         `Moved ${moving.length} file${moving.length > 1 ? 's' : ''} to ${target ?? 'Library root'}`
      )
   }
   return ok
}

const uploadOpen = useCmsOverlayFlag('upload', !props.selectable)

async function afterUpload(uploaded: MediaItem[]) {
   if (!uploaded.length) {
      if (!props.selectable) await library.reload({ quiet: true })
      return
   }
   if (props.selectable && uploaded[0]) {
      emitSelect(uploaded[0])
      return
   }
   await library.reload({ quiet: true })
   toast.success(`Uploaded ${uploaded.length} file${uploaded.length > 1 ? 's' : ''}`)
}

function onUploaded(uploaded: MediaItem[]) {
   uploadOpen.value = false
   void afterUpload(uploaded)
}

function droppedTree(event: DragEvent): Promise<UploadTree> | null {
   const data = event.dataTransfer
   if (!data?.files.length) return null
   return props.selectable
      ? Promise.resolve(uploadTreeFromFiles(data.files))
      : uploadTreeFromDrop(data)
}

async function uploadTree(pending: Promise<UploadTree>, target: string | null) {
   const tree = await pending
   const uploaded = await uploader.upload(tree, {
      folder: target,
      accept: acceptAttr.value,
      multiple: !props.selectable,
   })
   if (uploaded.length || tree.directories.length) await afterUpload(uploaded)
}

const draggingKeys = ref<string[]>([])
const draggingFolder = ref<string | null>(null)
const dropTarget = ref<string | null>(null)
const galleryEl = useTemplateRef<HTMLElement>('gallery')

const { over: fileDragOver } = useFileDrop(galleryEl, {
   disabled: () => !canUpload.value,
   ignore: (event) => event.defaultPrevented,
   onDrop: (_files, event) => {
      dropTarget.value = null
      const tree = droppedTree(event)
      if (tree) void uploadTree(tree, folder.value)
   },
})

const fileDragActive = computed(() => fileDragOver.value && canUpload.value)

const ROOT_TARGET = ':root'

function targetId(target: string | null) {
   return target ?? ROOT_TARGET
}

const dropTargetLabel = computed(() => {
   if (!dropTarget.value) return folder.value ?? 'Library root'
   return dropTarget.value === ROOT_TARGET ? 'Library root' : dropTarget.value
})

function hasFiles(event: DragEvent) {
   return !!event.dataTransfer?.types.includes('Files')
}

function onItemDragStart(event: DragEvent, item: MediaItem) {
   if (!canMove.value || !event.dataTransfer) return
   const keys = isSelected(item.key) ? [...selection.value] : [item.key]
   draggingKeys.value = keys
   event.dataTransfer.effectAllowed = 'move'
   event.dataTransfer.setData(MEDIA_DRAG, JSON.stringify(keys))
}

function onFolderDragStart(event: DragEvent, path: string) {
   if (!canMove.value || !event.dataTransfer) return
   draggingFolder.value = path
   event.dataTransfer.effectAllowed = 'move'
   event.dataTransfer.setData(FOLDER_DRAG, path)
}

function onDragEnd() {
   draggingKeys.value = []
   draggingFolder.value = null
   dropTarget.value = null
}

function folderMoveTarget(path: string, target: string | null) {
   const name = mediaFolderName(path)
   return target ? `${target}/${name}` : name
}

function acceptsDrop(event: DragEvent, target: string | null) {
   if (draggingKeys.value.length) return true
   if (draggingFolder.value) {
      const from = draggingFolder.value
      if (target && isWithinMediaFolder(target, from)) return false
      if (mediaFolderParent(from) === target) return false
      const depth = Math.max(
         ...library.folders.value
            .filter((candidate) => isWithinMediaFolder(candidate, from))
            .map((candidate) => mediaFolderDepth(candidate) - mediaFolderDepth(from) + 1)
      )
      return mediaFolderDepth(target) + depth <= MEDIA_FOLDER_MAX_DEPTH
   }
   return hasFiles(event) && canUpload.value
}

function onTargetDragOver(event: DragEvent, target: string | null) {
   if (!acceptsDrop(event, target)) return
   event.preventDefault()
   event.stopPropagation()
   if (event.dataTransfer) event.dataTransfer.dropEffect = hasFiles(event) ? 'copy' : 'move'
   dropTarget.value = targetId(target)
}

function onTargetDragLeave(target: string | null) {
   if (dropTarget.value === targetId(target)) dropTarget.value = null
}

async function onTargetDrop(event: DragEvent, target: string | null) {
   if (!acceptsDrop(event, target)) return
   event.preventDefault()
   const keys = [...draggingKeys.value]
   const path = draggingFolder.value
   const tree = hasFiles(event) ? droppedTree(event) : null
   onDragEnd()
   if (keys.length) {
      if (await moveKeys(keys, target)) clearSelection()
      return
   }
   if (path) {
      const to = folderMoveTarget(path, target)
      const ok = await run(() => library.moveFolder(path, to))
      if (ok && folder.value && isWithinMediaFolder(folder.value, path)) {
         folder.value = rebaseMediaFolder(folder.value, path, to)
      }
      return
   }
   if (tree) await uploadTree(tree, target)
}

const uploadLabel = computed(
   () =>
      `Uploading ${Math.min(uploader.done.value + 1, uploader.total.value)} of ${
         uploader.total.value
      } to ${folder.value ?? 'Library root'}`
)

const listColumns = computed<TableColumn<MediaItem>[]>(() => [
   { key: 'thumb', label: 'Preview', hideLabel: true, width: '3rem' },
   { key: 'name', label: 'Name', strong: true },
   ...(props.selectable ? [] : [{ key: 'usage', label: 'Usage' }]),
   { key: 'type', label: 'Type', value: (item: MediaItem) => extension(item.key).toUpperCase() },
   {
      key: 'size',
      label: 'Size',
      numeric: true,
      value: (item: MediaItem) => (item.size != null ? formatFileSize(item.size) : ''),
   },
   {
      key: 'dimensions',
      label: 'Dimensions',
      numeric: true,
      value: (item: MediaItem) => (item.width && item.height ? `${item.width}×${item.height}` : ''),
   },
   {
      key: 'created',
      label: 'Added',
      numeric: true,
      value: (item: MediaItem) =>
         item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '',
   },
])

function usageBadge(key: string) {
   const count = usageCount(key)
   return {
      label: usageLabel(key),
      icon: cmsIcon(count ? 'link' : 'link-slash'),
      tone: count ? ('accent' as const) : ('neutral' as const),
      variant: count ? ('soft' as const) : ('outline' as const),
   }
}

function tileInfo(item: MediaItem) {
   const parts = [extension(item.key)]
   if (item.size != null) parts.push(formatFileSize(item.size))
   if (item.width && item.height) parts.push(`${item.width}×${item.height}`)
   return parts.join(' · ')
}

function extension(key: string) {
   const dot = key.lastIndexOf('.')
   return dot === -1 ? 'file' : key.slice(dot + 1).toLowerCase()
}
</script>
