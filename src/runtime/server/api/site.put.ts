import { defineEventHandler, readValidatedBody } from 'h3'
import type { CmsSiteSettings } from '../../shared/index'
import { assertKnownMedia } from '../utils/media-references'
import { mediaLookup } from '../utils/media-check'
import { getContentI18n } from '../utils/registry'
import { requireAdmin } from '../utils/require-admin'
import { siteSettingsSchema, writeSiteSettings } from '../utils/site'

export default defineEventHandler(async (event): Promise<CmsSiteSettings> => {
   await requireAdmin(event)
   const settings = await readValidatedBody(event, siteSettingsSchema(getContentI18n()).parse)
   if (settings.image) {
      const lookup = await mediaLookup()
      if (lookup) await assertKnownMedia([{ field: 'image', key: settings.image }], lookup)
   }
   await writeSiteSettings(settings)
   return settings
})
