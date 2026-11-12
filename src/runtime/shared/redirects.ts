import type { CmsContentRouteItem, CmsLocalePath } from './content-routes'
import { contentItemPaths, isRoutedContent } from './content-routes'
import type { CmsEntry } from './index'
import { normalizeTimestamp } from './timestamps'

export const REDIRECT_STATUSES = [301, 302, 307, 308] as const

export type CmsRedirectStatus = (typeof REDIRECT_STATUSES)[number]

export type CmsRedirectSource = 'manual' | 'auto'

export const DEFAULT_REDIRECT_STATUS: CmsRedirectStatus = 301

export const REDIRECT_FROM_MAX_LENGTH = 1024

export const REDIRECT_TO_MAX_LENGTH = 2048

export const REDIRECT_IMPORT_MAX_ROWS = 5000

export const REDIRECT_CSV_COLUMNS = ['from', 'to', 'status', 'keepQuery'] as const

const RESERVED_SEGMENTS = ['cms', 'api', '_nuxt']
const SKIPPED_PREFIXES = ['/__nuxt']
const UNSAFE_CHARACTERS = /[\s\\\u0000-\u001f\u007f]/
const ABSOLUTE_URL = /^https?:\/\//i

export interface CmsRedirectInput {
   from: string
   to: string
   status?: CmsRedirectStatus
   keepQuery?: boolean
}

export interface CmsRedirectDraft {
   from: string
   to: string
   status: CmsRedirectStatus
   keepQuery: boolean
}

export interface CmsRedirect extends CmsRedirectDraft {
   id: string
   source: CmsRedirectSource
   createdAt: string
   updatedAt: string
}

export interface CmsRedirectTarget {
   to: string
   status: CmsRedirectStatus
   keepQuery: boolean
}

export interface CmsRedirectMove {
   from: string
   to: string
}

export interface CmsRedirectLink {
   id: string
   from: string
   to: string
}

export interface CmsRedirectPlan {
   upserts: CmsRedirectMove[]
   retargets: { id: string; to: string }[]
   deletes: string[]
}

function canonicalSegment(segment: string): string {
   try {
      return encodeURIComponent(decodeURIComponent(segment))
   } catch {
      return segment
   }
}

