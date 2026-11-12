import { createHash, randomBytes } from 'node:crypto'
import { and, asc, eq, gt, isNull, lte } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { createError, getHeader, setResponseHeaders } from 'h3'
import { z } from 'zod'
import cmsConfig from '#cms-config'
import { useDb } from '#cms-db'
import { cms_preview_links } from '#cms-tables'
import type {
   CmsConfig,
   CmsCreatedPreviewLink,
   CmsEntry,
   CmsPreviewGrant,
   CmsPreviewLink,
   CmsPreviewLinkDuration,
   CmsSessionUser,
} from '../../shared/index'
import {
   PREVIEW_HEADER,
   PREVIEW_LINK_DURATIONS,
   PREVIEW_RESPONSE_HEADERS,
   PREVIEW_TOKEN_BYTES,
   contentItemPath,
   isRoutedContent,
   previewLinkExpiry,
   previewLinkUrl,
   previewTokenFrom,
} from '../../shared/index'
import { normalizeTimestamp, nowTimestamp } from '../../shared/timestamps'
import { customId } from './custom-id'
import type { WriteDb } from './write-statements'
import { getContentI18n, resolveTable, tableColumns } from './registry'
import { assertCmsPermission, requireCmsAccess } from './permissions'

type PreviewLinkRow = typeof cms_preview_links.$inferSelect

export const previewLinkInputSchema = z
   .object({
      duration: z.enum(
         PREVIEW_LINK_DURATIONS.map((option) => option.value) as [
            CmsPreviewLinkDuration,
            ...CmsPreviewLinkDuration[],
         ]
      ),
      locale: z.string().max(32).nullish(),
   })
   .strict()

export interface PreviewLinkAccess {
   user: CmsSessionUser
   name: string
   entry: CmsEntry
}

export async function requirePreviewLinkAccess(
   event: H3Event,
   name: string,
   action: 'read' | 'update'
): Promise<PreviewLinkAccess> {
   const { user, access } = await requireCmsAccess(event)
   const entry = routedEntry(name)
   assertCmsPermission(access, `${name}.${action}`)
   return { user, name, entry }
}

export function createPreviewToken(): string {
   return randomBytes(PREVIEW_TOKEN_BYTES).toString('base64url')
}

export function hashPreviewToken(token: string): string {
   return createHash('sha256').update(token).digest('hex')
}

function routedEntry(name: string): CmsEntry {
   const entry = (cmsConfig as CmsConfig)[name]
   if (!entry || !isRoutedContent(entry))
      throw createError({
         statusCode: 400,
         statusMessage: 'Preview links need a content entry with a route',
      })
   return entry
}

function previewLocale(locale: string | null | undefined): string {
   const { locales, defaultLocale } = getContentI18n()
   if (!locale) return defaultLocale
   if (locales.length ? !locales.includes(locale) : locale !== defaultLocale)
      throw createError({ statusCode: 400, statusMessage: `Unknown locale: ${locale}` })
   return locale
}

async function readItem(name: string, itemId: string): Promise<Record<string, unknown>> {
   const table = resolveTable(name)
   const id = table ? tableColumns(table).id : undefined
   const [row] =
      table && id ? await useDb().select().from(table).where(eq(id, itemId)).limit(1) : []
   if (!row) throw createError({ statusCode: 404, statusMessage: 'Item not found' })
   return row as Record<string, unknown>
}

function toPreviewLink(row: PreviewLinkRow, path: string): CmsPreviewLink {
   return {
      id: row.id,
      entry: row.entry,
      itemId: row.itemId,
      locale: row.locale ?? null,
      path,
      createdBy: row.createdBy ?? null,
      createdAt: String(normalizeTimestamp(row.createdAt)),
      expiresAt: row.expiresAt,
   }
}

function activeCondition(now: string) {
   return and(isNull(cms_preview_links.revokedAt), gt(cms_preview_links.expiresAt, now))
}

