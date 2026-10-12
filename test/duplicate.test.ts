import { describe, expect, it } from 'vitest'
import type { CmsEntry } from '../src/runtime/shared/index'
import { normalizeCmsConfig } from '../src/runtime/shared/index'
import {
   duplicateEntryValues,
   duplicateSlug,
   duplicateToken,
   uniqueFieldKeys,
} from '../src/runtime/shared/duplicate'

const events: CmsEntry = {
   id: 'events',
   label: 'Events',
   kind: 'collection',
   titleField: 'title',
   drafts: true,
   fields: {
      title: { label: 'Title', type: 'text', translatable: true, required: true },
      slug: { label: 'Slug', type: 'slug', from: 'code' },
      code: { label: 'Code', type: 'text' },
      poster: { label: 'Poster', type: 'media', translatable: true },
      venue: { label: 'Venue', type: 'relation', to: 'venues', cardinality: 'one-to-one' },
      category: { label: 'Category', type: 'relation', to: 'categories' },
      tags: { label: 'Tags', type: 'relation', to: 'tags', cardinality: 'many-to-many' },
      body: {
         label: 'Body',
         type: 'blocks',
         blocks: {
            hero: {
               label: 'Hero',
               fields: { heading: { label: 'Heading', type: 'text', translatable: true } },
            },
         },
      },
   },
}

const source = {
   id: 'events_abc',
   createdAt: '2026-01-01T00:00:00.000Z',
   title: { en: 'Spring fair', it: 'Fiera di primavera', de: '' },
   slug: 'spring-fair',
   code: 'SF',
   poster: { en: 'library/poster-en.webp', it: 'library/poster-it.webp' },
   venue: 'venues_1',
   category: 'categories_1',
   tags: ['tags_1', 'tags_2'],
   body: [{ type: 'hero', heading: { en: 'Welcome' }, hidden: true }],
   status: 'published',
}

describe('duplicateEntryValues', () => {
   it('copies the values and makes the unique ones free', () => {
      const copy = duplicateEntryValues(events, source, 'k3x9')
      expect(copy).toEqual({
         title: { en: 'Spring fair (copy)', it: 'Fiera di primavera (copy)', de: '' },
         slug: 'spring-fair-copy-k3x9',
         code: 'SF',
         poster: { en: 'library/poster-en.webp', it: 'library/poster-it.webp' },
         venue: null,
         category: 'categories_1',
         tags: ['tags_1', 'tags_2'],
         body: [{ type: 'hero', heading: { en: 'Welcome' }, hidden: true }],
         status: 'draft',
      })
   })

   it('never shares nested objects with the source', () => {
      const copy = duplicateEntryValues(events, source, 'k3x9')
      ;(copy.body as { heading: { en: string } }[])[0]!.heading.en = 'Changed'
      ;(copy.tags as string[]).push('tags_3')
      expect(source.body[0]!.heading.en).toBe('Welcome')
      expect(source.tags).toEqual(['tags_1', 'tags_2'])
   })

   it('leaves empty slugs empty and fills missing keys with null', () => {
      const copy = duplicateEntryValues(events, { title: 'Plain', slug: '' }, 'abcd')
      expect(copy.slug).toBeNull()
      expect(copy.title).toBe('Plain (copy)')
      expect(copy.body).toBeNull()
   })

   it('does not stack copy suffixes on the slug', () => {
      expect(duplicateSlug('spring-fair-copy-k3x9', 'zz11')).toBe('spring-fair-copy-zz11')
      expect(duplicateSlug('copy', 'zz11')).toBe('copy-copy-zz11')
   })

   it('keeps the status out of entries without drafts', () => {
      const copy = duplicateEntryValues({ ...events, drafts: false }, source, 'abcd')
      expect(Object.hasOwn(copy, 'status')).toBe(false)
   })

   it('starts a content copy as a draft without a publish date', () => {
      const config = normalizeCmsConfig(
         {
            news: {
               id: 'news',
               label: 'News',
               kind: 'content',
               blocks: {
                  text: { label: 'Text', fields: { body: { label: 'Body', type: 'text' } } },
               },
               fields: {},
            } as CmsEntry,
         },
         { locales: [] }
      )
      const copy = duplicateEntryValues(
         config.news!,
         {
            title: 'Opening',
            slug: 'opening',
            publishedAt: '2026-03-01T08:00:00.000Z',
            status: 'published',
            body: [{ type: 'text', body: 'Hello' }],
         },
         'w1w1'
      )
      expect(copy).toMatchObject({
         title: 'Opening (copy)',
         slug: 'opening-copy-w1w1',
         publishedAt: null,
         status: 'draft',
         body: [{ type: 'text', body: 'Hello' }],
      })
   })
})

describe('duplicate helpers', () => {
   it('names the slug and one-to-one fields as unique', () => {
      expect(uniqueFieldKeys(events)).toEqual(['slug', 'venue'])
   })

   it('makes a short slug-safe token', () => {
      for (let index = 0; index < 20; index++) expect(duplicateToken()).toMatch(/^[a-z0-9]{4}$/)
   })
})
