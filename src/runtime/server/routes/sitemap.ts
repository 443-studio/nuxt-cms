import type { H3Event } from 'h3'
import { createError, defineEventHandler, getQuery, sendStream, setResponseHeaders } from 'h3'
import type { SitemapChunk, SitemapUrl } from '../../shared/index'
import {
   SITEMAP_MAX_URLS,
   SITEMAP_URLSET_CLOSE,
   SITEMAP_URLSET_OPEN,
   planSitemapChunks,
   renderSitemap,
   renderSitemapIndex,
   renderSitemapUrl,
   sitemapPartUrl,
   sitemapUrlCount,
} from '../../shared/index'
import { getContentI18n } from '../utils/registry'
import { readSiteSettings, resolveSiteUrl, seoRouteCacheHeader } from '../utils/site'
import type { SitemapContext, SitemapPlan } from '../utils/sitemap'
import { planSitemap, sitemapChunkUrls } from '../utils/sitemap'

async function* urlsetParts(batches: AsyncIterable<SitemapUrl[]>): AsyncGenerator<string> {
   yield SITEMAP_URLSET_OPEN
   for await (const batch of batches) {
      if (batch.length) yield batch.map(renderSitemapUrl).join('')
   }
   yield SITEMAP_URLSET_CLOSE
}

function textStream(parts: AsyncGenerator<string>): ReadableStream<Uint8Array> {
   const encoder = new TextEncoder()
   return new ReadableStream({
      async pull(controller) {
         const { value, done } = await parts.next()
         if (done) controller.close()
         else controller.enqueue(encoder.encode(value))
      },
      async cancel() {
         await parts.return(undefined)
      },
   })
}

function streamUrlset(
   event: H3Event,
   plan: SitemapPlan,
   chunks: SitemapChunk[],
   context: SitemapContext
) {
   return sendStream(event, textStream(urlsetParts(sitemapChunkUrls(plan, chunks, context))))
}

function requestedPart(event: H3Event): number | null {
   const part = getQuery(event).part
   if (part === undefined) return null
   const value = Number(part)
   if (!Number.isInteger(value) || value < 1)
      throw createError({ statusCode: 404, statusMessage: 'Sitemap not found' })
   return value
}

export default defineEventHandler(async (event) => {
   const part = requestedPart(event)
   setResponseHeaders(event, {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': seoRouteCacheHeader(event),
   })
   const settings = await readSiteSettings()
   if (settings.hidden) return renderSitemap([])

   const context: SitemapContext = { siteUrl: resolveSiteUrl(event), i18n: getContentI18n() }
   const plan = await planSitemap(context)
   const paged = sitemapUrlCount(plan.sizes) > SITEMAP_MAX_URLS
   const chunks = paged
      ? planSitemapChunks(plan.sizes)
      : plan.sizes.map((size) => ({ source: size.source, offset: 0, limit: size.count }))

   if (part === null && paged)
      return renderSitemapIndex(
         chunks.map((_, index) => sitemapPartUrl(context.siteUrl, index + 1))
      )
   if (part === null || (!paged && part === 1)) return streamUrlset(event, plan, chunks, context)
   const chunk = paged ? chunks[part - 1] : undefined
   if (!chunk) throw createError({ statusCode: 404, statusMessage: 'Sitemap not found' })
   return streamUrlset(event, plan, [chunk], context)
})
