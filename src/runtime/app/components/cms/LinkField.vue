<template>
   <div class="cms-link-field">
      <div class="cms-link-target">
         <KFieldBoundary v-if="modeOptions.length > 1" auxiliary>
            <KSegmentedControl
               v-model="mode"
               :options="modeOptions"
               size="sm"
               required
               aria-label="Link type"
            />
         </KFieldBoundary>
         <KCombobox
            v-if="mode === 'internal'"
            v-model="targetValue"
            class="cms-link-input"
            clearable
            open-on-focus
            :options="selectedOptions"
            :search="search"
            :debounce="300"
            :placeholder="field.placeholder ?? 'Search pages and content…'"
         />
         <KInput
            v-else
            v-model="urlValue"
            class="cms-link-input k-mono"
            :placeholder="field.placeholder ?? 'https://, /path, mailto:, tel: or #anchor'"
         />
      </div>
      <KFieldMessage v-if="warning" tone="warning" :message="warning" />
      <KFieldBoundary auxiliary>
         <div class="cms-link-extra">
            <KInput
               v-if="field.withLabel"
               v-model="labelValue"
               class="cms-link-label"
               aria-label="Link text"
               placeholder="Link text"
            />
            <KSwitch v-model="newTabValue" size="sm" label="Open in a new tab" />
         </div>
      </KFieldBoundary>
   </div>
</template>

<script setup lang="ts">
import type { CmsConfig, CmsEntry, CmsLinkValue, FieldConfig } from '#nuxt-cms'
import {
   allowsExternalLinks,
   contentItemPath,
   isLocalizedLinkField,
   linkLabelText,
   linkTargetKey,
   linkTargetNames,
   pageLinkPath,
   pageRoutes,
   parseLinkTargetKey,
   readLinkValue,
} from '#nuxt-cms'
import type { ComboboxOption, SegmentedOption } from '@xleddyl/443-components-vue'
import {
   Combobox as KCombobox,
   FieldBoundary as KFieldBoundary,
   FieldMessage as KFieldMessage,
   Input as KInput,
   SegmentedControl as KSegmentedControl,
   Switch as KSwitch,
   toast,
} from '@xleddyl/443-components-vue'
import { computed, ref, watch } from '#imports'
import cmsConfig from '#cms-config'
import { useCmsLinkTargets } from '../../composables/cms-link-targets'
import { useCmsPermissions } from '../../composables/cms-permissions'
import { useCmsRuntime } from '../../composables/cms-runtime'
import { errorMessage } from '../../utils/ui'

type Mode = 'internal' | 'external'
type Row = Record<string, unknown>

const SEARCH_LIMIT = 10

const props = defineProps<{ field: FieldConfig; locale?: string }>()

const model = defineModel<unknown>({ required: true })

const config = cmsConfig as CmsConfig
const { i18n } = useCmsRuntime()
const targets = useCmsLinkTargets(config)
const { can } = useCmsPermissions()

const targetNames = computed(() =>
   linkTargetNames(config, props.field).filter((name) => can(`${name}.read`))
)
const external = computed(() => allowsExternalLinks(props.field))
const activeLocale = computed(() => props.locale ?? i18n.defaultLocale)

const link = computed(() => readLinkValue(model.value))

const modeOptions = computed<SegmentedOption<Mode>[]>(() => [
   ...(targetNames.value.length ? [{ value: 'internal' as const, label: 'Internal' }] : []),
   ...(external.value ? [{ value: 'external' as const, label: 'External' }] : []),
])

function initialMode(): Mode {
   if (link.value?.url) return 'external'
   if (link.value?.entry || !external.value) return 'internal'
   return targetNames.value.length ? 'internal' : 'external'
}

const mode = ref<Mode>(initialMode())

function write(next: CmsLinkValue) {
   const hasTarget = !!next.url || !!(next.entry && next.id)
   const hasExtra = next.label !== undefined || !!next.newTab
   model.value = hasTarget || hasExtra ? next : null
}

function extras(): CmsLinkValue {
   const current = link.value
   return {
      ...(current?.label !== undefined ? { label: current.label } : {}),
      ...(current?.newTab ? { newTab: true } : {}),
   }
}

watch(mode, (next) => {
   if (next === 'internal' && link.value?.url) write(extras())
   if (next === 'external' && link.value?.entry) write(extras())
})

const urlValue = computed<string | number | null | undefined>({
   get: () => link.value?.url ?? '',
   set: (value) => {
      const url = value == null ? '' : String(value)
      write({ ...(url ? { url } : {}), ...extras() })
   },
})

const targetValue = computed<string | null>({
   get: () =>
      link.value?.entry && link.value.id ? linkTargetKey(link.value.entry, link.value.id) : null,
   set: (value) => {
      const target = value ? parseLinkTargetKey(value) : null
      write({ ...(target ? { entry: target.entry, id: target.id } : {}), ...extras() })
   },
})

