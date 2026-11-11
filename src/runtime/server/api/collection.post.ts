import { createError, defineEventHandler, readValidatedBody } from 'h3'
import { runBatch, useDb } from '#cms-db'
import { customId } from '../utils/custom-id'
import { mapConstraintErrors } from '../utils/db-errors'
import { emitEntryChange } from '../utils/hooks'
import {
   buildValidator,
   decodeRows,
   encodeColumnValues,
   getRegistryEntry,
   withContentDefaults,
   withTimestamps,
} from '../utils/registry'
import { entryStatus } from '../../shared/hooks'
import { isCollectionKind } from '../../shared/index'
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
   if (!isCollectionKind(entry)) {
      throw createError({ statusCode: 405, statusMessage: 'Single objects are updated with PUT' })
   }

   const body = (await readValidatedBody(event, buildValidator(entry).parse)) as Record<
      string,
      unknown
   >
   const { values, lists } = splitRelationValues(entry, encodeColumnValues(entry, body))
   await assertRelationTargets(entry, lists)
   if (entry.drafts) values.status ??= 'draft'
   withContentDefaults(entry, values)
   const id = customId(entry.id)
   values.id = id
   const item = await mapConstraintErrors(async () => {
      const [inserted] = await runBatch((db) => [
         db.insert(table).values(withTimestamps(table, values)).returning(),
         ...manyToManyStatements(db, name, id, lists),
      ])
      const [row] = inserted as Record<string, unknown>[]
      const [attached] = await attachManyToMany(useDb(), name, entry, [row!])
      return decodeRows(entry, [attached!])[0]
   })
   emitEntryChange(event, user, {
      entry: name,
      kind: entry.kind,
      action: 'create',
      ids: [id],
      status: entry.drafts ? entryStatus(item?.status) : null,
      item: item ?? null,
   })
   return item
})
