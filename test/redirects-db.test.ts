import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { renderSchemaFile } from '../src/schema-codegen'
import type { CmsConfig, CmsI18n } from '../src/runtime/shared/index'
import { normalizeCmsConfig } from '../src/runtime/shared/index'

const state = vi.hoisted(() => ({
   db: null as unknown,
   schema: {} as Record<string, unknown>,
   config: {} as Record<string, unknown>,
}))

vi.mock('#imports', () => ({
   useRuntimeConfig: () => ({
      cms: { media: { storage: 's3' } },
      public: { cms: { i18n: { locales: ['en', 'it'], defaultLocale: 'en' } } },
   }),
}))

vi.mock('#cms-db', () => ({
   useDb: () => state.db,
   cmsDialect: 'sqlite',
   runBatch: async (build: (db: unknown) => PromiseLike<unknown>[]) => {
      const results: unknown[] = []
      for (const statement of build(state.db)) results.push(await statement)
      return results
   },
}))

vi.mock('#cms-tables', () => ({
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
   get cms_redirects() {
      return state.schema.cms_redirects
   },
}))

vi.mock('#cms-config', () => ({
   get default() {
      return state.config
   },
}))

const I18N: CmsI18n = { locales: ['en', 'it'], defaultLocale: 'en' }
const TMP = join(__dirname, '.tmp-redirects')

function config(): CmsConfig {
   return normalizeCmsConfig(
      {
         blog: {
            id: 'blog',
            label: 'Blog',
            kind: 'content',
            blocks: { text: { label: 'Text', fields: { body: { label: 'Body', type: 'text' } } } },
            route: { en: '/blog/[slug]', it: '/it/blog/[slug]' },
         },
         pages: {
            id: 'pages',
            label: 'Pages',
            kind: 'page',
            pages: ['/', '/about', '/news/[slug]'].map((path) => ({
               path,
               key: path,
               label: path,
            })),
            fields: { title: { label: 'Title', type: 'text' } },
         },
      } as unknown as CmsConfig,
      I18N
   )
}

