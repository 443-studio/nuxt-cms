<template>
   <CmsSettingsEntry v-if="page && entryNames.includes(page.id)" :key="page.id" :name="page.id" />
   <KRecordList
      v-else
      :items="items"
      label="Content types"
      :empty-icon="cmsIcon('view-columns')"
      empty-text="No content types"
      empty-description="Your role cannot read any content type."
      @row-click="(item) => open(String(item.id), item.title)"
   >
      <template #action="{ item }">
         <KButton
            icon="chevron-right"
            variant="ghost"
            tone="neutral"
            size="sm"
            square
            aria-label="Open"
            @click="open(String(item.id), item.title)"
         />
      </template>
   </KRecordList>
</template>

<script setup lang="ts">
import type { SettingsModalPage } from '@xleddyl/443-components-vue'
import { Button as KButton, RecordList as KRecordList } from '@xleddyl/443-components-vue'
import { computed, watch } from '#imports'
import { useCmsEntrySettings, useCmsSettingsEntries } from '../../composables/cms-entry-settings'
import { cmsIcon } from '../../utils/ui'

const props = defineProps<{ page?: SettingsModalPage }>()
const emit = defineEmits<{ open: [page: SettingsModalPage]; back: [] }>()

const entries = useCmsSettingsEntries()
const { status } = useCmsEntrySettings(() => props.page?.id)

const entryNames = computed(() => entries.value.map((entry) => entry.name))

const items = computed(() =>
   entries.value.map((entry) => ({ id: entry.name, title: entry.label, description: entry.kind }))
)

watch(
   () => props.page?.id,
   () => {
      status.value = 'idle'
   }
)

function open(id: string, label: string) {
   emit('open', { id, label })
}
</script>
