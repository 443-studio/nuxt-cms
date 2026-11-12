import { eq } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { useDb } from '#cms-db'
import { cms_settings } from '#cms-tables'
import { requireCmsPermission } from '../utils/permissions'
import { requireSettingsKey } from '../utils/settings'

export default defineEventHandler(async (event) => {
   await requireCmsPermission(event, 'settings.manage')
   const key = requireSettingsKey(event)
   await useDb().delete(cms_settings).where(eq(cms_settings.key, key))
   return { ok: true }
})
