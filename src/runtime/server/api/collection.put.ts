import { eq } from 'drizzle-orm'
import { createError, defineEventHandler } from 'h3'
import { runBatch, useDb } from '#cms-db'
import { mapConstraintErrors } from '../utils/db-errors'
import { emitEntryChange } from '../utils/hooks'
import { entryStatus, entryWriteAction } from '../../shared/hooks'
import { assertImmutableValues, immutableSelection, readEntryBody } from '../utils/field-rules'
import {
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
   readBackSaved,
   savedReadBackError,
   manyToManyStatements,
   splitRelationValues,
} from '../utils/relations'
import { assertCmsPermission, requireCmsAccess } from '../utils/permissions'

export default defineEventHandler(async (event) => {
   const { user, access } = await requireCmsAccess(event)
   const { name, entry, table } = getRegistryEntry(event)
   if (entry.kind !== 'single') {
      throw createError({ statusCode: 405, statusMessage: 'Collections are updated with PUT /:id' })
   }
   assertCmsPermission(access, `${name}.update`)

   const statusColumn = entry.drafts ? tableColumns(table).status : undefined
   const [previous] = await useDb()
      .select({
         ...immutableSelection(entry, table),
         id: idColumn(table),
         ...(statusColumn ? { status: statusColumn } : {}),
      })
      .from(table)
      .where(eq(idColumn(table), entry.id))
      .limit(1)
   const body = await readEntryBody(event, entry, { create: !previous })
   assertImmutableValues(entry, previous, body)
   const { values, lists } = splitRelationValues(entry, encodeColumnValues(entry, body))
   await assertRelationTargets(entry, lists)
   const set = withUpdatedAt(table, values)

   const saved = await mapConstraintErrors(async () => {
      const [upserted] = await runBatch((db) => [
         db
            .insert(table)
            .values(withTimestamps(table, { id: entry.id, ...set }))
            .onConflictDoUpdate({ target: idColumn(table), set })
            .returning(),
         ...manyToManyStatements(db, name, entry.id, lists),
      ])
      const [row] = upserted as Record<string, unknown>[]
      return row!
   })
   const readBack = await readBackSaved(name, entry, saved)
   const item = decodeRows(entry, [readBack.row])[0]
   const status = entry.drafts ? entryStatus(item?.status) : null
   emitEntryChange(event, user, {
      entry: name,
      kind: entry.kind,
      action: entryWriteAction(!previous, entryStatus(previous?.status), status),
      ids: [entry.id],
      status,
      item: item ?? null,
   })
   if (readBack.error) throw savedReadBackError(readBack.error)
   return item
})
