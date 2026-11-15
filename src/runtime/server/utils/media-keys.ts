import { inArray } from 'drizzle-orm'
import type { AnySQLiteColumn, BaseSQLiteDatabase, SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { FieldConfig } from '../../shared/index'
import { blockReferenceLabel, walkBlocks } from '../../shared/index'

export interface MediaReference {
   field: string
   key: string
}

export type MediaLookup = (keys: string[]) => Promise<Set<string>>

const LOOKUP_CHUNK = 90

export function mediaKeysOf(value: unknown): string[] {
   if (typeof value === 'string') return value ? [value] : []
   if (!value || typeof value !== 'object') return []
   return Object.values(value as Record<string, unknown>).filter(
      (key): key is string => typeof key === 'string' && key !== ''
   )
}

export function mediaReferences(
   fields: Record<string, FieldConfig>,
   values: Record<string, unknown>
): MediaReference[] {
   const references: MediaReference[] = []
   for (const [key, field] of Object.entries(fields)) {
      if (field.type !== 'media') continue
      for (const mediaKey of mediaKeysOf(values[key]))
         references.push({ field: key, key: mediaKey })
   }
   walkBlocks(fields, values, ({ item, block, path }) => {
      for (const [blockFieldKey, blockField] of Object.entries(block.fields)) {
         if (blockField.type !== 'media') continue
         for (const mediaKey of mediaKeysOf(item[blockFieldKey])) {
            references.push({ field: blockReferenceLabel(path, blockFieldKey), key: mediaKey })
         }
      }
   })
   return references
}

export async function mediaKeysInTable(
   db: Pick<BaseSQLiteDatabase<'sync' | 'async', unknown>, 'select'>,
   table: SQLiteTable,
   keys: string[]
): Promise<Set<string>> {
   const column = (table as unknown as Record<string, AnySQLiteColumn>).key!
   const found = new Set<string>()
   for (let index = 0; index < keys.length; index += LOOKUP_CHUNK) {
      const rows = (await db
         .select({ key: column })
         .from(table)
         .where(inArray(column, keys.slice(index, index + LOOKUP_CHUNK)))) as { key: string }[]
      for (const row of rows) found.add(row.key)
   }
   return found
}
