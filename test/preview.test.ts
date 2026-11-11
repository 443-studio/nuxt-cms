import { describe, expect, it } from 'vitest'
import {
   collectPreviewComponents,
   missingPreviewComponents,
   renderBlocksFile,
} from '../src/blocks-codegen'
import { validateConfig } from '../src/schema-codegen'
import type { BlockConfig, CmsConfig, FieldConfig } from '../src/runtime/shared/index'
import {
   formatBlockPath,
   insertBlocks as insertBlockList,
   moveBlock as moveBlockAt,
   movedBlockPath,
   normalizeCmsConfig,
   pathAfterInsert,
   pathAfterMove,
   pathAfterRemove,
   remapInsertionPoint,
   updateBlockAt,
} from '../src/runtime/shared/index'
import type { CmsBlockValue, CmsPreviewMedia } from '../src/runtime/shared/preview'
import {
   CMS_CLIPBOARD_MAX_LENGTH,
   CMS_PREVIEW_CHANNEL,
   blockErrorPaths,
   blockTreeVisits,
   canMoveBlock,
   blockSummary,
   canHideBlock,
   clipboardActionApplies,
   collectMediaKeys,
   duplicateBlockAt,
   editorIssueKeys,
   editorShortcut,
   emptyBlock,
   insertionIndex,
   isApplePlatform,
   isFieldKey,
   isTrustedPreviewEvent,
   firstBlockError,
   isHorizontalList,
   parseFrameMessage,
   parseHostMessage,
   previewBlocks,
   previewEnvelope,
   previewFieldConfig,
   previewItem,
   previewMedia,
   previewPathErrors,
   shortcutApplies,
   readMessagePath,
   stableBlockTreeIds,
   toggleBlockHiddenAt,
} from '../src/runtime/shared/preview'
import { buildEntrySchema } from '../src/runtime/shared/validation'
import type { CmsInlineNode } from '../src/runtime/shared/inline-text'
import {
   CMS_INLINE_TEXT_MAX_LENGTH,
   applyInlineOverride,
   clampInlineText,
   editableText,
   fitInlineInsertion,
   inlineFieldPath,
   inlineFieldValue,
   inlineTextLimit,
   isInlineTextField,
   isPlainTextContent,
   lockedInlineFields,
   matchesInlineValue,
   normalizeInlineText,
} from '../src/runtime/shared/inline-text'
import { I18N, contentConfig } from './fixtures'

const config = normalizeCmsConfig(contentConfig(), I18N)
const news = config.news!
const body = news.fields.body!

function nestedFields(): Record<string, FieldConfig> {
   const leaves: Record<string, BlockConfig> = {
      text: {
         label: 'Text',
         fields: { heading: { label: 'Heading', type: 'text', translatable: true } },
      },
      cta: {
         label: 'Call to action',
         fields: {
            style: { label: 'Style', type: 'select', options: ['plain', 'button'] },
            label: { label: 'Label', type: 'text', showIf: { field: 'style', eq: 'button' } },
         },
      },
   }
   const other: Record<string, BlockConfig> = {
      text: { label: 'Text', fields: { heading: { label: 'Heading', type: 'text' } } },
   }
   return {
      title: { label: 'Title', type: 'text' },
      body: {
         label: 'Body',
         type: 'blocks',
         blocks: {
            ...leaves,
            columns: {
               label: 'Columns',
               fields: {
                  items: { label: 'Items', type: 'blocks', blocks: leaves, max: 2 },
                  extra: { label: 'Extra', type: 'blocks', blocks: other },
               },
            },
            hero: {
               label: 'Hero',
               fields: {
                  slides: {
                     label: 'Slides',
                     type: 'blocks',
                     min: 2,
                     blocks: { slide: leaves.text! },
                  },
               },
            },
         },
      },
   }
}

function media(key: string): CmsPreviewMedia {
   return previewMedia(key, undefined, '/images')
}

