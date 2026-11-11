import type { SQL } from 'drizzle-orm'
import { and, eq } from 'drizzle-orm'
import cmsConfig from '#cms-config'
import { useDb } from '#cms-db'
import type { CmsConfig, CmsEntry } from '../../shared/index'
import {
   CONTENT_SLUG_FIELD,
   contentPathParamsMatch,
   contentRoutePattern,
   isRoutedContent,
   matchContentPattern,
} from '../../shared/index'
import { resolveTable, tableColumns } from './registry'
import { visibilityConditions } from './visibility'

export interface FindContentByPathOptions {
   includeDrafts?: boolean
}

export async function findContentByPath(
   name: string,
   path: string,
   locale: string,
   options: FindContentByPathOptions = {}
): Promise<Record<string, unknown> | null> {
   const entry = (cmsConfig as CmsConfig)[name] as CmsEntry | undefined
   if (!entry || !isRoutedContent(entry)) return null
   const pattern = contentRoutePattern(entry.route, locale)
   const params = pattern ? matchContentPattern(pattern, path) : null
   const table = resolveTable(name)
   if (!params || !table) return null
   const columns = tableColumns(table)
   const conditions: SQL[] = []
   if (params.slug) conditions.push(eq(columns[CONTENT_SLUG_FIELD]!, params.slug))
   if (params.id) conditions.push(eq(columns.id!, params.id))
   if (!options.includeDrafts) conditions.push(...visibilityConditions(entry, columns))
   const [row] = await useDb()
      .select()
      .from(table)
      .where(and(...conditions))
      .limit(1)
   const found = row as Record<string, unknown> | undefined
   return found && contentPathParamsMatch(params, found) ? found : null
}
