import type { SQL } from 'drizzle-orm'
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import type { AnySQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { H3Event } from 'h3'
import { createError, getQuery } from 'h3'
import type { CmsEntry } from '../../shared/index'
import { selectValuesMatching } from '../../shared/index'
import type { CmsListFilters } from '../../shared/list-filters'
import { parseListFilters } from '../../shared/list-filters'
import { searchLikePattern } from '../../shared/search'

export type ListDialect = 'sqlite' | 'postgres'

type Columns = Record<string, AnySQLiteColumn>

export interface ListQueryInput {
   search?: string
   filters?: CmsListFilters
}

export function readListFilters(event: H3Event, entry: CmsEntry): CmsListFilters {
   const { filters, errors } = parseListFilters(entry, getQuery(event))
   if (errors.length) throw createError({ statusCode: 400, statusMessage: errors.join('; ') })
   return filters
}

export function listSearchCondition(
   dialect: ListDialect,
   entry: CmsEntry,
   table: SQLiteTable,
   search: string
): SQL {
   const columns = table as unknown as Columns
   const titleColumn =
      entry.titleField && Object.hasOwn(columns, entry.titleField)
         ? columns[entry.titleField]
         : undefined
   const column = titleColumn ?? columns.id!
   const text = dialect === 'postgres' ? sql`cast(${column} as text)` : sql`${column}`
   const like = sql`lower(${text}) like ${searchLikePattern(search.toLowerCase())} escape '\\'`
   const titleField = entry.titleField ? entry.fields[entry.titleField] : undefined
   const labelled =
      titleColumn && titleField?.type === 'select' ? selectValuesMatching(titleField, search) : []
   return labelled.length ? or(like, inArray(column, labelled))! : like
}

export function listFilterConditions(
   entry: CmsEntry,
   table: SQLiteTable,
   filters: CmsListFilters
): SQL[] {
   const columns = table as unknown as Columns
   const conditions: SQL[] = []
   for (const [key, value] of Object.entries(filters)) {
      if (!Object.hasOwn(columns, key)) {
         throw createError({ statusCode: 400, statusMessage: `Unknown filter '${key}'` })
      }
      const column = columns[key]!
      if (entry.fields[key]?.type === 'boolean') {
         conditions.push(
            value === 'true' ? eq(column, true) : or(eq(column, false), isNull(column))!
         )
         continue
      }
      conditions.push(eq(column, value))
   }
   return conditions
}

export function listWhere(
   dialect: ListDialect,
   entry: CmsEntry,
   table: SQLiteTable,
   { search, filters = {} }: ListQueryInput
): SQL | undefined {
   const conditions = [
      ...(search ? [listSearchCondition(dialect, entry, table, search)] : []),
      ...listFilterConditions(entry, table, filters),
   ]
   if (!conditions.length) return undefined
   return conditions.length === 1 ? conditions[0] : and(...conditions)
}

export function listOrderBy(table: SQLiteTable, sort?: string, order: 'asc' | 'desc' = 'desc') {
   const columns = table as unknown as Columns
   const tiebreaker = columns.id!
   const sortColumn = sort && Object.hasOwn(columns, sort) ? columns[sort] : undefined
   const orderBy = sortColumn ?? columns.createdAt ?? tiebreaker
   const direction = sortColumn && order === 'asc' ? asc : desc
   return orderBy === tiebreaker ? [direction(orderBy)] : [direction(orderBy), desc(tiebreaker)]
}
