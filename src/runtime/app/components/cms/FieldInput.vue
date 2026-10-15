<template>
   <CmsTranslatableField
      v-if="isTranslatableField(field)"
      v-model="translatable"
      :field="field"
      :locale="locale"
   />
   <CmsBlocksField
      v-else-if="field.type === 'blocks'"
      v-model="blocksValue"
      :field="field"
      :locale="locale"
      :entry-name="entryName"
      :field-key="fieldKey"
   />
   <CmsRichTextField v-else-if="field.type === 'richtext'" v-model="strOrNull" />
   <KTextarea
      v-else-if="field.type === 'text' && field.textarea"
      v-model="plainText"
      :rows="8"
      :placeholder="field.placeholder"
   />
   <KInput v-else-if="field.type === 'text'" v-model="text" :placeholder="field.placeholder" />
   <KInput
      v-else-if="field.type === 'email'"
      v-model="text"
      type="email"
      :placeholder="field.placeholder"
   />
   <CmsSlugField v-else-if="field.type === 'slug'" v-model="strOrNull" :source="slugSource" />
   <KCombobox
      v-else-if="field.type === 'select' && field.multiple"
      v-model="multiValue"
      multiple
      open-on-focus
      :options="selectItems"
      :placeholder="field.placeholder ?? 'Select…'"
   />
   <KSelect
      v-else-if="field.type === 'select'"
      v-model="singleValue"
      :options="selectItems"
      :placeholder="field.placeholder ?? 'Select…'"
   />
   <KSwitch v-else-if="field.type === 'boolean'" v-model="flag" />
   <CmsJsonField v-else-if="field.type === 'json'" v-model="jsonValue" />
   <KNumberInput
      v-else-if="field.type === 'number'"
      v-model="num"
      align="start"
      :placeholder="field.placeholder"
   />
   <KDateInput v-else-if="field.type === 'date'" v-model="plainText" />
   <KDateInput
      v-else-if="field.type === 'datetime'"
      v-model="localDateTime"
      type="datetime-local"
   />
   <CmsRelationField
      v-else-if="field.type === 'relation'"
      v-model="relationValue"
      :to="field.to!"
      :required="field.required"
      :multiple="field.cardinality === 'many-to-many'"
   />
   <CmsMediaField v-else v-model="strOrNull" :media-type="field.mediaType" :accept="field.accept" />
</template>

<script setup lang="ts">
import type { FieldConfig } from '#nuxt-cms'
import { isTranslatableField, selectOptions } from '#nuxt-cms'
import {
   Combobox as KCombobox,
   DateInput as KDateInput,
   Input as KInput,
   NumberInput as KNumberInput,
   Select as KSelect,
   Switch as KSwitch,
   Textarea as KTextarea,
} from '@xleddyl/443-components-vue'
import { computed } from '#imports'

const props = defineProps<{
   field: FieldConfig
   slugSource?: string | null
   locale?: string
   entryName?: string
   fieldKey?: string
}>()

const model = defineModel<unknown>({ required: true })

const selectItems = computed(() =>
   selectOptions(props.field).map(({ value, label }) => ({ label, value }))
)

function proxy<T>(fromModel: (v: unknown) => T, toModel: (v: T) => unknown = (v) => v) {
   return computed<T>({
      get: () => fromModel(model.value),
      set: (value) => {
         model.value = toModel(value)
      },
   })
}

function emptyToNull(value: string | number | null | undefined) {
   return value == null || value === '' ? null : String(value)
}

const text = proxy<string | number | null | undefined>(
   (v) => (v as string | null) ?? '',
   emptyToNull
)
const plainText = proxy<string | null | undefined>((v) => (v as string | null) ?? '', emptyToNull)
const strOrNull = proxy<string | null>((v) => v as string | null)
const singleValue = proxy<string | null | undefined>(
   (v) => (v as string | null) ?? null,
   emptyToNull
)
const multiValue = proxy<string | string[] | null | undefined>(
   (v) => (v as string[] | null) ?? [],
   (v) => (Array.isArray(v) ? v : v == null ? [] : [v])
)
const flag = proxy<boolean | null | undefined>(
   (v) => !!v,
   (v) => !!v
)
const num = proxy<number | null | undefined>(
   (v) => (v as number | null) ?? null,
   (v) => (typeof v === 'number' && !Number.isNaN(v) ? v : null)
)
const translatable = proxy<Record<string, string> | null>((v) => v as Record<string, string> | null)
const blocksValue = proxy<Record<string, unknown>[] | null>(
   (v) => v as Record<string, unknown>[] | null
)

function toLocalDateTime(value: unknown): string {
   if (typeof value !== 'string' || !value) return ''
   const date = new Date(value)
   if (Number.isNaN(date.getTime())) return ''
   return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function fromLocalDateTime(value: string | null | undefined): string | null {
   if (!value) return null
   const date = new Date(value)
   return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const localDateTime = proxy<string | null | undefined>(toLocalDateTime, fromLocalDateTime)
const relationValue = proxy<string | string[] | null>((v) => v as string | string[] | null)
const jsonValue = proxy<unknown>((v) => v)
</script>
