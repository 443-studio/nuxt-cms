import { existsSync } from 'node:fs'
import { inArray, sql } from 'drizzle-orm'
import type { AnySQLiteColumn, BaseSQLiteDatabase, SQLiteTable } from 'drizzle-orm/sqlite-core'
import type {
   BlockConfig,
   CmsConfig,
   CmsEntry,
   CmsI18n,
   CmsPageRoute,
   FieldConfig,
} from '../../shared/index'
import {
   BLOCK_HIDDEN_KEY,
   declaresHiddenField,
   formatBlockPath,
   isTranslatableField,
   linkTargetOf,
   pageFields,
   pageRoutes,
   relationTarget,
   selectOptionValues,
   slugSourceValue,
   slugify,
   walkBlocks,
} from '../../shared/index'
import { uniqueFieldKeys } from '../../shared/duplicate'
import {
   isCaseInsensitiveUnique,
   uniqueCompareValue,
   withEntryDefaults,
} from '../../shared/field-options'
import { IMPORT_ID_PATTERN } from '../../shared/transfer'
import { buildEntrySchema, validationMessages } from '../../shared/validation'
import { customId } from './custom-id'
import { mediaKeysInTable, mediaKeysOf } from './media-keys'
import { scanMediaDirectory } from './media-sync'
import { chunks, KEY_CHUNK } from './write-statements'

export type CmsContentValues = Record<string, unknown>

export interface CmsContentSnapshot {
   pages?: Record<string, CmsContentValues>
   singles?: Record<string, CmsContentValues>
   collections?: Record<string, CmsContentValues[]>
   contents?: Record<string, CmsContentValues[]>
}

export type CmsContentSection = keyof CmsContentSnapshot

export type CmsContentImportMode = 'replace' | 'merge'

export interface CmsContentIssue {
   path: string
   message: string
}

export type CmsSeedMedia = { storage: 'local'; dir: string } | { storage: 's3' | 'filesystem' }

export interface CmsSeedDatabase {
   select: unknown
   insert: unknown
   update: unknown
   delete: unknown
}

export interface ValidateCmsContentOptions {
   config: CmsConfig
   snapshot: unknown
   i18n?: CmsI18n
   mode?: CmsContentImportMode
   db?: CmsSeedDatabase
   tables?: Record<string, unknown>
   media?: CmsSeedMedia | null
}

export interface PreparedContentRow {
   section: CmsContentSection
   name: string
   entry: CmsEntry
   id: string
   route: CmsPageRoute | null
   path: string
   fields: Record<string, FieldConfig>
   values: CmsContentValues
}

export interface PreparedContent {
   mode: CmsContentImportMode
   i18n: CmsI18n
   rows: PreparedContentRow[]
   names: string[]
   issues: CmsContentIssue[]
}

type Row = Record<string, unknown>

type SelectDb = Pick<BaseSQLiteDatabase<'sync' | 'async', unknown>, 'select'>

interface ValueVisit {
   path: string
   field: FieldConfig
   value: unknown
}

export const CMS_CONTENT_SECTIONS: CmsContentSection[] = [
   'pages',
   'singles',
   'collections',
   'contents',
]

const SECTION_KINDS: Record<CmsContentSection, CmsEntry['kind']> = {
   pages: 'page',
   singles: 'single',
   collections: 'collection',
   contents: 'content',
}

const IMPORT_MODES: CmsContentImportMode[] = ['replace', 'merge']

const AUTOMATIC_KEYS = ['createdAt', 'updatedAt']

const HINTED_CODES = new Set([
   'invalid_type',
   'invalid_union',
   'invalid_key',
   'invalid_element',
   'invalid_format',
])

const LISTED_MEDIA_KEYS = 20

const EMPTY_I18N: CmsI18n = { locales: [], defaultLocale: 'en' }

export class CmsContentError extends Error {
   readonly issues: CmsContentIssue[]

   constructor(issues: CmsContentIssue[]) {
      super(formatContentIssues(issues))
      this.name = 'CmsContentError'
      this.issues = issues
   }
}

