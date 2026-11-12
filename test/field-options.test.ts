import { describe, expect, it } from 'vitest'
import { renderSchemaFile, validateConfig } from '../src/schema-codegen'
import type { CmsConfig, FieldConfig } from '../src/runtime/shared/index'
import { duplicateEntryValues } from '../src/runtime/shared/duplicate'
import {
   changedImmutableKeys,
   entryDefaults,
   isCaseInsensitiveUnique,
   lockedFieldKeys,
   resolveFieldDefault,
   uniqueCompareValue,
   withEntryDefaults,
} from '../src/runtime/shared/field-options'
import { buildEntrySchema, valueBoundsMessage } from '../src/runtime/shared/validation'
import { I18N, sampleConfig } from './fixtures'

const NOW = new Date('2026-05-01T22:30:00.000Z')

describe('field defaults', () => {
   it('resolves today, now, translatable and list defaults', () => {
      expect(
         resolveFieldDefault({ label: 'D', type: 'date', default: 'today' }, I18N, { now: NOW })
      ).toBe('2026-05-01')
      expect(
         resolveFieldDefault({ label: 'D', type: 'datetime', default: 'now' }, I18N, { now: NOW })
      ).toBe('2026-05-01T22:30:00.000Z')
      expect(
         resolveFieldDefault(
            { label: 'T', type: 'text', translatable: true, default: 'Hello' },
            I18N
         )
      ).toEqual({ en: 'Hello' })
      const tags: FieldConfig = { label: 'T', type: 'tags', default: ['a'] }
      const resolved = resolveFieldDefault(tags, I18N) as string[]
      expect(resolved).toEqual(['a'])
      expect(resolved).not.toBe(tags.default)
   })

   it('collects the defaults of an entry and fills only absent keys', () => {
      const fields: Record<string, FieldConfig> = {
         title: { label: 'Title', type: 'text' },
         level: { label: 'Level', type: 'select', options: ['a', 'b'], default: 'b' },
         active: { label: 'Active', type: 'boolean', default: false },
         seats: { label: 'Seats', type: 'number', default: 10 },
      }
      expect(entryDefaults(fields, I18N)).toEqual({ level: 'b', active: false, seats: 10 })
      expect(withEntryDefaults(fields, { title: 'x', seats: null }, I18N)).toEqual({
         title: 'x',
         seats: null,
         level: 'b',
         active: false,
      })
   })
})

describe('immutable fields', () => {
   const fields: Record<string, FieldConfig> = {
      code: { label: 'Code', type: 'text', immutable: true },
      size: { label: 'Size', type: 'number', immutable: true },
      note: { label: 'Note', type: 'text' },
   }

   it('locks the immutable fields that hold a saved value', () => {
      expect(lockedFieldKeys(fields, { code: 'A1', size: null, note: 'x' })).toEqual(['code'])
      expect(lockedFieldKeys(fields, null)).toEqual([])
   })

   it('reports a change of a locked value only', () => {
      const saved = { code: 'A1', size: null }
      expect(changedImmutableKeys(fields, saved, { code: 'A1', size: 4, note: 'y' })).toEqual([])
      expect(changedImmutableKeys(fields, saved, { code: 'B2', size: 4 })).toEqual(['code'])
      expect(changedImmutableKeys(fields, saved, { code: null })).toEqual(['code'])
   })
})

