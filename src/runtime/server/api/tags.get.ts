import { createError, defineEventHandler, getRouterParam } from 'h3'
import { useDb } from '#cms-db'
import { distinctTags, entryFieldsFor } from '../../shared/index'
import { readPages } from '../utils/page-storage'
import { getRegistryEntry, tableColumns } from '../utils/registry'
import { requireAdmin } from '../utils/require-admin'

export default defineEventHandler(async (event): Promise<string[]> => {
   await requireAdmin(event)
   const { name, entry, table } = getRegistryEntry(event)
   const key = getRouterParam(event, 'field') ?? ''
   const fields = entryFieldsFor(entry)
   const field = Object.hasOwn(fields, key) ? fields[key] : undefined
   if (!field || field.type !== 'tags') {
      throw createError({ statusCode: 404, statusMessage: `Unknown tags field: ${key}` })
   }
   if (field.suggestions === false) return []

   if (entry.kind === 'page') {
      const rows = await readPages(name, entry, table)
      return distinctTags(rows.map((row) => row[key]))
   }

   const columns = tableColumns(table)
   if (!Object.hasOwn(columns, key)) return []
   const column = columns[key]!
   const rows = (await useDb().select({ value: column }).from(table)) as { value: unknown }[]
   return distinctTags(rows.map((row) => row.value))
})
