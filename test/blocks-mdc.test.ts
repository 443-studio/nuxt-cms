import { describe, expect, it } from 'vitest'
import type { CmsConfig, CmsEntry, CmsI18n, FieldConfig } from '../src/runtime/shared/index'
import {
   blocksMdcGuide,
   blocksToMdc,
   defineCmsBlocks,
   entryMdcGuide,
   entryToMdc,
   hasMdcErrors,
   htmlToMarkdown,
   markdownToHtml,
   mdcFrontmatterKeys,
   mdcToBlocks,
   mdcToEntry,
   normalizeCmsConfig,
} from '../src/runtime/shared/index'
import { mdcSchemaCheck } from '../src/runtime/shared/mdc-check'
import playgroundConfig from '../playground/cms.config'

const I18N: CmsI18n = { locales: ['en', 'it'], defaultLocale: 'en' }
const PLAIN: CmsI18n = { locales: [], defaultLocale: 'en' }

const content = defineCmsBlocks({
   text: {
      label: 'Text',
      component: 'SectionText',
      description: 'A heading and a paragraph of rich text.',
      group: 'Text',
      fields: {
         heading: { label: 'Heading', type: 'text', translatable: true },
         body: { label: 'Body', type: 'richtext', translatable: true, required: true },
      },
   },
   image: {
      label: 'Image',
      component: 'SectionImage',
      fields: {
         image: { label: 'Image', type: 'media', mediaType: 'image', required: true },
         caption: { label: 'Caption', type: 'text', translatable: true },
      },
   },
   quote: {
      label: 'Quote',
      component: 'SectionQuote',
      fields: {
         text: { label: 'Text', type: 'text', textarea: true, translatable: true, required: true },
         author: { label: 'Author', type: 'text', max: 60 },
      },
   },
   cta: {
      label: 'Call to action',
      component: 'SectionCta',
      fields: {
         heading: { label: 'Heading', type: 'text', translatable: true, required: true },
         text: { label: 'Text', type: 'text', textarea: true, translatable: true },
         link: {
            label: 'Button',
            type: 'link',
            withLabel: true,
            translatable: true,
            required: true,
         },
      },
   },
})

const sections = defineCmsBlocks({
   ...content,
   columns: {
      label: 'Columns',
      component: 'SectionColumns',
      fields: {
         heading: { label: 'Heading', type: 'text', translatable: true },
         columns: {
            label: 'Columns',
            type: 'blocks',
            min: 2,
            max: 3,
            blocks: {
               column: {
                  label: 'Column',
                  component: 'SectionColumn',
                  fields: { content: { label: 'Content', type: 'blocks', blocks: content } },
               },
            },
         },
      },
   },
   accordion: {
      label: 'Accordion',
      component: 'SectionAccordion',
      fields: {
         heading: { label: 'Heading', type: 'text', translatable: true },
         panels: {
            label: 'Panels',
            type: 'blocks',
            min: 1,
            blocks: {
               panel: {
                  label: 'Panel',
                  component: 'SectionAccordionPanel',
                  fields: {
                     title: { label: 'Title', type: 'text', translatable: true, required: true },
                     content: { label: 'Content', type: 'blocks', blocks: content },
                  },
               },
            },
         },
      },
   },
})

const kitchen = defineCmsBlocks({
   all: {
      label: 'All types',
      fields: {
         title: { label: 'Title', type: 'text', max: 80 },
         long: { label: 'Long', type: 'text', textarea: true },
         intro: { label: 'Intro', type: 'richtext' },
         outro: { label: 'Outro', type: 'richtext' },
         count: { label: 'Count', type: 'number', integer: true, min: 0, max: 10 },
         ratio: { label: 'Ratio', type: 'number' },
         flag: { label: 'Flag', type: 'boolean' },
         off: { label: 'Off', type: 'boolean' },
         day: { label: 'Day', type: 'date' },
         at: { label: 'At', type: 'datetime' },
         email: { label: 'Email', type: 'email' },
         tone: {
            label: 'Tone',
            type: 'select',
            options: ['info', { value: 'warning', label: 'Warning' }],
         },
         data: { label: 'Data', type: 'json' },
         photo: { label: 'Photo', type: 'media', mediaType: 'image' },
         link: { label: 'Link', type: 'link', withLabel: true },
         page: { label: 'Page', type: 'link', to: ['news'], external: false },
         items: {
            label: 'Items',
            type: 'blocks',
            blocks: { item: { label: 'Item', fields: { name: { label: 'Name', type: 'text' } } } },
         },
      },
   },
   note: {
      label: 'Note',
      fields: {
         tone: { label: 'Tone', type: 'select', options: ['info', 'warning'] },
         body: { label: 'Body', type: 'richtext' },
      },
   },
})

