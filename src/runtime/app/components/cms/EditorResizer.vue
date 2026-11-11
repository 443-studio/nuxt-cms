<template>
   <div
      class="cms-editor-resizer"
      :class="[`is-${grows}`, { 'is-active': dragging }]"
      role="separator"
      aria-orientation="vertical"
      tabindex="0"
      :aria-label="label"
      :aria-valuenow="width"
      :aria-valuemin="limits.min"
      :aria-valuemax="limits.max"
      @pointerdown="start"
      @keydown="onKeydown"
      @dblclick="width = limits.initial"
   />
</template>

<script setup lang="ts">
import { onBeforeUnmount } from '#imports'
import type { CmsEditorPanelLimits } from '../../../shared/editor-layout'
import { clampPanelWidth, panelWidthForKey } from '../../../shared/editor-layout'

const props = defineProps<{
   label: string
   limits: CmsEditorPanelLimits
   grows: 'right' | 'left'
}>()

const width = defineModel<number>('width', { required: true })
const dragging = defineModel<boolean>('dragging', { default: false })

let origin = { x: 0, width: 0 }

function start(event: PointerEvent) {
   if (event.button !== 0) return
   event.preventDefault()
   origin = { x: event.clientX, width: width.value }
   dragging.value = true
   window.addEventListener('pointermove', onMove)
   window.addEventListener('pointerup', stop)
   window.addEventListener('pointercancel', stop)
}

function onMove(event: PointerEvent) {
   const delta = event.clientX - origin.x
   width.value = clampPanelWidth(
      origin.width + (props.grows === 'right' ? delta : -delta),
      props.limits
   )
}

function stop() {
   dragging.value = false
   window.removeEventListener('pointermove', onMove)
   window.removeEventListener('pointerup', stop)
   window.removeEventListener('pointercancel', stop)
}

function onKeydown(event: KeyboardEvent) {
   const next = panelWidthForKey(event.key, width.value, props.limits, props.grows)
   if (next === null) return
   event.preventDefault()
   width.value = next
}

onBeforeUnmount(stop)
</script>
