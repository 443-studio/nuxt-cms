import { describe, expect, it } from 'vitest'
import type { CmsValidate, CmsValidateContext } from '../src/runtime/shared/index'
import {
   defaultLocaleValue,
   selectDisplayValue,
   selectOptionLabel,
   selectOptionValues,
   selectValuesMatching,
} from '../src/runtime/shared/index'
import {
   blocksCountMessage,
   buildEntrySchema,
   entryValidationIssues,
   entryValidationWarnings,
} from '../src/runtime/shared/validation'
import { I18N, sampleConfig } from './fixtures'

const events = sampleConfig().events!

function validEvent() {
   return {
      title: 'Music Fest',
      slug: 'music-fest',
      description: { en: '<p>hello</p>' },
      seats: 100,
      date: '2026-08-01',
      featured: true,
      visibility: 'public',
      species: ['bass', 'trout'],
      contactEmail: 'info@example.com',
      metadata: { any: 'thing' },
      poster: '2026/07/poster.png',
      brochure: { en: '2026/07/brochure-en.pdf', it: '2026/07/brochure-it.pdf' },
      body: [{ type: 'hero', heading: 'Welcome' }],
      category: 'categories_abc',
      tags: ['categories_abc'],
      status: 'draft',
   }
}

describe('buildEntrySchema', () => {
   const schema = buildEntrySchema(events, I18N)

   it('accepts a valid entry', () => {
      expect(() => schema.parse(validEvent())).not.toThrow()
   })

   it('rejects an empty required text field', () => {
      expect(schema.safeParse({ ...validEvent(), title: '' }).success).toBe(false)
   })

   it('normalizes omitted optional fields to null', () => {
      const entry = validEvent() as Record<string, unknown>
      delete entry.seats
      delete entry.featured
      const parsed = schema.parse(entry)
      expect(parsed.seats).toBeNull()
      expect(parsed.featured).toBeNull()
   })

   it('rejects non-integer values for integer fields', () => {
      expect(schema.safeParse({ ...validEvent(), seats: 1.5 }).success).toBe(false)
   })

   it('rejects malformed dates', () => {
      expect(schema.safeParse({ ...validEvent(), date: '2026-8-1' }).success).toBe(false)
   })

   it('rejects invalid emails', () => {
      expect(schema.safeParse({ ...validEvent(), contactEmail: 'nope' }).success).toBe(false)
   })

   it('rejects invalid slugs', () => {
      expect(schema.safeParse({ ...validEvent(), slug: 'Not A Slug' }).success).toBe(false)
   })

   it('rejects values outside the select options', () => {
      expect(schema.safeParse({ ...validEvent(), visibility: 'secret' }).success).toBe(false)
   })

   it('accepts a valid multi-select array', () => {
      expect(schema.safeParse({ ...validEvent(), species: ['pike'] }).success).toBe(true)
   })

   it('normalizes omitted multi-select fields to empty arrays', () => {
      const entry = validEvent() as Record<string, unknown>
      delete entry.species
      expect(schema.parse(entry).species).toEqual([])
   })

   it('rejects a multi-select array containing an unknown option', () => {
      expect(schema.safeParse({ ...validEvent(), species: ['shark'] }).success).toBe(false)
   })

   it('rejects unknown locale keys on translatable fields', () => {
      const result = schema.safeParse({ ...validEvent(), description: { fr: 'bonjour' } })
      expect(result.success).toBe(false)
   })

   it('requires the default locale on required translatable fields', () => {
      const config = sampleConfig().events!
      config.fields.description!.required = true
      const strict = buildEntrySchema(config, I18N)
      expect(strict.safeParse({ ...validEvent(), description: { it: 'ciao' } }).success).toBe(false)
      expect(strict.safeParse({ ...validEvent(), description: { en: 'hi' } }).success).toBe(true)
   })

   it('rejects blocks with an unknown type', () => {
      const result = schema.safeParse({ ...validEvent(), body: [{ type: 'nope', heading: 'x' }] })
      expect(result.success).toBe(false)
   })

   it('validates required fields inside blocks', () => {
      const result = schema.safeParse({ ...validEvent(), body: [{ type: 'hero', heading: '' }] })
      expect(result.success).toBe(false)
   })

   it('accepts any JSON value in a json field inside a block', () => {
      const config = sampleConfig().events!
      config.fields.body!.blocks!.hero!.fields.extra = { label: 'Extra', type: 'json' }
      const withJson = buildEntrySchema(config, I18N)
      for (const extra of [{ room: 'A' }, [1, 2], 'text', 3, true, null]) {
         expect(
            withJson.safeParse({ ...validEvent(), body: [{ type: 'hero', heading: 'Hi', extra }] })
               .success
         ).toBe(true)
      }
   })

   it('requires a value in a required json field inside a block', () => {
      const config = sampleConfig().events!
      config.fields.body!.blocks!.hero!.fields.extra = {
         label: 'Extra',
         type: 'json',
         required: true,
      }
      const withJson = buildEntrySchema(config, I18N)
      expect(
         withJson.safeParse({ ...validEvent(), body: [{ type: 'hero', heading: 'Hi' }] }).success
      ).toBe(false)
   })

   it('validates translatable fields inside blocks as locale maps', () => {
      const config = sampleConfig().events!
      config.fields.body!.blocks!.hero!.fields.heading!.translatable = true
      const translatable = buildEntrySchema(config, I18N)

      expect(
         translatable.safeParse({
            ...validEvent(),
            body: [{ type: 'hero', heading: { en: 'Welcome', it: 'Benvenuto' } }],
         }).success
      ).toBe(true)
      expect(
         translatable.safeParse({ ...validEvent(), body: [{ type: 'hero', heading: 'Welcome' }] })
            .success
      ).toBe(false)
   })

   it('rejects unknown locales inside blocks', () => {
      const config = sampleConfig().events!
      config.fields.body!.blocks!.hero!.fields.heading!.translatable = true
      const translatable = buildEntrySchema(config, I18N)

      expect(
         translatable.safeParse({
            ...validEvent(),
            body: [{ type: 'hero', heading: { en: 'Welcome', fr: 'Bienvenue' } }],
         }).success
      ).toBe(false)
   })

   it('requires the default locale on a required translatable block field', () => {
      const config = sampleConfig().events!
      config.fields.body!.blocks!.hero!.fields.heading!.translatable = true
      const translatable = buildEntrySchema(config, I18N)

      expect(
         translatable.safeParse({
            ...validEvent(),
            body: [{ type: 'hero', heading: { it: 'Benvenuto' } }],
         }).success
      ).toBe(false)
   })

   it('validates translatable media keys inside blocks', () => {
      const config = sampleConfig().events!
      config.fields.body!.blocks!.hero!.fields.image = {
         label: 'Image',
         type: 'media',
         translatable: true,
      }
      const translatable = buildEntrySchema(config, I18N)

      expect(
         translatable.safeParse({
            ...validEvent(),
            body: [{ type: 'hero', heading: 'Welcome', image: { en: '2026/07/hero.png' } }],
         }).success
      ).toBe(true)
      expect(
         translatable.safeParse({
            ...validEvent(),
            body: [{ type: 'hero', heading: 'Welcome', image: { en: '../etc/passwd' } }],
         }).success
      ).toBe(false)
   })

   it('normalizes omitted many-to-many lists to empty arrays', () => {
      const entry = validEvent() as Record<string, unknown>
      delete entry.tags
      expect(schema.parse(entry).tags).toEqual([])
   })

   it('rejects invalid status values when drafts are enabled', () => {
      expect(schema.safeParse({ ...validEvent(), status: 'archived' }).success).toBe(false)
   })

   it('rejects media keys with path traversal', () => {
      expect(schema.safeParse({ ...validEvent(), poster: '../etc/passwd' }).success).toBe(false)
   })

   it('accepts a partial locale map on a translatable media field', () => {
      const parsed = schema.parse({ ...validEvent(), brochure: { it: '2026/07/only-it.pdf' } })
      expect(parsed.brochure).toEqual({ it: '2026/07/only-it.pdf' })
   })

   it('normalizes an omitted translatable media field to null', () => {
      const entry = validEvent() as Record<string, unknown>
      delete entry.brochure
      expect(schema.parse(entry).brochure).toBeNull()
   })

   it('rejects unknown locale keys on translatable media fields', () => {
      expect(schema.safeParse({ ...validEvent(), brochure: { fr: 'a.pdf' } }).success).toBe(false)
   })

   it('rejects translatable media keys with path traversal', () => {
      expect(schema.safeParse({ ...validEvent(), brochure: { en: '../etc/passwd' } }).success).toBe(
         false
      )
   })

   it('requires the default locale on required translatable media fields', () => {
      const config = sampleConfig().events!
      config.fields.brochure!.required = true
      const strict = buildEntrySchema(config, I18N)
      expect(strict.safeParse({ ...validEvent(), brochure: { it: 'a.pdf' } }).success).toBe(false)
      expect(strict.safeParse({ ...validEvent(), brochure: { en: 'a.pdf' } }).success).toBe(true)
   })
})

