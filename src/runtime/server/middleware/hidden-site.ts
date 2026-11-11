import { defineEventHandler, setResponseHeader } from 'h3'
import { HIDDEN_SITE_ROBOTS, hiddenSiteHeaderApplies } from '../../shared/index'
import { readCachedSiteSettings } from '../utils/site'

export default defineEventHandler(async (event) => {
   if (!hiddenSiteHeaderApplies(event.path)) return
   const settings = await readCachedSiteSettings().catch(() => null)
   if (settings?.hidden) setResponseHeader(event, 'x-robots-tag', HIDDEN_SITE_ROBOTS)
})
