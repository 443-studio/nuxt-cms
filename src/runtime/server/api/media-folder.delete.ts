import { createError, defineEventHandler, getValidatedQuery } from 'h3'
import { z } from 'zod'
import { isMediaFolderMarker, normalizeMediaFolder } from '../../shared/index'
import { useMediaStorage } from '../utils/media'
import { deleteMediaRows, mediaRowsInFolder } from '../utils/media-folders'
import { emitMediaChange } from '../utils/hooks'
import { requireCmsPermission } from '../utils/permissions'

const querySchema = z.object({
   name: z.string().min(1).max(255),
   recursive: z.stringbool().default(false),
})

export default defineEventHandler(async (event) => {
   const { user } = await requireCmsPermission(event, 'media.delete')
   const { store } = useMediaStorage(event)
   const { name, recursive } = await getValidatedQuery(event, querySchema.parse)

   const folder = normalizeMediaFolder(name)
   if (!folder) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid folder name' })
   }

   const rows = await mediaRowsInFolder(folder)

   const files = rows.filter((row) => !isMediaFolderMarker(row.key))
   if (files.length && !recursive) {
      throw createError({
         statusCode: 409,
         statusMessage: `The folder holds ${files.length} file${files.length > 1 ? 's' : ''}`,
      })
   }

   await deleteMediaRows(
      store,
      rows.map((row) => row.key)
   )

   emitMediaChange(event, user, {
      action: 'folder-delete',
      keys: files.map((row) => row.key),
      folder,
   })
   return { deleted: rows.length }
})
