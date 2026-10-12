import { describe, expect, it } from 'vitest'
import { validateConfig } from '../src/schema-codegen'
import { I18N, sampleConfig } from './fixtures'

describe('validateConfig', () => {
   it('accepts a well-formed config', () => {
      expect(validateConfig(sampleConfig(), I18N)).toEqual([])
   })

   it('rejects a defaultLocale missing from locales', () => {
      const errors = validateConfig(sampleConfig(), { locales: ['en'], defaultLocale: 'fr' })
      expect(errors.some((e) => e.includes("defaultLocale 'fr'"))).toBe(true)
   })

   it('rejects reserved entry names', () => {
      const config = sampleConfig()
      config.media = config.categories!
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes('reserved name'))).toBe(true)
   })

   it('rejects duplicate entry ids', () => {
      const config = sampleConfig()
      config.other = { ...config.categories!, fields: { ...config.categories!.fields } }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes('already used'))).toBe(true)
   })

   it('rejects non-identifier field keys', () => {
      const config = sampleConfig()
      config.categories!.fields['bad-key'] = { label: 'Bad', type: 'text' }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes("field 'bad-key'"))).toBe(true)
   })

   it('rejects reserved column names', () => {
      const config = sampleConfig()
      config.categories!.fields.createdAt = { label: 'Created', type: 'text' }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes("column 'created_at' is reserved"))).toBe(true)
   })

   it('rejects an unknown titleField', () => {
      const config = sampleConfig()
      config.categories!.titleField = 'missing'
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes("titleField 'missing'"))).toBe(true)
   })

   it('rejects a collection without a titleField', () => {
      const config = sampleConfig()
      delete config.categories!.titleField
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes('titleField is required on collections'))).toBe(true)
   })

   it('rejects a titleField of an undisplayable type', () => {
      const config = sampleConfig()
      config.events!.titleField = 'description'
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes("titleField 'description' must be one of"))).toBe(true)
   })

   it('rejects select without options', () => {
      const config = sampleConfig()
      config.events!.fields.visibility = { label: 'Visibility', type: 'select', options: [] }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes('non-empty options'))).toBe(true)
   })

   it('accepts select options with labels, mixed with plain strings', () => {
      const config = sampleConfig()
      config.events!.fields.visibility!.options = ['public', { value: 'hidden', label: 'Hidden' }]
      config.events!.fields.body!.blocks!.quote!.fields.tone = {
         label: 'Tone',
         type: 'select',
         options: [{ value: 'calm', label: 'Calm' }],
      }
      expect(validateConfig(config, I18N)).toEqual([])
   })

   it('rejects duplicate select values, labelled or not', () => {
      const config = sampleConfig()
      config.events!.fields.visibility!.options = ['public', { value: 'public', label: 'Public' }]
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes("select option 'public' is duplicated"))).toBe(true)
   })

   it('rejects a select option with an empty label or value', () => {
      const config = sampleConfig()
      config.events!.fields.visibility!.options = [
         { value: 'public', label: ' ' },
         { value: '', label: 'Nothing' },
         '',
      ]
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes("select option 'public' needs a non-empty label"))).toBe(
         true
      )
      expect(errors.some((e) => e.includes('needs a non-empty string value'))).toBe(true)
      expect(errors.some((e) => e.includes('cannot be empty strings'))).toBe(true)
   })

   it('rejects malformed select options inside blocks', () => {
      const config = sampleConfig()
      config.events!.fields.body!.blocks!.quote!.fields.tone = {
         label: 'Tone',
         type: 'select',
         options: ['calm', 'calm', 42] as unknown as string[],
      }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes("field 'tone'") && e.includes('duplicated'))).toBe(true)
      expect(
         errors.some((e) => e.includes('select options must be strings or { value, label }'))
      ).toBe(true)
   })

   it('checks showIf values against the select values, not the labels', () => {
      const config = sampleConfig()
      config.events!.fields.visibility!.options = ['public', { value: 'hidden', label: 'Hidden' }]
      config.events!.fields.contactEmail!.showIf = { field: 'visibility', eq: 'hidden' }
      expect(validateConfig(config, I18N)).toEqual([])
      config.events!.fields.contactEmail!.showIf = { field: 'visibility', eq: 'Hidden' }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes("'Hidden' not in the options of 'visibility'"))).toBe(
         true
      )
   })

   it('accepts min and max on a blocks field', () => {
      const config = sampleConfig()
      Object.assign(config.events!.fields.body!, { min: 1, max: 3 })
      expect(validateConfig(config, I18N)).toEqual([])
   })

   it('rejects min greater than max', () => {
      const config = sampleConfig()
      Object.assign(config.events!.fields.body!, { min: 4, max: 3 })
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes('min (4) cannot be greater than max (3)'))).toBe(true)
   })

   it('rejects negative, fractional or zero block counts', () => {
      const config = sampleConfig()
      Object.assign(config.events!.fields.body!, { min: -1, max: 0 })
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes('min must be an integer of 0 or more'))).toBe(true)
      expect(errors.some((e) => e.includes('max must be an integer of 1 or more'))).toBe(true)
      Object.assign(config.events!.fields.body!, { min: 1.5, max: undefined })
      expect(validateConfig(config, I18N).some((e) => e.includes('min must be an integer'))).toBe(
         true
      )
   })

   it('rejects min and max on a field that is not blocks', () => {
      const config = sampleConfig()
      config.events!.fields.seats!.max = 3
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes('min and max are only supported on blocks'))).toBe(true)
   })

   it('accepts validate functions on entries and blocks', () => {
      const config = sampleConfig()
      config.events!.validate = () => []
      config.events!.fields.body!.blocks!.hero!.validate = () => []
      expect(validateConfig(config, I18N)).toEqual([])
   })

   it('rejects a validate option that is not a function', () => {
      const config = sampleConfig()
      config.events!.validate = 'nope' as never
      config.events!.fields.body!.blocks!.hero!.validate = {} as never
      const errors = validateConfig(config, I18N)
      expect(errors.filter((e) => e.includes('validate must be a function')).length).toBe(2)
   })

   it('rejects slug sourced from a non-text field', () => {
      const config = sampleConfig()
      config.events!.fields.slug = { label: 'Slug', type: 'slug', from: 'seats' }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes("slug source 'seats'"))).toBe(true)
   })

   it('rejects translatable fields without configured locales', () => {
      const errors = validateConfig(sampleConfig(), { locales: [], defaultLocale: 'en' })
      expect(errors.some((e) => e.includes('translatable requires'))).toBe(true)
   })

   it('accepts translatable media fields', () => {
      const config = sampleConfig()
      config.events!.fields.poster!.translatable = true
      expect(validateConfig(config, I18N)).toEqual([])
   })

   it('rejects translatable on field types that do not support it', () => {
      const config = sampleConfig()
      config.events!.fields.seats!.translatable = true
      const errors = validateConfig(config, I18N)
      expect(
         errors.some((e) =>
            e.includes('translatable is only supported on text, richtext and media')
         )
      ).toBe(true)
   })

   it('accepts translatable text, richtext and media inside blocks', () => {
      const config = sampleConfig()
      config.events!.fields.body!.blocks!.hero!.fields.image = {
         label: 'Image',
         type: 'media',
         translatable: true,
      }
      config.events!.fields.body!.blocks!.hero!.fields.heading!.translatable = true
      config.events!.fields.body!.blocks!.quote!.fields.body = {
         label: 'Body',
         type: 'richtext',
         translatable: true,
      }
      expect(validateConfig(config, I18N)).toEqual([])
   })

   it('rejects translatable inside blocks on field types that do not support it', () => {
      const config = sampleConfig()
      config.events!.fields.body!.blocks!.hero!.fields.count = {
         label: 'Count',
         type: 'number',
         translatable: true,
      }
      const errors = validateConfig(config, I18N)
      expect(
         errors.some(
            (e) =>
               e.includes("field 'count'") &&
               e.includes('translatable is only supported on text, richtext and media')
         )
      ).toBe(true)
   })

   it('rejects translatable inside blocks without configured locales', () => {
      const config = sampleConfig()
      config.events!.fields.body!.blocks!.hero!.fields.heading!.translatable = true
      const errors = validateConfig(config)
      expect(
         errors.some(
            (e) =>
               e.includes("field 'heading'") && e.includes('translatable requires cms.i18n.locales')
         )
      ).toBe(true)
   })

   it('still rejects a translatable blocks field itself', () => {
      const config = sampleConfig()
      config.events!.fields.body!.translatable = true
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes('blocks fields cannot be translatable'))).toBe(true)
   })

   it('rejects private fields inside blocks', () => {
      const config = sampleConfig()
      config.events!.fields.body!.blocks!.hero!.fields.secret = {
         label: 'Secret',
         type: 'text',
         private: true,
      }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes('private fields are not supported inside blocks'))).toBe(
         true
      )
   })

   it('accepts private fields at the top level', () => {
      const config = sampleConfig()
      config.events!.fields.poster!.private = true
      expect(validateConfig(config, I18N)).toEqual([])
   })

   it('rejects relations to unknown targets', () => {
      const config = sampleConfig()
      config.events!.fields.category = { label: 'Category', type: 'relation', to: 'nope' }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes("relation target 'nope'"))).toBe(true)
   })

   it('rejects relation/blocks/slug fields inside blocks', () => {
      const config = sampleConfig()
      config.events!.fields.body!.blocks!.hero!.fields.rel = {
         label: 'Rel',
         type: 'relation',
         to: 'categories',
      }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes('not supported inside blocks'))).toBe(true)
   })

   it('rejects table name clashes with derived join tables', () => {
      const config = sampleConfig()
      config.events_tags = { ...config.categories!, id: 'events_tags' }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes("table name 'events_tags'"))).toBe(true)
   })
})
