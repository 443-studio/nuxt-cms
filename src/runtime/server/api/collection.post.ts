import { createError, defineEventHandler } from 'h3'
import { runBatch } from '#cms-db'
import { customId } from '../utils/custom-id'
import { mapConstraintErrors } from '../utils/db-errors'
import { emitEntryChange } from '../utils/hooks'
import { assertUniqueValues, readEntryBody } from '../utils/field-rules'
import {
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
   readBackSaved,
   savedReadBackError,
   manyToManyStatements,
   splitRelationValues,
} from '../utils/relations'
import { assertCmsPermission, assertPublishAllowed, requireCmsAccess } from '../utils/permissions'

export default defineEventHandler(async (event) => {
   const { user, access } = await requireCmsAccess(event)
   const { name, entry, table } = getRegistryEntry(event)
   if (!isCollectionKind(entry)) {
      throw createError({ statusCode: 405, statusMessage: 'Single objects are updated with PUT' })
   }
   assertCmsPermission(access, `${name}.create`)

   const body = await readEntryBody(event, entry, { create: true })
   const { values, lists } = splitRelationValues(entry, encodeColumnValues(entry, body))
   if (entry.drafts) values.status ??= 'draft'
   assertPublishAllowed(access, name, entry, null, values.status)
   await assertRelationTargets(entry, lists)
   await assertUniqueValues(entry, table, body, null)
   withContentDefaults(entry, values)
   const id = customId(entry.id)
   values.id = id
   const saved = await mapConstraintErrors(async () => {
      const [inserted] = await runBatch((db) => [
         db.insert(table).values(withTimestamps(table, values)).returning(),
         ...manyToManyStatements(db, name, id, lists),
      ])
      const [row] = inserted as Record<string, unknown>[]
      return row!
   })
   const readBack = await readBackSaved(name, entry, saved)
   const item = decodeRows(entry, [readBack.row])[0]
   emitEntryChange(event, user, {
      entry: name,
      kind: entry.kind,
      action: 'create',
      ids: [id],
      status: entry.drafts ? entryStatus(item?.status) : null,
      item: item ?? null,
   })
   if (readBack.error) throw savedReadBackError(readBack.error)
   return item
})
