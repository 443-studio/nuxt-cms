import { describe, expect, it } from 'vitest'
import type { BlockConfig } from '../src/runtime/shared/index'
import {
   blockMatchesQuery,
   blockPickerGroups,
   nextPickerIndex,
   normalizeSearchText,
} from '../src/runtime/shared/block-picker'

const blocks: Record<string, BlockConfig> = {
   hero: { label: 'Hero', group: 'Headers', icon: 'star', fields: {} },
   text: {
      label: 'Text',
      group: 'Content',
      description: 'A paragraph of rich text.',
      tags: ['paragraph', 'body'],
      fields: {},
   },
   divider: { label: 'Divider', fields: {} },
   gallery: { label: 'Galería', group: 'Media', tags: ['photos'], fields: {} },
   quote: { label: 'Quote', group: 'Content', fields: {} },
}

function shape(groups: ReturnType<typeof blockPickerGroups>) {
   return groups.map((group) => [group.label, group.items.map((item) => item.type)])
}

describe('block picker groups', () => {
   it('groups blocks under headings in config order, ungrouped last', () => {
      expect(shape(blockPickerGroups(blocks))).toEqual([
         ['Headers', ['hero']],
         ['Content', ['text', 'quote']],
         ['Media', ['gallery']],
         ['Other', ['divider']],
      ])
   })

   it('uses one unlabelled group when no block has a group', () => {
      const plain = { a: { label: 'A', fields: {} }, b: { label: 'B', fields: {} } }
      expect(shape(blockPickerGroups(plain))).toEqual([[null, ['a', 'b']]])
   })

   it('fills item labels, descriptions, icons and the disabled state', () => {
      const [headers, content] = blockPickerGroups(blocks, '', (type) => type === 'hero')
      expect(headers!.items[0]).toEqual({
         type: 'hero',
         label: 'Hero',
         description: undefined,
         icon: 'star',
         disabled: true,
      })
      expect(content!.items[0]).toMatchObject({
         description: 'A paragraph of rich text.',
         icon: 'rectangle-stack',
         disabled: false,
      })
   })

   it('filters by label, description, tags, group and type, dropping empty groups', () => {
      expect(shape(blockPickerGroups(blocks, 'para'))).toEqual([['Content', ['text']]])
      expect(shape(blockPickerGroups(blocks, 'rich TEXT'))).toEqual([['Content', ['text']]])
      expect(shape(blockPickerGroups(blocks, 'photos'))).toEqual([['Media', ['gallery']]])
      expect(shape(blockPickerGroups(blocks, 'galeria'))).toEqual([['Media', ['gallery']]])
      expect(shape(blockPickerGroups(blocks, 'headers'))).toEqual([['Headers', ['hero']]])
      expect(shape(blockPickerGroups(blocks, 'divider'))).toEqual([['Other', ['divider']]])
      expect(blockPickerGroups(blocks, 'nothing like this')).toEqual([])
   })

   it('matches every word of the query', () => {
      expect(blockMatchesQuery('text', blocks.text!, '  ')).toBe(true)
      expect(blockMatchesQuery('text', blocks.text!, 'body paragraph')).toBe(true)
      expect(blockMatchesQuery('text', blocks.text!, 'body photo')).toBe(false)
      expect(normalizeSearchText('Ünïcode É')).toBe('unicode e')
   })
})

describe('picker keyboard moves', () => {
   const items = [{ disabled: false }, { disabled: true }, { disabled: false }]

   it('skips disabled options and wraps around', () => {
      expect(nextPickerIndex(items, -1, 1)).toBe(0)
      expect(nextPickerIndex(items, 0, 1)).toBe(2)
      expect(nextPickerIndex(items, 2, 1)).toBe(0)
      expect(nextPickerIndex(items, 0, -1)).toBe(2)
   })

   it('returns -1 when nothing can be picked', () => {
      expect(nextPickerIndex([], -1, 1)).toBe(-1)
      expect(nextPickerIndex([{ disabled: true }], -1, 1)).toBe(-1)
   })
})
