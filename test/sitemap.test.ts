import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import { createYoga } from 'graphql-yoga'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { renderSchemaFile } from '../src/schema-codegen'
import type { CmsConfig, CmsI18n, SitemapUrl } from '../src/runtime/shared/index'
import {
   CMS_SITE_SETTINGS_KEY,
   normalizeCmsConfig,
   planSitemapChunks,
} from '../src/runtime/shared/index'

const state = vi.hoisted(() => ({
   db: null as unknown,
   schema: {} as Record<string, unknown>,
   config: {} as Record<string, unknown>,
}))

vi.mock('#imports', () => ({
   useRuntimeConfig: () => ({
      cms: { media: { storage: 's3' } },
      public: {
         siteUrl: '',
         cms: { mediaBaseUrl: '/images', i18n: { locales: ['en', 'it'], defaultLocale: 'en' } },
      },
   }),
}))

vi.mock('#cms-db', () => ({
   useDb: () => state.db,
   cmsDialect: 'sqlite',
}))

vi.mock('#cms-tables', () => ({
   get news() {
      return state.schema.news
   },
   get blog() {
      return state.schema.blog
   },
   get pages() {
      return state.schema.pages
   },
   get pages_fields() {
      return state.schema.pages_fields
   },
   get pages_media() {
      return state.schema.pages_media
   },
   get cms_media() {
      return state.schema.cms_media
   },
   get cms_settings() {
      return state.schema.cms_settings
   },
}))

vi.mock('../src/runtime/server/utils/media-index', () => ({
   useMediaIndex: async () => new Map(),
}))

vi.mock('#cms-config', () => ({
   get default() {
      return state.config
   },
}))

const I18N: CmsI18n = { locales: ['en', 'it'], defaultLocale: 'en' }
const TMP = join(__dirname, '.tmp-sitemap')
const SITE_URL = 'https://example.com'

const sections = {
   text: { label: 'Text', fields: { heading: { label: 'Heading', type: 'text' } } },
} as const

function seoConfig(): CmsConfig {
   return normalizeCmsConfig(
      {
         news: {
            id: 'news',
            label: 'News',
            kind: 'content',
            blocks: sections,
            route: '/news/[slug]',
         },
         blog: {
            id: 'blog',
            label: 'Blog',
            kind: 'content',
            blocks: sections,
            route: { en: '/blog/[slug]', it: '/it/blog/[slug]' },
         },
         pages: {
            id: 'pages',
            label: 'Pages',
            kind: 'page',
            pages: ['/', '/about', '/hidden', '/cms/preview'].map((path) => ({
               path,
               key: path,
               label: path,
            })),
            fields: {
               title: { label: 'Title', type: 'text' },
               seoNoindex: { label: 'Hide', type: 'boolean' },
            },
         },
      } as unknown as CmsConfig,
      I18N
   )
}

async function collect(batches: AsyncIterable<SitemapUrl[]>): Promise<SitemapUrl[]> {
   const urls: SitemapUrl[] = []
   for await (const batch of batches) urls.push(...batch)
   return urls
}