export function formatContentIssues(issues: CmsContentIssue[]): string {
   const count = `${issues.length} ${issues.length === 1 ? 'issue' : 'issues'}`
   return [
      `[nuxt-cms] The content snapshot has ${count}:`,
      ...issues.map((issue) => `- ${issue.path}: ${issue.message}`),
   ].join('\n')
}

function isRecord(value: unknown): value is Row {
   return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isBlank(value: unknown): boolean {
   return value === undefined || value === null || (typeof value === 'string' && !value.trim())
}

function quoted(values: readonly string[]): string {
   return values.length ? values.map((value) => JSON.stringify(value)).join(', ') : '(none)'
}

function editDistance(a: string, b: string): number {
   let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
   for (let i = 1; i <= a.length; i++) {
      const current = [i]
      for (let j = 1; j <= b.length; j++) {
         const cost = a[i - 1] === b[j - 1] ? 0 : 1
         current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost)
      }
      previous = current
   }
   return previous[b.length]!
}

function closestName(name: string, candidates: readonly string[]): string | null {
   let best: string | null = null
   let bestDistance = Number.POSITIVE_INFINITY
   for (const candidate of candidates) {
      const distance = editDistance(name.toLowerCase(), candidate.toLowerCase())
      if (distance < bestDistance) {
         best = candidate
         bestDistance = distance
      }
   }
   return best !== null && bestDistance <= Math.max(2, Math.floor(name.length / 3)) ? best : null
}

function unknownNameMessage(kind: string, name: string, candidates: readonly string[]): string {
   const suggestion = closestName(name, candidates)
   const hint = suggestion ? `did you mean ${JSON.stringify(suggestion)}? ` : ''
   return `unknown ${kind} ${JSON.stringify(name)}; ${hint}allowed: ${quoted(candidates)}`
}

function joinPath(base: string, segments: readonly (string | number)[]): string {
   return [base, ...segments.map(String)].filter((part) => part !== '').join('.')
}

function sectionOf(entry: CmsEntry): CmsContentSection {
   return (Object.keys(SECTION_KINDS) as CmsContentSection[]).find(
      (section) => SECTION_KINDS[section] === entry.kind
   )!
}

function entriesOfKind(config: CmsConfig, kind: CmsEntry['kind']): string[] {
   return Object.entries(config)
      .filter(([, entry]) => entry.kind === kind)
      .map(([name]) => name)
}

function expectedValue(field: FieldConfig, i18n: CmsI18n): string {
   if (isTranslatableField(field) && i18n.locales.length) {
      const inner =
         field.type === 'media'
            ? 'media library keys'
            : field.type === 'richtext'
              ? 'HTML strings'
              : 'strings'
      return `an object of ${inner} by locale, like { "${
         i18n.defaultLocale
      }": ... } (locales: ${i18n.locales.join(', ')})`
   }
   switch (field.type) {
      case 'richtext':
         return 'an HTML string'
      case 'email':
         return 'an email address string'
      case 'slug':
         return 'a slug string (lowercase letters, numbers, dashes)'
      case 'date':
         return 'a date string yyyy-mm-dd'
      case 'datetime':
         return 'an ISO 8601 date-time string with a time zone, like "2026-05-01T08:30:00Z"'
      case 'number':
         return field.integer ? 'an integer' : 'a number'
      case 'boolean':
         return 'true or false'
      case 'select':
         return field.multiple
            ? `an array of ${quoted(selectOptionValues(field))}`
            : `one of ${quoted(selectOptionValues(field))}`
      case 'tags':
         return 'an array of strings'
      case 'json':
         return 'any JSON value'
      case 'media':
         return 'a media library key string, like "hero.webp"'
      case 'relation':
         return field.cardinality === 'many-to-many'
            ? `an array of ${relationTarget(field)} ids`
            : `a ${relationTarget(field)} id string`
      case 'link':
         return `{ "url": "/path" } or { "entry": "<entry>", "id": "<id>" }${
            field.withLabel ? ', with an optional "label"' : ''
         }`
      case 'blocks':
         return `an array of blocks like { "type": "<block>", ...fields } (types: ${Object.keys(
            field.blocks ?? {}
         ).join(', ')})`
      default:
         return 'a string'
   }
}

