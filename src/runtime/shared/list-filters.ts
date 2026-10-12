import type { CmsEntry, SelectOption } from './index'
import { isCollectionKind, listFilterKeys, selectOptions } from './index'

export const LIST_FILTER_PREFIX = 'filter.'

export const LIST_FILTER_STATUS = 'status'

export const LIST_FILTER_ID_MAX = 256

export type CmsListFilters = Record<string, string>

const STATUS_OPTIONS: SelectOption[] = [
   { value: 'draft', label: 'Draft' },
   { value: 'published', label: 'Published' },
]

const BOOLEAN_OPTIONS: SelectOption[] = [
   { value: 'true', label: 'Yes' },
   { value: 'false', label: 'No' },
]

type FilterEntry = Pick<CmsEntry, 'kind' | 'fields' | 'drafts' | 'list'>

function isStatusFilter(entry: FilterEntry, key: string) {
   return key === LIST_FILTER_STATUS && !Object.hasOwn(entry.fields, key)
}

export function listFilterExtras(entry: FilterEntry): string[] {
   return isCollectionKind(entry) && entry.drafts ? [LIST_FILTER_STATUS] : []
}

export function entryListFilterKeys(entry: FilterEntry, columns?: string[]): string[] {
   if (!isCollectionKind(entry)) return []
   return listFilterKeys(entry.fields, entry.list, listFilterExtras(entry), columns)
}

export function listFilterLabel(entry: FilterEntry, key: string): string {
   if (isStatusFilter(entry, key)) return 'Status'
   return entry.fields[key]?.label ?? key
}

export function listFilterOptions(entry: FilterEntry, key: string): SelectOption[] | null {
   if (isStatusFilter(entry, key)) return STATUS_OPTIONS
   const field = entry.fields[key]
   if (field?.type === 'select') return selectOptions(field)
   if (field?.type === 'boolean') return BOOLEAN_OPTIONS
   return null
}

export function listFilterValueLabel(entry: FilterEntry, key: string, value: string): string {
   return listFilterOptions(entry, key)?.find((option) => option.value === value)?.label ?? value
}

export function readListFilterQuery(query: Record<string, unknown>): Record<string, unknown> {
   const raw: Record<string, unknown> = {}
   for (const [name, value] of Object.entries(query)) {
      if (!name.startsWith(LIST_FILTER_PREFIX)) continue
      const key = name.slice(LIST_FILTER_PREFIX.length)
      if (key) raw[key] = value
   }
   return raw
}

export interface ListFilterParseResult {
   filters: CmsListFilters
   errors: string[]
}

export function parseListFilters(
   entry: FilterEntry,
   query: Record<string, unknown>
): ListFilterParseResult {
   const allowed = new Set(entryListFilterKeys(entry))
   const filters: CmsListFilters = {}
   const errors: string[] = []
   for (const [key, raw] of Object.entries(readListFilterQuery(query))) {
      if (!allowed.has(key)) {
         errors.push(`Unknown filter '${key}'`)
         continue
      }
      if (typeof raw !== 'string') {
         errors.push(`Filter '${key}' takes one value`)
         continue
      }
      const value = raw.trim()
      if (!value) continue
      const options = listFilterOptions(entry, key)
      if (options && !options.some((option) => option.value === value)) {
         errors.push(`Invalid value for filter '${key}'`)
         continue
      }
      if (!options && value.length > LIST_FILTER_ID_MAX) {
         errors.push(`Invalid value for filter '${key}'`)
         continue
      }
      filters[key] = value
   }
   return { filters, errors }
}

export function listFilterQuery(filters: CmsListFilters): Record<string, string> {
   return Object.fromEntries(
      Object.entries(filters)
         .filter(([, value]) => typeof value === 'string' && value !== '')
         .map(([key, value]) => [`${LIST_FILTER_PREFIX}${key}`, value])
   )
}

export function withoutListFilterQuery<T extends Record<string, unknown>>(query: T): Partial<T> {
   return Object.fromEntries(
      Object.entries(query).filter(([name]) => !name.startsWith(LIST_FILTER_PREFIX))
   ) as Partial<T>
}
