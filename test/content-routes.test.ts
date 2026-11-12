import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import { buildSchema, parse, validate } from 'graphql'
import { createYoga } from 'graphql-yoga'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { contentRouteQuery, renderQueriesFile } from '../src/queries-codegen'
import { validateConfig } from '../src/schema-codegen'
import { renderSchemaFile } from '../src/schema-codegen'
import { renderTypesFile } from '../src/types-codegen'
import { renderGraphqlSdl } from '../src/runtime/shared/graphql-sdl'
import type { CmsConfig, CmsI18n } from '../src/runtime/shared/index'
import {
   buildContentPath,
   compareContentRoutes,
   contentItemPath,
   contentItemPaths,
   contentPathParamsMatch,
   contentRouteErrors,
   contentRouteShape,
   matchContentPath,
   matchContentPattern,
   normalizeCmsConfig,
   normalizeContentPath,
   routedContentNames,
} from '../src/runtime/shared/index'
import { contentConfig } from './fixtures'

const state = vi.hoisted(() => ({
   db: null as unknown,
   schema: {} as Record<string, unknown>,
   config: {} as Record<string, unknown>,
}))

vi.mock('#imports', () => ({
   useRuntimeConfig: () => ({
      cms: { media: { storage: 's3' } },
      public: {
         cms: { mediaBaseUrl: '', i18n: { locales: ['en', 'it'], defaultLocale: 'en' } },
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
const TMP = join(__dirname, '.tmp-content-routes')

const sections = {
   text: {
      label: 'Text',
      fields: { heading: { label: 'Heading', type: 'text', translatable: true } },
   },
} as const

function routedConfig(): CmsConfig {
   return normalizeCmsConfig(
      {
         news: {
            id: 'news',
            label: 'News',
            kind: 'content',
            blocks: sections,
            route: { en: '/news/[slug]', it: '/notizie/[slug]' },
            fields: { featured: { label: 'Featured', type: 'boolean' } },
         },
         blog: {
            id: 'blog',
            label: 'Blog',
            kind: 'content',
            blocks: sections,
            route: '/blog/[year]/[month]/[slug]',
            fields: { featured: { label: 'Featured', type: 'text' } },
         },
         pages: {
            id: 'pages',
            label: 'Pages',
            kind: 'page',
            routes: ['/'],
            fields: { title: { label: 'Title', type: 'text' } },
         },
      } as unknown as CmsConfig,
      I18N
   )
}

function errorsFor(route: unknown, i18n: CmsI18n = I18N) {
   const config = contentConfig()
   config.news!.route = route as CmsConfig[string]['route']
   return validateConfig(config, i18n)
}

describe('route patterns', () => {
   it('accepts slug, id and date placeholders', () => {
      expect(contentRouteErrors('/news/[slug]')).toEqual([])
      expect(contentRouteErrors('/[year]/[month]/[day]/[slug]')).toEqual([])
      expect(contentRouteErrors('/posts/[id]')).toEqual([])
   })

   it('rejects malformed patterns', () => {
      expect(contentRouteErrors('news/[slug]')[0]).toContain('must start with /')
      expect(contentRouteErrors('/news/[slug]/')[0]).toContain('trailing slash')
      expect(contentRouteErrors('/news//[slug]')[0]).toContain('empty segment')
      expect(contentRouteErrors('/news/[slug]?x')[0]).toContain('cannot hold')
      expect(contentRouteErrors('/news/[title]').join()).toContain('unknown placeholder [title]')
      expect(contentRouteErrors('/news/[slug].html').join()).toContain('whole segment')
      expect(contentRouteErrors('/[slug]/[slug]').join()).toContain('used twice')
      expect(contentRouteErrors('/news/[year]').join()).toContain('needs a [slug] or [id]')
      expect(contentRouteErrors('/cms/[slug]').join()).toContain('belongs to the admin')
      expect(contentRouteErrors('')).toEqual(['must be a non-empty string'])
   })

   it('builds a path from the item', () => {
      const item = { id: 'n1', slug: 'hello world', publishedAt: '2026-03-04T23:30:00.000Z' }
      expect(buildContentPath('/news/[slug]', item)).toBe('/news/hello%20world')
      expect(buildContentPath('/[year]/[month]/[day]/[id]', item)).toBe('/2026/03/04/n1')
      expect(buildContentPath('/[year]/[slug]', { slug: 'x' })).toBeNull()
      expect(buildContentPath('/news/[slug]', { slug: '' })).toBeNull()
   })

   it('matches a path and checks the params against the item', () => {
      expect(matchContentPattern('/news/[slug]', '/news/hello/?a=1#top')).toEqual({ slug: 'hello' })
      expect(matchContentPattern('/news/[slug]', '/news/hello%20world')).toEqual({
         slug: 'hello world',
      })
      expect(matchContentPattern('/news/[slug]', '/blog/hello')).toBeNull()
      expect(matchContentPattern('/news/[slug]', '/news')).toBeNull()
      expect(matchContentPattern('/[year]/[slug]', '/news/hello')).toBeNull()
      expect(matchContentPattern('/news/[slug]', '/news/%E0%A4%A')).toBeNull()
      const params = matchContentPattern('/[year]/[month]/[slug]', '/2026/03/hello')!
      expect(params).toEqual({ year: '2026', month: '03', slug: 'hello' })
      const item = { slug: 'hello', publishedAt: '2026-03-10T10:00:00.000Z' }
      expect(contentPathParamsMatch(params, item)).toBe(true)
      expect(contentPathParamsMatch(params, { ...item, publishedAt: '2025-03-10T10:00:00Z' })).toBe(
         false
      )
   })

   it('normalizes site paths', () => {
      expect(normalizeContentPath('news//hello/')).toBe('/news/hello')
      expect(normalizeContentPath('/')).toBe('/')
      expect(normalizeContentPath('/a?b=/c')).toBe('/a')
   })

   it('orders patterns from the most specific', () => {
      expect(['/[slug]/[id]', '/news/[slug]', '/[year]/[slug]'].sort(compareContentRoutes)).toEqual(
         ['/news/[slug]', '/[year]/[slug]', '/[slug]/[id]']
      )
      expect(contentRouteShape('/news/[id]')).toBe(contentRouteShape('/news/[slug]'))
      expect(contentRouteShape('/[year]/[slug]')).not.toBe(contentRouteShape('/[slug]/[id]'))
   })
})

describe('entry routes', () => {
   const config = routedConfig()
   const news = config.news!
   const item = { id: 'n1', slug: 'spring', publishedAt: '2026-04-01T08:00:00.000Z' }

   it('computes the path per locale', () => {
      expect(contentItemPath(news, item, 'en')).toBe('/news/spring')
      expect(contentItemPath(news, item, 'it')).toBe('/notizie/spring')
      expect(contentItemPath(config.blog!, item, 'it')).toBe('/blog/2026/04/spring')
      expect(contentItemPaths(news, item, ['en', 'it'])).toEqual([
         { locale: 'en', path: '/news/spring' },
         { locale: 'it', path: '/notizie/spring' },
      ])
      expect(contentItemPath(config.pages!, item, 'en')).toBeNull()
   })

   it('matches a path to the entries whose pattern fits', () => {
      expect(matchContentPath(config, '/notizie/spring', 'it')).toEqual([
         { entry: 'news', pattern: '/notizie/[slug]', params: { slug: 'spring' } },
      ])
      expect(matchContentPath(config, '/notizie/spring', 'en')).toEqual([])
      expect(matchContentPath(config, '/blog/2026/04/spring', 'en')[0]!.entry).toBe('blog')
   })

   it('lists routed entries from the most specific pattern', () => {
      expect(routedContentNames(config)).toEqual(['blog', 'news'])
   })
})

describe('route validation', () => {
   it('accepts a single pattern and a full per-locale map', () => {
      expect(errorsFor('/news/[slug]')).toEqual([])
      expect(errorsFor({ en: '/news/[slug]', it: '/notizie/[slug]' })).toEqual([])
      expect(
         errorsFor('/news/[slug]', { locales: [], defaultLocale: 'en' }).filter((error) =>
            error.includes('route')
         )
      ).toEqual([])
   })

   it('rejects bad patterns, unknown and missing locales', () => {
      expect(errorsFor('news')).toContain("cms.config entry 'news': route 'news' must start with /")
      expect(errorsFor({ en: '/news/[slug]', de: '/n/[slug]' }).join('\n')).toContain(
         "route names the unknown locale 'de'"
      )
      expect(errorsFor({ en: '/news/[slug]' }).join('\n')).toContain(
         'route has no pattern for the locale(s) it'
      )
      expect(errorsFor({ en: '/news/[x]', it: '/n/[slug]' }).join('\n')).toContain('route.en')
      expect(
         errorsFor({ en: '/news/[slug]' }, { locales: [], defaultLocale: 'en' }).join('\n')
      ).toContain('a per-locale route needs cms.i18n locales')
      expect(errorsFor(['/news/[slug]']).join('\n')).toContain(
         'route must be a path pattern or a map'
      )
   })

   it('rejects a route outside content entries and the reserved field names', () => {
      const config = contentConfig()
      config.events!.route = '/events/[slug]'
      config.news!.route = '/news/[slug]'
      config.news!.fields.path = { label: 'Path', type: 'text' }
      const errors = validateConfig(config, I18N).join('\n')
      expect(errors).toContain("cms.config entry 'events': route needs kind 'content'")
      expect(errors).toContain("'path' is reserved on content entries with a route")
   })

   it('rejects two entries whose patterns match the same paths', () => {
      const config = routedConfig()
      config.blog!.route = '/notizie/[id]'
      expect(validateConfig(config, I18N)).toContain(
         "cms.config entry 'blog': route '/notizie/[id]' matches the same paths as '/notizie/[slug]' of entry 'news'"
      )
   })
})

describe('route codegen', () => {
   const config = routedConfig()
   const sdl = renderGraphqlSdl(config)
   const schema = buildSchema(sdl)

   it('adds path, paths and byPath to routed content entries only', () => {
      expect(sdl).toContain('type CmsLocalePath {\n  locale: String!\n  path: String!\n}')
      expect(sdl).toMatch(/type News \{[^}]*path: String!\n {2}paths: \[CmsLocalePath!\]!/)
      expect(sdl).toContain('newsByPath(path: String!, locale: String): News')
      expect(sdl).toContain('blogByPath(path: String!, locale: String): Blog')
      const plain = renderGraphqlSdl(normalizeCmsConfig(contentConfig(), I18N))
      expect(plain).not.toContain('CmsLocalePath')
      expect(plain).not.toContain('newsByPath')
   })

   it('generates queries the schema accepts', () => {
      const query = contentRouteQuery(config)!
      expect(query).toContain('blog: blogByPath(path: $path, locale: $locale)')
      expect(query.indexOf('blogByPath')).toBeLessThan(query.indexOf('newsByPath'))
      expect(validate(schema, parse(query))).toEqual([])
      const file = renderQueriesFile(config)
      expect(file).toContain('export const cmsRouteEntries: string[] = ["blog","news"]')
      expect(file).toContain('path paths { locale path }')
      expect(contentRouteQuery(normalizeCmsConfig(contentConfig(), I18N))).toBeNull()
   })

   it('types the path and the route match', () => {
      const types = renderTypesFile(config)
      expect(types).toMatch(
         /export interface News \{[^}]*path: string\n {2}paths: CmsLocalePath\[\]/
      )
      expect(types).toContain("export type CmsRoutedContentName = 'blog' | 'news'")
      expect(types).toContain('[K in CmsRoutedContentName]: { entry: K; item: CmsContentTypes[K] }')
      expect(renderTypesFile(normalizeCmsConfig(contentConfig(), I18N))).toContain(
         'export type CmsRoutedContentName = never'
      )
   })
})

describe('route resolution', () => {
   let request: (body: string) => Promise<Response>

   beforeAll(async () => {
      mkdirSync(TMP, { recursive: true })
      const config = routedConfig()
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
      await db.insert(tables.news as SQLiteTable).values([
         {
            id: 'n1',
            title: title('Spring'),
            slug: 'spring',
            status: 'published',
            publishedAt: '2026-04-01T08:00:00.000Z',
         },
         {
            id: 'n2',
            title: title('Draft'),
            slug: 'draft',
            status: 'draft',
            publishedAt: '2026-04-01T08:00:00.000Z',
         },
         {
            id: 'n3',
            title: title('Later'),
            slug: 'later',
            status: 'published',
            publishedAt: '2999-01-01T00:00:00.000Z',
         },
      ] as never)
      await db.insert(tables.blog as SQLiteTable).values({
         id: 'b1',
         title: title('Post'),
         slug: 'post',
         status: 'published',
         publishedAt: '2026-03-31T23:30:00.000Z',
      } as never)
      const graphqlUtils = await import('../src/runtime/server/utils/graphql')
      const yoga = createYoga({
         schema: graphqlUtils.buildCmsSchema(),
         context: () => graphqlUtils.createGraphqlContext(),
         maskedErrors: false,
         logging: false,
      })
      request = async (body) =>
         yoga.fetch('http://cms.test/graphql', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body,
         })
   })

   afterAll(() => rmSync(TMP, { recursive: true, force: true }))

   async function run(query: string, variables?: Record<string, unknown>) {
      const response = await request(JSON.stringify({ query, variables }))
      const result = (await response.json()) as {
         data?: Record<string, unknown>
         errors?: { message: string }[]
      }
      expect(result.errors).toBeUndefined()
      return result.data!
   }

   it('resolves path and paths in the requested locale', async () => {
      const data = await run('{ news(locale: "it") { slug path paths { locale path } } }')
      expect(data.news).toEqual([
         {
            slug: 'spring',
            path: '/notizie/spring',
            paths: [
               { locale: 'en', path: '/news/spring' },
               { locale: 'it', path: '/notizie/spring' },
            ],
         },
      ])
   })

   it('finds a published item by its path in the locale', async () => {
      const data = await run(`{
         en: newsByPath(path: "/news/spring") { id title }
         it: newsByPath(path: "/notizie/spring", locale: "it") { id title }
         wrongLocale: newsByPath(path: "/notizie/spring") { id }
         draft: newsByPath(path: "/news/draft") { id }
         scheduled: newsByPath(path: "/news/later") { id }
         blog: blogByPath(path: "/blog/2026/03/post") { id path }
         wrongDate: blogByPath(path: "/blog/2026/04/post") { id }
      }`)
      expect(data).toEqual({
         en: { id: 'n1', title: 'Spring' },
         it: { id: 'n1', title: 'Spring (it)' },
         wrongLocale: null,
         draft: null,
         scheduled: null,
         blog: { id: 'b1', path: '/blog/2026/03/post' },
         wrongDate: null,
      })
   })

   it('answers the generated route query with one entry', async () => {
      const query = contentRouteQuery(state.config as CmsConfig)!
      const data = await run(query, { path: '/notizie/spring', locale: 'it' })
      expect(data.blog).toBeNull()
      expect((data.news as Record<string, unknown>).path).toBe('/notizie/spring')
   })
})
