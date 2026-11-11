import { z } from 'zod'
import type {
   BlockConfig,
   CmsConfig,
   CmsEntry,
   CmsI18n,
   CmsValidateContext,
   CmsValidateResult,
   CmsValidationLevel,
   FieldConfig,
} from './index'
import {
   BLOCK_HIDDEN_KEY,
   declaresHiddenField,
   focalPointIssue,
   allowsExternalLinks,
   declaredLinkTargets,
   isFieldVisible,
   isTranslatableField,
   linkTargetNames,
   linkUrlError,
   normalizeTags,
   pageLinkPath,
   formatBlockPath,
   selectOptionValues,
   walkBlocks,
} from './index'
import type { CmsLinkValue } from './links'

export const objectKeySchema = z
   .string()
   .min(1)
   .max(1024)
   .refine((k) => !k.includes('..') && !k.startsWith('/'), 'Invalid object key')

const focalCoordinateSchema = z.number().min(0).max(1).nullish()

export const mediaUpdateSchema = z
   .object({
      key: objectKeySchema,
      alt: z.string().max(1024).nullish(),
      folder: z.string().max(255).nullish(),
      focalX: focalCoordinateSchema,
      focalY: focalCoordinateSchema,
   })
   .superRefine((body, ctx) => {
      const message = focalPointIssue(body.focalX, body.focalY)
      if (message) ctx.addIssue({ code: 'custom', message, path: ['focalX'] })
   })

export interface ValidationMessages {
   required: string
   invalidDate: string
   invalidDateTime: string
   invalidEmail: string
   invalidSlug: string
   unknownLocale: string
   requiredLocale: (locale: string) => string
   minBlocks: (min: number) => string
   maxBlocks: (max: number) => string
   maxTags: (max: number) => string
   minValue: (min: number) => string
   maxValue: (max: number) => string
   minLength: (min: number) => string
   maxLength: (max: number) => string
   unique: string
   immutable: string
   linkTarget: string
   linkUrlAndTarget: string
   linkExternal: string
   linkEntry: (entry: string) => string
   linkUnknownPage: string
   invalidLinkLabel: string
}

const DEFAULT_MESSAGES: ValidationMessages = {
   required: 'Required field',
   invalidDate: 'Invalid date (yyyy-mm-dd)',
   invalidDateTime: 'Invalid date and time (ISO 8601 with a time zone)',
   invalidEmail: 'Invalid email',
   invalidSlug: 'Invalid slug (lowercase letters, numbers, dashes)',
   unknownLocale: 'Unknown locale key',
   requiredLocale: (locale) => `Required field (locale '${locale}')`,
   minBlocks: (min) => `Add at least ${min} ${min === 1 ? 'block' : 'blocks'}`,
   maxBlocks: (max) => `Add at most ${max} ${max === 1 ? 'block' : 'blocks'}`,
   maxTags: (max) => `Add at most ${max} ${max === 1 ? 'tag' : 'tags'}`,
   minValue: (min) => `Must be at least ${min}`,
   maxValue: (max) => `Must be at most ${max}`,
   minLength: (min) => `Use at least ${min} ${min === 1 ? 'character' : 'characters'}`,
   maxLength: (max) => `Use at most ${max} ${max === 1 ? 'character' : 'characters'}`,
   unique: 'This value is already used by another entry',
   immutable: 'This value cannot be changed once saved',
   linkTarget: 'Choose a page or enter a URL',
   linkUrlAndTarget: 'A link has either a URL or a target, not both',
   linkExternal: 'This link cannot point to an external URL',
   linkEntry: (entry) => `This link cannot point to '${entry}'`,
   linkUnknownPage: 'Unknown page',
   invalidLinkLabel: 'Invalid link text',
}

export function validationMessages(messages?: Partial<ValidationMessages>): ValidationMessages {
   return { ...DEFAULT_MESSAGES, ...messages }
}

const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/

export function datetimeSchema(message: string) {
   return z
      .string()
      .trim()
      .refine(
         (value) => DATETIME_PATTERN.test(value) && !Number.isNaN(new Date(value).getTime()),
         message
      )
      .transform((value) => new Date(value).toISOString())
}

