import { defineEventHandler, readValidatedBody } from 'h3'
import { z } from 'zod'
import type { MediaUsage } from '../../shared/index'
import { objectKeySchema } from '../../shared/validation'
import { useMediaConfig } from '../utils/media'
import { loadMediaUsage } from '../utils/media-usage'
import { requireCmsPermission } from '../utils/permissions'

const bodySchema = z.object({ keys: z.array(objectKeySchema).min(1).max(1000) })

export default defineEventHandler(
   async (event): Promise<{ usage: Record<string, MediaUsage[]> }> => {
      await requireCmsPermission(event, 'media.read')
      useMediaConfig(event)
      const { keys } = await readValidatedBody(event, bodySchema.parse)
      return { usage: await loadMediaUsage([...new Set(keys)]) }
   }
)
