<template>
   <KTooltip text="Undo" shortcut="mod+z">
      <KButton
         :icon="cmsIcon('arrow-uturn-left')"
         size="sm"
         variant="ghost"
         tone="neutral"
         aria-label="Undo"
         :disabled="!canUndo"
         @click="emit('undo')"
      />
   </KTooltip>
   <KTooltip text="Redo" shortcut="mod+shift+z">
      <KButton
         :icon="cmsIcon('arrow-uturn-right')"
         size="sm"
         variant="ghost"
         tone="neutral"
         aria-label="Redo"
         :disabled="!canRedo"
         @click="emit('redo')"
      />
   </KTooltip>
</template>

<script setup lang="ts">
import { Button as KButton, Tooltip as KTooltip } from '@xleddyl/443-components-vue'
import { cmsIcon } from '../../utils/ui'

defineProps<{ canUndo: boolean; canRedo: boolean }>()

const emit = defineEmits<{ undo: []; redo: [] }>()
</script>
