<template>
   <KTooltip :text="scheduled && at ? `Goes live ${at}` : undefined">
      <KBadge
         :label="scheduled ? 'Scheduled' : published ? 'Published' : 'Draft'"
         :tone="scheduled ? 'warning' : published ? 'success' : 'neutral'"
         :variant="scheduled || published ? 'soft' : 'outline'"
         dot
      />
   </KTooltip>
</template>

<script setup lang="ts">
import { Badge as KBadge, Tooltip as KTooltip } from '@xleddyl/443-components-vue'

defineProps<{ published?: boolean; scheduled?: boolean; at?: string }>()
</script>
