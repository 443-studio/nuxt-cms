import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, readValidatedBody } from 'h3'
import { runBatch, useDb } from '#cms-db'
import {
   buildValidator,
   decodeRows,
   encodeColumnValues,
   getRegistryEntry,
   idColumn,
   parseId,
   requirePageRoute,
   tableColumns,
   withContentDefaults,
   withUpdatedAt,
} from '../utils/registry'
import { pageFields } from '../../shared/index'
import { assertMediaExists } from '../utils/media-check'
import { writePage } from '../utils/page-storage'
import {
   assertRelationTargets,
   attachManyToMany,
   manyToManyStatements,
   splitRelationValues,
} from '../utils/relations'
import { assertCmsPermission, assertPublishAllowed, requireCmsAccess } from '../utils/permissions'
import { mapConstraintErrors } from '../utils/db-errors'
import { emitEntryChange } from '../utils/hooks'
import { entryStatus, entryWriteAction } from '../../shared/hooks'

export default defineEventHandler(async (event) => {
   const { user, access } = await requireCmsAccess(event)
   const { name, entry, table } = getRegistryEntry(event)
   if (entry.kind === 'single') {
      throw createError({
         statusCode: 405,
         statusMessage: 'Single objects are updated with PUT without id',
      })
   }
   assertCmsPermission(access, `${name}.update`)

   const id = parseId(event)

   if (entry.kind === 'page') {
      const route = requirePageRoute(entry, id)
      const body = await readValidatedBody(event, buildValidator(entry, route.path).parse)
      await assertMediaExists(pageFields(entry, route.path), body as Record<string, unknown>)
      const values = encodeColumnValues(entry, body as Record<string, unknown>)
      const set = withUpdatedAt(table, values)
      const page = await mapConstraintErrors(
         async () => decodeRows(entry, [await writePage(name, entry, table, route, set)])[0]
      )
      emitEntryChange(event, user, {
         entry: name,
         kind: entry.kind,
         action: 'update',
         ids: [id],
         path: route.path,
         item: page ?? null,
      })
      return page
   }

   const body = await readValidatedBody(event, buildValidator(entry).parse)
   const { values, lists } = splitRelationValues(
      entry,
      encodeColumnValues(entry, body as Record<string, unknown>)
   )
   await assertRelationTargets(entry, lists)
   const set = withUpdatedAt(table, withContentDefaults(entry, values))

   const statusColumn = entry.drafts ? tableColumns(table).status : undefined
   const [existing] = await useDb()
      .select({ id: idColumn(table), ...(statusColumn ? { status: statusColumn } : {}) })
      .from(table)
      .where(eq(idColumn(table), id))
      .limit(1)
   if (!existing) throw createError({ statusCode: 404, statusMessage: 'Row not found' })
   assertPublishAllowed(access, name, entry, existing.status, values.status ?? existing.status)

   const item = await mapConstraintErrors(async () => {
      const [updated] = await runBatch((db) => [
         db
            .update(table)
            .set(set)
            .where(eq(idColumn(table), id))
            .returning(),
         ...manyToManyStatements(db, name, id, lists),
      ])
      const [row] = updated as Record<string, unknown>[]
      if (!row) throw createError({ statusCode: 404, statusMessage: 'Row not found' })
      const [attached] = await attachManyToMany(useDb(), name, entry, [row])
      return decodeRows(entry, [attached!])[0]
   })
   const status = entry.drafts ? entryStatus(item?.status) : null
   emitEntryChange(event, user, {
      entry: name,
      kind: entry.kind,
      action: entryWriteAction(false, entryStatus(existing.status), status),
      ids: [id],
      status,
      item: item ?? null,
   })
   return item
})