function scalarSchema(field: FieldConfig, m: ValidationMessages): z.ZodType {
   switch (field.type) {
      case 'number':
         return field.integer ? z.number().int() : z.number()
      case 'boolean':
         return z.boolean()
      case 'relation':
         return z.string().min(1)
      case 'date':
         return z.string().regex(/^\d{4}-\d{2}-\d{2}$/, m.invalidDate)
      case 'datetime':
         return datetimeSchema(m.invalidDateTime)
      case 'email':
         return z.email(m.invalidEmail)
      case 'slug':
         return z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, m.invalidSlug)
      case 'select':
         return z.enum(selectOptionValues(field) as [string, ...string[]])
      case 'media':
         return objectKeySchema
      case 'json':
         return z.unknown()
      default:
         if (field.required) return z.string().trim().min(1, m.required)
         return field.unique
            ? z.string().transform((value) => (value.trim() ? value : null))
            : z.string()
   }
}

function optionalize(field: FieldConfig, base: z.ZodType, m: ValidationMessages): z.ZodType {
   if (!field.required) return base.nullish().transform((v) => v ?? null)
   return z
      .any()
      .refine((v) => v !== null && v !== undefined, m.required)
      .pipe(base)
}

function translatableSchema(field: FieldConfig, i18n: CmsI18n, m: ValidationMessages): z.ZodType {
   const { locales, defaultLocale } = i18n
   const record = z
      .record(z.string(), field.type === 'media' ? objectKeySchema : z.string(), {
         error: (issue) => (issue.input == null ? m.required : undefined),
      })
      .refine((v) => Object.keys(v).every((k) => locales.includes(k)), m.unknownLocale)
   return field.required
      ? record.refine((v) => !!v[defaultLocale]?.trim(), m.requiredLocale(defaultLocale))
      : record.nullish().transform((v) => v ?? null)
}

function isRecord(value: unknown): value is Record<string, unknown> {
   return !!value && typeof value === 'object' && !Array.isArray(value)
}

function trimmed(value: unknown): string {
   return typeof value === 'string' ? value.trim() : ''
}

function linkLabelValue(
   field: FieldConfig,
   raw: unknown,
   i18n: CmsI18n,
   m: ValidationMessages
): { label?: string | Record<string, string>; error?: string } {
   if (!field.withLabel || raw == null) return {}
   if (field.translatable && i18n.locales.length) {
      const entries = isRecord(raw)
         ? Object.entries(raw)
         : typeof raw === 'string'
           ? [[i18n.defaultLocale, raw] as const]
           : null
      if (!entries) return { error: m.invalidLinkLabel }
      if (entries.some(([locale]) => !i18n.locales.includes(locale)))
         return { error: m.unknownLocale }
      const label = Object.fromEntries(
         entries
            .map(([locale, text]) => [locale, trimmed(text)] as const)
            .filter(([, text]) => !!text)
      )
      return Object.keys(label).length ? { label } : {}
   }
   if (typeof raw !== 'string') return { error: m.invalidLinkLabel }
   const label = raw.trim()
   return label ? { label } : {}
}

function linkSchema(
   field: FieldConfig,
   i18n: CmsI18n,
   m: ValidationMessages,
   config?: CmsConfig
): z.ZodType {
   const targets = config ? linkTargetNames(config, field) : declaredLinkTargets(field)
   const parse = z
      .unknown()
      .nullish()
      .transform((input, ctx): CmsLinkValue | null => {
         const fail = (message: string) => {
            ctx.addIssue({ code: 'custom', message })
            return z.NEVER
         }
         if (input == null) return null
         if (!isRecord(input)) return fail(m.linkTarget)
         const url = trimmed(input.url)
         const entry = trimmed(input.entry)
         const id = trimmed(input.id)
         const { label, error } = linkLabelValue(field, input.label, i18n, m)
         if (error) return fail(error)
         if (url && (entry || id)) return fail(m.linkUrlAndTarget)
         const extra: CmsLinkValue = {
            ...(label !== undefined ? { label } : {}),
            ...(input.newTab === true ? { newTab: true } : {}),
         }
         if (url) {
            if (!allowsExternalLinks(field)) return fail(m.linkExternal)
            const urlError = linkUrlError(url)
            if (urlError) return fail(urlError)
            return { url, ...extra }
         }
         if (!entry && !id) return label !== undefined ? fail(m.linkTarget) : null
         if (!entry || !id) return fail(m.linkTarget)
         if (targets && !targets.includes(entry)) return fail(m.linkEntry(entry))
         const target = config?.[entry]
         if (target?.kind === 'page' && !pageLinkPath(target, id)) return fail(m.linkUnknownPage)
         return { entry, id, ...extra }
      })
   if (!field.required) return parse
   return parse.refine((value) => value !== null, m.required)
}

