import { describe, expect, it } from 'vitest'
import type { FieldConfig } from '../src/runtime/shared/index'
import {
   CMS_CLIPBOARD_MAX_ITEMS,
   clipboardText,
   copyNotice,
   parseClipboardText,
   pasteBlocks,
   pasteNotice,
   pasteableCount,
   pastedFieldValue,
} from '../src/runtime/shared/clipboard'
import { I18N } from './fixtures'

const field: FieldConfig = {
   label: 'Body',
   type: 'blocks',
   blocks: {
      text: {
         label: 'Text',
         fields: {
            heading: { label: 'Heading', type: 'text', translatable: true },
            body: { label: 'Body', type: 'richtext', translatable: true, required: true },
            author: { label: 'Author', type: 'text' },
         },
      },
      image: {
         label: 'Image',
         fields: {
            image: { label: 'Image', type: 'media', mediaType: 'image', required: true },
            cover: { label: 'Cover', type: 'media', translatable: true },
         },
      },
      stat: {
         label: 'Stat',
         fields: {
            value: { label: 'Value', type: 'number', integer: true },
            visible: { label: 'Visible', type: 'boolean' },
            day: { label: 'Day', type: 'date' },
            at: { label: 'At', type: 'datetime' },
            email: { label: 'Email', type: 'email' },
            tone: { label: 'Tone', type: 'select', options: ['calm', 'loud'] },
            data: { label: 'Data', type: 'json' },
         },
      },
      flag: {
         label: 'Flag',
         fields: { hidden: { label: 'Hidden', type: 'boolean' } },
      },
   },
}

describe('clipboard payload', () => {
   it('round trips blocks through the marked JSON text', () => {
      const items = [
         { type: 'text', heading: { en: 'Hi' } },
         { type: 'image', image: 'a.jpg' },
      ]
      const text = clipboardText(items)
      expect(JSON.parse(text)).toEqual({ nuxtCms: 'blocks', version: 1, items })
      expect(parseClipboardText(text)).toEqual(items)
   })

   it('ignores text that is not a block payload', () => {
      expect(parseClipboardText('hello')).toBeNull()
      expect(parseClipboardText('{not json')).toBeNull()
      expect(parseClipboardText('{"items":[{"type":"text"}]}')).toBeNull()
      expect(
         parseClipboardText('{"nuxtCms":"blocks","version":2,"items":[{"type":"a"}]}')
      ).toBeNull()
      expect(parseClipboardText('{"nuxtCms":"blocks","version":1,"items":{}}')).toBeNull()
      expect(parseClipboardText('{"nuxtCms":"blocks","version":1,"items":[]}')).toBeNull()
      expect(parseClipboardText(null)).toBeNull()
      expect(parseClipboardText(42)).toBeNull()
   })

   it('drops malformed items and caps the count', () => {
      const text = JSON.stringify({
         nuxtCms: 'blocks',
         version: 1,
         items: [{ type: 'text' }, null, [], { type: '' }, { type: 3 }, 'x'],
      })
      expect(parseClipboardText(text)).toEqual([{ type: 'text' }])
      const many = clipboardText(
         Array.from({ length: CMS_CLIPBOARD_MAX_ITEMS + 5 }, () => ({ type: 'text' }))
      )
      expect(parseClipboardText(many)).toHaveLength(CMS_CLIPBOARD_MAX_ITEMS)
   })
})

describe('pasted values', () => {
   const blocks = field.blocks!

   it('keeps translatable maps and wraps plain text in the default locale', () => {
      const heading = blocks.text!.fields.heading!
      expect(pastedFieldValue(heading, { en: 'Hi', it: 'Ciao', fr: 'Salut' }, I18N)).toEqual({
         en: 'Hi',
         it: 'Ciao',
      })
      expect(pastedFieldValue(heading, 'Hi', I18N)).toEqual({ en: 'Hi' })
      expect(pastedFieldValue(heading, { en: 3 }, I18N)).toBeNull()
      expect(pastedFieldValue(heading, 5, I18N)).toBeNull()
   })

   it('reads a translatable map into a plain field', () => {
      const author = blocks.text!.fields.author!
      expect(pastedFieldValue(author, { it: 'Anna', en: 'Ann' }, I18N)).toBe('Ann')
      expect(pastedFieldValue(author, { it: 'Anna' }, I18N)).toBe('Anna')
      expect(pastedFieldValue(author, 'Bob', I18N)).toBe('Bob')
   })

   it('keeps media keys, plain and per locale', () => {
      expect(pastedFieldValue(blocks.image!.fields.image!, 'photos/a.jpg', I18N)).toBe(
         'photos/a.jpg'
      )
      expect(pastedFieldValue(blocks.image!.fields.image!, '../etc', I18N)).toBeNull()
      expect(
         pastedFieldValue(blocks.image!.fields.cover!, { en: 'a.jpg', it: 'b.jpg' }, I18N)
      ).toEqual({ en: 'a.jpg', it: 'b.jpg' })
   })

   it('checks scalar values against the field type like the form', () => {
      const stat = blocks.stat!.fields
      expect(pastedFieldValue(stat.value!, 3, I18N)).toBe(3)
      expect(pastedFieldValue(stat.value!, 3.5, I18N)).toBeNull()
      expect(pastedFieldValue(stat.value!, '3', I18N)).toBeNull()
      expect(pastedFieldValue(stat.visible!, true, I18N)).toBe(true)
      expect(pastedFieldValue(stat.visible!, 'yes', I18N)).toBeNull()
      expect(pastedFieldValue(stat.day!, '2026-01-02', I18N)).toBe('2026-01-02')
      expect(pastedFieldValue(stat.day!, 'tomorrow', I18N)).toBeNull()
      expect(pastedFieldValue(stat.at!, '2026-01-02T10:00:00Z', I18N)).toBe(
         '2026-01-02T10:00:00.000Z'
      )
      expect(pastedFieldValue(stat.email!, 'a@b.co', I18N)).toBe('a@b.co')
      expect(pastedFieldValue(stat.email!, 'nope', I18N)).toBeNull()
      expect(pastedFieldValue(stat.tone!, 'calm', I18N)).toBe('calm')
      expect(pastedFieldValue(stat.tone!, 'other', I18N)).toBeNull()
      expect(pastedFieldValue(stat.data!, { a: [1, 2] }, I18N)).toEqual({ a: [1, 2] })
      expect(pastedFieldValue(stat.value!, undefined, I18N)).toBeNull()
   })

   it('keeps an empty required value for the form to flag', () => {
      expect(pastedFieldValue(blocks.text!.fields.body!, null, I18N)).toBeNull()
      expect(pastedFieldValue(blocks.image!.fields.image!, undefined, I18N)).toBeNull()
   })
})

