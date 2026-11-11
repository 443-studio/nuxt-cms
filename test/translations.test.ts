import { describe, expect, it } from 'vitest'
import type { CmsEntry, FieldConfig } from '../src/runtime/shared/index'
import { pageFields } from '../src/runtime/shared/index'
import {
   clearTranslations,
   copyTranslations,
   entryHasTranslations,
   hasTranslatableContent,
   hasTranslationsColumn,
   isTranslationFilled,
   translationProgress,
   translationSummary,
} from '../src/runtime/shared/translations'

const i18n = { locales: ['en', 'it', 'de'], defaultLocale: 'en' }

function fields(): Record<string, FieldConfig> {
   return {
      title: { label: 'Title', type: 'text', translatable: true, required: true },
      intro: { label: 'Intro', type: 'richtext', translatable: true },
      cover: { label: 'Cover', type: 'media', translatable: true },
      code: { label: 'Code', type: 'text' },
      featured: { label: 'Featured', type: 'boolean' },
      teaser: {
         label: 'Teaser',
         type: 'text',
         translatable: true,
         showIf: { field: 'featured', eq: true },
      },
      body: {
         label: 'Body',
         type: 'blocks',
         blocks: {
            hero: {
               label: 'Hero',
               fields: {
                  heading: { label: 'Heading', type: 'text', translatable: true },
                  image: { label: 'Image', type: 'media', translatable: true },
                  size: { label: 'Size', type: 'select', options: ['s', 'l'] },
               },
            },
            spacer: { label: 'Spacer', fields: { height: { label: 'Height', type: 'number' } } },
         },
      },
   }
}

function item(): Record<string, unknown> {
   return {
      title: { en: 'Hello', it: 'Ciao', de: 'Hallo' },
      intro: { en: '<p>Welcome</p>', it: '<p></p>' },
      cover: { en: 'cover.jpg', it: 'copertina.jpg' },
      code: 'A1',
      featured: false,
      teaser: { en: 'Hidden teaser' },
      body: [
         { type: 'hero', heading: { en: 'Big', it: 'Grande' }, image: 'hero.jpg', size: 's' },
         { type: 'spacer', height: 4 },
         { type: 'hero', heading: { en: ' ', it: 'Vuoto' }, image: null },
      ],
   }
}

describe('isTranslationFilled', () => {
   const text: FieldConfig = { label: 'T', type: 'text' }
   const rich: FieldConfig = { label: 'R', type: 'richtext' }

   it('treats blank strings and non-strings as empty', () => {
      expect(isTranslationFilled(text, 'x')).toBe(true)
      expect(isTranslationFilled(text, '  ')).toBe(false)
      expect(isTranslationFilled(text, null)).toBe(false)
      expect(isTranslationFilled(text, 3)).toBe(false)
   })

   it('treats rich text without visible text as empty', () => {
      expect(isTranslationFilled(rich, '<p></p>')).toBe(false)
      expect(isTranslationFilled(rich, '<p>&nbsp;<br></p>')).toBe(false)
      expect(isTranslationFilled(rich, '<p><strong>Hi</strong></p>')).toBe(true)
   })
})

describe('translationProgress', () => {
   it('counts filled values per locale against the default locale', () => {
      const progress = translationProgress(fields(), item(), i18n)
      expect(progress.en).toEqual({ filled: 5, total: 5, values: 5, state: 'complete' })
      expect(progress.it).toEqual({ filled: 3, total: 5, values: 4, state: 'partial' })
      expect(progress.de).toEqual({ filled: 1, total: 5, values: 1, state: 'partial' })
   })

   it('reports missing and complete states', () => {
      const values = { title: { en: 'Hello', it: 'Ciao' }, intro: null, cover: null }
      const progress = translationProgress(fields(), values, i18n)
      expect(progress.it!.state).toBe('complete')
      expect(progress.de!.state).toBe('missing')
   })

   it('is complete with nothing to translate', () => {
      const progress = translationProgress(fields(), {}, i18n)
      expect(progress.it).toEqual({ filled: 0, total: 0, values: 0, state: 'complete' })
   })

   it('counts fields shown by showIf only', () => {
      const values = { ...item(), featured: true }
      expect(translationProgress(fields(), values, i18n).it!.total).toBe(6)
   })

   it('narrows to the given keys', () => {
      const progress = translationProgress(fields(), item(), i18n, ['body'])
      expect(progress.it).toEqual({ filled: 1, total: 2, values: 2, state: 'partial' })
      expect(translationProgress(fields(), item(), i18n, ['title']).de!.state).toBe('complete')
   })

   it('reads plain block values as the default locale', () => {
      const values = { body: [{ type: 'hero', heading: 'Legacy' }] }
      const progress = translationProgress(fields(), values, i18n)
      expect(progress.en!.total).toBe(1)
      expect(progress.it!.state).toBe('missing')
   })

   it('ignores unknown blocks and malformed values', () => {
      const values = { body: [{ type: 'gone', heading: { en: 'x' } }, null, 'x'], title: 5 }
      expect(translationProgress(fields(), values, i18n).en!.total).toBe(1)
   })

   it('works on the fields of a page path', () => {
      const entry: CmsEntry = {
         id: 'pages',
         label: 'Pages',
         kind: 'page',
         fields: { title: { label: 'Title', type: 'text', translatable: true } },
         overrides: { '/about': { intro: { label: 'Intro', type: 'text', translatable: true } } },
      }
      const values = { title: { en: 'About', it: 'Chi siamo' }, intro: { en: 'Hi' } }
      expect(translationProgress(pageFields(entry, '/about'), values, i18n).it).toEqual({
         filled: 1,
         total: 2,
         values: 1,
         state: 'partial',
      })
      expect(translationProgress(pageFields(entry, '/'), values, i18n).it!.state).toBe('complete')
      expect(entryHasTranslations(entry)).toBe(true)
   })
})

