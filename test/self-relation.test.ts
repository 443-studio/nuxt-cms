import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import type { PgTable } from 'drizzle-orm/pg-core'
import type { AnySQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core'
import { afterAll, describe, expect, it } from 'vitest'
import { renderSchemaFile, validateConfig } from '../src/schema-codegen'
import type { CmsConfig } from '../src/runtime/shared/index'

const TMP = mkdtempSync(join(tmpdir(), 'nuxt-cms-self-relation-'))

afterAll(() => rmSync(TMP, { recursive: true, force: true }))

function selfConfig(): CmsConfig {
   return {
      species: {
         id: 'species',
         label: 'Species',
         kind: 'collection',
         titleField: 'name',
         fields: {
            name: { label: 'Name', type: 'text', required: true },
            group: {
               label: 'Group',
               type: 'relation',
               to: 'species',
               cardinality: 'many-to-one',
            },
            twin: {
               label: 'Twin',
               type: 'relation',
               to: 'species',
               cardinality: 'one-to-one',
               onDelete: 'cascade',
            },
            related: {
               label: 'Related',
               type: 'relation',
               to: 'species',
               cardinality: 'many-to-many',
            },
         },
      },
   }
}

function writeSchema(name: string, contents: string) {
   const file = join(TMP, name)
   writeFileSync(file, contents)
   return file
}

describe('self relations', () => {
   it('passes config validation', () => {
      expect(validateConfig(selfConfig())).toEqual([])
   })

   it.each(['sqlite', 'postgres'] as const)(
      'renders a %s schema that parses as plain JavaScript',
      (dialect) => {
         const out = renderSchemaFile(selfConfig(), dialect)
         expect(out).not.toContain('import type')
         expect(out).not.toMatch(/AnySQLiteColumn|AnyPgColumn/)
         const file = writeSchema(`${dialect}.mjs`, out)
         expect(() =>
            execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })
         ).not.toThrow()
      }
   )

   it('declares self references as table foreign keys', () => {
      const out = renderSchemaFile(selfConfig(), 'sqlite')
      expect(out).toMatch(/import \{[^}]*\bforeignKey\b[^}]*\} from 'drizzle-orm\/sqlite-core'/)
      expect(out).toContain("group: text('group'),")
      expect(out).toContain("twin: text('twin').unique(),")
      expect(out).toContain(
         "foreignKey({ columns: [table.group], foreignColumns: [table.id] }).onDelete('set null')"
      )
      expect(out).toContain(
         "foreignKey({ columns: [table.twin], foreignColumns: [table.id] }).onDelete('cascade')"
      )
      expect(out).toContain(
         "sourceId: text('source_id').notNull().references(() => species.id, { onDelete: 'cascade' })"
      )
      expect(out).toContain(
         "targetId: text('target_id').notNull().references(() => species.id, { onDelete: 'cascade' })"
      )
   })

   it('restricts a required self relation by default', () => {
      const config = selfConfig()
      config.species!.fields.group!.required = true
      const out = renderSchemaFile(config, 'sqlite')
      expect(out).toContain("group: text('group').notNull(),")
      expect(out).toContain(
         "foreignKey({ columns: [table.group], foreignColumns: [table.id] }).onDelete('restrict')"
      )
   })

   it('creates working sqlite foreign keys', async () => {
      const file = writeSchema('sqlite.ts', renderSchemaFile(selfConfig(), 'sqlite'))
      const tables = (await import(file)) as Record<string, SQLiteTable>
      const { generateSQLiteDrizzleJson, generateSQLiteMigration } = await import('drizzle-kit/api')
      const statements = await generateSQLiteMigration(
         await generateSQLiteDrizzleJson({}),
         await generateSQLiteDrizzleJson(tables)
      )
      const create = statements.find((s) => s.includes('CREATE TABLE `species`'))!
      expect(create).toContain(
         'FOREIGN KEY (`group`) REFERENCES `species`(`id`) ON UPDATE no action ON DELETE set null'
      )
      expect(create).toContain(
         'FOREIGN KEY (`twin`) REFERENCES `species`(`id`) ON UPDATE no action ON DELETE cascade'
      )

      const sqlite = new Database(':memory:')
      sqlite.pragma('foreign_keys = ON')
      for (const statement of statements) sqlite.exec(statement)
      const db = drizzle(sqlite)
      const species = tables.species!
      const speciesId = (species as unknown as Record<string, AnySQLiteColumn>).id!
      db.insert(species)
         .values([
            { id: 'trout', name: 'Trout' },
            { id: 'brown', name: 'Brown trout', group: 'trout' },
         ] as never)
         .run()
      expect(() =>
         db
            .insert(species)
            .values({ id: 'ghost', name: 'Ghost', group: 'missing' } as never)
            .run()
      ).toThrow(/FOREIGN KEY/)
      db.delete(species).where(eq(speciesId, 'trout')).run()
      expect(sqlite.prepare('select "group" from species where id = ?').get('brown')).toEqual({
         group: null,
      })
   })

   it('creates named postgres foreign keys', async () => {
      const file = writeSchema('pg.ts', renderSchemaFile(selfConfig(), 'postgres'))
      const tables = (await import(file)) as Record<string, PgTable>
      const { generateDrizzleJson, generateMigration } = await import('drizzle-kit/api')
      const statements = await generateMigration(
         generateDrizzleJson({}),
         generateDrizzleJson(tables)
      )
      const sql = statements.join('\n')
      expect(sql).toContain(
         'ADD CONSTRAINT "species_group_species_id_fk" FOREIGN KEY ("group") REFERENCES "public"."species"("id") ON DELETE set null'
      )
      expect(sql).toContain(
         'ADD CONSTRAINT "species_twin_species_id_fk" FOREIGN KEY ("twin") REFERENCES "public"."species"("id") ON DELETE cascade'
      )
   })
})
