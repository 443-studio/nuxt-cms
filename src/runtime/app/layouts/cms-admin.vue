<template>
   <KRoot class="cms-scope cms-canvas" :theme="theme" preset="default">
      <KDashboardLayout
         v-model:open="navOpen"
         class="cms-admin"
         :navigation="navigation"
         :theme-switch="false"
         :collapsible="false"
         :storage-key="false"
         :shortcut="false"
         :search="search"
         :search-navigation="false"
         :search-props="searchProps"
         search-label="Search"
      >
         <template #brand>
            <CmsBrandMark :subtitle="cmsBrand.subtitle || undefined" />
         </template>

         <template #topbar-brand>
            <CmsBrandMark size="sm" />
         </template>

         <template #search-item="{ item: { data: hit } }">
            <template v-if="hit">
               <KIcon :name="cmsIcon(iconOf(hit))" class="cms-search-option-icon" />
               <span class="cms-search-option-text">
                  <template v-if="isValueHit(hit)">
                     <span class="cms-search-option-head">
                        <span class="cms-search-option-title">{{
                           hit.title ?? hit.entryLabel
                        }}</span>
                        <span v-if="hit.fieldLabel" class="cms-search-option-meta">
                           {{ hit.fieldLabel }}
                        </span>
                        <KBadge v-if="hit.locale" size="sm" class="cms-code-badge">
                           {{ hit.locale }}
                        </KBadge>
                     </span>
                     <span class="cms-search-snippet">
                        {{ hit.snippet.before
                        }}<mark class="cms-search-mark">{{ hit.snippet.match }}</mark
                        >{{ hit.snippet.after }}
                     </span>
                  </template>
                  <template v-else>
                     <span class="cms-search-option-title">
                        {{ hit.snippet.before
                        }}<mark class="cms-search-mark">{{ hit.snippet.match }}</mark
                        >{{ hit.snippet.after }}
                     </span>
                     <span class="cms-search-option-meta">{{ labelMeta(hit) }}</span>
                  </template>
               </span>
            </template>
         </template>

         <template #account>
            <KAccountMenu
               :name="displayName"
               :email="email"
               :icon="cmsIcon('ellipsis-horizontal')"
               :active="settingsOpen"
               aria-haspopup="dialog"
               aria-label="Open settings"
               @click="openSettings"
            />
         </template>

         <slot />
      </KDashboardLayout>

      <CmsSettingsModal v-model:open="settingsOpen" @logout="logout" />
      <CmsWelcomeModal />
      <KOverlayHost />
   </KRoot>
</template>

<script setup lang="ts">
import type { CmsConfig, CmsEntryKind } from '#nuxt-cms'
import type { CommandGroup, DashboardSearchProps, NavSection } from '@xleddyl/443-components-vue'
import {
   AccountMenu as KAccountMenu,
   Badge as KBadge,
   DashboardLayout as KDashboardLayout,
   Icon as KIcon,
   OverlayHost as KOverlayHost,
   Root as KRoot,
   provideTheme,
} from '@xleddyl/443-components-vue'
import { computed, navigateTo, ref, useRoute, useUserSession, watch } from '#imports'
import cmsConfig from '#cms-config'
import { cmsBrand } from '#cms-brand'
import type { CmsSearchHit, CmsSearchKind, CmsSearchResponse } from '../../shared/search'
import { CMS_SEARCH_MIN_LENGTH, normalizeSearchQuery } from '../../shared/search'
import { useCmsTheme } from '../composables/cms-theme'
import { useCmsAccount } from '../composables/cms-account'
import { loadCmsSettings } from '../composables/cms-settings'
import { cmsIcon } from '../utils/ui'

const route = useRoute()
const { clear } = useUserSession()
const { email, displayName } = useCmsAccount()
const theme = useCmsTheme()
provideTheme(theme)
const navOpen = ref(false)
const settingsOpen = ref(false)

await loadCmsSettings()

const GROUPS: { kind: CmsEntryKind; title: string; icon: string }[] = [
   { kind: 'collection', title: 'Collections', icon: 'square-3-stack-3d' },
   { kind: 'single', title: 'Singles', icon: 'document-text' },
   { kind: 'content', title: 'Content', icon: 'newspaper' },
   { kind: 'page', title: 'Pages', icon: 'window' },
]

