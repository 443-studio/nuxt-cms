import type { BlockConfig, CmsLink, FieldConfig, MediaItem, MediaType } from './index'
import {
   BLOCK_HIDDEN_KEY,
   declaresHiddenField,
   decodeTranslatableValue,
   isHiddenBlock,
   isPrivateField,
   isTranslatableField,
   isTranslatableMediaField,
   localizeBlocks,
   blockAt,
   blockListAt,
   blockListPath,
   blockPathIndex,
   blockPathStartsWith,
   blocksFieldAt,
   canAddBlock,
   formatBlockPath,
   insertBlocks,
   isBlockListPath,
   mapBlocks,
   parentBlockPath,
   parseBlockPath,
   sameBlockPath,
   updateBlockAt,
   walkBlocks,
   mediaFilename,
   mediaPublicUrl,
   mediaTypeForKey,
   pickTranslatedMedia,
   resolveBlocksMedia,
   linkDisplayText,
   resolveCmsLink,
} from './index'
import { CMS_INLINE_TEXT_MAX_LENGTH } from './inline-text'
import type { CmsBlockPath, CmsBlockPathSegment } from './block-paths'
import { MAX_BLOCKS_DEPTH, isBlockItemPath, resolveBlockPath } from './block-paths'
import { blockSignature } from './block-signature'

export type CmsPreviewLinkResolver = (value: unknown) => CmsLink | null

function externalLinks(locale: string, defaultLocale: string): CmsPreviewLinkResolver {
   return (value) => resolveCmsLink({}, value, locale, defaultLocale)
}

function previewBlockLinks(
   field: FieldConfig,
   items: CmsBlockValue[],
   resolveLink: CmsPreviewLinkResolver
): CmsBlockValue[] {
   return mapBlocks(field, items, (item, block) => {
      const keys = Object.entries(block?.fields ?? {})
         .filter(([, blockField]) => blockField.type === 'link')
         .map(([key]) => key)
      if (!keys.length) return item
      const resolved = { ...item }
      for (const key of keys) resolved[key] = resolveLink(item[key])
      return resolved
   }) as CmsBlockValue[]
}

export const CMS_PREVIEW_CHANNEL = 'nuxt-cms:preview'

export const DEFAULT_CMS_PREVIEW_PATH = '/cms/preview'

const RESERVED_ADMIN_SEGMENTS = new Set(['login', 'logout', 'media'])

export function previewPathErrors(path: string, entryNames: string[]): string[] {
   const match = /^\/cms\/([a-z0-9][a-z0-9-]*)$/.exec(path)
   if (!match)
      return [
         `preview.path '${path}' must be a single lowercase segment under /cms, like '${DEFAULT_CMS_PREVIEW_PATH}'`,
      ]
   const segment = match[1]!
   if (RESERVED_ADMIN_SEGMENTS.has(segment) || entryNames.includes(segment))
      return [`preview.path '${path}' clashes with an admin route, pick another segment`]
   return []
}

export type CmsBlockValue = Record<string, unknown>

export interface CmsPreviewMedia {
   key: string
   url: string | null
   type: MediaType
   alt: string | null
   folder: string | null
   mime: string | null
   size: number | null
   width: number | null
   height: number | null
   focalX: number | null
   focalY: number | null
}

export type CmsPreviewTheme = 'system' | 'light' | 'dark'

const PREVIEW_THEMES: readonly CmsPreviewTheme[] = ['system', 'light', 'dark']

export function readPreviewTheme(value: unknown): CmsPreviewTheme {
   return PREVIEW_THEMES.find((theme) => theme === value) ?? 'system'
}

export interface CmsPreviewState {
   entry: string
   field: string
   locale: string
   blocks: CmsBlockValue[]
   item: Record<string, unknown> | null
   media: Record<string, CmsPreviewMedia>
   selected: CmsBlockPath | null
   editable: boolean
   lockedFields: string[]
   theme: CmsPreviewTheme
}

export type CmsPreviewHostMessage =
   | { type: 'render'; state: CmsPreviewState }
   | { type: 'highlight'; path: CmsBlockPath | null }
   | { type: 'reveal'; path: CmsBlockPath }

