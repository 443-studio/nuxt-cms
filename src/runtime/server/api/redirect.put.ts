import { defineEventHandler, getRouterParam, readValidatedBody } from 'h3'
import type { CmsRedirect } from '../../shared/index'
import { redirectInputSchema, requireRedirectsAccess, updateRedirect } from '../utils/redirects'

export default defineEventHandler(async (event): Promise<CmsRedirect> => {
   await requireRedirectsAccess(event)
   const id = getRouterParam(event, 'id') ?? ''
   return updateRedirect(id, await readValidatedBody(event, redirectInputSchema.parse))
})
