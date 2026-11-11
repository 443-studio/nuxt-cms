import type { ComputedRef, InjectionKey, PropType } from 'vue'
import { computed, defineComponent, h, provide } from '#imports'
import type { CmsBlockParent, ResolvedCmsBlock } from './resolve'

export type CmsBlockParentContext = CmsBlockParent & { annotate: boolean }

export const CMS_BLOCK_PARENT: InjectionKey<ComputedRef<CmsBlockParentContext>> =
   Symbol('cms-block-parent')

export const CmsBlockNode = defineComponent({
   name: 'CmsBlockNode',
   props: {
      block: { type: Object as PropType<ResolvedCmsBlock>, required: true },
      parent: { type: Object as PropType<CmsBlockParentContext>, required: true },
      attrs: { type: Object as PropType<Record<string, unknown> | null>, default: null },
   },
   setup(props) {
      provide(
         CMS_BLOCK_PARENT,
         computed(() => props.parent)
      )
      return () => h(props.block.component, { ...props.block.props, ...props.attrs })
   },
})
