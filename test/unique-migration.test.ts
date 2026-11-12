import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CmsConfig, FieldConfig } from '../src/runtime/shared/index'
import { blankUniqueValuesToNull } from '../src/runtime/shared/migrations-dir'
import { renderSchemaFile, uniqueTextColumns } from '../src/schema-codegen'

const TMP = join(__dirname, '.tmp-unique')

function config(code: Partial<FieldConfig>): CmsConfig {
   return {
      events: {
         id: 'events',
         label: 'Events',
         kind: 'collection',
         titleField: 'title',
         fields: {
            title: { label: 'Title', type: 'text', required: true },
            eventCode: { label: 'Code', type: 'text', ...code },
            contact: { label: 'Contact', type: 'email', ...code },
            seats: { label: 'Seats', type: 'number', ...code },
         },
      },
   }
}

async function loadSchema(name: string, value: CmsConfig, dialect: 'sqlite' | 'postgres') {
   const file = join(TMP, `${name}.ts`)
   writeFileSync(file, renderSchemaFile(value, dialect))
   return (await import(file)) as Record<string, unknown>
}

beforeAll(() => {
   mkdirSync(TMP, { recursive: true })
})

afterAll(() => {
   rmSync(TMP, { recursive: true, force: true })
})

describe('unique text columns', () => {
   it('lists optional unique text and email columns of generated tables', () => {
      expect(uniqueTextColumns(config({ unique: true }))).toEqual([
         { table: 'events', column: 'event_code' },
         { table: 'events', column: 'contact' },
      ])
      expect(uniqueTextColumns(config({ unique: true, required: true }))).toEqual([])
      expect(uniqueTextColumns(config({}))).toEqual([])
      const custom = config({ unique: true })
      custom.events!.table = {} as never
      expect(uniqueTextColumns(custom)).toEqual([])
   })
})

describe('blank values before a new unique index', () => {
   it('lets sqlite add unique to a column that holds several blank values', async () => {
      const { generateSQLiteDrizzleJson, generateSQLiteMigration } = await import('drizzle-kit/api')
      const before = await loadSchema('sqlite-before', config({}), 'sqlite')
      const after = await loadSchema('sqlite-after', config({ unique: true }), 'sqlite')
      const sqlite = new Database(':memory:')
      for (const statement of await generateSQLiteMigration(
         await generateSQLiteDrizzleJson({}),
         await generateSQLiteDrizzleJson(before)
      ))
         sqlite.exec(statement)
      const insert = sqlite.prepare(
         'insert into events (id, title, event_code, contact) values (?, ?, ?, ?)'
      )
      insert.run('a', 'A', '', '')
      insert.run('b', 'B', ' ', '')
      insert.run('c', 'C', 'x', 'c@example.com')
      const statements = await generateSQLiteMigration(
         await generateSQLiteDrizzleJson(before),
         await generateSQLiteDrizzleJson(after)
      )
      const sql = statements.join('--> statement-breakpoint\n')
      sqlite.exec('begin')
      expect(() => {
         for (const statement of statements) sqlite.exec(statement)
      }).toThrow(/UNIQUE/)
      sqlite.exec('rollback')
      const fixed = blankUniqueValuesToNull(
         sql,
         uniqueTextColumns(config({ unique: true })),
         'sqlite'
      )
      expect(fixed).toContain(
         "UPDATE `events` SET `event_code` = NULL WHERE trim(`event_code`) = '';"
      )
      expect(fixed.indexOf('UPDATE `events` SET `event_code`')).toBeLessThan(
         fixed.indexOf('CREATE UNIQUE INDEX `events_event_code_unique`')
      )
      for (const statement of fixed.split('--> statement-breakpoint')) sqlite.exec(statement)
      expect(
         sqlite.prepare('select id, event_code, contact from events order by id').all()
      ).toEqual([
         { id: 'a', event_code: null, contact: null },
         { id: 'b', event_code: null, contact: null },
         { id: 'c', event_code: 'x', contact: 'c@example.com' },
      ])
      sqlite.close()
   })

   it('adds the update before the postgres unique constraint', async () => {
      const { generateDrizzleJson, generateMigration } = await import('drizzle-kit/api')
      const before = await loadSchema('pg-before', config({}), 'postgres')
      const after = await loadSchema('pg-after', config({ unique: true }), 'postgres')
      const statements = await generateMigration(
         generateDrizzleJson(before),
         generateDrizzleJson(after)
      )
      const sql = statements.join('--> statement-breakpoint\n')
      const fixed = blankUniqueValuesToNull(
         sql,
         uniqueTextColumns(config({ unique: true })),
         'postgresql'
      )
      expect(fixed).toContain(
         `UPDATE "events" SET "event_code" = NULL WHERE trim("event_code") = '';--> statement-breakpoint`
      )
      expect(fixed).toContain('UPDATE "events" SET "contact" = NULL')
      expect(fixed).not.toContain('SET "seats"')
      expect(fixed.indexOf('SET "event_code"')).toBeLessThan(
         fixed.indexOf('ADD CONSTRAINT "events_event_code_unique"')
      )
   })

   it('leaves other statements and unlisted indexes alone', () => {
      const sql = 'CREATE UNIQUE INDEX `blog_slug_unique` ON `blog` (`slug`);'
      expect(blankUniqueValuesToNull(sql, [{ table: 'events', column: 'code' }], 'sqlite')).toBe(
         sql
      )
   })
})
