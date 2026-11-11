import type { ComputedRef, Ref } from 'vue'
import { computed, useState } from '#imports'
import type { CmsPreviewMode } from '../../shared/index'

export function useCmsPreviewState(): Ref<CmsPreviewMode | null> {
   return useState<CmsPreviewMode | null>('cms-preview-mode', () => null)
}

export function useCmsPreviewMode(): ComputedRef<CmsPreviewMode | null> {
   const state = useCmsPreviewState()
   return computed(() => state.value)
}
