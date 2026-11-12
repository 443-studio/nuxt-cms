import { and, eq, ne, sql } from 'drizzle-orm'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { H3Event } from 'h3'
import { createError, readBody } from 'h3'
import { useDb } from '#cms-db'
import type { CmsEntry } from '../../shared/index'
import { pageFields } from '../../shared/index'
import {
   changedImmutableKeys,
   immutableFieldKeys,
   isCaseInsensitiveUnique,
   isUniqueValueField,
   uniqueCompareValue,
   withEntryDefaults,
} from '../../shared/field-options'
import { validationMessages } from '../../shared/validation'
import { buildValidator, getContentI18n, idColumn, tableColumns } from './registry'

export interface CmsFieldIssue {
   path: (string | number)[]
   message: string
}

export function fieldIssuesError(
   statusCode: number,
   statusMessage: string,
   issues: CmsFieldIssue[]
) {
   return createError({
      statusCode,
      statusMessage,
      message: issues
         .map((issue) =>
            issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message
         )
         .join('; '),
      data: { issues },
   })
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
   return !!value && typeof value === 'object' && !Array.isArray(value)
}

export async function readEntryBody(
   event: H3Event,
   entry: CmsEntry,
   options: { path?: string; create?: boolean } = {}
): Promise<Record<string, unknown>> {
   const raw: unknown = await readBody(event)
   const fields = options.path ? pageFields(entry, options.path) : entry.fields
   const input =
      options.create && isPlainObject(raw) ? withEntryDefaults(fields, raw, getContentI18n()) : raw
   const result = buildValidator(entry, options.path).safeParse(input)
   if (result.success) return result.data as Record<string, unknown>
   throw fieldIssuesError(
      400,
      'Validation Error',
      result.error.issues.map((issue) => ({
         path: issue.path.map((part) => (typeof part === 'number' ? part : String(part))),
         message: issue.message,
      }))
   )
}

export function immutableSelection(entry: CmsEntry, table: SQLiteTable) {
   const columns = tableColumns(table)
   return Object.fromEntries(
      immutableFieldKeys(entry.fields)
         .filter((key) => columns[key])
         .map((key) => [key, columns[key]!])
   )
}

export function assertImmutableValues(
   entry: CmsEntry,
   saved: Record<string, unknown> | null | undefined,
   values: Record<string, unknown>
) {
   const keys = changedImmutableKeys(entry.fields, saved, values)
   if (!keys.length) return
   const message = validationMessages().immutable
   throw fieldIssuesError(
      400,
      'A field cannot be changed once saved',
      keys.map((key) => ({ path: [key], message }))
   )
}

export async function assertUniqueValues(
   entry: CmsEntry,
   table: SQLiteTable,
   values: Record<string, unknown>,
   id: string | null
) {
   const columns = tableColumns(table)
   const message = validationMessages().unique
   const issues: CmsFieldIssue[] = []
   for (const [key, field] of Object.entries(entry.fields)) {
      const column = columns[key]
      const value = values[key]
      if (!isUniqueValueField(field) || !column || value === null || value === undefined) continue
      const same = isCaseInsensitiveUnique(field)
         ? sql`lower(${column}) = ${uniqueCompareValue(field, value)}`
         : eq(column, value)
      const [match] = await useDb()
         .select({ id: idColumn(table) })
         .from(table)
         .where(id === null ? same : and(same, ne(idColumn(table), id)))
         .limit(1)
      if (match) issues.push({ path: [key], message })
   }
   if (issues.length) throw fieldIssuesError(409, 'Duplicate value for a unique field', issues)
}