function fieldAtPath(
   fields: Record<string, FieldConfig>,
   values: unknown,
   segments: readonly PropertyKey[]
): FieldConfig | null {
   let scope = fields
   let current: unknown = values
   let found: FieldConfig | null = null
   for (const segment of segments) {
      if (found?.type === 'blocks' && typeof segment === 'number') {
         const item = Array.isArray(current) ? current[segment] : undefined
         const block = isRecord(item) ? found.blocks?.[String(item.type)] : undefined
         if (!block) return found
         scope = block.fields
         current = item
         found = null
         continue
      }
      if (found) return found
      const key = String(segment)
      const field = Object.hasOwn(scope, key) ? scope[key] : undefined
      if (!field) return null
      found = field
      current = isRecord(current) ? current[key] : undefined
   }
   return found
}

function valueAtPath(values: unknown, segments: readonly PropertyKey[]): unknown {
   let current = values
   for (const segment of segments) {
      if (Array.isArray(current) && typeof segment === 'number') current = current[segment]
      else if (isRecord(current)) current = current[String(segment)]
      else return undefined
   }
   return current
}

function hintedMessage(
   issue: { code?: string; message: string },
   field: FieldConfig | null,
   value: unknown,
   i18n: CmsI18n
): string {
   if (!field) return issue.message
   const m = validationMessages()
   if (issue.message === m.unknownLocale && isRecord(value)) {
      const unknown = Object.keys(value).filter((locale) => !i18n.locales.includes(locale))
      return `unknown locale ${quoted(unknown)}; use only ${quoted(i18n.locales)}`
   }
   const hinted =
      HINTED_CODES.has(issue.code ?? '') ||
      issue.message === m.required ||
      issue.message === m.unknownLocale ||
      issue.message === m.requiredLocale(i18n.defaultLocale) ||
      issue.message === m.linkTarget ||
      issue.message === m.linkUrlAndTarget
   return hinted ? `${issue.message}; expected ${expectedValue(field, i18n)}` : issue.message
}

class IssueList {
   readonly items: CmsContentIssue[] = []
   private readonly blocked: string[] = []

   add(path: string, message: string) {
      this.items.push({ path, message })
   }

   skip(path: string) {
      this.blocked.push(path)
   }

   isBlocked(path: string): boolean {
      return this.blocked.some((prefix) => path === prefix || path.startsWith(`${prefix}.`))
   }
}

function checkBlockItems(field: FieldConfig, list: unknown[], path: string, issues: IssueList) {
   const types = Object.keys(field.blocks ?? {})
   list.forEach((item, index) => {
      const itemPath = `${path}.${index}`
      if (!isRecord(item)) {
         issues.add(itemPath, `expected a block object like { "type": "<block>", ...fields }`)
         issues.skip(itemPath)
         return
      }
      const type = item.type
      if (typeof type !== 'string' || !Object.hasOwn(field.blocks ?? {}, type)) {
         issues.add(
            `${itemPath}.type`,
            typeof type === 'string'
               ? unknownNameMessage('block type', type, types)
               : `missing block type; allowed: ${quoted(types)}`
         )
         issues.skip(itemPath)
         return
      }
      const block = field.blocks![type] as BlockConfig
      const extra = declaresHiddenField(block) ? ['type'] : ['type', BLOCK_HIDDEN_KEY]
      checkKeys(block.fields, item, itemPath, extra, [], issues)
   })
}

function checkKeys(
   fields: Record<string, FieldConfig>,
   values: Row,
   path: string,
   extra: readonly string[],
   automatic: readonly string[],
   issues: IssueList
) {
   const allowed = [...Object.keys(fields), ...extra]
   for (const key of Object.keys(values)) {
      if (Object.hasOwn(fields, key) || extra.includes(key)) continue
      if (automatic.includes(key)) {
         issues.add(`${path}.${key}`, 'is set automatically; leave it out')
         continue
      }
      issues.add(`${path}.${key}`, unknownNameMessage('field', key, allowed))
   }
   for (const [key, field] of Object.entries(fields)) {
      const value = values[key]
      if (field.type === 'blocks' && Array.isArray(value))
         checkBlockItems(field, value, `${path}.${key}`, issues)
   }
}

