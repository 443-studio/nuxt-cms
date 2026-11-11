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
   mapBlocks,
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

export interface CmsPreviewState {
   entry: string
   field: string
   locale: string
   blocks: CmsBlockValue[]
   item: Record<string, unknown> | null
   media: Record<string, CmsPreviewMedia>
   selected: number | null
   editable: boolean
   lockedFields: string[]
}

export type CmsPreviewHostMessage =
   | { type: 'render'; state: CmsPreviewState }
   | { type: 'highlight'; index: number | null }
   | { type: 'reveal'; index: number }

export type CmsPreviewFrameMessage =
   | { type: 'ready' }
   | { type: 'select'; index: number | null; focus?: boolean }
   | { type: 'hover'; index: number | null }
   | { type: 'insert'; index: number }
   | { type: 'move'; from: number; to: number; focus?: boolean }
   | { type: 'duplicate'; index: number }
   | { type: 'toggle-hidden'; index: number }
   | { type: 'remove'; index: number }
   | { type: 'copy'; index: number }
   | { type: 'cut'; index: number }
   | { type: 'paste'; index: number; text?: string }
   | { type: 'focus-field'; index: number | null; key: string }
   | {
        type: 'field-input'
        index: number | null
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

function isIndex(value: unknown): value is number {
   return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

const FIELD_KEY = /^[a-z_]\w{0,99}$/i

export function isFieldKey(value: unknown): value is string {
   return typeof value === 'string' && FIELD_KEY.test(value)
}

function envelope(data: unknown): Record<string, unknown> | null {
   if (!isRecord(data) || data.channel !== CMS_PREVIEW_CHANNEL) return null
   return typeof data.type === 'string' ? data : null
}

const LOCALE_CODE = /^[a-z0-9_-]{1,35}$/i

function parseFieldInput(message: Record<string, unknown>): CmsPreviewFrameMessage | null {
   if (message.index !== null && !isIndex(message.index)) return null
   if (!isFieldKey(message.key)) return null
   if (typeof message.locale !== 'string' || !LOCALE_CODE.test(message.locale)) return null
   if (typeof message.value !== 'string' || message.value.length > CMS_INLINE_TEXT_MAX_LENGTH)
      return null
   return {
      type: 'field-input',
      index: message.index,
      key: message.key,
      locale: message.locale,
      value: message.value,
      ...(message.commit === true ? { commit: true } : {}),
   }
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
         return message.index === null || isIndex(message.index)
            ? { type: 'select', index: message.index, ...focus }
            : null
      case 'hover':
         return message.index === null || isIndex(message.index)
            ? { type: 'hover', index: message.index }
            : null
      case 'move':
         return isIndex(message.from) && isIndex(message.to)
            ? { type: 'move', from: message.from, to: message.to, ...focus }
            : null
      case 'insert':
      case 'duplicate':
      case 'toggle-hidden':
      case 'remove':
      case 'copy':
      case 'cut':
         return isIndex(message.index) ? { type: message.type, index: message.index } : null
      case 'focus-field':
         return (message.index === null || isIndex(message.index)) && isFieldKey(message.key)
            ? { type: 'focus-field', index: message.index, key: message.key }
            : null
      case 'field-input':
         return parseFieldInput(message)
      case 'paste':
         if (!isIndex(message.index)) return null
         if (message.text === undefined) return { type: 'paste', index: message.index }
         return typeof message.text === 'string' && message.text.length <= CMS_CLIPBOARD_MAX_LENGTH
            ? { type: 'paste', index: message.index, text: message.text }
            : null
      default:
         return null
   }
}

export function parseHostMessage(data: unknown): CmsPreviewHostMessage | null {
   const message = envelope(data)
   if (!message) return null
   if (message.type === 'highlight')
      return message.index === null || isIndex(message.index)
         ? { type: 'highlight', index: message.index }
         : null
   if (message.type === 'reveal')
      return isIndex(message.index) ? { type: 'reveal', index: message.index } : null
   if (message.type !== 'render' || !isRecord(message.state)) return null
   const state = message.state
   if (typeof state.entry !== 'string' || typeof state.field !== 'string') return null
   if (typeof state.locale !== 'string' || !Array.isArray(state.blocks)) return null
   if (state.item !== null && !isRecord(state.item)) return null
   if (!isRecord(state.media)) return null
   if (state.selected !== null && !isIndex(state.selected)) return null
   return {
      type: 'render',
      state: {
         entry: state.entry,
         field: state.field,
         locale: state.locale,
         blocks: state.blocks.filter(isRecord),
         item: state.item as Record<string, unknown> | null,
         media: state.media as Record<string, CmsPreviewMedia>,
         selected: state.selected as number | null,
         editable: state.editable !== false,
         lockedFields: Array.isArray(state.lockedFields)
            ? state.lockedFields.filter((path): path is string => typeof path === 'string')
            : [],
      },
   }
}

export interface CmsFieldTarget {
   index: number | null
   key: string
}

export function previewFieldConfig(
   target: CmsFieldTarget & { blockType?: string | null },
   blocksField: FieldConfig | undefined,
   entryFields: Record<string, FieldConfig> | null | undefined,
   blocksKey: string
): FieldConfig | undefined {
   if (!isFieldKey(target.key)) return undefined
   if (target.index !== null) {
      const block = target.blockType ? blocksField?.blocks?.[target.blockType] : undefined
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
   if (action === 'insert-after' || action === 'insert-before') return !target.interactive
   return true
}

export type CmsClipboardAction = 'copy' | 'cut' | 'paste'

export interface CmsClipboardTarget {
   editable: boolean
   textSelected: boolean
   selected: boolean
}

export function clipboardActionApplies(
   action: CmsClipboardAction,
   target: CmsClipboardTarget
): boolean {
   if (target.editable) return false
   if (action === 'paste') return true
   return target.selected && !target.textSelected
}

export function isTrustedPreviewEvent(
   event: { origin: string; source: unknown },
   origin: string,
   source: unknown
): boolean {
   return !!source && event.origin === origin && event.source === source
}

function clamp(index: number, length: number) {
   return Math.min(Math.max(index, 0), length)
}

export function emptyBlock(type: string, block: BlockConfig): CmsBlockValue {
   return { type, ...Object.fromEntries(Object.keys(block.fields).map((key) => [key, null])) }
}

export function insertBlock(
   list: readonly CmsBlockValue[],
   index: number,
   item: CmsBlockValue
): CmsBlockValue[] {
   const next = [...list]
   next.splice(clamp(index, list.length), 0, item)
   return next
}

export function moveBlock(
   list: readonly CmsBlockValue[],
   from: number,
   to: number
): CmsBlockValue[] {
   if (from === to || from < 0 || from >= list.length || to < 0 || to >= list.length)
      return [...list]
   const next = [...list]
   const [item] = next.splice(from, 1)
   next.splice(to, 0, item!)
   return next
}

export function duplicateBlock(list: readonly CmsBlockValue[], index: number): CmsBlockValue[] {
   const item = list[index]
   if (!item) return [...list]
   return insertBlock(list, index + 1, JSON.parse(JSON.stringify(item)) as CmsBlockValue)
}

export function removeBlock(list: readonly CmsBlockValue[], index: number): CmsBlockValue[] {
   return list.filter((_, i) => i !== index)
}

export function canHideBlock(block: BlockConfig | undefined): boolean {
   return !!block && !declaresHiddenField(block)
}

export function toggleBlockHidden(
   list: readonly CmsBlockValue[],
   index: number,
   block: BlockConfig | undefined
): CmsBlockValue[] {
   const item = list[index]
   if (!item || !canHideBlock(block)) return [...list]
   const { [BLOCK_HIDDEN_KEY]: _hidden, ...rest } = item
   const updated = isHiddenBlock(item) ? rest : { ...rest, [BLOCK_HIDDEN_KEY]: true }
   return list.map((current, i) => (i === index ? updated : current))
}

export function selectionAfterMove(selected: number | null, from: number, to: number) {
   if (selected === null) return null
   if (selected === from) return to
   if (from < selected && to >= selected) return selected - 1
   if (from > selected && to <= selected) return selected + 1
   return selected
}

export function selectionAfterRemove(selected: number | null, index: number) {
   if (selected === null || selected === index) return null
   return selected > index ? selected - 1 : selected
}

export function moveTargetForInsertion(from: number, insertAt: number): number {
   return insertAt > from ? insertAt - 1 : insertAt
}

export function insertionIndex(
   blocks: readonly { index: number; top: number; bottom: number }[],
   y: number,
   total: number
): number {
   for (const block of blocks) {
      if (y < (block.top + block.bottom) / 2) return block.index
   }
   const last = blocks[blocks.length - 1]
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
   return previewBlockLinks(field, resolved as CmsBlockValue[], resolveLink)
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

export function blockErrorIndexes(
   errors: Record<string, string | undefined | null>,
   fieldKey: string
): Set<number> {
   const indexes = new Set<number>()
   const prefix = `${fieldKey}.`
   for (const [key, message] of Object.entries(errors)) {
      if (!message || !key.startsWith(prefix)) continue
      const index = Number(key.slice(prefix.length).split('.')[0])
      if (isIndex(index)) indexes.add(index)
   }
   return indexes
}

export function stableBlockIds<T>(
   previous: readonly CmsBlockValue[],
   previousIds: readonly T[],
   next: readonly CmsBlockValue[],
   createId: () => T
): T[] {
   const known = new Map<CmsBlockValue, T>()
   previous.forEach((item, index) => {
      const id = previousIds[index]
      if (id !== undefined && !known.has(item)) known.set(item, id)
   })
   const kept = new Set(next)
   const used = new Set<T>()
   const ids = next.map((item) => {
      const id = known.get(item)
      if (id === undefined || used.has(id)) return undefined
      used.add(id)
      return id
   })
   return ids.map((id, index) => {
      if (id !== undefined) return id
      const replaced = previous[index]
      const candidate = previousIds[index]
      if (replaced && !kept.has(replaced) && candidate !== undefined && !used.has(candidate)) {
         used.add(candidate)
         return candidate
      }
      const fresh = createId()
      used.add(fresh)
      return fresh
   })
}