describe('translationSummary', () => {
   it('describes the progress', () => {
      expect(translationSummary({ filled: 3, total: 5, values: 3, state: 'partial' })).toBe(
         '3 of 5 values translated'
      )
      expect(translationSummary({ filled: 1, total: 1, values: 1, state: 'complete' })).toBe(
         '1 of 1 value translated'
      )
      expect(translationSummary({ filled: 0, total: 0, values: 0, state: 'complete' })).toBe(
         'Nothing to translate yet'
      )
   })
})

describe('hasTranslatableContent', () => {
   it('detects translatable fields and blocks', () => {
      expect(hasTranslatableContent(fields())).toBe(true)
      expect(hasTranslatableContent({ code: { label: 'Code', type: 'text' } })).toBe(false)
      expect(hasTranslatableContent({ body: fields().body! })).toBe(true)
   })
})

describe('hasTranslationsColumn', () => {
   const entry: Pick<CmsEntry, 'kind' | 'fields'> = { kind: 'collection', fields: fields() }

   it('needs several locales, a list kind and translatable content', () => {
      expect(hasTranslationsColumn(entry, i18n)).toBe(true)
      expect(hasTranslationsColumn({ ...entry, kind: 'content' }, i18n)).toBe(true)
      expect(hasTranslationsColumn(entry, { locales: ['en'] })).toBe(false)
      expect(hasTranslationsColumn({ ...entry, kind: 'single' }, i18n)).toBe(false)
      expect(hasTranslationsColumn({ ...entry, kind: 'page' }, i18n)).toBe(false)
      expect(
         hasTranslationsColumn({ kind: 'collection', fields: { code: fields().code! } }, i18n)
      ).toBe(false)
   })

   it('steps aside for a field with the same key', () => {
      const own = { ...entry, fields: { ...fields(), _translations: fields().code! } }
      expect(hasTranslationsColumn(own, i18n)).toBe(false)
   })
})

describe('copyTranslations', () => {
   it('fills only the empty values of the target locale', () => {
      const source = item()
      const { values, count } = copyTranslations(fields(), source, i18n, { from: 'en', to: 'it' })
      expect(count).toBe(2)
      expect(values.title).toEqual({ en: 'Hello', it: 'Ciao', de: 'Hallo' })
      expect(values.intro).toEqual({ en: '<p>Welcome</p>', it: '<p>Welcome</p>' })
      const body = values.body as Record<string, unknown>[]
      expect(body[0]!.image).toEqual({ en: 'hero.jpg', it: 'hero.jpg' })
      expect(body[1]).toBe((source.body as unknown[])[1])
      expect(body[2]!.heading).toEqual({ en: ' ', it: 'Vuoto' })
      expect(values.teaser).toEqual({ en: 'Hidden teaser' })
      expect(source.intro).toEqual({ en: '<p>Welcome</p>', it: '<p></p>' })
   })

   it('overwrites every value the source has', () => {
      const { values, count } = copyTranslations(fields(), item(), i18n, {
         from: 'en',
         to: 'it',
         overwrite: true,
      })
      expect(count).toBe(5)
      expect(values.title).toEqual({ en: 'Hello', it: 'Hello', de: 'Hallo' })
      expect((values.body as Record<string, unknown>[])[2]!.heading).toEqual({
         en: ' ',
         it: 'Vuoto',
      })
   })

   it('copies between non-default locales', () => {
      const { values, count } = copyTranslations(fields(), item(), i18n, { from: 'it', to: 'de' })
      expect(count).toBe(3)
      expect(values.cover).toEqual({ en: 'cover.jpg', it: 'copertina.jpg', de: 'copertina.jpg' })
   })

   it('returns the same object when nothing changes', () => {
      const source = { title: { en: 'Hi', it: 'Hi' } }
      const result = copyTranslations(fields(), source, i18n, { from: 'en', to: 'it' })
      expect(result).toEqual({ values: source, count: 0 })
      expect(result.values).toBe(source)
      expect(copyTranslations(fields(), source, i18n, { from: 'en', to: 'en' }).count).toBe(0)
   })
})

