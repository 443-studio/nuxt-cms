import { describe, expect, it } from 'vitest'
import { validateConfig } from '../src/schema-codegen'
import { renderGraphqlSdl } from '../src/runtime/shared/graphql-sdl'
import type { CmsConfig, CmsSite } from '../src/runtime/shared/index'
import {
   absoluteUrl,
   applyTitleTemplate,
   coerceSiteSettings,
   hiddenSiteHeaderApplies,
   normalizeSiteUrl,
   pageSitemapUrls,
   planSitemapChunks,
   plainText,
   renderRobotsTxt,
   renderSitemap,
   renderSitemapIndex,
   resolveSeoMeta,
   resolveSeoSwitches,
   seoAlternates,
   seoOptionErrors,
   sitemapPartUrl,
   sitemapUrlCount,
   sitemapUrlsForPaths,
   titleTemplateErrors,
} from '../src/runtime/shared/index'
import { contentConfig } from './fixtures'

const SITE_URL = 'https://example.com'
const CONTEXT = { siteUrl: SITE_URL, path: '/current', defaultLocale: 'en' }

const SITE: CmsSite = {
   name: 'Acme',
   titleTemplate: null,
   description: 'Fishing club on the lake',
   image: { url: '/images/share.jpg', type: 'image', alt: 'Lake', width: 1200, height: 630 },
   hidden: false,
}

describe('title template', () => {
   it('fills the page title and the site name', () => {
      expect(applyTitleTemplate('%s | %siteName', 'About', 'Acme')).toBe('About | Acme')
      expect(applyTitleTemplate('%siteName: %s', 'About', 'Acme')).toBe('Acme: About')
      expect(applyTitleTemplate('%s - Acme club', 'About', null)).toBe('About - Acme club')
   })

   it('defaults to title | site name and falls back gracefully', () => {
      expect(applyTitleTemplate(null, 'About', 'Acme')).toBe('About | Acme')
      expect(applyTitleTemplate('', 'About', null)).toBe('About')
      expect(applyTitleTemplate('%s | %siteName', 'About', '')).toBe('About')
      expect(applyTitleTemplate('%s | %siteName', null, 'Acme')).toBe('Acme')
      expect(applyTitleTemplate('%s | %siteName', 'Acme', 'Acme')).toBe('Acme')
      expect(applyTitleTemplate('%siteName', 'About', 'Acme')).toBe('About')
   })

   it('does not substitute placeholders found in the values', () => {
      expect(applyTitleTemplate('%s | %siteName', '100%s off', 'A %s site')).toBe(
         '100%s off | A %s site'
      )
   })

   it('requires the page title placeholder', () => {
      expect(titleTemplateErrors('%s | %siteName')).toEqual([])
      expect(titleTemplateErrors('%siteName')[0]).toContain('needs %s')
      expect(titleTemplateErrors('Acme')[0]).toContain('needs %s')
   })
})

describe('urls and text', () => {
   it('builds absolute urls from the site url', () => {
      expect(normalizeSiteUrl(' https://example.com/// ')).toBe('https://example.com')
      expect(absoluteUrl('https://example.com/', '/news/a')).toBe('https://example.com/news/a')
      expect(absoluteUrl('https://example.com', 'news')).toBe('https://example.com/news')
      expect(absoluteUrl(SITE_URL, 'https://cdn.test/a.jpg')).toBe('https://cdn.test/a.jpg')
      expect(absoluteUrl(SITE_URL, '//cdn.test/a.jpg')).toBe('//cdn.test/a.jpg')
   })

   it('turns rich text into a plain description', () => {
      expect(plainText('<p>Fish &amp; chips</p>\n<p>on the  lake</p>')).toBe(
         'Fish & chips on the lake'
      )
      expect(plainText('<p> </p>')).toBeNull()
      expect(plainText(null)).toBeNull()
   })
})

