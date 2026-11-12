<template>
   <KSegmentedControl
      v-model="model"
      class="cms-code"
      :options="options"
      size="sm"
      :disabled="false"
      required
      aria-label="Content language"
   />
</template>

<script setup lang="ts">
import type { SegmentedOption, Tone } from '@xleddyl/443-components-vue'
import { SegmentedControl as KSegmentedControl } from '@xleddyl/443-components-vue'
import { computed } from '#imports'
import type { TranslationProgress, TranslationState } from '../../../shared/translations'
import { translationSummary } from '../../../shared/translations'
import { useCmsRuntime } from '../../composables/cms-runtime'

const props = defineProps<{ progress?: TranslationProgress | null }>()

const model = defineModel<string>({ required: true })

const { i18n } = useCmsRuntime()

function stateOf(locale: string) {
   const progress = props.progress?.[locale]
   if (locale === i18n.defaultLocale || !progress?.total) return null
   return progress.state
}

function titleOf(locale: string) {
   const progress = props.progress?.[locale]
   if (!progress) return undefined
   if (locale === i18n.defaultLocale) {
      return progress.values ? `${locale}: default language` : `${locale}: empty`
   }
   if (!progress.total) return progress.values ? undefined : `${locale}: empty`
   return `${locale}: ${translationSummary(progress)}`
}

const DOT_TONES: Record<TranslationState, Tone> = {
   complete: 'success',
   partial: 'warning',
   missing: 'danger',
}

const options = computed<SegmentedOption<string>[]>(() =>
   i18n.locales.map((locale) => {
      const state = stateOf(locale)
      return {
         value: locale,
         label: locale,
         title: titleOf(locale),
         muted: !!props.progress && !props.progress[locale]?.values,
         dot: !!state,
         dotTone: state ? DOT_TONES[state] : undefined,
         dotLabel: state ? titleOf(locale) : undefined,
      }
   })
)
</script>
