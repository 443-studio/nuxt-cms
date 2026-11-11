<template>
   <KTabs
      v-if="page && parts.length > 1"
      :model-value="part"
      :items="parts"
      variant="underline"
      size="sm"
      label="Layout parts"
      :controls="CMS_ENTRY_SETTINGS_PANEL"
      @update:model-value="(value) => (part = value as CmsEntrySettingsPart)"
   />
</template>

<script setup lang="ts">
import type { SettingsModalPage } from '@xleddyl/443-components-vue'
import { Tabs as KTabs } from '@xleddyl/443-components-vue'
import type { CmsEntrySettingsPart } from '../../composables/cms-entry-settings'
import { CMS_ENTRY_SETTINGS_PANEL, useCmsEntrySettings } from '../../composables/cms-entry-settings'

const props = defineProps<{ page?: SettingsModalPage }>()

const { parts, part } = useCmsEntrySettings(() => props.page?.id)
</script>
