import type { CmsEntry, FieldConfig } from './index'
import { CONTENT_PUBLISHED_AT_FIELD, isCollectionKind, isTranslatableField } from './index'

export const DUPLICATE_TITLE_SUFFIX = ' (copy)'

const DUPLICATE_TOKEN_LENGTH = 4

const DUPLICATE_TOKEN_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

const COPIED_SLUG = new RegExp(`-copy-[a-z0-9]{${DUPLICATE_TOKEN_LENGTH}}$`)

type DuplicatedEntry = Pick<CmsEntry, 'kind' | 'fields' | 'drafts' | 'titleField'>

export function isUniqueField(field: FieldConfig): boolean {
   return field.type === 'slug' || (field.type === 'relation' && field.cardinality === 'one-to-one')
}

export function uniqueFieldKeys(entry: Pick<CmsEntry, 'fields'>): string[] {
   return Object.keys(entry.fields).filter((key) => isUniqueField(entry.fields[key]!))
}

export function duplicateToken(): string {
   const bytes = new Uint8Array(DUPLICATE_TOKEN_LENGTH)
   globalThis.crypto.getRandomValues(bytes)
   return [...bytes]
      .map((byte) => DUPLICATE_TOKEN_ALPHABET[byte % DUPLICATE_TOKEN_ALPHABET.length])
      .join('')
}

export function duplicateSlug(value: string, token: string): string {
   return `${value.replace(COPIED_SLUG, '')}-copy-${token}`
}

function suffixTitle(field: FieldConfig, value: unknown): unknown {
   if (typeof value === 'string') return value.trim() ? `${value}${DUPLICATE_TITLE_SUFFIX}` : value
   if (!value || typeof value !== 'object' || !isTranslatableField(field)) return value
   return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([locale, text]) => [
         locale,
         typeof text === 'string' && text.trim() ? `${text}${DUPLICATE_TITLE_SUFFIX}` : text,
      ])
   )
}

export function duplicateFormKeys(entry: DuplicatedEntry): string[] {
   const keys = Object.keys(entry.fields)
   return isCollectionKind(entry) && entry.drafts && !keys.includes('status')
      ? [...keys, 'status']
      : keys
}

export function duplicateEntryValues(
   entry: DuplicatedEntry,
   source: Record<string, unknown>,
   token: string = duplicateToken()
): Record<string, unknown> {
   const picked = Object.fromEntries(
      duplicateFormKeys(entry).map((key) => [key, source[key] ?? null])
   )
   const copy = JSON.parse(JSON.stringify(picked)) as Record<string, unknown>
   for (const [key, field] of Object.entries(entry.fields)) {
      if (field.type === 'slug') {
         const slug = copy[key]
         copy[key] = typeof slug === 'string' && slug ? duplicateSlug(slug, token) : null
      } else if (isUniqueField(field)) {
         copy[key] = null
      }
   }
   const titleField = entry.titleField ? entry.fields[entry.titleField] : undefined
   if (entry.titleField && titleField?.type === 'text')
      copy[entry.titleField] = suffixTitle(titleField, copy[entry.titleField])
   if (entry.kind === 'content' && Object.hasOwn(copy, CONTENT_PUBLISHED_AT_FIELD))
      copy[CONTENT_PUBLISHED_AT_FIELD] = null
   if (isCollectionKind(entry) && entry.drafts) copy.status = 'draft'
   return copy
}