function fillSlugs(fields: Record<string, FieldConfig>, input: Row, i18n: CmsI18n) {
   for (const [key, field] of Object.entries(fields)) {
      if (field.type !== 'slug' || !field.from || !isBlank(input[key])) continue
      const source = slugSourceValue(fields[field.from], input[field.from], i18n.defaultLocale)
      const slug = source ? slugify(source) : ''
      if (slug) input[key] = slug
   }
}

function parseRow(
   context: { config: CmsConfig; i18n: CmsI18n },
   row: Omit<PreparedContentRow, 'values'>,
   raw: Row,
   extra: readonly string[],
   automatic: readonly string[],
   issues: IssueList
): PreparedContentRow {
   const { config, i18n } = context
   checkKeys(row.fields, raw, row.path, extra, automatic, issues)
   const input: Row = Object.fromEntries(
      Object.entries(raw).filter(
         ([key]) => Object.hasOwn(row.fields, key) || (key === 'status' && row.entry.drafts)
      )
   )
   fillSlugs(row.fields, input, i18n)
   if (row.entry.drafts && input.status === undefined) input.status = 'published'
   const schema = buildEntrySchema(
      {
         ...row.entry,
         fields: row.fields,
         config,
         ...(row.route ? { path: row.route.path } : {}),
      },
      i18n
   )
   const filled = withEntryDefaults(row.fields, input, i18n)
   const result = schema.safeParse(filled)
   if (result.success) return { ...row, values: result.data as Row }
   for (const issue of result.error.issues) {
      const path = joinPath(row.path, issue.path as (string | number)[])
      if (issues.isBlocked(path)) continue
      const isStatus = issue.path[0] === 'status' && !Object.hasOwn(row.fields, 'status')
      issues.add(
         path,
         isStatus
            ? `${issue.message}; expected "published" or "draft"`
            : hintedMessage(
                 issue,
                 fieldAtPath(row.fields, input, issue.path),
                 valueAtPath(input, issue.path),
                 i18n
              )
      )
   }
   return { ...row, values: filled }
}

function sectionEntry(
   config: CmsConfig,
   section: CmsContentSection,
   name: string,
   issues: IssueList
): CmsEntry | null {
   const kind = SECTION_KINDS[section]
   const entry = Object.hasOwn(config, name) ? config[name] : undefined
   const path = `${section}.${name}`
   if (!entry) {
      issues.add(path, unknownNameMessage(`${kind} entry`, name, entriesOfKind(config, kind)))
      return null
   }
   if (entry.kind !== kind) {
      issues.add(path, `${name} is a ${entry.kind} entry; put it under "${sectionOf(entry)}"`)
      return null
   }
   return entry
}

function rowId(entry: CmsEntry, raw: Row, path: string, issues: IssueList): string {
   const id = raw.id
   if (id === undefined || id === null || id === '') return customId(entry.id)
   if (typeof id === 'string' && IMPORT_ID_PATTERN.test(id)) return id
   issues.add(`${path}.id`, 'invalid id; use 1 to 128 letters, numbers, _ and -')
   return customId(entry.id)
}

