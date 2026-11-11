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
   mediaPublicUrl,
   mediaTypeForKey,
   pickTranslatedMedia,
   resolveBlocksMedia,
   linkDisplayText,
   resolveCmsLink,
} from './index'

export type CmsPreviewLinkResolver = (value: unknown) => CmsLink | null

function externalLinks(locale: string, defaultLocale: string): CmsPreviewLinkResolver {
   return (value) => resolveCmsLink({}, value, locale, defaultLocale)
}

function previewBlockLinks(
   field: FieldConfig,
   items: CmsBlockValue[],
   resolveLink: CmsPreviewLinkResolver
): CmsBlockValue[] {
   return items.map((item) => {
      const block = isRecord(item) ? field.blocks?.[String(item.type)] : undefined
      const keys = Object.entries(block?.fields ?? {})
         .filter(([, blockField]) => blockField.type === 'link')
         .map(([key]) => key)
      if (!keys.length) return item
      const resolved = { ...item }
      for (const key of keys) resolved[key] = resolveLink(item[key])
      return resolved
   })
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
}

export type CmsPreviewHostMessage = { type: 'render'; state: CmsPreviewState }

export type CmsPreviewFrameMessage =
   | { type: 'ready' }
   | { type: 'select'; index: number | null; focus?: boolean }
   | { type: 'insert'; index: number }
   | { type: 'move'; from: number; to: number; focus?: boolean }
   | { type: 'duplicate'; index: number }
   | { type: 'toggle-hidden'; index: number }
   | { type: 'remove'; index: number }
   | { type: 'undo' }
   | { type: 'redo' }
   | { type: 'save' }

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

function envelope(data: unknown): Record<string, unknown> | null {
   if (!isRecord(data) || data.channel !== CMS_PREVIEW_CHANNEL) return null
   return typeof data.type === 'string' ? data : null
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
      case 'move':
         return isIndex(message.from) && isIndex(message.to)
            ? { type: 'move', from: message.from, to: message.to, ...focus }
            : null
      case 'insert':
      case 'duplicate':
      case 'toggle-hidden':
      case 'remove':
         return isIndex(message.index) ? { type: message.type, index: message.index } : null
      default:
         return null
   }
}

export function parseHostMessage(data: unknown): CmsPreviewHostMessage | null {
   const message = envelope(data)
   if (!message || message.type !== 'render' || !isRecord(message.state)) return null
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
      },
   }
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
   for (const [key, field] of Object.entries(fields)) {
      const value = values?.[key]
      if (field.type === 'media') {
         pushMediaKeys(keys, field, value)
         continue
      }
      if (field.type !== 'blocks' || !Array.isArray(value)) continue
      for (const item of value) {
         if (!isRecord(item)) continue
         const block = field.blocks?.[String(item.type)]
         for (const [blockKey, blockField] of Object.entries(block?.fields ?? {}))
            pushMediaKeys(keys, blockField, item[blockKey])
      }
   }
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

export function blockSummary(
   block: BlockConfig | undefined,
   item: CmsBlockValue,
   locale: string,
   defaultLocale: string,
   max = 80
): string {
   for (const [key, field] of Object.entries(block?.fields ?? {})) {
      if (field.type === 'link') {
         const text = linkDisplayText(item[key], locale, defaultLocale)
         if (text) return text.length > max ? `${text.slice(0, max - 1)}…` : text
         continue
      }
      if (field.type !== 'text' && field.type !== 'richtext') continue
      const raw = item[key]
      const translations = isRecord(raw) ? (raw as Record<string, string>) : null
      const value =
         typeof raw === 'string'
            ? raw
            : translations?.[locale] || translations?.[defaultLocale] || ''
      const text = value
         .replace(/<[^>]*>/g, ' ')
         .replace(/\s+/g, ' ')
         .trim()
      if (text) return text.length > max ? `${text.slice(0, max - 1)}…` : text
   }
   return ''
}