describe('hreflang alternates', () => {
   it('is empty when every locale shares one path', () => {
      const paths = [
         { locale: 'en', path: '/news/spring' },
         { locale: 'it', path: '/news/spring' },
      ]
      expect(seoAlternates(paths, SITE_URL, 'en')).toEqual([])
      expect(seoAlternates([], SITE_URL, 'en')).toEqual([])
      expect(seoAlternates(null, SITE_URL, 'en')).toEqual([])
   })

   it('lists every locale once plus x-default on the default locale', () => {
      const paths = [
         { locale: 'it', path: '/it/blog/post' },
         { locale: 'en', path: '/blog/post' },
         { locale: 'en', path: '/blog/duplicate' },
      ]
      expect(seoAlternates(paths, SITE_URL, 'en')).toEqual([
         { hreflang: 'it', href: 'https://example.com/it/blog/post' },
         { hreflang: 'en', href: 'https://example.com/blog/post' },
         { hreflang: 'x-default', href: 'https://example.com/blog/post' },
      ])
   })

   it('falls back to the first locale for x-default', () => {
      const paths = [
         { locale: 'de', path: '/de/a' },
         { locale: 'it', path: '/it/a' },
      ]
      expect(seoAlternates(paths, SITE_URL, 'en').at(-1)).toEqual({
         hreflang: 'x-default',
         href: 'https://example.com/de/a',
      })
   })
})

describe('resolveSeoMeta', () => {
   it('uses the SEO fields of a content item', () => {
      const meta = resolveSeoMeta(
         {
            title: 'Spring cup',
            seoTitle: 'Spring cup 2026',
            excerpt: 'Short',
            seoDescription: 'All about the cup',
            cover: { url: '/images/cover.jpg', type: 'image' },
            seoImage: { url: 'https://cdn.test/seo.jpg', type: 'image', width: 1200 },
            path: '/news/spring-cup',
            paths: [
               { locale: 'en', path: '/news/spring-cup' },
               { locale: 'it', path: '/it/news/spring-cup' },
            ],
            publishedAt: '2026-04-01T08:00:00.000Z',
            updatedAt: '2026-04-02T08:00:00.000Z',
         },
         SITE,
         CONTEXT
      )
      expect(meta).toEqual({
         title: 'Spring cup 2026 | Acme',
         pageTitle: 'Spring cup 2026',
         description: 'All about the cup',
         canonical: 'https://example.com/news/spring-cup',
         image: {
            url: 'https://cdn.test/seo.jpg',
            alt: null,
            width: 1200,
            height: null,
            type: null,
         },
         robots: null,
         alternates: [
            { hreflang: 'en', href: 'https://example.com/news/spring-cup' },
            { hreflang: 'it', href: 'https://example.com/it/news/spring-cup' },
            { hreflang: 'x-default', href: 'https://example.com/news/spring-cup' },
         ],
         type: 'article',
         siteName: 'Acme',
         publishedTime: '2026-04-01T08:00:00.000Z',
         modifiedTime: '2026-04-02T08:00:00.000Z',
      })
   })

   it('falls back to title, excerpt and cover, then to the site', () => {
      const meta = resolveSeoMeta(
         {
            title: 'Spring cup',
            excerpt: '<p>Short</p>',
            cover: { url: '/images/cover.jpg', type: 'image' },
         },
         SITE,
         CONTEXT
      )
      expect(meta.title).toBe('Spring cup | Acme')
      expect(meta.description).toBe('Short')
      expect(meta.image?.url).toBe('https://example.com/images/cover.jpg')
      expect(meta.canonical).toBe('https://example.com/current')

      const empty = resolveSeoMeta(null, SITE, CONTEXT)
      expect(empty.title).toBe('Acme')
      expect(empty.description).toBe('Fishing club on the lake')
      expect(empty.image).toMatchObject({
         url: 'https://example.com/images/share.jpg',
         alt: 'Lake',
      })
      expect(empty.type).toBe('website')
   })

   it('follows the page row convention and skips video covers', () => {
      const meta = resolveSeoMeta(
         {
            path: '/about',
            title: 'About',
            description: 'Who we are',
            cover: { url: '/images/intro.mp4', type: 'video' },
            seoNoindex: true,
         },
         SITE,
         CONTEXT
      )
      expect(meta.canonical).toBe('https://example.com/about')
      expect(meta.description).toBe('Who we are')
      expect(meta.image?.url).toBe('https://example.com/images/share.jpg')
      expect(meta.robots).toBe('noindex')
      expect(meta.alternates).toEqual([])
   })

   it('hides everything when the site is hidden', () => {
      const meta = resolveSeoMeta({ title: 'About' }, { ...SITE, hidden: true }, CONTEXT)
      expect(meta.robots).toBe('noindex, nofollow')
   })

   it('applies the overrides', () => {
      const meta = resolveSeoMeta(
         { title: 'About', seoNoindex: true, path: '/about' },
         { ...SITE, titleTemplate: '%siteName - %s' },
         CONTEXT,
         {
            title: 'Team',
            description: 'Our team',
            image: '/team.jpg',
            path: '/team?ref=x',
            noindex: false,
            type: 'article',
            alternates: [
               { locale: 'en', path: '/team' },
               { locale: 'it', path: '/it/team' },
            ],
         }
      )
      expect(meta.title).toBe('Acme - Team')
      expect(meta.description).toBe('Our team')
      expect(meta.image?.url).toBe('https://example.com/team.jpg')
      expect(meta.canonical).toBe('https://example.com/team')
      expect(meta.robots).toBeNull()
      expect(meta.type).toBe('article')
      expect(meta.alternates).toHaveLength(3)
      expect(resolveSeoMeta({ title: 'Raw' }, SITE, CONTEXT, { titleTemplate: false }).title).toBe(
         'Raw'
      )
      expect(resolveSeoMeta({ title: 'Raw' }, SITE, CONTEXT, { image: null }).image).toBeNull()
   })
})

