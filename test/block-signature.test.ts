import { describe, expect, it } from 'vitest'
import type { BlockConfig } from '../src/runtime/shared/index'
import { blockShape, blockSignature, blockSignatures } from '../src/runtime/shared/block-signature'

const quote: BlockConfig = {
   label: 'Quote',
   fields: {
      text: { label: 'Text', type: 'text', translatable: true },
      author: { label: 'Author', type: 'text' },
      photo: { label: 'Photo', type: 'media', mediaType: ['video', 'image'] },
      tone: { label: 'Tone', type: 'select', options: ['warm', { value: 'cold', label: 'Cold' }] },
      rating: { label: 'Rating', type: 'number', integer: true },
   },
}

function changed(key: string, patch: object): BlockConfig {
   return { ...quote, fields: { ...quote.fields, [key]: { ...quote.fields[key]!, ...patch } } }
}

describe('blockSignature', () => {
   it('is a stable short hash of the field keys and value shapes', () => {
      expect(blockSignature(quote)).toMatch(/^[0-9a-f]{16}$/)
      expect(blockSignature(quote)).toBe(blockSignature(quote))
      expect(JSON.parse(blockShape(quote))).toEqual([
         ['author', 'text'],
         ['photo', 'media', { mediaType: ['image', 'video'] }],
         ['rating', 'number', 'integer'],
         ['text', 'text', 'translatable'],
         ['tone', 'select', { options: ['cold', 'warm'] }],
      ])
   })

   it('ignores labels, order, help texts, validation rules and the component', () => {
      const reordered: BlockConfig = {
         label: 'Citation',
         component: 'SectionQuote',
         icon: 'chat-bubble-left',
         fields: Object.fromEntries(
            Object.entries(quote.fields)
               .reverse()
               .map(([key, field]) => [
                  key,
                  { ...field, label: key.toUpperCase(), required: true, description: 'Help' },
               ])
         ),
      }
      expect(blockSignature(reordered)).toBe(blockSignature(quote))
      expect(blockSignature(changed('author', { textarea: true, max: 20 }))).toBe(
         blockSignature(quote)
      )
      expect(blockSignature(changed('photo', { mediaType: ['image', 'video', 'image'] }))).toBe(
         blockSignature(quote)
      )
   })

   it('changes with a field key, type or value shape', () => {
      const base = blockSignature(quote)
      const { author: _author, ...rest } = quote.fields
      expect(blockSignature({ fields: rest })).not.toBe(base)
      expect(blockSignature({ fields: { ...rest, writer: quote.fields.author! } })).not.toBe(base)
      expect(blockSignature(changed('author', { type: 'richtext' }))).not.toBe(base)
      expect(blockSignature(changed('author', { translatable: true }))).not.toBe(base)
      expect(blockSignature(changed('text', { translatable: false }))).not.toBe(base)
      expect(blockSignature(changed('photo', { mediaType: 'image' }))).not.toBe(base)
      expect(blockSignature(changed('tone', { options: ['warm'] }))).not.toBe(base)
      expect(blockSignature(changed('tone', { multiple: true }))).not.toBe(base)
      expect(blockSignature(changed('rating', { integer: false }))).not.toBe(base)
   })

   it('treats every media type, or none, as any file', () => {
      expect(blockSignature(changed('photo', { mediaType: undefined }))).toBe(
         blockSignature(changed('photo', { mediaType: ['image', 'file'] }))
      )
   })

   it('signs the requested types the blocks have', () => {
      expect(blockSignatures({ quote }, ['quote', 'hero'])).toEqual({
         quote: blockSignature(quote),
      })
      expect(blockSignatures(undefined, ['quote'])).toEqual({})
   })
})
