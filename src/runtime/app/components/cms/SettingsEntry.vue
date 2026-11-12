<template>
   <div :id="CMS_ENTRY_SETTINGS_PANEL" class="cms-settings-entry">
      <CmsSettingsColumns
         v-if="part === 'columns' && entry"
         :model-value="columns"
         :fields="entry.fields"
         :extra="extraColumns"
         @update:model-value="saveColumns"
      />
      <CmsSettingsLayout
         v-else-if="entry"
         :model-value="layout"
         :fields="fields"
         :tabs="entry.tabs"
         @update:model-value="saveLayout"
      />
   </div>
</template>

<script setup lang="ts">
import { CMS_ENTRY_SETTINGS_PANEL, useCmsEntrySettings } from '../../composables/cms-entry-settings'

const props = defineProps<{ name: string }>()

const { entry, part, fields, columns, layout, extraColumns, saveColumns, saveLayout } =
   useCmsEntrySettings(() => props.name)
</script>
