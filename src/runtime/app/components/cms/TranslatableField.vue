<template>
   <CmsMediaField
      v-if="props.field.type === 'media'"
      v-model="currentOrNull"
      :media-type="props.field.mediaType"
      :accept="props.field.accept"
   />
   <CmsRichTextField v-else-if="props.field.type === 'richtext'" v-model="currentOrNull" />
   <KTextarea v-else-if="props.field.textarea" v-model="currentText" :rows="8" />
   <KInput v-else v-model="current" />
</template>

<script setup lang="ts">
import type { FieldConfig } from '#nuxt-cms'
import { Input as KInput, Textarea as KTextarea } from '@xleddyl/443-components-vue'
import { computed } from '#imports'
import { useCmsRuntime } from '../../composables/cms-runtime'

const props = defineProps<{ field: FieldConfig; locale?: string }>()

const model = defineModel<Record<string, string> | null>({ required: true })

const { i18n } = useCmsRuntime()

const active = computed(() => props.locale ?? i18n.defaultLocale)

function write(value: string | number | null | undefined) {
   const next = Object.fromEntries(
      Object.entries(model.value ?? {}).filter(([locale]) => locale !== active.value)
   )
   if (value != null && value !== '') next[active.value] = String(value)
   model.value = Object.keys(next).length ? next : null
}

const current = computed<string | number | null | undefined>({
   get: () => model.value?.[active.value] ?? '',
   set: write,
})

const currentText = computed<string | null | undefined>({
   get: () => model.value?.[active.value] ?? '',
   set: write,
})

const currentOrNull = computed<string | null>({
   get: () => model.value?.[active.value] ?? null,
   set: write,
})
</script>
