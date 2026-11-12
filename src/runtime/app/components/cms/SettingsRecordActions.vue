<template>
   <template v-if="!page">
      <slot name="list" />
      <KButton v-if="!hideAdd" :icon="cmsIcon(addIcon)" size="sm" @click="openNew">
         {{ addLabel }}
      </KButton>
   </template>
   <template v-else>
      <slot />
      <KButton
         v-if="deletable"
         size="sm"
         variant="soft"
         tone="danger"
         icon="trash"
         :disabled="deleteDisabled"
         :disabled-reason="deleteHint"
         @click="emit('delete')"
      >
         Delete
      </KButton>
      <CmsSettingsFormAction />
   </template>
</template>

<script setup lang="ts">
import type { SettingsModalPage } from '@xleddyl/443-components-vue'
import { Button as KButton } from '@xleddyl/443-components-vue'
import { CMS_NEW_RECORD } from '../../composables/cms-route'
import { cmsIcon } from '../../utils/ui'
import CmsSettingsFormAction from './SettingsFormAction.vue'

const props = withDefaults(
   defineProps<{
      page?: SettingsModalPage
      addLabel?: string
      newLabel?: string
      addIcon?: string
      hideAdd?: boolean
      deletable?: boolean
      deleteDisabled?: boolean
      deleteHint?: string
   }>(),
   {
      page: undefined,
      addLabel: 'Add',
      newLabel: 'New',
      addIcon: 'plus',
      hideAdd: false,
      deleteHint: undefined,
   }
)

const emit = defineEmits<{ open: [page: SettingsModalPage]; delete: [] }>()

function openNew() {
   emit('open', { id: CMS_NEW_RECORD, label: props.newLabel })
}
</script>
