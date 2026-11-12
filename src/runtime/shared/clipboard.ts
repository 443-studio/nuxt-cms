import type { BlockConfig, CmsI18n, FieldConfig } from './index'
import {
   BLOCK_HIDDEN_KEY,
   allowsExternalLinks,
   declaredLinkTargets,
   declaresHiddenField,
   isTranslatableField,
   linkUrlError,
   selectOptionValues,
} from './index'
import type { CmsLinkValue } from './links'
import type { CmsBlockValue } from './preview'
import { CMS_CLIPBOARD_MAX_LENGTH } from './preview'
import { objectKeySchema } from './validation'

export const CMS_CLIPBOARD_KIND = 'blocks'

export const CMS_CLIPBOARD_VERSION = 1

export const CMS_CLIPBOARD_MAX_ITEMS = 200

export interface CmsClipboardPayload {
   nuxtCms: typeof CMS_CLIPBOARD_KIND
   version: typeof CMS_CLIPBOARD_VERSION
   items: CmsBlockValue[]
}

export interface CmsPasteResult {
   list: CmsBlockValue[]
   at: number
   pasted: number
   unknown: string[]
   overflow: number
}

export interface CmsClipboardNotice {
   title: string
   description?: string
   color?: 'success' | 'error'
}

function isRecord(value: unknown): value is Record<string, unknown> {
   return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isBlockItem(value: unknown): value is CmsBlockValue {
   return isRecord(value) && typeof value.type === 'string' && value.type !== ''
}

export function clipboardText(items: readonly CmsBlockValue[]): string {
   const payload: CmsClipboardPayload = {
      nuxtCms: CMS_CLIPBOARD_KIND,
      version: CMS_CLIPBOARD_VERSION,
      items: items.map((item) => ({ ...item })),
   }
   return JSON.stringify(payload)
}

export function parseClipboardText(text: unknown): CmsBlockValue[] | null {
   if (typeof text !== 'string' || text.length > CMS_CLIPBOARD_MAX_LENGTH) return null
   if (!text.trimStart().startsWith('{')) return null
   let data: unknown
   try {
      data = JSON.parse(text)
   } catch {
      return null
   }
   if (!isRecord(data) || data.nuxtCms !== CMS_CLIPBOARD_KIND) return null
   if (data.version !== CMS_CLIPBOARD_VERSION || !Array.isArray(data.items)) return null
   const items = data.items.filter(isBlockItem).slice(0, CMS_CLIPBOARD_MAX_ITEMS)
   return items.length ? items : null
}

function isMediaKey(value: unknown): value is string {
   return objectKeySchema.safeParse(value).success
}

function localizedShape(
   raw: unknown,
   i18n: CmsI18n,
   accepts: (value: unknown) => value is string
): Record<string, string> | null {
   if (typeof raw === 'string') return raw && accepts(raw) ? { [i18n.defaultLocale]: raw } : null
   if (!isRecord(raw)) return null
   const entries = Object.entries(raw).filter(
      (pair): pair is [string, string] => i18n.locales.includes(pair[0]) && accepts(pair[1])
   )
   return entries.length ? Object.fromEntries(entries) : null
}

function isString(value: unknown): value is string {
   return typeof value === 'string'
}

function plainShape(field: FieldConfig, raw: unknown, i18n: CmsI18n): unknown {
   if (field.type === 'json' || field.type === 'link' || !isRecord(raw)) return raw
   const value = raw[i18n.defaultLocale]
   if (typeof value === 'string') return value
   return Object.values(raw).find((entry) => typeof entry === 'string') ?? null
}

function trimmedText(value: unknown): string {
   return typeof value === 'string' ? value.trim() : ''
}

function linkLabelShape(
   field: FieldConfig,
   raw: unknown,
   i18n: CmsI18n
): string | Record<string, string> | undefined {
   if (!field.withLabel || raw == null) return undefined
   if (field.translatable && i18n.locales.length) {
      const label = localizedShape(raw, i18n, isString)
      if (!label) return undefined
      const kept = Object.entries(label)
         .map(([locale, text]) => [locale, text.trim()] as const)
         .filter(([, text]) => !!text)
      return kept.length ? Object.fromEntries(kept) : undefined
   }
   const text = trimmedText(plainShape({ ...field, type: 'text' }, raw, i18n))
   return text || undefined
}

function linkShape(field: FieldConfig, raw: unknown, i18n: CmsI18n): CmsLinkValue | null {
   if (!isRecord(raw)) return null
   const url = trimmedText(raw.url)
   const entry = trimmedText(raw.entry)
   const id = trimmedText(raw.id)
   const label = linkLabelShape(field, raw.label, i18n)
   const extra: CmsLinkValue = {
      ...(label !== undefined ? { label } : {}),
      ...(raw.newTab === true ? { newTab: true } : {}),
   }
   if (url && !entry && !id) {
      if (!allowsExternalLinks(field) || linkUrlError(url)) return null
      return { url, ...extra }
   }
   if (url || !entry || !id) return null
   const targets = declaredLinkTargets(field)
   if (targets && !targets.includes(entry)) return null
   return { entry, id, ...extra }
}

function scalarShape(field: FieldConfig, raw: unknown): unknown {
   if (raw === undefined || raw === null) return null
   switch (field.type) {
      case 'json':
         return raw
      case 'number':
         return typeof raw === 'number' && Number.isFinite(raw) ? raw : null
      case 'boolean':
         return typeof raw === 'boolean' ? raw : null
      case 'media':
         return isMediaKey(raw) ? raw : null
      case 'select': {
         const options = selectOptionValues(field)
         if (field.multiple) {
            if (!Array.isArray(raw)) return null
            const values = [...new Set(raw.filter((value) => options.includes(value)))]
            return values.length ? values : null
         }
         return typeof raw === 'string' && options.includes(raw) ? raw : null
      }
      case 'tags': {
         if (!Array.isArray(raw)) return null
         const values = raw.filter(isString)
         return values.length ? values : null
      }
      default:
         return typeof raw === 'string' ? raw : null
   }
}

export function pastedFieldValue(field: FieldConfig, raw: unknown, i18n: CmsI18n): unknown {
   if (field.type === 'blocks') {
      if (!Array.isArray(raw)) return null
      const { list } = pasteBlocks([], 0, raw.filter(isBlockItem), field, i18n)
      return list.length ? list : null
   }
   if (field.type === 'link') return linkShape(field, raw, i18n)
   if (isTranslatableField(field) && i18n.locales.length > 0)
      return localizedShape(raw, i18n, field.type === 'media' ? isMediaKey : isString)
   return scalarShape(field, plainShape(field, raw, i18n))
}

export function pastedBlock(
   type: string,
   block: BlockConfig,
   item: Record<string, unknown>,
   i18n: CmsI18n
): CmsBlockValue {
   const value: CmsBlockValue = { type }
   for (const [key, field] of Object.entries(block.fields))
      value[key] = pastedFieldValue(field, item[key], i18n)
   if (!declaresHiddenField(block) && item[BLOCK_HIDDEN_KEY] === true)
      value[BLOCK_HIDDEN_KEY] = true
   return value
}

export function pasteBlocks(
   list: readonly CmsBlockValue[],
   at: number,
   items: readonly CmsBlockValue[],
   field: Pick<FieldConfig, 'blocks' | 'max'>,
   i18n: CmsI18n
): CmsPasteResult {
   const blocks = field.blocks ?? {}
   const unknown: string[] = []
   const allowed: CmsBlockValue[] = []
   for (const item of items) {
      const type = String(item.type)
      if (Object.hasOwn(blocks, type)) allowed.push(item)
      else unknown.push(type)
   }
   const room = field.max === undefined ? allowed.length : Math.max(field.max - list.length, 0)
   const kept = allowed.slice(0, room)
   const index = Math.min(Math.max(at, 0), list.length)
   const next = [...list]
   next.splice(
      index,
      0,
      ...kept.map((item) => pastedBlock(String(item.type), blocks[String(item.type)]!, item, i18n))
   )
   return {
      list: next,
      at: index,
      pasted: kept.length,
      unknown,
      overflow: allowed.length - kept.length,
   }
}

export function pasteableCount(
   items: readonly CmsBlockValue[] | null | undefined,
   field: Pick<FieldConfig, 'blocks'>
): number {
   const blocks = field.blocks ?? {}
   return (items ?? []).filter((item) => Object.hasOwn(blocks, String(item.type))).length
}

function blockCount(count: number) {
   return `${count} ${count === 1 ? 'block' : 'blocks'}`
}

export function skippedText(
   result: CmsPasteResult,
   field: Pick<FieldConfig, 'max'>
): string | undefined {
   const parts: string[] = []
   if (result.unknown.length) {
      const types = [...new Set(result.unknown)].join(', ')
      parts.push(
         `${blockCount(result.unknown.length)} skipped, not available in this field: ${types}.`
      )
   }
   if (result.overflow) {
      const max = field.max ?? 0
      parts.push(
         `${blockCount(result.overflow)} skipped, this field holds at most ${blockCount(max)}.`
      )
   }
   return parts.length ? parts.join(' ') : undefined
}

export function copyNotice(count: number, cut = false): CmsClipboardNotice {
   const what = count === 1 ? 'Block' : blockCount(count)
   return { title: `${what} ${cut ? 'cut' : 'copied'}` }
}

export function pasteNotice(
   result: CmsPasteResult | null,
   field: Pick<FieldConfig, 'max'>
): CmsClipboardNotice {
   if (!result) return { title: 'Nothing to paste', description: 'Copy or cut a block first.' }
   const description = skippedText(result, field)
   if (!result.pasted) return { title: 'Nothing pasted', description, color: 'error' }
   return {
      title: `${result.pasted === 1 ? 'Block' : blockCount(result.pasted)} pasted`,
      description,
      color: description ? undefined : 'success',
   }
}
