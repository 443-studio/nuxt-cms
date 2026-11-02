import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import type { AnySQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core'
import { buildSchema } from 'graphql'
import { afterAll, describe, expect, it } from 'vitest'
import { renderSchemaFile, validateConfig } from '../src/schema-codegen'
import { renderTypesFile } from '../src/types-codegen'
import { renderGraphqlSdl } from '../src/runtime/shared/graphql-sdl'
import type { CmsConfig, CmsEntry } from '../src/runtime/shared/index'
import { canAddTag, distinctTags, normalizeTags } from '../src/runtime/shared/index'
import { csvCellValue, entryRowsToCsv } from '../src/runtime/shared/transfer'
import { buildEntrySchema, tagsCountMessage } from '../src/runtime/shared/validation'
import { I18N } from './fixtures'

const TMP = join(import.meta.dirname, '.tmp-tags')

function tagsConfig(): CmsConfig {
   return {
      guides: {
         id: 'guides',
         label: 'Guides',
         kind: 'collection',
         titleField: 'name',
         fields: {
            name: { label: 'Name', type: 'text', required: true },
            spots: { label: 'Spot', type: 'tags' },
            languages: { label: 'Languages', type: 'tags', required: true, max: 3 },
         },
      },
   }
}

function guides(): CmsEntry {
   return tagsConfig().guides!
}

afterAll(() => {
   rmSync(TMP, { recursive: true, force: true })
})

describe('tags helpers', () => {
   it('trims, drops empty values and ignores case-insensitive duplicates', () => {
      expect(normalizeTags([' Lake Garda ', 'lake garda', '', '  ', 'Po', 3, null, 'PO'])).toEqual([
         'Lake Garda',
         'Po',
      ])
   })

   it('collects distinct values across rows, sorted', () => {
      expect(
         distinctTags([['Po', 'adige'], '["po","Ticino"]', null, 'not json', ['Adige ', 'brenta']])
      ).toEqual(['adige', 'brenta', 'Po', 'Ticino'])
   })

   it('tells whether another tag fits', () => {
      expect(canAddTag({}, 100)).toBe(true)
      expect(canAddTag({ max: 2 }, 1)).toBe(true)
      expect(canAddTag({ max: 2 }, 2)).toBe(false)
   })
})

describe('tags validation', () => {
   const schema = buildEntrySchema(guides(), I18N)

   it('normalizes the list on parse', () => {
      const parsed = schema.parse({
         name: 'Marco',
         spots: [' Garda', 'garda', 'Po '],
         languages: ['it', 'en', 'IT'],
      })
      expect(parsed).toMatchObject({ spots: ['Garda', 'Po'], languages: ['it', 'en'] })
   })

   it('turns a missing optional list into an empty array', () => {
      const parsed = schema.parse({ name: 'Marco', languages: ['it'] })
      expect(parsed.spots).toEqual([])
   })

   it('requires at least one tag on a required field', () => {
      const result = schema.safeParse({ name: 'Marco', languages: ['  '] })
      expect(result.success).toBe(false)
      expect(result.error!.issues[0]!.path).toEqual(['languages'])
      expect(result.error!.issues[0]!.message).toBe('Required field')
   })

   it('rejects more tags than max, counted after deduplication', () => {
      const ok = schema.safeParse({ name: 'M', languages: ['it', 'en', 'de', 'IT'] })
      expect(ok.success).toBe(true)
      const result = schema.safeParse({ name: 'M', languages: ['it', 'en', 'de', 'fr'] })
      expect(result.success).toBe(false)
      expect(result.error!.issues[0]!.message).toBe('Add at most 3 tags')
      expect(tagsCountMessage({ max: 1 }, 2)).toBe('Add at most 1 tag')
   })

   it('rejects non-string items', () => {
      expect(schema.safeParse({ name: 'M', languages: ['it', 4] }).success).toBe(false)
   })

   it('checks max only while a conditional field is visible', () => {
      const entry: CmsEntry = {
         ...guides(),
         fields: {
            guided: { label: 'Guided', type: 'boolean' },
            spots: { label: 'Spot', type: 'tags', max: 1, showIf: { field: 'guided', eq: true } },
         },
      }
      const conditional = buildEntrySchema(entry, I18N)
      expect(conditional.safeParse({ guided: false, spots: ['a', 'b'] }).success).toBe(true)
      const result = conditional.safeParse({ guided: true, spots: ['a', 'b'] })
      expect(result.success).toBe(false)
      expect(result.error!.issues[0]!.message).toBe('Add at most 1 tag')
   })
})

describe('tags config', () => {
   it('accepts a tags field', () => {
      expect(validateConfig(tagsConfig(), I18N)).toEqual([])
   })

   it('rejects tags inside blocks, like multi-select', () => {
      const config = tagsConfig()
      config.guides!.fields.body = {
         label: 'Body',
         type: 'blocks',
         blocks: { spot: { label: 'Spot', fields: { names: { label: 'Names', type: 'tags' } } } },
      }
      expect(validateConfig(config, I18N)).toEqual([
         "cms.config entry 'guides', field 'body', block 'spot', field 'names': tags fields are not supported inside blocks",
      ])
   })

   it('rejects a bad max, min and options of other types', () => {
      const config = tagsConfig()
      config.guides!.fields.spots = { label: 'Spot', type: 'tags', max: 0, min: 1 }
      config.guides!.fields.name = { label: 'Name', type: 'text', suggestions: true }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes("'spots': max must be an integer of 1 or more"))).toBe(
         true
      )
      expect(errors.some((e) => e.includes("'spots': min is not supported on tags fields"))).toBe(
         true
      )
      expect(
         errors.some((e) => e.includes("'name': suggestions is only supported on tags fields"))
      ).toBe(true)
   })

   it('rejects tags as titleField, showIf target or translatable', () => {
      const config = tagsConfig()
      config.guides!.titleField = 'spots'
      config.guides!.fields.languages = {
         label: 'Languages',
         type: 'tags',
         translatable: true,
      }
      config.guides!.fields.notes = {
         label: 'Notes',
         type: 'text',
         showIf: { field: 'spots', eq: 'x' },
      }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes("titleField 'spots' must be one of"))).toBe(true)
      expect(errors.some((e) => e.includes('translatable is only supported'))).toBe(true)
      expect(errors.some((e) => e.includes('showIf can only depend on'))).toBe(true)
   })
})