function blockFieldSchema(
   blockField: FieldConfig,
   i18n: CmsI18n,
   m: ValidationMessages,
   config?: CmsConfig
): z.ZodType {
   if (blockField.type === 'link') return linkSchema(blockField, i18n, m, config)
   if (blockField.type === 'blocks') return blocksFieldSchema(blockField, i18n, m, config)
   if (isTranslatableField(blockField) && i18n.locales.length)
      return withValueBounds(blockField, translatableSchema(blockField, i18n, m), m)
   return withValueBounds(blockField, optionalize(blockField, scalarSchema(blockField, m), m), m)
}

function blockVariantSchema(
   type: string,
   block: BlockConfig,
   i18n: CmsI18n,
   m: ValidationMessages,
   config?: CmsConfig
) {
   const variant = z.object({
      type: z.literal(type),
      ...(declaresHiddenField(block) ? {} : { [BLOCK_HIDDEN_KEY]: z.boolean().optional() }),
      ...Object.fromEntries(
         Object.entries(block.fields).map(([key, blockField]) => [
            key,
            blockFieldSchema(unconditional(blockField), i18n, m, config),
         ])
      ),
   })
   const conditional = conditionalFields(block.fields)
   if (!conditional.length) return variant
   return variant.superRefine((item, ctx) => {
      for (const issue of conditionalIssues(conditional, item, block.fields, i18n, m))
         ctx.addIssue({ code: 'custom', ...issue })
   })
}

export function blockFieldValue(
   blockField: FieldConfig,
   value: unknown,
   i18n: CmsI18n,
   config?: CmsConfig
): unknown {
   const schema = blockFieldSchema(
      { ...blockField, required: false },
      i18n,
      DEFAULT_MESSAGES,
      config
   )
   const parsed = schema.safeParse(value)
   return parsed.success ? parsed.data ?? null : null
}

function blocksSchema(
   field: FieldConfig,
   i18n: CmsI18n,
   m: ValidationMessages,
   config?: CmsConfig
) {
   const variants = Object.entries(field.blocks ?? {}).map(([type, block]) =>
      blockVariantSchema(type, block, i18n, m, config)
   )
   return z.array(z.discriminatedUnion('type', variants as never))
}

function blocksFieldSchema(
   declared: FieldConfig,
   i18n: CmsI18n,
   m: ValidationMessages,
   config?: CmsConfig
): z.ZodType {
   const field = unconditional(declared)
   const list = blocksSchema(field, i18n, m, config)
   const base = field.required ? list.min(1, m.required) : list
   const bounded = declared.showIf ? base : boundedBlocks(base, field, m)
   return field.required ? bounded : bounded.nullish().transform((v) => v ?? null)
}

export function blocksCountMessage(
   field: Pick<FieldConfig, 'min' | 'max'>,
   count: number,
   messages?: Partial<ValidationMessages>
): string | null {
   const m: ValidationMessages = { ...DEFAULT_MESSAGES, ...messages }
   if (field.max !== undefined && count > field.max) return m.maxBlocks(field.max)
   if (field.min !== undefined && count > 0 && count < field.min) return m.minBlocks(field.min)
   return null
}

export function tagsCountMessage(
   field: Pick<FieldConfig, 'max'>,
   count: number,
   messages?: Partial<ValidationMessages>
): string | null {
   const m: ValidationMessages = { ...DEFAULT_MESSAGES, ...messages }
   if (field.max !== undefined && count > field.max) return m.maxTags(field.max)
   return null
}

export function valueBoundsMessage(
   field: Pick<FieldConfig, 'type' | 'min' | 'max'>,
   value: unknown,
   messages?: Partial<ValidationMessages>
): string | null {
   const m: ValidationMessages = { ...DEFAULT_MESSAGES, ...messages }
   if (field.type === 'number' && typeof value === 'number') {
      if (field.min !== undefined && value < field.min) return m.minValue(field.min)
      if (field.max !== undefined && value > field.max) return m.maxValue(field.max)
      return null
   }
   if (field.type !== 'text') return null
   const texts =
      typeof value === 'string'
         ? [value]
         : value && typeof value === 'object'
           ? Object.values(value).filter((text): text is string => typeof text === 'string')
           : []
   for (const text of texts) {
      const length = text.trim() ? text.length : 0
      if (!length) continue
      if (field.min !== undefined && length < field.min) return m.minLength(field.min)
      if (field.max !== undefined && length > field.max) return m.maxLength(field.max)
   }
   return null
}