describe('preview message protocol', () => {
   it('wraps messages in the channel envelope', () => {
      expect(previewEnvelope({ type: 'ready' })).toEqual({
         type: 'ready',
         channel: CMS_PREVIEW_CHANNEL,
      })
   })

   it('accepts well formed frame messages with block paths', () => {
      const nested = ['body', 2, 'columns', 0]
      expect(parseFrameMessage(previewEnvelope({ type: 'ready' }))).toEqual({ type: 'ready' })
      expect(parseFrameMessage(previewEnvelope({ type: 'select', path: null }))).toEqual({
         type: 'select',
         path: null,
      })
      expect(parseFrameMessage(previewEnvelope({ type: 'select', path: nested }))).toEqual({
         type: 'select',
         path: nested,
      })
      expect(
         parseFrameMessage(
            previewEnvelope({ type: 'move', from: ['body', 2], to: nested, focus: true })
         )
      ).toEqual({ type: 'move', from: ['body', 2], to: nested, focus: true })
      for (const type of [
         'insert',
         'duplicate',
         'toggle-hidden',
         'remove',
         'copy',
         'cut',
         'paste',
      ] as const) {
         expect(parseFrameMessage(previewEnvelope({ type, path: ['body', 1] }))).toEqual({
            type,
            path: ['body', 1],
         })
         expect(parseFrameMessage(previewEnvelope({ type, path: nested }))).toEqual({
            type,
            path: nested,
         })
      }
      for (const type of ['undo', 'redo', 'save'] as const) {
         expect(
            parseFrameMessage(previewEnvelope({ type, path: ['body', 3], extra: true }))
         ).toEqual({ type })
      }
   })

   it('reads strict block paths from messages', () => {
      expect(readMessagePath(['body', 0])).toEqual(['body', 0])
      expect(readMessagePath(['body', 1, 'columns', 0, 'content', 2])).toEqual([
         'body',
         1,
         'columns',
         0,
         'content',
         2,
      ])
      for (const broken of [
         null,
         'body.0',
         [],
         ['body'],
         ['body', 1, 'columns'],
         ['body', -1],
         ['body', 1.5],
         ['body', '1'],
         [0, 'body'],
         ['body', Number.MAX_SAFE_INTEGER + 1],
         ['body', 0, 'a.b', 0],
         ['body', 0, 'x'.repeat(101), 0],
         ['body', 0, 'columns', 0, 'content', 0, 'deep', 0],
      ]) {
         expect(readMessagePath(broken)).toBeNull()
      }
      const source = ['body', 0]
      const read = readMessagePath(source)
      expect(read).not.toBe(source)
   })

   it('carries the clipboard text of a paste from the frame', () => {
      expect(
         parseFrameMessage(previewEnvelope({ type: 'paste', path: ['body', 2], text: '{"a":1}' }))
      ).toEqual({ type: 'paste', path: ['body', 2], text: '{"a":1}' })
      expect(
         parseFrameMessage(previewEnvelope({ type: 'copy', path: ['body', 0], text: 'x' }))
      ).toEqual({ type: 'copy', path: ['body', 0] })
      expect(
         parseFrameMessage(previewEnvelope({ type: 'paste', path: ['body', 1], text: 3 }))
      ).toBeNull()
      expect(parseFrameMessage(previewEnvelope({ type: 'paste', text: 'x' }))).toBeNull()
      expect(parseFrameMessage(previewEnvelope({ type: 'cut', path: ['body', -1] }))).toBeNull()
      const long = 'x'.repeat(CMS_CLIPBOARD_MAX_LENGTH + 1)
      expect(
         parseFrameMessage(previewEnvelope({ type: 'paste', path: ['body', 0], text: long }))
      ).toBeNull()
   })

   it('rejects foreign, unknown and malformed frame messages', () => {
      expect(parseFrameMessage({ type: 'ready' })).toBeNull()
      expect(parseFrameMessage({ channel: 'other', type: 'ready' })).toBeNull()
      expect(parseFrameMessage(previewEnvelope({ type: 'navigate' }))).toBeNull()
      expect(parseFrameMessage(previewEnvelope({ type: 'remove', index: 1 }))).toBeNull()
      expect(parseFrameMessage(previewEnvelope({ type: 'remove', path: ['body'] }))).toBeNull()
      expect(parseFrameMessage(previewEnvelope({ type: 'remove', path: 'body.1' }))).toBeNull()
      expect(
         parseFrameMessage(
            previewEnvelope({ type: 'remove', path: ['body', 0, 'a', 0, 'b', 0, 'c', 0] })
         )
      ).toBeNull()
      expect(
         parseFrameMessage(previewEnvelope({ type: 'move', from: ['body', 0], to: ['body'] }))
      ).toBeNull()
      expect(parseFrameMessage(previewEnvelope({ type: 'select', path: undefined }))).toBeNull()
      expect(parseFrameMessage({ type: 'undo' })).toBeNull()
      expect(parseFrameMessage(previewEnvelope({ type: 'UNDO' }))).toBeNull()
      expect(parseFrameMessage('ready')).toBeNull()
      expect(parseFrameMessage(null)).toBeNull()
   })

   it('accepts a render message and drops non-object blocks', () => {
      const state = {
         entry: 'news',
         field: 'body',
         locale: 'it',
         blocks: [{ type: 'text' }, 'junk', null],
         item: { title: { en: 'Hi' } },
         media: {},
         selected: ['body', 0, 'columns', 1],
      }
      expect(parseHostMessage(previewEnvelope({ type: 'render', state }))).toEqual({
         type: 'render',
         state: { ...state, blocks: [{ type: 'text' }], editable: true, lockedFields: [] },
      })
   })

   it('keeps the string paths of the locked fields of a render message', () => {
      const state = {
         entry: 'news',
         field: 'body',
         locale: 'en',
         blocks: [],
         item: null,
         media: {},
         selected: null,
      }
      const parse = (lockedFields: unknown) => {
         const message = parseHostMessage(
            previewEnvelope({ type: 'render', state: { ...state, lockedFields } })
         )
         return message?.type === 'render' ? message.state.lockedFields : undefined
      }
      expect(parse(['title', 'body.0.heading', 3, null])).toEqual(['title', 'body.0.heading'])
      expect(parse('title')).toEqual([])
      expect(parse(undefined)).toEqual([])
   })

   it('reads the editable flag of a render message, true unless false', () => {
      const state = {
         entry: 'news',
         field: 'body',
         locale: 'en',
         blocks: [],
         item: null,
         media: {},
         selected: null,
      }
      const parse = (extra: Record<string, unknown>) => {
         const message = parseHostMessage(
            previewEnvelope({ type: 'render', state: { ...state, ...extra } })
         )
         return message?.type === 'render' ? message.state.editable : undefined
      }
      expect(parse({ editable: false })).toBe(false)
      expect(parse({ editable: true })).toBe(true)
      expect(parse({ editable: 'no' })).toBe(true)
      expect(parse({})).toBe(true)
   })

   it('rejects malformed render messages', () => {
      const valid = {
         entry: 'news',
         field: 'body',
         locale: 'en',
         blocks: [],
         item: null,
         media: {},
         selected: null,
      }
      expect(parseHostMessage(previewEnvelope({ type: 'render', state: valid }))).not.toBeNull()
      for (const broken of [
         { ...valid, entry: 1 },
         { ...valid, blocks: {} },
         { ...valid, item: [] },
         { ...valid, media: null },
         { ...valid, selected: 0 },
         { ...valid, selected: ['body'] },
         { ...valid, locale: undefined },
      ]) {
         expect(parseHostMessage(previewEnvelope({ type: 'render', state: broken }))).toBeNull()
      }
      expect(parseHostMessage({ type: 'render', state: valid })).toBeNull()
      expect(parseHostMessage(previewEnvelope({ type: 'ready' }))).toBeNull()
   })

   it('parses highlight and reveal host messages', () => {
      expect(parseHostMessage(previewEnvelope({ type: 'highlight', path: ['body', 2] }))).toEqual({
         type: 'highlight',
         path: ['body', 2],
      })
      expect(parseHostMessage(previewEnvelope({ type: 'highlight', path: null }))).toEqual({
         type: 'highlight',
         path: null,
      })
      expect(
         parseHostMessage(
            previewEnvelope({ type: 'reveal', path: ['body', 0, 'columns', 1], extra: 1 })
         )
      ).toEqual({ type: 'reveal', path: ['body', 0, 'columns', 1] })
      for (const path of [['body', -1], ['body', 1.5], 'body.1', undefined, 2]) {
         expect(parseHostMessage(previewEnvelope({ type: 'highlight', path }))).toBeNull()
      }
      expect(parseHostMessage(previewEnvelope({ type: 'reveal', path: null }))).toBeNull()
      expect(parseHostMessage({ type: 'highlight', path: ['body', 1] })).toBeNull()
   })

   it('parses hover frame messages', () => {
      expect(parseFrameMessage(previewEnvelope({ type: 'hover', path: ['body', 3] }))).toEqual({
         type: 'hover',
         path: ['body', 3],
      })
      expect(parseFrameMessage(previewEnvelope({ type: 'hover', path: null }))).toEqual({
         type: 'hover',
         path: null,
      })
      expect(parseFrameMessage(previewEnvelope({ type: 'hover', path: ['body', -1] }))).toBeNull()
      expect(parseFrameMessage(previewEnvelope({ type: 'hover' }))).toBeNull()
   })

   it('parses focus-field frame messages for block and entry fields', () => {
      expect(
         parseFrameMessage(
            previewEnvelope({ type: 'focus-field', path: ['body', 2, 'items', 0], key: 'heading' })
         )
      ).toEqual({ type: 'focus-field', path: ['body', 2, 'items', 0], key: 'heading' })
      expect(
         parseFrameMessage(
            previewEnvelope({ type: 'focus-field', path: null, key: 'title', extra: 1 })
         )
      ).toEqual({ type: 'focus-field', path: null, key: 'title' })
      const path = ['body', 0]
      for (const broken of [
         { path: ['body', -1], key: 'heading' },
         { path: 1, key: 'heading' },
         { key: 'heading' },
         { path },
         { path, key: '' },
         { path, key: 'body.0' },
         { path, key: '__proto__ x' },
         { path, key: 'x'.repeat(101) },
         { path, key: 3 },
      ]) {
         expect(parseFrameMessage(previewEnvelope({ type: 'focus-field', ...broken }))).toBeNull()
      }
   })

   it('parses field-input frame messages', () => {
      const message = {
         type: 'field-input',
         path: ['body', 1, 'items', 0],
         key: 'heading',
         locale: 'it',
         value: 'Ciao',
      }
      expect(parseFrameMessage(previewEnvelope(message))).toEqual(message)
      expect(parseFrameMessage(previewEnvelope({ ...message, path: null, commit: true }))).toEqual({
         ...message,
         path: null,
         commit: true,
      })
      expect(parseFrameMessage(previewEnvelope({ ...message, commit: 'yes' }))).toEqual(message)
      expect(parseFrameMessage(previewEnvelope({ ...message, value: '' }))).toEqual({
         ...message,
         value: '',
      })
      for (const broken of [
         { path: ['body', -1] },
         { path: undefined },
         { path: 1 },
         { key: 'a.b' },
         { locale: '' },
         { locale: 'it it' },
         { locale: 'x'.repeat(36) },
         { locale: 3 },
         { value: null },
         { value: 3 },
         { value: 'x'.repeat(CMS_INLINE_TEXT_MAX_LENGTH + 1) },
      ]) {
         expect(parseFrameMessage(previewEnvelope({ ...message, ...broken }))).toBeNull()
      }
   })

   it('trusts only the expected origin and source window', () => {
      const source = {}
      expect(
         isTrustedPreviewEvent({ origin: 'https://site.test', source }, 'https://site.test', source)
      ).toBe(true)
      expect(
         isTrustedPreviewEvent({ origin: 'https://evil.test', source }, 'https://site.test', source)
      ).toBe(false)
      expect(
         isTrustedPreviewEvent(
            { origin: 'https://site.test', source: {} },
            'https://site.test',
            source
         )
      ).toBe(false)
      expect(
         isTrustedPreviewEvent(
            { origin: 'https://site.test', source: null },
            'https://site.test',
            null
         )
      ).toBe(false)
   })
})

