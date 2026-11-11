import { defineEventHandler, readValidatedBody } from 'h3'
import { z } from 'zod'
import type { MediaUsageReport } from '../../shared/index'
import { can } from '../../shared/roles'
import { objectKeySchema } from '../../shared/validation'
import { useMediaConfig } from '../utils/media'
import { redactMediaUsage } from '../utils/media-references'
import { loadMediaUsage } from '../utils/media-usage'
import { requireCmsPermission } from '../utils/permissions'

const bodySchema = z.object({ keys: z.array(objectKeySchema).min(1).max(1000) })

export default defineEventHandler(async (event): Promise<MediaUsageReport> => {
   const { access } = await requireCmsPermission(event, 'media.read')
   useMediaConfig(event)
   const { keys } = await readValidatedBody(event, bodySchema.parse)
   const usage = await loadMediaUsage([...new Set(keys)])
   return redactMediaUsage(usage, (item) =>
      can(access, item.kind === 'site' ? 'settings.manage' : `${item.collection}.read`)
   )
})