describe('tags codegen', () => {
   it('stores tags as a JSON column on both dialects', () => {
      expect(renderSchemaFile(tagsConfig(), 'sqlite')).toContain(
         "spots: text('spots', { mode: 'json' }),"
      )
      const pg = renderSchemaFile(tagsConfig(), 'postgres')
      expect(pg).toContain("spots: jsonb('spots'),")
      expect(pg).toContain("languages: jsonb('languages').notNull(),")
      expect(pg).toMatch(/import \{[^}]*\bjsonb\b[^}]*\} from 'drizzle-orm\/pg-core'/)
   })

   it('exposes tags as a non-null string list with a list filter and no sort', () => {
      const sdl = renderGraphqlSdl(tagsConfig())
      expect(() => buildSchema(sdl)).not.toThrow()
      expect(sdl).toContain('spots: [String!]!')
      expect(sdl.match(/input GuidesFilters \{[^}]*\}/)![0]).toContain('spots: StringListFilter')
      expect(sdl.match(/enum GuidesSortField \{[^}]*\}/)![0]).not.toContain('spots')
   })

   it('types tags as a string array', () => {
      const out = renderTypesFile(tagsConfig())
      expect(out).toContain('  spots: string[]')
      expect(out).toContain('  languages: string[]')
   })
})

describe('tags transfer', () => {
   it('writes tags as JSON text in CSV and reads JSON or comma separated text', () => {
      const csv = entryRowsToCsv(guides(), [{ id: 'g1', name: 'M', spots: ['Po', 'Garda'] }], {
         locales: [],
         defaultLocale: 'en',
      })
      expect(csv).toContain('"[""Po"",""Garda""]"')
      const field = guides().fields.spots!
      expect(csvCellValue(field, '["Po","Garda"]')).toEqual({ value: ['Po', 'Garda'] })
      expect(csvCellValue(field, 'Po, Garda')).toEqual({ value: ['Po', ' Garda'] })
      expect(csvCellValue(field, '')).toEqual({ value: null })
      expect(csvCellValue(field, '[oops')).toEqual({ error: 'Invalid JSON' })
   })
})

describe('tags storage', () => {
   it('round trips a tags list through sqlite', async () => {
      mkdirSync(TMP, { recursive: true })
      const file = join(TMP, 'schema.ts')
      writeFileSync(file, renderSchemaFile(tagsConfig(), 'sqlite'))
      const schema = (await import(file)) as Record<string, SQLiteTable>
      const { generateSQLiteDrizzleJson, generateSQLiteMigration } = await import('drizzle-kit/api')
      const statements = await generateSQLiteMigration(
         await generateSQLiteDrizzleJson({}),
         await generateSQLiteDrizzleJson(schema)
      )
      const sqlite = new Database(':memory:')
      for (const statement of statements) sqlite.exec(statement)
      const db = drizzle(sqlite)
      const table = schema.guides!
      const id = (table as unknown as Record<string, AnySQLiteColumn>).id!
      const values = buildEntrySchema(guides(), I18N).parse({
         name: 'Marco',
         spots: ['Lago di Garda', 'lago di garda', 'Fiume Po'],
         languages: ['it'],
      })
      db.insert(table)
         .values({ id: 'g1', ...values })
         .run()
      const [row] = db.select().from(table).where(eq(id, 'g1')).all()
      expect(row).toMatchObject({ spots: ['Lago di Garda', 'Fiume Po'], languages: ['it'] })
      const raw = sqlite.prepare('select spots from guides').get() as { spots: string }
      expect(raw.spots).toBe('["Lago di Garda","Fiume Po"]')
   })
})