export type CmsPreviewFrameMessage =
   | { type: 'ready' }
   | { type: 'select'; path: CmsBlockPath | null; focus?: boolean }
   | { type: 'hover'; path: CmsBlockPath | null }
   | { type: 'insert'; path: CmsBlockPath }
   | { type: 'move'; from: CmsBlockPath; to: CmsBlockPath; focus?: boolean }
   | { type: 'duplicate'; path: CmsBlockPath }
   | { type: 'toggle-hidden'; path: CmsBlockPath }
   | { type: 'remove'; path: CmsBlockPath }
   | { type: 'copy'; path: CmsBlockPath }
   | { type: 'cut'; path: CmsBlockPath }
   | { type: 'paste'; path: CmsBlockPath; text?: string }
   | { type: 'focus-field'; path: CmsBlockPath | null; key: string }
   | {
        type: 'field-input'
        path: CmsBlockPath | null
        key: string
        locale: string
        value: string
        commit?: boolean
     }
   | { type: 'undo' }
   | { type: 'redo' }
   | { type: 'save' }

export const CMS_CLIPBOARD_MAX_LENGTH = 2_000_000

export type CmsPreviewEnvelope<T> = T & { channel: typeof CMS_PREVIEW_CHANNEL }

export function previewEnvelope<T extends { type: string }>(message: T): CmsPreviewEnvelope<T> {
   return { ...message, channel: CMS_PREVIEW_CHANNEL }
}

function isRecord(value: unknown): value is Record<string, unknown> {
   return !!value && typeof value === 'object' && !Array.isArray(value)
}

const FIELD_KEY = /^[a-z_]\w{0,99}$/i

export function isFieldKey(value: unknown): value is string {
   return typeof value === 'string' && FIELD_KEY.test(value)
}

export function readMessagePath(value: unknown): CmsBlockPath | null {
   if (!Array.isArray(value) || value.length > MAX_BLOCKS_DEPTH * 2) return null
   const valid = value.every((segment, position) =>
      position % 2 === 0
         ? isFieldKey(segment)
         : typeof segment === 'number' && Number.isSafeInteger(segment) && segment >= 0
   )
   return valid && isBlockItemPath(value) ? [...(value as CmsBlockPathSegment[])] : null
}

function readOptionalPath(value: unknown): CmsBlockPath | null | undefined {
   return value === null ? null : readMessagePath(value) ?? undefined
}

function envelope(data: unknown): Record<string, unknown> | null {
   if (!isRecord(data) || data.channel !== CMS_PREVIEW_CHANNEL) return null
   return typeof data.type === 'string' ? data : null
}

const LOCALE_CODE = /^[a-z0-9_-]{1,35}$/i

function parseFieldInput(message: Record<string, unknown>): CmsPreviewFrameMessage | null {
   const path = readOptionalPath(message.path)
   if (path === undefined || !isFieldKey(message.key)) return null
   if (typeof message.locale !== 'string' || !LOCALE_CODE.test(message.locale)) return null
   if (typeof message.value !== 'string' || message.value.length > CMS_INLINE_TEXT_MAX_LENGTH)
      return null
   return {
      type: 'field-input',
      path,
      key: message.key,
      locale: message.locale,
      value: message.value,
      ...(message.commit === true ? { commit: true } : {}),
   }
}

function parsePaste(message: Record<string, unknown>): CmsPreviewFrameMessage | null {
   const path = readMessagePath(message.path)
   if (!path) return null
   if (message.text === undefined) return { type: 'paste', path }
   return typeof message.text === 'string' && message.text.length <= CMS_CLIPBOARD_MAX_LENGTH
      ? { type: 'paste', path, text: message.text }
      : null
}

export function parseFrameMessage(data: unknown): CmsPreviewFrameMessage | null {
   const message = envelope(data)
   if (!message) return null
   const focus = message.focus === true ? { focus: true } : {}
   switch (message.type) {
      case 'ready':
      case 'undo':
      case 'redo':
      case 'save':
         return { type: message.type }
      case 'select':
      case 'hover': {
         const path = readOptionalPath(message.path)
         if (path === undefined) return null
         return message.type === 'select'
            ? { type: 'select', path, ...focus }
            : { type: 'hover', path }
      }
      case 'move': {
         const from = readMessagePath(message.from)
         const to = readMessagePath(message.to)
         return from && to ? { type: 'move', from, to, ...focus } : null
      }
      case 'insert':
      case 'duplicate':
      case 'toggle-hidden':
      case 'remove':
      case 'copy':
      case 'cut': {
         const path = readMessagePath(message.path)
         return path ? { type: message.type, path } : null
      }
      case 'focus-field': {
         const path = readOptionalPath(message.path)
         return path !== undefined && isFieldKey(message.key)
            ? { type: 'focus-field', path, key: message.key }
            : null
      }
      case 'field-input':
         return parseFieldInput(message)
      case 'paste':
         return parsePaste(message)
      default:
         return null
   }
}

