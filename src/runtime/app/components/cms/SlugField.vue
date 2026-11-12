<template>
   <KInput
      :model-value="model ?? ''"
      class="k-mono"
      @update:model-value="
         (v) => {
            model = v == null || v === '' ? null : String(v)
            touched = true
         }
      "
   >
      <template v-if="source !== undefined" #trailing>
         <KButton
            icon="arrow-path"
            size="xs"
            variant="ghost"
            tone="neutral"
            aria-label="Regenerate slug"
            :disabled="disabled"
            @click="regenerate"
         />
      </template>
   </KInput>
</template>

<script setup lang="ts">
import { Button as KButton, Input as KInput, useFieldControl } from '@xleddyl/443-components-vue'
import { ref, watch } from '#imports'
import { slugify } from '#nuxt-cms'

const props = defineProps<{ source?: string | null }>()

const model = defineModel<string | null>({ required: true })

const { disabled } = useFieldControl()

const touched = ref(!!model.value)

watch(
   () => props.source,
   (value) => {
      if (touched.value || disabled.value) return
      model.value = value ? slugify(value) : null
   }
)

function regenerate() {
   if (disabled.value) return
   model.value = props.source ? slugify(props.source) : null
   touched.value = false
}
</script>
