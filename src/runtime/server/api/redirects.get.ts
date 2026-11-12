import { defineEventHandler } from 'h3'
import type { CmsRedirect } from '../../shared/index'
import { listRedirects } from '../utils/redirects'
import { requireCmsPermission } from '../utils/permissions'

export default defineEventHandler(async (event): Promise<CmsRedirect[]> => {
   await requireCmsPermission(event, 'redirects.manage')
   return listRedirects()
})
