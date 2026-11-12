import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import type { AnySQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core'
import { createYoga } from 'graphql-yoga'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { renderSchemaFile } from '../src/schema-codegen'
import { renderGraphqlSdl } from '../src/runtime/shared/graphql-sdl'
import type { CmsConfig } from '../src/runtime/shared/index'
import { joinListCondition, jsonListCondition } from '../src/runtime/server/utils/list-filter'

const TMP = join(import.meta.dirname, '.tmp-list-filter')

const state = vi.hoisted(() => ({
   db: null as unknown,
   schema: {} as Record<string, unknown>,
   config: {} as Record<string, unknown>,
}))

vi.mock('#imports', () => ({
   useRuntimeConfig: () => ({
      cms: { media: { storage: 's3' } },
      public: { cms: { mediaBaseUrl: '', i18n: { locales: [], defaultLocale: 'en' } } },
   }),
}))

vi.mock('#cms-db', () => ({
   useDb: () => state.db,
   cmsDialect: 'sqlite',
}))

vi.mock('#cms-tables', () => ({
   get regions() {
      return state.schema.regions
   },
   get guides() {
      return state.schema.guides
   },
   get guides_regions() {
      return state.schema.guides_regions
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

function listConfig(): CmsConfig {
   return {
      regions: {
         id: 'regions',
         label: 'Regions',
         kind: 'collection',
         titleField: 'name',
         fields: { name: { label: 'Name', type: 'text', required: true } },
      },
      guides: {
         id: 'guides',
         label: 'Guides',
         kind: 'collection',
         titleField: 'name',
         fields: {
            name: { label: 'Name', type: 'text', required: true },
            species: {
               label: 'Species',
               type: 'select',
               options: ['trout', 'pike', 'carp'],
               multiple: true,
            },
            spots: { label: 'Spot', type: 'tags' },
            regions: {
               label: 'Regions',
               type: 'relation',
               to: 'regions',
               cardinality: 'many-to-many',
            },
         },
      },
   }
}

let request: (body: string) => Promise<Response>

beforeAll(async () => {
   mkdirSync(TMP, { recursive: true })
   const config = listConfig()
   const file = join(TMP, 'schema.ts')
   writeFileSync(file, renderSchemaFile(config, 'sqlite'))
   const tables = (await import(file)) as Record<string, SQLiteTable>
   const { generateSQLiteDrizzleJson, generateSQLiteMigration } = await import('drizzle-kit/api')
   const statements = await generateSQLiteMigration(
      await generateSQLiteDrizzleJson({}),
      await generateSQLiteDrizzleJson(tables)
   )
   const sqlite = new Database(':memory:')
   for (const statement of statements) sqlite.exec(statement)
   const db = drizzle(sqlite)
   db.insert(tables.regions!)
      .values([
         { id: 'north', name: 'North' },
         { id: 'south', name: 'South' },
         { id: 'islands', name: 'Islands' },
      ])
      .run()
   db.insert(tables.guides!)
      .values([
         { id: 'anna', name: 'Anna', species: ['trout', 'pike'], spots: ['Garda', 'Po'] },
         { id: 'bruno', name: 'Bruno', species: ['pike'], spots: ['Po'] },
         { id: 'carla', name: 'Carla', species: [], spots: [] },
         { id: 'dario', name: 'Dario', species: null, spots: null },
      ])
      .run()
   db.insert(tables.guides_regions!)
      .values([
         { sourceId: 'anna', targetId: 'north', position: 0 },
         { sourceId: 'anna', targetId: 'south', position: 1 },
         { sourceId: 'bruno', targetId: 'north', position: 0 },
         { sourceId: 'carla', targetId: 'islands', position: 0 },
      ])
      .run()
   state.db = db
   state.schema = tables
   state.config = config
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

afterAll(() => {
   rmSync(TMP, { recursive: true, force: true })
})

async function run(query: string, variables?: Record<string, unknown>) {
   const response = await request(JSON.stringify({ query, variables }))
   return (await response.json()) as {
      data?: unknown
      errors?: { message: string }[]
   }
}

async function ids(filters: string) {
   const result = await run(
      `{ guides(filters: ${filters}, sort: [{ field: name }]) { id } guidesCount(filters: ${filters}) }`
   )
   expect(result.errors).toBeUndefined()
   const data = result.data as { guides: { id: string }[]; guidesCount: number }
   expect(data.guidesCount).toBe(data.guides.length)
   return data.guides.map((guide) => guide.id)
}

describe('list filter SDL', () => {
   it('offers StringListFilter on multi-select, tags and many-to-many fields', () => {
      const sdl = renderGraphqlSdl(listConfig())
      const filters = sdl.match(/input GuidesFilters \{[^}]*\}/)![0]
      expect(filters).toContain('species: StringListFilter')
      expect(filters).toContain('spots: StringListFilter')
      expect(filters).toContain('regions: StringListFilter')
      const sort = sdl.match(/enum GuidesSortField \{[^}]*\}/)![0]
      expect(sort).not.toMatch(/species|spots|regions/)
      expect(sdl).toContain(
         'input StringListFilter {\n  hasAny: [String!]\n  hasAll: [String!]\n  isEmpty: Boolean\n}'
      )
   })
})

describe('list fields on sqlite', () => {
   it('resolves a null multi-select or tags column to an empty list', async () => {
      const result = await run('{ guidesById(id: "dario") { species spots } }')
      expect(result.errors).toBeUndefined()
      expect(result.data).toEqual({ guidesById: { species: [], spots: [] } })
   })
})

describe('list filters on sqlite', () => {
   it('filters a multi-select with hasAny, hasAll and isEmpty', async () => {
      expect(await ids('{ species: { hasAny: ["trout", "carp"] } }')).toEqual(['anna'])
      expect(await ids('{ species: { hasAny: ["pike"] } }')).toEqual(['anna', 'bruno'])
      expect(await ids('{ species: { hasAll: ["pike", "trout"] } }')).toEqual(['anna'])
      expect(await ids('{ species: { hasAll: ["pike", "pike"] } }')).toEqual(['anna', 'bruno'])
      expect(await ids('{ species: { isEmpty: true } }')).toEqual(['carla', 'dario'])
      expect(await ids('{ species: { isEmpty: false } }')).toEqual(['anna', 'bruno'])
   })

   it('filters tags', async () => {
      expect(await ids('{ spots: { hasAny: ["Po"] } }')).toEqual(['anna', 'bruno'])
      expect(await ids('{ spots: { hasAll: ["Po", "Garda"] } }')).toEqual(['anna'])
      expect(await ids('{ spots: { hasAny: ["po"] } }')).toEqual([])
      expect(await ids('{ spots: { isEmpty: true } }')).toEqual(['carla', 'dario'])
   })

   it('filters many-to-many relations by target id', async () => {
      expect(await ids('{ regions: { hasAny: ["south", "islands"] } }')).toEqual(['anna', 'carla'])
      expect(await ids('{ regions: { hasAll: ["north", "south"] } }')).toEqual(['anna'])
      expect(await ids('{ regions: { hasAll: ["north"] } }')).toEqual(['anna', 'bruno'])
      expect(await ids('{ regions: { isEmpty: true } }')).toEqual(['dario'])
      expect(await ids('{ regions: { isEmpty: false } }')).toEqual(['anna', 'bruno', 'carla'])
   })

   it('combines list filters with each other and with scalar filters', async () => {
      expect(
         await ids(
            '{ species: { hasAny: ["pike"] }, regions: { hasAny: ["north"] }, name: { neq: "Anna" } }'
         )
      ).toEqual(['bruno'])
      expect(await ids('{ spots: { hasAny: ["Po"], isEmpty: false } }')).toEqual(['anna', 'bruno'])
   })

   it('accepts variables and ignores null operators', async () => {
      const result = await run(
         'query ($filters: GuidesFilters) { guides(filters: $filters) { id } }',
         { filters: { spots: { hasAny: ['Garda'], hasAll: null } } }
      )
      expect(result.errors).toBeUndefined()
      expect(result.data).toEqual({ guides: [{ id: 'anna' }] })
   })

   it('rejects an empty value list', async () => {
      const result = await run('{ guides(filters: { spots: { hasAny: [] } }) { id } }')
      expect(result.errors?.[0]?.message).toBe('Empty hasAny list for spots')
   })
})

describe('list filters on postgres', () => {
   async function pgTables() {
      const file = join(TMP, 'pg-schema.ts')
      writeFileSync(file, renderSchemaFile(listConfig(), 'postgres'))
      return (await import(file)) as Record<string, Record<string, AnySQLiteColumn>>
   }

   function render(table: unknown, condition: ReturnType<typeof jsonListCondition>) {
      return drizzlePg
         .mock()
         .select()
         .from(table as never)
         .where(condition)
         .toSQL()
   }

   it('uses jsonb operators on a JSON list column', async () => {
      const tables = await pgTables()
      const column = tables.guides!.spots!
      const any = render(tables.guides, jsonListCondition('postgres', column, 'hasAny', ['a', 'b']))
      expect(any.sql).toContain(
         'exists (select 1 from jsonb_array_elements_text("guides"."spots") as cms_item(value) where cms_item.value in ($1, $2))'
      )
      expect(any.params).toEqual(['a', 'b'])
      const all = render(tables.guides, jsonListCondition('postgres', column, 'hasAll', ['a', 'a']))
      expect(all.sql).toContain('"guides"."spots" @> $1::jsonb')
      expect(all.params).toEqual(['["a"]'])
      const empty = render(tables.guides, jsonListCondition('postgres', column, 'isEmpty', true))
      expect(empty.sql).toContain('coalesce(jsonb_array_length("guides"."spots"), 0) = 0')
   })

   it('uses a subquery on the join table for many-to-many', async () => {
      const tables = await pgTables()
      const join = tables.guides_regions!
      const target = {
         table: join as unknown as SQLiteTable,
         sourceId: join.sourceId!,
         targetId: join.targetId!,
      }
      const all = render(
         tables.guides,
         joinListCondition(target, tables.guides!.id!, 'hasAll', ['north', 'south'])
      )
      expect(all.sql).toContain(
         '(select count(distinct "guides_regions"."target_id") from "guides_regions" where "guides_regions"."source_id" = "guides"."id" and "guides_regions"."target_id" in ($1, $2)) = 2'
      )
      const empty = render(
         tables.guides,
         joinListCondition(target, tables.guides!.id!, 'isEmpty', true)
      )
      expect(empty.sql).toContain(
         'not exists (select 1 from "guides_regions" where "guides_regions"."source_id" = "guides"."id")'
      )
   })
})