function collectRows(
   snapshot: Row,
   config: CmsConfig,
   i18n: CmsI18n,
   issues: IssueList
): { rows: PreparedContentRow[]; names: string[] } {
   const context = { config, i18n }
   const rows: PreparedContentRow[] = []
   const names = new Set<string>()
   const keep = (row: PreparedContentRow) => rows.push(row)

   const pages = snapshot.pages
   if (pages !== undefined) {
      const pageEntries = entriesOfKind(config, 'page')
      const name = pageEntries[0]
      if (!isRecord(pages)) issues.add('pages', 'expected an object of page values by path')
      else if (!name && Object.keys(pages).length)
         issues.add('pages', 'the cms config has no page entry')
      else if (name) {
         const entry = config[name]!
         const routes = pageRoutes(entry)
         names.add(name)
         for (const [pagePath, raw] of Object.entries(pages)) {
            const path = `pages.${pagePath}`
            const route = routes.find((candidate) => candidate.path === pagePath)
            if (!route) {
               issues.add(
                  path,
                  unknownNameMessage(
                     'page path',
                     pagePath,
                     routes.map((candidate) => candidate.path)
                  )
               )
               continue
            }
            if (!isRecord(raw)) {
               issues.add(path, 'expected an object of field values')
               continue
            }
            const fields = pageFields(entry, route.path)
            const row = {
               section: 'pages' as const,
               name,
               entry,
               id: route.key,
               route,
               path,
               fields,
            }
            keep(parseRow(context, row, raw, [], ['id', 'path', ...AUTOMATIC_KEYS], issues))
         }
      }
   }

   const singles = snapshot.singles
   if (singles !== undefined) {
      if (!isRecord(singles)) issues.add('singles', 'expected an object of single values by entry')
      else
         for (const [name, raw] of Object.entries(singles)) {
            const entry = sectionEntry(config, 'singles', name, issues)
            if (!entry) continue
            names.add(name)
            const path = `singles.${name}`
            if (!isRecord(raw)) {
               issues.add(path, 'expected an object of field values')
               continue
            }
            const row = {
               section: 'singles' as const,
               name,
               entry,
               id: entry.id,
               route: null,
               path,
               fields: entry.fields,
            }
            const extra = entry.drafts ? ['status'] : []
            keep(parseRow(context, row, raw, extra, ['id', ...AUTOMATIC_KEYS], issues))
         }
   }

   for (const section of ['collections', 'contents'] as const) {
      const lists = snapshot[section]
      if (lists === undefined) continue
      if (!isRecord(lists)) {
         issues.add(section, 'expected an object of entry lists by entry')
         continue
      }
      for (const [name, list] of Object.entries(lists)) {
         const entry = sectionEntry(config, section, name, issues)
         if (!entry) continue
         if (!Array.isArray(list)) {
            issues.add(`${section}.${name}`, 'expected an array of entries')
            continue
         }
         names.add(name)
         const seen = new Map<string, string>()
         list.forEach((raw: unknown, index) => {
            const path = `${section}.${name}.${index}`
            if (!isRecord(raw)) {
               issues.add(path, 'expected an object of field values')
               return
            }
            const id = rowId(entry, raw, path, issues)
            const first = seen.get(id)
            if (first) issues.add(`${path}.id`, `same id as ${first}`)
            else seen.set(id, path)
            const row = { section, name, entry, id, route: null, path, fields: entry.fields }
            const extra = entry.drafts ? ['id', 'status'] : ['id']
            keep(parseRow(context, row, raw, extra, AUTOMATIC_KEYS, issues))
         })
      }
   }
   return { rows, names: [...names] }
}

function visitValues(
   fields: Record<string, FieldConfig>,
   values: Row,
   base: string,
   visit: (visit: ValueVisit) => void
) {
   for (const [key, field] of Object.entries(fields)) {
      if (field.type !== 'blocks') visit({ path: `${base}.${key}`, field, value: values[key] })
   }
   walkBlocks(fields, values, ({ item, block, path }) => {
      for (const [key, field] of Object.entries(block.fields)) {
         if (field.type === 'blocks') continue
         visit({ path: `${base}.${formatBlockPath(path)}.${key}`, field, value: item[key] })
      }
   })
}

function tableOf(
   config: CmsConfig,
   tables: Record<string, unknown> | undefined,
   name: string
): SQLiteTable | undefined {
   return (config[name]?.table ?? tables?.[name]) as SQLiteTable | undefined
}

async function existingIds(db: SelectDb, table: SQLiteTable, ids: string[]): Promise<Set<string>> {
   const column = (table as unknown as Record<string, AnySQLiteColumn>).id!
   const found = new Set<string>()
   for (const chunk of chunks([...new Set(ids)], KEY_CHUNK)) {
      const rows = (await db.select({ id: column }).from(table).where(inArray(column, chunk))) as {
         id: unknown
      }[]
      for (const row of rows) found.add(String(row.id))
   }
   return found
}

interface ReferenceCheck {
   path: string
   target: string
   id: string
}

