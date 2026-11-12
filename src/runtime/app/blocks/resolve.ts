import type { Component } from 'vue'
import { cmsBlockComponents } from '#cms-blocks'
import { CONTENT_BODY_FIELD, blockTypeName, isHiddenBlock } from '../../shared/index'

export interface CmsBlockItem {
   type: string
   __typename?: string
}

export interface ResolvedCmsBlock {
   key: string
   index: number
   type: string
   component: Component
   props: Record<string, unknown>
}

const OMITTED_KEYS = new Set(['type', '__typename'])

export const isHiddenCmsBlock: (item: CmsBlockItem) => boolean = isHiddenBlock

export function cmsBlockTypeName(
   item: CmsBlockItem,
   entry?: string,
   field: string = CONTENT_BODY_FIELD
): string | undefined {
   return entry ? blockTypeName(entry, field, item.type) : item.__typename
}

export function cmsBlockComponent(
   item: CmsBlockItem,
   entry?: string,
   field?: string
): Component | undefined {
   const name = cmsBlockTypeName(item, entry, field)
   return name && Object.hasOwn(cmsBlockComponents, name) ? cmsBlockComponents[name] : undefined
}

export function cmsBlockProps(item: CmsBlockItem): Record<string, unknown> {
   return Object.fromEntries(
      Object.entries(item as unknown as Record<string, unknown>).filter(
         ([key]) => !OMITTED_KEYS.has(key)
      )
   )
}

export interface CmsBlockScope {
   entry?: string
   schemaPath: string | null
   listPath: string
}

export interface CmsBlockParent {
   entry?: string
   schemaPath: string | null
   itemPath: string
   type: string
   props: Record<string, unknown>
}

export function nestedBlocksField(
   parent: Pick<CmsBlockParent, 'props'>,
   blocks: unknown,
   field?: string
): string | undefined {
   if (field) return field
   if (!blocks) return undefined
   return Object.entries(parent.props).find(([, value]) => value === blocks)?.[0]
}

export function cmsBlockScope(
   options: { entry?: string; field?: string },
   parent?: CmsBlockParent | null,
   blocks?: unknown
): CmsBlockScope {
   if (!parent) {
      const field = options.field ?? CONTENT_BODY_FIELD
      return {
         entry: options.entry,
         schemaPath: options.entry ? field : null,
         listPath: field,
      }
   }
   const key = nestedBlocksField(parent, blocks, options.field) ?? '_'
   const entry = options.entry ?? parent.entry
   return {
      entry,
      schemaPath: entry && parent.schemaPath ? `${parent.schemaPath}.${parent.type}.${key}` : null,
      listPath: `${parent.itemPath}.${key}`,
   }
}

export function cmsBlockAnnotation(
   block: Pick<ResolvedCmsBlock, 'index' | 'type'>,
   scope: Pick<CmsBlockScope, 'listPath'>,
   nested: boolean
): Record<string, string | number> {
   const path = `${scope.listPath}.${block.index}`
   return nested
      ? {
           'data-cms-block-path': path,
           'data-cms-block-parent': scope.listPath.slice(0, scope.listPath.lastIndexOf('.')),
           'data-cms-block-type': block.type,
        }
      : {
           'data-cms-block': block.index,
           'data-cms-block-path': path,
           'data-cms-block-type': block.type,
        }
}

export function resolveCmsBlocks(
   blocks: readonly CmsBlockItem[] | null | undefined,
   options: { entry?: string; field?: string; onMissing?: (item: CmsBlockItem) => void } = {}
): ResolvedCmsBlock[] {
   const resolved: ResolvedCmsBlock[] = []
   ;(blocks ?? []).forEach((item, index) => {
      if (!item || typeof item !== 'object' || isHiddenCmsBlock(item)) return
      const component = cmsBlockComponent(item, options.entry, options.field)
      if (!component) {
         options.onMissing?.(item)
         return
      }
      resolved.push({
         key: `${index}:${item.type}`,
         index,
         type: item.type,
         component,
         props: cmsBlockProps(item),
      })
   })
   return resolved
}
