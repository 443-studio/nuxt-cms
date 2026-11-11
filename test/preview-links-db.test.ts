import { createHash } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import { createYoga } from 'graphql-yoga'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { contentRouteQuery } from '../src/queries-codegen'
import { renderSchemaFile } from '../src/schema-codegen'
import type { CmsConfig, CmsI18n, CmsPreviewGrant } from '../src/runtime/shared/index'
import { PREVIEW_QUERY_PARAM, normalizeCmsConfig } from '../src/runtime/shared/index'

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
   get cms_media() {
      return state.schema.cms_media
   },
   get cms_preview_links() {
      return state.schema.cms_preview_links
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
const TMP = join(__dirname, '.tmp-preview-links')

function config(): CmsConfig {
   return normalizeCmsConfig(
      {
         news: {
            id: 'news',
            label: 'News',
            kind: 'content',
            blocks: {
               text: { label: 'Text', fields: { body: { label: 'Body', type: 'text' } } },
            },
            route: { en: '/news/[slug]', it: '/notizie/[slug]' },
         },
      } as unknown as CmsConfig,
      I18N
   )
}

const USER = { email: 'editor@example.com', name: null, role: 'admin' as const }

describe('preview links with a database', () => {
   let links: typeof import('../src/runtime/server/utils/preview-links')
   let graphqlUtils: typeof import('../src/runtime/server/utils/graphql')
   let previewTable: SQLiteTable
   let access: Awaited<ReturnType<(typeof links)['requirePreviewLinkAccess']>>

   function db() {
      return state.db as ReturnType<typeof drizzle>
   }

   function tokenOf(url: string) {
      return new URL(url, 'http://site.test').searchParams.get(PREVIEW_QUERY_PARAM)!
   }

   async function run(
      query: string,
      variables: Record<string, unknown> = {},
      preview: CmsPreviewGrant | null = null
   ) {
      const yoga = createYoga({
         schema: graphqlUtils.buildCmsSchema(),
         context: () => graphqlUtils.createGraphqlContext(preview),
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
      state.db = drizzle(sqlite)
      state.schema = tables
      state.config = cmsConfig
      previewTable = tables.cms_preview_links as SQLiteTable
      const item = (id: string, slug: string, extra: Record<string, unknown> = {}) => ({
         id,
         title: { en: id, it: `${id} (it)` },
         slug,
         status: 'published',
         publishedAt: '2026-01-01T08:00:00.000Z',
         ...extra,
      })
      await db()
         .insert(tables.news as SQLiteTable)
         .values([
            item('live', 'live'),
            item('draft', 'draft-post', { status: 'draft', publishedAt: null }),
            item('other', 'other-draft', { status: 'draft' }),
            item('later', 'later', { publishedAt: '2999-01-01T00:00:00.000Z' }),
         ] as never)
      links = await import('../src/runtime/server/utils/preview-links')
      graphqlUtils = await import('../src/runtime/server/utils/graphql')
      access = { user: USER, name: 'news', entry: (state.config as CmsConfig).news! }
   })

   afterAll(() => rmSync(TMP, { recursive: true, force: true }))

   it('makes 32 byte base64url tokens and hashes them with sha-256', () => {
      const token = links.createPreviewToken()
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(Buffer.from(token, 'base64url')).toHaveLength(32)
      expect(links.createPreviewToken()).not.toBe(token)
      expect(links.hashPreviewToken(token)).toBe(createHash('sha256').update(token).digest('hex'))
   })

   it('creates a link to the path of a never published item and stores only the hash', async () => {
      const created = await links.createPreviewLink(access, 'draft', {
         duration: '1d',
         locale: 'it',
      })
      expect(created.url).toMatch(/^\/notizie\/draft-post\?cms-preview=[A-Za-z0-9_-]{43}$/)
      expect(created.link).toMatchObject({
         entry: 'news',
         itemId: 'draft',
         locale: 'it',
         path: '/notizie/draft-post',
         createdBy: USER.email,
      })
      const token = tokenOf(created.url)
      const rows = await db().select().from(previewTable)
      const stored = JSON.stringify(rows)
      expect(stored).not.toContain(token)
      expect(stored).toContain(links.hashPreviewToken(token))
      const expires = Date.parse(created.link.expiresAt) - Date.now()
      expect(expires).toBeGreaterThan(23 * 3_600_000)
      expect(expires).toBeLessThanOrEqual(24 * 3_600_000)
   })

   it('resolves a valid token to its item and refuses unknown ones', async () => {
      const { url } = await links.createPreviewLink(access, 'draft', { duration: '1h' })
      const grant = await links.findPreviewGrant(tokenOf(url))
      expect(grant).toMatchObject({ entry: 'news', itemId: 'draft' })
      expect(await links.findPreviewGrant(links.createPreviewToken())).toBeNull()
      expect(await links.findPreviewGrant(null)).toBeNull()
   })

   it('ignores expired and revoked links', async () => {
      const expired = await links.createPreviewLink(access, 'draft', { duration: '1h' })
      await db()
         .update(previewTable)
         .set({ expiresAt: '2020-01-01T00:00:00.000Z' } as never)
         .where(eq((previewTable as unknown as { id: never }).id, expired.link.id as never))
      expect(await links.findPreviewGrant(tokenOf(expired.url))).toBeNull()

      const revoked = await links.createPreviewLink(access, 'draft', { duration: '7d' })
      await links.revokePreviewLink(access, 'draft', revoked.link.id)
      expect(await links.findPreviewGrant(tokenOf(revoked.url))).toBeNull()
      await expect(links.revokePreviewLink(access, 'draft', revoked.link.id)).rejects.toThrow(
         'Preview link not found'
      )
      const active = await links.listPreviewLinks(access, 'draft')
      expect(active.map((link) => link.id)).not.toContain(revoked.link.id)
      expect(active.map((link) => link.id)).not.toContain(expired.link.id)
      expect(active.every((link) => link.path.endsWith('/draft-post'))).toBe(true)
   })

   it('refuses unknown items, unknown locales and revoking from another item', async () => {
      await expect(links.createPreviewLink(access, 'missing', { duration: '1h' })).rejects.toThrow(
         'Item not found'
      )
      await expect(
         links.createPreviewLink(access, 'draft', { duration: '1h', locale: 'fr' })
      ).rejects.toThrow('Unknown locale: fr')
      const { link } = await links.createPreviewLink(access, 'draft', { duration: '1h' })
      await expect(links.revokePreviewLink(access, 'other', link.id)).rejects.toThrow(
         'Preview link not found'
      )
   })

   it('accepts only the listed durations', () => {
      expect(links.previewLinkInputSchema.safeParse({ duration: '30d' }).success).toBe(true)
      expect(links.previewLinkInputSchema.safeParse({ duration: '60d' }).success).toBe(false)
      expect(links.previewLinkInputSchema.safeParse({ duration: '1h', token: 'x' }).success).toBe(
         false
      )
   })

   it('shows the draft only for the item of the grant', async () => {
      const grant: CmsPreviewGrant = {
         entry: 'news',
         itemId: 'draft',
         expiresAt: '2999-01-01T00:00:00.000Z',
      }
      const query = `{
         byPath: newsByPath(path: "/notizie/draft-post", locale: "it") { id title path }
         bySlug: newsBySlug(slug: "draft-post") { id }
         byId: newsById(id: "draft") { id }
         other: newsBySlug(slug: "other-draft") { id }
         list: news { id }
         count: newsCount
      }`
      const anonymous = await run(query)
      expect(anonymous).toMatchObject({ byPath: null, bySlug: null, byId: null, other: null })
      const previewed = await run(query, {}, grant)
      expect(previewed).toEqual({
         byPath: { id: 'draft', title: 'draft (it)', path: '/notizie/draft-post' },
         bySlug: { id: 'draft' },
         byId: { id: 'draft' },
         other: null,
         list: [{ id: 'live' }],
         count: 1,
      })
      const wrongEntry = await run(query, {}, { ...grant, entry: 'blog' })
      expect(wrongEntry).toMatchObject({ byPath: null, bySlug: null, byId: null })
   })

   it('shows a scheduled item through the route query', async () => {
      const query = contentRouteQuery(state.config as CmsConfig)!
      const grant = { entry: 'news', itemId: 'later', expiresAt: '2999-01-01T00:00:00.000Z' }
      expect((await run(query, { path: '/news/later' })).news).toBeNull()
      const data = await run(query, { path: '/news/later' }, grant)
      expect((data.news as Record<string, unknown>).id).toBe('later')
   })

   it('deletes the links of a deleted item', async () => {
      await links.createPreviewLink(access, 'other', { duration: '1h' })
      await links.deleteItemPreviewLinksStatement(db() as never, 'news', 'draft')
      const rows = (await db().select().from(previewTable)) as { itemId: string }[]
      expect(rows.some((row) => row.itemId === 'draft')).toBe(false)
      expect(rows.some((row) => row.itemId === 'other')).toBe(true)
   })

   it('prunes expired links when a new one is created', async () => {
      const old = await links.createPreviewLink(access, 'other', { duration: '1h' })
      await db()
         .update(previewTable)
         .set({ expiresAt: '2020-01-01T00:00:00.000Z' } as never)
         .where(eq((previewTable as unknown as { id: never }).id, old.link.id as never))
      await links.createPreviewLink(access, 'other', { duration: '1h' })
      const rows = (await db().select().from(previewTable)) as { id: string }[]
      expect(rows.some((row) => row.id === old.link.id)).toBe(false)
   })
})
