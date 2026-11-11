<template>
   <div class="cms-settings-columns">
      <KFieldMessage
         tone="neutral"
         :icon="false"
         message="Choose the columns of the table. Drag the visible columns to change their order."
      />
      <ul ref="list" class="cms-settings-list">
         <li
            v-for="(key, index) in model"
            :key="key"
            v-bind="sortable.itemProps(index)"
            class="cms-settings-item is-draggable"
            :class="{ 'is-dragging': sortable.dragging.value === index }"
            tabindex="0"
         >
            <KIcon :name="cmsIcon('bars-2')" class="cms-settings-grip" />
            <KIcon :name="cmsIcon(iconOf(key))" class="cms-settings-item-icon" />
            <span class="cms-settings-item-label">{{ labelOf(key) }}</span>
            <KSwitch
               :model-value="true"
               :aria-label="`Hide ${labelOf(key)}`"
               :disabled="model.length === 1"
               @update:model-value="hide(key)"
            />
         </li>
      </ul>
      <span class="k-visually-hidden" aria-live="polite">{{ sortable.announcement.value }}</span>

      <template v-if="hidden.length">
         <KSeparator variant="heading" label="Hidden" :level="3" />
         <ul class="cms-settings-list">
            <li v-for="key in hidden" :key="key" class="cms-settings-item is-muted">
               <KIcon :name="cmsIcon(iconOf(key))" class="cms-settings-item-icon" />
               <span class="cms-settings-item-label">{{ labelOf(key) }}</span>
               <KSwitch
                  :model-value="false"
                  :aria-label="`Show ${labelOf(key)}`"
                  @update:model-value="show(key)"
               />
            </li>
         </ul>
      </template>
   </div>
</template>

<script setup lang="ts">
import type { FieldConfig } from '#nuxt-cms'
import {
   FieldMessage as KFieldMessage,
   Icon as KIcon,
   Separator as KSeparator,
   Switch as KSwitch,
   useSortable,
} from '@xleddyl/443-components-vue'
import { computed, useTemplateRef } from '#imports'
import { TRANSLATIONS_COLUMN } from '../../../shared/translations'
import { cmsIcon, fieldIcon } from '../../utils/ui'

const props = defineProps<{
   fields: Record<string, FieldConfig>
   extra: string[]
}>()

const model = defineModel<string[]>({ required: true })

const available = computed(() => [...Object.keys(props.fields), ...props.extra])
const hidden = computed(() => available.value.filter((key) => !model.value.includes(key)))

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

const list = useTemplateRef<HTMLElement>('list')

const sortable = useSortable(list, {
   items: model,
   label: labelOf,
   onMove: (next) => {
      model.value = next
   },
})
</script>