const entries = Object.entries(cmsConfig as CmsConfig)

const navigation: NavSection[] = [
   ...GROUPS.map((group) => ({
      label: group.title,
      items: entries
         .filter(([, entry]) => entry.kind === group.kind)
         .map(([name, entry]) => ({
            label: entry.label,
            to: `/cms/${name}`,
            icon: cmsIcon(entry.icon ?? group.icon),
         })),
   })),
   {
      label: 'Library',
      items: [{ label: 'Media', to: '/cms/media', icon: cmsIcon('photo') }],
   },
].filter((section) => section.items.length)

const SEARCH_DEBOUNCE_MS = 180

const KIND_LABELS: Record<CmsSearchKind, string> = {
   collection: 'Collection',
   single: 'Single',
   content: 'Content',
   page: 'Pages',
   media: 'Library',
}

const KIND_ICONS: Record<CmsSearchKind, string> = {
   collection: 'square-3-stack-3d',
   single: 'document-text',
   content: 'newspaper',
   page: 'window',
   media: 'photo',
}

const TYPE_LABELS: Record<CmsSearchHit['type'], string> = {
   entry: 'Section',
   page: 'Page',
   tab: 'Tab',
   field: 'Field',
   block: 'Block',
   value: 'Value',
   media: 'Media',
}

const TYPE_ICONS: Partial<Record<CmsSearchHit['type'], string>> = {
   page: 'window',
   tab: 'rectangle-group',
   field: 'tag',
   block: 'squares-2x2',
   value: 'bars-3-bottom-left',
   media: 'photo',
}

const truncated = ref(false)

const searchProps = computed<DashboardSearchProps>(() => ({
   label: 'Search the CMS',
   placeholder: 'Search content, fields and pages',
   debounce: SEARCH_DEBOUNCE_MS,
   minQueryLength: CMS_SEARCH_MIN_LENGTH,
   minQueryText: `Type at least ${CMS_SEARCH_MIN_LENGTH} characters to search.`,
   errorText: 'Search failed. Try again.',
   loadingText: 'Searching',
   emptyText: (query) => `No results for "${normalizeSearchQuery(query)}".`,
   resultsText: (count) => `${count} results`,
   notice: truncated.value
      ? 'Showing the first results. Type more to narrow them down.'
      : undefined,
   footerMove: 'to move',
   footerSelect: 'to open',
   footerClose: 'to close',
}))

function isValueHit(hit: CmsSearchHit) {
   return hit.type === 'value' || hit.type === 'media'
}

function iconOf(hit: CmsSearchHit) {
   return hit.type === 'entry' ? KIND_ICONS[hit.kind] : TYPE_ICONS[hit.type] ?? 'tag'
}

function labelMeta(hit: CmsSearchHit) {
   const parts = [TYPE_LABELS[hit.type]]
   if (hit.title) parts.push(hit.title)
   if (hit.fieldLabel && hit.type !== 'tab') parts.push(hit.fieldLabel)
   if (hit.type === 'page' && hit.id) parts.push(hit.to)
   return parts.join(' · ')
}

async function search(term: string, signal: AbortSignal): Promise<CommandGroup<CmsSearchHit>[]> {
   const response = await $fetch<CmsSearchResponse>('/api/cms/search', {
      query: { q: normalizeSearchQuery(term) },
      signal,
   })
   const groups = new Map<string, CommandGroup<CmsSearchHit>>()
   response.hits.forEach((hit, index) => {
      const key = hit.collection ?? hit.kind
      let group = groups.get(key)
      if (!group) {
         group = { id: key, label: hit.entryLabel, description: KIND_LABELS[hit.kind], items: [] }
         groups.set(key, group)
      }
      group.items.push({
         id: `hit-${index}`,
         label: hit.title ?? hit.entryLabel,
         to: hit.to,
         data: hit,
      })
   })
   truncated.value = response.truncated
   return [...groups.values()]
}

watch(
   () => route.fullPath,
   () => {
      navOpen.value = false
   }
)

function openSettings() {
   navOpen.value = false
   settingsOpen.value = true
}

async function logout() {
   settingsOpen.value = false
   await clear()
   await navigateTo('/cms/login')
}
</script>
