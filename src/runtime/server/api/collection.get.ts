import { count } from 'drizzle-orm'
import { defineEventHandler, getValidatedQuery } from 'h3'
import { z } from 'zod'
import { cmsDialect, useDb } from '#cms-db'
import { CONTENT_PUBLISHED_AT_FIELD, CONTENT_SLUG_FIELD, pageRoutes } from '../../shared/index'
import { LIST_IDS_MAX } from '../../shared/list-filters'
import { decodeRows, getRegistryEntry, idColumn, tableColumns } from '../utils/registry'
import { listOrderBy, listWhere, readListFilters } from '../utils/list-query'
import { readPages } from '../utils/page-storage'
import { attachManyToMany, relationTitles } from '../utils/relations'
import { assertCmsPermission, requireCmsAccess } from '../utils/permissions'

const querySchema = z.object({
   limit: z.coerce.number().int().min(1).max(100).default(50),
   offset: z.coerce.number().int().min(0).default(0),
   search: z.string().trim().max(200).optional(),
   sort: z.string().trim().max(64).optional(),
   order: z.enum(['asc', 'desc']).default('desc'),
   light: z.stringbool().default(false),
   ids: z.stringbool().default(false),
})

export default defineEventHandler(async (event) => {
   const { access } = await requireCmsAccess(event)
   const { name, entry, table } = getRegistryEntry(event)
   assertCmsPermission(access, `${name}.read`)
   const db = useDb()

   if (entry.kind === 'single') {
      const rows = (await db.select().from(table).limit(1)) as Record<string, unknown>[]
      await attachManyToMany(db, name, entry, rows)
      return decodeRows(entry, rows)[0] ?? null
   }

   const { limit, offset, search, sort, order, light, ids } = await getValidatedQuery(
      event,
      querySchema.parse
   )

   if (entry.kind === 'page') {
      const rows = await readPages(name, entry, table)
      decodeRows(entry, rows)
      const saved = new Map(rows.map((row) => [row.id as string, row]))
      const items = pageRoutes(entry).map((route) => {
         const row = saved.get(route.key) ?? {}
         return { ...row, id: route.key, path: route.path, label: route.label }
      })
      const term = search?.toLowerCase()
      const matching = term
         ? items.filter(
              (item) =>
                 item.path.toLowerCase().includes(term) || item.label.toLowerCase().includes(term)
           )
         : items
      if (ids)
         return {
            ids: matching.slice(0, LIST_IDS_MAX).map((item) => item.id),
            total: matching.length,
         }
      return {
         items: matching.slice(offset, offset + limit),
         total: matching.length,
         relations: {},
      }
   }

   const columns = tableColumns(table)
   const titleColumn =
      entry.titleField && Object.hasOwn(columns, entry.titleField)
         ? columns[entry.titleField]
         : undefined
   const where = listWhere(cmsDialect, entry, table, {
      search,
      filters: readListFilters(event, entry),
   })

   const countRows = async () => {
      const [counted] = await (where
         ? db.select({ total: count() }).from(table).where(where)
         : db.select({ total: count() }).from(table))
      return counted?.total ?? 0
   }

   if (ids) {
      const base = db.select({ id: idColumn(table) }).from(table)
      const found = (await (where ? base.where(where) : base)
         .orderBy(...listOrderBy(table, sort, order))
         .limit(LIST_IDS_MAX)) as { id: unknown }[]
      return { ids: found.map((row) => String(row.id)), total: await countRows() }
   }

   const selection = light
      ? Object.fromEntries([
           ['id', idColumn(table)],
           ...(entry.titleField && titleColumn ? [[entry.titleField, titleColumn]] : []),
           ...(entry.drafts && Object.hasOwn(columns, 'status')
              ? [['status', columns.status]]
              : []),
           ...(entry.kind === 'content'
              ? [CONTENT_SLUG_FIELD, CONTENT_PUBLISHED_AT_FIELD]
                   .filter((key) => Object.hasOwn(columns, key))
                   .map((key) => [key, columns[key]])
              : []),
        ])
      : undefined

   const base = selection ? db.select(selection).from(table) : db.select().from(table)
   const items = (await (where ? base.where(where) : base)
      .orderBy(...listOrderBy(table, sort, order))
      .limit(limit)
      .offset(offset)) as Record<string, unknown>[]

   const counted = await countRows()

   if (light) return { items, total: counted, relations: {} }

   await attachManyToMany(db, name, entry, items)
   decodeRows(entry, items)
   return {
      items,
      total: counted,
      relations: await relationTitles(db, entry, items),
   }
})
