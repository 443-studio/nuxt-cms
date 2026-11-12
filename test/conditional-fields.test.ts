import { describe, expect, it } from 'vitest'
import { renderSchemaFile, validateConfig } from '../src/schema-codegen'
import { renderTypesFile } from '../src/types-codegen'
import type { CmsConfig, FieldConfig } from '../src/runtime/shared/index'
import { fieldConditions, isFieldVisible, isRequiredField } from '../src/runtime/shared/index'
import { renderGraphqlSdl } from '../src/runtime/shared/graphql-sdl'
import { buildEntrySchema } from '../src/runtime/shared/validation'
import { I18N, sampleConfig } from './fixtures'

function conditionalConfig(): CmsConfig {
   const config = sampleConfig()
   config.events!.fields.seats!.showIf = { field: 'visibility', eq: 'public' }
   return config
}

describe('field conditions', () => {
   it('normalizes a single condition into a list', () => {
      expect(fieldConditions({ label: 'X', type: 'text' })).toEqual([])
      expect(
         fieldConditions({ label: 'X', type: 'text', showIf: { field: 'a', eq: 'b' } })
      ).toEqual([{ field: 'a', eq: 'b' }])
   })

   it('treats a field without showIf as always visible', () => {
      expect(isFieldVisible({ label: 'X', type: 'text' }, {})).toBe(true)
   })

   it('matches on eq', () => {
      const field = { label: 'X', type: 'text' as const, showIf: { field: 'kind', eq: 'a' } }
      expect(isFieldVisible(field, { kind: 'a' })).toBe(true)
      expect(isFieldVisible(field, { kind: 'b' })).toBe(false)
      expect(isFieldVisible(field, {})).toBe(false)
   })

   it('matches on in', () => {
      const field = { label: 'X', type: 'text' as const, showIf: { field: 'kind', in: ['a', 'c'] } }
      expect(isFieldVisible(field, { kind: 'a' })).toBe(true)
      expect(isFieldVisible(field, { kind: 'c' })).toBe(true)
      expect(isFieldVisible(field, { kind: 'b' })).toBe(false)
   })

   it('matches on booleans', () => {
      const field = { label: 'X', type: 'text' as const, showIf: { field: 'flag', eq: true } }
      expect(isFieldVisible(field, { flag: true })).toBe(true)
      expect(isFieldVisible(field, { flag: false })).toBe(false)
   })

   it('combines multiple conditions with and', () => {
      const field = {
         label: 'X',
         type: 'text' as const,
         showIf: [
            { field: 'kind', eq: 'a' },
            { field: 'flag', eq: true },
         ],
      }
      expect(isFieldVisible(field, { kind: 'a', flag: true })).toBe(true)
      expect(isFieldVisible(field, { kind: 'a', flag: false })).toBe(false)
      expect(isFieldVisible(field, { kind: 'b', flag: true })).toBe(false)
   })

   it('is visible for a null state only when unconditional', () => {
      expect(isFieldVisible({ label: 'X', type: 'text' }, null)).toBe(true)
      expect(
         isFieldVisible({ label: 'X', type: 'text', showIf: { field: 'kind', eq: 'a' } }, null)
      ).toBe(false)
   })
})

