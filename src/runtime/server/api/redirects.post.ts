import { defineEventHandler, readValidatedBody } from 'h3'
import type { CmsRedirect } from '../../shared/index'
import { createRedirect, redirectInputSchema, requireRedirectsAccess } from '../utils/redirects'

export default defineEventHandler(async (event): Promise<CmsRedirect> => {
   await requireRedirectsAccess(event)
   return createRedirect(await readValidatedBody(event, redirectInputSchema.parse))
})