describe('field targets', () => {
   it('accepts identifier field keys only', () => {
      expect(isFieldKey('heading')).toBe(true)
      expect(isFieldKey('_seo2')).toBe(true)
      expect(isFieldKey('2nd')).toBe(false)
      expect(isFieldKey('a-b')).toBe(false)
      expect(isFieldKey(null)).toBe(false)
   })

   const root = { body }
   const values = { body: [{ type: 'text', heading: null }] }

   it('resolves a block field from the block at the path', () => {
      const at = (path: (string | number)[] | null, key: string, data: object = values) =>
         previewFieldConfig(
            { path, key },
            root,
            data as Record<string, unknown>,
            news.fields,
            'body'
         )
      expect(at(['body', 0], 'heading')).toMatchObject({ label: 'Heading', type: 'text' })
      expect(at(['body', 0], 'caption')).toBeUndefined()
      expect(at(['body', 0], 'heading', { body: [{ type: 'nope' }] })).toBeUndefined()
      expect(at(['body', 3], 'heading')).toBeUndefined()
      expect(at(['body', 0], 'constructor')).toBeUndefined()
   })

   it('resolves a field of a nested block', () => {
      const fields = nestedFields()
      const data = { body: [{ type: 'columns', items: [{ type: 'text', heading: null }] }] }
      expect(
         previewFieldConfig(
            { path: ['body', 0, 'items', 0], key: 'heading' },
            { body: fields.body! },
            data,
            null,
            'body'
         )
      ).toMatchObject({ label: 'Heading' })
      expect(
         previewFieldConfig(
            { path: ['body', 0, 'items', 1], key: 'heading' },
            { body: fields.body! },
            data,
            null,
            'body'
         )
      ).toBeUndefined()
   })

   it('resolves an entry field without a block, never the blocks field itself', () => {
      const at = (key: string, fields: Record<string, FieldConfig> | null = news.fields) =>
         previewFieldConfig({ path: null, key }, root, values, fields, 'body')
      expect(at('title')).toMatchObject({ type: 'text', translatable: true })
      expect(at('excerpt')).toMatchObject({ label: 'Summary', textarea: true })
      expect(at('body')).toBeUndefined()
      expect(at('title', null)).toBeUndefined()
      expect(at('missing')).toBeUndefined()
      const secret = {
         ...news.fields,
         notes: { label: 'Notes', type: 'text' as const, private: true },
      }
      expect(at('notes', secret)).toBeUndefined()
   })
})

function textNode(value: string): CmsInlineNode {
   return { nodeType: 3, nodeName: '#text', nodeValue: value, childNodes: [] }
}

function elementNode(name: string, children: CmsInlineNode[] = []): CmsInlineNode {
   return { nodeType: 1, nodeName: name, nodeValue: null, childNodes: children }
}

const comment: CmsInlineNode = {
   nodeType: 8,
   nodeName: '#comment',
   nodeValue: 'v-if',
   childNodes: [],
}

