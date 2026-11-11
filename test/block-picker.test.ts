import { describe, expect, it } from 'vitest'
import type { BlockConfig } from '../src/runtime/shared/index'
import { blockPickerGroups } from '../src/runtime/shared/block-picker'

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

   it('fills item labels, descriptions, icons, keywords and the disabled state', () => {
      const [headers, content] = blockPickerGroups(blocks, (type) => type === 'hero')
      expect(headers!.items[0]).toEqual({
         type: 'hero',
         label: 'Hero',
         description: undefined,
         icon: 'star',
         keywords: ['hero', 'Headers'],
         disabled: true,
      })
      expect(content!.items[0]).toMatchObject({
         description: 'A paragraph of rich text.',
         icon: 'rectangle-stack',
         keywords: ['text', 'Content', 'paragraph', 'body'],
         disabled: false,
      })
   })

   it('leaves the group out of the keywords of ungrouped blocks', () => {
      const other = blockPickerGroups(blocks).at(-1)!
      expect(other.items[0]!.keywords).toEqual(['divider'])
   })
})
