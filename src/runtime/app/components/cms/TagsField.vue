<template>
   <KCombobox
      v-model="tags"
      multiple
      open-on-focus
      :search="search"
      :debounce="0"
      :max-selected="max"
      :placeholder="placeholder ?? 'Add a tag…'"
      :empty-text="emptyText"
      @input="onInput"
   />
</template>

<script setup lang="ts">
import { canAddTag, normalizeTags, tagKey } from '#nuxt-cms'
import type { ComboboxOption } from '@xleddyl/443-components-vue'
import { Combobox as KCombobox } from '@xleddyl/443-components-vue'
import { computed, onMounted, ref } from '#imports'

const SUGGESTION_LIMIT = 50

const props = defineProps<{
   max?: number
   placeholder?: string
   suggestions?: boolean
   entryName?: string
   fieldKey?: string
}>()

const model = defineModel<unknown>({ required: true })

const known = ref<string[]>([])

const tags = computed<string[]>({
   get: () => (Array.isArray(model.value) ? normalizeTags(model.value) : []),
   set: (value) => {
      const next = normalizeTags(Array.isArray(value) ? value : [])
      model.value = props.max === undefined ? next : next.slice(0, props.max)
   },
})

const full = computed(() => !canAddTag({ max: props.max }, tags.value.length))

const emptyText = computed(() =>
   full.value ? `At most ${props.max} tags` : 'Type a tag and press Enter'
)

function search(query: string): ComboboxOption<string>[] {
   if (full.value) return []
   const taken = new Set(tags.value.map(tagKey))
   const typed = query.trim()
   const needle = tagKey(typed)
   const matches = known.value
      .filter((tag) => !taken.has(tagKey(tag)) && tagKey(tag).includes(needle))
      .filter((tag) => tagKey(tag) !== needle)
      .slice(0, SUGGESTION_LIMIT)
   const options = matches.map((tag) => ({ label: tag, value: tag }))
   if (!needle || taken.has(needle)) return options
   const existing = known.value.find((tag) => tagKey(tag) === needle)
   return [{ label: existing ?? typed, value: existing ?? typed }, ...options]
}

function onInput(event: Event) {
   const input = event.target as HTMLInputElement
   if (!input.value.includes(',')) return
   const parts = input.value.split(',')
   const rest = parts.pop() ?? ''
   tags.value = [...tags.value, ...parts]
   input.value = rest.trimStart()
   input.dispatchEvent(new Event('input', { bubbles: true }))
}

onMounted(async () => {
   if (props.suggestions === false || !props.entryName || !props.fieldKey) return
   try {
      known.value = await $fetch<string[]>(
         `/api/cms/tags/${encodeURIComponent(props.entryName)}/${encodeURIComponent(
            props.fieldKey
         )}`
      )
   } catch {
      known.value = []
   }
})
</script>
