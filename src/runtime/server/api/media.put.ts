import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, readValidatedBody } from 'h3'
import { useDb } from '#cms-db'
import { cms_media } from '#cms-tables'
import type { MediaItem } from '../../shared/index'
import { normalizeMediaFolder, roundFocalCoordinate } from '../../shared/index'
import { nowTimestamp } from '../../shared/timestamps'
import { mediaUpdateSchema } from '../../shared/validation'
import { useMediaIndex } from '../utils/media-index'
import { assertMediaWritable, toMediaItem, useMediaConfig } from '../utils/media'
import { emitMediaChange } from '../utils/hooks'
import { requireCmsPermission } from '../utils/permissions'

interface MediaMetaUpdate {
   alt?: string | null
   focalX?: number | null
   focalY?: number | null
}

function metaUpdates(body: {
   alt?: string | null
   focalX?: number | null
   focalY?: number | null
}): MediaMetaUpdate {
   const updates: MediaMetaUpdate = {}
   if (body.alt !== undefined) updates.alt = body.alt
   if (body.focalX !== undefined && body.focalY !== undefined) {
      updates.focalX = body.focalX === null ? null : roundFocalCoordinate(body.focalX)
      updates.focalY = body.focalY === null ? null : roundFocalCoordinate(body.focalY)
   }
   return updates
}

export default defineEventHandler(async (event): Promise<MediaItem> => {
   const { user } = await requireCmsPermission(event, 'media.write')
   const { media, publicUrl } = useMediaConfig(event)
   const body = await readValidatedBody(event, mediaUpdateSchema.parse)
   const meta = metaUpdates(body)

   if (media.storage === 'local') {
      if (body.folder !== undefined) {
         throw createError({
            statusCode: 501,
            statusMessage: 'Media storage is local; the folder follows the file on disk',
         })
      }

      const file = (await useMediaIndex()).get(body.key)
      if (!file) {
         throw createError({ statusCode: 404, statusMessage: 'Media not found' })
      }
      if (Object.keys(meta).length === 0) {
         throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
      }

      const [row] = await useDb()
         .insert(cms_media)
         .values({ key: body.key, ...meta, createdAt: nowTimestamp() })
         .onConflictDoUpdate({ target: cms_media.key, set: meta })
         .returning()

      emitMediaChange(event, user, { action: 'update', keys: [body.key], folder: file.folder })
      return toMediaItem(
         {
            ...file,
            alt: row?.alt ?? null,
            focalX: row?.focalX ?? null,
            focalY: row?.focalY ?? null,
            createdAt: null,
         },
         publicUrl
      )
   }

   assertMediaWritable(media)

   const updates: MediaMetaUpdate & { folder?: string | null } = { ...meta }
   if (body.folder !== undefined) updates.folder = normalizeMediaFolder(body.folder)
   if (Object.keys(updates).length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
   }

   const [row] = await useDb()
      .update(cms_media)
      .set(updates)
      .where(eq(cms_media.key, body.key))
      .returning()

   if (!row) {
      throw createError({ statusCode: 404, statusMessage: 'Media not found' })
   }

   emitMediaChange(event, user, { action: 'update', keys: [body.key], folder: row.folder })
   return toMediaItem(row, publicUrl)
})