export function normalizeRedirectPath(path: string): string {
   const bare = path.replace(/[?#].*$/, '')
   const segments = bare.split('/').filter(Boolean).map(canonicalSegment)
   return `/${segments.join('/')}`
}

export function isExternalRedirectTarget(to: string): boolean {
   return ABSOLUTE_URL.test(to)
}

export function redirectTargetPath(to: string): string | null {
   if (isExternalRedirectTarget(to) || !to.startsWith('/') || to.startsWith('//')) return null
   return normalizeRedirectPath(to)
}

function reservedSegment(path: string): string | undefined {
   const first = path.split('/')[1] ?? ''
   return RESERVED_SEGMENTS.find((segment) => segment === first)
}

export function redirectApplies(path: string): boolean {
   const bare = path.replace(/[?#].*$/, '')
   return (
      !reservedSegment(normalizeRedirectPath(bare)) &&
      !SKIPPED_PREFIXES.some((prefix) => bare.startsWith(prefix))
   )
}

export function redirectFromErrors(from: unknown): string[] {
   if (typeof from !== 'string' || !from.trim()) return ['From is required']
   if (from.length > REDIRECT_FROM_MAX_LENGTH)
      return [`From is longer than ${REDIRECT_FROM_MAX_LENGTH} characters`]
   if (!from.startsWith('/') || from.startsWith('//'))
      return ['From must be a path starting with /, without a host']
   if (UNSAFE_CHARACTERS.test(from)) return ['From cannot hold spaces or backslashes']
   if (/[?#]/.test(from)) return ['From cannot hold a query or a hash']
   const reserved = reservedSegment(normalizeRedirectPath(from))
   if (reserved) return [`From cannot be under /${reserved}`]
   return []
}

export function redirectToErrors(to: unknown): string[] {
   if (typeof to !== 'string' || !to.trim()) return ['To is required']
   if (to.length > REDIRECT_TO_MAX_LENGTH)
      return [`To is longer than ${REDIRECT_TO_MAX_LENGTH} characters`]
   if (UNSAFE_CHARACTERS.test(to)) return ['To cannot hold spaces or backslashes']
   if (isExternalRedirectTarget(to)) {
      try {
         const url = new URL(to)
         if (!url.hostname) return ['To must be a valid URL']
         if (url.username || url.password) return ['To cannot hold credentials']
         return []
      } catch {
         return ['To must be a valid URL']
      }
   }
   if (!to.startsWith('/') || to.startsWith('//'))
      return ['To must be a path starting with / or an absolute http(s) URL']
   return []
}

export function isRedirectStatus(value: unknown): value is CmsRedirectStatus {
   return (REDIRECT_STATUSES as readonly unknown[]).includes(value)
}

export function normalizeRedirectInput(input: CmsRedirectInput): CmsRedirectDraft {
   return {
      from: normalizeRedirectPath(input.from.trim()),
      to: input.to.trim(),
      status: input.status ?? DEFAULT_REDIRECT_STATUS,
      keepQuery: input.keepQuery ?? true,
   }
}

export function redirectTargetMap(
   redirects: readonly Pick<CmsRedirectDraft, 'from' | 'to'>[]
): Map<string, string | null> {
   return new Map(redirects.map((redirect) => [redirect.from, redirectTargetPath(redirect.to)]))
}

export function findRedirectLoop(
   targets: ReadonlyMap<string, string | null>,
   from: string,
   to: string
): string[] | null {
   const chain = [from]
   const seen = new Set([from])
   let current = redirectTargetPath(to)
   while (current !== null) {
      chain.push(current)
      if (current === from) return chain
      if (seen.has(current)) return null
      seen.add(current)
      const next = targets.get(current)
      if (next === undefined) return null
      current = next
   }
   return null
}

export function redirectErrors(
   input: CmsRedirectInput,
   others: ReadonlyMap<string, string | null>
): string[] {
   const errors = [...redirectFromErrors(input.from), ...redirectToErrors(input.to)]
   if (input.status !== undefined && !isRedirectStatus(input.status))
      errors.push(`Status must be one of ${REDIRECT_STATUSES.join(', ')}`)
   if (errors.length) return errors
   const draft = normalizeRedirectInput(input)
   if (redirectTargetPath(draft.to) === draft.from) return ['A redirect cannot point to itself']
   if (others.has(draft.from)) return [`A redirect from ${draft.from} already exists`]
   const loop = findRedirectLoop(others, draft.from, draft.to)
   if (loop) return [`This redirect makes a loop: ${loop.join(' → ')}`]
   return []
}

function targetSuffix(to: string): string {
   const index = to.search(/[?#]/)
   return index === -1 ? '' : to.slice(index)
}

export function retargetRedirect(to: string, path: string): string {
   return `${path}${targetSuffix(to)}`
}

export function redirectLocation(to: string, search: string, keepQuery: boolean): string {
   const query = search.replace(/^\?/, '')
   if (!keepQuery || !query) return to
   const hashIndex = to.indexOf('#')
   const base = hashIndex === -1 ? to : to.slice(0, hashIndex)
   const hash = hashIndex === -1 ? '' : to.slice(hashIndex)
   const joiner = !base.includes('?') ? '?' : /[?&]$/.test(base) ? '' : '&'
   return `${base}${joiner}${query}${hash}`
}

export function isContentItemLive(item: CmsContentRouteItem, now: Date = new Date()): boolean {
   if (item.status !== 'published') return false
   const publishedAt = normalizeTimestamp(item.publishedAt)
   if (typeof publishedAt !== 'string' || !publishedAt) return false
   const date = new Date(publishedAt)
   return !Number.isNaN(date.getTime()) && date.getTime() <= now.getTime()
}

export interface CmsContentMoves {
   moves: CmsRedirectMove[]
   livePaths: string[]
}

export function contentPathMoves(
   oldPaths: readonly CmsLocalePath[],
   newPaths: readonly CmsLocalePath[]
): CmsContentMoves {
   const livePaths = [...new Set(newPaths.map((entry) => normalizeRedirectPath(entry.path)))]
   const live = new Set(livePaths)
   const moves = new Map<string, string>()
   for (const old of oldPaths) {
      const next = newPaths.find((entry) => entry.locale === old.locale)
      if (!next) continue
      const from = normalizeRedirectPath(old.path)
      if (from === normalizeRedirectPath(next.path) || live.has(from) || moves.has(from)) continue
      moves.set(from, next.path)
   }
   return { moves: [...moves].map(([from, to]) => ({ from, to })), livePaths }
}

export function rowAfterUpdate<T extends Record<string, unknown>>(
   existing: T,
   set: Record<string, unknown>
): T {
   const next: Record<string, unknown> = { ...existing }
   for (const [key, value] of Object.entries(set)) if (value !== undefined) next[key] = value
   if (Object.hasOwn(existing, 'status') && next.status == null) next.status = existing.status
   return next as T
}

export function contentItemMoves(
   entry: Pick<CmsEntry, 'kind' | 'route'>,
   before: CmsContentRouteItem,
   after: CmsContentRouteItem,
   locales: readonly string[],
   now: Date = new Date()
): CmsContentMoves {
   if (!isRoutedContent(entry) || !isContentItemLive(before, now) || !isContentItemLive(after, now))
      return { moves: [], livePaths: [] }
   return contentPathMoves(
      contentItemPaths(entry, before, locales),
      contentItemPaths(entry, after, locales)
   )
}

export function mergeContentMoves(list: readonly CmsContentMoves[]): CmsContentMoves {
   const livePaths = [...new Set(list.flatMap((moves) => moves.livePaths))]
   const live = new Set(livePaths.map(normalizeRedirectPath))
   const moves = list
      .flatMap((item) => item.moves)
      .filter((move) => !live.has(normalizeRedirectPath(move.from)))
   return { moves, livePaths }
}

export function planRedirectMoves(
   existing: readonly CmsRedirectLink[],
   moves: readonly CmsRedirectMove[],
   livePaths: readonly string[]
): CmsRedirectPlan {
   const live = new Set(livePaths.map(normalizeRedirectPath))
   const moved = new Map(moves.map((move) => [normalizeRedirectPath(move.from), move.to]))
   const deletes = new Set<string>()
   const retargets: CmsRedirectPlan['retargets'] = []
   for (const redirect of existing) {
      if (live.has(redirect.from)) {
         deletes.add(redirect.id)
         continue
      }
      if (moved.has(redirect.from)) continue
      const target = redirectTargetPath(redirect.to)
      const next = target === null ? undefined : moved.get(target)
      if (next === undefined) continue
      const to = retargetRedirect(redirect.to, next)
      if (redirectTargetPath(to) === redirect.from) deletes.add(redirect.id)
      else retargets.push({ id: redirect.id, to })
   }
   return {
      upserts: [...moved].map(([from, to]) => ({ from, to })),
      retargets,
      deletes: [...deletes],
   }
}

function csvBoolean(value: string | undefined): boolean | undefined {
   const text = (value ?? '').trim().toLowerCase()
   if (!text) return undefined
   if (['true', '1', 'yes'].includes(text)) return true
   if (['false', '0', 'no'].includes(text)) return false
   return undefined
}

export function redirectRowsFromTable(rows: string[][]): CmsRedirectInput[] {
   const [header, ...body] = rows
   if (!header) return []
   const columns = header.map((cell) => cell.trim().toLowerCase())
   const index = (name: string) => columns.indexOf(name.toLowerCase())
   const fromIndex = index('from')
   const toIndex = index('to')
   if (fromIndex === -1 || toIndex === -1) throw new Error('The CSV needs a from and a to column')
   const statusIndex = index('status')
   const keepIndex = index('keepQuery')
   return body.map((cells) => {
      const status = statusIndex === -1 ? '' : (cells[statusIndex] ?? '').trim()
      const keepQuery = keepIndex === -1 ? undefined : csvBoolean(cells[keepIndex])
      return {
         from: cells[fromIndex] ?? '',
         to: cells[toIndex] ?? '',
         ...(status ? { status: Number(status) as CmsRedirectStatus } : {}),
         ...(keepQuery === undefined ? {} : { keepQuery }),
      }
   })
}

export function redirectsToTable(redirects: readonly CmsRedirectDraft[]): string[][] {
   return [
      [...REDIRECT_CSV_COLUMNS],
      ...redirects.map((redirect) => [
         redirect.from,
         redirect.to,
         String(redirect.status),
         redirect.keepQuery ? 'true' : 'false',
      ]),
   ]
}
