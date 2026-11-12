import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import { createApp, createRouter, toWebHandler } from 'h3'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderSchemaFile } from '../src/schema-codegen'
import type { CmsConfig } from '../src/runtime/shared/index'
import { normalizeCmsConfig } from '../src/runtime/shared/index'
import type { CmsImportPreview } from '../src/runtime/shared/transfer'

const state = vi.hoisted(() => ({
   db: null as unknown,
   schema: {} as Record<string, unknown>,
   config: {} as Record<string, unknown>,
}))

vi.mock('#imports', () => ({
   useRuntimeConfig: () => ({
      cms: { adminEmail: 'admin@example.com' },
      public: { cms: { i18n: { locales: ['en', 'it'], defaultLocale: 'en' } } },
   }),
   getUserSession: async () => ({ user: { email: 'admin@example.com' } }),
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
   get codes() {
      return state.schema.codes
   },
   get site() {
      return state.schema.site
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

vi.mock('#cms-roles', () => ({ default: {} }))

vi.mock('../src/runtime/server/utils/media-check', () => ({
   mediaLookup: async () => async () => new Set<string>(),
   assertMediaExists: async () => undefined,
}))

const TMP = join(__dirname, '.tmp-field-rules')

function rulesConfig(): CmsConfig {
   return normalizeCmsConfig(
      {
         codes: {
            id: 'codes',
            label: 'Codes',
            kind: 'collection',
            titleField: 'name',
            fields: {
               name: { label: 'Name', type: 'text', required: true },
               code: { label: 'Code', type: 'text', unique: true, immutable: true, max: 8 },
               rank: { label: 'Rank', type: 'number', integer: true, unique: true, min: 0 },
               level: {
                  label: 'Level',
                  type: 'select',
                  options: ['basic', 'pro'],
                  default: 'basic',
               },
               active: { label: 'Active', type: 'boolean', default: true },
               summary: { label: 'Summary', type: 'text', translatable: true, default: 'Hi' },
               opens: { label: 'Opens', type: 'datetime', default: 'now' },
            },
         },
         site: {
            id: 'site',
            label: 'Site',
            kind: 'single',
            fields: {
               founded: { label: 'Founded', type: 'number', immutable: true },
               motto: { label: 'Motto', type: 'text', default: 'Fish on' },
            },
         },
      } as CmsConfig,
      { locales: ['en', 'it'] }
   )
}

let web: (request: Request) => Promise<Response>

function send(method: string, path: string, body: unknown, type = 'application/json') {
   return web(
      new Request(`http://cms.test${path}`, {
         method,
         body: typeof body === 'string' ? body : JSON.stringify(body),
         headers: { host: 'cms.test', origin: 'http://cms.test', 'content-type': type },
      })
   )
}

async function json(response: Response) {
   return (await response.json()) as Record<string, unknown> & {
      data?: { issues?: { path: unknown[]; message: string }[] }
   }
}

beforeAll(async () => {
   mkdirSync(TMP, { recursive: true })
   const config = rulesConfig()
   const file = join(TMP, 'schema.ts')
   writeFileSync(file, renderSchemaFile(config, 'sqlite'))
   const schema = (await import(file)) as Record<string, unknown>
   const { generateSQLiteDrizzleJson, generateSQLiteMigration } = await import('drizzle-kit/api')
   const statements = await generateSQLiteMigration(
      await generateSQLiteDrizzleJson({}),
      await generateSQLiteDrizzleJson(schema)
   )
   const sqlite = new Database(':memory:')
   for (const statement of statements) sqlite.exec(statement)
   state.db = drizzle(sqlite)
   state.schema = schema
   state.config = config
   const router = createRouter()
   router.post(
      '/api/cms/admin/:collection',
      (await import('../src/runtime/server/api/collection.post')).default
   )
   router.put(
      '/api/cms/admin/:collection',
      (await import('../src/runtime/server/api/collection.put')).default
   )
   router.put(
      '/api/cms/admin/:collection/:id',
      (await import('../src/runtime/server/api/item.put')).default
   )
   router.post(
      '/api/cms/import/:collection',
      (await import('../src/runtime/server/api/collection-import.post')).default
   )
   web = toWebHandler(createApp().use(router))
})

afterAll(() => {
   rmSync(TMP, { recursive: true, force: true })
})

beforeEach(async () => {
   const db = state.db as ReturnType<typeof drizzle>
   await db.delete(state.schema.codes as SQLiteTable)
   await db.delete(state.schema.site as SQLiteTable)
})

describe('defaults on create', () => {
   it('fills the keys a create request leaves out', async () => {
      const response = await send('POST', '/api/cms/admin/codes', { name: 'Alpha', level: 'pro' })
      expect(response.status).toBe(200)
      const item = await json(response)
      expect(item).toMatchObject({ level: 'pro', active: true, summary: { en: 'Hi' } })
      expect(typeof item.opens).toBe('string')
   })

   it('keeps an explicit null', async () => {
      const item = await json(
         await send('POST', '/api/cms/admin/codes', { name: 'B', active: null })
      )
      expect(item.active).toBeNull()
   })

   it('fills a single on its first save only', async () => {
      expect((await json(await send('PUT', '/api/cms/admin/site', {}))).motto).toBe('Fish on')
      expect((await json(await send('PUT', '/api/cms/admin/site', {}))).motto).toBeNull()
   })
})

describe('unique values', () => {
   it('maps a duplicate value to the field with 409', async () => {
      await send('POST', '/api/cms/admin/codes', { name: 'A', code: 'X1', rank: 1 })
      const response = await send('POST', '/api/cms/admin/codes', {
         name: 'B',
         code: 'X1',
         rank: 1,
      })
      expect(response.status).toBe(409)
      expect((await json(response)).data?.issues).toEqual([
         { path: ['code'], message: 'This value is already used by another entry' },
         { path: ['rank'], message: 'This value is already used by another entry' },
      ])
   })

   it('lets an item keep its own value and stores blanks as null', async () => {
      const first = await json(await send('POST', '/api/cms/admin/codes', { name: 'A', code: '' }))
      const second = await send('POST', '/api/cms/admin/codes', { name: 'B', code: ' ' })
      expect(second.status).toBe(200)
      expect(first.code).toBeNull()
      const own = await json(await send('POST', '/api/cms/admin/codes', { name: 'C', code: 'K9' }))
      const update = await send('PUT', `/api/cms/admin/codes/${own.id}`, { name: 'C2', code: 'K9' })
      expect(update.status).toBe(200)
   })

   it('reports validation issues with their path', async () => {
      const response = await send('POST', '/api/cms/admin/codes', {
         name: 'A',
         code: 'TOOLONGCODE',
         rank: -1,
      })
      expect(response.status).toBe(400)
      expect((await json(response)).data?.issues).toEqual([
         { path: ['code'], message: 'Use at most 8 characters' },
         { path: ['rank'], message: 'Must be at least 0' },
      ])
   })
})

describe('immutable values', () => {
   it('refuses to change a saved value', async () => {
      const item = await json(await send('POST', '/api/cms/admin/codes', { name: 'A', code: 'Q1' }))
      const response = await send('PUT', `/api/cms/admin/codes/${item.id}`, {
         name: 'A',
         code: 'Q2',
      })
      expect(response.status).toBe(400)
      expect((await json(response)).data?.issues).toEqual([
         { path: ['code'], message: 'This value cannot be changed once saved' },
      ])
      expect(
         (await send('PUT', `/api/cms/admin/codes/${item.id}`, { name: 'B', code: 'Q1' })).status
      ).toBe(200)
   })

   it('lets an empty value be filled once', async () => {
      const item = await json(await send('POST', '/api/cms/admin/codes', { name: 'A' }))
      expect(
         (await send('PUT', `/api/cms/admin/codes/${item.id}`, { name: 'A', code: 'Z1' })).status
      ).toBe(200)
      expect(
         (await send('PUT', `/api/cms/admin/codes/${item.id}`, { name: 'A', code: 'Z2' })).status
      ).toBe(400)
   })

   it('applies to singles after the first save', async () => {
      expect((await send('PUT', '/api/cms/admin/site', { founded: 1990 })).status).toBe(200)
      expect((await send('PUT', '/api/cms/admin/site', { founded: 1990 })).status).toBe(200)
      expect((await send('PUT', '/api/cms/admin/site', { founded: 1991 })).status).toBe(400)
   })
})

describe('import', () => {
   async function preview(body: unknown, mode = 'create') {
      const response = await send(
         'POST',
         `/api/cms/import/codes?format=json&mode=${mode}&dryRun=false`,
         JSON.stringify(body),
         'text/plain'
      )
      return {
         status: response.status,
         body: (await response.json()) as CmsImportPreview & { data?: CmsImportPreview },
      }
   }

   it('applies defaults to created rows without the column', async () => {
      const { status } = await preview([
         { id: 'c1', name: 'One' },
         { name: 'Two', active: false },
      ])
      expect(status).toBe(200)
      const db = state.db as ReturnType<typeof drizzle>
      const rows = (await db.select().from(state.schema.codes as SQLiteTable)) as Record<
         string,
         unknown
      >[]
      expect(rows.find((row) => row.id === 'c1')).toMatchObject({ level: 'basic', active: true })
      expect(rows.find((row) => row.name === 'Two')).toMatchObject({ active: false })
   })

   it('checks unique numbers and immutable values on upsert', async () => {
      await send('POST', '/api/cms/admin/codes', { name: 'A', code: 'U1', rank: 7 })
      const created = await preview([{ name: 'B', rank: 7 }])
      expect(created.status).toBe(400)
      expect(created.body.data?.rows[0]?.errors).toEqual([
         { path: 'rank', message: 'This value is already used by another entry' },
      ])
      await preview([{ id: 'u1', name: 'Up', code: 'V1' }])
      const updated = await preview([{ id: 'u1', name: 'Up', code: 'V2' }], 'upsert')
      expect(updated.body.data?.rows[0]?.errors).toEqual([
         { path: 'code', message: 'This value cannot be changed once saved' },
      ])
      const db = state.db as ReturnType<typeof drizzle>
      const rows = (await db.select().from(state.schema.codes as SQLiteTable)) as Record<
         string,
         unknown
      >[]
      expect(rows.find((row) => row.id === 'u1')).toMatchObject({ level: 'basic', code: 'V1' })
   })
})
