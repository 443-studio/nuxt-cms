<template>
   <KFilterPills
      :model-value="activeKeys"
      :options="pills"
      label="Filters"
      size="sm"
      multiple
      clearable
      clear-label="Clear filters"
      class="cms-list-filters"
      @update:model-value="onPillsUpdate"
   >
      <template v-for="key in relationKeys" #[`panel-${key}`]="{ close }" :key="key">
         <div class="cms-list-filter-panel">
            <CmsRelationField
               :model-value="model[key] ?? null"
               :to="config.fields[key]!.to!"
               @update:model-value="(value) => pickRelation(key, value, close)"
            />
         </div>
      </template>
   </KFilterPills>
</template>

<script setup lang="ts">
import type { CmsConfig, CmsEntry } from '#nuxt-cms'
import { isTranslatableField, selectDisplayValue } from '#nuxt-cms'
import type { FilterPillOption, MenuEntry } from '@xleddyl/443-components-vue'
import { FilterPills as KFilterPills } from '@xleddyl/443-components-vue'
import { computed, reactive, watch } from '#imports'
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

const fetchedTitles = reactive<Record<string, string>>({})

const activeKeys = computed(() => props.keys.filter((key) => !!model.value[key]))

const relationKeys = computed(() => props.keys.filter((key) => !optionsOf(key)))

const pills = computed<FilterPillOption<string>[]>(() =>
   props.keys.map((key) => {
      const menu = optionsOf(key) ? menuItems(key) : undefined
      return {
         value: key,
         label: labelOf(key),
         valueLabel: valueLabelOf(key),
         active: isActive(key),
         menu,
         panel: !menu,
      }
   })
)

function onPillsUpdate(value: string[]) {
   if (!value.length) model.value = {}
}

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

function menuItems(key: string): MenuEntry[] {
   const current = model.value[key]
   return [
      { type: 'radio', label: 'Any', checked: !current, onSelect: () => set(key, null) },
      ...(optionsOf(key) ?? []).map(
         (option): MenuEntry => ({
            type: 'radio',
            label: option.label,
            checked: current === option.value,
            onSelect: () => set(key, option.value),
         })
      ),
   ]
}

function pickRelation(key: string, value: string | string[] | null, close: () => void) {
   set(key, typeof value === 'string' ? value : null)
   close()
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

function valueLabelOf(key: string) {
   const value = model.value[key]
   if (!value) return undefined
   return optionsOf(key)
      ? listFilterValueLabel(props.config, key, value)
      : relationTitle(key, value)
}
</script>
