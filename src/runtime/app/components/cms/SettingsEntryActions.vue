<template>
   <template v-if="page">
      <KBadge
         :label="ENTRY_SETTINGS_STATUS_LABELS[status]"
         :tone="STATUS_TONES[status]"
         variant="outline"
         aria-live="polite"
      />
      <KButton
         variant="soft"
         tone="neutral"
         size="sm"
         :icon="cmsIcon('arrow-uturn-left')"
         :disabled="!isCustom"
         disabled-reason="This part already uses the default"
         @click="resetPart"
      >
         Reset to default
      </KButton>
   </template>
</template>

<script setup lang="ts">
import type { SettingsModalPage } from '@xleddyl/443-components-vue'
import type { Tone } from '@xleddyl/443-components-vue'
import { Badge as KBadge, Button as KButton } from '@xleddyl/443-components-vue'
import type { CmsEntrySettingsStatus } from '../../composables/cms-entry-settings'
import {
   ENTRY_SETTINGS_STATUS_LABELS,
   useCmsEntrySettings,
} from '../../composables/cms-entry-settings'
import { cmsIcon } from '../../utils/ui'

const props = defineProps<{ page?: SettingsModalPage }>()

const STATUS_TONES: Record<CmsEntrySettingsStatus, Tone> = {
   idle: 'neutral',
   saving: 'neutral',
   saved: 'success',
   error: 'danger',
}

const { status, isCustom, resetPart } = useCmsEntrySettings(() => props.page?.id)
</script>
