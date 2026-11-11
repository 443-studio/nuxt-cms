<template>
   <KCard :title="title" :description="description">
      <KDescriptionList :items="rows">
         <template #value="{ item }">
            <span :class="{ 'k-mono': item.key === secretKey }">{{ item.value }}</span>
         </template>
      </KDescriptionList>
      <template #footer>
         <KCopyButton
            variant="soft"
            tone="neutral"
            :value="copyText"
            :label="copyLabel"
            copied-label="Copied"
            show-label
            size="sm"
         />
         <KButton variant="ghost" tone="neutral" size="sm" @click="emit('done')">Done</KButton>
      </template>
   </KCard>
</template>

<script setup lang="ts">
import {
   Button as KButton,
   Card as KCard,
   CopyButton as KCopyButton,
   DescriptionList as KDescriptionList,
} from '@xleddyl/443-components-vue'
import { computed } from '#imports'

const props = withDefaults(
   defineProps<{
      title: string
      description: string
      items: { label: string; value: string }[]
      copyLabel?: string
      secretKey?: string
   }>(),
   { copyLabel: 'Copy credentials', secretKey: 'password' }
)

const emit = defineEmits<{ done: [] }>()

const rows = computed(() => props.items.map((item) => ({ key: item.label.toLowerCase(), ...item })))

const copyText = computed(() =>
   props.items.map((item) => `${item.label}: ${item.value}`).join('\n')
)
</script>
