import { isFieldVisible } from './conditions'
import type { CmsEntry, CmsI18n, FieldConfig } from './index'
import {
   decodeTranslatableValue,
   entryFieldsFor,
   hasTranslatableBlockFields,
   isCollectionKind,
   isTranslatableField,
} from './index'
import { stripMarkup } from './search'

export const TRANSLATIONS_COLUMN = '_translations'

export type TranslationState = 'complete' | 'partial' | 'missing'

export interface TranslationLocaleProgress {
   filled: number
   total: number
   values: number
   state: TranslationState
}

export type TranslationProgress = Record<string, TranslationLocaleProgress>

export interface TranslationChange {
   values: Record<string, unknown>
   count: number
}

type Values = Record<string, unknown>
type Translations = Record<string, string>
type Visit = (
   field: FieldConfig,
   translations: Translations | null
) => Translations | null | undefined

export function isTranslationFilled(field: FieldConfig, value: unknown): boolean {
   if (typeof value !== 'string') return false
   return (field.type === 'richtext' ? stripMarkup(value) : value).trim() !== ''
}

export function hasTranslatableContent(fields: Record<string, FieldConfig>): boolean {
   return Object.values(fields).some(
      (field) => isTranslatableField(field) || hasTranslatableBlockFields(field)
   )
}

export function entryHasTranslations(
   entry: Pick<CmsEntry, 'fields'> & Partial<Pick<CmsEntry, 'kind' | 'overrides'>>
): boolean {
   return hasTranslatableContent(entryFieldsFor(entry))
}

export function hasTranslationsColumn(
   entry: Pick<CmsEntry, 'kind' | 'fields'>,
   i18n: Pick<CmsI18n, 'locales'>
): boolean {
   return (
      i18n.locales.length > 1 &&
      isCollectionKind(entry) &&
      !Object.hasOwn(entry.fields, TRANSLATIONS_COLUMN) &&
      hasTranslatableContent(entry.fields)
   )
}

function visitBlocks(field: FieldConfig, value: unknown, defaultLocale: string, visit: Visit) {
   if (!Array.isArray(value)) return undefined
   let changed = false
   const items = value.map((item: unknown) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item
      const block = field.blocks?.[String((item as Values).type)]
      if (!block) return item
      const next = visitTranslations(block.fields, item as Values, defaultLocale, visit)
      if (next !== item) changed = true
      return next
   })
   return changed ? items : undefined
}

function visitTranslations(
   fields: Record<string, FieldConfig>,
   values: Values,
   defaultLocale: string,
   visit: Visit,
   keys?: readonly string[]
): Values {
   let next: Values | null = null
   for (const key of keys ?? Object.keys(fields)) {
      const field = Object.hasOwn(fields, key) ? fields[key] : undefined
      if (!field || !isFieldVisible(field, values, fields)) continue
      const replaced = isTranslatableField(field)
         ? visit(field, decodeTranslatableValue(values[key], defaultLocale))
         : field.type === 'blocks'
           ? visitBlocks(field, values[key], defaultLocale, visit)
           : undefined
      if (replaced === undefined) continue
      next ??= { ...values }
      next[key] = replaced
   }
   return next ?? values
}

function translationState(filled: number, total: number): TranslationState {
   if (filled >= total) return 'complete'
   return filled ? 'partial' : 'missing'
}

export function translationProgress(
   fields: Record<string, FieldConfig>,
   values: Values | null | undefined,
   i18n: CmsI18n,
   keys?: readonly string[]
): TranslationProgress {
   const slots: { field: FieldConfig; translations: Translations }[] = []
   visitTranslations(
      fields,
      values ?? {},
      i18n.defaultLocale,
      (field, translations) => {
         if (translations) slots.push({ field, translations })
         return undefined
      },
      keys
   )
   const sources = slots.filter(({ field, translations }) =>
      isTranslationFilled(field, translations[i18n.defaultLocale])
   )
   const total = sources.length
   return Object.fromEntries(
      i18n.locales.map((locale) => {
         const filled = sources.filter(({ field, translations }) =>
            isTranslationFilled(field, translations[locale])
         ).length
         const written = slots.filter(({ field, translations }) =>
            isTranslationFilled(field, translations[locale])
         ).length
         return [locale, { filled, total, values: written, state: translationState(filled, total) }]
      })
   )
}

export function translationSummary(progress: TranslationLocaleProgress | undefined): string {
   if (!progress?.total) return 'Nothing to translate yet'
   const noun = progress.total === 1 ? 'value' : 'values'
   return `${progress.filled} of ${progress.total} ${noun} translated`
}

export interface TranslationCopyOptions {
   from: string
   to: string
   overwrite?: boolean
}

export function copyTranslations(
   fields: Record<string, FieldConfig>,
   values: Values,
   i18n: CmsI18n,
   { from, to, overwrite = false }: TranslationCopyOptions
): TranslationChange {
   let count = 0
   if (from === to) return { values, count }
   const next = visitTranslations(fields, values, i18n.defaultLocale, (field, translations) => {
      const source = translations?.[from]
      if (!translations || !isTranslationFilled(field, source)) return undefined
      const target = translations[to]
      if (target === source) return undefined
      if (!overwrite && isTranslationFilled(field, target)) return undefined
      count++
      return { ...translations, [to]: source! }
   })
   return { values: next, count }
}

export function clearTranslations(
   fields: Record<string, FieldConfig>,
   values: Values,
   i18n: CmsI18n,
   locale: string
): TranslationChange {
   let count = 0
   if (locale === i18n.defaultLocale) return { values, count }
   const next = visitTranslations(fields, values, i18n.defaultLocale, (field, translations) => {
      if (!translations || !Object.hasOwn(translations, locale)) return undefined
      if (isTranslationFilled(field, translations[locale])) count++
      const rest = Object.fromEntries(
         Object.entries(translations).filter(([code]) => code !== locale)
      )
      return Object.keys(rest).length ? rest : null
   })
   return { values: next, count }
}
