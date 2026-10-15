<template>
   <KSegmentedControl
      v-model="model"
      class="cms-locale-control"
      :options="options"
      size="sm"
      required
      aria-label="Content language"
   />
</template>

<script setup lang="ts">
import type { SegmentedOption } from '@xleddyl/443-components-vue'
import { SegmentedControl as KSegmentedControl } from '@xleddyl/443-components-vue'
import { computed } from '#imports'
import { useCmsRuntime } from '../../composables/cms-runtime'

const props = defineProps<{ value?: Record<string, string> | null }>()

const model = defineModel<string>({ required: true })

const { i18n } = useCmsRuntime()

const options = computed<SegmentedOption<string>[]>(() =>
   i18n.locales.map((locale) => {
      const empty = !props.value?.[locale]?.trim()
      return {
         value: locale,
         label: locale,
         title: empty ? `${locale}: empty` : undefined,
         muted: empty,
      }
   })
)
</script>