function labelledEvents() {
   const events = sampleConfig().events!
   events.fields.visibility!.options = [
      'public',
      { value: 'members', label: 'Club members' },
      { value: 'hidden', label: 'Hidden from the site' },
   ]
   events.fields.species!.options = [{ value: 'bass', label: 'Black bass' }, 'trout', 'pike']
   return events
}

describe('select option labels', () => {
   const events = labelledEvents()
   const schema = buildEntrySchema(events, I18N)

   it('lists the stored values of mixed options', () => {
      expect(selectOptionValues(events.fields.visibility!)).toEqual(['public', 'members', 'hidden'])
   })

   it('shows the label of a value, and the value itself without a label', () => {
      expect(selectOptionLabel(events.fields.visibility!, 'members')).toBe('Club members')
      expect(selectOptionLabel(events.fields.visibility!, 'public')).toBe('public')
      expect(selectOptionLabel(events.fields.visibility!, 'gone')).toBe('gone')
   })

   it('joins the labels of a multi-select value', () => {
      expect(selectDisplayValue(events.fields.species!, ['bass', 'pike'])).toBe('Black bass, pike')
      expect(selectDisplayValue(events.fields.species!, null)).toBe('')
   })

   it('finds the values whose label matches a search term', () => {
      expect(selectValuesMatching(events.fields.visibility!, 'CLUB')).toEqual(['members'])
      expect(selectValuesMatching(events.fields.visibility!, 'public')).toEqual([])
   })

   it('stores the value, not the label', () => {
      expect(schema.safeParse({ ...validEvent(), visibility: 'members' }).success).toBe(true)
      expect(schema.safeParse({ ...validEvent(), visibility: 'Club members' }).success).toBe(false)
   })

   it('validates multi-select values against the option values', () => {
      expect(schema.safeParse({ ...validEvent(), species: ['bass', 'trout'] }).success).toBe(true)
      expect(schema.safeParse({ ...validEvent(), species: ['Black bass'] }).success).toBe(false)
   })
})