describe('sitemap and site settings', () => {
   let sitemap: typeof import('../src/runtime/server/utils/sitemap')
   let request: (query: string) => Promise<Record<string, unknown>>

   beforeAll(async () => {
      mkdirSync(TMP, { recursive: true })
      const config = seoConfig()
      const file = join(TMP, 'schema.ts')
      writeFileSync(file, renderSchemaFile(config, 'sqlite'))
      const tables = (await import(file)) as Record<string, unknown>
      const { generateSQLiteDrizzleJson, generateSQLiteMigration } = await import('drizzle-kit/api')
      const statements = await generateSQLiteMigration(
         await generateSQLiteDrizzleJson({}),
         await generateSQLiteDrizzleJson(tables)
      )
      const sqlite = new Database(':memory:')
      for (const statement of statements) sqlite.exec(statement)
      const db = drizzle(sqlite)
      state.db = db
      state.schema = tables
      state.config = config
      const title = (en: string) => ({ en, it: `${en} (it)` })
      const item = (id: string, extra: Record<string, unknown> = {}) => ({
         id,
         title: title(id),
         slug: id,
         status: 'published',
         publishedAt: '2026-04-01T08:00:00.000Z',
         updatedAt: '2026-04-02T08:00:00.000Z',
         ...extra,
      })
      await db
         .insert(tables.news as SQLiteTable)
         .values([
            item('n1'),
            item('n2'),
            item('n3'),
            item('draft', { status: 'draft' }),
            item('later', { publishedAt: '2999-01-01T00:00:00.000Z' }),
            item('private', { seoNoindex: true }),
         ] as never)
      await db.insert(tables.blog as SQLiteTable).values([item('b1'), item('b2')] as never)
      await db.insert(tables.pages as SQLiteTable).values([
         { id: 'home', path: '/', updatedAt: '2026-03-01T00:00:00.000Z' },
         { id: 'hidden', path: '/hidden', updatedAt: '2026-03-01T00:00:00.000Z' },
      ] as never)
      await db
         .insert(tables.pages_fields as SQLiteTable)
         .values({ pageId: 'hidden', key: 'seoNoindex', position: 0, value: 'true' } as never)
      await db.insert(tables.cms_media as SQLiteTable).values({
         key: 'share.jpg',
         mime: 'image/jpeg',
         width: 1200,
         height: 630,
      } as never)
      await db.insert(tables.cms_settings as SQLiteTable).values({
         key: CMS_SITE_SETTINGS_KEY,
         value: JSON.stringify({
            name: { en: 'Acme', it: 'Acme Italia' },
            titleTemplate: '%s | %siteName',
            description: { en: 'Lake club' },
            image: 'share.jpg',
            hidden: false,
         }),
      } as never)

      sitemap = await import('../src/runtime/server/utils/sitemap')
      const graphqlUtils = await import('../src/runtime/server/utils/graphql')
      const yoga = createYoga({
         schema: graphqlUtils.buildCmsSchema(),
         context: () => graphqlUtils.createGraphqlContext(),
         maskedErrors: false,
         logging: false,
      })
      request = async (query) => {
         const response = await yoga.fetch('http://cms.test/graphql', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ query }),
         })
         const result = (await response.json()) as {
            data?: Record<string, unknown>
            errors?: { message: string }[]
         }
         expect(result.errors).toBeUndefined()
         return result.data!
      }
   })

   afterAll(() => rmSync(TMP, { recursive: true, force: true }))

   const context = { siteUrl: SITE_URL, i18n: I18N }

   it('counts the visible pages and items per source', async () => {
      const plan = await sitemap.planSitemap(context)
      expect(plan.sizes).toEqual([
         { source: '', count: 2, urlsPerItem: 1 },
         { source: 'news', count: 3, urlsPerItem: 1 },
         { source: 'blog', count: 2, urlsPerItem: 2 },
      ])
      expect(plan.pages.map((url) => url.loc)).toEqual([
         'https://example.com/',
         'https://example.com/about',
      ])
   })

   it('lists published items once per distinct path with alternates', async () => {
      const plan = await sitemap.planSitemap(context)
      const chunks = plan.sizes.map((size) => ({ ...size, offset: 0, limit: size.count }))
      const urls = await collect(sitemap.sitemapChunkUrls(plan, chunks, context))
      expect(urls.map((url) => url.loc)).toEqual([
         'https://example.com/',
         'https://example.com/about',
         'https://example.com/news/n1',
         'https://example.com/news/n2',
         'https://example.com/news/n3',
         'https://example.com/blog/b1',
         'https://example.com/it/blog/b1',
         'https://example.com/blog/b2',
         'https://example.com/it/blog/b2',
      ])
      expect(urls[2]).toEqual({
         loc: 'https://example.com/news/n1',
         lastmod: '2026-04-02T08:00:00.000Z',
      })
      expect(urls[6]!.alternates).toEqual([
         { hreflang: 'en', href: 'https://example.com/blog/b1' },
         { hreflang: 'it', href: 'https://example.com/it/blog/b1' },
         { hreflang: 'x-default', href: 'https://example.com/blog/b1' },
      ])
   })

   it('reads one part of a split sitemap', async () => {
      const plan = await sitemap.planSitemap(context)
      const chunks = planSitemapChunks(plan.sizes, 2)
      expect(chunks).toEqual([
         { source: '', offset: 0, limit: 2 },
         { source: 'news', offset: 0, limit: 2 },
         { source: 'news', offset: 2, limit: 1 },
         { source: 'blog', offset: 0, limit: 1 },
         { source: 'blog', offset: 1, limit: 1 },
      ])
      const third = await collect(sitemap.sitemapChunkUrls(plan, [chunks[2]!], context))
      expect(third.map((url) => url.loc)).toEqual(['https://example.com/news/n3'])
      const last = await collect(sitemap.sitemapChunkUrls(plan, [chunks[4]!], context))
      expect(last.map((url) => url.loc)).toEqual([
         'https://example.com/blog/b2',
         'https://example.com/it/blog/b2',
      ])
   })

   it('serves the localized site settings through GraphQL', async () => {
      const data = await request(`{
         en: cmsSite { name titleTemplate description hidden image { url type width } }
         it: cmsSite(locale: "it") { name description }
      }`)
      expect(data).toEqual({
         en: {
            name: 'Acme',
            titleTemplate: '%s | %siteName',
            description: 'Lake club',
            hidden: false,
            image: { url: '/images/share.jpg', type: 'image', width: 1200 },
         },
         it: { name: 'Acme Italia', description: 'Lake club' },
      })
   })
})