describe('inline text editing', () => {
   const heading = body.blocks!.text!.fields.heading!
   const excerpt = news.fields.excerpt!

   it('edits text fields only', () => {
      expect(isInlineTextField(heading)).toBe(true)
      expect(isInlineTextField(excerpt)).toBe(true)
      expect(isInlineTextField(body.blocks!.text!.fields.body!)).toBe(false)
      expect(isInlineTextField(body.blocks!.image!.fields.image!)).toBe(false)
      expect(isInlineTextField(undefined)).toBe(false)
   })

   it('only takes over elements that hold plain text', () => {
      expect(isPlainTextContent(elementNode('H2', [textNode('Hi')]))).toBe(true)
      expect(isPlainTextContent(elementNode('H2', [comment, textNode('Hi')]))).toBe(true)
      expect(isPlainTextContent(elementNode('H2'))).toBe(true)
      expect(isPlainTextContent(elementNode('H2', [elementNode('SPAN', [textNode('x')])]))).toBe(
         false
      )
   })

   it('reads the text of an edited element with its line breaks', () => {
      expect(editableText(elementNode('P', [textNode('one'), comment, textNode(' two')]))).toBe(
         'one two'
      )
      expect(
         editableText(elementNode('P', [textNode('one'), elementNode('BR'), textNode('two')]))
      ).toBe('one\ntwo')
      expect(
         editableText(
            elementNode('P', [
               textNode('one'),
               elementNode('DIV', [textNode('two')]),
               elementNode('DIV', [elementNode('BR')]),
            ])
         )
      ).toBe('one\ntwo\n\n')
   })

   it('normalizes typed text for single and multi line fields', () => {
      expect(normalizeInlineText('a\u00a0b', false)).toBe('a b')
      expect(normalizeInlineText('one \r\n two\n', false)).toBe('one two')
      expect(normalizeInlineText('one\r\ntwo\n', true)).toBe('one\ntwo')
      expect(normalizeInlineText('one\n\ntwo', true)).toBe('one\n\ntwo')
   })

   it('compares the shown text with the field value', () => {
      expect(matchesInlineValue('Hello', 'Hello')).toBe(true)
      expect(matchesInlineValue(' Hello ', 'Hello')).toBe(true)
      expect(matchesInlineValue('', null)).toBe(true)
      expect(matchesInlineValue('HELLO', 'Hello')).toBe(false)
      expect(matchesInlineValue('1', 1)).toBe(false)
   })

   it('writes the edited locale of a translatable value', () => {
      expect(inlineFieldValue(heading, { en: 'Hi', it: 'Ciao' }, 'it', 'en', 'Salve')).toEqual({
         en: 'Hi',
         it: 'Salve',
      })
      expect(inlineFieldValue(heading, null, 'it', 'en', 'Ciao')).toEqual({ it: 'Ciao' })
      expect(inlineFieldValue(heading, 'Hi', 'it', 'en', 'Ciao')).toEqual({ en: 'Hi', it: 'Ciao' })
      expect(inlineFieldValue(heading, { en: 'Hi', it: 'Ciao' }, 'it', 'en', '')).toEqual({
         en: 'Hi',
      })
      expect(inlineFieldValue(heading, { it: 'Ciao' }, 'it', 'en', '')).toBeNull()
   })

   it('writes a plain value of a field that is not translatable', () => {
      const author = { label: 'Author', type: 'text' as const }
      expect(inlineFieldValue(author, 'Ada', 'it', 'en', 'Grace')).toBe('Grace')
      expect(inlineFieldValue(author, 'Ada', 'it', 'en', '')).toBeNull()
   })

   it('overrides the value shown in the canvas while a field is edited', () => {
      const blocks = [
         { type: 'text', heading: 'One' },
         { type: 'text', heading: 'Two' },
      ]
      const item = { title: 'Title' }
      expect(applyInlineOverride(blocks, item, null)).toEqual({ blocks, item })
      const block = applyInlineOverride(blocks, item, {
         path: ['body', 1],
         key: 'heading',
         value: 'Frozen',
         settled: false,
      })
      expect(block.blocks).toEqual([blocks[0], { type: 'text', heading: 'Frozen' }])
      expect(block.blocks[0]).toBe(blocks[0])
      expect(block.item).toBe(item)
      const entry = applyInlineOverride(blocks, item, {
         path: null,
         key: 'title',
         value: 'Draft',
         settled: true,
      })
      expect(entry).toEqual({ blocks, item: { title: 'Draft' } })
      expect(
         applyInlineOverride(blocks, null, {
            path: null,
            key: 'title',
            value: 'x',
            settled: false,
         }).item
      ).toBeNull()
      const nested = [{ type: 'columns', items: [{ type: 'text', heading: 'Left' }] }]
      const inner = applyInlineOverride(nested, null, {
         path: ['body', 0, 'items', 0],
         key: 'heading',
         value: 'Edited',
         settled: false,
      })
      expect(inner.blocks).toEqual([
         { type: 'columns', items: [{ type: 'text', heading: 'Edited' }] },
      ])
      expect(nested[0]!.items[0]!.heading).toBe('Left')
   })
})

describe('inline editing limits', () => {
   const short = { label: 'Kicker', type: 'text' as const, max: 5 }

   it('reads the length limit of a text field', () => {
      expect(inlineTextLimit(short)).toBe(5)
      expect(inlineTextLimit({ label: 'Kicker', type: 'text' })).toBeUndefined()
      expect(inlineTextLimit({ label: 'Count', type: 'number', max: 5 })).toBeUndefined()
      expect(inlineTextLimit(undefined)).toBeUndefined()
   })

   it('cuts typed text to the limit', () => {
      expect(clampInlineText('Hello world', 5)).toBe('Hello')
      expect(clampInlineText('Hi', 5)).toBe('Hi')
      expect(clampInlineText('Hello world', undefined)).toBe('Hello world')
      expect(fitInlineInsertion('abcdef', 3)).toBe('abc')
      expect(fitInlineInsertion('abc', 0)).toBe('')
      expect(fitInlineInsertion('abc', -2)).toBe('')
   })

   it('locks hidden and immutable text fields of the item and of each block', () => {
      const fields = {
         kind: { label: 'Kind', type: 'select' as const, options: ['a', 'b'] },
         code: { label: 'Code', type: 'text' as const, immutable: true },
         note: { label: 'Note', type: 'text' as const, showIf: { field: 'kind', eq: 'b' } },
         intro: { label: 'Intro', type: 'text' as const },
         count: { label: 'Count', type: 'number' as const },
      }
      const blocksField = {
         label: 'Body',
         type: 'blocks' as const,
         blocks: {
            cta: {
               label: 'Call to action',
               fields: {
                  style: { label: 'Style', type: 'select' as const, options: ['plain', 'button'] },
                  label: {
                     label: 'Label',
                     type: 'text' as const,
                     showIf: { field: 'style', eq: 'button' },
                  },
                  title: { label: 'Title', type: 'text' as const },
               },
            },
         },
      }
      const blocks = [
         { type: 'cta', style: 'plain' },
         { type: 'cta', style: 'button' },
         { type: 'unknown' },
      ]
      const blocksFields = { body: blocksField }
      expect(
         lockedInlineFields({
            fields,
            values: { kind: 'a' },
            blocksFields,
            blocksValues: { body: blocks },
            locked: ['code'],
         })
      ).toEqual(['code', 'note', inlineFieldPath(['body', 0], 'label')])
      expect(
         lockedInlineFields({
            fields: null,
            values: {},
            blocksFields,
            blocksValues: { body: blocks.slice(1) },
         })
      ).toEqual([])
      expect(inlineFieldPath(null, 'title')).toBe('title')
      expect(inlineFieldPath(['body', 2], 'title')).toBe('body.2.title')
      expect(inlineFieldPath(['body', 2, 'items', 0], 'title')).toBe('body.2.items.0.title')
   })

   it('locks hidden text fields of nested blocks by their path', () => {
      const fields = nestedFields()
      const values = {
         body: [
            {
               type: 'columns',
               items: [
                  { type: 'cta', style: 'plain' },
                  { type: 'cta', style: 'button' },
               ],
            },
         ],
      }
      expect(
         lockedInlineFields({
            fields: null,
            values: {},
            blocksFields: { body: fields.body! },
            blocksValues: values,
         })
      ).toEqual(['body.0.items.0.label'])
   })
})

