import type { BlockConfig, FieldConfig } from './index'

export const MAX_BLOCKS_DEPTH = 3

export type CmsBlockPathSegment = string | number

export type CmsBlockPath = readonly CmsBlockPathSegment[]

type Values = Record<string, unknown>

type Item = Record<string, unknown>

const FIELD_SEGMENT = /^[a-z_]\w*$/i

const INDEX_SEGMENT = /^\d+$/

function isRecord(value: unknown): value is Item {
   return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isFieldSegment(segment: unknown): segment is string {
   return typeof segment === 'string' && FIELD_SEGMENT.test(segment)
}

function isIndexSegment(segment: unknown): segment is number {
   return typeof segment === 'number' && Number.isInteger(segment) && segment >= 0
}

function isAlternating(path: CmsBlockPath): boolean {
   return path.every((segment, position) =>
      position % 2 === 0 ? isFieldSegment(segment) : isIndexSegment(segment)
   )
}

export function isBlockItemPath(path: CmsBlockPath): boolean {
   return path.length >= 2 && path.length % 2 === 0 && isAlternating(path)
}

export function isBlockListPath(path: CmsBlockPath): boolean {
   return path.length >= 1 && path.length % 2 === 1 && isAlternating(path)
}

export function formatBlockPath(path: CmsBlockPath): string {
   return path.join('.')
}

export function blockReferenceLabel(path: CmsBlockPath, fieldKey?: string): string {
   const base = path
      .map((segment) => (typeof segment === 'number' ? `[${segment}]` : `.${segment}`))
      .join('')
      .replace(/^\./, '')
   return fieldKey ? `${base}.${fieldKey}` : base
}

export function parseBlockPath(text: unknown): CmsBlockPath | null {
   if (typeof text !== 'string' || !text) return null
   const path = text
      .split('.')
      .map((segment) => (INDEX_SEGMENT.test(segment) ? Number(segment) : segment))
   return isAlternating(path) ? path : null
}

export function blockPathDepth(path: CmsBlockPath): number {
   return Math.ceil(path.length / 2)
}

export function blockListPath(itemPath: CmsBlockPath): CmsBlockPath {
   return itemPath.slice(0, -1)
}

export function blockPathIndex(itemPath: CmsBlockPath): number {
   const last = itemPath.at(-1)
   return isIndexSegment(last) ? last : -1
}

export function parentBlockPath(path: CmsBlockPath): CmsBlockPath | null {
   const list = path.length % 2 === 0 ? path.slice(0, -1) : path
   return list.length >= 3 ? list.slice(0, -1) : null
}

export function childBlockPath(
   itemPath: CmsBlockPath,
   fieldKey: string,
   index?: number
): CmsBlockPath {
   return index === undefined ? [...itemPath, fieldKey] : [...itemPath, fieldKey, index]
}

export function blockPathStartsWith(path: CmsBlockPath, prefix: CmsBlockPath): boolean {
   return prefix.length <= path.length && prefix.every((segment, i) => path[i] === segment)
}

export function sameBlockPath(a: CmsBlockPath | null, b: CmsBlockPath | null): boolean {
   if (!a || !b) return a === b
   return a.length === b.length && blockPathStartsWith(a, b)
}

function locateList(
   fields: Record<string, FieldConfig>,
   values: Values | null | undefined,
   listPath: CmsBlockPath
): { field: FieldConfig; schemaPath: string[] } | null {
   if (!isBlockListPath(listPath)) return null
   const schemaPath: string[] = []
   let scope: Record<string, FieldConfig> = fields
   let current: unknown = values
   for (let position = 0; position < listPath.length; position += 2) {
      const key = listPath[position] as string
      const field = Object.hasOwn(scope, key) ? scope[key] : undefined
      if (field?.type !== 'blocks') return null
      schemaPath.push(key)
      if (position === listPath.length - 1) return { field, schemaPath }
      const list = isRecord(current) ? current[key] : undefined
      const item = Array.isArray(list) ? list[listPath[position + 1] as number] : undefined
      const block = isRecord(item) ? field.blocks?.[String(item.type)] : undefined
      if (!block || !isRecord(item)) return null
      schemaPath.push(String(item.type))
      scope = block.fields
      current = item
   }
   return null
}

export function blocksFieldAt(
   fields: Record<string, FieldConfig>,
   values: Values | null | undefined,
   listPath: CmsBlockPath
): FieldConfig | null {
   return locateList(fields, values, listPath)?.field ?? null
}

export function blockSchemaPath(
   fields: Record<string, FieldConfig>,
   values: Values | null | undefined,
   path: CmsBlockPath
): string[] | null {
   return (
      locateList(fields, values, path.length % 2 === 0 ? path.slice(0, -1) : path)?.schemaPath ??
      null
   )
}

export function blockListAt(
   values: Values | null | undefined,
   listPath: CmsBlockPath
): Item[] | null {
   if (!isBlockListPath(listPath)) return null
   let current: unknown = values
   for (let position = 0; position < listPath.length; position++) {
      const segment = listPath[position]!
      if (position % 2 === 0) {
         if (!isRecord(current)) return null
         current = current[segment as string]
      } else {
         current = Array.isArray(current) ? current[segment as number] : undefined
      }
   }
   return Array.isArray(current) ? (current as Item[]) : null
}

export function blockAt(values: Values | null | undefined, itemPath: CmsBlockPath): Item | null {
   if (!isBlockItemPath(itemPath)) return null
   const item = blockListAt(values, blockListPath(itemPath))?.[blockPathIndex(itemPath)]
   return isRecord(item) ? item : null
}

export interface CmsBlockLocation {
   path: CmsBlockPath
   index: number
   depth: number
   item: Item
   field: FieldConfig
   block: BlockConfig | undefined
}

export function resolveBlockPath(
   fields: Record<string, FieldConfig>,
   values: Values | null | undefined,
   itemPath: CmsBlockPath
): CmsBlockLocation | null {
   const item = blockAt(values, itemPath)
   const field = item ? blocksFieldAt(fields, values, blockListPath(itemPath)) : null
   if (!item || !field) return null
   return {
      path: itemPath,
      index: blockPathIndex(itemPath),
      depth: blockPathDepth(itemPath),
      item,
      field,
      block: field.blocks?.[String(item.type)],
   }
}

function updateIn(
   current: unknown,
   path: CmsBlockPath,
   update: (list: Item[]) => Item[] | null
): unknown {
   if (!path.length) {
      const next = update(Array.isArray(current) ? (current as Item[]) : [])
      return next && next.length ? next : null
   }
   const [segment, ...rest] = path
   if (typeof segment === 'string') {
      if (!isRecord(current)) return current
      const next = updateIn(current[segment], rest, update)
      return next === current[segment] ? current : { ...current, [segment]: next }
   }
   if (!Array.isArray(current) || !isRecord(current[segment!])) return current
   const next = updateIn(current[segment!], rest, update)
   if (next === current[segment!]) return current
   const copy = [...current]
   copy[segment!] = next
   return copy
}

export function updateBlockList(
   values: Values,
   listPath: CmsBlockPath,
   update: (list: Item[]) => Item[] | null
): Values {
   if (!isBlockListPath(listPath)) return values
   return updateIn(values, listPath, update) as Values
}

export function updateBlockAt(
   values: Values,
   itemPath: CmsBlockPath,
   update: (item: Item) => Item
): Values {
   if (!blockAt(values, itemPath)) return values
   const index = blockPathIndex(itemPath)
   return updateBlockList(values, blockListPath(itemPath), (list) => {
      const next = [...list]
      next[index] = update(list[index]!)
      return next
   })
}

export function insertBlocks(
   values: Values,
   listPath: CmsBlockPath,
   index: number,
   items: readonly Item[]
): Values {
   if (!items.length) return values
   if (listPath.length > 1 && !blockAt(values, listPath.slice(0, -1))) return values
   return updateBlockList(values, listPath, (list) => {
      const next = [...list]
      next.splice(Math.min(Math.max(index, 0), list.length), 0, ...items)
      return next
   })
}

export function removeBlock(values: Values, itemPath: CmsBlockPath): Values {
   if (!blockAt(values, itemPath)) return values
   const index = blockPathIndex(itemPath)
   return updateBlockList(values, blockListPath(itemPath), (list) =>
      list.filter((_, position) => position !== index)
   )
}

export function pathAfterRemove(path: CmsBlockPath, removed: CmsBlockPath): CmsBlockPath | null {
   const list = blockListPath(removed)
   const index = blockPathIndex(removed)
   if (path.length <= list.length || !blockPathStartsWith(path, list)) return path
   const position = path[list.length] as number
   if (position === index) return null
   if (position < index) return path
   const next = [...path]
   next[list.length] = position - 1
   return next
}

export function pathAfterInsert(
   path: CmsBlockPath,
   listPath: CmsBlockPath,
   index: number,
   count = 1
): CmsBlockPath {
   if (path.length <= listPath.length || !blockPathStartsWith(path, listPath)) return path
   const position = path[listPath.length] as number
   if (position < index) return path
   const next = [...path]
   next[listPath.length] = position + count
   return next
}

export function movedBlockPath(
   from: CmsBlockPath,
   toList: CmsBlockPath,
   toIndex: number
): CmsBlockPath | null {
   if (!isBlockItemPath(from) || !isBlockListPath(toList)) return null
   if (blockPathStartsWith(toList, from)) return null
   const fromList = blockListPath(from)
   const fromIndex = blockPathIndex(from)
   const target = pathAfterRemove(toList, from)
   if (!target) return null
   const sameList = sameBlockPath(fromList, toList)
   const index = Math.max(sameList && toIndex > fromIndex ? toIndex - 1 : toIndex, 0)
   if (sameList && index === fromIndex) return null
   return [...target, index]
}

export function pathAfterMove(
   path: CmsBlockPath,
   from: CmsBlockPath,
   toList: CmsBlockPath,
   toIndex: number
): CmsBlockPath {
   const moved = movedBlockPath(from, toList, toIndex)
   if (!moved) return path
   if (blockPathStartsWith(path, from)) return [...moved, ...path.slice(from.length)]
   const removed = pathAfterRemove(path, from) ?? path
   return pathAfterInsert(removed, blockListPath(moved), blockPathIndex(moved))
}

export interface CmsInsertionPoint {
   list: CmsBlockPath
   index: number
}

export function remapInsertionPoint(
   point: CmsInsertionPoint,
   remap: (path: CmsBlockPath) => CmsBlockPath | null
): CmsInsertionPoint | null {
   const slot = remap([...point.list, point.index])
   if (slot) return { list: blockListPath(slot), index: blockPathIndex(slot) }
   if (point.list.length <= 1) return point
   const owner = remap(point.list.slice(0, -1))
   return owner ? { list: [...owner, point.list.at(-1)!], index: point.index } : null
}

export function moveBlock(
   values: Values,
   from: CmsBlockPath,
   toList: CmsBlockPath,
   toIndex: number
): Values {
   const item = blockAt(values, from)
   const moved = item ? movedBlockPath(from, toList, toIndex) : null
   if (!item || !moved) return values
   const target = blockListPath(moved)
   const removed = removeBlock(values, from)
   if (target.length > 1 && !blockAt(removed, target.slice(0, -1))) return values
   return insertBlocks(removed, target, blockPathIndex(moved), [item])
}

export interface CmsBlockVisit {
   item: Item
   block: BlockConfig
   field: FieldConfig
   path: CmsBlockPath
   schemaPath: readonly string[]
   index: number
   depth: number
}

export function walkBlocks(
   fields: Record<string, FieldConfig>,
   values: Values | null | undefined,
   visit: (visit: CmsBlockVisit) => boolean | void,
   prefix: CmsBlockPath = [],
   schemaPrefix: readonly string[] = []
): void {
   if (!isRecord(values)) return
   for (const [key, field] of Object.entries(fields)) {
      if (field?.type !== 'blocks') continue
      const list = values[key]
      if (!Array.isArray(list)) continue
      const schemaPath = [...schemaPrefix, key]
      list.forEach((item: unknown, index) => {
         if (!isRecord(item)) return
         const block = field.blocks?.[String(item.type)]
         if (!block) return
         const path = [...prefix, key, index]
         const descend = visit({
            item,
            block,
            field,
            path,
            schemaPath,
            index,
            depth: blockPathDepth(path),
         })
         if (descend === false) return
         walkBlocks(block.fields, item, visit, path, [...schemaPath, String(item.type)])
      })
   }
}

export function blocksFieldAtSchemaPath(
   fields: Record<string, FieldConfig>,
   schemaPath: string | readonly string[]
): FieldConfig | null {
   const segments = typeof schemaPath === 'string' ? schemaPath.split('.') : schemaPath
   if (!segments.length || segments.length % 2 === 0) return null
   let scope: Record<string, FieldConfig> = fields
   for (let position = 0; position < segments.length; position += 2) {
      const key = segments[position]!
      const field = Object.hasOwn(scope, key) ? scope[key] : undefined
      if (field?.type !== 'blocks') return null
      if (position === segments.length - 1) return field
      const type = segments[position + 1]!
      const block =
         field.blocks && Object.hasOwn(field.blocks, type) ? field.blocks[type] : undefined
      if (!block) return null
      scope = block.fields
   }
   return null
}

export interface CmsBlocksFieldVisit {
   field: FieldConfig
   schemaPath: readonly string[]
   depth: number
}

export function blocksFieldPaths(
   fields: Record<string, FieldConfig>,
   prefix: readonly string[] = []
): CmsBlocksFieldVisit[] {
   const found: CmsBlocksFieldVisit[] = []
   for (const [key, field] of Object.entries(fields)) {
      if (field?.type !== 'blocks' || field.private) continue
      const schemaPath = [...prefix, key]
      found.push({ field, schemaPath, depth: Math.ceil(schemaPath.length / 2) })
      for (const [blockName, block] of Object.entries(field.blocks ?? {})) {
         found.push(...blocksFieldPaths(block?.fields ?? {}, [...schemaPath, blockName]))
      }
   }
   return found
}

export function mapBlocks(
   field: FieldConfig,
   value: unknown,
   map: (item: Item, block: BlockConfig | undefined, field: FieldConfig) => Item | null
): unknown {
   if (!Array.isArray(value)) return value
   const result: unknown[] = []
   for (const item of value) {
      if (!isRecord(item)) {
         result.push(item)
         continue
      }
      const block = field.blocks?.[String(item.type)]
      const mapped = map(item, block, field)
      if (!mapped) continue
      let next = mapped
      for (const [key, subfield] of Object.entries(block?.fields ?? {})) {
         if (subfield.type !== 'blocks' || !Array.isArray(next[key])) continue
         const nested = mapBlocks(subfield, next[key], map)
         if (nested === next[key]) continue
         if (next === item) next = { ...item }
         next[key] = nested
      }
      result.push(next)
   }
   return result
}

export function hasNestedBlocks(field: FieldConfig): boolean {
   return Object.values(field.blocks ?? {}).some((block) =>
      Object.values(block?.fields ?? {}).some((subfield) => subfield?.type === 'blocks')
   )
}

export function blockFieldsDeep(field: FieldConfig): FieldConfig[] {
   return Object.values(field.blocks ?? {}).flatMap((block) =>
      Object.values(block?.fields ?? {}).flatMap((subfield) =>
         subfield?.type === 'blocks' ? [subfield, ...blockFieldsDeep(subfield)] : [subfield]
      )
   )
}