export function parseHostMessage(data: unknown): CmsPreviewHostMessage | null {
   const message = envelope(data)
   if (!message) return null
   if (message.type === 'highlight') {
      const path = readOptionalPath(message.path)
      return path === undefined ? null : { type: 'highlight', path }
   }
   if (message.type === 'reveal') {
      const path = readMessagePath(message.path)
      return path ? { type: 'reveal', path } : null
   }
   if (message.type !== 'render' || !isRecord(message.state)) return null
   const state = message.state
   if (typeof state.entry !== 'string' || typeof state.field !== 'string') return null
   if (typeof state.locale !== 'string' || !Array.isArray(state.blocks)) return null
   if (state.item !== null && !isRecord(state.item)) return null
   if (!isRecord(state.media)) return null
   const selected = readOptionalPath(state.selected)
   if (selected === undefined) return null
   return {
      type: 'render',
      state: {
         entry: state.entry,
         field: state.field,
         locale: state.locale,
         blocks: state.blocks.filter(isRecord),
         item: state.item as Record<string, unknown> | null,
         media: state.media as Record<string, CmsPreviewMedia>,
         selected,
         editable: state.editable !== false,
         lockedFields: Array.isArray(state.lockedFields)
            ? state.lockedFields.filter((path): path is string => typeof path === 'string')
            : [],
         theme: readPreviewTheme(state.theme),
      },
   }
}

export interface CmsFieldTarget {
   path: CmsBlockPath | null
   key: string
}

export function previewFieldConfig(
   target: CmsFieldTarget,
   blocksFields: Record<string, FieldConfig>,
   blocksValues: Record<string, unknown>,
   entryFields: Record<string, FieldConfig> | null | undefined,
   blocksKey: string
): FieldConfig | undefined {
   if (!isFieldKey(target.key)) return undefined
   if (target.path) {
      const block = resolveBlockPath(blocksFields, blocksValues, target.path)?.block
      return block && Object.hasOwn(block.fields, target.key) ? block.fields[target.key] : undefined
   }
   if (!entryFields || target.key === blocksKey || !Object.hasOwn(entryFields, target.key))
      return undefined
   const field = entryFields[target.key]!
   return isPrivateField(field) ? undefined : field
}

export type CmsEditorShortcut =
   | 'undo'
   | 'redo'
   | 'save'
   | 'remove'
   | 'duplicate'
   | 'move-up'
   | 'move-down'
   | 'insert-after'
   | 'insert-before'
   | 'deselect'

export interface CmsShortcutKey {
   key: string
   metaKey: boolean
   ctrlKey: boolean
   altKey: boolean
   shiftKey: boolean
}

export interface CmsShortcutTarget {
   editable: boolean
   interactive: boolean
   selected: boolean
}

export function isApplePlatform(platform: string): boolean {
   return /mac|iphone|ipad|ipod/i.test(platform)
}

export function editorShortcut(event: CmsShortcutKey, apple: boolean): CmsEditorShortcut | null {
   if (event.altKey) return null
   const key = event.key.toLowerCase()
   const mod = apple ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
   if (mod) {
      if (key === 'z') return event.shiftKey ? 'redo' : 'undo'
      if (event.shiftKey) return null
      if (key === 'y') return 'redo'
      if (key === 's') return 'save'
      if (key === 'd') return 'duplicate'
      if (key === 'arrowup') return 'move-up'
      if (key === 'arrowdown') return 'move-down'
      return null
   }
   if (event.metaKey || event.ctrlKey) return null
   if (key === 'enter') return event.shiftKey ? 'insert-before' : 'insert-after'
   if (event.shiftKey) return null
   if (key === 'delete' || key === 'backspace') return 'remove'
   if (key === 'escape') return 'deselect'
   return null
}

