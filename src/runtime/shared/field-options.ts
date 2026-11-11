import type { CmsI18n, FieldConfig } from './index'
import { isTranslatableField } from './index'

export const DEFAULT_TODAY = 'today'

export const DEFAULT_NOW = 'now'

export const DEFAULT_FIELD_TYPES = [
   'text',
   'richtext',
   'number',
   'boolean',
   'date',
   'datetime',
   'email',
   'select',
   'tags',
]

export const UNIQUE_FIELD_TYPES = ['text', 'email', 'number']

export const IMMUTABLE_FIELD_TYPES = [
   'text',
   'number',
   'boolean',
   'date',
   'datetime',
   'email',
   'slug',
   'select',
   'relation',
]

export interface FieldDefaultOptions {
   now?: Date
   local?: boolean
}

function pad(value: number): string {
   return String(value).padStart(2, '0')
}

function todayOf(now: Date, local: boolean): string {
   if (!local) return now.toISOString().slice(0, 10)
   return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function hasFieldDefault(field: FieldConfig): boolean {
   return field.default !== undefined && DEFAULT_FIELD_TYPES.includes(field.type)
}

export function resolveFieldDefault(
   field: FieldConfig,
   i18n: Pick<CmsI18n, 'locales' | 'defaultLocale'>,
   options: FieldDefaultOptions = {}
): unknown {
   const value = field.default
   if (value === undefined || value === null) return null
   const now = options.now ?? new Date()
   if (field.type === 'date' && value === DEFAULT_TODAY) return todayOf(now, !!options.local)
   if (field.type === 'datetime' && value === DEFAULT_NOW) return now.toISOString()
   if (Array.isArray(value)) return [...value]
   if (isTranslatableField(field) && i18n.locales.length) return { [i18n.defaultLocale]: value }
   return value
}

export function entryDefaults(
   fields: Record<string, FieldConfig>,
   i18n: Pick<CmsI18n, 'locales' | 'defaultLocale'>,
   options: FieldDefaultOptions = {}
): Record<string, unknown> {
   return Object.fromEntries(
      Object.entries(fields)
         .filter(([, field]) => hasFieldDefault(field))
         .map(([key, field]) => [key, resolveFieldDefault(field, i18n, options)])
   )
}

export function withEntryDefaults(
   fields: Record<string, FieldConfig>,
   values: Record<string, unknown>,
   i18n: Pick<CmsI18n, 'locales' | 'defaultLocale'>,
   options: FieldDefaultOptions = {}
): Record<string, unknown> {
   const filled = { ...values }
   for (const [key, value] of Object.entries(entryDefaults(fields, i18n, options))) {
      if (!Object.hasOwn(filled, key)) filled[key] = value
   }
   return filled
}

export function isUniqueValueField(field: FieldConfig): boolean {
   return !!field.unique && UNIQUE_FIELD_TYPES.includes(field.type) && !isTranslatableField(field)
}

export function isImmutableField(field: FieldConfig): boolean {
   return (
      !!field.immutable &&
      IMMUTABLE_FIELD_TYPES.includes(field.type) &&
      !isTranslatableField(field) &&
      !(field.type === 'relation' && field.cardinality === 'many-to-many')
   )
}

export function immutableFieldKeys(fields: Record<string, FieldConfig>): string[] {
   return Object.keys(fields).filter((key) => isImmutableField(fields[key]!))
}

function isBlank(value: unknown): boolean {
   if (value === null || value === undefined) return true
   if (typeof value === 'string') return !value.trim()
   return Array.isArray(value) && !value.length
}

export function lockedFieldKeys(
   fields: Record<string, FieldConfig>,
   saved: Record<string, unknown> | null | undefined
): string[] {
   if (!saved) return []
   return immutableFieldKeys(fields).filter((key) => !isBlank(saved[key]))
}

function comparable(value: unknown): string {
   return JSON.stringify(isBlank(value) ? null : value)
}

export function changedImmutableKeys(
   fields: Record<string, FieldConfig>,
   saved: Record<string, unknown> | null | undefined,
   next: Record<string, unknown>
): string[] {
   return lockedFieldKeys(fields, saved).filter(
      (key) => Object.hasOwn(next, key) && comparable(saved![key]) !== comparable(next[key])
   )
}
