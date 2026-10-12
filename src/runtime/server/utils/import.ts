import { eq, inArray } from 'drizzle-orm'
import type { AnySQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { CmsDb } from '#cms-db'
import type { CmsEntry, CmsI18n } from '../../shared/index'
import { uniqueFieldKeys } from '../../shared/duplicate'
import type {
   CmsImportAction,
   CmsImportIssue,
   CmsImportMode,
   CmsImportPreview,
   CmsImportSourceRow,
   CmsTransferFormat,
} from '../../shared/transfer'
import { IMPORT_ID_PATTERN, importIssuePath, importRowTitle } from '../../shared/transfer'
import { buildEntrySchema } from '../../shared/validation'
import { customId } from './custom-id'
import type { MediaLookup } from './media-references'
import { mediaReferences } from './media-references'
import {
   encodeColumnValues,
   resolveTable,
   withContentDefaults,
   withTimestamps,
   withUpdatedAt,
} from './registry'
import { manyToManyStatements, splitRelationValues } from './relations'
import { chunks, KEY_CHUNK } from './write-statements'

type Columns = Record<string, AnySQLiteColumn>

type Row = Record<string, unknown>

export interface PreparedImportRow {
   index: number
   id: string | null
   values: Row | null
   action: CmsImportAction
   errors: CmsImportIssue[]
}

export interface ImportContext {
   db: CmsDb
   name: string
   entry: CmsEntry
   table: SQLiteTable
   mode: CmsImportMode
   media: MediaLookup | null
}

const META_KEYS = new Set(['id', 'createdAt', 'updatedAt'])

export function validateImportRows(
   entry: CmsEntry,
   rows: CmsImportSourceRow[],
   i18n: CmsI18n
): PreparedImportRow[] {
   const schema = buildEntrySchema(entry, i18n)
   return rows.map((row) => {
      const errors = [...row.errors]
      const rawId = row.values.id
      let id: string | null = null
      if (rawId !== undefined && rawId !== null && rawId !== '') {
         if (typeof rawId === 'string' && IMPORT_ID_PATTERN.test(rawId)) id = rawId
         else
            errors.push({
               path: 'id',
               message: 'Invalid id: use letters, numbers, _ and -, up to 128 characters',
            })
      }
      const input = Object.fromEntries(
         Object.entries(row.values).filter(([key]) => !META_KEYS.has(key))
      )
      const result = schema.safeParse(input)
      if (!result.success) {
         const reported = new Set(errors.map((issue) => issue.path))
         for (const issue of result.error.issues) {
            const path = importIssuePath(issue.path)
            if (!reported.has(path)) errors.push({ path, message: issue.message })
         }
      }
      return {
         index: row.index,
         id,
         values: result.success ? (result.data as Row) : null,
         action: 'create',
         errors,
      }
   })
}

async function existingIds(db: CmsDb, table: SQLiteTable, ids: string[]): Promise<Set<string>> {
   const column = (table as unknown as Columns).id!
   const found = new Set<string>()
   for (const chunk of chunks([...new Set(ids)], KEY_CHUNK)) {
      const rows = (await db.select({ id: column }).from(table).where(inArray(column, chunk))) as {
         id: string
      }[]
      for (const row of rows) found.add(String(row.id))
   }
   return found
}

function relationIds(value: unknown): string[] {
   if (Array.isArray(value)) return value.filter((id): id is string => typeof id === 'string')
   return typeof value === 'string' && value ? [value] : []
}

function addError(row: PreparedImportRow, path: string, message: string) {
   row.errors.push({ path, message })
}

async function checkIds(rows: PreparedImportRow[], context: ImportContext) {
   const first = new Map<string, number>()
   for (const row of rows) {
      if (!row.id) continue
      const seen = first.get(row.id)
      if (seen !== undefined) addError(row, 'id', `Same id as row ${seen}`)
      else first.set(row.id, row.index)
   }
   const existing = await existingIds(context.db, context.table, [...first.keys()])
   for (const row of rows) {
      if (!row.id || !existing.has(row.id)) continue
      if (context.mode === 'create') addError(row, 'id', 'An entry with this id already exists')
      else row.action = 'update'
   }
}

async function checkRelations(rows: PreparedImportRow[], context: ImportContext) {
   const fileIds = new Set(rows.flatMap((row) => (row.id ? [row.id] : [])))
   for (const [key, field] of Object.entries(context.entry.fields)) {
      if (field.type !== 'relation' || !field.to) continue
      const target = resolveTable(field.to)
      if (!target) continue
      const wanted = rows.flatMap((row) => relationIds(row.values?.[key]))
      if (!wanted.length) continue
      const found = await existingIds(context.db, target, wanted)
      if (field.to === context.name) for (const id of fileIds) found.add(id)
      for (const row of rows) {
         const missing = relationIds(row.values?.[key]).filter((id) => !found.has(id))
         if (missing.length) addError(row, key, `Unknown ${field.to} id: ${missing.join(', ')}`)
      }
   }
}

async function checkUnique(rows: PreparedImportRow[], context: ImportContext) {
   const columns = context.table as unknown as Columns
   for (const key of uniqueFieldKeys(context.entry)) {
      const column = columns[key]
      if (!column) continue
      const owners = new Map<string, PreparedImportRow>()
      for (const row of rows) {
         const value = row.values?.[key]
         if (typeof value !== 'string' || !value) continue
         const owner = owners.get(value)
         if (owner) addError(row, key, `Same value as row ${owner.index}`)
         else owners.set(value, row)
      }
      for (const chunk of chunks([...owners.keys()], KEY_CHUNK)) {
         const found = (await context.db
            .select({ id: columns.id!, value: column })
            .from(context.table)
            .where(inArray(column, chunk))) as { id: string; value: string }[]
         for (const match of found) {
            const row = owners.get(String(match.value))
            if (row && row.id !== String(match.id))
               addError(row, key, 'This value is already used by another entry')
         }
      }
   }
}

async function checkMedia(rows: PreparedImportRow[], context: ImportContext) {
   if (!context.media) return
   const references = new Map(
      rows.map((row) => [row, row.values ? mediaReferences(context.entry.fields, row.values) : []])
   )
   const keys = [...new Set([...references.values()].flat().map((reference) => reference.key))]
   if (!keys.length) return
   const known = await context.media(keys)
   for (const [row, list] of references) {
      for (const reference of list) {
         if (!known.has(reference.key))
            addError(row, reference.field, `Media not found in the library: ${reference.key}`)
      }
   }
}

export async function checkImportRows(
   rows: PreparedImportRow[],
   context: ImportContext
): Promise<PreparedImportRow[]> {
   await checkIds(rows, context)
   await checkRelations(rows, context)
   await checkUnique(rows, context)
   await checkMedia(rows, context)
   return rows
}

export function importPreview(
   entry: CmsEntry,
   rows: PreparedImportRow[],
   options: {
      format: CmsTransferFormat
      mode: CmsImportMode
      defaultLocale: string
      errors?: string[]
   }
): CmsImportPreview {
   const valid = rows.filter((row) => !row.errors.length)
   return {
      format: options.format,
      mode: options.mode,
      total: rows.length,
      valid: valid.length,
      create: valid.filter((row) => row.action === 'create').length,
      update: valid.filter((row) => row.action === 'update').length,
      errors: options.errors ?? [],
      rows: rows.map((row) => ({
         index: row.index,
         id: row.id,
         action: row.action,
         title: row.values ? importRowTitle(entry, row.values, options.defaultLocale) : null,
         errors: row.errors,
      })),
      imported: false,
   }
}

function deferredSelfRelations(entry: CmsEntry, name: string): string[] {
   return Object.entries(entry.fields)
      .filter(
         ([, field]) =>
            field.type === 'relation' &&
            field.to === name &&
            field.cardinality !== 'many-to-many' &&
            !field.required
      )
      .map(([key]) => key)
}

export function importWriteStatements(
   db: CmsDb,
   name: string,
   entry: CmsEntry,
   table: SQLiteTable,
   rows: PreparedImportRow[]
): PromiseLike<unknown>[] {
   const idCol = (table as unknown as Columns).id!
   const created = new Set(
      rows.flatMap((row) => (row.action === 'create' && row.id ? [row.id] : []))
   )
   const selfKeys = deferredSelfRelations(entry, name)
   const main: PromiseLike<unknown>[] = []
   const later: PromiseLike<unknown>[] = []
   for (const row of rows) {
      if (!row.values) continue
      const { values, lists } = splitRelationValues(entry, encodeColumnValues(entry, row.values))
      const deferred: Row = {}
      for (const key of selfKeys) {
         const target = values[key]
         if (typeof target === 'string' && created.has(target)) {
            deferred[key] = target
            values[key] = null
         }
      }
      const id = row.id ?? customId(entry.id)
      if (row.action === 'update') {
         main.push(
            db
               .update(table)
               .set(withUpdatedAt(table, withContentDefaults(entry, values)))
               .where(eq(idCol, id))
         )
      } else {
         if (entry.drafts) values.status ??= 'draft'
         withContentDefaults(entry, values)
         main.push(db.insert(table).values(withTimestamps(table, { ...values, id })))
      }
      if (Object.keys(deferred).length)
         later.push(db.update(table).set(deferred).where(eq(idCol, id)))
      later.push(...manyToManyStatements(db, name, id, lists))
   }
   return [...main, ...later]
}
