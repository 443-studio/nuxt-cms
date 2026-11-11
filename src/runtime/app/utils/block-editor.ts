import type { ComputedRef, InjectionKey, PropType } from 'vue'
import { defineComponent, provide } from '#imports'
import type { CmsBlockPath } from '../../shared/block-paths'

export interface CmsBlockEditorScope {
   path: ComputedRef<CmsBlockPath>
   schemaPath: ComputedRef<readonly string[] | null>
   formPath: ComputedRef<string | null>
   open: (path: CmsBlockPath) => void
}

export const CMS_BLOCK_EDITOR: InjectionKey<CmsBlockEditorScope> = Symbol('cms-block-editor')

export const CmsBlockEditorProvider = defineComponent({
   name: 'CmsBlockEditorProvider',
   props: {
      scope: { type: Object as PropType<CmsBlockEditorScope>, required: true },
   },
   setup(props, { slots }) {
      provide(CMS_BLOCK_EDITOR, props.scope)
      return () => slots.default?.()
   },
})