async function pruneStaleLinks(now: string) {
   await useDb().delete(cms_preview_links).where(lte(cms_preview_links.expiresAt, now))
}

export async function listPreviewLinks(
   { name, entry }: PreviewLinkAccess,
   itemId: string
): Promise<CmsPreviewLink[]> {
   const item = await readItem(name, itemId)
   const rows = await useDb()
      .select()
      .from(cms_preview_links)
      .where(
         and(
            eq(cms_preview_links.entry, name),
            eq(cms_preview_links.itemId, itemId),
            activeCondition(nowTimestamp())
         )
      )
      .orderBy(asc(cms_preview_links.expiresAt))
   const { defaultLocale } = getContentI18n()
   return rows.map((row) =>
      toPreviewLink(row, contentItemPath(entry, item, row.locale ?? defaultLocale) ?? '')
   )
}

export async function createPreviewLink(
   { name, entry, user }: PreviewLinkAccess,
   itemId: string,
   input: z.infer<typeof previewLinkInputSchema>
): Promise<CmsCreatedPreviewLink> {
   const locale = previewLocale(input.locale)
   const item = await readItem(name, itemId)
   const path = contentItemPath(entry, item, locale)
   if (!path)
      throw createError({
         statusCode: 400,
         statusMessage:
            'The item has no address yet: give it a slug (and a publish date if the route uses one) and save',
      })
   const now = new Date()
   await pruneStaleLinks(now.toISOString())
   const token = createPreviewToken()
   const [row] = await useDb()
      .insert(cms_preview_links)
      .values({
         id: customId('pvl'),
         tokenHash: hashPreviewToken(token),
         entry: name,
         itemId,
         locale,
         createdBy: user.email,
         createdAt: now.toISOString(),
         expiresAt: previewLinkExpiry(input.duration, now),
      })
      .returning()
   return { link: toPreviewLink(row!, path), url: previewLinkUrl(path, token) }
}

export async function revokePreviewLink(
   { name }: PreviewLinkAccess,
   itemId: string,
   linkId: string
) {
   const [row] = await useDb()
      .update(cms_preview_links)
      .set({ revokedAt: nowTimestamp() })
      .where(
         and(
            eq(cms_preview_links.id, linkId),
            eq(cms_preview_links.entry, name),
            eq(cms_preview_links.itemId, itemId),
            isNull(cms_preview_links.revokedAt)
         )
      )
      .returning({ id: cms_preview_links.id })
   if (!row) throw createError({ statusCode: 404, statusMessage: 'Preview link not found' })
}

export function deleteItemPreviewLinksStatement(db: WriteDb, name: string, itemId: string) {
   return db
      .delete(cms_preview_links)
      .where(and(eq(cms_preview_links.entry, name), eq(cms_preview_links.itemId, itemId)))
}

export async function findPreviewGrant(token: string | null): Promise<CmsPreviewGrant | null> {
   if (!token) return null
   const [row] = await useDb()
      .select({
         entry: cms_preview_links.entry,
         itemId: cms_preview_links.itemId,
         expiresAt: cms_preview_links.expiresAt,
      })
      .from(cms_preview_links)
      .where(
         and(
            eq(cms_preview_links.tokenHash, hashPreviewToken(token)),
            activeCondition(nowTimestamp())
         )
      )
      .limit(1)
   return row ?? null
}

export function previewTokenOf(event: H3Event): string | null {
   return previewTokenFrom(getHeader(event, PREVIEW_HEADER))
}

export function hasPreviewHeader(event: H3Event): boolean {
   return getHeader(event, PREVIEW_HEADER) !== undefined
}

export function markPreviewResponse(event: H3Event) {
   setResponseHeaders(event, PREVIEW_RESPONSE_HEADERS)
}

export async function readPreviewGrant(event: H3Event): Promise<CmsPreviewGrant | null> {
   if (!hasPreviewHeader(event)) return null
   markPreviewResponse(event)
   return findPreviewGrant(previewTokenOf(event)).catch(() => null)
}
