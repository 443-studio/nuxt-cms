import type { SQL } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import type { AnySQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core'

export type ListFilterDialect = 'sqlite' | 'postgres'

export const LIST_FILTER_OPERATORS = ['hasAny', 'hasAll', 'isEmpty'] as const

export type ListFilterOperator = (typeof LIST_FILTER_OPERATORS)[number]

export interface JoinTable {
   table: SQLiteTable
   sourceId: AnySQLiteColumn
   targetId: AnySQLiteColumn
}

export function isListFilterOperator(op: string): op is ListFilterOperator {
   return (LIST_FILTER_OPERATORS as readonly string[]).includes(op)
}

export function listFilterValues(value: unknown): string[] {
   if (!Array.isArray(value)) return []
   return [...new Set(value.map((item) => String(item)))]
}

function valueList(values: string[]): SQL {
   return sql`(${sql.join(
      values.map((value) => sql`${value}`),
      sql`, `
   )})`
}

export function jsonListCondition(
   dialect: ListFilterDialect,
   column: AnySQLiteColumn,
   op: ListFilterOperator,
   value: unknown
): SQL {
   if (op === 'isEmpty') {
      const length =
         dialect === 'postgres'
            ? sql`coalesce(jsonb_array_length(${column}), 0)`
            : sql`coalesce(json_array_length(${column}), 0)`
      return value ? sql`${length} = 0` : sql`${length} > 0`
   }
   const values = listFilterValues(value)
   const list = valueList(values)
   if (dialect === 'postgres') {
      if (op === 'hasAll') return sql`${column} @> ${JSON.stringify(values)}::jsonb`
      const items = sql`jsonb_array_elements_text(${column}) as cms_item(value)`
      return sql`exists (select 1 from ${items} where cms_item.value in ${list})`
   }
   const items = sql`json_each(${column})`
   if (op === 'hasAll') {
      const count = sql`select count(distinct json_each.value) from ${items}`
      return sql`(${count} where json_each.value in ${list}) = ${sql.raw(String(values.length))}`
   }
   return sql`exists (select 1 from ${items} where json_each.value in ${list})`
}

export function joinListCondition(
   join: JoinTable,
   id: AnySQLiteColumn,
   op: ListFilterOperator,
   value: unknown
): SQL {
   if (op === 'isEmpty') {
      const linked = sql`exists (select 1 from ${join.table} where ${join.sourceId} = ${id})`
      return value ? sql`not ${linked}` : linked
   }
   const values = listFilterValues(value)
   const matching = sql`${join.sourceId} = ${id} and ${join.targetId} in ${valueList(values)}`
   if (op === 'hasAll') {
      const count = sql`select count(distinct ${join.targetId}) from ${join.table}`
      return sql`(${count} where ${matching}) = ${sql.raw(String(values.length))}`
   }
   return sql`exists (select 1 from ${join.table} where ${matching})`
}