describe('block path operations', () => {
   const values = (): Record<string, unknown> => ({
      body: [
         { type: 'text', heading: 'a' },
         { type: 'image', image: null },
         { type: 'text', heading: { en: 'c' } },
      ],
   })

   it('builds an empty block with every field set to null', () => {
      expect(emptyBlock('text', body.blocks!.text!)).toEqual({
         type: 'text',
         heading: null,
         body: null,
      })
   })

   it('starts a nested list with its minimum when it holds a single block type', () => {
      const fields = nestedFields()
      expect(emptyBlock('hero', fields.body!.blocks!.hero!)).toEqual({
         type: 'hero',
         slides: [
            { type: 'slide', heading: null },
            { type: 'slide', heading: null },
         ],
      })
      expect(emptyBlock('columns', fields.body!.blocks!.columns!)).toEqual({
         type: 'columns',
         items: null,
         extra: null,
      })
   })

   it('duplicates a block as a deep copy right after it', () => {
      const data = values()
      const next = duplicateBlockAt(data, ['body', 2])
      const list = next.body as CmsBlockValue[]
      expect(list).toHaveLength(4)
      expect(list[3]).toEqual(list[2])
      expect(list[3]).not.toBe(list[2])
      expect(list[3]!.heading).not.toBe(list[2]!.heading)
      expect(duplicateBlockAt(data, ['body', 5])).toBe(data)
   })

   it('toggles the implicit hidden flag unless the block declares its own', () => {
      const data = values()
      const hidden = toggleBlockHiddenAt(data, ['body', 0], body.blocks!.text)
      expect((hidden.body as CmsBlockValue[])[0]).toEqual({
         type: 'text',
         heading: 'a',
         hidden: true,
      })
      const shown = toggleBlockHiddenAt(hidden, ['body', 0], body.blocks!.text)
      expect((shown.body as CmsBlockValue[])[0]).toEqual({ type: 'text', heading: 'a' })
      const own = { label: 'X', fields: { hidden: { label: 'Hidden', type: 'boolean' as const } } }
      expect(canHideBlock(own)).toBe(false)
      expect(toggleBlockHiddenAt(data, ['body', 0], own)).toBe(data)
      expect(canHideBlock(undefined)).toBe(false)
   })

   it('follows a path through removals, inserts and moves', () => {
      expect(pathAfterRemove(['body', 2], ['body', 1])).toEqual(['body', 1])
      expect(pathAfterRemove(['body', 1], ['body', 1])).toBeNull()
      expect(pathAfterRemove(['body', 1, 'items', 0], ['body', 1])).toBeNull()
      expect(pathAfterRemove(['body', 3, 'items', 0], ['body', 1])).toEqual(['body', 2, 'items', 0])
      expect(pathAfterRemove(['body', 0], ['body', 1])).toEqual(['body', 0])
      expect(pathAfterRemove(['body', 1, 'items', 2], ['body', 1, 'items', 0])).toEqual([
         'body',
         1,
         'items',
         1,
      ])
      expect(pathAfterInsert(['body', 1], ['body'], 1)).toEqual(['body', 2])
      expect(pathAfterInsert(['body', 1], ['body'], 2)).toEqual(['body', 1])
      expect(pathAfterInsert(['body', 1, 'items', 0], ['body'], 0, 3)).toEqual([
         'body',
         4,
         'items',
         0,
      ])
      expect(pathAfterInsert(['body', 1], ['body', 1, 'items'], 0)).toEqual(['body', 1])
      expect(movedBlockPath(['body', 0], ['body'], 3)).toEqual(['body', 2])
      expect(movedBlockPath(['body', 0], ['body'], 1)).toBeNull()
      expect(movedBlockPath(['body', 0], ['body', 2, 'items'], 0)).toEqual(['body', 1, 'items', 0])
      expect(movedBlockPath(['body', 2], ['body', 2, 'items'], 0)).toBeNull()
      expect(pathAfterMove(['body', 0, 'items', 1], ['body', 0], ['body'], 3)).toEqual([
         'body',
         2,
         'items',
         1,
      ])
      expect(pathAfterMove(['body', 2], ['body', 0], ['body'], 3)).toEqual(['body', 1])
      expect(pathAfterMove(['body', 1, 'items', 0], ['body', 0], ['body', 1, 'items'], 0)).toEqual([
         'body',
         0,
         'items',
         1,
      ])
      expect(pathAfterMove(['body', 0, 'items', 1], ['body', 0, 'items', 0], ['body'], 0)).toEqual([
         'body',
         1,
         'items',
         0,
      ])
      expect(pathAfterMove(['body', 4], ['body', 0], ['body'], 1)).toEqual(['body', 4])
   })

   it('allows a move into a list that takes the block type, its signature and has room', () => {
      const fields = nestedFields()
      const data = {
         body: [
            { type: 'text', heading: null },
            { type: 'columns', items: [{ type: 'cta' }], extra: [{ type: 'text' }] },
            { type: 'columns', items: [{ type: 'text' }, { type: 'text' }] },
         ],
      }
      expect(canMoveBlock(fields, data, ['body', 0], ['body', 1, 'items'])).toBe(true)
      expect(canMoveBlock(fields, data, ['body', 0], ['body', 2, 'items'])).toBe(false)
      expect(canMoveBlock(fields, data, ['body', 2, 'items', 0], ['body', 2, 'items'])).toBe(true)
      expect(canMoveBlock(fields, data, ['body', 1, 'items', 0], ['body'])).toBe(true)
      expect(canMoveBlock(fields, data, ['body', 0], ['body', 1, 'extra'])).toBe(false)
      expect(canMoveBlock(fields, data, ['body', 1], ['body', 2, 'items'])).toBe(false)
      expect(canMoveBlock(fields, data, ['body', 1], ['body', 1, 'items'])).toBe(false)
      expect(canMoveBlock(fields, data, ['body', 9], ['body'])).toBe(false)
      expect(canMoveBlock(fields, data, ['body', 0], ['body', 0, 'items'])).toBe(false)
   })

   it('keeps tree ids stable across edits, moves and inserts at every level', () => {
      const fields = nestedFields()
      let counter = 0
      const create = () => ++counter
      const leaf = { type: 'text', heading: null }
      const cta = { type: 'cta' }
      const columns = { type: 'columns', items: [leaf, cta] }
      const first = { body: [{ type: 'text' }, columns] }
      const one = stableBlockTreeIds(blockTreeVisits(fields, first), null, create)
      expect([...one.ids.entries()]).toEqual([
         ['body.0', 1],
         ['body.1', 2],
         ['body.1.items.0', 3],
         ['body.1.items.1', 4],
      ])
      const edited = updateBlockAt(first, ['body', 1, 'items', 1], (item) => ({ ...item, x: 1 }))
      const two = stableBlockTreeIds(blockTreeVisits(fields, edited), one.snapshot, create)
      expect([...two.ids.values()]).toEqual([1, 2, 3, 4])
      const moved = moveBlockAt(edited, ['body', 1, 'items', 0], ['body'], 0)
      const three = stableBlockTreeIds(blockTreeVisits(fields, moved), two.snapshot, create)
      expect([...three.ids.entries()]).toEqual([
         ['body.0', 3],
         ['body.1', 1],
         ['body.2', 2],
         ['body.2.items.0', 4],
      ])
      const added = insertBlockList(moved, ['body', 2, 'items'], 0, [{ type: 'text' }])
      const four = stableBlockTreeIds(blockTreeVisits(fields, added), three.snapshot, create)
      expect(four.ids.get('body.2.items.0')).toBe(5)
      expect(four.ids.get('body.2.items.1')).toBe(4)
   })

   it('lists every block of the tree in order, unknown types included', () => {
      const fields = nestedFields()
      const visits = blockTreeVisits(fields, {
         body: [{ type: 'columns', items: [{ type: 'text' }] }, { type: 'gone' }, 'junk'],
      })
      expect(visits.map((visit) => [formatBlockPath(visit.path), visit.block?.label])).toEqual([
         ['body.0', 'Columns'],
         ['body.0.items.0', 'Text'],
         ['body.1', undefined],
      ])
   })

   it('turns a drop position into an insertion index in vertical and horizontal lists', () => {
      const column = [
         { index: 0, top: 0, bottom: 100, left: 0, right: 300 },
         { index: 2, top: 100, bottom: 200, left: 0, right: 300 },
      ]
      expect(isHorizontalList(column)).toBe(false)
      expect(insertionIndex(column, { x: 10, y: 10 }, 3)).toBe(0)
      expect(insertionIndex(column, { x: 10, y: 60 }, 3)).toBe(2)
      expect(insertionIndex(column, { x: 10, y: 190 }, 3)).toBe(3)
      expect(insertionIndex([], { x: 0, y: 10 }, 4)).toBe(4)
      const row = [
         { index: 0, top: 0, bottom: 100, left: 0, right: 100 },
         { index: 1, top: 0, bottom: 100, left: 120, right: 220 },
      ]
      expect(isHorizontalList(row)).toBe(true)
      expect(insertionIndex(row, { x: 40, y: 90 }, 2)).toBe(0)
      expect(insertionIndex(row, { x: 80, y: 10 }, 2)).toBe(1)
      expect(insertionIndex(row, { x: 200, y: 10 }, 2)).toBe(2)
   })
})

