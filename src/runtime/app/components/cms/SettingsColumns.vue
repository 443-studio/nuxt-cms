<template>
   <KStack gap="sm">
      <KFieldMessage
         tone="neutral"
         :icon="false"
         message="Choose the columns of the table. Drag the visible columns to change their order."
      />
      <KSortableList v-model="visible" label="Visible columns" size="sm">
         <template #trailing="{ item }">
            <KSwitch
               :model-value="true"
               :aria-label="`Hide ${item.label}`"
               :disabled="model.length === 1"
               @update:model-value="hide(String(item.value))"
            />
         </template>
      </KSortableList>

      <template v-if="hidden.length">
         <KSeparator variant="heading" label="Hidden" :level="3" />
         <KSortableList :model-value="hidden" label="Hidden columns" size="sm" disabled>
            <template #trailing="{ item }">
               <KSwitch
                  :model-value="false"
                  :aria-label="`Show ${item.label}`"
                  @update:model-value="show(String(item.value))"
               />
            </template>
         </KSortableList>
      </template>
   </KStack>
</template>

<script setup lang="ts">
import type { FieldConfig } from '#nuxt-cms'
import type { SortableListItem } from '@xleddyl/443-components-vue'
import {
   FieldMessage as KFieldMessage,
   Separator as KSeparator,
   SortableList as KSortableList,
   Stack as KStack,
   Switch as KSwitch,
} from '@xleddyl/443-components-vue'
import { computed } from '#imports'
import { TRANSLATIONS_COLUMN } from '../../../shared/translations'
import { cmsIcon, fieldIcon } from '../../utils/ui'

const props = defineProps<{
   fields: Record<string, FieldConfig>
   extra: string[]
}>()

const model = defineModel<string[]>({ required: true })

const available = computed(() => [...Object.keys(props.fields), ...props.extra])
function columnItem(key: string): SortableListItem {
   return { value: key, label: labelOf(key), icon: cmsIcon(iconOf(key)) }
}

const hidden = computed(() =>
   available.value.filter((key) => !model.value.includes(key)).map(columnItem)
)

const visible = computed<SortableListItem[]>({
   get: () => model.value.map(columnItem),
   set: (items) => {
      model.value = items.map((item) => String(item.value))
   },
})

const EXTRA_COLUMNS: Record<string, { label: string; icon: string }> = {
   status: { label: 'Status', icon: 'check-circle' },
   [TRANSLATIONS_COLUMN]: { label: 'Translations', icon: 'language' },
}

function labelOf(key: string) {
   return props.fields[key]?.label ?? EXTRA_COLUMNS[key]?.label ?? key
}

function iconOf(key: string) {
   const field = props.fields[key]
   return field ? fieldIcon(field) : EXTRA_COLUMNS[key]?.icon ?? 'check-circle'
}

function hide(key: string) {
   if (model.value.length === 1) return
   model.value = model.value.filter((k) => k !== key)
}

function show(key: string) {
   model.value = [...model.value, key]
}
</script>
