import type { BlockConfig, CmsI18n, FieldConfig } from './index'
import { BLOCK_HIDDEN_KEY, declaresHiddenField, isTranslatableField } from './index'
import type { CmsBlockValue } from './preview'
import { CMS_CLIPBOARD_MAX_LENGTH } from './preview'
import { blockFieldValue } from './validation'

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

function localizedShape(raw: unknown, i18n: CmsI18n): Record<string, string> | null {
   if (typeof raw === 'string') return raw ? { [i18n.defaultLocale]: raw } : null
   if (!isRecord(raw)) return null
   const entries = Object.entries(raw).filter(
      (pair): pair is [string, string] =>
         i18n.locales.includes(pair[0]) && typeof pair[1] === 'string'
   )
   return entries.length ? Object.fromEntries(entries) : null
}

function plainShape(field: FieldConfig, raw: unknown, i18n: CmsI18n): unknown {
   if (field.type === 'json' || field.type === 'link' || !isRecord(raw)) return raw
   const value = raw[i18n.defaultLocale]
   if (typeof value === 'string') return value
   return Object.values(raw).find((entry) => typeof entry === 'string') ?? null
}

export function pastedFieldValue(field: FieldConfig, raw: unknown, i18n: CmsI18n): unknown {
   if (field.type === 'blocks') {
      if (!Array.isArray(raw)) return null
      const { list } = pasteBlocks([], 0, raw.filter(isBlockItem), field, i18n)
      return list.length ? list : null
   }
   const localized = isTranslatableField(field) && i18n.locales.length > 0
   const shaped = localized ? localizedShape(raw, i18n) : plainShape(field, raw, i18n)
   return blockFieldValue(field, shaped, i18n)
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
