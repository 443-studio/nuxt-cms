import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import { createApp, createRouter, toWebHandler } from 'h3'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderSchemaFile } from '../src/schema-codegen'
import type { CmsConfig, CmsI18n } from '../src/runtime/shared/index'
import { normalizeCmsConfig } from '../src/runtime/shared/index'
import type { CmsExportFile, CmsImportPreview } from '../src/runtime/shared/transfer'
import { IMPORT_MAX_BYTES, parseCsv } from '../src/runtime/shared/transfer'

const state = vi.hoisted(() => ({
   db: null as unknown,
   schema: {} as Record<string, unknown>,
   config: {} as Record<string, unknown>,
   user: null as { email: string } | null,
}))

vi.mock('#imports', () => ({
   useRuntimeConfig: () => ({
      cms: { adminEmail: 'admin@example.com' },
      public: { cms: { i18n: { locales: ['en', 'it'], defaultLocale: 'en' } } },
   }),
   getUserSession: async () => (state.user ? { user: state.user } : {}),
}))

vi.mock('#cms-db', async () => {
   const { sql: raw } = await import('drizzle-orm')
   return {
      useDb: () => state.db,
      cmsDialect: 'sqlite',
      runBatch: async (build: (db: unknown) => PromiseLike<unknown>[]) => {
         const db = state.db as ReturnType<typeof drizzle>
         db.run(raw`begin immediate`)
         try {
            const results: unknown[] = []
            for (const statement of build(db)) results.push(await statement)
            db.run(raw`commit`)
            return results
         } catch (error) {
            db.run(raw`rollback`)
            throw error
         }
      },
   }
})

vi.mock('#cms-tables', () => ({
   get categories() {
      return state.schema.categories
   },
   get tags() {
      return state.schema.tags
   },
   get events() {
      return state.schema.events
   },
   get articles() {
      return state.schema.articles
   },
   get articles_tags() {
      return state.schema.articles_tags
   },
   get cms_media() {
      return state.schema.cms_media
   },
   get cms_users() {
      return state.schema.cms_users
   },
}))

vi.mock('#cms-config', () => ({
   get default() {
      return state.config
   },
}))

vi.mock('../src/runtime/server/utils/media-check', () => ({
   mediaLookup: async () => async (keys: string[]) =>
      new Set(keys.filter((key) => key.startsWith('library/'))),
}))

const I18N: CmsI18n = { locales: ['en', 'it'], defaultLocale: 'en' }
const TMP = join(__dirname, '.tmp-collection-transfer')

function transferConfig(): CmsConfig {
   return normalizeCmsConfig(
      {
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
         tags: {
            id: 'tags',
            label: 'Tags',
            kind: 'collection',
            titleField: 'name',
            fields: { name: { label: 'Name', type: 'text', required: true } },
         },
         events: {
            id: 'events',
            label: 'Events',
            kind: 'collection',
            titleField: 'title',
            drafts: true,
            list: { filters: ['visibility', 'featured', 'category', 'status'] },
            fields: {
               title: { label: 'Title', type: 'text', required: true },
               slug: { label: 'Slug', type: 'slug', from: 'title' },
               summary: { label: 'Summary', type: 'text', translatable: true },
               visibility: {
                  label: 'Visibility',
                  type: 'select',
                  options: ['public', { value: 'members', label: 'Club members' }],
               },
               featured: { label: 'Featured', type: 'boolean' },
               seats: { label: 'Seats', type: 'number', integer: true },
               poster: { label: 'Poster', type: 'media' },
               category: { label: 'Category', type: 'relation', to: 'categories' },
            },
            validate: (values) =>
               typeof values.seats === 'number' && values.seats < 0
                  ? [{ field: 'seats', message: 'Seats cannot be negative' }]
                  : [],
         },
         articles: {
            id: 'articles',
            label: 'Articles',
            kind: 'collection',
            titleField: 'title',
            fields: {
               title: { label: 'Title', type: 'text', required: true },
               tags: { label: 'Tags', type: 'relation', to: 'tags', cardinality: 'many-to-many' },
               body: {
                  label: 'Body',
                  type: 'blocks',
                  blocks: {
                     image: {
                        label: 'Image',
                        fields: { image: { label: 'Image', type: 'media' } },
                     },
                  },
               },
            },
         },
      } as CmsConfig,
      I18N
   )
}

