<template>
   <CmsBlockNode
      v-for="block in resolved"
      :key="block.key"
      :block="block"
      :parent="parentOf(block)"
      :attrs="annotating ? annotation(block) : null"
   />
   <button
      v-if="placeholder"
      type="button"
      class="cms-preview-empty-button is-nested"
      v-bind="cmsTokenRoot(cmsPreviewTheme)"
      :data-cms-insert="placeholder"
   >
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
         <path
            d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z"
         />
      </svg>
      <span>Add a block</span>
   </button>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import type { CmsBlockEntryName } from '#cms-types'
import { computed, inject, toRaw } from '#imports'
import { cmsPreviewEditable, cmsPreviewTheme, cmsTokenRoot } from '../preview/field-marker'
import { CMS_BLOCK_PARENT, CmsBlockNode } from './node'
import type { CmsBlockItem, CmsBlockParent, ResolvedCmsBlock } from './resolve'
import { cmsBlockAnnotation, cmsBlockScope, cmsBlockTypeName, resolveCmsBlocks } from './resolve'

const props = defineProps({
   blocks: { type: Array as PropType<readonly CmsBlockItem[] | null>, default: null },
   entry: { type: String as PropType<CmsBlockEntryName>, default: undefined },
   field: { type: String, default: undefined },
   annotate: { type: Boolean, default: false },
})

const parent = inject(CMS_BLOCK_PARENT, null)

const scope = computed(() =>
   cmsBlockScope(
      { entry: props.entry, field: props.field },
      parent?.value
         ? {
              ...parent.value,
              props: Object.fromEntries(
                 Object.entries(parent.value.props).map(([key, value]) => [key, toRaw(value)])
              ),
           }
         : null,
      toRaw(props.blocks)
   )
)

const annotating = computed(() => props.annotate || !!parent?.value?.annotate)

function warnMissing(item: CmsBlockItem) {
   if (!import.meta.dev) return
   const name =
      cmsBlockTypeName(
         item,
         scope.value.schemaPath ? scope.value.entry : undefined,
         scope.value.schemaPath ?? undefined
      ) ?? item.type
   console.warn(
      `[nuxt-cms] <CmsBlocks> has no component for block '${name}': set component on the block in cms.config, or pass entry and field when the data has no __typename`
   )
}

const resolved = computed(() =>
   resolveCmsBlocks(props.blocks, {
      entry: scope.value.schemaPath ? scope.value.entry : undefined,
      field: scope.value.schemaPath ?? undefined,
      onMissing: warnMissing,
   })
)

const placeholder = computed(() =>
   parent?.value && annotating.value && cmsPreviewEditable.value && !resolved.value.length
      ? `${scope.value.listPath}.${props.blocks?.length ?? 0}`
      : null
)

function parentOf(block: ResolvedCmsBlock): CmsBlockParent & { annotate: boolean } {
   return {
      entry: scope.value.entry,
      schemaPath: scope.value.schemaPath,
      itemPath: `${scope.value.listPath}.${block.index}`,
      type: block.type,
      props: block.props,
      annotate: annotating.value,
   }
}

function annotation(block: ResolvedCmsBlock) {
   return cmsBlockAnnotation(block, scope.value, !!parent?.value)
}
</script>