export function shortcutApplies(action: CmsEditorShortcut, target: CmsShortcutTarget): boolean {
   if (action === 'save') return true
   if (target.editable) return false
   if (action === 'undo' || action === 'redo') return true
   if (!target.selected) return false
   if (action === 'deselect') return true
   return !target.interactive
}

export type CmsClipboardAction = 'copy' | 'cut' | 'paste'

export interface CmsClipboardTarget {
   editable: boolean
   interactive: boolean
   textSelected: boolean
   selected: boolean
}

export function clipboardActionApplies(
   action: CmsClipboardAction,
   target: CmsClipboardTarget
): boolean {
   if (target.editable) return false
   if (action === 'paste') return true
   if (action === 'cut' && target.interactive) return false
   return target.selected && !target.textSelected
}

export function isTrustedPreviewEvent(
   event: { origin: string; source: unknown },
   origin: string,
   source: unknown
): boolean {
   return !!source && event.origin === origin && event.source === source
}

export function emptyBlock(type: string, block: BlockConfig): CmsBlockValue {
   const item: CmsBlockValue = { type }
   for (const [key, field] of Object.entries(block.fields))
      item[key] = field.type === 'blocks' ? starterBlocks(field) : null
   return item
}

function starterBlocks(field: FieldConfig): CmsBlockValue[] | null {
   const types = Object.entries(field.blocks ?? {})
   const count = Math.min(field.min ?? 0, field.max ?? Number.POSITIVE_INFINITY)
   if (types.length !== 1 || count < 1) return null
   const [type, block] = types[0]!
   return Array.from({ length: count }, () => emptyBlock(type, block))
}

export function duplicateBlockAt(
   values: Record<string, unknown>,
   path: CmsBlockPath
): Record<string, unknown> {
   const item = blockAt(values, path)
   if (!item) return values
   const copy = JSON.parse(JSON.stringify(item)) as CmsBlockValue
   return insertBlocks(values, blockListPath(path), blockPathIndex(path) + 1, [copy])
}

export function canHideBlock(block: BlockConfig | undefined): boolean {
   return !!block && !declaresHiddenField(block)
}

export function toggleBlockHiddenAt(
   values: Record<string, unknown>,
   path: CmsBlockPath,
   block: BlockConfig | undefined
): Record<string, unknown> {
   if (!canHideBlock(block)) return values
   return updateBlockAt(values, path, (item) => {
      const { [BLOCK_HIDDEN_KEY]: _hidden, ...rest } = item
      return isHiddenBlock(item) ? rest : { ...rest, [BLOCK_HIDDEN_KEY]: true }
   })
}

export function canMoveBlock(
   fields: Record<string, FieldConfig>,
   values: Record<string, unknown>,
   from: CmsBlockPath,
   toList: CmsBlockPath
): boolean {
   const source = resolveBlockPath(fields, values, from)
   if (!source?.block || !isBlockListPath(toList) || blockPathStartsWith(toList, from)) return false
   const target = blocksFieldAt(fields, values, toList)
   const type = String(source.item.type)
   const blocks = target?.blocks ?? {}
   if (!target || !Object.hasOwn(blocks, type)) return false
   if (sameBlockPath(blockListPath(from), toList)) return true
   if (blockSignature(blocks[type]!) !== blockSignature(source.block)) return false
   return canAddBlock(target, blockListAt(values, toList)?.length ?? 0)
}

export interface CmsDropBox {
   index: number
   top: number
   bottom: number
   left: number
   right: number
}

export function isHorizontalList(boxes: readonly CmsDropBox[]): boolean {
   return boxes.some((box, position) => {
      const next = boxes[position + 1]
      return !!next && next.left >= box.right - 1 && next.top < box.bottom - 1
   })
}

export function insertionIndex(
   boxes: readonly CmsDropBox[],
   point: { x: number; y: number },
   total: number
): number {
   const horizontal = isHorizontalList(boxes)
   for (const box of boxes) {
      const before = horizontal
         ? point.x < (box.left + box.right) / 2
         : point.y < (box.top + box.bottom) / 2
      if (before) return box.index
   }
   const last = boxes[boxes.length - 1]
   return last ? last.index + 1 : total
}