describe('preview data', () => {
   const values = {
      title: { en: 'Spring', it: 'Primavera' },
      excerpt: { en: 'Short' },
      cover: 'covers/lake.jpg',
      category: 'cat_1',
      featured: true,
      body: [
         { type: 'text', heading: { en: 'Hello', it: 'Ciao' }, body: { en: '<p>x</p>' } },
         { type: 'image', image: 'blocks/river.jpg', hidden: true },
      ],
   }

   it('collects every media key of the item and its blocks', () => {
      expect(collectMediaKeys(news.fields, values).sort()).toEqual([
         'blocks/river.jpg',
         'covers/lake.jpg',
      ])
      expect(
         collectMediaKeys(
            { files: { label: 'F', type: 'media', translatable: true } },
            { files: { en: 'a.pdf', it: 'b.pdf' } }
         )
      ).toEqual(['a.pdf', 'b.pdf'])
   })

   it('builds a media object from the library or from the key', () => {
      expect(media('blocks/river.jpg')).toMatchObject({
         key: 'blocks/river.jpg',
         url: '/images/blocks/river.jpg',
         type: 'image',
         alt: null,
      })
      const item = {
         key: 'a.jpg',
         alt: 'Lake',
         folder: null,
         mime: 'image/jpeg',
         size: 10,
         width: 800,
         height: 600,
         focalX: 0.25,
         focalY: 0.75,
         createdAt: null,
         type: 'image' as const,
         url: 'https://cdn.test/a.jpg',
      }
      expect(previewMedia('a.jpg', item, '/images')).toMatchObject({
         url: 'https://cdn.test/a.jpg',
         alt: 'Lake',
         width: 800,
         focalX: 0.25,
         focalY: 0.75,
      })
      expect(media('blocks/river.jpg')).toMatchObject({ focalX: null, focalY: null })
   })

   it('localizes blocks like GraphQL and resolves their media', () => {
      const map = { 'blocks/river.jpg': media('blocks/river.jpg') }
      const blocks = previewBlocks(body, values.body, 'it', 'en', map)
      expect(blocks[0]).toEqual({ type: 'text', heading: 'Ciao', body: '<p>x</p>' })
      expect(blocks[1]).toMatchObject({
         type: 'image',
         hidden: true,
         image: map['blocks/river.jpg'],
      })
      expect(previewBlocks(body, null, 'en', 'en', {})).toEqual([])
   })

   it('hands empty nested lists to the preview as empty arrays', () => {
      const fields = nestedFields()
      const blocks = previewBlocks(
         fields.body!,
         [{ type: 'columns', items: null, extra: [{ type: 'text', heading: 'x' }] }],
         'en',
         'en',
         {}
      )
      expect(blocks[0]!.items).toEqual([])
      expect(blocks[0]!.extra).toEqual([{ type: 'text', heading: 'x' }])
   })

   it('localizes the item for the preview wrapper', () => {
      const map = { 'covers/lake.jpg': media('covers/lake.jpg') }
      const item = previewItem(news.fields, values, 'it', 'en', map)
      expect(item.title).toBe('Primavera')
      expect(item.excerpt).toBe('Short')
      expect(item.cover).toEqual(map['covers/lake.jpg'])
      expect(item.seoImage).toBeNull()
      expect(item.category).toBe('cat_1')
      expect(item.featured).toBe(true)
      expect((item.body as unknown[]).length).toBe(2)
   })

   it('summarizes a block from its first text field', () => {
      const text = body.blocks!.text!
      expect(blockSummary(text, values.body[0]!, 'it', 'en')).toBe('Ciao')
      expect(
         blockSummary(text, { type: 'text', body: { en: '<p>a   <b>b</b></p>' } }, 'it', 'en')
      ).toBe('a b')
      expect(blockSummary(text, { type: 'text', heading: 'x'.repeat(100) }, 'en', 'en', 10)).toBe(
         `${'x'.repeat(9)}…`
      )
      expect(blockSummary(body.blocks!.image, { type: 'image' }, 'en', 'en')).toBe('')
   })

   it('summarizes with entities decoded, falling back to a media file name', () => {
      const text = body.blocks!.text!
      expect(
         blockSummary(
            text,
            { type: 'text', heading: { en: 'Fish &amp; chips&nbsp;now' } },
            'en',
            'en'
         )
      ).toBe('Fish & chips now')
      expect(blockSummary(text, { type: 'text', heading: { en: 'Hi' } }, 'it', 'en')).toBe('Hi')
      expect(blockSummary(body.blocks!.image, values.body[1]!, 'en', 'en')).toBe('river.jpg')
   })

   it('summarizes a block from its link label and target', () => {
      const button = {
         label: 'Button',
         fields: {
            link: {
               label: 'Link',
               type: 'link' as const,
               withLabel: true,
               translatable: true,
            },
            note: { label: 'Note', type: 'text' as const },
         },
      }
      expect(
         blockSummary(
            button,
            { type: 'button', link: { url: '/join', label: { en: 'Join', it: 'Unisciti' } } },
            'it',
            'en'
         )
      ).toBe('Unisciti (/join)')
      expect(
         blockSummary(button, { type: 'button', link: { entry: 'news', id: '7' } }, 'en', 'en')
      ).toBe('news #7')
      expect(blockSummary(button, { type: 'button', link: null, note: 'Plain' }, 'en', 'en')).toBe(
         'Plain'
      )
   })

   it('maps form error keys to the paths of the blocks that hold them', () => {
      const errors = {
         title: 'Required',
         body: 'Too few blocks',
         'body.0.heading': 'Required',
         'body.2': 'Invalid block',
         'body.3.heading': undefined,
         'body.4.columns.1.content.0.heading': 'Too long',
         'body.5.columns': 'Too few blocks',
         'bodyx.4': 'Other field',
         'body.x': 'Not an index',
      }
      expect([...blockErrorPaths(errors, 'body')].sort()).toEqual([
         'body.0',
         'body.2',
         'body.4',
         'body.4.columns.1',
         'body.4.columns.1.content.0',
         'body.5',
      ])
      expect(blockErrorPaths({}, 'body').size).toBe(0)
   })

   it('finds the first invalid block in document order, at any depth', () => {
      expect(
         firstBlockError(
            {
               title: 'Required',
               'body.10.heading': 'Required',
               'body.2.columns.1.content.0.heading': 'Too long',
               'body.2.columns.0': 'Invalid',
            },
            'body'
         )
      ).toEqual({ path: ['body', 2, 'columns', 0] })
      expect(firstBlockError({ 'body.3.columns': 'Too few' }, 'body')).toEqual({
         path: ['body', 3],
         key: 'columns',
      })
      expect(firstBlockError({ 'body.1.items.0.heading': 'Required', body: 'x' }, 'body')).toEqual({
         path: ['body', 1, 'items', 0],
         key: 'heading',
      })
      expect(firstBlockError({ body: 'Too few' }, 'body')).toBeNull()
   })

   it('keys an issue by its field and by the path of the field in its block', () => {
      const fields = nestedFields()
      const values = {
         body: [{ type: 'columns', items: [{ type: 'text', heading: { en: 'x' } }] }],
      }
      const keys = (path: unknown[]) => editorIssueKeys(fields, values, path, 'body')
      expect(keys(['title'])).toEqual(['title'])
      expect(keys(['title', 'en'])).toEqual(['title'])
      expect(keys(['body'])).toEqual(['body'])
      expect(keys(['body', 0])).toEqual(['body', 'body.0'])
      expect(keys(['body', 0, 'items'])).toEqual(['body', 'body.0.items'])
      expect(keys(['body', 0, 'items', 0, 'heading', 'en'])).toEqual([
         'body',
         'body.0.items.0.heading',
      ])
      expect(keys(['body', 0, 'items', 0])).toEqual(['body', 'body.0.items.0'])
      expect(keys([])).toEqual([])
   })
})

