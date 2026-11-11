import type { BlockConfig, FieldConfig } from './index'
import { isTranslatableField, mediaTypeFilter, selectOptionValues } from './index'

type FieldShape = [string, string, ...unknown[]]

function fieldShape(key: string, field: FieldConfig): FieldShape {
   const shape: FieldShape = [key, field.type]
   if (isTranslatableField(field)) shape.push('translatable')
   if (field.type === 'number' && field.integer) shape.push('integer')
   if (field.type === 'select') {
      if (field.multiple) shape.push('multiple')
      shape.push({ options: [...new Set(selectOptionValues(field))].sort() })
   }
   if (field.type === 'media')
      shape.push({ mediaType: mediaTypeFilter(field.mediaType)?.sort() ?? null })
   if (field.type === 'blocks') {
      const blocks = field.blocks ?? {}
      shape.push({
         blocks: Object.keys(blocks)
            .sort()
            .map((name) => [name, blockFieldShapes(blocks[name]!)]),
      })
   }
   return shape
}

function blockFieldShapes(block: Pick<BlockConfig, 'fields'>): FieldShape[] {
   return Object.keys(block.fields)
      .sort()
      .map((key) => fieldShape(key, block.fields[key]!))
}

export function blockShape(block: Pick<BlockConfig, 'fields'>): string {
   return JSON.stringify(blockFieldShapes(block))
}

function hashText(text: string): string {
   let first = 0x811c9dc5
   let second = 0x9747b28c
   for (let index = 0; index < text.length; index++) {
      const code = text.charCodeAt(index)
      first = Math.imul(first ^ code, 0x01000193)
      second = Math.imul(second ^ code, 0x5bd1e995)
      second ^= second >>> 15
   }
   const hex = (value: number) => (value >>> 0).toString(16).padStart(8, '0')
   return `${hex(first)}${hex(second)}`
}

export function blockSignature(block: Pick<BlockConfig, 'fields'>): string {
   return hashText(blockShape(block))
}

export function blockSignatures(
   blocks: Record<string, Pick<BlockConfig, 'fields'>> | undefined,
   types: readonly string[]
): Record<string, string> {
   const available = blocks ?? {}
   return Object.fromEntries(
      types
         .filter((type) => Object.hasOwn(available, type))
         .map((type) => [type, blockSignature(available[type]!)])
   )
}
