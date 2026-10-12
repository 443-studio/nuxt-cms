<template>
   <form :id="id" class="cms-form" @submit.prevent="onSubmit">
      <CmsAlert v-if="errors[ROOT_KEY]" color="error">{{ errors[ROOT_KEY] }}</CmsAlert>
      <CmsAlert v-for="message in rootWarnings" :key="message" color="warning">
         {{ message }}
      </CmsAlert>
      <slot />
   </form>
</template>

<script setup lang="ts">
import { computed, provide, reactive, watch } from '#imports'
import { CMS_FORM_ERRORS, CMS_FORM_WARNINGS } from '../../utils/ui'

interface FormIssue {
   path: readonly PropertyKey[]
   message: string
}

interface ParseResult {
   success: boolean
   error?: { issues: readonly FormIssue[] }
}

const ROOT_KEY = ''

const props = defineProps<{
   id?: string
   state: Record<string, unknown>
   schema?: { safeParse: (value: unknown) => ParseResult }
   warnings?: (value: Record<string, unknown>) => readonly FormIssue[]
}>()

const emit = defineEmits<{ submit: []; error: [] }>()

const errors = reactive<Record<string, string>>({})
provide(CMS_FORM_ERRORS, errors)

const warningList = computed(() => props.warnings?.(props.state) ?? [])

const warningsByKey = computed(() => {
   const grouped: Record<string, string> = {}
   for (const issue of warningList.value) {
      const key = String(issue.path[0] ?? ROOT_KEY)
      if (key !== ROOT_KEY) grouped[key] ??= issue.message
   }
   return grouped
})
provide(CMS_FORM_WARNINGS, warningsByKey)

const rootWarnings = computed(() => [
   ...new Set(
      warningList.value.filter((issue) => !issue.path.length).map((issue) => issue.message)
   ),
])

let submitted = false

function validate(): boolean {
   for (const key of Object.keys(errors)) delete errors[key]
   if (!props.schema) return true
   const result = props.schema.safeParse(props.state)
   if (result.success) return true
   for (const issue of result.error?.issues ?? []) {
      const key = String(issue.path[0] ?? ROOT_KEY)
      if (!errors[key]) errors[key] = issue.message
   }
   return false
}

function onSubmit() {
   submitted = true
   if (validate()) emit('submit')
   else emit('error')
}

watch(
   () => props.state,
   () => {
      if (submitted) validate()
   },
   { deep: true }
)
</script>
