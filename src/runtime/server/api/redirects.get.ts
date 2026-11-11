import { defineEventHandler } from 'h3'
import type { CmsRedirect } from '../../shared/index'
import { listRedirects, requireRedirectsAccess } from '../utils/redirects'

export default defineEventHandler(async (event): Promise<CmsRedirect[]> => {
   await requireRedirectsAccess(event)
   return listRedirects()
})
