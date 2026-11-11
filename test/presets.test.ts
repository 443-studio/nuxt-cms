import { describe, expect, it } from 'vitest'
import type { FieldConfig } from '../src/runtime/shared/index'
import { pasteBlocks } from '../src/runtime/shared/clipboard'
import type { CmsBlockPreset } from '../src/runtime/shared/presets'
import {
   CMS_PRESET_KEY_PREFIX,
   CMS_PRESET_MAX_BYTES,
   CMS_PRESET_MAX_ITEMS,
   buildPreset,
   parseStoredPreset,
   presetCreateSchema,
   presetFits,
   presetInsertNotice,
   presetKey,
   presetPickerItem,
   presetTypes,
   presetUpdateSchema,
   renamePreset,
   sortPresets,
} from '../src/runtime/shared/presets'
import { I18N } from './fixtures'

const field: FieldConfig = {
   label: 'Body',
   type: 'blocks',
   max: 3,
   blocks: {
      text: {
         label: 'Text',
         fields: {
            heading: { label: 'Heading', type: 'text', translatable: true },
            body: { label: 'Body', type: 'richtext', translatable: true },
         },
      },
      quote: {
         label: 'Quote',
         fields: {
            text: { label: 'Text', type: 'text' },
            author: { label: 'Author', type: 'text' },
         },
      },
   },
}

const meta = { id: 'preset_abc', source: 'news.body', now: '2026-11-11T10:00:00.000Z' }

function preset(overrides: Partial<CmsBlockPreset> = {}): CmsBlockPreset {
   return {
      id: 'preset_abc',
      name: 'Intro',
      source: 'news.body',
      types: ['quote', 'text'],
      items: [
         { type: 'text', heading: { en: 'Hello' }, body: null },
         { type: 'quote', text: 'Hi', author: null },
      ],
      createdAt: meta.now,
      updatedAt: meta.now,
      ...overrides,
   }
}

describe('preset keys', () => {
   it('namespaces presets in the settings table', () => {
      expect(presetKey('preset_abc')).toBe(`${CMS_PRESET_KEY_PREFIX}preset_abc`)
   })
})

describe('preset input', () => {
   it('trims the name and description and needs blocks with a type', () => {
      const parsed = presetCreateSchema.parse({
         name: '  Intro ',
         description: ' The top ',
         items: [{ type: 'text' }],
      })
      expect(parsed).toEqual({ name: 'Intro', description: 'The top', items: [{ type: 'text' }] })
      expect(presetCreateSchema.safeParse({ name: ' ', items: [{ type: 'text' }] }).success).toBe(
         false
      )
      expect(presetCreateSchema.safeParse({ name: 'A', items: [] }).success).toBe(false)
      expect(presetCreateSchema.safeParse({ name: 'A', items: [{ heading: 'x' }] }).success).toBe(
         false
      )
      expect(presetCreateSchema.safeParse({ name: 'A', items: ['text'] }).success).toBe(false)
      expect(
         presetCreateSchema.safeParse({ name: 'A', items: [{ type: 'text' }], extra: true }).success
      ).toBe(false)
   })

   it('caps the name, the description and the block count', () => {
      const items = [{ type: 'text' }]
      expect(presetCreateSchema.safeParse({ name: 'x'.repeat(81), items }).success).toBe(false)
      expect(
         presetCreateSchema.safeParse({ name: 'A', description: 'x'.repeat(301), items }).success
      ).toBe(false)
      const many = Array.from({ length: CMS_PRESET_MAX_ITEMS + 1 }, () => ({ type: 'text' }))
      expect(presetCreateSchema.safeParse({ name: 'A', items: many }).success).toBe(false)
      expect(presetUpdateSchema.safeParse({ name: 'B', items }).success).toBe(false)
   })
})

