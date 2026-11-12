import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import { createYoga } from 'graphql-yoga'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { pageQuery, singleQuery } from '../src/queries-codegen'
import { renderSchemaFile } from '../src/schema-codegen'
import type { CmsConfig, CmsI18n } from '../src/runtime/shared/index'
import { normalizeCmsConfig } from '../src/runtime/shared/index'
import type { PageDb } from '../src/runtime/server/utils/page-rows'
import { pageWriteStatements } from '../src/runtime/server/utils/page-rows'

const state = vi.hoisted(() => ({
   db: null as unknown,
   schema: {} as Record<string, unknown>,
   config: {} as Record<string, unknown>,
   selects: 0,
}))

vi.mock('#imports', () => ({
   useRuntimeConfig: () => ({
      cms: { media: { storage: 's3' } },
      public: {
         cms: { mediaBaseUrl: '', i18n: { locales: ['en', 'it'], defaultLocale: 'en' } },
      },
   }),
   getUserSession: async () => ({}),
}))

vi.mock('#cms-db', () => ({
   useDb: () => state.db,
   cmsDialect: 'sqlite',
}))

vi.mock('#cms-tables', () => ({
   get news() {
      return state.schema.news
   },
   get footer() {
      return state.schema.footer
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
const TMP = join(__dirname, '.tmp-links')

function config(): CmsConfig {
   const cmsConfig = normalizeCmsConfig(
      {
         pages: {
            id: 'pages',
            label: 'Pages',
            kind: 'page',
            fields: {
               title: { label: 'Title', type: 'text' },
               next: { label: 'Next', type: 'link', withLabel: true },
            },
         },
         news: {
            id: 'news',
            label: 'News',
            kind: 'content',
            route: { en: '/news/[slug]', it: '/notizie/[slug]' },
            blocks: {
               text: { label: 'Text', fields: { body: { label: 'Body', type: 'text' } } },
            },
         },
         footer: {
            id: 'footer',
            label: 'Footer',
            kind: 'single',
            fields: {
               cta: { label: 'CTA', type: 'link', withLabel: true, translatable: true },
               menu: {
                  label: 'Menu',
                  type: 'blocks',
                  blocks: {
                     item: {
                        label: 'Item',
                        fields: {
                           link: { label: 'Link', type: 'link', withLabel: true },
                        },
                     },
                  },
               },
               privacy: { label: 'Privacy', type: 'link', to: ['pages'], external: false },
            },
         },
      } as unknown as CmsConfig,
      I18N
   )
   cmsConfig.pages!.pages = [
      { path: '/', key: 'home', label: 'Home' },
      { path: '/about', key: 'about', label: 'About' },
   ]
   return cmsConfig
}

function countingDb(db: ReturnType<typeof drizzle>) {
   return new Proxy(db, {
      get(target, key, receiver) {
         const value = Reflect.get(target, key, receiver)
         if (key !== 'select' || typeof value !== 'function') return value
         return (...args: unknown[]) => {
            state.selects++
            return (value as (...a: unknown[]) => unknown).apply(target, args)
         }
      },
   })
}

describe('link fields with a database', () => {
   let graphqlUtils: typeof import('../src/runtime/server/utils/graphql')
   let linkUsage: typeof import('../src/runtime/server/utils/link-usage')
   let search: typeof import('../src/runtime/server/utils/search')
   let raw: ReturnType<typeof drizzle>

   async function run(query: string, variables: Record<string, unknown> = {}) {
      const yoga = createYoga({
         schema: graphqlUtils.buildCmsSchema(),
         context: () => graphqlUtils.createGraphqlContext(),
         maskedErrors: false,
         logging: false,
      })
      const response = await yoga.fetch('http://cms.test/graphql', {
         method: 'POST',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ query, variables }),
      })
      const result = (await response.json()) as {
         data?: Record<string, unknown>
         errors?: { message: string }[]
      }
      expect(result.errors).toBeUndefined()
      return result.data!
   }

   beforeAll(async () => {
      mkdirSync(TMP, { recursive: true })
      const cmsConfig = config()
      const file = join(TMP, 'schema.ts')
      writeFileSync(file, renderSchemaFile(cmsConfig, 'sqlite'))
      const tables = (await import(file)) as Record<string, unknown>
      const { generateSQLiteDrizzleJson, generateSQLiteMigration } = await import('drizzle-kit/api')
      const statements = await generateSQLiteMigration(
         await generateSQLiteDrizzleJson({}),
         await generateSQLiteDrizzleJson(tables)
      )
      const sqlite = new Database(':memory:')
      for (const statement of statements) sqlite.exec(statement)
      raw = drizzle(sqlite)
      state.db = countingDb(raw)
      state.schema = tables
      state.config = cmsConfig
      const item = (id: string, slug: string, extra: Record<string, unknown> = {}) => ({
         id,
         title: { en: id, it: `${id} (it)` },
         slug,
         status: 'published',
         publishedAt: '2026-01-01T08:00:00.000Z',
         ...extra,
      })
      await raw
         .insert(tables.news as SQLiteTable)
         .values([
            item('live', 'hello'),
            item('draft', 'draft-post', { status: 'draft' }),
            item('later', 'later', { publishedAt: '2999-01-01T00:00:00.000Z' }),
         ] as never)
      await raw.insert(tables.footer as SQLiteTable).values({
         id: 'footer',
         cta: { entry: 'news', id: 'live', label: { en: 'Read', it: 'Leggi' }, newTab: true },
         menu: [
            { type: 'item', link: { entry: 'news', id: 'draft', label: 'Draft' } },
            { type: 'item', link: { entry: 'news', id: 'later', label: 'Later' } },
            { type: 'item', link: { entry: 'news', id: 'gone', label: 'Gone' } },
            { type: 'item', link: { entry: 'news', id: 'live', label: 'Live' } },
            { type: 'item', link: { entry: 'pages', id: 'about', label: 'About' } },
            { type: 'item', link: { url: 'https://example.org/club', label: 'Club' } },
            { type: 'item', link: { url: '#top', label: 'Top' } },
         ],
         privacy: { entry: 'pages', id: 'home' },
      } as never)
      const pageTables = {
         page: tables.pages as SQLiteTable,
         fields: tables.pages_fields as SQLiteTable,
         media: tables.pages_media as SQLiteTable,
      }
      for (const statement of pageWriteStatements(
         raw as unknown as PageDb,
         'sqlite',
         pageTables,
         cmsConfig.pages!,
         { key: 'about', path: '/about' },
         {
            title: 'About',
            next: { entry: 'news', id: 'live', label: 'Latest' },
            updatedAt: '2026-01-01T08:00:00.000Z',
         }
      ))
         await statement
      graphqlUtils = await import('../src/runtime/server/utils/graphql')
      linkUsage = await import('../src/runtime/server/utils/link-usage')
      search = await import('../src/runtime/server/utils/search')
   })

   afterAll(() => rmSync(TMP, { recursive: true, force: true }))

   it('resolves hrefs per locale and hides drafts, scheduled and deleted targets', async () => {
      const cmsConfig = state.config as CmsConfig
      const query = singleQuery(cmsConfig, 'footer', cmsConfig.footer!)
      const en = (await run(query, { locale: 'en' })).footer as Record<string, unknown>
      expect(en.cta).toEqual({
         href: '/news/hello',
         label: 'Read',
         newTab: true,
         external: false,
         entry: 'news',
         id: 'live',
      })
      const it = (await run(query, { locale: 'it' })).footer as Record<string, unknown>
      expect(it.cta).toMatchObject({ href: '/notizie/hello', label: 'Leggi' })
      const menu = (it.menu as { link: Record<string, unknown> }[]).map((item) => item.link)
      expect(menu.map((link) => [link.label, link.href])).toEqual([
         ['Draft', null],
         ['Later', null],
         ['Gone', null],
         ['Live', '/notizie/hello'],
         ['About', '/about'],
         ['Club', 'https://example.org/club'],
         ['Top', '#top'],
      ])
      expect(menu[5]).toMatchObject({ external: true, entry: null, id: null })
      expect(menu[6]).toMatchObject({ external: false })
      expect(it.privacy).toMatchObject({ href: '/', entry: 'pages', id: 'home' })
   })

   it('loads every internal target of a request in one query', async () => {
      const cmsConfig = state.config as CmsConfig
      state.selects = 0
      await run(singleQuery(cmsConfig, 'footer', cmsConfig.footer!), { locale: 'en' })
      expect(state.selects).toBe(2)
   })

   it('resolves links stored in page rows', async () => {
      const cmsConfig = state.config as CmsConfig
      const data = await run(pageQuery(cmsConfig, 'pages', cmsConfig.pages!, '/about'), {
         path: '/about',
         locale: 'it',
      })
      expect((data.page as Record<string, unknown>).next).toMatchObject({
         href: '/notizie/hello',
         label: 'Latest',
      })
   })

   it('lists where a content item is linked from', async () => {
      const usage = await linkUsage.loadLinkUsage(['news:live', 'news:draft', 'news:none'])
      expect(usage['news:none']).toEqual([])
      expect(usage['news:draft']!.map((entry) => entry.field)).toEqual(['menu[0].link'])
      expect(
         usage['news:live']!.map((entry) => [entry.collection, entry.title, entry.field])
      ).toEqual([
         ['pages', 'About', 'next'],
         ['footer', null, 'cta'],
         ['footer', null, 'menu[3].link'],
      ])
   })

   it('finds link labels and urls in the admin search', async () => {
      const options = {
         db: raw,
         dialect: 'sqlite' as const,
         config: state.config as CmsConfig,
         tables: state.schema,
         i18n: I18N,
      }
      const labels = await search.searchCmsValues({ ...options, query: 'leggi' })
      expect(labels.hits).toEqual([
         expect.objectContaining({ collection: 'footer', field: 'cta', locale: 'it' }),
      ])
      const urls = await search.searchCmsValues({ ...options, query: 'example.org' })
      expect(urls.hits).toEqual([
         expect.objectContaining({
            collection: 'footer',
            field: 'menu',
            fieldLabel: 'Menu › Item › Link',
         }),
      ])
      const pages = await search.searchCmsValues({ ...options, query: 'latest' })
      expect(pages.hits).toEqual([expect.objectContaining({ collection: 'pages', field: 'next' })])
   })
})