describe('showIf config validation', () => {
   it('accepts a well-formed condition', () => {
      expect(validateConfig(conditionalConfig(), I18N)).toEqual([])
   })

   it('accepts a list of conditions', () => {
      const config = sampleConfig()
      config.events!.fields.seats!.showIf = [
         { field: 'visibility', eq: 'public' },
         { field: 'featured', eq: true },
      ]
      expect(validateConfig(config, I18N)).toEqual([])
   })

   it('rejects a condition on an undeclared field', () => {
      const config = sampleConfig()
      config.events!.fields.seats!.showIf = { field: 'nope', eq: 'x' }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes("'nope' is not a declared field"))).toBe(true)
   })

   it('rejects a self-referencing condition', () => {
      const config = sampleConfig()
      config.events!.fields.seats!.showIf = { field: 'seats', eq: 1 }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes('cannot depend on itself'))).toBe(true)
   })

   it('rejects a condition on an unsupported field type', () => {
      const config = sampleConfig()
      config.events!.fields.seats!.showIf = { field: 'body', eq: 'x' }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes('showIf can only depend on'))).toBe(true)
   })

   it('rejects a condition on a multi-select field', () => {
      const config = sampleConfig()
      config.events!.fields.seats!.showIf = { field: 'species', eq: 'bass' }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes('showIf can only depend on'))).toBe(true)
   })

   it('rejects a condition on a translatable field', () => {
      const config = sampleConfig()
      config.events!.fields.title!.translatable = true
      config.events!.fields.seats!.showIf = { field: 'title', eq: 'x' }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes('cannot depend on a translatable field'))).toBe(true)
   })

   it('rejects a condition without an operator', () => {
      const config = sampleConfig()
      config.events!.fields.seats!.showIf = { field: 'visibility' }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes('showIf needs an operator'))).toBe(true)
   })

   it('rejects an empty in list', () => {
      const config = sampleConfig()
      config.events!.fields.seats!.showIf = { field: 'visibility', in: [] }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes("'in' needs a non-empty list"))).toBe(true)
   })

   it('rejects values outside the target select options', () => {
      const config = sampleConfig()
      config.events!.fields.seats!.showIf = { field: 'visibility', in: ['public', 'typo'] }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes("'typo' not in the options of 'visibility'"))).toBe(true)
   })

   it('rejects a conditional titleField', () => {
      const config = sampleConfig()
      config.events!.fields.title!.showIf = { field: 'visibility', eq: 'public' }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes('the titleField cannot be conditional'))).toBe(true)
   })

   it('accepts showIf on a block field that targets a sibling', () => {
      const config = sampleConfig()
      config.events!.fields.body!.blocks!.quote!.fields.source = {
         label: 'Source',
         type: 'text',
         showIf: { field: 'author', empty: false },
      }
      expect(validateConfig(config, I18N)).toEqual([])
   })

   it('rejects a block condition on a field outside the block', () => {
      const config = sampleConfig()
      config.events!.fields.body!.blocks!.hero!.fields.extra = {
         label: 'Extra',
         type: 'text',
         showIf: { field: 'visibility', eq: 'public' },
      }
      const errors = validateConfig(config, I18N)
      expect(errors).toEqual([
         "cms.config entry 'events', field 'body', block 'hero', field 'extra', showIf on 'visibility': 'visibility' is not a field of this block",
      ])
   })
})