describe('redirects with a database', () => {
   let redirects: typeof import('../src/runtime/server/utils/redirects')
   let blog: SQLiteTable

   async function save(id: string, values: Record<string, unknown>) {
      const [before] = (await (state.db as ReturnType<typeof drizzle>)
         .select()
         .from(blog)
         .where(eq((blog as unknown as { id: never }).id, id as never))) as Record<
         string,
         unknown
      >[]
      const entry = (state.config as CmsConfig).blog!
      const plan = await redirects.planContentRedirects(
         redirects.contentMovesOf(entry, before, { ...before, ...values })
      )
      const db = state.db as ReturnType<typeof drizzle>
      await db
         .update(blog)
         .set(values as never)
         .where(eq((blog as unknown as { id: never }).id, id as never))
      if (plan) {
         for (const statement of redirects.redirectPlanStatements(db as never, plan))
            await statement
         redirects.invalidateRedirects()
      }
   }

   async function table() {
      const map = await redirects.readRedirectTable()
      return Object.fromEntries([...map].map(([from, target]) => [from, target.to]))
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
      blog = tables.blog as SQLiteTable
      const post = (id: string, slug: string, extra: Record<string, unknown> = {}) => ({
         id,
         title: { en: id },
         slug,
         status: 'published',
         publishedAt: '2026-01-01T08:00:00.000Z',
         ...extra,
      })
      await (state.db as ReturnType<typeof drizzle>)
         .insert(blog)
         .values([
            post('p1', 'first'),
            post('p2', 'second'),
            post('draft', 'draft-post', { status: 'draft' }),
         ] as never)
      redirects = await import('../src/runtime/server/utils/redirects')
   })

   afterAll(() => {
      rmSync(TMP, { recursive: true, force: true })
   })

   it('creates the redirects table with the other system tables', () => {
      expect(state.schema.cms_redirects).toBeDefined()
   })

   it('writes a 301 from every old locale path when the slug of a live item changes', async () => {
      await save('p1', { slug: 'first-moved' })
      expect(await table()).toEqual({
         '/blog/first': '/blog/first-moved',
         '/it/blog/first': '/it/blog/first-moved',
      })
      const list = await redirects.listRedirects()
      expect(list.every((redirect) => redirect.source === 'auto' && redirect.status === 301)).toBe(
         true
      )
   })

   it('collapses the chain on the next move', async () => {
      await save('p1', { slug: 'first-final' })
      expect(await table()).toEqual({
         '/blog/first': '/blog/first-final',
         '/blog/first-moved': '/blog/first-final',
         '/it/blog/first': '/it/blog/first-final',
         '/it/blog/first-moved': '/it/blog/first-final',
      })
   })

   it('drops the redirect from a path that is live again when the item moves back', async () => {
      await save('p1', { slug: 'first' })
      expect(await table()).toEqual({
         '/blog/first-moved': '/blog/first',
         '/blog/first-final': '/blog/first',
         '/it/blog/first-moved': '/it/blog/first',
         '/it/blog/first-final': '/it/blog/first',
      })
   })

   it('leaves no redirect for drafts or for an item being unpublished', async () => {
      await save('draft', { slug: 'draft-moved' })
      await save('p2', { slug: 'second-hidden', status: 'draft' })
      expect(Object.keys(await table())).not.toContain('/blog/draft-post')
      expect(Object.keys(await table())).not.toContain('/blog/second')
   })

   it('lets a live page or item win over a redirect', async () => {
      expect(await redirects.isLivePath('/blog/first')).toBe(true)
      expect(await redirects.isLivePath('/it/blog/first/')).toBe(true)
      expect(await redirects.isLivePath('/about')).toBe(true)
      expect(await redirects.isLivePath('/blog/first-moved')).toBe(false)
      expect(await redirects.isLivePath('/blog/draft-moved')).toBe(false)
      expect(await redirects.isLivePath('/news/anything')).toBe(false)
   })

   it('validates manual redirects against the stored ones', async () => {
      const created = await redirects.createRedirect({ from: '/promo/', to: '/blog/first' })
      expect(created).toMatchObject({ from: '/promo', status: 301, source: 'manual' })
      await expect(redirects.createRedirect({ from: '/promo', to: '/x' })).rejects.toMatchObject({
         statusCode: 409,
      })
      await expect(
         redirects.createRedirect({ from: '/blog/first', to: '/blog/first-moved' })
      ).rejects.toMatchObject({
         statusCode: 400,
         message: 'This redirect makes a loop: /blog/first → /blog/first-moved → /blog/first',
      })
      const updated = await redirects.updateRedirect(created.id, {
         from: '/promo',
         to: 'https://example.com/sale',
         status: 302,
         keepQuery: false,
      })
      expect(updated).toMatchObject({ to: 'https://example.com/sale', status: 302 })
      expect((await redirects.readRedirectTable()).get('/promo')).toEqual({
         to: 'https://example.com/sale',
         status: 302,
         keepQuery: false,
      })
      expect(await redirects.deleteRedirects([created.id])).toBe(1)
      expect((await redirects.readRedirectTable()).has('/promo')).toBe(false)
   })

   it('imports redirects as one set, updating those with the same from', async () => {
      const result = await redirects.importRedirects([
         { from: '/old-a', to: '/new-a' },
         { from: '/blog/first-moved', to: '/elsewhere', status: 308 },
      ])
      expect(result).toEqual({ created: 1, updated: 1 })
      expect((await table())['/blog/first-moved']).toBe('/elsewhere')
      await expect(
         redirects.importRedirects([
            { from: '/loop-a', to: '/loop-b' },
            { from: '/loop-b', to: '/loop-a' },
            { from: 'no-slash', to: '/x' },
         ])
      ).rejects.toMatchObject({
         statusCode: 400,
         message: 'Row 3: From must be a path starting with /, without a host',
      })
      await expect(
         redirects.importRedirects([
            { from: '/loop-a', to: '/loop-b' },
            { from: '/loop-b/', to: '/loop-a' },
         ])
      ).rejects.toMatchObject({ statusCode: 400 })
      expect((await table())['/loop-a']).toBeUndefined()
   })
})
