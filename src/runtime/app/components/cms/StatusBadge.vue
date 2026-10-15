<template>
   <KBadge
      :label="scheduled ? 'Scheduled' : published ? 'Published' : 'Draft'"
      :tone="scheduled ? 'warning' : published ? 'success' : 'neutral'"
      :variant="scheduled || published ? 'soft' : 'outline'"
      dot
      :title="scheduled && at ? `Goes live ${at}` : undefined"
   />
</template>

<script setup lang="ts">
import { Badge as KBadge } from '@xleddyl/443-components-vue'

defineProps<{ published?: boolean; scheduled?: boolean; at?: string }>()
</script>