describe('preview configuration', () => {
   it('validates the preview path', () => {
      expect(previewPathErrors('/cms/preview', ['news'])).toEqual([])
      expect(previewPathErrors('/cms/live-view', [])).toEqual([])
      expect(previewPathErrors('/preview', [])).toHaveLength(1)
      expect(previewPathErrors('/cms/a/b', [])).toHaveLength(1)
      expect(previewPathErrors('/cms/Preview', [])).toHaveLength(1)
      expect(previewPathErrors('/cms/login', [])).toHaveLength(1)
      expect(previewPathErrors('/cms/news', ['news'])).toHaveLength(1)
   })

   it('accepts a preview component on content entries only', () => {
      const valid = contentConfig()
      valid.news!.preview = { component: 'NewsArticle' }
      expect(validateConfig(valid, I18N)).toEqual([])

      const empty = contentConfig()
      empty.news!.preview = { component: ' ' }
      expect(validateConfig(empty, I18N).join('\n')).toContain(
         'preview.component must be a non-empty string'
      )

      const wrong = contentConfig()
      wrong.events!.preview = { component: 'EventArticle' }
      expect(validateConfig(wrong, I18N).join('\n')).toContain("preview needs kind 'content'")
   })

   it('generates the preview component map with a module level fallback', () => {
      const withEntry = normalizeCmsConfig(contentConfig(), I18N) as CmsConfig
      expect(collectPreviewComponents(withEntry)).toEqual([])
      expect(collectPreviewComponents(withEntry, 'site-article')).toEqual([
         { entry: 'news', component: 'SiteArticle' },
      ])
      withEntry.news!.preview = { component: 'NewsArticle' }
      const refs = collectPreviewComponents(withEntry, 'SiteArticle')
      expect(refs).toEqual([{ entry: 'news', component: 'NewsArticle' }])
      const file = renderBlocksFile([], refs)
      expect(file).toContain("import { LazyNewsArticle } from '#components'")
      expect(file).toContain('"news": LazyNewsArticle,')
      expect(missingPreviewComponents(refs, ['NewsArticle'])).toEqual([])
      expect(missingPreviewComponents(refs, [])).toEqual([
         "cms.config entry 'news': preview component 'NewsArticle' is not a registered Nuxt component",
      ])
   })
})

describe('required translatable values', () => {
   it('reports a missing translatable value as a required field', () => {
      const schema = buildEntrySchema({ fields: news.fields, drafts: true }, I18N)
      const result = schema.safeParse({
         title: null,
         slug: 'a',
         body: [{ type: 'text', body: null }],
      })
      const messages = result.error!.issues.map((issue) => [issue.path.join('.'), issue.message])
      expect(messages).toContainEqual(['title', 'Required field'])
      expect(messages).toContainEqual(['body.0.body', 'Required field'])
   })
})

