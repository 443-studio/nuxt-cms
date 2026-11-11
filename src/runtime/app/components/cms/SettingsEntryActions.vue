<template>
   <template v-if="page">
      <span class="cms-settings-status" :class="`is-${status}`" aria-live="polite">
         {{ ENTRY_SETTINGS_STATUS_LABELS[status] }}
      </span>
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
import { Button as KButton } from '@xleddyl/443-components-vue'
import {
   ENTRY_SETTINGS_STATUS_LABELS,
   useCmsEntrySettings,
} from '../../composables/cms-entry-settings'
import { cmsIcon } from '../../utils/ui'

const props = defineProps<{ page?: SettingsModalPage }>()

const { status, isCustom, resetPart } = useCmsEntrySettings(() => props.page?.id)
</script>
