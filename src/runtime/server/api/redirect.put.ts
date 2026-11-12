import { defineEventHandler, getRouterParam, readValidatedBody } from 'h3'
import type { CmsRedirect } from '../../shared/index'
import { redirectInputSchema, updateRedirect } from '../utils/redirects'
import { requireCmsPermission } from '../utils/permissions'

export default defineEventHandler(async (event): Promise<CmsRedirect> => {
   await requireCmsPermission(event, 'redirects.manage')
   const id = getRouterParam(event, 'id') ?? ''
   return updateRedirect(id, await readValidatedBody(event, redirectInputSchema.parse))
})