describe('min and max on values', () => {
   it('bounds numbers by value and text by length', () => {
      const number = { type: 'number' as const, min: 1, max: 5 }
      expect(valueBoundsMessage(number, 0)).toBe('Must be at least 1')
      expect(valueBoundsMessage(number, 6)).toBe('Must be at most 5')
      expect(valueBoundsMessage(number, 3)).toBeNull()
      const text = { type: 'text' as const, min: 2, max: 4 }
      expect(valueBoundsMessage(text, 'a')).toBe('Use at least 2 characters')
      expect(valueBoundsMessage(text, 'abcde')).toBe('Use at most 4 characters')
      expect(valueBoundsMessage(text, '')).toBeNull()
      expect(valueBoundsMessage(text, { en: 'ok', it: 'troppo' })).toBe('Use at most 4 characters')
   })

   function schema(patch: (config: CmsConfig) => void) {
      const config = sampleConfig()
      patch(config)
      return buildEntrySchema(config.events!, I18N)
   }

   const event = (overrides: Record<string, unknown> = {}) => ({
      title: 'Fest',
      slug: 'fest',
      date: '2026-08-01',
      ...overrides,
   })

   it('checks the bounds in the entry schema', () => {
      const bounded = schema((config) => {
         Object.assign(config.events!.fields.seats!, { min: 1, max: 100 })
         Object.assign(config.events!.fields.title!, { max: 10 })
      })
      const result = bounded.safeParse(event({ seats: 0, title: 'A very long title' }))
      expect(result.error?.issues.map((issue) => [issue.path, issue.message])).toEqual([
         [['title'], 'Use at most 10 characters'],
         [['seats'], 'Must be at least 1'],
      ])
      expect(bounded.safeParse(event({ seats: null })).success).toBe(true)
   })

   it('applies conditional bounds only while visible', () => {
      const bounded = schema((config) => {
         Object.assign(config.events!.fields.seats!, {
            max: 10,
            showIf: { field: 'featured', eq: true },
         })
      })
      expect(bounded.safeParse(event({ seats: 50, featured: true })).success).toBe(false)
      expect(bounded.safeParse(event({ seats: 50, featured: false })).success).toBe(true)
   })

   it('checks text bounds of block fields', () => {
      const bounded = schema((config) => {
         Object.assign(config.events!.fields.body!.blocks!.quote!.fields.author!, { max: 3 })
      })
      const result = bounded.safeParse(
         event({ body: [{ type: 'quote', text: 'Hi', author: 'Somebody' }] })
      )
      expect(result.error?.issues[0]?.path).toEqual(['body', 0, 'author'])
   })

   it('stores a blank unique text as null', () => {
      const unique = schema((config) => {
         config.events!.fields.contactEmail = { label: 'Code', type: 'text', unique: true }
      })
      const parsed = unique.parse(event({ contactEmail: '  ' })) as Record<string, unknown>
      expect(parsed.contactEmail).toBeNull()
   })
})

