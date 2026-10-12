import type { CmsSelectValue } from '../src/runtime/shared/index'
import { defaultLocaleValue, defineCmsBlocks, defineCmsConfig } from '../src/runtime/shared/index'

export const valid = defineCmsConfig({
   categories: {
      id: 'categories',
      label: 'Categories',
      kind: 'collection',
      titleField: 'name',
      fields: {
         name: { label: 'Name', type: 'text', required: true },
         slug: { label: 'Slug', type: 'slug', from: 'name' },
         kind: { label: 'Kind', type: 'select', options: ['a', 'b'] },
         tags: { label: 'Tags', type: 'select', options: ['a', 'b'], multiple: true },
         parent: { label: 'Parent', type: 'relation', to: 'categories' },
         cover: { label: 'Cover', type: 'media', mediaType: 'image', translatable: true },
         body: {
            label: 'Body',
            type: 'blocks',
            blocks: {
               hero: { label: 'Hero', fields: { heading: { label: 'Heading', type: 'text' } } },
            },
         },
      },
   },
})

export const invalid = defineCmsConfig({
   broken: {
      id: 'broken',
      label: 'Broken',
      kind: 'collection',
      fields: {
         // @ts-expect-error
         badSelect: { label: 'Bad', type: 'select' },
         // @ts-expect-error
         badRelation: { label: 'Bad', type: 'relation' },
         // @ts-expect-error
         badSlug: { label: 'Bad', type: 'slug' },
         // @ts-expect-error
         badBlocks: { label: 'Bad', type: 'blocks' },
         // @ts-expect-error
         badText: { label: 'Bad', type: 'text', options: ['a'] },
         // @ts-expect-error
         badNumber: { label: 'Bad', type: 'number', translatable: true },
         // @ts-expect-error
         badType: { label: 'Bad', type: 'nope' },
      },
   },
})

export const labelled = defineCmsConfig({
   spots: {
      id: 'spots',
      label: 'Spots',
      kind: 'collection',
      titleField: 'access',
      fields: {
         access: {
            label: 'Access',
            type: 'select',
            options: ['boat', { value: 'shore', label: 'From the shore' }],
         },
         depth: {
            label: 'Depth',
            type: 'select',
            options: [{ value: 'shallow', label: 'Shallow' }, 'deep'],
            multiple: true,
         },
         body: {
            label: 'Body',
            type: 'blocks',
            min: 1,
            max: 4,
            blocks: {
               note: {
                  label: 'Note',
                  fields: { text: { label: 'Text', type: 'text', translatable: true } },
                  validate: (values, { defaultLocale, index }) =>
                     defaultLocaleValue(values.text, defaultLocale)
                        ? []
                        : [{ field: 'text', message: `Note ${index + 1} is empty` }],
               },
            },
         },
      },
      validate: (values) =>
         values.access === 'boat' ? [{ message: 'Check the harbour', level: 'warning' }] : [],
   },
   about: {
      id: 'about',
      label: 'About',
      kind: 'single',
      fields: { intro: { label: 'Intro', type: 'text' } },
      validate: () => undefined,
   },
})

export const constant = defineCmsConfig({
   lakes: {
      id: 'lakes',
      label: 'Lakes',
      kind: 'collection',
      titleField: 'name',
      fields: {
         name: { label: 'Name', type: 'text', required: true },
         water: {
            label: 'Water',
            type: 'select',
            options: ['fresh', { value: 'brackish', label: 'Brackish' }],
         },
      },
   },
} as const)

type Water = CmsSelectValue<typeof constant.lakes.fields.water>

export const water: Water[] = ['fresh', 'brackish']

// @ts-expect-error
export const label: Water = 'Brackish'

const constantBlocks = defineCmsBlocks({
   tag: {
      label: 'Tag',
      fields: {
         kind: { label: 'Kind', type: 'select', options: [{ value: 'a', label: 'A' }] as const },
      },
   },
})

export const tagKind: CmsSelectValue<typeof constantBlocks.tag.fields.kind> = 'a'

export const invalidOptions = defineCmsConfig({
   broken: {
      id: 'broken',
      label: 'Broken',
      kind: 'single',
      fields: {
         // @ts-expect-error
         badOption: { label: 'Bad', type: 'select', options: [{ value: 'a' }] },
         // @ts-expect-error
         badMin: { label: 'Bad', type: 'text', min: 1 },
      },
      // @ts-expect-error
      validate: 'nope',
   },
})
