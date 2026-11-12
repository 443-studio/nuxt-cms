import type { SQL } from 'drizzle-orm'
import { and, asc, eq, gt, isNull, or, sql } from 'drizzle-orm'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import cmsConfig from '#cms-config'
import { useDb } from '#cms-db'
import type {
   CmsConfig,
   CmsEntry,
   CmsI18n,
   SitemapChunk,
   SitemapSourceSize,
   SitemapUrl,
} from '../../shared/index'
import {
   CONTENT_NOINDEX_FIELD,
   CONTENT_PUBLISHED_AT_FIELD,
   CONTENT_SLUG_FIELD,
   contentItemPaths,
   contentRouteLocales,
   contentRoutePatterns,
   isRoutedContent,
   pageRoutes,
   pageSitemapUrls,
   sitemapLastmod,
   sitemapUrlsForPaths,
} from '../../shared/index'
import { readPages } from './page-storage'
import { resolveTable, tableColumns } from './registry'
import { visibilityConditions } from './visibility'

const BATCH_SIZE = 1000

export const PAGES_SOURCE = ''

export interface SitemapContext {
   siteUrl: string
   i18n: CmsI18n
}

export interface SitemapPlan {
   pages: SitemapUrl[]
   sizes: SitemapSourceSize[]
}

function contentWhere(entry: CmsEntry, table: SQLiteTable): SQL[] {
   const columns = tableColumns(table)
   const conditions = visibilityConditions(entry, columns)
   const noindex = columns[CONTENT_NOINDEX_FIELD]
   if (noindex) conditions.push(or(isNull(noindex), eq(noindex, false))!)
   return conditions
}

function routedEntries(): [string, CmsEntry, SQLiteTable][] {
   const entries: [string, CmsEntry, SQLiteTable][] = []
   for (const [name, entry] of Object.entries(cmsConfig as CmsConfig)) {
      const table = isRoutedContent(entry) ? resolveTable(name) : undefined
      if (table) entries.push([name, entry, table])
   }
   return entries
}

async function readPageUrls(siteUrl: string): Promise<SitemapUrl[]> {
   const found = Object.entries(cmsConfig as CmsConfig).find(([, entry]) => entry.kind === 'page')
   if (!found) return []
   const [name, entry] = found
   const table = resolveTable(name)
   if (!table) return []
   const rows = await readPages(name, entry, table)
   return pageSitemapUrls(
      pageRoutes(entry).map((route) => route.path),
      rows,
      siteUrl
   )
}

async function countContent(entry: CmsEntry, table: SQLiteTable): Promise<number> {
   const where = contentWhere(entry, table)
   const [counted] = await useDb()
      .select({ total: sql<number>`count(*)` })
      .from(table)
      .where(where.length ? and(...where) : undefined)
   return Number(counted?.total ?? 0)
}

export async function planSitemap(context: SitemapContext): Promise<SitemapPlan> {
   const pages = await readPageUrls(context.siteUrl)
   const sizes: SitemapSourceSize[] = [
      { source: PAGES_SOURCE, count: pages.length, urlsPerItem: 1 },
   ]
   for (const [name, entry, table] of routedEntries()) {
      sizes.push({
         source: name,
         count: await countContent(entry, table),
         urlsPerItem: contentRoutePatterns(entry.route).length,
      })
   }
   return { pages, sizes: sizes.filter((size) => size.count > 0) }
}

async function* contentUrls(
   name: string,
   context: SitemapContext,
   offset: number,
   limit: number
): AsyncGenerator<SitemapUrl[]> {
   const entry = (cmsConfig as CmsConfig)[name]
   const table = resolveTable(name)
   if (!entry || !table) return
   const columns = tableColumns(table)
   const where = contentWhere(entry, table)
   const locales = contentRouteLocales(context.i18n)
   let lastId: string | null = null
   let remaining = limit
   while (remaining > 0) {
      const conditions: SQL[] = lastId === null ? where : [...where, gt(columns.id!, lastId)]
      const query = useDb()
         .select({
            id: columns.id!,
            slug: columns[CONTENT_SLUG_FIELD]!,
            publishedAt: columns[CONTENT_PUBLISHED_AT_FIELD]!,
            updatedAt: columns.updatedAt!,
         })
         .from(table)
         .where(conditions.length ? and(...conditions) : undefined)
         .orderBy(asc(columns.id!))
         .limit(Math.min(BATCH_SIZE, remaining))
      const rows = (await (lastId === null && offset ? query.offset(offset) : query)) as Record<
         string,
         unknown
      >[]
      if (!rows.length) return
      remaining -= rows.length
      lastId = String(rows.at(-1)!.id)
      yield rows.flatMap((row) =>
         sitemapUrlsForPaths(
            contentItemPaths(entry, row, locales),
            context.siteUrl,
            context.i18n.defaultLocale,
            sitemapLastmod(row.updatedAt)
         )
      )
      if (rows.length < BATCH_SIZE) return
   }
}

export async function* sitemapChunkUrls(
   plan: SitemapPlan,
   chunks: readonly SitemapChunk[],
   context: SitemapContext
): AsyncGenerator<SitemapUrl[]> {
   for (const chunk of chunks) {
      if (chunk.source === PAGES_SOURCE) {
         yield plan.pages.slice(chunk.offset, chunk.offset + chunk.limit)
         continue
      }
      yield* contentUrls(chunk.source, context, chunk.offset, chunk.limit)
   }
}