describe('showIf operators at build time', () => {
   function errorsFor(showIf: unknown) {
      const config = sampleConfig()
      config.events!.fields.title!.translatable = true
      Object.assign(config.events!.fields, {
         doors: { label: 'Doors', type: 'datetime' },
         keywords: { label: 'Keywords', type: 'tags' },
      })
      config.events!.fields.seats!.showIf = showIf as never
      return validateConfig(config, I18N)
   }

   it.each([
      [{ field: 'visibility', neq: 'hidden' }],
      [{ field: 'visibility', notIn: ['hidden'] }],
      [{ field: 'date', gte: '2026-01-01', lt: '2027-01-01' }],
      [{ field: 'doors', gt: '2026-05-01T08:00:00Z' }],
      [{ field: 'featured', neq: true }],
      [{ field: 'poster', empty: false }],
      [{ field: 'brochure', empty: true }],
      [{ field: 'title', empty: false }],
      [{ field: 'category', empty: false }],
      [{ field: 'tags', has: 'categories_abc' }],
      [{ field: 'species', has: 'bass' }],
      [{ field: 'keywords', has: 'night' }],
      [{ field: 'metadata', empty: true }],
      [{ field: 'body', empty: false }],
      [{ any: [{ field: 'featured', eq: true }, { not: { field: 'visibility', eq: 'hidden' } }] }],
      [[{ all: [{ field: 'featured', eq: true }] }, { field: 'date', lte: '2030-12-31' }]],
   ])('accepts %j', (showIf) => {
      expect(errorsFor(showIf)).toEqual([])
   })

   it.each([
      [
         { field: 'visibility', gt: 'a' },
         "showIf can only depend on number, date, datetime fields with 'gt' (got 'select')",
      ],
      [{ field: 'featured', empty: true }, "'empty' does not apply to boolean fields"],
      [{ field: 'poster', empty: 'yes' }, "'empty' must be true or false"],
      [{ field: 'visibility', has: 'public' }, "fields with 'has' (got 'select')"],
      [{ field: 'species', has: 'shark' }, "'shark' not in the options of 'species'"],
      [{ field: 'species', eq: 'bass' }, "fields with 'eq' (got 'select (multiple)')"],
      [{ field: 'tags', eq: 'x' }, "fields with 'eq' (got 'relation (many-to-many)')"],
      [{ field: 'title', eq: 'x' }, "cannot depend on a translatable field with 'eq'"],
      [{ field: 'featured', eq: 'yes' }, `'eq' needs a boolean for a boolean field (got "yes")`],
      [{ field: 'date', eq: 1 }, "'eq' needs a yyyy-mm-dd date"],
      [{ field: 'date', gte: '01/02/2026' }, "'gte' needs a yyyy-mm-dd date"],
      [{ field: 'doors', lt: '2026-05-01' }, "'lt' needs an ISO 8601 date and time"],
      [{ field: 'visibility', notIn: ['public', 'typo'] }, "'typo' not in the options"],
      [{ field: 'visibility', notIn: [] }, "'notIn' needs a non-empty list"],
      [{ field: 'visibility', equals: 'public' }, "unknown showIf key 'equals'"],
      [{ any: [] }, "showIf 'any' takes a non-empty list of conditions"],
      [
         { all: [{ field: 'featured', eq: true }], field: 'x' },
         "holds only one of 'all', 'any' or 'not'",
      ],
      [{ not: [{ field: 'featured', eq: true }] }, "showIf 'not' takes one condition"],
      [{ not: { field: 'nope', eq: true } }, "'nope' is not a declared field"],
      [[], 'showIf needs at least one condition'],
      ['visibility', 'every showIf condition must be an object'],
   ])('rejects %j', (showIf, message) => {
      const errors = errorsFor(showIf)
      expect(errors.some((e) => e.includes(message as string))).toBe(true)
   })
})