describe('blocks min and max', () => {
   function bounded(min?: number, max?: number, required = false) {
      const events = sampleConfig().events!
      Object.assign(events.fields.body!, { min, max, required })
      return buildEntrySchema(events, I18N)
   }

   const hero = { type: 'hero', heading: 'Welcome' }

   it('rejects more blocks than max', () => {
      const schema = bounded(undefined, 2)
      expect(schema.safeParse({ ...validEvent(), body: [hero, hero] }).success).toBe(true)
      const result = schema.safeParse({ ...validEvent(), body: [hero, hero, hero] })
      expect(result.error?.issues).toEqual([
         expect.objectContaining({ path: ['body'], message: 'Add at most 2 blocks' }),
      ])
   })

   it('rejects fewer blocks than min once the field has blocks', () => {
      const schema = bounded(2)
      const result = schema.safeParse({ ...validEvent(), body: [hero] })
      expect(result.error?.issues).toEqual([
         expect.objectContaining({ path: ['body'], message: 'Add at least 2 blocks' }),
      ])
      expect(schema.safeParse({ ...validEvent(), body: [hero, hero] }).success).toBe(true)
   })

   it('lets an optional field stay empty, whatever its min', () => {
      const schema = bounded(2)
      expect(schema.safeParse({ ...validEvent(), body: null }).success).toBe(true)
      expect(schema.safeParse({ ...validEvent(), body: [] }).success).toBe(true)
   })

   it('requires blocks on a required field with a min', () => {
      const schema = bounded(2, undefined, true)
      expect(schema.safeParse({ ...validEvent(), body: [] }).success).toBe(false)
      expect(schema.safeParse({ ...validEvent(), body: [hero] }).success).toBe(false)
   })

   it('enforces the bounds of a conditional field only while it is visible', () => {
      const events = sampleConfig().events!
      Object.assign(events.fields.body!, { max: 1, showIf: { field: 'featured', eq: true } })
      const schema = buildEntrySchema(events, I18N)
      const body = [hero, hero]
      expect(schema.safeParse({ ...validEvent(), featured: false, body }).success).toBe(true)
      const result = schema.safeParse({ ...validEvent(), featured: true, body })
      expect(result.error?.issues).toEqual([
         expect.objectContaining({ path: ['body'], message: 'Add at most 1 block' }),
      ])
   })

   it('uses custom messages', () => {
      const events = sampleConfig().events!
      Object.assign(events.fields.body!, { max: 1 })
      const schema = buildEntrySchema(events, I18N, { maxBlocks: (max) => `max ${max}` })
      const result = schema.safeParse({ ...validEvent(), body: [hero, hero] })
      expect(result.error?.issues[0]?.message).toBe('max 1')
      expect(blocksCountMessage({ min: 3 }, 1, { minBlocks: (min) => `min ${min}` })).toBe('min 3')
      expect(blocksCountMessage({ min: 3 }, 0)).toBeNull()
   })
})