describe('editor shortcuts', () => {
   const none = { metaKey: false, ctrlKey: false, altKey: false, shiftKey: false }

   function press(key: string, modifiers: Partial<typeof none> = {}) {
      return { ...none, ...modifiers, key }
   }

   it('detects apple platforms', () => {
      expect(isApplePlatform('MacIntel')).toBe(true)
      expect(isApplePlatform('iPhone')).toBe(true)
      expect(isApplePlatform('Win32')).toBe(false)
      expect(isApplePlatform('Linux x86_64')).toBe(false)
   })

   it('maps the command key on apple platforms', () => {
      expect(editorShortcut(press('z', { metaKey: true }), true)).toBe('undo')
      expect(editorShortcut(press('Z', { metaKey: true, shiftKey: true }), true)).toBe('redo')
      expect(editorShortcut(press('y', { metaKey: true }), true)).toBe('redo')
      expect(editorShortcut(press('s', { metaKey: true }), true)).toBe('save')
      expect(editorShortcut(press('d', { metaKey: true }), true)).toBe('duplicate')
      expect(editorShortcut(press('ArrowUp', { metaKey: true }), true)).toBe('move-up')
      expect(editorShortcut(press('ArrowDown', { metaKey: true }), true)).toBe('move-down')
      expect(editorShortcut(press('z', { ctrlKey: true }), true)).toBeNull()
   })

   it('maps the control key elsewhere', () => {
      expect(editorShortcut(press('z', { ctrlKey: true }), false)).toBe('undo')
      expect(editorShortcut(press('z', { ctrlKey: true, shiftKey: true }), false)).toBe('redo')
      expect(editorShortcut(press('y', { ctrlKey: true }), false)).toBe('redo')
      expect(editorShortcut(press('s', { ctrlKey: true }), false)).toBe('save')
      expect(editorShortcut(press('z', { metaKey: true }), false)).toBeNull()
   })

   it('maps plain keys', () => {
      expect(editorShortcut(press('Delete'), true)).toBe('remove')
      expect(editorShortcut(press('Backspace'), false)).toBe('remove')
      expect(editorShortcut(press('Enter'), true)).toBe('insert-after')
      expect(editorShortcut(press('Enter', { shiftKey: true }), true)).toBe('insert-before')
      expect(editorShortcut(press('Escape'), true)).toBe('deselect')
   })

   it('ignores other combinations', () => {
      expect(editorShortcut(press('z', { metaKey: true, altKey: true }), true)).toBeNull()
      expect(editorShortcut(press('s', { metaKey: true, shiftKey: true }), true)).toBeNull()
      expect(editorShortcut(press('y', { metaKey: true, shiftKey: true }), true)).toBeNull()
      expect(editorShortcut(press('k', { metaKey: true }), true)).toBeNull()
      expect(editorShortcut(press('Backspace', { shiftKey: true }), true)).toBeNull()
      expect(editorShortcut(press('Backspace', { metaKey: true }), true)).toBeNull()
      expect(editorShortcut(press('Enter', { ctrlKey: true }), true)).toBeNull()
      expect(editorShortcut(press('a'), true)).toBeNull()
   })

   it('leaves fields to the browser except for save', () => {
      const field = { editable: true, interactive: false, selected: true }
      expect(shortcutApplies('save', field)).toBe(true)
      for (const action of ['undo', 'redo', 'remove', 'duplicate', 'deselect'] as const)
         expect(shortcutApplies(action, field)).toBe(false)
   })

   it('needs a selected block for block actions', () => {
      const idle = { editable: false, interactive: false, selected: false }
      expect(shortcutApplies('undo', idle)).toBe(true)
      expect(shortcutApplies('redo', idle)).toBe(true)
      for (const action of [
         'remove',
         'duplicate',
         'move-up',
         'move-down',
         'insert-after',
         'insert-before',
         'deselect',
      ] as const) {
         expect(shortcutApplies(action, idle)).toBe(false)
         expect(shortcutApplies(action, { ...idle, selected: true })).toBe(true)
      }
   })

   it('leaves block actions to focused switches, checkboxes, buttons and links', () => {
      const button = { editable: false, interactive: true, selected: true }
      for (const action of [
         'remove',
         'duplicate',
         'move-up',
         'move-down',
         'insert-after',
         'insert-before',
      ] as const)
         expect(shortcutApplies(action, button)).toBe(false)
      expect(shortcutApplies('deselect', button)).toBe(true)
      expect(shortcutApplies('undo', button)).toBe(true)
      expect(shortcutApplies('save', button)).toBe(true)
   })
})

describe('clipboard keys', () => {
   const idle = { editable: false, interactive: false, textSelected: false, selected: false }

   it('does not cut the selected block from a focused control', () => {
      const control = { ...idle, interactive: true, selected: true }
      expect(clipboardActionApplies('cut', control)).toBe(false)
      expect(clipboardActionApplies('copy', control)).toBe(true)
      expect(clipboardActionApplies('paste', control)).toBe(true)
   })

   it('leaves fields and selected text to the browser', () => {
      for (const action of ['copy', 'cut', 'paste'] as const)
         expect(clipboardActionApplies(action, { ...idle, editable: true, selected: true })).toBe(
            false
         )
      expect(clipboardActionApplies('copy', { ...idle, selected: true, textSelected: true })).toBe(
         false
      )
      expect(clipboardActionApplies('cut', { ...idle, selected: true, textSelected: true })).toBe(
         false
      )
   })

   it('copies and cuts the selected block and pastes without one', () => {
      expect(clipboardActionApplies('copy', idle)).toBe(false)
      expect(clipboardActionApplies('cut', idle)).toBe(false)
      expect(clipboardActionApplies('paste', idle)).toBe(true)
      expect(clipboardActionApplies('copy', { ...idle, selected: true })).toBe(true)
      expect(clipboardActionApplies('cut', { ...idle, selected: true })).toBe(true)
      expect(clipboardActionApplies('paste', { ...idle, textSelected: true })).toBe(true)
   })
})

describe('insertion points', () => {
   const point = { list: ['body', 1, 'items'], index: 2 }

   it('follows inserts, removals and moves before the point', () => {
      expect(
         remapInsertionPoint(point, (path) => pathAfterInsert(path, ['body', 1, 'items'], 0))
      ).toEqual({ list: ['body', 1, 'items'], index: 3 })
      expect(
         remapInsertionPoint(point, (path) => pathAfterRemove(path, ['body', 1, 'items', 0]))
      ).toEqual({ list: ['body', 1, 'items'], index: 1 })
      expect(remapInsertionPoint(point, (path) => pathAfterInsert(path, ['body'], 0))).toEqual({
         list: ['body', 2, 'items'],
         index: 2,
      })
      expect(
         remapInsertionPoint(point, (path) => pathAfterMove(path, ['body', 1], ['body'], 0))
      ).toEqual({ list: ['body', 0, 'items'], index: 2 })
   })

   it('keeps the index when the item at the point is removed', () => {
      expect(
         remapInsertionPoint(point, (path) => pathAfterRemove(path, ['body', 1, 'items', 2]))
      ).toEqual(point)
      expect(
         remapInsertionPoint({ list: ['body'], index: 1 }, (path) =>
            pathAfterRemove(path, ['body', 1])
         )
      ).toEqual({ list: ['body'], index: 1 })
   })

   it('drops the point when the block that holds its list is removed', () => {
      expect(remapInsertionPoint(point, (path) => pathAfterRemove(path, ['body', 1]))).toBeNull()
   })
})
