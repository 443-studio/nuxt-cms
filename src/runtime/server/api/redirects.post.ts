import { defineEventHandler, readValidatedBody } from 'h3'
import type { CmsRedirect } from '../../shared/index'
import { createRedirect, redirectInputSchema } from '../utils/redirects'
import { requireCmsPermission } from '../utils/permissions'

export default defineEventHandler(async (event): Promise<CmsRedirect> => {
   await requireCmsPermission(event, 'redirects.manage')
   return createRedirect(await readValidatedBody(event, redirectInputSchema.parse))
})