function newsConfig(): CmsConfig {
   const config = {
      news: {
         id: 'news',
         label: 'News',
         kind: 'content',
         blocks: sections,
         route: '/news/[slug]',
         fields: {
            category: { label: 'Category', type: 'relation', to: 'categories' },
            featured: { label: 'Featured', type: 'boolean' },
         },
      },
      categories: {
         id: 'categories',
         label: 'Categories',
         kind: 'collection',
         titleField: 'name',
         fields: { name: { label: 'Name', type: 'text', required: true } },
      },
   } as unknown as CmsConfig
   return normalizeCmsConfig(config, I18N)
}

function news(): CmsEntry {
   return newsConfig().news!
}

function bodyField(): FieldConfig {
   return news().fields.body!
}

const NEWS_VALUES = {
   title: { en: 'New grinder MAR X500', it: 'Nuova rettificatrice MAR X500' },
   slug: 'new-grinder',
   publishedAt: '2026-03-09T09:00:00.000Z',
   excerpt: { en: 'Precision inside and out', it: 'Massima precisione per interni ed esterni' },
   cover: 'news/rettmar.webp',
   category: 'cat_1',
   featured: true,
   seoTitle: null,
   seoDescription: null,
   seoImage: null,
   seoNoindex: false,
   status: 'draft',
   body: [
      {
         type: 'text',
         heading: { en: 'The machine', it: 'La macchina' },
         body: {
            en: '<p>Investment in <strong>technology</strong>.</p><h2>MAR X500</h2><ul><li><p>Grind <em>internal</em> parts</p></li></ul>',
            it: "<p>L'investimento in <strong>tecnologia</strong>.</p><h2>MAR X500</h2><ul><li><p>Lavorare <em>internamente</em></p></li></ul>",
         },
      },
      {
         type: 'image',
         image: 'news/machine.webp',
         caption: { en: 'The grinder', it: 'La rettificatrice' },
         hidden: true,
      },
      {
         type: 'cta',
         heading: { en: 'Ask us', it: 'Chiedici' },
         text: null,
         link: { url: '/#contact', label: { en: 'Get in touch', it: 'Richiedi informazioni' } },
      },
      {
         type: 'columns',
         heading: null,
         columns: [
            {
               type: 'column',
               content: [
                  {
                     type: 'quote',
                     text: { en: 'Fast and "precise"', it: 'Veloce e "preciso"' },
                     author: 'Mario',
                  },
               ],
            },
            {
               type: 'column',
               content: [
                  {
                     type: 'text',
                     heading: null,
                     body: { en: '<p>Second column</p>', it: '<p>Seconda colonna</p>' },
                  },
               ],
            },
         ],
      },
   ],
}