describe('field options at build time', () => {
   function errorsFor(fields: Record<string, Partial<FieldConfig>>) {
      const config = sampleConfig()
      for (const [key, patch] of Object.entries(fields))
         config.events!.fields[key] = { ...config.events!.fields[key], ...patch } as FieldConfig
      return validateConfig(config, I18N)
   }

   it('accepts valid options', () => {
      expect(
         errorsFor({
            title: { default: 'Untitled', min: 2, max: 40, immutable: true },
            seats: { default: 10, min: 0, max: 500 },
            code: { label: 'Code', type: 'text', unique: true },
            date: { default: 'today', immutable: true },
            visibility: { default: 'public' },
            species: { default: ['bass', 'pike'] },
            featured: { default: false, immutable: true },
            contactEmail: { default: 'info@example.com' },
            description: { default: '<p>Hi</p>' },
            slug: { immutable: true },
            category: { immutable: true },
            keywords: { label: 'Keywords', type: 'tags', max: 2, default: ['a', 'A', 'b'] },
            doors: { label: 'Doors', type: 'datetime', default: 'now' },
         })
      ).toEqual([])
   })

   it.each([
      [{ seats: { default: '10' } }, 'default must be a number'],
      [{ seats: { default: 1.5 } }, 'default must be an integer'],
      [{ seats: { default: 600, max: 500 } }, 'default is greater than max (500)'],
      [{ title: { default: 'x', min: 2 } }, 'default is shorter than min (2)'],
      [{ date: { default: '2026-13-45' } }, "default must be 'today' or a yyyy-mm-dd date"],
      [
         { visibility: { default: 'secret' } },
         'default must be one of the options (public, hidden)',
      ],
      [{ species: { default: 'bass' } }, 'default of a multiple select must be a list of options'],
      [{ species: { default: ['shark'] } }, 'not options: "shark"'],
      [{ contactEmail: { default: 'nope' } }, 'default must be a valid email'],
      [{ poster: { default: 'a.png' } }, 'default is only supported on'],
      [{ featured: { default: 'yes' } }, 'default must be true or false'],
      [{ visibility: { unique: true } }, 'unique is only supported on text, email, number fields'],
      [{ slug: { unique: true } }, '(a slug is always unique)'],
      [{ description: { unique: true } }, 'unique is only supported on'],
      [{ title: { unique: true, translatable: true } }, 'unique is not supported on translatable'],
      [{ seats: { unique: true, default: 1 } }, 'default is not supported on unique fields'],
      [{ contactEmail: { unique: true, default: 'a@b.co' } }, 'default is not supported on unique'],
      [{ metadata: { immutable: true } }, 'immutable is only supported on'],
      [{ tags: { immutable: true } }, '(not many-to-many)'],
      [{ title: { immutable: 'yes' as never } }, 'immutable must be a boolean'],
      [{ featured: { min: 1 } }, 'min and max are only supported on number, text, blocks'],
      [{ seats: { min: 5, max: 1 } }, 'min (5) cannot be greater than max (1)'],
      [{ title: { min: -1 } }, 'min must be an integer of 0 or more (characters)'],
      [{ title: { maxLength: 3 } as never }, 'maxLength is not an option, use max'],
   ])('rejects %j', (fields, message) => {
      const errors = errorsFor(fields as Record<string, Partial<FieldConfig>>)
      expect(errors.some((e) => e.includes(message))).toBe(true)
   })

   it('refuses unique on singles and default, unique, immutable inside blocks', () => {
      const config = sampleConfig()
      config.homepage!.fields.code = { label: 'Code', type: 'text', unique: true }
      Object.assign(config.events!.fields.body!.blocks!.quote!.fields.author!, {
         default: 'Anon',
         unique: true,
         immutable: true,
      })
      const errors = validateConfig(config, I18N)
      expect(errors).toEqual(
         expect.arrayContaining([
            "cms.config entry 'homepage', field 'code': unique is not supported on singles, which hold one item",
            "cms.config entry 'events', field 'body', block 'quote', field 'author': default is not supported inside blocks",
            "cms.config entry 'events', field 'body', block 'quote', field 'author': unique is not supported inside blocks",
            "cms.config entry 'events', field 'body', block 'quote', field 'author': immutable is not supported inside blocks",
         ])
      )
   })

   it('refuses default, unique and immutable on pages', () => {
      const config = sampleConfig()
      config.pages = {
         id: 'pages',
         label: 'Pages',
         kind: 'page',
         fields: {
            title: { label: 'Title', type: 'text', default: 'x', unique: true, immutable: true },
         },
      }
      const errors = validateConfig(config, I18N)
      expect(errors.filter((e) => e.includes('not supported on pages'))).toHaveLength(3)
   })
})

describe('unique columns', () => {
   it('adds a unique constraint to unique text, email and number columns', () => {
      const config = sampleConfig()
      Object.assign(config.events!.fields.seats!, { unique: true })
      Object.assign(config.events!.fields.contactEmail!, { unique: true })
      const schema = renderSchemaFile(config, 'sqlite')
      expect(schema).toContain("seats: integer('seats').unique(),")
      expect(schema).toContain("contactEmail: text('contact_email').unique(),")
      expect(renderSchemaFile(config, 'postgres')).toContain("seats: integer('seats').unique(),")
   })

   it('clears unique values on duplicate', () => {
      const config = sampleConfig()
      Object.assign(config.events!.fields.contactEmail!, { unique: true })
      const copy = duplicateEntryValues(config.events!, {
         title: 'Fest',
         contactEmail: 'a@b.co',
         seats: 3,
      })
      expect(copy.contactEmail).toBeNull()
      expect(copy.seats).toBe(3)
   })
})

describe('unique comparison', () => {
   it('compares emails without case and other values exactly', () => {
      expect(isCaseInsensitiveUnique({ type: 'email' })).toBe(true)
      expect(isCaseInsensitiveUnique({ type: 'text' })).toBe(false)
      expect(uniqueCompareValue({ type: 'email' }, 'Ann@Example.com')).toBe('ann@example.com')
      expect(uniqueCompareValue({ type: 'text' }, 'SPR-26')).toBe('SPR-26')
      expect(uniqueCompareValue({ type: 'number' }, 4)).toBe(4)
   })
})
