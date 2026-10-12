import type { CmsEntry, CmsI18n, FieldConfig } from './index'
import { isCollectionKind, isMultiSelect, isTranslatableField, selectOptionLabel } from './index'

export type CmsTransferFormat = 'json' | 'csv'

export type CmsImportMode = 'create' | 'upsert'

export const TRANSFER_FORMATS: CmsTransferFormat[] = ['json', 'csv']

export const IMPORT_MODES: CmsImportMode[] = ['create', 'upsert']

export const IMPORT_MAX_BYTES = 5 * 1024 * 1024

export const IMPORT_MAX_ROWS = 2000

export const IMPORT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

export const TRANSFER_ID_KEY = 'id'

export const TRANSFER_TIMESTAMP_KEYS = ['createdAt', 'updatedAt'] as const

const STATUS_KEY = 'status'

const CSV_BOM = '﻿'

type TransferEntry = Pick<CmsEntry, 'kind' | 'fields' | 'drafts'>

export interface CmsImportIssue {
   path: string
   message: string
}

export interface CmsImportSourceRow {
   index: number
   values: Record<string, unknown>
   errors: CmsImportIssue[]
}

export interface CmsImportSource {
   rows: CmsImportSourceRow[]
   errors: string[]
}

export type CmsImportAction = 'create' | 'update'

export interface CmsImportPreviewRow {
   index: number
   id: string | null
   action: CmsImportAction
   title: string | null
   errors: CmsImportIssue[]
}

export interface CmsImportPreview {
   format: CmsTransferFormat
   mode: CmsImportMode
   total: number
   valid: number
   create: number
   update: number
   errors: string[]
   rows: CmsImportPreviewRow[]
   imported: boolean
}

export interface CmsExportFile {
   collection: string
   exportedAt: string
   total: number
   items: Record<string, unknown>[]
}

function hasStatus(entry: TransferEntry) {
   return isCollectionKind(entry) && !!entry.drafts && !Object.hasOwn(entry.fields, STATUS_KEY)
}

export function canTransferCsv(entry: Pick<CmsEntry, 'fields'>): boolean {
   return Object.values(entry.fields).every(
      (field) =>
         field.type !== 'blocks' &&
         !(field.type === 'relation' && field.cardinality === 'many-to-many')
   )
}

export function transferKeys(entry: TransferEntry): string[] {
   return [
      TRANSFER_ID_KEY,
      ...Object.keys(entry.fields),
      ...(hasStatus(entry) ? [STATUS_KEY] : []),
      ...TRANSFER_TIMESTAMP_KEYS,
   ]
}

export function exportRow(
   entry: TransferEntry,
   row: Record<string, unknown>
): Record<string, unknown> {
   return Object.fromEntries(
      transferKeys(entry)
         .filter((key) => Object.hasOwn(row, key) || Object.hasOwn(entry.fields, key))
         .map((key) => [key, row[key] ?? null])
   )
}

export function exportFileName(name: string, format: CmsTransferFormat, now = new Date()) {
   return `${name}-${now.toISOString().slice(0, 10)}.${format}`
}

function isLocalized(field: FieldConfig, i18n: CmsI18n) {
   return isTranslatableField(field) && i18n.locales.length > 0
}

export function csvColumns(entry: TransferEntry, i18n: CmsI18n): string[] {
   return transferKeys(entry).flatMap((key) => {
      const field = entry.fields[key]
      if (field && isLocalized(field, i18n)) return i18n.locales.map((locale) => `${key}.${locale}`)
      return [key]
   })
}