describe('markdown subset', () => {
   it('round trips the rich text HTML of the editor', () => {
      const samples = [
         '<p>Hello <strong>world</strong>, <em>it</em> and <s>gone</s></p>',
         '<h2>Title</h2><h3>Sub</h3><p>A <a target="_blank" rel="noopener noreferrer nofollow" href="https://example.com/a_b">link <strong>bold</strong></a>.</p>',
         '<ul><li><p>one</p></li><li><p>two</p><ul><li><p>nested</p></li></ul></li></ul><ol><li><p>a</p></li><li><p>b</p></li></ol>',
         '<blockquote><p>quoted</p><p>second</p></blockquote>',
         '<p>1. not a list &amp; # no heading, snake_case *star* [x]</p>',
         '<p>line<br>break</p><ol start="3"><li><p>three</p></li><li><p>four</p><p>more</p></li></ol>',
         '<p><strong><em>both</em></strong> and - dash</p><p>::not a block</p><p>#noslot</p>',
      ]
      for (const html of samples) expect(markdownToHtml(htmlToMarkdown(html))).toBe(html)
   })

   it('reads common Markdown written by hand', () => {
      expect(markdownToHtml('# Big\n\nText *one*\nand two  \nthree\n\n* a\n* b\n\n1) x')).toBe(
         '<h2>Big</h2><p>Text <em>one</em> and two<br>three</p><ul><li><p>a</p></li><li><p>b</p></li></ul><ol><li><p>x</p></li></ol>'
      )
      expect(markdownToHtml('[bad](javascript:alert(1)) and ***both***')).toBe(
         '<p>bad and <strong><em>both</em></strong></p>'
      )
      expect(markdownToHtml('   ')).toBeNull()
      expect(htmlToMarkdown(null)).toBe('')
   })
})

