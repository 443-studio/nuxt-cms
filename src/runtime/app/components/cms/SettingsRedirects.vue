<template>
   <KFieldset v-if="page && (isNew || current)">
      <CmsSettingsRedirectForm :key="page.id" :redirect="current" @saved="onSaved" />
   </KFieldset>
   <KSkeletonForm v-else-if="page && !store.loaded.value" :fields="4" :columns="2" />
   <div v-else class="cms-stack">
      <KInput
         v-if="store.items.value.length"
         v-model="search"
         type="search"
         size="sm"
         icon="magnifying-glass"
         clearable
         placeholder="Search redirects"
         aria-label="Search redirects"
      />
      <KRecordList
         :items="items"
         :loading="!store.loaded.value"
         label="Redirects"
         :empty-icon="cmsIcon(search ? 'magnifying-glass' : 'arrow-uturn-right')"
         :empty-text="search ? 'No redirects found' : 'No redirects yet'"
         :empty-description="
            search
               ? `Nothing matches “${search}”.`
               : 'A redirect sends visitors from an old path to a new one. Changing the slug of a published item adds one for you.'
         "
         @row-click="(item) => open((item as RedirectItem).redirect)"
      >
         <template #action="{ item }">
            <KButton
               :icon="cmsIcon('pencil')"
               variant="ghost"
               tone="neutral"
               size="sm"
               square
               aria-label="Edit"
               @click="open((item as RedirectItem).redirect)"
            />
         </template>
         <template v-if="!search" #empty-actions>
            <CmsSettingsEmptyAdd
               label="Add redirect"
               new-label="New redirect"
               @open="emit('open', $event)"
            />
         </template>
      </KRecordList>
      <KPagination
         v-if="filtered.length > PAGE_SIZE"
         v-model:page="pageNumber"
         :total="filtered.length"
         :page-size="PAGE_SIZE"
         size="sm"
      />
   </div>
</template>

<script setup lang="ts">
import type { CmsRedirect, CmsRedirectStatus } from '#nuxt-cms'
import type { RecordListItem, SettingsModalPage } from '@xleddyl/443-components-vue'
import {
   Button as KButton,
   Fieldset as KFieldset,
   Input as KInput,
   Pagination as KPagination,
   RecordList as KRecordList,
   SkeletonForm as KSkeletonForm,
} from '@xleddyl/443-components-vue'
import { computed, onMounted, ref, watch } from '#imports'
import { CMS_NEW_RECORD } from '../../composables/cms-route'
import { useCmsRedirects } from '../../composables/cms-settings-stores'
import { cmsIcon } from '../../utils/ui'
import { REDIRECT_STATUS_LABELS } from '../../utils/redirects'

type RedirectItem = RecordListItem & { redirect: CmsRedirect }

const PAGE_SIZE = 25

const props = defineProps<{ page?: SettingsModalPage }>()
const emit = defineEmits<{ open: [page: SettingsModalPage]; back: [] }>()

const store = useCmsRedirects()

onMounted(store.load)

const isNew = computed(() => props.page?.id === CMS_NEW_RECORD)
const current = computed(() => store.find(props.page?.id))

const search = ref('')
const pageNumber = ref(1)

watch(search, () => {
   pageNumber.value = 1
})

const filtered = computed(() => {
   const term = search.value.trim().toLowerCase()
   const list = store.sorted.value
   if (!term) return list
   return list.filter(
      (redirect) =>
         redirect.from.toLowerCase().includes(term) || redirect.to.toLowerCase().includes(term)
   )
})

function statusLabel(status: CmsRedirectStatus) {
   return REDIRECT_STATUS_LABELS[status]
}

const items = computed<RedirectItem[]>(() =>
   filtered.value
      .slice((pageNumber.value - 1) * PAGE_SIZE, pageNumber.value * PAGE_SIZE)
      .map((redirect) => ({
         id: redirect.id,
         redirect,
         title: `${redirect.from} → ${redirect.to}`,
         description: [
            statusLabel(redirect.status),
            redirect.keepQuery ? 'Keeps the query' : 'Drops the query',
            redirect.source === 'auto' ? 'Added when a page moved' : 'Added by hand',
         ].join(' · '),
         badge: { label: String(redirect.status) },
      }))
)

function open(redirect: CmsRedirect) {
   emit('open', { id: redirect.id, label: redirect.from })
}

function onSaved(redirect: CmsRedirect) {
   store.upsert(redirect)
   emit('back')
}
</script>