describe('clearTranslations', () => {
   it('removes a locale so it falls back to the default', () => {
      const { values, count } = clearTranslations(fields(), item(), i18n, 'it')
      expect(count).toBe(4)
      expect(values.title).toEqual({ en: 'Hello', de: 'Hallo' })
      expect(values.intro).toEqual({ en: '<p>Welcome</p>' })
      const body = values.body as Record<string, unknown>[]
      expect(body[0]!.heading).toEqual({ en: 'Big' })
      expect(body[0]!.image).toBe('hero.jpg')
      expect(body[2]!.heading).toEqual({ en: ' ' })
   })

   it('turns a value holding only that locale into null', () => {
      const { values } = clearTranslations(fields(), { title: { it: 'Ciao' } }, i18n, 'it')
      expect(values.title).toBeNull()
   })

   it('never clears the default locale', () => {
      const source = item()
      expect(clearTranslations(fields(), source, i18n, 'en')).toEqual({ values: source, count: 0 })
   })
})

describe('translatable link labels', () => {
   const linkFields: Record<string, FieldConfig> = {
      cta: { label: 'Button', type: 'link', withLabel: true, translatable: true },
      plain: { label: 'Plain', type: 'link', withLabel: true },
      body: {
         label: 'Body',
         type: 'blocks',
         blocks: {
            cta: {
               label: 'Call to action',
               fields: {
                  link: { label: 'Link', type: 'link', withLabel: true, translatable: true },
               },
            },
         },
      },
   }

   function values(): Record<string, unknown> {
      return {
         cta: { url: '/contact', label: { en: 'Contact us', it: 'Contattaci' }, newTab: true },
         plain: { url: '/about', label: 'About' },
         body: [{ type: 'cta', link: { entry: 'pages', id: 'about', label: { en: 'About' } } }],
      }
   }

   it('counts the text of translatable links, top level and inside blocks', () => {
      expect(hasTranslatableContent({ cta: linkFields.cta! })).toBe(true)
      expect(hasTranslatableContent({ plain: linkFields.plain! })).toBe(false)
      const progress = translationProgress(linkFields, values(), i18n)
      expect(progress.en).toMatchObject({ filled: 2, total: 2, state: 'complete' })
      expect(progress.it).toMatchObject({ filled: 1, total: 2, state: 'partial' })
      expect(progress.de).toMatchObject({ filled: 0, total: 2, state: 'missing' })
   })

   it('ignores links without a text or without a value', () => {
      const progress = translationProgress(
         linkFields,
         { cta: { url: '/contact' }, plain: null, body: null },
         i18n
      )
      expect(progress.it).toMatchObject({ filled: 0, total: 0, state: 'complete' })
   })

   it('copies and clears link texts and keeps the target', () => {
      const copied = copyTranslations(linkFields, values(), i18n, { from: 'en', to: 'de' })
      expect(copied.count).toBe(2)
      expect(copied.values.cta).toEqual({
         url: '/contact',
         label: { en: 'Contact us', it: 'Contattaci', de: 'Contact us' },
         newTab: true,
      })
      expect(copied.values.plain).toEqual({ url: '/about', label: 'About' })
      const cleared = clearTranslations(linkFields, copied.values, i18n, 'it')
      expect(cleared.count).toBe(1)
      expect(cleared.values.cta).toEqual({
         url: '/contact',
         label: { en: 'Contact us', de: 'Contact us' },
         newTab: true,
      })
      const onlyItalian = { cta: { url: '/x', label: { it: 'Solo' } } }
      expect(clearTranslations(linkFields, onlyItalian, i18n, 'it').values.cta).toEqual({
         url: '/x',
      })
   })
})
