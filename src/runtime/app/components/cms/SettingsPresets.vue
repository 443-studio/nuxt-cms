<template>
   <CmsSettingsPresetForm
      v-if="page && current"
      :key="page.id"
      :preset="current"
      @saved="onSaved"
   />
   <KSkeletonForm v-else-if="page && !store.loaded.value" :fields="2" />
   <KRecordList
      v-else
      :items="items"
      :loading="!store.loaded.value"
      label="Block presets"
      :empty-icon="cmsIcon(CMS_PRESET_ICON)"
      empty-text="No presets yet"
      empty-description="Use Save as preset in the menu of a block to keep a copy of it here."
      @row-click="(item) => open((item as PresetItem).preset)"
   >
      <template #action="{ item }">
         <KButton
            :icon="cmsIcon('pencil')"
            variant="ghost"
            tone="neutral"
            size="sm"
            square
            aria-label="Edit"
            @click="open((item as PresetItem).preset)"
         />
      </template>
   </KRecordList>
</template>

<script setup lang="ts">
import type { RecordListItem, SettingsModalPage } from '@xleddyl/443-components-vue'
import {
   Button as KButton,
   RecordList as KRecordList,
   SkeletonForm as KSkeletonForm,
} from '@xleddyl/443-components-vue'
import { computed, onMounted } from '#imports'
import type { CmsBlockPreset } from '../../../shared/presets'
import { CMS_PRESET_ICON } from '../../../shared/presets'
import { presetMeta, useCmsPresetStore } from '../../composables/cms-settings-stores'
import { cmsIcon } from '../../utils/ui'

type PresetItem = RecordListItem & { preset: CmsBlockPreset }

const props = defineProps<{ page?: SettingsModalPage }>()
const emit = defineEmits<{ open: [page: SettingsModalPage]; back: [] }>()

const store = useCmsPresetStore()

onMounted(store.load)

const current = computed(() => store.find(props.page?.id))

const items = computed<PresetItem[]>(() =>
   store.items.value.map((preset) => ({
      id: preset.id,
      preset,
      title: preset.name,
      description: [presetMeta(preset), preset.description].filter(Boolean).join(' · '),
   }))
)

function open(preset: CmsBlockPreset) {
   emit('open', { id: preset.id, label: preset.name })
}

function onSaved(preset: CmsBlockPreset) {
   store.saved(preset)
   emit('back')
}
</script>