async function checkReferences(
   rows: PreparedContentRow[],
   replaced: Set<string>,
   options: ValidateCmsContentOptions,
   issues: IssueList
) {
   const { config } = options
   const declared = new Map<string, Set<string>>()
   for (const row of rows) {
      if (row.section !== 'collections' && row.section !== 'contents') continue
      const ids = declared.get(row.name) ?? new Set<string>()
      ids.add(row.id)
      declared.set(row.name, ids)
   }
   const checks: ReferenceCheck[] = []
   for (const row of rows) {
      visitValues(row.fields, row.values, row.path, ({ path, field, value }) => {
         if (field.type === 'relation') {
            const target = relationTarget(field)
            const ids = Array.isArray(value) ? value : value == null ? [] : [value]
            for (const id of ids) if (typeof id === 'string') checks.push({ path, target, id })
            return
         }
         if (field.type !== 'link') return
         const link = linkTargetOf(value)
         const entry = link ? config[link.entry] : undefined
         if (link && entry && entry.kind !== 'page')
            checks.push({ path, target: link.entry, ...link })
      })
   }
   const unresolved = checks.filter((check) => !declared.get(check.target)?.has(check.id))
   const lookups = new Map<string, Set<string>>()
   const db = options.db as SelectDb | undefined
   for (const target of new Set(unresolved.map((check) => check.target))) {
      if (replaced.has(target)) continue
      const table = tableOf(config, options.tables, target)
      if (!db || !table) continue
      const ids = unresolved.filter((check) => check.target === target).map((check) => check.id)
      lookups.set(target, await existingIds(db, table, ids))
   }
   for (const check of unresolved) {
      const found = lookups.get(check.target)
      if (!replaced.has(check.target) && (!found || found.has(check.id))) continue
      const entry = config[check.target]
      const section = entry ? sectionOf(entry) : 'collections'
      const hint = replaced.has(check.target)
         ? `declare it with "id" in ${section}.${check.target} (replace mode clears ${check.target})`
         : `declare it with "id" in ${section}.${check.target} or use the id of an existing entry`
      issues.add(check.path, `unknown ${check.target} id ${JSON.stringify(check.id)}; ${hint}`)
   }
}

async function checkUnique(
   rows: PreparedContentRow[],
   options: ValidateCmsContentOptions,
   mode: CmsContentImportMode,
   issues: IssueList
) {
   const db = options.db as SelectDb | undefined
   const byEntry = new Map<string, PreparedContentRow[]>()
   for (const row of rows) {
      if (row.section !== 'collections' && row.section !== 'contents') continue
      byEntry.set(row.name, [...(byEntry.get(row.name) ?? []), row])
   }
   for (const [name, entryRows] of byEntry) {
      const entry = entryRows[0]!.entry
      const table = tableOf(options.config, options.tables, name)
      const ids = new Set(entryRows.map((row) => row.id))
      for (const key of uniqueFieldKeys(entry)) {
         const field = entry.fields[key]!
         const owners = new Map<unknown, PreparedContentRow>()
         for (const row of entryRows) {
            const value = row.values[key]
            if (!((typeof value === 'string' && value) || typeof value === 'number')) continue
            const compared = uniqueCompareValue(field, value)
            const owner = owners.get(compared)
            if (owner) issues.add(`${row.path}.${key}`, `same value as ${owner.path}.${key}`)
            else owners.set(compared, row)
         }
         if (mode !== 'merge' || !db || !table || !owners.size) continue
         const column = (table as unknown as Record<string, AnySQLiteColumn>)[key]
         const idColumn = (table as unknown as Record<string, AnySQLiteColumn>).id
         if (!column || !idColumn) continue
         const lower = isCaseInsensitiveUnique(field)
         for (const chunk of chunks([...owners.keys()], KEY_CHUNK)) {
            const found = (await db
               .select({ id: idColumn, value: column })
               .from(table)
               .where(lower ? inArray(sql`lower(${column})`, chunk) : inArray(column, chunk))) as {
               id: unknown
               value: unknown
            }[]
            for (const match of found) {
               const owner = owners.get(uniqueCompareValue(field, match.value))
               const id = String(match.id)
               if (owner && owner.id !== id && !ids.has(id))
                  issues.add(
                     `${owner.path}.${key}`,
                     `already used by the existing ${name} entry ${JSON.stringify(id)}`
                  )
            }
         }
      }
   }
}

