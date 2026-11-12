import { eq } from 'drizzle-orm'
import { createError, defineEventHandler } from 'h3'
import { runBatch, useDb } from '#cms-db'
import { mapConstraintErrors } from '../utils/db-errors'
import { emitEntryChange } from '../utils/hooks'
import { deleteItemPreviewLinksStatement } from '../utils/preview-links'
import { getRegistryEntry, idColumn, parseId } from '../utils/registry'
import { isCollectionKind } from '../../shared/index'
import { assertCmsPermission, assertDeleteAllowed, requireCmsAccess } from '../utils/permissions'

export default defineEventHandler(async (event) => {
   const { user, access } = await requireCmsAccess(event)
   const { name, entry, table } = getRegistryEntry(event)
   if (!isCollectionKind(entry)) {
      throw createError({
         statusCode: 405,
         statusMessage: 'Only collection entries can be deleted',
      })
   }
   assertCmsPermission(access, `${name}.delete`)

   const id = parseId(event)
   const [existing] = (await useDb()
      .select()
      .from(table)
      .where(eq(idColumn(table), id))
      .limit(1)) as Record<string, unknown>[]
   if (!existing) throw createError({ statusCode: 404, statusMessage: 'Row not found' })
   assertDeleteAllowed(access, name, entry, existing.status)

   const result = await mapConstraintErrors(async () => {
      const [deleted] = await runBatch((db) => [
         db
            .delete(table)
            .where(eq(idColumn(table), id))
            .returning(),
         ...(entry.kind === 'content' ? [deleteItemPreviewLinksStatement(db, name, id)] : []),
      ])
      if (!(deleted as unknown[]).length)
         throw createError({ statusCode: 404, statusMessage: 'Row not found' })
      return { deleted: true }
   })
   emitEntryChange(event, user, { entry: name, kind: entry.kind, action: 'delete', ids: [id] })
   return result
})
