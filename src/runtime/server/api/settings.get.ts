import { defineEventHandler } from 'h3'
import { useDb } from '#cms-db'
import { cms_settings } from '#cms-tables'
import type { CmsSettingsMap } from '../../shared/index'
import { requireCmsAccess } from '../utils/permissions'
import { parseSettingsValue } from '../utils/settings'

export default defineEventHandler(async (event): Promise<CmsSettingsMap> => {
   await requireCmsAccess(event)
   const rows = await useDb().select().from(cms_settings)
   return Object.fromEntries(
      rows.flatMap((row) => {
         const value = parseSettingsValue(row.value)
         return value ? [[row.key, value]] : []
      })
   )
})
