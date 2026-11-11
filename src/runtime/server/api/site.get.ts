import { defineEventHandler } from 'h3'
import type { CmsSiteSettings } from '../../shared/index'
import { requireAdmin } from '../utils/require-admin'
import { readSiteSettings } from '../utils/site'

export default defineEventHandler(async (event): Promise<CmsSiteSettings> => {
   await requireAdmin(event)
   return readSiteSettings()
})
