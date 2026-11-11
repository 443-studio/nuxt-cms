<template>
   <KButton
      :icon="cmsIcon(icon)"
      size="sm"
      @click="emit('open', { id: CMS_NEW_RECORD, label: newLabel })"
   >
      {{ label }}
   </KButton>
</template>

<script setup lang="ts">
import type { SettingsModalPage } from '@xleddyl/443-components-vue'
import { Button as KButton } from '@xleddyl/443-components-vue'
import { CMS_NEW_RECORD } from '../../composables/cms-route'
import { cmsIcon } from '../../utils/ui'

withDefaults(defineProps<{ label?: string; newLabel: string; icon?: string }>(), {
   label: 'Add',
   icon: 'plus',
})

const emit = defineEmits<{ open: [page: SettingsModalPage] }>()
</script>