export function encodeCsvCell(value: string): string {
   return /[",\r\n]|^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function encodeCsv(rows: string[][]): string {
   return rows.map((row) => row.map(encodeCsvCell).join(',')).join('\r\n') + '\r\n'
}

export function parseCsv(text: string): string[][] {
   const input = text.startsWith(CSV_BOM) ? text.slice(1) : text
   const rows: string[][] = []
   let row: string[] = []
   let cell = ''
   let quoted = false
   let index = 0
   while (index < input.length) {
      const char = input[index]!
      if (quoted) {
         if (char === '"' && input[index + 1] === '"') {
            cell += '"'
            index += 2
            continue
         }
         if (char === '"') quoted = false
         else cell += char
         index++
         continue
      }
      if (char === '"' && cell === '') {
         quoted = true
      } else if (char === ',') {
         row.push(cell)
         cell = ''
      } else if (char === '\n' || char === '\r') {
         row.push(cell)
         rows.push(row)
         row = []
         cell = ''
         if (char === '\r' && input[index + 1] === '\n') index++
      } else {
         cell += char
      }
      index++
   }
   if (quoted) throw new Error('A quoted cell is not closed')
   if (cell !== '' || row.length) {
      row.push(cell)
      rows.push(row)
   }
   return rows.filter((cells) => cells.some((value) => value !== ''))
}

function csvCellText(field: FieldConfig | undefined, value: unknown): string {
   if (value === null || value === undefined) return ''
   if (field?.type === 'json' || isMultiSelectField(field)) return JSON.stringify(value)
   if (typeof value === 'boolean') return value ? 'true' : 'false'
   if (typeof value === 'object') return JSON.stringify(value)
   return String(value)
}

function isMultiSelectField(field: FieldConfig | undefined) {
   return !!field && isMultiSelect(field)
}

export function entryRowsToCsv(
   entry: TransferEntry,
   rows: Record<string, unknown>[],
   i18n: CmsI18n
): string {
   const keys = transferKeys(entry)
   const lines = rows.map((row) =>
      keys.flatMap((key) => {
         const field = entry.fields[key]
         if (field && isLocalized(field, i18n)) {
            const value = row[key]
            const values =
               value && typeof value === 'object'
                  ? (value as Record<string, unknown>)
                  : typeof value === 'string' && value
                    ? { [i18n.defaultLocale]: value }
                    : {}
            return i18n.locales.map((locale) => csvCellText(undefined, values[locale]))
         }
         return [csvCellText(field, row[key])]
      })
   )
   return CSV_BOM + encodeCsv([csvColumns(entry, i18n), ...lines])
}

type CellResult = { value: unknown } | { error: string }

const TRUE_VALUES = ['true', '1', 'yes']
const FALSE_VALUES = ['false', '0', 'no']

export function csvCellValue(field: FieldConfig, text: string): CellResult {
   if (text === '') return { value: null }
   if (field.type === 'number') {
      const number = Number(text.trim())
      return text.trim() && Number.isFinite(number) ? { value: number } : { error: 'Not a number' }
   }
   if (field.type === 'boolean') {
      const lower = text.trim().toLowerCase()
      if (TRUE_VALUES.includes(lower)) return { value: true }
      if (FALSE_VALUES.includes(lower)) return { value: false }
      return { error: 'Not a boolean (true or false)' }
   }
   if (field.type === 'json' || isMultiSelect(field)) {
      try {
         return { value: JSON.parse(text) }
      } catch {
         return { error: 'Invalid JSON' }
      }
   }
   return { value: text }
}

function rowTooMany(count: number): string {
   return `The file has ${count} rows; the limit is ${IMPORT_MAX_ROWS}`
}

export function csvImportSource(
   entry: TransferEntry,
   text: string,
   i18n: CmsI18n
): CmsImportSource {
   let table: string[][]
   try {
      table = parseCsv(text)
   } catch (error) {
      return { rows: [], errors: [(error as Error).message] }
   }
   const [header, ...lines] = table
   if (!header) return { rows: [], errors: ['The file has no header row'] }
   const names = header.map((name) => name.trim())
   const known = new Set(csvColumns(entry, i18n))
   const errors: string[] = []
   const seen = new Set<string>()
   for (const name of names) {
      if (!known.has(name)) errors.push(`Unknown column '${name}'`)
      else if (seen.has(name)) errors.push(`Column '${name}' appears twice`)
      seen.add(name)
   }
   if (lines.length > IMPORT_MAX_ROWS) errors.push(rowTooMany(lines.length))
   if (errors.length) return { rows: [], errors }

   const rows = lines.map((cells, position) => {
      const index = position + 1
      const issues: CmsImportIssue[] = []
      if (cells.length !== names.length) {
         issues.push({
            path: '',
            message: `Expected ${names.length} cells, found ${cells.length}`,
         })
      }
      const cellOf = (name: string) => {
         const at = names.indexOf(name)
         return at === -1 ? undefined : cells[at] ?? ''
      }
      const values: Record<string, unknown> = {}
      for (const key of transferKeys(entry)) {
         const field = entry.fields[key]
         if (field && isLocalized(field, i18n)) {
            const localized: Record<string, string> = {}
            let present = false
            for (const locale of i18n.locales) {
               const text = cellOf(`${key}.${locale}`)
               if (text === undefined) continue
               present = true
               if (text !== '') localized[locale] = text
            }
            if (present) values[key] = Object.keys(localized).length ? localized : null
            continue
         }
         const text = cellOf(key)
         if (text === undefined) continue
         if (!field) {
            values[key] = text === '' ? null : text
            continue
         }
         const result = csvCellValue(field, text)
         if ('error' in result) issues.push({ path: key, message: result.error })
         else values[key] = result.value
      }
      return { index, values, errors: issues }
   })
   return { rows, errors: [] }
}

export function jsonImportSource(entry: TransferEntry, text: string): CmsImportSource {
   let data: unknown
   try {
      data = JSON.parse(text.startsWith(CSV_BOM) ? text.slice(1) : text)
   } catch (error) {
      return { rows: [], errors: [`Invalid JSON: ${(error as Error).message}`] }
   }
   const items = Array.isArray(data)
      ? data
      : data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)
        ? (data as { items: unknown[] }).items
        : null
   if (!items)
      return {
         rows: [],
         errors: ['Expected an array of entries or an object with an items array'],
      }
   if (items.length > IMPORT_MAX_ROWS) return { rows: [], errors: [rowTooMany(items.length)] }
   const allowed = new Set(transferKeys(entry))
   const rows = items.map((item, position) => {
      const index = position + 1
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
         return { index, values: {}, errors: [{ path: '', message: 'Not an object' }] }
      }
      const values = item as Record<string, unknown>
      const errors = Object.keys(values)
         .filter((key) => !allowed.has(key))
         .map((key) => ({ path: key, message: `Unknown field '${key}'` }))
      return { index, values: { ...values }, errors }
   })
   return { rows, errors: [] }
}

export function importSource(
   entry: TransferEntry,
   format: CmsTransferFormat,
   text: string,
   i18n: CmsI18n
): CmsImportSource {
   if (format === 'csv') {
      if (!canTransferCsv(entry))
         return { rows: [], errors: ['CSV needs an entry without blocks and many-to-many fields'] }
      return csvImportSource(entry, text, i18n)
   }
   return jsonImportSource(entry, text)
}

export function importRowTitle(
   entry: Pick<CmsEntry, 'fields' | 'titleField'>,
   values: Record<string, unknown>,
   defaultLocale: string
): string | null {
   const key = entry.titleField
   const field = key ? entry.fields[key] : undefined
   const value = key ? values[key] : undefined
   if (!field || value === null || value === undefined || value === '') return null
   if (typeof value === 'object') {
      const record = value as Record<string, unknown>
      const text = record[defaultLocale] ?? Object.values(record).find(Boolean)
      return typeof text === 'string' && text ? text : null
   }
   if (field.type === 'select') return selectOptionLabel(field, value)
   return String(value)
}

export function importIssuePath(path: readonly PropertyKey[]): string {
   return path.map((part) => String(part)).join('.')
}