function boundsMessage(field: FieldConfig, value: unknown, m: ValidationMessages): string | null {
   if (field.type === 'tags')
      return Array.isArray(value) ? tagsCountMessage(field, value.length, m) : null
   if (field.type === 'blocks')
      return Array.isArray(value) ? blocksCountMessage(field, value.length, m) : null
   return valueBoundsMessage(field, value, m)
}

function hasValueBounds(field: FieldConfig): boolean {
   return (
      (field.type === 'number' || field.type === 'text') &&
      (field.min !== undefined || field.max !== undefined)
   )
}

function withValueBounds(field: FieldConfig, schema: z.ZodType, m: ValidationMessages): z.ZodType {
   if (field.showIf || !hasValueBounds(field)) return schema
   return schema.superRefine((value, ctx) => {
      const message = valueBoundsMessage(field, value, m)
      if (message) ctx.addIssue({ code: 'custom', message })
   })
}

function unconditional(field: FieldConfig): FieldConfig {
   return field.showIf ? { ...field, required: false } : field
}

function conditionalFields(fields: Record<string, FieldConfig>): [string, FieldConfig][] {
   return Object.entries(fields).filter(
      ([, field]) =>
         !!field.showIf && (!!field.required || field.min !== undefined || field.max !== undefined)
   )
}

function conditionalIssues(
   conditional: [string, FieldConfig][],
   values: Record<string, unknown>,
   scope: Record<string, FieldConfig>,
   i18n: CmsI18n,
   m: ValidationMessages
): { path: string[]; message: string }[] {
   const issues: { path: string[]; message: string }[] = []
   for (const [key, field] of conditional) {
      if (!isFieldVisible(field, values, scope)) continue
      const value = values[key]
      if (field.required && isEmptyValue(field, value, i18n.defaultLocale)) {
         issues.push({ path: [key], message: m.required })
         continue
      }
      const message = boundsMessage(field, value, m)
      if (message) issues.push({ path: [key], message })
   }
   return issues
}

function tagsSchema(field: FieldConfig, bounded: boolean, m: ValidationMessages): z.ZodType {
   return z
      .array(z.string())
      .nullish()
      .transform((value) => normalizeTags(value ?? []))
      .superRefine((tags, ctx) => {
         if (field.required && !tags.length) ctx.addIssue({ code: 'custom', message: m.required })
         const message = bounded ? tagsCountMessage(field, tags.length, m) : null
         if (message) ctx.addIssue({ code: 'custom', message })
      })
}

function boundedBlocks<T extends z.ZodType<unknown[]>>(
   list: T,
   field: FieldConfig,
   m: ValidationMessages
): T {
   if (field.min === undefined && field.max === undefined) return list
   return list.superRefine((items, ctx) => {
      const message = blocksCountMessage(field, items.length, m)
      if (message) ctx.addIssue({ code: 'custom', message })
   })
}

export interface EntryValidationIssue {
   path: (string | number)[]
   message: string
   level: CmsValidationLevel
}

type ValidatedEntry = Pick<CmsEntry, 'fields'> & Partial<Pick<CmsEntry, 'validate'>>

function hookIssues(result: CmsValidateResult) {
   if (!Array.isArray(result)) return []
   return result.filter(
      (issue): issue is { field?: string; message: string; level?: CmsValidationLevel } =>
         !!issue && typeof issue === 'object' && typeof issue.message === 'string'
   )
}

function hasBlockValidateHooks(fields: Record<string, FieldConfig>): boolean {
   return Object.values(fields).some(
      (field) =>
         field.type === 'blocks' &&
         Object.values(field.blocks ?? {}).some(
            (block) => !!block.validate || hasBlockValidateHooks(block.fields)
         )
   )
}

function hasValidateHooks(entry: ValidatedEntry): boolean {
   return !!entry.validate || hasBlockValidateHooks(entry.fields)
}

