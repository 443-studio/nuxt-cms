<template>
   <KCombobox
      v-model="model"
      :multiple="multiple"
      :clearable="!multiple && !required"
      open-on-focus
      :options="selectedOptions"
      :search="search"
      :debounce="300"
   />
</template>

<script setup lang="ts">
import type { CmsConfig } from '#nuxt-cms'
import { isTranslatableField, selectDisplayValue } from '#nuxt-cms'
import type { ComboboxOption } from '@xleddyl/443-components-vue'
import { Combobox as KCombobox } from '@xleddyl/443-components-vue'
import { computed, onMounted, ref } from '#imports'
import cmsConfig from '#cms-config'
import { useCmsRuntime } from '../../composables/cms-runtime'
import { useCmsToast } from '../../composables/cms-toast'
import { errorMessage } from '../../utils/ui'

const props = defineProps<{
   to: string
   required?: boolean
   multiple?: boolean
}>()

const model = defineModel<string | string[] | null>({ required: true })

const toast = useCmsToast()

type Row = Record<string, unknown>

const target = (cmsConfig as CmsConfig)[props.to]
const endpoint = `/api/cms/admin/${props.to}`
const selectedRows = ref(new Map<string, Row>())

async function search(query: string, signal: AbortSignal): Promise<ComboboxOption<string>[]> {
   const term = query.trim()
   try {
      const page = await $fetch<{ items: Row[] }>(endpoint, {
         query: { light: 'true', limit: 25, ...(term ? { search: term } : {}) },
         signal,
      })
      return page.items.map((row) => ({ label: optionLabel(row), value: row.id as string }))
   } catch (err) {
      if (signal.aborted) throw err
      toast.add({
         title: 'Loading failed',
         description: errorMessage(err),
         color: 'error',
      })
      return []
   }
}

const selectedIds = computed<string[]>(() => {
   if (Array.isArray(model.value)) return model.value
   return model.value ? [model.value] : []
})

async function resolveSelected() {
   const missing = selectedIds.value.filter((id) => !selectedRows.value.has(id))
   await Promise.all(
      missing.map(async (id) => {
         try {
            const row = await $fetch<Row>(`${endpoint}/${id}`)
            selectedRows.value.set(id, row)
         } catch {}
      })
   )
}

onMounted(() => {
   void resolveSelected()
})

const { i18n: contentI18n } = useCmsRuntime()

const titleField = target?.titleField ?? 'id'
const titleFieldConfig = target?.fields[titleField]

function optionLabel(row: Row): string {
   const value = row[titleField]
   if (value != null && titleFieldConfig && isTranslatableField(titleFieldConfig)) {
      const record = value as Record<string, string>
      const raw = record[contentI18n.defaultLocale] ?? Object.values(record)[0] ?? ''
      return raw || `#${row.id}`
   }
   if (value != null && titleFieldConfig?.type === 'select')
      return selectDisplayValue(titleFieldConfig, value) || `#${row.id}`
   return String(value ?? `#${row.id}`)
}

const selectedOptions = computed<ComboboxOption<string>[]>(() =>
   selectedIds.value.map((id) => {
      const row = selectedRows.value.get(id)
      return { label: row ? optionLabel(row) : `#${id}`, value: id }
   })
)
</script>
