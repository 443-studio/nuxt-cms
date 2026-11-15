import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderSchemaFile } from '../src/schema-codegen'
import type { CmsConfig, CmsEntry, CmsI18n } from '../src/runtime/shared/index'
import { normalizeCmsConfig } from '../src/runtime/shared/index'
import type { CmsContentSnapshot, CmsSeedMedia } from '../src/runtime/seed'
import {
   CmsContentError,
   importCmsContent,
   seedCmsContent,
   validateCmsContent,
} from '../src/runtime/seed'

const state = vi.hoisted(() => ({
   db: null as unknown,
   schema: {} as Record<string, unknown>,
   config: {} as Record<string, unknown>,
}))

vi.mock('#imports', () => ({
   useRuntimeConfig: () => ({
      cms: { media: { storage: 'local' } },
      public: { cms: { i18n: { locales: ['en', 'it'], defaultLocale: 'en' } } },
   }),
}))

vi.mock('#cms-db', () => ({
   useDb: () => state.db,
   cmsDialect: 'sqlite',
   runBatch: async () => [],
}))

vi.mock('#cms-tables', () => ({
   get categories() {
      return state.schema.categories
   },
   get events() {
      return state.schema.events
   },
   get events_tags() {
      return state.schema.events_tags
   },
   get homepage() {
      return state.schema.homepage
   },
   get homepage_featured() {
      return state.schema.homepage_featured
   },
   get news() {
      return state.schema.news
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

vi.mock('#cms-config', () => ({
   get default() {
      return state.config
   },
}))

const I18N: CmsI18n = { locales: ['en', 'it'], defaultLocale: 'en' }
const TMP = join(__dirname, '.tmp-content-seed')
const MEDIA_DIR = join(TMP, 'public/images')

function seedConfig(): CmsConfig {
   const sections = {
      hero: {
         label: 'Hero',
         fields: {
            heading: { label: 'Heading', type: 'text', translatable: true, required: true },
            image: { label: 'Image', type: 'media' },
            cta: { label: 'Call to action', type: 'link', withLabel: true },
         },
      },
      columns: {
         label: 'Columns',
         fields: {
            items: {
               label: 'Items',
               type: 'blocks',
               blocks: {
                  card: {
                     label: 'Card',
                     fields: { title: { label: 'Title', type: 'text', required: true } },
                  },
               },
            },
         },
      },
   }
   return normalizeCmsConfig(
      {
         pages: {
            id: 'pages',
            label: 'Pages',
            kind: 'page',
            columns: ['title'],
            pages: [
               { path: '/', key: 'home', label: 'Home' },
               { path: '/about', key: 'about', label: 'About' },
            ],
            fields: {
               title: { label: 'Title', type: 'text', translatable: true },
               cover: { label: 'Cover', type: 'media' },
               body: { label: 'Body', type: 'blocks', blocks: sections },
            },
            overrides: {
               '/about': { founded: { label: 'Founded', type: 'number', integer: true } },
            },
         },
         homepage: {
            id: 'homepage',
            label: 'Homepage',
            kind: 'single',
            fields: {
               heroTitle: { label: 'Hero title', type: 'text', required: true, translatable: true },
               sections: { label: 'Sections', type: 'blocks', blocks: sections },
               featured: {
                  label: 'Featured',
                  type: 'relation',
                  to: 'events',
                  cardinality: 'many-to-many',
               },
            },
         },
         categories: {
            id: 'categories',
            label: 'Categories',
            kind: 'collection',
            titleField: 'name',
            fields: {
               name: { label: 'Name', type: 'text', required: true },
               parent: { label: 'Parent', type: 'relation', to: 'categories' },
            },
         },
         events: {
            id: 'events',
            label: 'Events',
            kind: 'collection',
            titleField: 'title',
            drafts: true,
            fields: {
               title: { label: 'Title', type: 'text', required: true },
               slug: { label: 'Slug', type: 'slug', from: 'title', required: true },
               date: { label: 'Date', type: 'date' },
               visibility: {
                  label: 'Visibility',
                  type: 'select',
                  options: ['public', 'members'],
               },
               poster: { label: 'Poster', type: 'media', translatable: true },
               category: { label: 'Category', type: 'relation', to: 'categories' },
               tags: {
                  label: 'Tags',
                  type: 'relation',
                  to: 'categories',
                  cardinality: 'many-to-many',
               },
               more: { label: 'More', type: 'link', to: ['pages', 'news'] },
            },
         },
         news: {
            id: 'news',
            label: 'News',
            kind: 'content',
            route: '/news/[slug]',
            blocks: {
               text: {
                  label: 'Text',
                  fields: { body: { label: 'Body', type: 'richtext', translatable: true } },
               },
            },
            fields: { category: { label: 'Category', type: 'relation', to: 'categories' } },
         },
      } as unknown as CmsConfig,
      I18N
   )
}

const MEDIA: CmsSeedMedia = { storage: 'local', dir: MEDIA_DIR }

function fullSnapshot(): CmsContentSnapshot {
   return {
      pages: {
         '/': {
            title: { en: 'Home', it: 'Casa' },
            cover: 'hero.webp',
            body: [
               {
                  type: 'hero',
                  heading: { en: 'Welcome', it: 'Benvenuti' },
                  image: 'team/photo.jpg',
                  cta: { url: '/about', label: 'Read more' },
               },
               { type: 'columns', items: [{ type: 'card', title: 'One' }] },
            ],
         },
         '/about': { title: { en: 'About' }, founded: 1999 },
      },
      singles: {
         homepage: {
            heroTitle: { en: 'Hello', it: 'Ciao' },
            sections: [{ type: 'hero', heading: { en: 'Hi' }, hidden: true }],
            featured: ['ev_spring'],
         },
      },
      collections: {
         categories: [
            { id: 'cat_lake', name: 'Lake' },
            { id: 'cat_river', name: 'River', parent: 'cat_lake' },
         ],
         events: [
            {
               id: 'ev_spring',
               title: 'Spring Fair',
               date: '2026-04-01',
               visibility: 'public',
               poster: { en: 'hero.webp', it: 'team/photo.jpg' },
               category: 'cat_lake',
               tags: ['cat_lake', 'cat_river'],
               more: { entry: 'news', id: 'news_launch' },
            },
            { title: 'Night fishing', status: 'draft', more: { entry: 'pages', id: 'about' } },
         ],
      },
      contents: {
         news: [
            {
               id: 'news_launch',
               title: { en: 'Launch', it: 'Lancio' },
               category: 'cat_river',
               body: [{ type: 'text', body: { en: '<p>Hi</p>' } }],
            },
         ],
      },
   }
}

let config: CmsConfig
let db: ReturnType<typeof drizzle>
let schema: Record<string, unknown>

function table(name: string) {
   return schema[name] as SQLiteTable
}

async function rows(name: string) {
   return (await db.select().from(table(name))) as Record<string, unknown>[]
}

function run(snapshot: unknown, mode?: 'replace' | 'merge') {
   return importCmsContent({ db, config, tables: schema, i18n: I18N, media: MEDIA, snapshot, mode })
}

async function readCollection(name: string) {
   const { decodeRows } = await import('../src/runtime/server/utils/registry')
   const { attachManyToMany } = await import('../src/runtime/server/utils/relations')
   const entry = config[name] as CmsEntry
   const found = (await db.select().from(table(name))) as Record<string, unknown>[]
   return decodeRows(entry, await attachManyToMany(db as never, name, entry, found))
}

async function issuesOf(snapshot: unknown) {
   try {
      await run(snapshot)
   } catch (error) {
      expect(error).toBeInstanceOf(CmsContentError)
      return (error as CmsContentError).issues
   }
   throw new Error('expected the import to fail')
}

async function migrate(target: Database.Database, tables: Record<string, unknown>) {
   const { generateSQLiteDrizzleJson, generateSQLiteMigration } = await import('drizzle-kit/api')
   const statements = await generateSQLiteMigration(
      await generateSQLiteDrizzleJson({}),
      await generateSQLiteDrizzleJson(tables)
   )
   for (const statement of statements) target.exec(statement)
   return statements
}

beforeAll(async () => {
   mkdirSync(join(MEDIA_DIR, 'team'), { recursive: true })
   writeFileSync(join(MEDIA_DIR, 'hero.webp'), 'x')
   writeFileSync(join(MEDIA_DIR, 'team/photo.jpg'), 'x')
   config = seedConfig()
   const file = join(TMP, 'schema.ts')
   writeFileSync(file, renderSchemaFile(config, 'sqlite'))
   schema = (await import(file)) as Record<string, unknown>
   const sqlite = new Database(':memory:')
   sqlite.pragma('foreign_keys = ON')
   await migrate(sqlite, schema)
   db = drizzle(sqlite)
   state.db = db
   state.schema = schema
   state.config = config
})

afterAll(() => {
   rmSync(TMP, { recursive: true, force: true })
})

beforeEach(async () => {
   for (const name of [
      'homepage_featured',
      'events_tags',
      'pages_fields',
      'pages_media',
      'pages',
      'homepage',
      'events',
      'news',
      'categories',
   ])
      await db.delete(table(name))
})

describe('content snapshot validation', () => {
   it('lists every issue with its path before writing anything', async () => {
      const issues = await issuesOf({
         pages: {
            '/': { title: 'Home', subtitel: 'x', body: [{ type: 'banner' }, { type: 'hero' }] },
            '/contact': {},
         },
         singles: { homepage: { heroTitle: { en: 'Hi', fr: 'Salut' }, featured: ['ev_missing'] } },
         collections: {
            events: [{ title: 'A', visibility: 'secret', poster: { en: 'missing.webp' } }],
            news: [],
            gallery: [],
         },
         extra: {},
      })
      const byPath = Object.fromEntries(issues.map((issue) => [issue.path, issue.message]))
      expect(byPath.extra).toMatch(/unknown section "extra"/)
      expect(byPath['pages./.title']).toMatch(
         /expected record.*expected an object of strings by locale.*locales: en, it/
      )
      expect(byPath['pages./.subtitel']).toMatch(/unknown field "subtitel"; allowed: "title"/)
      expect(byPath['pages./.body.0.type']).toMatch(
         /unknown block type "banner"; allowed: "hero", "columns"/
      )
      expect(byPath['pages./.body.1.heading']).toMatch(/^Required field; expected an object/)
      expect(byPath['pages./contact']).toMatch(/unknown page path "\/contact"/)
      expect(byPath['singles.homepage.heroTitle']).toBe('unknown locale "fr"; use only "en", "it"')
      expect(byPath['singles.homepage.featured']).toMatch(
         /unknown events id "ev_missing"; declare it with "id" in collections.events/
      )
      expect(byPath['collections.events.0.visibility']).toMatch(
         /expected one of "public"\|"members"/
      )
      expect(byPath['collections.events.0.poster']).toMatch(
         /media "missing.webp" not found in the media library; available: "hero.webp", "team\/photo.jpg"/
      )
      expect(byPath['collections.news']).toBe('news is a content entry; put it under "contents"')
      expect(byPath['collections.gallery']).toMatch(/unknown collection entry "gallery"/)
      expect(Object.keys(byPath)).not.toContain('pages./.body.0')
      expect(await rows('pages')).toEqual([])
   })

   it('checks relation ids, duplicate ids and unique values across the snapshot', async () => {
      const issues = await issuesOf({
         collections: {
            categories: [
               { id: 'cat_a', name: 'A' },
               { id: 'cat_a', name: 'B', parent: 'cat_zzz' },
            ],
            events: [
               { title: 'Same', category: 'cat_a' },
               { title: 'Same', id: 'bad id!' },
            ],
         },
      })
      const byPath = Object.fromEntries(issues.map((issue) => [issue.path, issue.message]))
      expect(byPath['collections.categories.1.id']).toBe('same id as collections.categories.0')
      expect(byPath['collections.categories.1.parent']).toMatch(/unknown categories id "cat_zzz"/)
      expect(byPath['collections.events.1.id']).toMatch(/invalid id/)
      expect(byPath['collections.events.1.slug']).toBe('same value as collections.events.0.slug')
   })

   it('validates without writing and resolves ids against the database in merge mode', async () => {
      await db.insert(table('categories')).values({ id: 'cat_old', name: 'Old' } as never)
      const snapshot = { collections: { events: [{ title: 'A', category: 'cat_old' }] } }
      const base = { config, tables: schema, db, i18n: I18N, snapshot }
      expect(await validateCmsContent({ ...base, mode: 'merge' })).toEqual([])
      expect(await validateCmsContent({ ...base, mode: 'replace' })).toEqual([])
      const replaced = await validateCmsContent({
         ...base,
         snapshot: { ...snapshot, collections: { ...snapshot.collections, categories: [] } },
      })
      expect(replaced).toEqual([
         {
            path: 'collections.events.0.category',
            message:
               'unknown categories id "cat_old"; declare it with "id" in collections.categories (replace mode clears categories)',
         },
      ])
      expect(await rows('events')).toEqual([])
   })
})

describe('content snapshot import', () => {
   it('writes pages, singles, collections and content entries readable by the API', async () => {
      const result = await run(fullSnapshot())
      expect(result.pages).toEqual(['/', '/about'])
      expect(result.singles).toEqual(['homepage'])
      expect(result.collections.categories).toEqual(['cat_lake', 'cat_river'])
      expect(result.collections.events?.[0]).toBe('ev_spring')
      expect(result.collections.events?.[1]).toMatch(/^events_/)
      expect(result.contents.news).toEqual(['news_launch'])

      const { readPages } = await import('../src/runtime/server/utils/page-storage')
      const pages = await readPages('pages', config.pages!, table('pages'), { orderByPath: true })
      expect(pages[0]).toMatchObject({
         id: 'home',
         path: '/',
         title: { en: 'Home', it: 'Casa' },
         cover: 'hero.webp',
         body: [
            {
               type: 'hero',
               heading: { en: 'Welcome', it: 'Benvenuti' },
               image: 'team/photo.jpg',
               cta: { url: '/about', label: 'Read more' },
            },
            { type: 'columns', items: [{ type: 'card', title: 'One' }] },
         ],
      })
      expect(pages[1]).toMatchObject({ id: 'about', title: { en: 'About' }, founded: 1999 })

      const [homepage] = await readCollection('homepage')
      expect(homepage).toMatchObject({
         id: 'homepage',
         heroTitle: { en: 'Hello', it: 'Ciao' },
         sections: [{ type: 'hero', heading: { en: 'Hi' }, hidden: true }],
         featured: ['ev_spring'],
      })

      const categories = await readCollection('categories')
      expect(categories.find((row) => row.id === 'cat_river')?.parent).toBe('cat_lake')

      const events = await readCollection('events')
      const spring = events.find((row) => row.id === 'ev_spring')!
      expect(spring).toMatchObject({
         slug: 'spring-fair',
         status: 'published',
         poster: { en: 'hero.webp', it: 'team/photo.jpg' },
         category: 'cat_lake',
         tags: ['cat_lake', 'cat_river'],
         more: { entry: 'news', id: 'news_launch' },
      })
      expect(events.find((row) => row.id !== 'ev_spring')).toMatchObject({
         slug: 'night-fishing',
         status: 'draft',
      })

      const [news] = await readCollection('news')
      expect(news).toMatchObject({
         id: 'news_launch',
         slug: 'launch',
         status: 'published',
         category: 'cat_river',
      })
      expect(typeof news!.publishedAt).toBe('string')
   })

   it('replaces the rows of the snapshot entries, so a second run gives the same content', async () => {
      await db.insert(table('categories')).values({ id: 'cat_stale', name: 'Stale' } as never)
      const snapshot = fullSnapshot()
      snapshot.collections!.events!.pop()
      await run(snapshot)
      const first = {
         categories: await rows('categories'),
         events: await readCollection('events'),
         fields: await rows('pages_fields'),
      }
      await run(snapshot)
      const second = {
         categories: await rows('categories'),
         events: await readCollection('events'),
         fields: await rows('pages_fields'),
      }
      const stable = (list: Record<string, unknown>[]) =>
         list.map(({ createdAt: _created, updatedAt: _updated, ...rest }) => rest)
      expect(stable(second.categories)).toEqual(stable(first.categories))
      expect(stable(second.events)).toEqual(stable(first.events))
      expect(second.fields).toEqual(first.fields)
      expect(second.categories.map((row) => row.id)).toEqual(['cat_lake', 'cat_river'])
      expect(await rows('events_tags')).toHaveLength(2)
   })

   it('keeps the rows outside the snapshot in merge mode and updates the given ids', async () => {
      await run({ collections: { categories: [{ id: 'cat_a', name: 'A' }] } })
      await run(
         {
            collections: {
               categories: [
                  { id: 'cat_a', name: 'A renamed' },
                  { id: 'cat_b', name: 'B' },
               ],
            },
         },
         'merge'
      )
      const found = await rows('categories')
      expect(found.map((row) => [row.id, row.name])).toEqual([
         ['cat_a', 'A renamed'],
         ['cat_b', 'B'],
      ])
      await run({ collections: { categories: [{ id: 'cat_c', name: 'C' }] } }, 'merge')
      expect(await rows('categories')).toHaveLength(3)
   })

   it('rolls back every write when a statement fails', async () => {
      await run({ collections: { categories: [{ id: 'cat_a', name: 'A' }] } })
      const sqlite = db.$client
      sqlite.exec(
         "CREATE TRIGGER seed_boom BEFORE INSERT ON events WHEN NEW.title = 'boom' BEGIN SELECT RAISE(ABORT, 'boom'); END"
      )
      try {
         await expect(
            run({
               collections: {
                  categories: [{ id: 'cat_b', name: 'B' }],
                  events: [{ title: 'boom' }],
               },
            })
         ).rejects.toThrow(/boom/)
      } finally {
         sqlite.exec('DROP TRIGGER seed_boom')
      }
      expect((await rows('categories')).map((row) => row.id)).toEqual(['cat_a'])
   })
})

describe('seedCmsContent', () => {
   const PROJECT = join(TMP, 'project')

   beforeAll(async () => {
      mkdirSync(join(PROJECT, 'app/pages'), { recursive: true })
      mkdirSync(join(PROJECT, 'public/media'), { recursive: true })
      mkdirSync(join(PROJECT, '.nuxt/cms'), { recursive: true })
      mkdirSync(join(PROJECT, 'server/db/migrations/sqlite/meta'), { recursive: true })
      writeFileSync(join(PROJECT, 'app/pages/index.vue'), '<template><div /></template>\n')
      writeFileSync(join(PROJECT, 'public/media/logo.png'), 'x')
      writeFileSync(
         join(PROJECT, 'nuxt.config.ts'),
         `export default defineNuxtConfig({ cms: { i18n: { locales: ['en', 'it'], defaultLocale: 'en' }, media: { storage: 'local', publicBaseUrl: '/media' } } })\n`
      )
      const projectConfig = `import { defineCmsConfig } from '#nuxt-cms'

export default defineCmsConfig({
   pages: {
      id: 'pages',
      label: 'Pages',
      kind: 'page',
      fields: {
         title: { label: 'Title', type: 'text', translatable: true },
         logo: { label: 'Logo', type: 'media' },
      },
   },
})
`
      writeFileSync(join(PROJECT, 'cms.config.ts'), projectConfig)
      const loaded = normalizeCmsConfig(
         {
            pages: {
               id: 'pages',
               label: 'Pages',
               kind: 'page',
               fields: {
                  title: { label: 'Title', type: 'text', translatable: true },
                  logo: { label: 'Logo', type: 'media' },
               },
            },
         } as unknown as CmsConfig,
         I18N
      )
      const source = renderSchemaFile(loaded, 'sqlite')
      writeFileSync(join(PROJECT, '.nuxt/cms/schema.ts'), source)
      const tables = (await import(join(PROJECT, '.nuxt/cms/schema.ts'))) as Record<string, unknown>
      const statements = await migrate(new Database(':memory:'), tables)
      writeFileSync(
         join(PROJECT, 'server/db/migrations/sqlite/0000_init.sql'),
         statements.join('\n--> statement-breakpoint\n')
      )
      writeFileSync(
         join(PROJECT, 'server/db/migrations/sqlite/meta/_journal.json'),
         JSON.stringify({
            version: '7',
            dialect: 'sqlite',
            entries: [{ idx: 0, version: '6', when: 1000, tag: '0000_init', breakpoints: true }],
         })
      )
      writeFileSync(
         join(PROJECT, 'content.json'),
         JSON.stringify({ pages: { '/': { title: { en: 'Home' }, logo: 'logo.png' } } })
      )
   })

   it('loads the project, migrates and imports a snapshot file', async () => {
      const dbPath = join(PROJECT, 'data/cms.db')
      const options = { root: PROJECT, file: 'content.json', database: { dbPath } }
      const dry = await seedCmsContent({ ...options, dryRun: true })
      expect(dry).toMatchObject({ dryRun: true, pages: ['/'] })
      const result = await seedCmsContent(options)
      expect(result).toMatchObject({ mode: 'replace', dryRun: false, pages: ['/'] })
      const sqlite = new Database(dbPath)
      expect(sqlite.prepare('select id, path from pages').all()).toEqual([
         { id: 'home', path: '/' },
      ])
      expect(sqlite.prepare('select key, value from pages_fields').all()).toEqual([
         { key: 'title', value: '{"en":"Home"}' },
      ])
      expect(sqlite.prepare('select key, media_key from pages_media').all()).toEqual([
         { key: 'logo', media_key: 'logo.png' },
      ])
      sqlite.close()

      await expect(
         seedCmsContent({
            ...options,
            file: undefined,
            snapshot: { pages: { '/': { logo: 'logo.webp' } } },
         })
      ).rejects.toThrow(
         'pages./.logo: media "logo.webp" not found in the media library; did you mean "logo.png"? available: "logo.png"'
      )
   })
})
