<template>
   <div class="cms-settings-entry">
      <KTabs
         v-if="parts.length > 1"
         v-model="activePart"
         :items="parts"
         :label="`${entry.label} settings`"
         size="sm"
         lazy
         :panel-focusable="false"
      >
         <template #panel-columns>
            <CmsSettingsColumns
               :model-value="columns"
               :fields="entry.fields"
               :extra="listExtraColumns(name)"
               @update:model-value="saveColumns"
            />
         </template>
         <template #panel-layout>
            <CmsSettingsLayout
               :model-value="layout"
               :fields="fields"
               :tabs="entry.tabs"
               @update:model-value="saveLayout"
            />
         </template>
      </KTabs>
      <CmsSettingsLayout
         v-else
         :model-value="layout"
         :fields="fields"
         :tabs="entry.tabs"
         @update:model-value="saveLayout"
      />

      <div class="cms-settings-footer">
         <KButton
            label="Reset to default"
            :icon="cmsIcon('arrow-uturn-left')"
            variant="ghost"
            tone="neutral"
            size="sm"
            :disabled="!isCustom"
            @click="resetPart"
         />
      </div>
   </div>
</template>

<script setup lang="ts">
import type { CmsEntry, CmsFormLayout } from '#nuxt-cms'
import type { TabItem } from '@xleddyl/443-components-vue'
import { Button as KButton, Tabs as KTabs } from '@xleddyl/443-components-vue'
import { computed, ref } from '#imports'
import cmsConfig from '#cms-config'
import {
   entryFields,
   entryFormLayout,
   entryListColumns,
   listExtraColumns,
   useCmsSettings,
} from '../../composables/cms-settings'
import { useCmsToast } from '../../composables/cms-toast'
import { cmsIcon, errorMessage } from '../../utils/ui'

type Status = 'idle' | 'saving' | 'saved' | 'error'

const props = defineProps<{ name: string }>()

const status = defineModel<Status>('status', { default: 'idle' })

const { settings, save, reset } = useCmsSettings()
const toast = useCmsToast()

const entry = computed(() => (cmsConfig as Record<string, CmsEntry>)[props.name]!)
const fields = computed(() => entryFields(props.name))

const parts = computed<TabItem[]>(() => [
   ...(entry.value.kind === 'collection' || entry.value.kind === 'content'
      ? [{ value: 'columns', label: 'Table columns' }]
      : []),
   { value: 'layout', label: 'Form layout' },
])

const activePart = ref<TabItem['value']>(parts.value[0]!.value)

const columns = computed(() => entryListColumns(props.name, settings.value))
const layout = computed(() => entryFormLayout(props.name, settings.value, fields.value))

const isCustom = computed(() => {
   const saved = settings.value[props.name]
   return activePart.value === 'columns' ? !!saved?.columns : !!saved?.layout
})

async function persist(next: { columns?: string[]; layout?: CmsFormLayout }) {
   status.value = 'saving'
   try {
      if (!next.columns && !next.layout) await reset(props.name)
      else await save(props.name, next)
      status.value = 'saved'
   } catch (error) {
      status.value = 'error'
      toast.add({ title: 'Settings not saved', description: errorMessage(error), color: 'error' })
   }
}

function current() {
   const saved = settings.value[props.name] ?? {}
   return { columns: saved.columns, layout: saved.layout }
}

function saveColumns(value: string[]) {
   void persist({ ...current(), columns: value })
}

function saveLayout(value: CmsFormLayout) {
   void persist({ ...current(), layout: value })
}

function resetPart() {
   const next = current()
   if (activePart.value === 'columns') next.columns = undefined
   else next.layout = undefined
   void persist(next)
}
</script>