const labelValue = computed<string | number | null | undefined>({
   get: () => {
      const label = link.value?.label
      if (isLocalizedLinkField(props.field))
         return label && typeof label === 'object' ? label[activeLocale.value] ?? '' : ''
      return typeof label === 'string' ? label : ''
   },
   set: (value) => {
      const text = value == null ? '' : String(value)
      const current = link.value ?? {}
      const { label: previous, ...rest } = current
      let label: CmsLinkValue['label']
      if (isLocalizedLinkField(props.field)) {
         const map = { ...(previous && typeof previous === 'object' ? previous : {}) }
         if (text) map[activeLocale.value] = text
         else delete map[activeLocale.value]
         label = Object.keys(map).length ? map : undefined
      } else {
         label = text || undefined
      }
      write({ ...rest, ...(label !== undefined ? { label } : {}) })
   },
})

const newTabValue = computed<boolean | null | undefined>({
   get: () => !!link.value?.newTab,
   set: (value) => {
      const { newTab: _newTab, ...rest } = link.value ?? {}
      write({ ...rest, ...(value ? { newTab: true } : {}) })
   },
})

function rowTitle(entry: CmsEntry, row: Row): string {
   const value = row[entry.titleField ?? 'title']
   const text =
      typeof value === 'string'
         ? value
         : value && typeof value === 'object'
           ? linkLabelText(value, activeLocale.value, i18n.defaultLocale)
           : null
   return text || `#${String(row.id)}`
}

function rowPath(entry: CmsEntry, row: Row): string {
   return contentItemPath(entry, row, activeLocale.value) ?? ''
}

function pageOptions(name: string, entry: CmsEntry, term: string): ComboboxOption<string>[] {
   return pageRoutes(entry)
      .filter(
         (route) =>
            !term ||
            route.path.toLowerCase().includes(term) ||
            route.label.toLowerCase().includes(term)
      )
      .slice(0, SEARCH_LIMIT)
      .map((route) => ({
         label: route.label,
         value: linkTargetKey(name, route.key),
         description: route.path,
         group: entry.label,
      }))
}

async function contentOptions(
   name: string,
   entry: CmsEntry,
   term: string,
   signal: AbortSignal
): Promise<ComboboxOption<string>[]> {
   const page = await $fetch<{ items: Row[] }>(`/api/cms/admin/${name}`, {
      query: { light: 'true', limit: SEARCH_LIMIT, ...(term ? { search: term } : {}) },
      signal,
   })
   return page.items.map((row) => {
      targets.remember(name, row)
      const state = targets.state({ entry: name, id: String(row.id) })
      const path = rowPath(entry, row)
      return {
         label: rowTitle(entry, row),
         value: linkTargetKey(name, String(row.id)),
         description: state === 'live' ? path : `${path} (${state})`.trim(),
         group: entry.label,
      }
   })
}

async function search(query: string, signal: AbortSignal): Promise<ComboboxOption<string>[]> {
   const term = query.trim().toLowerCase()
   try {
      const groups = await Promise.all(
         targetNames.value.map((name) => {
            const entry = config[name]!
            return entry.kind === 'page'
               ? pageOptions(name, entry, term)
               : contentOptions(name, entry, query.trim(), signal)
         })
      )
      return groups.flat()
   } catch (error) {
      if (signal.aborted) throw error
      toast.error('Loading failed', { description: errorMessage(error) })
      return []
   }
}

watch(
   link,
   (value) => {
      if (value?.entry && value.id && !value.url) targets.load(value.entry, value.id)
   },
   { immediate: true }
)

const selectedOptions = computed<ComboboxOption<string>[]>(() => {
   const value = link.value
   if (!value?.entry || !value.id || value.url) return []
   const entry = config[value.entry]
   const key = linkTargetKey(value.entry, value.id)
   if (entry?.kind === 'page') {
      const route = pageRoutes(entry).find((candidate) => candidate.key === value.id)
      return [{ label: route?.label ?? value.id, value: key, description: route?.path }]
   }
   const row = targets.target(value.entry, value.id)
   if (!entry || !row) return [{ label: `${entry?.label ?? value.entry} #${value.id}`, value: key }]
   return [{ label: rowTitle(entry, row), value: key, description: rowPath(entry, row) }]
})

const warning = computed(() => {
   const value = link.value
   if (mode.value !== 'internal' || !value?.entry || !value.id) return null
   const entry = config[value.entry]
   if (entry?.kind === 'page')
      return pageLinkPath(entry, value.id) ? null : 'This page no longer exists.'
   switch (targets.state(value)) {
      case 'missing':
         return 'The linked item was deleted. The site shows no link until you pick another one.'
      case 'draft':
         return 'The linked item is a draft. The site hides this link until it is published.'
      case 'scheduled':
         return 'The linked item is scheduled. The site shows this link once it goes live.'
      default:
         return null
   }
})
</script>