describe('blocks MDC', () => {
   it('serializes blocks in one locale with props, YAML, body and nested blocks', () => {
      const text = blocksToMdc(bodyField(), NEWS_VALUES.body, { i18n: I18N, locale: 'it' })
      expect(text).toBe(
         [
            '::text{heading="La macchina"}',
            "L'investimento in **tecnologia**.",
            '',
            '## MAR X500',
            '',
            '- Lavorare *internamente*',
            '::',
            '',
            '::image{image="news/machine.webp" caption="La rettificatrice" hidden}',
            '::',
            '',
            '::cta{heading="Chiedici"}',
            '---',
            'link:',
            '  url: /#contact',
            '  label: Richiedi informazioni',
            '---',
            '::',
            '',
            '::columns',
            ':::column',
            '::::quote{author="Mario"}',
            '---',
            'text: Veloce e "preciso"',
            '---',
            '::::',
            ':::',
            '',
            ':::column',
            '::::text',
            'Seconda colonna',
            '::::',
            ':::',
            '::',
            '',
         ].join('\n')
      )
   })

   it('round trips every locale and keeps the other locales', () => {
      for (const locale of I18N.locales) {
         const text = blocksToMdc(bodyField(), NEWS_VALUES.body, { i18n: I18N, locale })
         const result = mdcToBlocks(text, bodyField(), {
            i18n: I18N,
            locale,
            current: NEWS_VALUES.body,
            key: 'body',
         })
         expect(result.issues).toEqual([])
         expect(result.value).toEqual(NEWS_VALUES.body)
      }
   })

   it('round trips every field type without i18n', () => {
      const field: FieldConfig = { label: 'Kitchen', type: 'blocks', blocks: kitchen }
      const value = [
         {
            type: 'all',
            title: 'Short title',
            long: 'Line one\nLine two',
            intro: '<p>Intro <strong>text</strong></p>',
            outro: '<blockquote><p>Outro</p></blockquote>',
            count: 3,
            ratio: 1.5,
            flag: true,
            off: false,
            day: '2026-01-15',
            at: '2026-01-15T09:00:00.000Z',
            email: 'a@example.com',
            tone: 'warning',
            data: { nested: [1, 2, { ok: true }] },
            photo: 'folder/photo.webp',
            link: { url: 'https://example.com', label: 'Example', newTab: true },
            page: { entry: 'news', id: 'abc' },
            items: [
               { type: 'item', name: 'One' },
               { type: 'item', name: 'A "quoted" name' },
            ],
         },
         { type: 'note', tone: 'info', body: '<p>Just a note</p>', hidden: true },
      ]
      const text = blocksToMdc(field, value, { i18n: PLAIN })
      expect(text).toContain('#intro\nIntro **text**')
      expect(text).toContain('#items\n:::item{name="One"}')
      expect(text).toContain('::note{tone="info" hidden}\nJust a note\n::')
      const result = mdcToBlocks(text, field, { i18n: PLAIN, check: check(field) })
      expect(result.issues).toEqual([])
      expect(result.value).toEqual(value)
   })

   it('fills a locale of new blocks only and merges matched blocks after edits', () => {
      const text = [
         '::text{heading="Nuovo"}',
         'Paragrafo nuovo',
         '::',
         '',
         blocksToMdc(bodyField(), NEWS_VALUES.body, { i18n: I18N, locale: 'it' }),
      ].join('\n')
      const result = mdcToBlocks(text, bodyField(), {
         i18n: I18N,
         locale: 'it',
         current: NEWS_VALUES.body,
         key: 'body',
      })
      expect(result.issues).toEqual([])
      expect(result.value![0]).toEqual({
         type: 'text',
         heading: { it: 'Nuovo' },
         body: { it: '<p>Paragrafo nuovo</p>' },
      })
      expect(result.value!.slice(1)).toEqual(NEWS_VALUES.body)
   })

   it('reports issues with line numbers', () => {
      const text = [
         '::text{heading="Hi" colour="red"}',
         'Body',
         '::',
         '',
         'stray text',
         '',
         '::unknown',
         '::',
         '',
         '::image{caption="No image"}',
         '::',
         '',
         '::cta',
         '---',
         'heading: Call',
         'link: [broken',
         '---',
         '::',
         '',
         '::quote{text="Hi" author=12345678901234567890123456789012345678901234567890123456789012345}',
         '::',
         '',
         '::columns',
         ':::column',
         '::::text',
         'Missing close',
      ].join('\n')
      const field = bodyField()
      const result = mdcToBlocks(text, field, {
         i18n: I18N,
         key: 'body',
         check: check(field, 'body', I18N),
      })
      const lines = result.issues.map((issue) => [issue.line, issue.message.slice(0, 40)])
      expect(lines).toContainEqual([1, expect.stringContaining('Unknown field "colour"')])
      expect(lines).toContainEqual([5, expect.stringContaining('Text outside a block')])
      expect(lines).toContainEqual([7, expect.stringContaining('Unknown block "unknown"')])
      expect(lines).toContainEqual([16, expect.stringContaining('Invalid YAML')])
      expect(result.issues.find((issue) => issue.line === 10)?.message).toContain('Image: Required')
      expect(result.issues.find((issue) => issue.line === 20)?.message).toContain('at most 60')
      expect(
         result.issues
            .filter((issue) => issue.message.includes('not closed'))
            .map((issue) => issue.line)
      ).toEqual([23, 24, 25])
      expect(hasMdcErrors(result.issues)).toBe(true)
   })

   it('flags bad options, wrong types, unknown media and the blocks count', () => {
      const field: FieldConfig = { label: 'Kitchen', type: 'blocks', blocks: kitchen, max: 1 }
      const text = [
         '::all{tone="loud" count="many" flag="maybe" photo="nope.webp"}',
         '::',
         '',
         '::note{tone="Warning"}',
         'ok',
         '::',
      ].join('\n')
      const result = mdcToBlocks(text, field, {
         i18n: PLAIN,
         check: check(field),
         media: new Set(['known.webp']),
      })
      const messages = result.issues.map((issue) => `${issue.line} ${issue.level} ${issue.message}`)
      expect(messages).toContainEqual(
         expect.stringMatching(/^1 error .*tone: "loud" is not an option/)
      )
      expect(messages).toContainEqual(
         expect.stringMatching(/^1 error .*count: Expected a whole number/)
      )
      expect(messages).toContainEqual(
         expect.stringMatching(/^1 error .*flag: Expected true or false/)
      )
      expect(messages).toContainEqual(
         expect.stringMatching(/^1 warning .*not in the media library/)
      )
      expect(messages).toContainEqual(
         expect.stringMatching(/^1 error Kitchen: Add at most 1 block/)
      )
      expect(result.value![1]).toEqual({ type: 'note', tone: 'warning', body: '<p>ok</p>' })
   })

   it('accepts a code fence around the text and blank lines before YAML props', () => {
      const text = '```mdc\n::cta{heading="Call"}\n\n---\nlink: /contact\n---\n::\n```\n'
      const result = mdcToBlocks(text, bodyField(), { i18n: PLAIN })
      expect(result.issues).toEqual([])
      expect(result.value).toEqual([
         { type: 'cta', heading: 'Call', text: null, link: { url: '/contact' } },
      ])
   })
})

