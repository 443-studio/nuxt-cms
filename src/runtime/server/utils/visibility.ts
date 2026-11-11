import type { SQL } from 'drizzle-orm'
import { and, eq, isNotNull, lte, or } from 'drizzle-orm'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'
import type { CmsEntry } from '../../shared/index'
import { CONTENT_PUBLISHED_AT_FIELD } from '../../shared/index'
import { nowTimestamp } from '../../shared/timestamps'

export function visibilityConditions(
   entry: Pick<CmsEntry, 'kind' | 'drafts'>,
   columns: Record<string, AnySQLiteColumn>,
   now: string = nowTimestamp()
): SQL[] {
   if (!entry.drafts) return []
   const conditions: SQL[] = []
   if (columns.status) conditions.push(eq(columns.status, 'published'))
   const publishedAt = columns[CONTENT_PUBLISHED_AT_FIELD]
   if (entry.kind === 'content' && publishedAt)
      conditions.push(isNotNull(publishedAt), lte(publishedAt, now))
   return conditions
}

export function visibleOrPreviewConditions(
   entry: Pick<CmsEntry, 'kind' | 'drafts'>,
   columns: Record<string, AnySQLiteColumn>,
   previewId?: string,
   now: string = nowTimestamp()
): SQL[] {
   const visible = visibilityConditions(entry, columns, now)
   if (!visible.length || previewId === undefined || !columns.id) return visible
   return [or(and(...visible), eq(columns.id, previewId))!]
}
