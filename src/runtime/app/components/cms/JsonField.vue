<template>
   <KStack gap="xs">
      <KTextarea
         v-model="text"
         :rows="6"
         class="k-mono"
         :invalid="control.field ? undefined : invalid || undefined"
         @blur="commit"
         @update:model-value="invalid = false"
      />
      <KFieldMessage v-if="!control.field && invalid" :message="INVALID_JSON" />
   </KStack>
</template>

<script setup lang="ts">
import {
   FieldMessage as KFieldMessage,
   Stack as KStack,
   Textarea as KTextarea,
   useFieldControl,
} from '@xleddyl/443-components-vue'
import { ref, watch } from '#imports'

const INVALID_JSON = 'Invalid JSON'

const model = defineModel<unknown>({ required: true })

function serialize(value: unknown) {
   return value == null ? '' : JSON.stringify(value, null, 2)
}

function parse(raw: string): unknown {
   if (!raw.trim()) return null
   try {
      return JSON.parse(raw)
   } catch {
      return undefined
   }
}

const control = useFieldControl()

const text = ref<string | null | undefined>(serialize(model.value))
const invalid = ref(false)

watch(invalid, (value) => control.setControlError(value ? INVALID_JSON : undefined))

watch(model, (value) => {
   const current = parse(text.value ?? '')
   if (JSON.stringify(current ?? null) !== JSON.stringify(value ?? null)) {
      text.value = serialize(value)
      invalid.value = false
   }
})

function commit() {
   const parsed = parse(text.value ?? '')
   if (parsed === undefined) {
      invalid.value = true
      return
   }
   invalid.value = false
   model.value = parsed
}
</script>