describe('entry MDC', () => {
   it('writes the front matter and the body', () => {
      const text = entryToMdc(news().fields, NEWS_VALUES, { i18n: I18N, locale: 'it' })
      expect(
         text.startsWith(
            [
               '---',
               'title: Nuova rettificatrice MAR X500',
               'slug: new-grinder',
               "publishedAt: '2026-03-09T09:00:00.000Z'",
               'excerpt: Massima precisione per interni ed esterni',
               'cover: news/rettmar.webp',
               'category: cat_1',
               'featured: true',
               'seoNoindex: false',
               '---',
               '',
               '::text{heading="La macchina"}',
            ].join('\n')
         )
      ).toBe(true)
      expect(mdcFrontmatterKeys(news().fields)).not.toContain('body')
   })

   it('round trips the item in each locale', () => {
      const entry = news()
      for (const locale of I18N.locales) {
         const text = entryToMdc(entry.fields, NEWS_VALUES, { i18n: I18N, locale })
         const result = mdcToEntry(text, entry.fields, {
            i18n: I18N,
            locale,
            current: NEWS_VALUES,
            check: mdcSchemaCheck(entry, I18N, newsConfig()),
         })
         expect(result.issues).toEqual([])
         expect(result.values).toEqual(NEWS_VALUES)
      }
   })

   it('keeps missing front matter keys, clears null ones and fills the slug', () => {
      const entry = news()
      const current = { ...NEWS_VALUES, slug: null, category: 'cat_9' }
      const text = [
         '---',
         'title: Titolo',
         'excerpt: null',
         'publishedAt: 2026-04-01T10:00:00Z',
         'mood: happy',
         '---',
         '::text',
         'Corpo',
         '::',
      ].join('\n')
      const result = mdcToEntry(text, entry.fields, { i18n: I18N, locale: 'it', current })
      expect(result.issues).toEqual([
         expect.objectContaining({
            line: 5,
            message: expect.stringContaining('Unknown field "mood"'),
         }),
      ])
      expect(result.values.title).toEqual({ en: 'New grinder MAR X500', it: 'Titolo' })
      expect(result.values.excerpt).toEqual({ en: 'Precision inside and out' })
      expect(result.values.publishedAt).toBe('2026-04-01T10:00:00.000Z')
      expect(result.values.category).toBe('cat_9')
      expect(result.values.slug).toBe('new-grinder-mar-x500')
      expect(result.values.body).toEqual([
         {
            type: 'text',
            heading: { en: 'The machine' },
            body: { en: NEWS_VALUES.body[0]!.body!.en, it: '<p>Corpo</p>' },
         },
      ])
   })

   it('points schema issues to their lines', () => {
      const entry = news()
      const text = ['---', 'title: ""', '---', '', '::quote', '::'].join('\n')
      const result = mdcToEntry(text, entry.fields, {
         i18n: I18N,
         current: {},
         check: mdcSchemaCheck(entry, I18N, newsConfig()),
      })
      expect(result.issues).toContainEqual(
         expect.objectContaining({ line: 2, message: expect.stringContaining('Title') })
      )
      expect(result.issues).toContainEqual(
         expect.objectContaining({
            line: 5,
            message: expect.stringContaining('Body > Quote > Text: '),
         })
      )
   })
})

