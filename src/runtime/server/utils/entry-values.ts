import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { CmsEntry } from '../../shared/index'
import { CONTENT_PUBLISHED_AT_FIELD, entryFieldsFor } from '../../shared/index'
import { nowTimestamp } from '../../shared/timestamps'

type Row = Record<string, unknown>

export function withUpdatedAt(table: SQLiteTable, values: Row) {
   const set = { ...values }
   if ('updatedAt' in table) set.updatedAt = nowTimestamp()
   return set
}

export function withTimestamps(table: SQLiteTable, values: Row) {
   const now = nowTimestamp()
   const stamped = { ...values }
   if ('createdAt' in table) stamped.createdAt ??= now
   if ('updatedAt' in table) stamped.updatedAt ??= now
   return stamped
}

export function withContentDefaults(entry: CmsEntry, values: Row) {
   if (entry.kind !== 'content' || values.status !== 'published') return values
   if (!values[CONTENT_PUBLISHED_AT_FIELD]) values[CONTENT_PUBLISHED_AT_FIELD] = nowTimestamp()
   return values
}

export function manyToManyKeys(entry: CmsEntry): string[] {
   return Object.entries(entryFieldsFor(entry))
      .filter(([, field]) => field.type === 'relation' && field.cardinality === 'many-to-many')
      .map(([key]) => key)
}

export function splitRelationValues(entry: CmsEntry, body: Row) {
   const keys = manyToManyKeys(entry)
   const values = Object.fromEntries(Object.entries(body).filter(([key]) => !keys.includes(key)))
   const lists: Record<string, string[]> = {}
   for (const key of keys) {
      const ids = (body[key] as string[] | null | undefined) ?? []
      lists[key] = [...new Set(ids)]
   }
   return { values, lists }
}
