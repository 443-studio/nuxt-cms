import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, readValidatedBody } from 'h3'
import { runBatch, useDb } from '#cms-db'
import { mapConstraintErrors } from '../utils/db-errors'
import { emitEntryChange } from '../utils/hooks'
import { entryStatus, entryWriteAction } from '../../shared/hooks'
import {
   buildValidator,
   decodeRows,
   encodeColumnValues,
   getRegistryEntry,
   idColumn,
   tableColumns,
   withTimestamps,
   withUpdatedAt,
} from '../utils/registry'
import {
   assertRelationTargets,
   attachManyToMany,
   manyToManyStatements,
   splitRelationValues,
} from '../utils/relations'
import { requireAdmin } from '../utils/require-admin'

export default defineEventHandler(async (event) => {
   const user = await requireAdmin(event)
   const { name, entry, table } = getRegistryEntry(event)
   if (entry.kind !== 'single') {
      throw createError({ statusCode: 405, statusMessage: 'Collections are updated with PUT /:id' })
   }

   const body = await readValidatedBody(event, buildValidator(entry).parse)
   const { values, lists } = splitRelationValues(
      entry,
      encodeColumnValues(entry, body as Record<string, unknown>)
   )
   await assertRelationTargets(entry, lists)
   const set = withUpdatedAt(table, values)
   const statusColumn = entry.drafts ? tableColumns(table).status : undefined
   const [previous] = await useDb()
      .select({ id: idColumn(table), ...(statusColumn ? { status: statusColumn } : {}) })
      .from(table)
      .where(eq(idColumn(table), entry.id))
      .limit(1)

   const item = await mapConstraintErrors(async () => {
      const [upserted] = await runBatch((db) => [
         db
            .insert(table)
            .values(withTimestamps(table, { id: entry.id, ...set }))
            .onConflictDoUpdate({ target: idColumn(table), set })
            .returning(),
         ...manyToManyStatements(db, name, entry.id, lists),
      ])
      const [row] = upserted as Record<string, unknown>[]
      const [attached] = await attachManyToMany(useDb(), name, entry, [row!])
      return decodeRows(entry, [attached!])[0]
   })
   const status = entry.drafts ? entryStatus(item?.status) : null
   emitEntryChange(event, user, {
      entry: name,
      kind: entry.kind,
      action: entryWriteAction(!previous, entryStatus(previous?.status), status),
      ids: [entry.id],
      status,
      item: item ?? null,
   })
   return item
})