let config: CmsConfig
let db: ReturnType<typeof drizzle>
let schema: Record<string, unknown>

function table(name: string) {
   return schema[name] as SQLiteTable
}

async function insert(name: string, values: Record<string, unknown>) {
   await db.insert(table(name)).values(values as never)
}

async function rows(name: string) {
   return (await db.select().from(table(name))) as Record<string, unknown>[]
}

let web: (request: Request) => Promise<Response>

async function handlers() {
   const router = createRouter()
   const list = await import('../src/runtime/server/api/collection.get')
   const exporter = await import('../src/runtime/server/api/collection-export.get')
   const importer = await import('../src/runtime/server/api/collection-import.post')
   router.get('/api/cms/admin/:collection', list.default)
   router.get('/api/cms/export/:collection', exporter.default)
   router.post('/api/cms/import/:collection', importer.default)
   return toWebHandler(createApp().use(router))
}

function get(path: string) {
   return web(new Request(`http://cms.test${path}`, { headers: { host: 'cms.test' } }))
}

function post(path: string, body: string, headers: Record<string, string> = {}) {
   return web(
      new Request(`http://cms.test${path}`, {
         method: 'POST',
         body,
         headers: {
            host: 'cms.test',
            origin: 'http://cms.test',
            'content-type': 'text/plain',
            ...headers,
         },
      })
   )
}

async function preview(path: string, body: string) {
   const response = await post(path, body)
   expect(response.status).toBe(200)
   return (await response.json()) as CmsImportPreview
}

beforeAll(async () => {
   mkdirSync(TMP, { recursive: true })
   config = transferConfig()
   const file = join(TMP, 'schema.ts')
   writeFileSync(file, renderSchemaFile(config, 'sqlite'))
   schema = (await import(file)) as Record<string, unknown>
   const { generateSQLiteDrizzleJson, generateSQLiteMigration } = await import('drizzle-kit/api')
   const statements = await generateSQLiteMigration(
      await generateSQLiteDrizzleJson({}),
      await generateSQLiteDrizzleJson(schema)
   )
   const sqlite = new Database(':memory:')
   sqlite.pragma('foreign_keys = ON')
   for (const statement of statements) sqlite.exec(statement)
   db = drizzle(sqlite)
   state.db = db
   state.schema = schema
   state.config = config
   web = await handlers()

   await insert('categories', { id: 'cat_lake', name: 'Lake' })
   await insert('categories', { id: 'cat_river', name: 'River' })
   await insert('tags', { id: 'tag_a', name: 'A' })
   await insert('events', {
      id: 'ev_1',
      title: 'Spring fair',
      slug: 'spring-fair',
      summary: { en: 'By the lake', it: 'Sul lago' },
      visibility: 'members',
      featured: true,
      seats: 40,
      category: 'cat_lake',
      status: 'published',
      createdAt: '2026-01-03T00:00:00.000Z',
   })
   await insert('events', {
      id: 'ev_2',
      title: 'Night fishing',
      slug: 'night-fishing',
      visibility: 'public',
      featured: false,
      category: 'cat_river',
      status: 'draft',
      createdAt: '2026-01-02T00:00:00.000Z',
   })
   await insert('events', {
      id: 'ev_3',
      title: 'Members dinner',
      slug: 'members-dinner',
      visibility: 'members',
      category: 'cat_river',
      status: 'published',
      createdAt: '2026-01-01T00:00:00.000Z',
   })
})

afterAll(() => {
   rmSync(TMP, { recursive: true, force: true })
})

beforeEach(() => {
   state.user = { email: 'admin@example.com' }
})

describe('list filters endpoint', () => {
   async function ids(query: string) {
      const response = await get(`/api/cms/admin/events?${query}`)
      expect(response.status).toBe(200)
      const body = (await response.json()) as { items: { id: string }[]; total: number }
      return { ids: body.items.map((item) => item.id), total: body.total }
   }

   it('filters by a select value', async () => {
      expect(await ids('filter.visibility=members')).toEqual({ ids: ['ev_1', 'ev_3'], total: 2 })
   })

   it('treats an empty boolean as false', async () => {
      expect(await ids('filter.featured=false')).toEqual({ ids: ['ev_2', 'ev_3'], total: 2 })
      expect(await ids('filter.featured=true')).toEqual({ ids: ['ev_1'], total: 1 })
   })

   it('combines filters, search, sort and pagination', async () => {
      expect(await ids('filter.category=cat_river&filter.status=published&search=dinner')).toEqual({
         ids: ['ev_3'],
         total: 1,
      })
      expect(await ids('filter.visibility=members&sort=title&order=asc&limit=1&offset=1')).toEqual({
         ids: ['ev_1'],
         total: 2,
      })
   })

   it('rejects unknown filters and values', async () => {
      expect((await get('/api/cms/admin/events?filter.seats=4')).status).toBe(400)
      expect((await get('/api/cms/admin/events?filter.visibility=secret')).status).toBe(400)
   })
})

