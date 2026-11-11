<template>
   <span v-if="badges.length" class="cms-translation-badges">
      <KTooltip v-for="badge in badges" :key="badge.locale" :text="badge.title">
         <KBadge
            :label="badge.locale"
            :tone="badge.tone"
            :variant="badge.variant"
            size="sm"
            dot
            class="cms-code-badge"
            :aria-label="badge.title"
         />
      </KTooltip>
   </span>
</template>

<script setup lang="ts">
import { Badge as KBadge, Tooltip as KTooltip } from '@xleddyl/443-components-vue'
import { computed } from '#imports'
import type { TranslationProgress, TranslationState } from '../../../shared/translations'
import { translationSummary } from '../../../shared/translations'
import { useCmsRuntime } from '../../composables/cms-runtime'

const props = defineProps<{ progress: TranslationProgress }>()

const { i18n } = useCmsRuntime()

const TONES: Record<TranslationState, 'success' | 'warning' | 'danger'> = {
   complete: 'success',
   partial: 'warning',
   missing: 'danger',
}

const badges = computed(() =>
   i18n.locales.flatMap((locale) => {
      const progress = props.progress[locale]
      if (locale === i18n.defaultLocale || !progress?.total) return []
      return [
         {
            locale,
            tone: TONES[progress.state],
            variant: progress.state === 'missing' ? ('outline' as const) : ('soft' as const),
            title: `${locale}: ${translationSummary(progress)}`,
         },
      ]
   })
)
</script>