async function mediaLookup(
   options: ValidateCmsContentOptions
): Promise<
   { known: (keys: string[]) => Promise<Set<string>>; listed: string[] | null } | string | null
> {
   const media = options.media
   if (!media) return null
   if (media.storage === 'local') {
      if (!media.dir || !existsSync(media.dir))
         return `the local media folder ${media.dir || '(not set)'} does not exist`
      const files = (await scanMediaDirectory(media.dir)).map((file) => file.key)
      const set = new Set(files)
      return { known: async (keys) => new Set(keys.filter((key) => set.has(key))), listed: files }
   }
   const table = options.tables?.cms_media as SQLiteTable | undefined
   const db = options.db as SelectDb | undefined
   if (!db || !table) return null
   return { known: (keys) => mediaKeysInTable(db, table, keys), listed: null }
}

function availableMedia(listed: string[] | null, key: string): string {
   if (!listed) return 'upload it to the media library first'
   if (!listed.length) return 'the media folder is empty'
   const stem = (value: string) => value.replace(/\.[^./]*$/, '').toLowerCase()
   const suggestion =
      listed.find((candidate) => stem(candidate) === stem(key)) ?? closestName(key, listed)
   const shown = listed.slice(0, LISTED_MEDIA_KEYS)
   const more = listed.length > shown.length ? ` and ${listed.length - shown.length} more` : ''
   return `${suggestion ? `did you mean ${JSON.stringify(suggestion)}? ` : ''}available: ${quoted(
      shown
   )}${more}`
}

async function checkMedia(
   rows: PreparedContentRow[],
   options: ValidateCmsContentOptions,
   issues: IssueList
) {
   const references: { path: string; key: string }[] = []
   for (const row of rows) {
      visitValues(row.fields, row.values, row.path, ({ path, field, value }) => {
         if (field.type !== 'media') return
         for (const key of mediaKeysOf(value)) references.push({ path, key })
      })
   }
   if (!references.length) return
   const lookup = await mediaLookup(options)
   if (!lookup) return
   if (typeof lookup === 'string') {
      issues.add('media', lookup)
      return
   }
   const known = await lookup.known([...new Set(references.map((reference) => reference.key))])
   for (const reference of references) {
      if (known.has(reference.key)) continue
      issues.add(
         reference.path,
         `media ${JSON.stringify(reference.key)} not found in the media library; ${availableMedia(
            lookup.listed,
            reference.key
         )}`
      )
   }
}

export async function prepareCmsContent(
   options: ValidateCmsContentOptions
): Promise<PreparedContent> {
   const mode = options.mode ?? 'replace'
   if (!IMPORT_MODES.includes(mode))
      throw new Error(`[nuxt-cms] Unknown content import mode: ${String(mode)}`)
   const i18n = options.i18n ?? EMPTY_I18N
   const issues = new IssueList()
   const snapshot = options.snapshot
   if (!isRecord(snapshot)) {
      issues.add('snapshot', `expected an object with ${quoted(CMS_CONTENT_SECTIONS)}`)
      return { mode, i18n, rows: [], names: [], issues: issues.items }
   }
   for (const key of Object.keys(snapshot)) {
      if (!CMS_CONTENT_SECTIONS.includes(key as CmsContentSection))
         issues.add(key, unknownNameMessage('section', key, CMS_CONTENT_SECTIONS))
   }
   const { rows, names } = collectRows(snapshot, options.config, i18n, issues)
   const replaced = new Set(mode === 'replace' ? names : [])
   await checkReferences(rows, replaced, options, issues)
   await checkUnique(rows, options, mode, issues)
   await checkMedia(rows, options, issues)
   return { mode, i18n, rows, names, issues: issues.items }
}

export async function validateCmsContent(
   options: ValidateCmsContentOptions
): Promise<CmsContentIssue[]> {
   return (await prepareCmsContent(options)).issues
}