describe('AI guide', () => {
   it('describes the playground schema and its examples parse', () => {
      const entry = news()
      const guide = entryMdcGuide(entry.fields, {
         i18n: I18N,
         locale: 'it',
         title: 'News',
         media: ['news/cover.webp', 'docs/manual.pdf'],
      })
      expect(guide).toContain('# Writing "News" as MDC text')
      expect(guide).toContain('Answer with only the MDC text')
      expect(guide).toContain('Write every text in Italian (it).')
      expect(guide).toContain('- `title` (text, one line, required, in Italian (it)): Title')
      expect(guide).toContain('### `columns`: Columns')
      expect(guide).toContain('### `column`: Column (inside `columns`)')
      expect(guide).toContain('- `columns` (list of blocks, 2 to 3 blocks, nested blocks')
      expect(guide).toContain('Use only these keys: `news/cover.webp`, `docs/manual.pdf`')
      expect(guide).toContain('::::text{heading="Heading text"}')
      expect(guide.match(/^### `text`/gm)).toHaveLength(1)
      const english = entryMdcGuide(entry.fields, { i18n: I18N, title: 'News' })
      const example = /## Full example\n\n```mdc\n([\s\S]*?)```/.exec(english)![1]!
      const parsed = mdcToEntry(example, entry.fields, {
         i18n: I18N,
         current: {},
         check: mdcSchemaCheck(entry, I18N, newsConfig()),
      })
      expect(parsed.issues).toEqual([])
      const blocks = blocksMdcGuide(bodyField(), { i18n: PLAIN, title: 'Body' })
      expect(blocks).not.toContain('front matter between')
      for (const match of blocks.matchAll(/Example:\n\n```mdc\n(::[a-z][\s\S]*?)```/g)) {
         const result = mdcToBlocks(match[1]!, bodyField(), {
            i18n: PLAIN,
            key: 'body',
            check: check(bodyField(), 'body'),
         })
         expect(result.issues).toEqual([])
      }
   })
})

describe('playground schema', () => {
   const config = normalizeCmsConfig(
      JSON.parse(JSON.stringify(playgroundConfig)) as CmsConfig,
      I18N
   )
   const current: Record<string, Record<string, unknown>> = {
      news: {},
      blog: { author: 'author_1' },
   }

   it.each(['news', 'blog'])('builds a guide for %s whose examples parse', (name) => {
      const entry = config[name]!
      const fields = entry.fields
      const guide = entryMdcGuide(fields, { i18n: I18N, title: entry.label })
      expect(guide).toContain('## Front matter')
      expect(guide).toContain('### `accordion`: Accordion')
      expect(guide).toContain('### `panel`: Panel (inside `accordion`)')
      expect(guide).toContain('Write every text in English (en).')
      const example = /## Full example\n\n```mdc\n([\s\S]*?)```/.exec(guide)![1]!
      const result = mdcToEntry(example, fields, {
         i18n: I18N,
         current: current[name],
         check: mdcSchemaCheck(entry, I18N, config),
      })
      expect(result.issues).toEqual([])
      for (const match of guide.matchAll(/Example:\n\n```mdc\n(::[a-z][\s\S]*?)```/g)) {
         const blocks = mdcToBlocks(match[1]!, fields.body!, {
            i18n: I18N,
            key: 'body',
            check: check(fields.body!, 'body', I18N),
         })
         expect(blocks.issues).toEqual([])
      }
   })

   it('round trips the blocks of the homepage single', () => {
      const fields = config.homepage!.fields
      const keys = Object.keys(fields).filter((key) => fields[key]!.type === 'blocks')
      expect(keys.length).toBeGreaterThan(0)
      for (const key of keys) {
         const field = fields[key]!
         const guide = blocksMdcGuide(field, { i18n: I18N, title: field.label })
         const example = /Example:\n\n```mdc\n(::[a-z][\s\S]*?)```/.exec(guide)![1]!
         const parsed = mdcToBlocks(example, field, { i18n: I18N, key })
         expect(parsed.issues).toEqual([])
         const again = mdcToBlocks(blocksToMdc(field, parsed.value, { i18n: I18N }), field, {
            i18n: I18N,
            key,
            current: parsed.value,
         })
         expect(again.value).toEqual(parsed.value)
      }
   })
})

function check(field: FieldConfig, key = 'blocks', i18n: CmsI18n = PLAIN) {
   return mdcSchemaCheck({ fields: { [key]: field } }, i18n)
}
