import { asc, eq, inArray } from 'drizzle-orm'
import { createError } from 'h3'
import { z } from 'zod'
import cmsConfig from '#cms-config'
import { runBatch, useDb } from '#cms-db'
import { cms_redirects } from '#cms-tables'
import type {
   CmsConfig,
   CmsContentMoves,
   CmsContentRouteItem,
   CmsEntry,
   CmsRedirect,
   CmsRedirectDraft,
   CmsRedirectInput,
   CmsRedirectPlan,
   CmsRedirectStatus,
   CmsRedirectTarget,
} from '../../shared/index'
import {
   REDIRECT_FROM_MAX_LENGTH,
   REDIRECT_STATUSES,
   REDIRECT_TO_MAX_LENGTH,
   contentItemMoves,
   contentRouteLocales,
   matchContentPath,
   normalizeRedirectInput,
   normalizeRedirectPath,
   pageRoutes,
   planRedirectMoves,
   redirectErrors,
   redirectFromErrors,
   redirectTargetMap,
   redirectToErrors,
} from '../../shared/index'
import { normalizeTimestamp, nowTimestamp } from '../../shared/timestamps'
import { cachedValue } from './cached-value'
import { findContentByPath } from './content-routes'
import { customId } from './custom-id'
import { mapConstraintErrors } from './db-errors'
import { getContentI18n } from './registry'

export const REDIRECTS_CACHE_TTL_MS = 30_000

type RedirectRow = typeof cms_redirects.$inferSelect

type WriteDb = Parameters<Parameters<typeof runBatch>[0]>[0]

export const redirectInputSchema = z
   .object({
      from: z.string().max(REDIRECT_FROM_MAX_LENGTH),
      to: z.string().max(REDIRECT_TO_MAX_LENGTH),
      status: z.literal(REDIRECT_STATUSES).optional(),
      keepQuery: z.boolean().optional(),
   })
   .strict()

export function toRedirect(row: RedirectRow): CmsRedirect {
   return {
      id: row.id,
      from: row.from,
      to: row.to,
      status: row.status as CmsRedirectStatus,
      keepQuery: !!row.keepQuery,
      source: row.source === 'auto' ? 'auto' : 'manual',
      createdAt: String(normalizeTimestamp(row.createdAt)),
      updatedAt: String(normalizeTimestamp(row.updatedAt)),
   }
}

export async function listRedirects(): Promise<CmsRedirect[]> {
   const rows = await useDb().select().from(cms_redirects).orderBy(asc(cms_redirects.from))
   return rows.map(toRedirect)
}

async function loadRedirectTable(): Promise<Map<string, CmsRedirectTarget>> {
   const rows = await useDb()
      .select({
         from: cms_redirects.from,
         to: cms_redirects.to,
         status: cms_redirects.status,
         keepQuery: cms_redirects.keepQuery,
      })
      .from(cms_redirects)
   return new Map(
      rows.map((row) => [
         row.from,
         { to: row.to, status: row.status as CmsRedirectStatus, keepQuery: !!row.keepQuery },
      ])
   )
}

const redirectsCache = cachedValue(loadRedirectTable, REDIRECTS_CACHE_TTL_MS)

export function readRedirectTable(): Promise<Map<string, CmsRedirectTarget>> {
   return redirectsCache.get()
}

export function invalidateRedirects() {
   redirectsCache.invalidate()
}

function invalid(errors: string[]) {
   const duplicate = errors.some((error) => error.startsWith('A redirect from'))
   return createError({
      statusCode: duplicate ? 409 : 400,
      statusMessage: duplicate ? 'Duplicate redirect' : 'Invalid redirect',
      message: errors.join('. '),
   })
}

function otherTargets(redirects: readonly CmsRedirect[], skipId?: string) {
   return redirectTargetMap(redirects.filter((redirect) => redirect.id !== skipId))
}

let pendingWrite: Promise<unknown> = Promise.resolve()

export function serializeRedirectWrite<T>(write: () => Promise<T>): Promise<T> {
   const run = pendingWrite.then(write)
   pendingWrite = run.catch(() => {})
   return run
}

export function createRedirect(input: CmsRedirectInput): Promise<CmsRedirect> {
   return serializeRedirectWrite(() => writeNewRedirect(input))
}

async function writeNewRedirect(input: CmsRedirectInput): Promise<CmsRedirect> {
   const errors = redirectErrors(input, otherTargets(await listRedirects()))
   if (errors.length) throw invalid(errors)
   const draft = normalizeRedirectInput(input)
   const now = nowTimestamp()
   const [row] = await mapConstraintErrors(() =>
      useDb()
         .insert(cms_redirects)
         .values({
            id: customId('rdr'),
            ...draft,
            source: 'manual',
            createdAt: now,
            updatedAt: now,
         })
         .returning()
   )
   invalidateRedirects()
   return toRedirect(row!)
}

export function updateRedirect(id: string, input: CmsRedirectInput): Promise<CmsRedirect> {
   return serializeRedirectWrite(() => writeRedirectUpdate(id, input))
}

async function writeRedirectUpdate(id: string, input: CmsRedirectInput): Promise<CmsRedirect> {
   const redirects = await listRedirects()
   if (!redirects.some((redirect) => redirect.id === id))
      throw createError({ statusCode: 404, statusMessage: 'Redirect not found' })
   const errors = redirectErrors(input, otherTargets(redirects, id))
   if (errors.length) throw invalid(errors)
   const draft = normalizeRedirectInput(input)
   const [row] = await mapConstraintErrors(() =>
      useDb()
         .update(cms_redirects)
         .set({ ...draft, source: 'manual', updatedAt: nowTimestamp() })
         .where(eq(cms_redirects.id, id))
         .returning()
   )
   invalidateRedirects()
   return toRedirect(row!)
}