describe('export endpoint', () => {
   it('requires an admin session', async () => {
      state.user = null
      expect((await get('/api/cms/export/events')).status).toBe(401)
      state.user = { email: 'someone@example.com' }
      expect((await get('/api/cms/export/events')).status).toBe(403)
   })

   it('exports every row as JSON', async () => {
      const response = await get('/api/cms/export/events')
      expect(response.headers.get('content-disposition')).toMatch(
         /^attachment; filename="events-\d{4}-\d{2}-\d{2}\.json"$/
      )
      const file = (await response.json()) as CmsExportFile
      expect(file.collection).toBe('events')
      expect(file.total).toBe(3)
      expect(file.items[0]).toMatchObject({
         id: 'ev_1',
         title: 'Spring fair',
         summary: { en: 'By the lake', it: 'Sul lago' },
         featured: true,
         status: 'published',
         createdAt: '2026-01-03T00:00:00.000Z',
      })
   })

   it('exports the filtered set as CSV with locale columns', async () => {
      const response = await get('/api/cms/export/events?format=csv&filter.visibility=members')
      expect(response.headers.get('content-type')).toContain('text/csv')
      const [header, ...lines] = parseCsv(await response.text())
      expect(header!.slice(0, 5)).toEqual(['id', 'title', 'slug', 'summary.en', 'summary.it'])
      expect(lines.map((line) => line[0])).toEqual(['ev_1', 'ev_3'])
      expect(lines[0]!.slice(3, 5)).toEqual(['By the lake', 'Sul lago'])
   })

   it('refuses CSV for an entry with blocks or many-to-many fields', async () => {
      expect((await get('/api/cms/export/articles?format=csv')).status).toBe(400)
   })
})

