<template>
   <KStack gap="md">
      <KStack v-for="group in groups" :key="group.title" as="section" gap="xs">
         <KTooltip :text="group.title">
            <h3 class="cms-confirm-group-title k-mono">{{ group.title }}</h3>
         </KTooltip>
         <KRecordList :items="group.items" :label="group.title" @row-click="emit('close')" />
         <KFieldMessage v-if="group.note" tone="neutral" :icon="false" :message="group.note" />
      </KStack>
   </KStack>
</template>

<script setup lang="ts">
import {
   FieldMessage as KFieldMessage,
   RecordList as KRecordList,
   Stack as KStack,
   Tooltip as KTooltip,
} from '@xleddyl/443-components-vue'
import type { CmsConfirmGroup } from '../../composables/cms-confirm'

defineProps<{ groups: CmsConfirmGroup[] }>()

const emit = defineEmits<{ close: [] }>()
</script>
