import { eq, is, sql } from 'drizzle-orm'
import { PgDatabase } from 'drizzle-orm/pg-core'
import type { AnySQLiteColumn, BaseSQLiteDatabase, SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { CmsConfig, CmsEntry } from '../../shared/index'
import {
   encodeEntryTranslatableMedia,
   entryFieldsFor,
   isCollectionKind,
   pageFieldsTableName,
   pageMediaTableName,
   relationTarget,
} from '../../shared/index'
import type {
   CmsContentImportMode,
   CmsSeedDatabase,
   PreparedContent,
   PreparedContentRow,
   ValidateCmsContentOptions,
} from './content-snapshot'
import { CmsContentError, prepareCmsContent } from './content-snapshot'
import {
   manyToManyKeys,
   splitRelationValues,
   withContentDefaults,
   withTimestamps,
   withUpdatedAt,
} from './entry-values'
import type { PageDb, PageDialect, PageTables } from './page-rows'
import { pageWriteStatements } from './page-rows'
import type { JoinTable, WriteDb } from './write-statements'
import { joinWriteStatements } from './write-statements'

export interface ImportCmsContentOptions extends ValidateCmsContentOptions {
   db: CmsSeedDatabase
   tables: Record<string, unknown>
}

export interface CmsContentImportResult {
   mode: CmsContentImportMode
   dryRun: boolean
   pages: string[]
   singles: string[]
   collections: Record<string, string[]>
   contents: Record<string, string[]>
}

type Row = Record<string, unknown>

type SeedDb = Pick<
   BaseSQLiteDatabase<'sync' | 'async', unknown>,
   'select' | 'insert' | 'update' | 'delete'
>

type Statements = PromiseLike<unknown>[]

interface TransactionDb {
   transaction: (run: (tx: SeedDb) => Promise<void>) => Promise<void>
}

interface BatchDb {
   batch: (statements: Statements) => Promise<unknown>
}

interface RunDb {
   run: (query: ReturnType<typeof sql>) => unknown
}

interface WritePlan {
   clear: Statements
   main: Statements
   later: Statements
}

function columnsOf(table: SQLiteTable) {
   return table as unknown as Record<string, AnySQLiteColumn>
}

function requireTable(
   config: CmsConfig,
   tables: Record<string, unknown>,
   name: string
): SQLiteTable {
   const table = (config[name]?.table ?? tables[name]) as SQLiteTable | undefined
   if (!table)
      throw new Error(
         `[nuxt-cms] No table for ${name} in the schema. Run \`nuxi prepare\` after changing cms.config.ts.`
      )
   return table
}

function joinTable(tables: Record<string, unknown>, name: string, key: string): JoinTable {
   const table = tables[`${name}_${key}`] as SQLiteTable | undefined
   if (!table) throw new Error(`[nuxt-cms] No join table for ${name}.${key} in the schema.`)
   const columns = columnsOf(table)
   return {
      table,
      sourceId: columns.sourceId!,
      targetId: columns.targetId!,
      position: columns.position!,
   }
}

function pageTables(config: CmsConfig, tables: Record<string, unknown>, name: string): PageTables {
   return {
      page: requireTable(config, tables, name),
      fields: requireTable(config, tables, pageFieldsTableName(name)),
      media: requireTable(config, tables, pageMediaTableName(name)),
   }
}

function insertionOrder(config: CmsConfig, names: string[]): string[] {
   const collections = names.filter((name) => isCollectionKind(config[name]!))
   const order: string[] = []
   const visiting = new Set<string>()
   const visit = (name: string) => {
      if (order.includes(name) || visiting.has(name)) return
      visiting.add(name)
      for (const field of Object.values(config[name]!.fields)) {
         const target = relationTarget(field)
         if (field.type === 'relation' && target !== name && collections.includes(target))
            visit(target)
      }
      visiting.delete(name)
      order.push(name)
   }
   for (const name of collections) visit(name)
   const kinds = (kind: CmsEntry['kind']) => names.filter((name) => config[name]!.kind === kind)
   return [...order, ...kinds('single'), ...kinds('page')]
}

function clearStatements(
   db: SeedDb,
   config: CmsConfig,
   tables: Record<string, unknown>,
   name: string
): Statements {
   const entry = config[name]!
   if (entry.kind === 'page') {
      const page = pageTables(config, tables, name)
      return [db.delete(page.fields), db.delete(page.media), db.delete(page.page)]
   }
   const table = requireTable(config, tables, name)
   const joins = manyToManyKeys(entry).map((key) => joinTable(tables, name, key))
   if (entry.kind === 'single') {
      return [
         ...joins.map((join) => db.delete(join.table).where(eq(join.sourceId, entry.id))),
         db.delete(table).where(eq(columnsOf(table).id!, entry.id)),
      ]
   }
   return [...joins.map((join) => db.delete(join.table)), db.delete(table)]
}

function deferredRelations(
   config: CmsConfig,
   order: string[],
   row: PreparedContentRow,
   declared: Map<string, Set<string>>
): string[] {
   const position = order.indexOf(row.name)
   return Object.entries(entryFieldsFor(row.entry))
      .filter(([, field]) => {
         const target = relationTarget(field)
         return (
            field.type === 'relation' &&
            field.cardinality !== 'many-to-many' &&
            !field.required &&
            !!config[target] &&
            order.indexOf(target) >= position
         )
      })
      .map(([key]) => key)
      .filter((key) => {
         const field = row.entry.fields[key]!
         const value = row.values[key]
         return typeof value === 'string' && !!declared.get(relationTarget(field))?.has(value)
      })
}

function collectionStatements(
   db: SeedDb,
   options: ImportCmsContentOptions,
   order: string[],
   row: PreparedContentRow,
   declared: Map<string, Set<string>>,
   mode: CmsContentImportMode,
   plan: WritePlan
) {
   const { config, tables } = options
   const table = requireTable(config, tables, row.name)
   const idColumn = columnsOf(table).id!
   const { values, lists } = splitRelationValues(
      row.entry,
      encodeEntryTranslatableMedia(row.entry, row.values)
   )
   const deferred: Row = {}
   for (const key of deferredRelations(config, order, row, declared)) {
      deferred[key] = values[key]
      values[key] = null
   }
   withContentDefaults(row.entry, values)
   const insert = db.insert(table).values(withTimestamps(table, { ...values, id: row.id }))
   plan.main.push(
      mode === 'merge'
         ? insert.onConflictDoUpdate({ target: idColumn, set: withUpdatedAt(table, values) })
         : insert
   )
   if (Object.keys(deferred).length)
      plan.later.push(db.update(table).set(deferred).where(eq(idColumn, row.id)))
   for (const [key, ids] of Object.entries(lists))
      plan.later.push(
         ...joinWriteStatements(db as WriteDb, joinTable(tables, row.name, key), row.id, ids)
      )
}

function singleStatements(
   db: SeedDb,
   options: ImportCmsContentOptions,
   row: PreparedContentRow,
   plan: WritePlan
) {
   const table = requireTable(options.config, options.tables, row.name)
   const { values, lists } = splitRelationValues(
      row.entry,
      encodeEntryTranslatableMedia(row.entry, row.values)
   )
   const set = withUpdatedAt(table, values)
   plan.main.push(
      db
         .insert(table)
         .values(withTimestamps(table, { id: row.id, ...set }))
         .onConflictDoUpdate({ target: columnsOf(table).id!, set })
   )
   for (const [key, ids] of Object.entries(lists))
      plan.later.push(
         ...joinWriteStatements(
            db as WriteDb,
            joinTable(options.tables, row.name, key),
            row.id,
            ids
         )
      )
}

function pageStatements(
   db: SeedDb,
   dialect: PageDialect,
   options: ImportCmsContentOptions,
   row: PreparedContentRow,
   plan: WritePlan
) {
   const tables = pageTables(options.config, options.tables, row.name)
   const set = withUpdatedAt(tables.page, encodeEntryTranslatableMedia(row.entry, row.values))
   plan.main.push(
      ...pageWriteStatements(db as unknown as PageDb, dialect, tables, row.entry, row.route!, set)
   )
}

function writeStatements(
   db: SeedDb,
   dialect: PageDialect,
   options: ImportCmsContentOptions,
   prepared: PreparedContent
): Statements {
   const { config, tables } = options
   const order = insertionOrder(config, prepared.names)
   const declared = new Map<string, Set<string>>()
   for (const row of prepared.rows) {
      if (!isCollectionKind(row.entry)) continue
      declared.set(row.name, (declared.get(row.name) ?? new Set()).add(row.id))
   }
   const plan: WritePlan = { clear: [], main: [], later: [] }
   if (prepared.mode === 'replace') {
      for (const name of [...order].reverse())
         plan.clear.push(...clearStatements(db, config, tables, name))
   }
   for (const name of order) {
      for (const row of prepared.rows.filter((candidate) => candidate.name === name)) {
         if (row.entry.kind === 'page') pageStatements(db, dialect, options, row, plan)
         else if (row.entry.kind === 'single') singleStatements(db, options, row, plan)
         else collectionStatements(db, options, order, row, declared, prepared.mode, plan)
      }
   }
   return [...plan.clear, ...plan.main, ...plan.later]
}

async function runInTransaction(
   db: CmsSeedDatabase,
   dialect: PageDialect,
   build: (db: SeedDb) => Statements
) {
   if (dialect === 'postgres') {
      await (db as unknown as TransactionDb).transaction(async (tx) => {
         for (const statement of build(tx)) await statement
      })
      return
   }
   const batch = (db as unknown as Partial<BatchDb>).batch
   if (typeof batch === 'function') {
      const statements = build(db as unknown as SeedDb)
      if (statements.length) await batch.call(db, statements)
      return
   }
   const run = (query: ReturnType<typeof sql>) => (db as unknown as RunDb).run(query)
   await run(sql`begin immediate`)
   try {
      for (const statement of build(db as unknown as SeedDb)) await statement
      await run(sql`commit`)
   } catch (error) {
      await run(sql`rollback`)
      throw error
   }
}

export function contentImportResult(
   config: CmsConfig,
   prepared: PreparedContent,
   dryRun: boolean
): CmsContentImportResult {
   const result: CmsContentImportResult = {
      mode: prepared.mode,
      dryRun,
      pages: [],
      singles: [],
      collections: {},
      contents: {},
   }
   for (const name of prepared.names) {
      const kind = config[name]?.kind
      if (kind === 'collection') result.collections[name] = []
      if (kind === 'content') result.contents[name] = []
   }
   for (const row of prepared.rows) {
      if (row.section === 'pages') result.pages.push(row.route!.path)
      else if (row.section === 'singles') result.singles.push(row.name)
      else result[row.section][row.name]!.push(row.id)
   }
   return result
}

export async function importCmsContent(
   options: ImportCmsContentOptions
): Promise<CmsContentImportResult> {
   const prepared = await prepareCmsContent(options)
   if (prepared.issues.length) throw new CmsContentError(prepared.issues)
   const dialect: PageDialect = is(options.db, PgDatabase) ? 'postgres' : 'sqlite'
   await runInTransaction(options.db, dialect, (db) =>
      writeStatements(db, dialect, options, prepared)
   )
   return contentImportResult(options.config, prepared, false)
}