describe('showIf evaluation', () => {
   const scope = {
      kind: { label: 'Kind', type: 'select', options: ['a', 'b'] },
      seats: { label: 'Seats', type: 'number' },
      day: { label: 'Day', type: 'date' },
      at: { label: 'At', type: 'datetime' },
      keywords: { label: 'Keywords', type: 'tags' },
      cover: { label: 'Cover', type: 'media' },
      title: { label: 'Title', type: 'text', translatable: true },
      data: { label: 'Data', type: 'json' },
   } satisfies Record<string, FieldConfig>
   const visible = (showIf: unknown, values: Record<string, unknown>) =>
      isFieldVisible({ label: 'X', type: 'text', showIf: showIf as never }, values, scope)

   it('compares with neq and notIn, a missing value included', () => {
      expect(visible({ field: 'kind', neq: 'a' }, { kind: 'b' })).toBe(true)
      expect(visible({ field: 'kind', neq: 'a' }, { kind: 'a' })).toBe(false)
      expect(visible({ field: 'kind', neq: 'a' }, {})).toBe(true)
      expect(visible({ field: 'kind', notIn: ['a'] }, { kind: null })).toBe(true)
      expect(visible({ field: 'kind', notIn: ['a', 'b'] }, { kind: 'b' })).toBe(false)
   })

   it('orders numbers, dates and datetimes, and never matches an empty value', () => {
      expect(visible({ field: 'seats', gt: 10 }, { seats: 11 })).toBe(true)
      expect(visible({ field: 'seats', gt: 10 }, { seats: 10 })).toBe(false)
      expect(visible({ field: 'seats', gte: 10, lte: 20 }, { seats: 20 })).toBe(true)
      expect(visible({ field: 'seats', lt: 10 }, { seats: null })).toBe(false)
      expect(visible({ field: 'day', lt: '2026-06-01' }, { day: '2026-05-31' })).toBe(true)
      expect(visible({ field: 'day', lt: '2026-06-01' }, { day: '' })).toBe(false)
      expect(
         visible(
            { field: 'at', gte: '2026-05-01T10:00:00+02:00' },
            { at: '2026-05-01T08:00:00.000Z' }
         )
      ).toBe(true)
      expect(
         visible(
            { field: 'at', eq: '2026-05-01T10:00:00+02:00' },
            { at: '2026-05-01T08:00:00.000Z' }
         )
      ).toBe(true)
   })

   it('tests emptiness per type', () => {
      expect(visible({ field: 'cover', empty: true }, { cover: null })).toBe(true)
      expect(visible({ field: 'cover', empty: false }, { cover: 'a.png' })).toBe(true)
      expect(visible({ field: 'keywords', empty: true }, { keywords: [] })).toBe(true)
      expect(visible({ field: 'title', empty: true }, { title: { en: ' ', it: '' } })).toBe(true)
      expect(visible({ field: 'title', empty: false }, { title: { it: 'Ciao' } })).toBe(true)
      expect(visible({ field: 'data', empty: true }, { data: {} })).toBe(true)
      expect(visible({ field: 'data', empty: true }, { data: { a: null } })).toBe(false)
      expect(visible({ field: 'seats', empty: false }, { seats: 0 })).toBe(true)
   })

   it('checks list membership with has, tags case-insensitively', () => {
      expect(visible({ field: 'keywords', has: 'night' }, { keywords: ['Night', 'lake'] })).toBe(
         true
      )
      expect(visible({ field: 'keywords', has: 'boat' }, { keywords: ['lake'] })).toBe(false)
      expect(visible({ field: 'keywords', has: 'boat' }, { keywords: null })).toBe(false)
   })

   it('combines with all, any and not, nested', () => {
      const showIf = {
         any: [
            {
               all: [
                  { field: 'kind', eq: 'a' },
                  { field: 'seats', gt: 5 },
               ],
            },
            { not: { field: 'cover', empty: true } },
         ],
      }
      expect(visible(showIf, { kind: 'a', seats: 6 })).toBe(true)
      expect(visible(showIf, { kind: 'a', seats: 2 })).toBe(false)
      expect(visible(showIf, { kind: 'b', cover: 'x.png' })).toBe(true)
   })

   it('requires every operator of one condition', () => {
      expect(visible({ field: 'seats', gt: 1, neq: 3 }, { seats: 3 })).toBe(false)
      expect(visible({ field: 'seats', gt: 1, neq: 3 }, { seats: 4 })).toBe(true)
   })
})

describe('a conditional field is never required outside the admin form', () => {
   function config() {
      const config = sampleConfig()
      config.events!.fields.seats!.required = true
      config.events!.fields.contactEmail!.required = true
      config.events!.fields.contactEmail!.showIf = { field: 'visibility', eq: 'public' }
      return config
   }

   it('reports required only for unconditional fields', () => {
      const fields = config().events!.fields
      expect(isRequiredField(fields.seats!)).toBe(true)
      expect(isRequiredField(fields.contactEmail!)).toBe(false)
   })

   it('leaves the column nullable', () => {
      const sql = renderSchemaFile(config(), 'sqlite')
      expect(sql).toContain("seats: integer('seats').notNull()")
      expect(sql).toContain("contactEmail: text('contact_email'),")
   })

   it('leaves the graphql field nullable', () => {
      const sdl = renderGraphqlSdl(config())
      expect(sdl).toContain('seats: Int!')
      expect(sdl).toContain('contactEmail: String\n')
   })

   it('leaves the generated type nullable', () => {
      const types = renderTypesFile(config())
      expect(types).toContain('seats: number\n')
      expect(types).toContain('contactEmail: string | null')
   })
})