function pushMediaKeys(keys: Set<string>, field: FieldConfig, value: unknown) {
   if (field.type !== 'media' || value == null) return
   const values = typeof value === 'object' ? Object.values(value) : [value]
   for (const key of values) if (typeof key === 'string' && key) keys.add(key)
}

export function collectMediaKeys(
   fields: Record<string, FieldConfig>,
   values: Record<string, unknown> | null | undefined
): string[] {
   const keys = new Set<string>()
   for (const [key, field] of Object.entries(fields)) pushMediaKeys(keys, field, values?.[key])
   walkBlocks(fields, values, ({ item, block }) => {
      for (const [blockKey, blockField] of Object.entries(block.fields))
         pushMediaKeys(keys, blockField, item[blockKey])
   })
   return [...keys]
}

export function previewMedia(
   key: string,
   item: MediaItem | undefined,
   baseUrl: string | null | undefined
): CmsPreviewMedia {
   return {
      key,
      url: item?.url ?? mediaPublicUrl(baseUrl, key),
      type: item?.type ?? mediaTypeForKey(key),
      alt: item?.alt ?? null,
      folder: item?.folder ?? null,
      mime: item?.mime ?? null,
      size: item?.size ?? null,
      width: item?.width ?? null,
      height: item?.height ?? null,
      focalX: item?.focalX ?? null,
      focalY: item?.focalY ?? null,
   }
}

export function previewBlocks(
   field: FieldConfig,
   value: unknown,
   locale: string,
   defaultLocale: string,
   media: Record<string, CmsPreviewMedia>,
   resolveLink: CmsPreviewLinkResolver = externalLinks(locale, defaultLocale)
): CmsBlockValue[] {
   if (!Array.isArray(value)) return []
   const localized = localizeBlocks(field, value, locale, defaultLocale)
   const resolved = resolveBlocksMedia(field, localized, (key) => media[key] ?? null)
   return previewNestedLists(
      field,
      previewBlockLinks(field, resolved as CmsBlockValue[], resolveLink)
   )
}

function previewNestedLists(field: FieldConfig, items: CmsBlockValue[]): CmsBlockValue[] {
   return mapBlocks(field, items, (item, block) => {
      const empty = Object.entries(block?.fields ?? {}).filter(
         ([key, nested]) => nested.type === 'blocks' && !Array.isArray(item[key])
      )
      return empty.length
         ? { ...item, ...Object.fromEntries(empty.map(([key]) => [key, []])) }
         : item
   }) as CmsBlockValue[]
}

export function previewItem(
   fields: Record<string, FieldConfig>,
   values: Record<string, unknown>,
   locale: string,
   defaultLocale: string,
   media: Record<string, CmsPreviewMedia>,
   resolveLink: CmsPreviewLinkResolver = externalLinks(locale, defaultLocale)
): Record<string, unknown> {
   const item: Record<string, unknown> = {}
   for (const [key, field] of Object.entries(fields)) {
      if (isPrivateField(field)) continue
      const value = values[key] ?? null
      if (field.type === 'blocks') {
         item[key] = previewBlocks(field, value, locale, defaultLocale, media, resolveLink)
      } else if (field.type === 'link') {
         item[key] = resolveLink(value)
      } else if (field.type === 'media') {
         const mediaKey = isTranslatableMediaField(field)
            ? pickTranslatedMedia(
                 decodeTranslatableValue(value, defaultLocale),
                 locale,
                 defaultLocale
              )
            : value
         item[key] = typeof mediaKey === 'string' && mediaKey ? media[mediaKey] ?? null : null
      } else if (isTranslatableField(field)) {
         const translations = decodeTranslatableValue(value, defaultLocale)
         item[key] = translations?.[locale] ?? translations?.[defaultLocale] ?? null
      } else {
         item[key] = value
      }
   }
   return item
}

const SUMMARY_FIELD_TYPES = new Set(['text', 'richtext', 'email'])

const HTML_ENTITIES: Record<string, string> = {
   amp: '&',
   lt: '<',
   gt: '>',
   quot: '"',
   apos: "'",
   nbsp: ' ',
   '#39': "'",
}

function plainText(value: string) {
   return value
      .replace(/<[^>]*>/g, ' ')
      .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (_, name: string) => HTML_ENTITIES[name]!)
      .replace(/\s+/g, ' ')
      .trim()
}