export function entryValidationIssues(
   entry: ValidatedEntry,
   values: Record<string, unknown>,
   i18n: CmsI18n,
   path?: string
): EntryValidationIssue[] {
   const context: CmsValidateContext = {
      locales: i18n.locales,
      defaultLocale: i18n.defaultLocale,
      ...(path ? { path } : {}),
   }
   const issues: EntryValidationIssue[] = []
   if (entry.validate) {
      for (const issue of hookIssues(entry.validate(values, context))) {
         issues.push({
            path: issue.field ? [issue.field] : [],
            message: issue.message,
            level: issue.level === 'warning' ? 'warning' : 'error',
         })
      }
   }
   walkBlocks(entry.fields, values, ({ item, block, path, index }) => {
      if (!block.validate) return
      for (const issue of hookIssues(
         block.validate(item, { ...context, index, blockPath: formatBlockPath(path) })
      )) {
         issues.push({
            path: issue.field ? [...path, issue.field] : [...path],
            message: issue.message,
            level: issue.level === 'warning' ? 'warning' : 'error',
         })
      }
   })
   return issues
}

export function entryValidationWarnings(
   entry: ValidatedEntry,
   values: Record<string, unknown>,
   i18n: CmsI18n,
   path?: string
): EntryValidationIssue[] {
   if (!hasValidateHooks(entry)) return []
   return entryValidationIssues(entry, values, i18n, path).filter(
      (issue) => issue.level === 'warning'
   )
}

function isEmptyValue(field: FieldConfig, value: unknown, defaultLocale: string): boolean {
   if (value == null) return true
   if (Array.isArray(value)) return !value.length
   if (isTranslatableField(field)) {
      const values = value as Record<string, string>
      return !values[defaultLocale]?.trim()
   }
   if (typeof value === 'string') return !value.trim()
   return false
}

export function buildEntrySchema(
   entry: ValidatedEntry & { drafts?: boolean; path?: string; config?: CmsConfig },
   i18n: CmsI18n,
   messages?: Partial<ValidationMessages>
) {
   const m: ValidationMessages = { ...DEFAULT_MESSAGES, ...messages }
   const shape: Record<string, z.ZodType> = {}
   const conditional = conditionalFields(entry.fields)
   for (const [key, declared] of Object.entries(entry.fields)) {
      const field = unconditional(declared)
      if (field.type === 'relation' && field.cardinality === 'many-to-many') {
         const list = z.array(z.string().min(1))
         shape[key] = field.required
            ? list.min(1, m.required)
            : list.nullish().transform((v) => v ?? [])
         continue
      }
      if (field.type === 'select' && field.multiple) {
         const list = z.array(z.enum(selectOptionValues(field) as [string, ...string[]]))
         shape[key] = field.required
            ? list.min(1, m.required)
            : list.nullish().transform((v) => v ?? [])
         continue
      }
      if (field.type === 'tags') {
         shape[key] = tagsSchema(field, !declared.showIf, m)
         continue
      }
      if (field.type === 'link') {
         shape[key] = linkSchema(field, i18n, m, entry.config)
         continue
      }
      if (field.type === 'blocks') {
         shape[key] = blocksFieldSchema(declared, i18n, m, entry.config)
         continue
      }
      if (isTranslatableField(field) && i18n.locales.length) {
         shape[key] = withValueBounds(declared, translatableSchema(field, i18n, m), m)
         continue
      }
      if (field.type === 'json') {
         const json = z.unknown()
         shape[key] = field.required
            ? json.refine((v) => v !== undefined && v !== null, m.required)
            : json.nullish().transform((v) => v ?? null)
         continue
      }
      shape[key] = withValueBounds(declared, optionalize(field, scalarSchema(field, m), m), m)
   }
   if (entry.drafts) {
      shape.status = z
         .enum(['draft', 'published'])
         .nullish()
         .transform((v) => v ?? undefined)
   }

   const schema = z.object(shape)
   const hooks = hasValidateHooks(entry)
   if (!conditional.length && !hooks) return schema

   return schema.superRefine((parsed, ctx) => {
      const values = parsed as Record<string, unknown>
      for (const issue of conditionalIssues(conditional, values, entry.fields, i18n, m))
         ctx.addIssue({ code: 'custom', ...issue })
      if (!hooks) return
      for (const issue of entryValidationIssues(entry, values, i18n, entry.path)) {
         if (issue.level === 'error')
            ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message })
      }
   })
}