describe('pasteBlocks', () => {
   const list = [{ type: 'text', heading: null, body: { en: 'One' }, author: null }]

   it('inserts sanitized blocks at the index and drops unknown keys', () => {
      const result = pasteBlocks(
         list,
         0,
         [{ type: 'image', image: 'a.jpg', extra: 'x', __proto__: { y: 1 }, hidden: true }],
         field,
         I18N
      )
      expect(result.pasted).toBe(1)
      expect(result.at).toBe(0)
      expect(result.list[0]).toEqual({ type: 'image', image: 'a.jpg', cover: null, hidden: true })
      expect(result.list[1]).toBe(list[0])
   })

   it('keeps a block hidden flag only when true, and a declared hidden field as a value', () => {
      const shown = pasteBlocks([], 0, [{ type: 'image', hidden: 'yes' }], field, I18N)
      expect(shown.list[0]).not.toHaveProperty('hidden')
      const flag = pasteBlocks([], 0, [{ type: 'flag', hidden: false }], field, I18N)
      expect(flag.list[0]).toEqual({ type: 'flag', hidden: false })
   })

   it('skips block types the field does not have', () => {
      const result = pasteBlocks(
         list,
         5,
         [{ type: 'video' }, { type: 'text', body: 'Hi' }, { type: 'video' }, { type: 'map' }],
         field,
         I18N
      )
      expect(result.at).toBe(1)
      expect(result.pasted).toBe(1)
      expect(result.unknown).toEqual(['video', 'video', 'map'])
      expect(result.list[1]).toEqual({
         type: 'text',
         heading: null,
         body: { en: 'Hi' },
         author: null,
      })
   })

   it('pastes as many blocks as fit under max', () => {
      const capped = { ...field, max: 3 }
      const items = [{ type: 'text' }, { type: 'image' }, { type: 'stat' }]
      const result = pasteBlocks(list, 1, items, capped, I18N)
      expect(result.pasted).toBe(2)
      expect(result.overflow).toBe(1)
      expect(result.list.map((item) => item.type)).toEqual(['text', 'text', 'image'])
      const full = pasteBlocks(result.list, 0, items, capped, I18N)
      expect(full.pasted).toBe(0)
      expect(full.list).toEqual(result.list)
   })

   it('counts the blocks a field can take', () => {
      expect(pasteableCount([{ type: 'text' }, { type: 'video' }], field)).toBe(1)
      expect(pasteableCount(null, field)).toBe(0)
   })
})

describe('clipboard notices', () => {
   it('describes copies and cuts', () => {
      expect(copyNotice(1)).toEqual({ title: 'Block copied' })
      expect(copyNotice(3, true)).toEqual({ title: '3 blocks cut' })
   })

   it('describes pasted and skipped blocks', () => {
      expect(pasteNotice(null, field).title).toBe('Nothing to paste')
      const ok = pasteBlocks([], 0, [{ type: 'text' }], field, I18N)
      expect(pasteNotice(ok, field)).toEqual({
         title: 'Block pasted',
         description: undefined,
         color: 'success',
      })
      const mixed = pasteBlocks(
         [],
         0,
         [{ type: 'text' }, { type: 'text' }, { type: 'video' }],
         { ...field, max: 1 },
         I18N
      )
      const notice = pasteNotice(mixed, { max: 1 })
      expect(notice.title).toBe('Block pasted')
      expect(notice.description).toContain('1 block skipped, not available in this field: video')
      expect(notice.description).toContain('1 block skipped, this field holds at most 1 block')
      const none = pasteBlocks([], 0, [{ type: 'video' }], field, I18N)
      expect(pasteNotice(none, field)).toMatchObject({ title: 'Nothing pasted', color: 'error' })
   })
})
