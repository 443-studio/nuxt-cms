import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const MIGRATIONS_ROOT = 'server/db/migrations'

export function migrationsDirFor(root: string, driver: string): string {
   if (driver === 'postgres') return resolve(root, `${MIGRATIONS_ROOT}/postgres`)
   const perDriver = resolve(root, `${MIGRATIONS_ROOT}/${driver}`)
   if (driver !== 'sqlite' && existsSync(perDriver)) return perDriver
   return resolve(root, `${MIGRATIONS_ROOT}/sqlite`)
}

export interface CmsUniqueTextColumn {
   table: string
   column: string
}

export type CmsMigrationDialect = 'sqlite' | 'turso' | 'postgresql'

const STATEMENT_BREAKPOINT = '--> statement-breakpoint'

const SQLITE_UNIQUE_INDEX =
   /^CREATE UNIQUE INDEX [`"]?[\w]+[`"]? ON [`"]?(\w+)[`"]? \([`"]?(\w+)[`"]?\)/i

const POSTGRES_UNIQUE_CONSTRAINT =
   /^ALTER TABLE "(?:\w+"\.")?(\w+)" ADD CONSTRAINT "\w+" UNIQUE(?: NULLS NOT DISTINCT)?\("(\w+)"\)/i

function uniqueTarget(statement: string): CmsUniqueTextColumn | null {
   const match = SQLITE_UNIQUE_INDEX.exec(statement) ?? POSTGRES_UNIQUE_CONSTRAINT.exec(statement)
   return match ? { table: match[1]!, column: match[2]! } : null
}

function blankToNullStatement(target: CmsUniqueTextColumn, dialect: CmsMigrationDialect): string {
   const quote = dialect === 'postgresql' ? '"' : '`'
   const table = `${quote}${target.table}${quote}`
   const column = `${quote}${target.column}${quote}`
   return `UPDATE ${table} SET ${column} = NULL WHERE trim(${column}) = '';`
}

export function blankUniqueValuesToNull(
   sql: string,
   columns: readonly CmsUniqueTextColumn[],
   dialect: CmsMigrationDialect
): string {
   const out: string[] = []
   for (const part of sql.split(STATEMENT_BREAKPOINT)) {
      const target = uniqueTarget(part.trim())
      const listed = columns.some(
         (column) => column.table === target?.table && column.column === target?.column
      )
      if (target && listed) {
         const leading = /^\s*/.exec(part)![0]
         out.push(`${leading}${blankToNullStatement(target, dialect)}`, `\n${part.trimStart()}`)
      } else out.push(part)
   }
   return out.join(STATEMENT_BREAKPOINT)
}

export function migrationSqlFiles(dir: string): string[] {
   return existsSync(dir) ? readdirSync(dir).filter((file) => file.endsWith('.sql')) : []
}

export function fixNewMigrations(
   dir: string,
   before: readonly string[],
   columns: readonly CmsUniqueTextColumn[],
   dialect: CmsMigrationDialect
): string[] {
   const fixed: string[] = []
   if (!columns.length) return fixed
   for (const file of migrationSqlFiles(dir)) {
      if (before.includes(file)) continue
      const path = join(dir, file)
      const sql = readFileSync(path, 'utf8')
      const next = blankUniqueValuesToNull(sql, columns, dialect)
      if (next === sql) continue
      writeFileSync(path, next)
      fixed.push(file)
   }
   return fixed
}

export const MIGRATION_FIXES_FILE = 'migration-fixes.json'

export interface CmsMigrationFixes {
   dialect: CmsMigrationDialect
   out: string
   uniqueTextColumns: CmsUniqueTextColumn[]
}
