<template>
   <KRoot class="is-canvas" document :theme="theme" preset="default">
      <KDashboardLayout
         v-model:open="navOpen"
         class="cms-admin"
         :content="content"
         :loading="navigationPending"
         :navigation="navigation"
         :account="account"
         :settings-sections="settingsSections.navigation.value"
         :settings-presets="false"
         settings-title="Settings"
         :settings-route="true"
         settings-route-location="hash"
         settings-account-section="account"
         settings-hide-session
         :settings-resolve-page="settingsSections.resolvePage"
         :theme-switch="false"
         :collapsible="false"
         :storage-key="false"
         :shortcut="false"
         :search="search"
         :search-navigation="false"
         :search-props="searchProps"
         search-label="Search"
         @sign-out="logout"
      >
         <template #brand>
            <CmsBrandMark :subtitle="cmsBrand.subtitle || undefined" />
         </template>

         <template #topbar-brand>
            <CmsBrandMark size="sm" />
         </template>

         <slot />

         <template #settings-nav-footer>
            <CmsPoweredBy />
         </template>
         <template #settings-account-fields>
            <CmsSettingsAccount />
         </template>
         <template
            v-for="section in settingsSections.views.value"
            #[`settings-section-${section.id}`]="slot"
         >
            <component :is="section.component" v-bind="section.bind?.(slot)" />
         </template>
         <template
            v-for="section in settingsSections.actionViews.value"
            #[`settings-actions-${section.id}`]="slot"
         >
            <component :is="section.actions" v-bind="section.bindActions?.(slot)" />
         </template>
         <template
            v-for="section in settingsSections.tabViews.value"
            #[`settings-tabs-${section.id}`]="slot"
         >
            <component :is="section.tabs" :page="slot.page" />
         </template>
      </KDashboardLayout>

      <CmsWelcomeModal />
      <KOverlayHost />
   </KRoot>
</template>

<script setup lang="ts">
import type { CmsConfig, CmsEntryKind } from '#nuxt-cms'
import type {
   CommandGroup,
   CommandItem,
   DashboardSearchProps,
   NavSection,
   ShellContent,
   TextRange,
} from '@xleddyl/443-components-vue'
import {
   DashboardLayout as KDashboardLayout,
   OverlayHost as KOverlayHost,
   Root as KRoot,
   provideFormConfig,
   provideTheme,
} from '@xleddyl/443-components-vue'
import { useNavigationPending } from '@xleddyl/443-components-vue/nuxt/composables'
import { computed, navigateTo, ref, useRoute, watch } from '#imports'
import cmsConfig from '#cms-config'
import { cmsBrand } from '#cms-brand'
import type { CmsSearchHit, CmsSearchKind, CmsSearchResponse } from '../../shared/search'
import { CMS_SEARCH_MIN_LENGTH, normalizeSearchQuery } from '../../shared/search'
import { useCmsTheme } from '../composables/cms-theme'
import { useCmsAccount } from '../composables/cms-account'
import { useCmsPermissions } from '../composables/cms-permissions'
import { provideCmsRouteLocation } from '../composables/cms-route'
import { loadCmsSettings } from '../composables/cms-settings'
import { useCmsSettingsSections } from '../composables/cms-settings-sections'
import { cmsIcon, cmsSubmitError } from '../utils/ui'

const route = useRoute()
const { email, displayName } = useCmsAccount()
const { can, role, roleLabel } = useCmsPermissions()
const theme = useCmsTheme()
provideTheme(theme)
provideCmsRouteLocation()
provideFormConfig({ submitError: cmsSubmitError })
const navOpen = ref(false)
const navigationPending = useNavigationPending()
const settingsSections = useCmsSettingsSections()

const content = computed(() => (route.meta.content as ShellContent | undefined) ?? 'fill')

const account = computed(() => ({
   name: displayName.value,
   email: email.value,
   role: roleLabel(role.value),
}))

await loadCmsSettings()

const GROUPS: { kind: CmsEntryKind; title: string; icon: string }[] = [
   { kind: 'collection', title: 'Collections', icon: 'square-3-stack-3d' },
   { kind: 'single', title: 'Singles', icon: 'document-text' },
   { kind: 'content', title: 'Content', icon: 'newspaper' },
   { kind: 'page', title: 'Pages', icon: 'window' },
]

const entries = Object.entries(cmsConfig as CmsConfig)

const navigation = computed<NavSection[]>(() =>
   [
      ...GROUPS.map((group) => ({
         label: group.title,
         items: entries
            .filter(([name, entry]) => entry.kind === group.kind && can(`${name}.read`))
            .map(([name, entry]) => ({
               label: entry.label,
               to: `/cms/${name}`,
               icon: cmsIcon(entry.icon ?? group.icon),
            })),
      })),
      {
         label: 'Library',
         items: can('media.read')
            ? [{ label: 'Media', to: '/cms/media', icon: cmsIcon('photo') }]
            : [],
      },
   ].filter((section) => section.items.length)
)

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

function snippetText(hit: CmsSearchHit) {
   const { before, match, after } = hit.snippet
   return {
      text: `${before}${match}${after}`,
      ranges: [[before.length, before.length + match.length]] satisfies TextRange[],
   }
}

function hitItem(hit: CmsSearchHit, index: number): CommandItem<CmsSearchHit> {
   const snippet = snippetText(hit)
   const base = { id: `hit-${index}`, icon: cmsIcon(iconOf(hit)), to: hit.to, data: hit }
   if (!isValueHit(hit)) {
      return {
         ...base,
         label: snippet.text,
         description: labelMeta(hit),
         highlight: { label: snippet.ranges },
      }
   }
   return {
      ...base,
      label: hit.title ?? hit.entryLabel,
      meta: hit.fieldLabel ?? undefined,
      description: snippet.text,
      badge: hit.locale ? hit.locale.toUpperCase() : undefined,
      highlight: { description: snippet.ranges },
   }
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
      group.items.push(hitItem(hit, index))
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

async function logout() {
   await navigateTo('/cms/logout')
}
</script>

<style src="../../assets/admin.css" />
