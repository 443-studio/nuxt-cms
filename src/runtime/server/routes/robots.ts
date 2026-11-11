import { defineEventHandler, setResponseHeaders } from 'h3'
import { useRuntimeConfig } from '#imports'
import { SITEMAP_PATH, absoluteUrl, renderRobotsTxt } from '../../shared/index'
import { readSiteSettings, resolveSiteUrl } from '../utils/site'

export default defineEventHandler(async (event) => {
   const { seo } = useRuntimeConfig(event).cms as { seo?: { robotsSitemap?: boolean } }
   const settings = await readSiteSettings()
   setResponseHeaders(event, {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=600, s-maxage=600',
   })
   return renderRobotsTxt({
      hidden: settings.hidden,
      sitemapUrl: seo?.robotsSitemap ? absoluteUrl(resolveSiteUrl(event), SITEMAP_PATH) : null,
   })
})
