import { createError, defineEventHandler, getValidatedQuery, setResponseHeader } from 'h3'
import { z } from 'zod'
import { cmsDialect, useDb } from '#cms-db'
import { isCollectionKind } from '../../shared/index'
import type { CmsExportFile } from '../../shared/transfer'
import {
   canTransferCsv,
   entryRowsToCsv,
   exportFileName,
   exportRow,
   TRANSFER_FORMATS,
} from '../../shared/transfer'
import { listOrderBy, listWhere, readListFilters } from '../utils/list-query'
import { decodeRows, getContentI18n, getRegistryEntry } from '../utils/registry'
import { attachManyToMany } from '../utils/relations'
import { requireAdmin } from '../utils/require-admin'
import { chunks, KEY_CHUNK } from '../utils/write-statements'

const querySchema = z.object({
   format: z.enum(TRANSFER_FORMATS).default('json'),
   search: z.string().trim().max(200).optional(),
   sort: z.string().trim().max(64).optional(),
   order: z.enum(['asc', 'desc']).default('desc'),
})

export default defineEventHandler(async (event) => {
   await requireAdmin(event)
   const { name, entry, table } = getRegistryEntry(event)
   if (!isCollectionKind(entry)) {
      throw createError({ statusCode: 405, statusMessage: 'Only collections can be exported' })
   }
   const { format, search, sort, order } = await getValidatedQuery(event, querySchema.parse)
   if (format === 'csv' && !canTransferCsv(entry)) {
      throw createError({
         statusCode: 400,
         statusMessage: 'CSV needs an entry without blocks and many-to-many fields',
      })
   }

   const db = useDb()
   const where = listWhere(cmsDialect, entry, table, {
      search,
      filters: readListFilters(event, entry),
   })
   const base = db.select().from(table)
   const rows = (await (where ? base.where(where) : base).orderBy(
      ...listOrderBy(table, sort, order)
   )) as Record<string, unknown>[]
   for (const chunk of chunks(rows, KEY_CHUNK)) await attachManyToMany(db, name, entry, chunk)
   decodeRows(entry, rows)
   const items = rows.map((row) => exportRow(entry, row))

   const now = new Date()
   setResponseHeader(event, 'cache-control', 'no-store')
   setResponseHeader(
      event,
      'content-disposition',
      `attachment; filename="${exportFileName(name, format, now)}"`
   )
   if (format === 'csv') {
      setResponseHeader(event, 'content-type', 'text/csv; charset=utf-8')
      return entryRowsToCsv(entry, items, getContentI18n())
   }
   setResponseHeader(event, 'content-type', 'application/json; charset=utf-8')
   const file: CmsExportFile = {
      collection: name,
      exportedAt: now.toISOString(),
      total: items.length,
      items,
   }
   return JSON.stringify(file, null, 2)
})
