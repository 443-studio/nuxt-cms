import type { SQL } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'

export function singleRowFirst(idColumn: AnySQLiteColumn, id: string): SQL {
   return sql`case when ${idColumn} = ${id} then 0 else 1 end`
}