describe('import endpoint', () => {
   it('requires an admin session and a same-origin request', async () => {
      state.user = null
      expect((await post('/api/cms/import/tags?format=json', '[]')).status).toBe(401)
      state.user = { email: 'admin@example.com' }
      const response = await web(
         new Request('http://cms.test/api/cms/import/tags?format=json', {
            method: 'POST',
            body: '[]',
            headers: { host: 'cms.test', origin: 'http://evil.test' },
         })
      )
      expect(response.status).toBe(403)
   })

   it('refuses files over the size limit', async () => {
      const response = await post(
         '/api/cms/import/tags?format=json',
         'x'.repeat(IMPORT_MAX_BYTES + 1)
      )
      expect(response.status).toBe(413)
   })

   it('previews per-row errors without writing', async () => {
      const result = await preview(
         '/api/cms/import/events?format=json',
         JSON.stringify([
            { title: 'Ok', slug: 'ok-event', visibility: 'public' },
            { title: '', seats: -1 },
            { title: 'Clash', slug: 'spring-fair' },
            { title: 'Lost', category: 'cat_nope', poster: 'uploads/missing.png' },
            { id: 'ev_1', title: 'Again' },
            { title: 'Twin', slug: 'ok-event' },
         ])
      )
      expect(result).toMatchObject({ total: 6, valid: 1, create: 1, update: 0, imported: false })
      const errors = result.rows.map((row) => row.errors.map((issue) => issue.path))
      expect(errors).toEqual([
         [],
         ['title', 'seats'],
         ['slug'],
         ['category', 'poster'],
         ['id'],
         ['slug'],
      ])
      expect(result.rows[1]!.errors[1]!.message).toBe('Seats cannot be negative')
      expect(result.rows[4]!.errors[0]!.message).toBe('An entry with this id already exists')
      expect((await rows('events')).length).toBe(3)
   })

   it('refuses to write a file with errors', async () => {
      const response = await post(
         '/api/cms/import/tags?format=json&dryRun=false',
         JSON.stringify([{ name: '' }])
      )
      expect(response.status).toBe(400)
      expect((await rows('tags')).length).toBe(1)
   })

   it('creates rows from CSV, as drafts by default', async () => {
      const csv = [
         'title,slug,summary.en,summary.it,visibility,featured,category,poster',
         'Autumn walk,autumn-walk,Leaves,Foglie,members,yes,cat_lake,library/autumn.webp',
         'Ice fishing,,,,public,no,,',
      ].join('\r\n')
      const check = await preview('/api/cms/import/events?format=csv', csv)
      expect(check).toMatchObject({ total: 2, valid: 2, create: 2 })
      expect(check.rows.map((row) => row.title)).toEqual(['Autumn walk', 'Ice fishing'])
      const done = await preview('/api/cms/import/events?format=csv&dryRun=false', csv)
      expect(done.imported).toBe(true)
      const stored = (await rows('events')).filter((row) =>
         ['Autumn walk', 'Ice fishing'].includes(String(row.title))
      )
      expect(stored).toHaveLength(2)
      expect(stored.find((row) => row.title === 'Autumn walk')).toMatchObject({
         summary: { en: 'Leaves', it: 'Foglie' },
         featured: true,
         status: 'draft',
         poster: 'library/autumn.webp',
         category: 'cat_lake',
      })
   })

   it('updates by id in upsert mode and keeps ids', async () => {
      const body = JSON.stringify({
         items: [
            {
               id: 'ev_2',
               title: 'Night fishing',
               slug: 'night-fishing',
               seats: 12,
               status: 'published',
            },
            { id: 'ev_new', title: 'New one', slug: 'new-one' },
         ],
      })
      const created = await preview('/api/cms/import/events?format=json&mode=create', body)
      expect(created.rows[0]!.errors[0]!.message).toBe('An entry with this id already exists')
      const upsert = await preview(
         '/api/cms/import/events?format=json&mode=upsert&dryRun=false',
         body
      )
      expect(upsert).toMatchObject({ create: 1, update: 1, imported: true })
      const stored = await rows('events')
      expect(stored.find((row) => row.id === 'ev_2')).toMatchObject({
         seats: 12,
         status: 'published',
      })
      expect(stored.find((row) => row.id === 'ev_new')).toMatchObject({ title: 'New one' })
   })

   it('links rows that point at each other in the same file', async () => {
      const result = await preview(
         '/api/cms/import/categories?format=json&dryRun=false',
         JSON.stringify([
            { id: 'cat_child', name: 'Child', parent: 'cat_parent' },
            { id: 'cat_parent', name: 'Parent' },
         ])
      )
      expect(result.imported).toBe(true)
      const stored = await rows('categories')
      expect(stored.find((row) => row.id === 'cat_child')).toMatchObject({ parent: 'cat_parent' })
   })

   it('round-trips blocks and many-to-many lists through JSON', async () => {
      const item = {
         id: 'art_1',
         title: 'Gallery',
         tags: ['tag_a'],
         body: [{ type: 'image', image: 'library/one.webp' }],
      }
      await preview('/api/cms/import/articles?format=json&dryRun=false', JSON.stringify([item]))
      const exported = (await (await get('/api/cms/export/articles')).json()) as CmsExportFile
      expect(exported.items[0]).toMatchObject(item)
      const broken = await preview(
         '/api/cms/import/articles?format=json',
         JSON.stringify([
            { title: 'Bad', tags: ['tag_nope'], body: [{ type: 'image', image: 'x.png' }] },
         ])
      )
      expect(broken.rows[0]!.errors.map((issue) => issue.path)).toEqual(['tags', 'body[0].image'])
   })

   it('rolls back every row when a write fails', async () => {
      const before = (await rows('tags')).length
      db.run(
         sql`create trigger fail_tag before insert on tags when new.name = 'Boom' begin select raise(abort, 'boom'); end`
      )
      const response = await post(
         '/api/cms/import/tags?format=json&dryRun=false',
         JSON.stringify([{ name: 'Fine' }, { name: 'Boom' }])
      )
      db.run(sql`drop trigger fail_tag`)
      expect(response.status).toBe(500)
      expect((await rows('tags')).length).toBe(before)
   })

   it('refuses an unknown format and CSV for entries that are not flat', async () => {
      expect((await post('/api/cms/import/articles?format=csv', 'title\nx')).status).toBe(400)
      expect((await post('/api/cms/import/events?format=xml', '[]')).status).toBe(400)
   })
})
