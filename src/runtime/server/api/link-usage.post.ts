import { defineEventHandler, readValidatedBody } from 'h3'
import { z } from 'zod'
import type { MediaUsage } from '../../shared/index'
import { linkTargetKey } from '../../shared/index'
import { loadLinkUsage } from '../utils/link-usage'
import { assertCmsPermission, requireCmsAccess } from '../utils/permissions'
import { can } from '../../shared/roles'

const targetSchema = z.object({
   entry: z.string().min(1).max(128),
   id: z.string().min(1).max(256),
})

const bodySchema = z.object({ targets: z.array(targetSchema).min(1).max(1000) })

export default defineEventHandler(
   async (event): Promise<{ usage: Record<string, MediaUsage[]> }> => {
      const { access } = await requireCmsAccess(event)
      const { targets } = await readValidatedBody(event, bodySchema.parse)
      for (const entry of new Set(targets.map((target) => target.entry)))
         assertCmsPermission(access, `${entry}.read`)
      const keys = [...new Set(targets.map((target) => linkTargetKey(target.entry, target.id)))]
      return { usage: await loadLinkUsage(keys, (name) => can(access, `${name}.read`)) }
   }
)
