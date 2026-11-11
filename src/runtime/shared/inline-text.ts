import type { CmsBlockPath } from './block-paths'
import { formatBlockPath, updateBlockAt, walkBlocks } from './block-paths'
import type { FieldConfig } from './index'
import { decodeTranslatableValue, isFieldVisible, isTranslatableField } from './index'

export const CMS_INLINE_TEXT_MAX_LENGTH = 100_000

export const CMS_INLINE_INPUT_DELAY = 250

export interface CmsInlineNode {
   nodeType: number
   nodeName: string
   nodeValue: string | null
   childNodes: ArrayLike<CmsInlineNode>
}

export interface CmsInlineOverride {
   path: CmsBlockPath | null
   key: string
   value: unknown
   settled: boolean
}

const TEXT_NODE = 3
const ELEMENT_NODE = 1
const LINE_TAGS = new Set(['DIV', 'P', 'LI'])

export function isInlineTextField(field: FieldConfig | undefined): field is FieldConfig {
   return field?.type === 'text'
}

export function isPlainTextContent(node: CmsInlineNode): boolean {
   return Array.from(node.childNodes).every((child) => child.nodeType !== ELEMENT_NODE)
}

export function editableText(node: CmsInlineNode): string {
   let text = ''
   const walk = (parent: CmsInlineNode) => {
      for (const child of Array.from(parent.childNodes)) {
         if (child.nodeType === TEXT_NODE) text += child.nodeValue ?? ''
         else if (child.nodeType !== ELEMENT_NODE) continue
         else if (child.nodeName === 'BR') text += '\n'
         else {
            if (LINE_TAGS.has(child.nodeName) && text && !text.endsWith('\n')) text += '\n'
            walk(child)
         }
      }
   }
   walk(node)
   return text
}

export function normalizeInlineText(text: string, multiline: boolean): string {
   const value = text.replace(/ /g, ' ').replace(/\r\n?/g, '\n').replace(/\n$/, '')
   return multiline ? value : value.replace(/[^\S\n]*\n\s*/g, ' ')
}

export function inlineTextLimit(field: FieldConfig | undefined): number | undefined {
   return isInlineTextField(field) && typeof field.max === 'number' ? field.max : undefined
}

export function clampInlineText(text: string, max: number | undefined): string {
   return max === undefined || text.length <= max ? text : text.slice(0, max)
}

export function fitInlineInsertion(text: string, room: number): string {
   return text.slice(0, Math.max(room, 0))
}

export function inlineFieldPath(path: CmsBlockPath | null, key: string): string {
   return path ? `${formatBlockPath(path)}.${key}` : key
}

export interface CmsInlineLockOptions {
   fields: Record<string, FieldConfig> | null
   values: Record<string, unknown>
   blocksFields: Record<string, FieldConfig>
   blocksValues: Record<string, unknown>
   locked?: readonly string[]
}

export function lockedInlineFields(options: CmsInlineLockOptions): string[] {
   const paths: string[] = []
   for (const [key, field] of Object.entries(options.fields ?? {})) {
      if (!isInlineTextField(field)) continue
      if (options.locked?.includes(key) || !isFieldVisible(field, options.values, options.fields!))
         paths.push(key)
   }
   walkBlocks(options.blocksFields, options.blocksValues, ({ item, block, path }) => {
      for (const [key, field] of Object.entries(block.fields)) {
         if (isInlineTextField(field) && !isFieldVisible(field, item, block.fields))
            paths.push(inlineFieldPath(path, key))
      }
   })
   return paths
}

export function matchesInlineValue(text: string, value: unknown): boolean {
   if (value != null && typeof value !== 'string') return false
   return text.trim() === (value ?? '').trim()
}

export function inlineFieldValue(
   field: FieldConfig,
   current: unknown,
   locale: string,
   defaultLocale: string,
   text: string
): unknown {
   if (!isTranslatableField(field)) return text === '' ? null : text
   const translations = decodeTranslatableValue(current, defaultLocale) ?? {}
   const next = Object.fromEntries(Object.entries(translations).filter(([code]) => code !== locale))
   if (text !== '') next[locale] = text
   return Object.keys(next).length ? next : null
}

export function applyInlineOverride<T extends Record<string, unknown>>(
   blocks: readonly T[],
   item: Record<string, unknown> | null,
   override: CmsInlineOverride | null
): { blocks: T[]; item: Record<string, unknown> | null } {
   if (!override) return { blocks: [...blocks], item }
   if (!override.path)
      return {
         blocks: [...blocks],
         item: item ? { ...item, [override.key]: override.value } : item,
      }
   const root = String(override.path[0])
   const updated = updateBlockAt({ [root]: blocks }, override.path, (block) => ({
      ...block,
      [override.key]: override.value,
   }))
   return { blocks: [...((updated[root] as T[] | null) ?? [])], item }
}
