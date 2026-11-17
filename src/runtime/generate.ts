import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import type { CmsMigrationFixes } from './shared/migrations-dir'
import { MIGRATION_FIXES_FILE, fixNewMigrations, migrationSqlFiles } from './shared/migrations-dir'

function readMigrationFixes(configPath: string, root: string): CmsMigrationFixes | null {
   const path = join(dirname(configPath), MIGRATION_FIXES_FILE)
   if (!existsSync(path)) return null
   try {
      const fixes = JSON.parse(readFileSync(path, 'utf8')) as CmsMigrationFixes
      return { ...fixes, out: isAbsolute(fixes.out) ? fixes.out : resolve(root, fixes.out) }
   } catch {
      return null
   }
}

export interface GenerateMigrationsOptions {
   root?: string
   configPath?: string
}

export type OpenStudioOptions = GenerateMigrationsOptions

function drizzleConfig(opts: GenerateMigrationsOptions) {
   const root = opts.root ?? process.cwd()
   const configPath = opts.configPath ?? join(root, '.nuxt/cms/drizzle.config.ts')
   if (!existsSync(configPath)) {
      throw new Error(
         `[nuxt-cms] drizzle config not found at ${configPath}. Run \`nuxi prepare\` first.`
      )
   }
   return { root, configPath }
}

function runDrizzleKit(command: string, root: string, configPath: string) {
   const require = createRequire(import.meta.url)
   const bin = join(dirname(require.resolve('drizzle-kit')), 'bin.cjs')
   return new Promise<number>((done) => {
      spawn(process.execPath, [bin, command, `--config=${configPath}`], {
         cwd: root,
         stdio: 'inherit',
      })
         .on('close', (c) => done(c ?? 1))
         .on('error', () => done(1))
   })
}

export async function generateMigrations(opts: GenerateMigrationsOptions = {}): Promise<void> {
   const { root, configPath } = drizzleConfig(opts)
   const fixes = readMigrationFixes(configPath, root)
   const before = fixes ? migrationSqlFiles(fixes.out) : []
   const code = await runDrizzleKit('generate', root, configPath)
   if (code !== 0) throw new Error(`[nuxt-cms] drizzle-kit generate failed (exit ${code})`)
   if (fixes) fixNewMigrations(fixes.out, before, fixes.uniqueTextColumns, fixes.dialect)
}

export async function openStudio(opts: OpenStudioOptions = {}): Promise<void> {
   const { root, configPath } = drizzleConfig(opts)
   const code = await runDrizzleKit('studio', root, configPath)
   if (code !== 0) throw new Error(`[nuxt-cms] drizzle-kit studio failed (exit ${code})`)
}