describe('entry validate hook', () => {
   function hooked(validate: CmsValidate) {
      return { ...sampleConfig().events!, validate }
   }

   it('turns error issues into field errors', () => {
      const entry = hooked((values) =>
         values.seats === 0 ? [{ field: 'seats', message: 'No seats left' }] : []
      )
      const schema = buildEntrySchema(entry, I18N)
      expect(schema.safeParse(validEvent()).success).toBe(true)
      const result = schema.safeParse({ ...validEvent(), seats: 0 })
      expect(result.error?.issues).toEqual([
         expect.objectContaining({ path: ['seats'], message: 'No seats left' }),
      ])
   })

   it('reports an issue without a field at the root of the form', () => {
      const schema = buildEntrySchema(
         hooked(() => [{ message: 'Something is off' }]),
         I18N
      )
      expect(schema.safeParse(validEvent()).error?.issues).toEqual([
         expect.objectContaining({ path: [], message: 'Something is off' }),
      ])
   })

   it('does not block saving on warnings, and lists them apart', () => {
      const entry = hooked(() => [
         { field: 'poster', message: 'Add a poster', level: 'warning' },
         { message: 'Check the dates', level: 'warning' },
      ])
      expect(buildEntrySchema(entry, I18N).safeParse(validEvent()).success).toBe(true)
      expect(entryValidationWarnings(entry, validEvent(), I18N)).toEqual([
         { path: ['poster'], message: 'Add a poster', level: 'warning' },
         { path: [], message: 'Check the dates', level: 'warning' },
      ])
   })

   it('passes the locales, and reads a translatable value in the default locale', () => {
      let seen: CmsValidateContext | undefined
      const entry = hooked((values, context) => {
         seen = context
         return defaultLocaleValue(values.description, context.defaultLocale)
            ? []
            : [{ field: 'description', message: 'English description missing' }]
      })
      const schema = buildEntrySchema(entry, I18N)
      expect(schema.safeParse(validEvent()).success).toBe(true)
      expect(seen).toEqual({ locales: ['en', 'it'], defaultLocale: 'en' })
      const result = schema.safeParse({ ...validEvent(), description: { it: '<p>ciao</p>' } })
      expect(result.error?.issues[0]).toMatchObject({ path: ['description'] })
   })

   it('passes the page path to the hook', () => {
      let path: string | undefined
      const entry = hooked((_values, context) => {
         path = context.path
         return []
      })
      buildEntrySchema({ ...entry, path: '/about' }, I18N).parse(validEvent())
      expect(path).toBe('/about')
   })

   it('runs the hook on the parsed values', () => {
      let received: Record<string, unknown> | undefined
      const entry = hooked((values) => {
         received = values
         return []
      })
      const event = validEvent() as Record<string, unknown>
      delete event.seats
      buildEntrySchema(entry, I18N).parse(event)
      expect(received?.seats).toBeNull()
   })

   it('ignores malformed issues and empty results', () => {
      const entry = hooked(
         () => [null, { field: 'seats' }, 'oops'] as unknown as { message: string }[]
      )
      expect(buildEntrySchema(entry, I18N).safeParse(validEvent()).success).toBe(true)
      expect(
         buildEntrySchema(
            hooked(() => undefined),
            I18N
         ).safeParse(validEvent()).success
      ).toBe(true)
   })
})

describe('block validate hook', () => {
   function hookedBlocks() {
      const events = sampleConfig().events!
      events.fields.body!.blocks!.quote!.validate = (values, context) => {
         if (values.author === 'anonymous')
            return [{ field: 'author', message: `Name the author of quote ${context.index + 1}` }]
         if (!values.author) return [{ message: 'Quote without author', level: 'warning' }]
         return []
      }
      return events
   }

   it('maps block issues to the block path', () => {
      const events = hookedBlocks()
      const body = [
         { type: 'hero', heading: 'Welcome' },
         { type: 'quote', text: 'Fish are friends', author: 'anonymous' },
      ]
      const result = buildEntrySchema(events, I18N).safeParse({ ...validEvent(), body })
      expect(result.error?.issues).toEqual([
         expect.objectContaining({
            path: ['body', 1, 'author'],
            message: 'Name the author of quote 2',
         }),
      ])
   })

   it('keeps block warnings out of the schema and reports them at the block', () => {
      const events = hookedBlocks()
      const body = [{ type: 'quote', text: 'Fish are friends' }]
      expect(buildEntrySchema(events, I18N).safeParse({ ...validEvent(), body }).success).toBe(true)
      expect(entryValidationIssues(events, { body }, I18N)).toEqual([
         { path: ['body', 0], message: 'Quote without author', level: 'warning' },
      ])
   })

   it('runs only on blocks of its own type', () => {
      const events = hookedBlocks()
      const body = [{ type: 'hero', heading: 'Welcome', author: 'anonymous' }]
      expect(entryValidationIssues(events, { body }, I18N)).toEqual([])
   })
})
