import { defineEventHandler } from 'h3'
import type { CmsSiteSettings } from '../../shared/index'
import { requireCmsPermission } from '../utils/permissions'
import { readSiteSettings } from '../utils/site'

export default defineEventHandler(async (event): Promise<CmsSiteSettings> => {
   await requireCmsPermission(event, 'settings.manage')
   return readSiteSettings()
})
