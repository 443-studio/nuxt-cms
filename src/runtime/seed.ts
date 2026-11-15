import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrationsDirFor } from './shared/migrations-dir'
import { resolvePageRoutes, routePathsFromDir } from './shared/page-routes'
import type { CmsConfig, CmsI18n, CmsPageRoute } from './shared/index'
import { normalizeCmsConfig } from './shared/index'
import type {
   CmsContentImportMode,
   CmsContentSnapshot,
   CmsSeedMedia,
} from './server/utils/content-snapshot'
import { CmsContentError, prepareCmsContent } from './server/utils/content-snapshot'
import type { CmsContentImportResult } from './server/utils/content-import'
import { contentImportResult, importCmsContent } from './server/utils/content-import'
import { customId, ID_LENGTH } from './server/utils/custom-id'
import { applyLibsqlMigrations } from './server/utils/libsql-migrations'

export { customId, ID_LENGTH }
export type { CmsI18n, CmsPageRoute }
export type {
   CmsContentImportMode,
   CmsContentIssue,
   CmsContentSnapshot,
   CmsContentValues,
   CmsSeedDatabase,
   CmsSeedMedia,
   ValidateCmsContentOptions,
} from './server/utils/content-snapshot'
export {
   CmsContentError,
   formatContentIssues,
   validateCmsContent,
} from './server/utils/content-snapshot'
export type { CmsContentImportResult, ImportCmsContentOptions } from './server/utils/content-import'
export { importCmsContent } from './server/utils/content-import'

export interface ResolveCmsPagesOptions {
   root?: string
   pagesDir?: string
}

export function resolveCmsPages<T extends CmsConfig>(
   config: T,
   options: ResolveCmsPagesOptions = {}
): T {
   const root = options.root ?? process.cwd()
   const pagesDir = options.pagesDir
      ? isAbsolute(options.pagesDir)
         ? options.pagesDir
         : resolve(root, options.pagesDir)
      : resolve(root, 'app/pages')
   const discovered = routePathsFromDir(pagesDir)
   for (const entry of Object.values(config)) {
      if (entry.kind === 'page') entry.pages = resolvePageRoutes(entry, discovered)
   }
   return config
}

export type SeedDriver = 'sqlite' | 'libsql' | 'postgres'

export interface CmsSeederOptions {
   driver?: SeedDriver
   url?: string
   authToken?: string
   dbPath?: string
   migrationsDir?: string
   root?: string
}

