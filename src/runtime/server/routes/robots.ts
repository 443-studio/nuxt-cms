import { defineEventHandler, setResponseHeaders } from 'h3'
import { useRuntimeConfig } from '#imports'
import { SITEMAP_PATH, absoluteUrl, renderRobotsTxt } from '../../shared/index'
import { readSiteSettings, resolveSiteUrl, seoRouteCacheHeader } from '../utils/site'

export default defineEventHandler(async (event) => {
   const { seo } = useRuntimeConfig(event).cms as { seo?: { robotsSitemap?: boolean } }
   const settings = await readSiteSettings()
   setResponseHeaders(event, {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': seoRouteCacheHeader(event),
   })
   return renderRobotsTxt({
      hidden: settings.hidden,
      sitemapUrl: seo?.robotsSitemap ? absoluteUrl(resolveSiteUrl(event), SITEMAP_PATH) : null,
   })
})