describe('buildPreset', () => {
   it('sanitizes the blocks like a paste and records their types', () => {
      const built = buildPreset(
         {
            name: 'Intro',
            items: [
               { type: 'text', heading: 'Hello', body: { en: '<p>Hi</p>' }, stray: 1 },
               { type: 'quote', text: 42, author: 'Ann', hidden: true },
            ],
         },
         field,
         I18N,
         meta
      )
      expect('preset' in built && built.preset).toEqual({
         id: 'preset_abc',
         name: 'Intro',
         source: 'news.body',
         types: ['quote', 'text'],
         items: [
            { type: 'text', heading: { en: 'Hello' }, body: { en: '<p>Hi</p>' } },
            { type: 'quote', text: null, author: 'Ann', hidden: true },
         ],
         createdAt: meta.now,
         updatedAt: meta.now,
      })
   })

   it('refuses block types the field does not have', () => {
      const built = buildPreset(
         { name: 'X', items: [{ type: 'text' }, { type: 'hero' }] },
         field,
         I18N,
         meta
      )
      expect(built).toEqual({ error: 'Not a block of this field: hero' })
   })

   it('does not apply max when saving', () => {
      const items = Array.from({ length: 5 }, () => ({ type: 'quote', text: 'a' }))
      const built = buildPreset({ name: 'X', items }, field, I18N, meta)
      expect('preset' in built && built.preset.items).toHaveLength(5)
   })

   it('refuses a preset over the size limit', () => {
      const big = 'x'.repeat(CMS_PRESET_MAX_BYTES)
      const built = buildPreset(
         { name: 'X', items: [{ type: 'quote', text: big }] },
         field,
         I18N,
         meta
      )
      expect(built).toEqual({ error: 'The preset is too large' })
   })
})

describe('preset scope', () => {
   it('fits every field that accepts all of its block types', () => {
      expect(presetFits(preset(), field)).toBe(true)
      expect(presetFits(preset({ types: ['quote'] }), field)).toBe(true)
      expect(presetFits(preset({ types: ['quote', 'hero'] }), field)).toBe(false)
      expect(presetFits(preset({ types: [] }), field)).toBe(false)
   })

   it('lists the distinct types in order', () => {
      expect(presetTypes([{ type: 'text' }, { type: 'quote' }, { type: 'text' }])).toEqual([
         'quote',
         'text',
      ])
   })

   it('inserts copies through the paste path, under max', () => {
      const list = [
         { type: 'quote', text: 'a', author: null },
         { type: 'quote', text: 'b', author: null },
      ]
      const result = pasteBlocks(list, 1, preset().items, field, I18N)
      expect(result.pasted).toBe(1)
      expect(result.overflow).toBe(1)
      expect(result.list[1]).toEqual({ type: 'text', heading: { en: 'Hello' }, body: null })
      expect(presetInsertNotice(result, field, preset())).toEqual({
         title: 'Intro inserted',
         description: '1 block skipped, this field holds at most 3 blocks.',
         color: undefined,
      })
      const fresh = pasteBlocks([], 0, preset().items, field, I18N)
      expect(presetInsertNotice(fresh, field, preset())).toEqual({
         title: 'Intro inserted',
         description: '2 blocks',
         color: 'success',
      })
   })
})

describe('stored presets', () => {
   it('reads a stored row and ignores anything else', () => {
      const value = preset({ description: 'Top' })
      expect(parseStoredPreset(JSON.stringify(value))).toEqual(value)
      expect(parseStoredPreset(JSON.stringify({ columns: ['title'] }))).toBeNull()
      expect(parseStoredPreset('not json')).toBeNull()
   })

   it('renames and clears the description', () => {
      const renamed = renamePreset(preset({ description: 'Top' }), { name: 'Hero' }, 'later')
      expect(renamed.name).toBe('Hero')
      expect(renamed.updatedAt).toBe('later')
      expect('description' in renamed).toBe(false)
      expect(renamed.items).toEqual(preset().items)
   })

   it('sorts by name, ignoring case', () => {
      const list = sortPresets([
         preset({ id: 'b', name: 'beta' }),
         preset({ id: 'a', name: 'Alpha' }),
      ])
      expect(list.map((item) => item.id)).toEqual(['a', 'b'])
   })

   it('describes a preset in the picker', () => {
      expect(presetPickerItem(preset({ description: 'Top of the page' }))).toEqual({
         id: 'preset_abc',
         label: 'Intro',
         description: '2 blocks · Top of the page',
         keywords: ['Presets', 'quote', 'text'],
      })
   })
})