describe('sitemap xml', () => {
   it('renders urls with lastmod, alternates and escaping', () => {
      const xml = renderSitemap([
         { loc: 'https://example.com/', lastmod: '2026-04-01T08:00:00.000Z' },
         {
            loc: 'https://example.com/blog/a&b',
            alternates: [
               { hreflang: 'en', href: 'https://example.com/blog/a&b' },
               { hreflang: 'x-default', href: 'https://example.com/blog/a&b' },
            ],
         },
      ])
      expect(xml).toBe(
         [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
            '  <url>',
            '    <loc>https://example.com/</loc>',
            '    <lastmod>2026-04-01T08:00:00.000Z</lastmod>',
            '  </url>',
            '  <url>',
            '    <loc>https://example.com/blog/a&amp;b</loc>',
            '    <xhtml:link rel="alternate" hreflang="en" href="https://example.com/blog/a&amp;b"/>',
            '    <xhtml:link rel="alternate" hreflang="x-default" href="https://example.com/blog/a&amp;b"/>',
            '  </url>',
            '</urlset>',
            '',
         ].join('\n')
      )
      expect(renderSitemap([])).toContain('<urlset')
   })

   it('renders a sitemap index', () => {
      const xml = renderSitemapIndex([sitemapPartUrl(SITE_URL, 1), sitemapPartUrl(SITE_URL, 2)])
      expect(xml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
      expect(xml).toContain('<loc>https://example.com/sitemap.xml?part=2</loc>')
   })

   it('gives one url per distinct path of a content item', () => {
      const shared = sitemapUrlsForPaths(
         [
            { locale: 'en', path: '/news/a' },
            { locale: 'it', path: '/news/a' },
         ],
         SITE_URL,
         'en',
         '2026-04-01T08:00:00.000Z'
      )
      expect(shared).toEqual([
         { loc: 'https://example.com/news/a', lastmod: '2026-04-01T08:00:00.000Z' },
      ])
      const localized = sitemapUrlsForPaths(
         [
            { locale: 'en', path: '/blog/a' },
            { locale: 'it', path: '/it/blog/a' },
         ],
         SITE_URL,
         'en',
         null
      )
      expect(localized.map((url) => url.loc)).toEqual([
         'https://example.com/blog/a',
         'https://example.com/it/blog/a',
      ])
      expect(localized[1]!.alternates).toHaveLength(3)
   })

   it('lists the page routes without admin, dynamic and noindex paths', () => {
      const urls = pageSitemapUrls(
         ['/', '/about', '/cms', '/cms/preview', '/hidden', '/posts/[slug]', '/never-saved'],
         [
            { path: '/', updatedAt: '2026-04-01 08:00:00' },
            { path: '/about', updatedAt: '2026-04-02T08:00:00.000Z', seoNoindex: false },
            { path: '/hidden', seoNoindex: true },
         ],
         SITE_URL
      )
      expect(urls).toEqual([
         { loc: 'https://example.com/', lastmod: '2026-04-01T08:00:00.000Z' },
         { loc: 'https://example.com/about', lastmod: '2026-04-02T08:00:00.000Z' },
         { loc: 'https://example.com/never-saved', lastmod: null },
      ])
   })

   it('splits large sitemaps into parts that fit the url limit', () => {
      const sizes = [
         { source: '', count: 3, urlsPerItem: 1 },
         { source: 'news', count: 7, urlsPerItem: 2 },
      ]
      expect(sitemapUrlCount(sizes)).toBe(17)
      expect(planSitemapChunks(sizes, 5)).toEqual([
         { source: '', offset: 0, limit: 3 },
         { source: 'news', offset: 0, limit: 2 },
         { source: 'news', offset: 2, limit: 2 },
         { source: 'news', offset: 4, limit: 2 },
         { source: 'news', offset: 6, limit: 1 },
      ])
      expect(planSitemapChunks([{ source: 'x', count: 2, urlsPerItem: 9 }], 5)).toEqual([
         { source: 'x', offset: 0, limit: 1 },
         { source: 'x', offset: 1, limit: 1 },
      ])
   })
})

describe('robots.txt', () => {
   it('keeps the admin out and points to the sitemap', () => {
      expect(
         renderRobotsTxt({ hidden: false, sitemapUrl: 'https://example.com/sitemap.xml' })
      ).toBe('User-agent: *\nDisallow: /cms/\n\nSitemap: https://example.com/sitemap.xml\n')
      expect(renderRobotsTxt({ hidden: false, sitemapUrl: null })).toBe(
         'User-agent: *\nDisallow: /cms/\n'
      )
   })

   it('stays open when the site is hidden, so crawlers can read the noindex header', () => {
      expect(renderRobotsTxt({ hidden: true, sitemapUrl: 'https://example.com/sitemap.xml' })).toBe(
         'User-agent: *\nDisallow: /cms/\n'
      )
   })
})

describe('hidden site header', () => {
   it('applies to site responses and skips the admin and the build assets', () => {
      expect(hiddenSiteHeaderApplies('/')).toBe(true)
      expect(hiddenSiteHeaderApplies('/blog/post?x=1')).toBe(true)
      expect(hiddenSiteHeaderApplies('/cmsx')).toBe(true)
      expect(hiddenSiteHeaderApplies('/cms')).toBe(false)
      expect(hiddenSiteHeaderApplies('/cms/news?x=1')).toBe(false)
      expect(hiddenSiteHeaderApplies('/_nuxt/entry.js')).toBe(false)
      expect(hiddenSiteHeaderApplies('/__nuxt_error')).toBe(false)
   })
})

describe('site settings', () => {
   it('reads stored settings leniently', () => {
      expect(coerceSiteSettings(null)).toEqual({
         name: null,
         titleTemplate: null,
         description: null,
         image: null,
         hidden: false,
      })
      expect(
         coerceSiteSettings({
            name: { en: 'Acme', it: '', de: 3 },
            titleTemplate: '%s | Acme',
            description: 'not a map',
            image: 'share.jpg',
            hidden: 'yes',
         })
      ).toEqual({
         name: { en: 'Acme' },
         titleTemplate: '%s | Acme',
         description: null,
         image: 'share.jpg',
         hidden: false,
      })
   })

   it('exposes the site settings in the GraphQL schema', () => {
      const sdl = renderGraphqlSdl({})
      expect(sdl).toContain('cmsSite(locale: String): CmsSite!')
      expect(sdl).toContain('type CmsSite {')
   })

   it('reserves the CmsSite type name', () => {
      const config = contentConfig()
      config.cmsSite = {
         id: 'cmsSite',
         label: 'Site',
         kind: 'single',
         fields: { name: { label: 'Name', type: 'text' } },
      } as CmsConfig[string]
      expect(validateConfig(config).join()).toContain("GraphQL type name 'CmsSite' is reserved")
   })
})

describe('seo module options', () => {
   it('accepts the documented options', () => {
      expect(seoOptionErrors(undefined, undefined)).toEqual([])
      expect(
         seoOptionErrors({ sitemap: false, robots: true }, { url: 'https://example.com/' })
      ).toEqual([])
      expect(seoOptionErrors({}, { url: '' })).toEqual([])
   })

   it('rejects unknown keys, wrong types and bad site urls', () => {
      expect(seoOptionErrors(true, undefined)).toEqual([
         'cms.seo must be an object like { sitemap: true, robots: true }',
      ])
      expect(seoOptionErrors({ sitemap: 'yes', feed: true }, undefined)).toEqual([
         'cms.seo.sitemap must be true or false',
         'cms.seo.feed is not an option (use sitemap, robots)',
      ])
      expect(seoOptionErrors(undefined, 'https://example.com')).toEqual([
         "cms.site must be an object like { url: 'https://example.com' }",
      ])
      expect(seoOptionErrors(undefined, { url: 'example.com' })[0]).toContain('absolute URL')
      expect(seoOptionErrors(undefined, { url: 'ftp://example.com' })[0]).toContain('http or https')
      expect(seoOptionErrors(undefined, { url: 'https://example.com/?a=1' })[0]).toContain(
         'query or a hash'
      )
      expect(seoOptionErrors(undefined, { url: 'https://u:p@example.com' })[0]).toContain(
         'credentials'
      )
      expect(seoOptionErrors(undefined, { url: 3 })).toEqual(['cms.site.url must be a string'])
      expect(seoOptionErrors(undefined, { host: 'x' })[0]).toContain(
         'cms.site.host is not an option'
      )
   })

   it('turns the routes on unless another provider is found', () => {
      expect(resolveSeoSwitches(undefined, { sitemap: [], robots: [] })).toEqual({
         sitemap: true,
         robots: true,
         warnings: [],
      })
      const auto = resolveSeoSwitches(undefined, {
         sitemap: ['@nuxtjs/sitemap'],
         robots: ['public/robots.txt'],
      })
      expect(auto.sitemap).toBe(false)
      expect(auto.robots).toBe(false)
      expect(auto.warnings).toHaveLength(2)
      expect(auto.warnings[0]).toContain('@nuxtjs/sitemap found')
   })

   it('keeps explicit switches and warns about a clash', () => {
      const forced = resolveSeoSwitches(
         { sitemap: true, robots: false },
         { sitemap: ['@nuxtjs/sitemap'], robots: ['@nuxtjs/robots'] }
      )
      expect(forced.sitemap).toBe(true)
      expect(forced.robots).toBe(false)
      expect(forced.warnings).toHaveLength(1)
      expect(forced.warnings[0]).toContain('cms.seo.sitemap is on but @nuxtjs/sitemap')
   })
})