function inferDriver(url: string): SeedDriver {
   if (/^(libsql|wss?|https?):\/\//.test(url)) return 'libsql'
   if (/^postgres(ql)?:\/\//.test(url)) return 'postgres'
   return 'sqlite'
}

export async function createCmsSeeder(opts: CmsSeederOptions = {}) {
   const root = opts.root ?? process.cwd()
   const url = opts.url ?? process.env.NUXT_CMS_DATABASE_URL ?? ''
   const authToken = opts.authToken ?? process.env.NUXT_CMS_DATABASE_AUTH_TOKEN ?? ''
   const driver =
      opts.driver ?? (process.env.NUXT_CMS_DATABASE_DRIVER as SeedDriver) ?? inferDriver(url)
   const dbPath = opts.dbPath ?? process.env.NUXT_CMS_DATABASE_PATH ?? 'data/cms.db'
   const resolvedDbPath = isAbsolute(dbPath) ? dbPath : resolve(root, dbPath)
   const migrationsFolder = opts.migrationsDir ?? migrationsDirFor(root, driver)

   if (driver === 'libsql') {
      const { readMigrationFiles } = await import('drizzle-orm/migrator')
      const dbUrl = url || `file:${resolvedDbPath}`
      let db
      if (dbUrl.startsWith('file:')) {
         mkdirSync(dirname(resolvedDbPath), { recursive: true })
         const { createClient } = await import('@libsql/client')
         const { drizzle } = await import('drizzle-orm/libsql')
         db = drizzle(createClient({ url: dbUrl, authToken: authToken || undefined }))
      } else {
         const { createClient } = await import('@libsql/client/web')
         const { drizzle } = await import('drizzle-orm/libsql/web')
         db = drizzle(createClient({ url: dbUrl, authToken: authToken || undefined }))
      }
      const client = db.$client
      return {
         db,
         migrate: async () => {
            await applyLibsqlMigrations(client, readMigrationFiles({ migrationsFolder }))
         },
         close: async () => {
            client.close()
         },
      }
   }

   if (driver === 'postgres') {
      if (!url) throw new Error('[nuxt-cms] seed: Postgres needs a url (NUXT_CMS_DATABASE_URL)')
      const { drizzle } = await import('drizzle-orm/node-postgres')
      const { migrate } = await import('drizzle-orm/node-postgres/migrator')
      const pg = (await import('pg')).default
      const pool = new pg.Pool({ connectionString: url })
      const db = drizzle(pool)
      return {
         db,
         migrate: () => migrate(db, { migrationsFolder }),
         close: () => pool.end(),
      }
   }

   const Database = (await import('better-sqlite3')).default
   const { drizzle } = await import('drizzle-orm/better-sqlite3')
   const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
   mkdirSync(dirname(resolvedDbPath), { recursive: true })
   const sqlite = new Database(resolvedDbPath)
   sqlite.pragma('journal_mode = WAL')
   sqlite.pragma('foreign_keys = ON')
   const db = drizzle(sqlite)
   return {
      db,
      migrate: () => {
         sqlite.pragma('foreign_keys = OFF')
         try {
            migrate(db, { migrationsFolder })
         } finally {
            sqlite.pragma('foreign_keys = ON')
         }
      },
      close: async () => {
         sqlite.close()
      },
   }
}

export interface LoadCmsProjectOptions {
   root?: string
   configPath?: string
   pagesDir?: string
   schemaPath?: string
}

export interface CmsProject {
   root: string
   config: CmsConfig
   i18n: CmsI18n
   media: CmsSeedMedia
   tables: Record<string, unknown>
   database: CmsSeederOptions
}

interface NuxtCmsOptions {
   configPath?: string
   i18n?: { locales?: string[]; defaultLocale?: string }
   media?: { storage?: 's3' | 'local' | 'filesystem'; publicBaseUrl?: string }
   database?: { driver?: string; path?: string; url?: string; authToken?: string }
}

const CONFIG_EXTENSIONS = ['', '.ts', '.mts', '.js', '.mjs']

function findFile(base: string): string | null {
   for (const extension of CONFIG_EXTENSIONS) {
      const path = `${base}${extension}`
      if (existsSync(path) && !path.endsWith('/')) return path
   }
   return null
}

function sharedIndexPath(): string {
   return fileURLToPath(new URL('./shared/index', import.meta.url))
}

function seedDatabase(cms: NuxtCmsOptions): CmsSeederOptions {
   const env = process.env
   const driver = env.NUXT_CMS_DATABASE_DRIVER ?? cms.database?.driver
   if (driver === 'd1')
      throw new Error(
         '[nuxt-cms] seed: the d1 driver is only reachable from a Worker; seed a local copy with wrangler instead'
      )
   const options: CmsSeederOptions = {}
   if (driver) options.driver = driver as SeedDriver
   const url = env.NUXT_CMS_DATABASE_URL ?? cms.database?.url
   if (url) options.url = url
   const authToken = env.NUXT_CMS_DATABASE_AUTH_TOKEN ?? cms.database?.authToken
   if (authToken) options.authToken = authToken
   const dbPath = env.NUXT_CMS_DATABASE_PATH ?? cms.database?.path
   if (dbPath) options.dbPath = dbPath
   return options
}

function seedMedia(cms: NuxtCmsOptions, publicDir: string): CmsSeedMedia {
   const storage = cms.media?.storage ?? 's3'
   if (storage !== 'local') return { storage }
   const base = cms.media?.publicBaseUrl ?? ''
   return {
      storage,
      dir: base.startsWith('/') ? join(publicDir, ...base.split('/').filter(Boolean)) : '',
   }
}

export async function loadCmsProject(options: LoadCmsProjectOptions = {}): Promise<CmsProject> {
   const root = resolve(options.root ?? process.cwd())
   const { loadNuxtConfig } = await import('@nuxt/kit')
   const nuxt = await loadNuxtConfig({ cwd: root })
   const cms = ((nuxt as unknown as { cms?: NuxtCmsOptions }).cms ?? {}) as NuxtCmsOptions
   const i18n: CmsI18n = {
      locales: cms.i18n?.locales ?? [],
      defaultLocale: cms.i18n?.defaultLocale ?? 'en',
   }

   const configBase = resolve(root, options.configPath ?? cms.configPath ?? 'cms.config')
   const configPath = findFile(configBase)
   if (!configPath) throw new Error(`[nuxt-cms] seed: cms config not found at ${configBase}(.ts)`)
   const { createJiti } = await import('jiti')
   const jiti = createJiti(import.meta.url, {
      moduleCache: false,
      alias: { ...(nuxt.alias ?? {}), '#nuxt-cms': sharedIndexPath() },
   })
   const config = normalizeCmsConfig(
      (await jiti.import(configPath, { default: true })) as CmsConfig,
      i18n
   )
   resolveCmsPages(config, {
      root,
      pagesDir:
         options.pagesDir ??
         join(nuxt.srcDir ?? root, (nuxt.dir as { pages?: string })?.pages ?? 'pages'),
   })

   const schemaCandidates = options.schemaPath
      ? [resolve(root, options.schemaPath)]
      : [join(root, '.nuxt/cms/schema.ts'), join(nuxt.buildDir ?? '', 'cms/schema.ts')]
   const schemaPath = schemaCandidates.find((path) => existsSync(path))
   if (!schemaPath)
      throw new Error(
         `[nuxt-cms] seed: generated schema not found at ${schemaCandidates[0]}. Run \`nuxi prepare\` first.`
      )
   const tables = (await jiti.import(schemaPath)) as Record<string, unknown>

   const publicDir = resolve(root, (nuxt.dir as { public?: string })?.public ?? 'public')
   return {
      root,
      config,
      i18n,
      media: seedMedia(cms, publicDir),
      tables,
      database: seedDatabase(cms),
   }
}

export interface SeedCmsContentOptions extends LoadCmsProjectOptions {
   snapshot?: CmsContentSnapshot | unknown
   file?: string
   mode?: CmsContentImportMode
   dryRun?: boolean
   database?: CmsSeederOptions
}

function readSnapshot(root: string, options: SeedCmsContentOptions): unknown {
   if (options.snapshot !== undefined) return options.snapshot
   if (!options.file) throw new Error('[nuxt-cms] seed: pass a snapshot or a file')
   const path = resolve(root, options.file)
   const text = readFileSync(path, 'utf8')
   try {
      return JSON.parse(text)
   } catch (error) {
      throw new Error(`[nuxt-cms] seed: ${path} is not valid JSON: ${(error as Error).message}`)
   }
}

export async function seedCmsContent(
   options: SeedCmsContentOptions
): Promise<CmsContentImportResult> {
   const project = await loadCmsProject(options)
   const snapshot = readSnapshot(project.root, options)
   const seeder = await createCmsSeeder({
      ...project.database,
      ...options.database,
      root: project.root,
   })
   try {
      await seeder.migrate()
      const run = {
         db: seeder.db,
         config: project.config,
         tables: project.tables,
         i18n: project.i18n,
         media: project.media,
         snapshot,
         mode: options.mode,
      }
      if (!options.dryRun) return await importCmsContent(run)
      const prepared = await prepareCmsContent(run)
      if (prepared.issues.length) throw new CmsContentError(prepared.issues)
      return contentImportResult(project.config, prepared, true)
   } finally {
      await seeder.close()
   }
}