export async function deleteRedirects(ids: string[]): Promise<number> {
   const rows = await useDb()
      .delete(cms_redirects)
      .where(inArray(cms_redirects.id, ids))
      .returning({ id: cms_redirects.id })
   invalidateRedirects()
   return rows.length
}

function importError(errors: string[]) {
   const shown = errors.slice(0, 10)
   if (errors.length > shown.length) shown.push(`and ${errors.length - shown.length} more`)
   return createError({
      statusCode: 400,
      statusMessage: 'Invalid redirects',
      message: shown.join('. '),
   })
}

export interface RedirectImportResult {
   created: number
   updated: number
}

export function importRedirects(inputs: CmsRedirectInput[]): Promise<RedirectImportResult> {
   return serializeRedirectWrite(() => writeRedirectImport(inputs))
}

async function writeRedirectImport(inputs: CmsRedirectInput[]): Promise<RedirectImportResult> {
   const errors: string[] = []
   inputs.forEach((input, index) => {
      for (const error of [...redirectFromErrors(input.from), ...redirectToErrors(input.to)])
         errors.push(`Row ${index + 1}: ${error}`)
   })
   if (errors.length) throw importError(errors)
   const drafts = inputs.map(normalizeRedirectInput)
   const existing = await listRedirects()
   const byFrom = new Map(existing.map((redirect) => [redirect.from, redirect]))
   const final = new Map<string, CmsRedirectDraft>(
      existing.map((redirect) => [redirect.from, redirect])
   )
   const seen = new Set<string>()
   drafts.forEach((draft, index) => {
      if (seen.has(draft.from)) errors.push(`Row ${index + 1}: ${draft.from} is listed twice`)
      seen.add(draft.from)
      final.set(draft.from, draft)
   })
   const targets = redirectTargetMap([...final.values()])
   drafts.forEach((draft, index) => {
      const others = new Map(targets)
      others.delete(draft.from)
      for (const error of redirectErrors(draft, others)) errors.push(`Row ${index + 1}: ${error}`)
   })
   if (errors.length) throw importError(errors)
   const now = nowTimestamp()
   let created = 0
   let updated = 0
   await mapConstraintErrors(() =>
      runBatch((db) =>
         drafts.map((draft) => {
            const current = byFrom.get(draft.from)
            if (current) {
               updated += 1
               return db
                  .update(cms_redirects)
                  .set({ ...draft, source: 'manual', updatedAt: now })
                  .where(eq(cms_redirects.id, current.id))
            }
            created += 1
            return db.insert(cms_redirects).values({
               id: customId('rdr'),
               ...draft,
               source: 'manual',
               createdAt: now,
               updatedAt: now,
            })
         })
      )
   )
   invalidateRedirects()
   return { created, updated }
}

function isStaticPath(path: string) {
   return path.startsWith('/') && !/[[\]:*]/.test(path)
}

export async function isLivePath(path: string): Promise<boolean> {
   const config = cmsConfig as CmsConfig
   const normalized = normalizeRedirectPath(path)
   for (const entry of Object.values(config)) {
      if (entry.kind !== 'page') continue
      if (
         pageRoutes(entry).some(
            (route) => isStaticPath(route.path) && normalizeRedirectPath(route.path) === normalized
         )
      )
         return true
   }
   for (const locale of contentRouteLocales(getContentI18n())) {
      for (const match of matchContentPath(config, normalized, locale)) {
         if (await findContentByPath(match.entry, normalized, locale)) return true
      }
   }
   return false
}

export function contentMovesOf(
   entry: CmsEntry,
   before: CmsContentRouteItem | undefined,
   after: CmsContentRouteItem
): CmsContentMoves {
   if (!before) return { moves: [], livePaths: [] }
   return contentItemMoves(entry, before, after, contentRouteLocales(getContentI18n()))
}

export async function planContentRedirects(
   moves: CmsContentMoves
): Promise<CmsRedirectPlan | null> {
   if (!moves.moves.length) return null
   const existing = await useDb()
      .select({ id: cms_redirects.id, from: cms_redirects.from, to: cms_redirects.to })
      .from(cms_redirects)
   return planRedirectMoves(existing, moves.moves, moves.livePaths)
}

export function redirectPlanStatements(
   db: WriteDb,
   plan: CmsRedirectPlan,
   now: string = nowTimestamp()
): PromiseLike<unknown>[] {
   const statements: PromiseLike<unknown>[] = []
   if (plan.deletes.length)
      statements.push(db.delete(cms_redirects).where(inArray(cms_redirects.id, plan.deletes)))
   for (const { id, to } of plan.retargets) {
      statements.push(
         db.update(cms_redirects).set({ to, updatedAt: now }).where(eq(cms_redirects.id, id))
      )
   }
   for (const { from, to } of plan.upserts) {
      const values = { to, status: 301, keepQuery: true, source: 'auto', updatedAt: now }
      statements.push(
         db
            .insert(cms_redirects)
            .values({ id: customId('rdr'), from, createdAt: now, ...values })
            .onConflictDoUpdate({ target: cms_redirects.from, set: values })
      )
   }
   return statements
}