describe('conditional required validation', () => {
   function schemaWith(field: string, showIf: unknown, required = true) {
      const config = sampleConfig().events!
      Object.assign(config.fields[field]!, { showIf, required })
      return buildEntrySchema(config, I18N)
   }

   function validEvent(overrides: Record<string, unknown> = {}) {
      return {
         title: 'Music Fest',
         slug: 'music-fest',
         description: { en: '<p>hello</p>' },
         seats: 100,
         date: '2026-08-01',
         featured: true,
         visibility: 'public',
         species: ['bass'],
         contactEmail: 'info@example.com',
         metadata: { any: 'thing' },
         poster: '2026/07/poster.png',
         brochure: { en: '2026/07/brochure-en.pdf' },
         body: [{ type: 'hero', heading: 'Welcome' }],
         category: 'categories_abc',
         tags: ['categories_abc'],
         status: 'draft',
         ...overrides,
      }
   }

   it('enforces required when the field is visible', () => {
      const schema = schemaWith('seats', { field: 'visibility', eq: 'public' })
      const result = schema.safeParse(validEvent({ visibility: 'public', seats: null }))
      expect(result.success).toBe(false)
      expect(result.error?.issues[0]?.path).toEqual(['seats'])
   })

   it('skips required when the field is hidden', () => {
      const schema = schemaWith('seats', { field: 'visibility', eq: 'public' })
      expect(schema.safeParse(validEvent({ visibility: 'hidden', seats: null })).success).toBe(true)
   })

   it('accepts a filled visible field', () => {
      const schema = schemaWith('seats', { field: 'visibility', eq: 'public' })
      expect(schema.safeParse(validEvent({ visibility: 'public', seats: 10 })).success).toBe(true)
   })

   it('treats an empty string as missing on a visible field', () => {
      const schema = schemaWith('contactEmail', { field: 'visibility', eq: 'public' })
      const result = schema.safeParse(validEvent({ visibility: 'public', contactEmail: '' }))
      expect(result.success).toBe(false)
   })

   it('treats an empty blocks list as missing on a visible field', () => {
      const schema = schemaWith('body', { field: 'visibility', eq: 'public' })
      const result = schema.safeParse(validEvent({ visibility: 'public', body: null }))
      expect(result.success).toBe(false)
      expect(result.error?.issues[0]?.path).toEqual(['body'])
   })

   it('keeps a hidden field value instead of clearing it', () => {
      const schema = schemaWith('seats', { field: 'visibility', eq: 'public' })
      const parsed = schema.parse(validEvent({ visibility: 'hidden', seats: 42 }))
      expect((parsed as { seats: number }).seats).toBe(42)
   })

   it('applies the richer operators to required while visible', () => {
      const schema = schemaWith('seats', { any: [{ field: 'visibility', neq: 'hidden' }] })
      expect(schema.safeParse(validEvent({ visibility: 'public', seats: null })).success).toBe(
         false
      )
      expect(schema.safeParse(validEvent({ visibility: 'hidden', seats: null })).success).toBe(true)
   })

   it('enforces a required block field only while its sibling condition holds', () => {
      const config = sampleConfig().events!
      config.fields.body!.blocks!.quote!.fields.source = {
         label: 'Source',
         type: 'text',
         required: true,
         showIf: { field: 'author', empty: false },
      }
      const schema = buildEntrySchema(config, I18N)
      const quote = (author: string | null, source: string | null) =>
         validEvent({ body: [{ type: 'quote', text: 'Hi', author, source }] })
      const result = schema.safeParse(quote('Ada', null))
      expect(result.success).toBe(false)
      expect(result.error?.issues.map((issue) => issue.path)).toEqual([['body', 0, 'source']])
      expect(schema.safeParse(quote(null, null)).success).toBe(true)
      expect(schema.safeParse(quote('Ada', 'Notes')).success).toBe(true)
   })

   it('leaves optional conditional fields alone', () => {
      const schema = schemaWith('seats', { field: 'visibility', eq: 'public' }, false)
      expect(schema.safeParse(validEvent({ visibility: 'public', seats: null })).success).toBe(true)
   })
})
