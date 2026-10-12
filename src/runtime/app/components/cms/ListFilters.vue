<template>
   <div class="cms-media-filters cms-list-filters">
      <template v-for="key in keys" :key="key">
         <CmsDropdownMenu v-if="optionsOf(key)" :items="menuItems(key)">
            <button
               type="button"
               class="cms-pill"
               :class="{ 'is-active': isActive(key) }"
               aria-haspopup="menu"
            >
               {{ pillLabel(key) }}
               <CmsIcon name="chevron-down" class="size-3" />
            </button>
         </CmsDropdownMenu>
         <CmsPopover
            v-else
            :open="openKey === key"
            class="cms-list-filter"
            @update:open="(value: boolean) => (openKey = value ? key : null)"
         >
            <button
               type="button"
               class="cms-pill"
               :class="{ 'is-active': isActive(key) }"
               aria-haspopup="dialog"
            >
               {{ pillLabel(key) }}
               <CmsIcon name="chevron-down" class="size-3" />
            </button>
            <template #content>
               <div class="cms-list-filter-panel" role="dialog" :aria-label="labelOf(key)">
                  <CmsRelationField
                     :model-value="model[key] ?? null"
                     :to="config.fields[key]!.to!"
                     @update:model-value="(value) => pickRelation(key, value)"
                  />
               </div>
            </template>
         </CmsPopover>
      </template>
      <CmsButton
         v-if="activeCount"
         label="Clear filters"
         icon="x-mark"
         size="xs"
         variant="ghost"
         color="neutral"
         @click="model = {}"
      />
   </div>
</template>

<script setup lang="ts">
import type { CmsConfig, CmsEntry } from '#nuxt-cms'
import { isTranslatableField, selectDisplayValue } from '#nuxt-cms'
import { computed, reactive, ref, watch } from '#imports'
import cmsConfig from '#cms-config'
import type { CmsListFilters } from '../../../shared/list-filters'
import {
   listFilterLabel,
   listFilterOptions,
   listFilterValueLabel,
} from '../../../shared/list-filters'
import { useCmsRuntime } from '../../composables/cms-runtime'
import { cmsApi } from '../../utils/api'

const props = defineProps<{
   config: CmsEntry
   keys: string[]
   relations?: Record<string, Record<string, unknown>>
}>()

const model = defineModel<CmsListFilters>({ required: true })

const { i18n } = useCmsRuntime()

const openKey = ref<string | null>(null)
const fetchedTitles = reactive<Record<string, string>>({})

const activeCount = computed(() => Object.values(model.value).filter(Boolean).length)

function optionsOf(key: string) {
   return listFilterOptions(props.config, key)
}

function labelOf(key: string) {
   return listFilterLabel(props.config, key)
}

function isActive(key: string) {
   return !!model.value[key]
}

function set(key: string, value: string | null) {
   const next = { ...model.value }
   if (value) next[key] = value
   else delete next[key]
   model.value = next
}

function menuItems(key: string) {
   const current = model.value[key]
   return [
      { label: 'Any', checked: !current, onSelect: () => set(key, null) },
      ...(optionsOf(key) ?? []).map((option) => ({
         label: option.label,
         checked: current === option.value,
         onSelect: () => set(key, option.value),
      })),
   ]
}

function pickRelation(key: string, value: string | string[] | null) {
   set(key, typeof value === 'string' ? value : null)
   openKey.value = null
}

function titleText(entry: CmsEntry | undefined, value: unknown): string {
   const field = entry?.titleField ? entry.fields[entry.titleField] : undefined
   if (value == null || value === '') return ''
   if (field && isTranslatableField(field) && typeof value === 'object') {
      const record = value as Record<string, string>
      return record[i18n.defaultLocale] ?? Object.values(record).find(Boolean) ?? ''
   }
   if (field?.type === 'select') return selectDisplayValue(field, value)
   return String(value)
}

function relationTitle(key: string, id: string): string {
   const target = (cmsConfig as CmsConfig)[props.config.fields[key]?.to ?? '']
   const known = props.relations?.[key]?.[id]
   const title = known !== undefined ? titleText(target, known) : fetchedTitles[`${key}:${id}`]
   return title || `#${id}`
}

async function resolveTitle(key: string, id: string) {
   if (import.meta.server) return
   const cacheKey = `${key}:${id}`
   if (props.relations?.[key]?.[id] !== undefined || fetchedTitles[cacheKey] !== undefined) return
   const to = props.config.fields[key]?.to
   if (!to) return
   fetchedTitles[cacheKey] = ''
   try {
      const row = await cmsApi<Record<string, unknown>>(`/api/cms/admin/${to}/${id}`)
      const target = (cmsConfig as CmsConfig)[to]
      fetchedTitles[cacheKey] = titleText(target, target?.titleField ? row[target.titleField] : '')
   } catch {
      fetchedTitles[cacheKey] = ''
   }
}

watch(
   model,
   (filters) => {
      for (const key of props.keys) {
         const value = filters[key]
         if (value && !optionsOf(key)) void resolveTitle(key, value)
      }
   },
   { immediate: true }
)

function pillLabel(key: string) {
   const value = model.value[key]
   if (!value) return labelOf(key)
   const shown = optionsOf(key)
      ? listFilterValueLabel(props.config, key, value)
      : relationTitle(key, value)
   return `${labelOf(key)}: ${shown}`
}
</script>
