import { onBeforeUnmount, onMounted, ref, watch } from '#imports'
import type { CmsEditorLayout } from '../../shared/editor-layout'
import {
   CMS_EDITOR_COMPACT_QUERY,
   CMS_EDITOR_LAYOUT_KEY,
   defaultEditorLayout,
   parseEditorLayout,
} from '../../shared/editor-layout'

function readLayout(): CmsEditorLayout {
   try {
      return parseEditorLayout(localStorage.getItem(CMS_EDITOR_LAYOUT_KEY))
   } catch {
      return defaultEditorLayout()
   }
}

function writeLayout(layout: CmsEditorLayout) {
   try {
      localStorage.setItem(CMS_EDITOR_LAYOUT_KEY, JSON.stringify(layout))
   } catch {}
}

export function useCmsEditorLayout() {
   const layout = ref<CmsEditorLayout>(defaultEditorLayout())
   const compact = ref(false)
   const resizing = ref(false)
   let query: MediaQueryList | null = null

   function onQueryChange() {
      compact.value = !!query?.matches
   }

   onMounted(() => {
      layout.value = readLayout()
      watch(layout, writeLayout, { deep: true })
      query = window.matchMedia(CMS_EDITOR_COMPACT_QUERY)
      onQueryChange()
      query.addEventListener('change', onQueryChange)
   })

   onBeforeUnmount(() => {
      query?.removeEventListener('change', onQueryChange)
   })

   return { layout, compact, resizing }
}
