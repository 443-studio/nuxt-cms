import { eq } from 'drizzle-orm'
import { createError, defineEventHandler } from 'h3'
import { useDb } from '#cms-db'
import { mapConstraintErrors } from '../utils/db-errors'
import { emitEntryChange } from '../utils/hooks'
import { deleteItemPreviewLinks } from '../utils/preview-links'
import { getRegistryEntry, idColumn, parseId } from '../utils/registry'
import { isCollectionKind } from '../../shared/index'
import { assertCmsPermission, requireCmsAccess } from '../utils/permissions'

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
   const result = await mapConstraintErrors(async () => {
      const [row] = await useDb()
         .delete(table)
         .where(eq(idColumn(table), id))
         .returning()
      if (!row) throw createError({ statusCode: 404, statusMessage: 'Row not found' })
      if (entry.kind === 'content') await deleteItemPreviewLinks(name, id)
      return { deleted: true }
   })
   emitEntryChange(event, user, { entry: name, kind: entry.kind, action: 'delete', ids: [id] })
   return result
})