function localizedText(raw: unknown, locale: string, defaultLocale: string) {
   if (typeof raw === 'string') return raw
   if (!isRecord(raw)) return ''
   const value = raw[locale] || raw[defaultLocale]
   return typeof value === 'string' ? value : ''
}

function blockMediaName(
   block: BlockConfig | undefined,
   item: CmsBlockValue,
   locale: string,
   defaultLocale: string
) {
   for (const [key, field] of Object.entries(block?.fields ?? {})) {
      if (field.type !== 'media') continue
      const raw = item[key]
      const value = isTranslatableMediaField(field)
         ? pickTranslatedMedia(decodeTranslatableValue(raw, defaultLocale), locale, defaultLocale)
         : raw
      if (typeof value === 'string' && value) return mediaFilename(value)
   }
   return ''
}

export function blockSummary(
   block: BlockConfig | undefined,
   item: CmsBlockValue,
   locale: string,
   defaultLocale: string,
   max = 80
): string {
   let text = ''
   for (const [key, field] of Object.entries(block?.fields ?? {})) {
      if (field.type === 'link') {
         text = linkDisplayText(item[key], locale, defaultLocale).trim()
         if (text) break
         continue
      }
      if (!SUMMARY_FIELD_TYPES.has(field.type)) continue
      text = plainText(localizedText(item[key], locale, defaultLocale))
      if (text) break
   }
   if (!text) text = blockMediaName(block, item, locale, defaultLocale)
   if (!text) text = nestedBlockSummary(block, item, locale, defaultLocale, max)
   return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function nestedBlockSummary(
   block: BlockConfig | undefined,
   item: CmsBlockValue,
   locale: string,
   defaultLocale: string,
   max: number
): string {
   let count = 0
   for (const [key, field] of Object.entries(block?.fields ?? {})) {
      const list = item[key]
      if (field.type !== 'blocks' || !Array.isArray(list)) continue
      for (const child of list) {
         if (!isRecord(child)) continue
         count++
         const text = blockSummary(
            field.blocks?.[String(child.type)],
            child as CmsBlockValue,
            locale,
            defaultLocale,
            max
         )
         if (text) return text
      }
   }
   return count ? `${count} ${count === 1 ? 'block' : 'blocks'}` : ''
}

function itemPrefixes(segments: readonly string[]): string[] {
   const prefixes: string[] = []
   for (let end = 2; end <= segments.length; end += 2) {
      if (!/^\d+$/.test(segments[end - 1]!)) break
      prefixes.push(segments.slice(0, end).join('.'))
   }
   return prefixes
}

export function blockErrorPaths(
   errors: Record<string, string | undefined | null>,
   fieldKey: string
): Set<string> {
   const paths = new Set<string>()
   for (const [key, message] of Object.entries(errors)) {
      if (!message || !key.startsWith(`${fieldKey}.`)) continue
      for (const prefix of itemPrefixes(key.split('.'))) paths.add(prefix)
   }
   return paths
}

function compareErrorKeys(a: string, b: string): number {
   const left = a.split('.')
   const right = b.split('.')
   for (let position = 0; position < Math.min(left.length, right.length); position++) {
      const x = left[position]!
      const y = right[position]!
      if (x === y) continue
      if (/^\d+$/.test(x) && /^\d+$/.test(y)) return Number(x) - Number(y)
      return 0
   }
   return left.length - right.length
}

export function firstBlockError(
   errors: Record<string, string | undefined | null>,
   fieldKey: string
): { path: CmsBlockPath; key?: string } | null {
   const keys = Object.keys(errors)
      .filter((key) => errors[key] && key.startsWith(`${fieldKey}.`))
      .sort(compareErrorKeys)
   for (const key of keys) {
      const segments = key.split('.')
      const deepest = itemPrefixes(segments).at(-1)
      const path = deepest ? parseBlockPath(deepest) : null
      if (!path) continue
      const next = segments[path.length]
      return next ? { path, key: next } : { path }
   }
   return null
}

export function editorIssueKeys(
   fields: Record<string, FieldConfig>,
   values: Record<string, unknown>,
   path: readonly unknown[],
   fieldKey: string
): string[] {
   const [head] = path
   if (typeof head !== 'string' && typeof head !== 'number') return []
   const keys = [String(head)]
   if (String(head) !== fieldKey || typeof path[1] !== 'number') return keys
   let end = 2
   while (end <= MAX_BLOCKS_DEPTH * 2) {
      const item = path.slice(0, end) as CmsBlockPathSegment[]
      const next = path[end]
      if (typeof next !== 'string' && typeof next !== 'number') {
         keys.push(formatBlockPath(item))
         break
      }
      const block = resolveBlockPath(fields, values, item)?.block
      const field = block && Object.hasOwn(block.fields, next) ? block.fields[next] : undefined
      if (field?.type === 'blocks' && typeof path[end + 1] === 'number') {
         end += 2
         continue
      }
      keys.push(`${formatBlockPath(item)}.${String(next)}`)
      break
   }
   return keys
}

export interface CmsBlockTreeVisit {
   path: CmsBlockPath
   item: CmsBlockValue
   block: BlockConfig | undefined
   field: FieldConfig
}

export function blockTreeVisits(
   fields: Record<string, FieldConfig>,
   values: Record<string, unknown> | null | undefined,
   prefix: CmsBlockPath = []
): CmsBlockTreeVisit[] {
   const visits: CmsBlockTreeVisit[] = []
   for (const [key, field] of Object.entries(fields)) {
      const list = values?.[key]
      if (field?.type !== 'blocks' || !Array.isArray(list)) continue
      list.forEach((item: unknown, index) => {
         if (!isRecord(item)) return
         const block = field.blocks?.[String(item.type)]
         const path = [...prefix, key, index]
         visits.push({ path, item, block, field })
         if (block) visits.push(...blockTreeVisits(block.fields, item, path))
      })
   }
   return visits
}

export interface CmsBlockIdSnapshot<T> {
   items: Map<CmsBlockValue, T>
   lists: Map<string, { items: CmsBlockValue[]; ids: T[] }>
}

function listKeyOf<T>(path: CmsBlockPath, ids: Map<string, T>): string {
   const parent = parentBlockPath(path)
   const owner = parent ? ids.get(formatBlockPath(parent)) : 'root'
   return `${String(owner)}:${String(path.at(-2))}`
}

function replacedId<T>(
   before: { items: CmsBlockValue[]; ids: T[] } | undefined,
   item: CmsBlockValue,
   index: number,
   present: Set<CmsBlockValue>,
   used: Set<T>
): T | undefined {
   let best: { id: T; distance: number } | undefined
   before?.items.forEach((candidate, position) => {
      const id = before.ids[position]
      if (id === undefined || used.has(id) || present.has(candidate)) return
      if (candidate.type !== item.type) return
      const distance = Math.abs(position - index)
      if (!best || distance < best.distance) best = { id, distance }
   })
   return best?.id
}

export function stableBlockTreeIds<T>(
   visits: readonly CmsBlockTreeVisit[],
   previous: CmsBlockIdSnapshot<T> | null,
   createId: () => T
): { ids: Map<string, T>; snapshot: CmsBlockIdSnapshot<T> } {
   const present = new Set(visits.map((visit) => visit.item))
   const used = new Set<T>()
   const assigned = new Map<number, T>()
   visits.forEach((visit, position) => {
      const id = previous?.items.get(visit.item)
      if (id === undefined || used.has(id)) return
      used.add(id)
      assigned.set(position, id)
   })
   const ids = new Map<string, T>()
   const snapshot: CmsBlockIdSnapshot<T> = { items: new Map(), lists: new Map() }
   visits.forEach((visit, position) => {
      const listKey = listKeyOf(visit.path, ids)
      const index = blockPathIndex(visit.path)
      let id = assigned.get(position)
      if (id === undefined) {
         id = replacedId(previous?.lists.get(listKey), visit.item, index, present, used)
         id ??= createId()
         used.add(id)
      }
      ids.set(formatBlockPath(visit.path), id)
      if (!snapshot.items.has(visit.item)) snapshot.items.set(visit.item, id)
      const list = snapshot.lists.get(listKey) ?? { items: [], ids: [] }
      list.items[index] = visit.item
      list.ids[index] = id
      snapshot.lists.set(listKey, list)
   })
   return { ids, snapshot }
}
