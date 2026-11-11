import { buildSchema, parse, validate } from 'graphql'
import { describe, expect, it } from 'vitest'
import { renderQueriesFile, singleQuery } from '../src/queries-codegen'
import { renderSchemaFile, validateConfig } from '../src/schema-codegen'
import { renderTypesFile } from '../src/types-codegen'
import { renderGraphqlSdl } from '../src/runtime/shared/graphql-sdl'
import type { CmsConfig, FieldConfig } from '../src/runtime/shared/index'
import {
   hasTranslatableBlockFields,
   isExternalLinkUrl,
   isFieldVisible,
   linkDisplayText,
   linkHref,
   linkLabelText,
   linkReferences,
   linkTargetKey,
   linkTargetNames,
   linkUrlError,
   linkUrlKind,
   normalizeCmsConfig,
   parseLinkTargetKey,
   readLinkValue,
   resolveCmsLink,
} from '../src/runtime/shared/index'
import { previewBlocks, previewItem } from '../src/runtime/shared/preview'
import { csvCellValue } from '../src/runtime/shared/transfer'
import { buildEntrySchema } from '../src/runtime/shared/validation'
import { collectLinkUsage } from '../src/runtime/server/utils/link-usage'
import { I18N } from './fixtures'

function linkConfig(extra: Record<string, FieldConfig> = {}): CmsConfig {
   const config = normalizeCmsConfig(
      {
         pages: {
            id: 'pages',
            label: 'Pages',
            kind: 'page',
            fields: { title: { label: 'Title', type: 'text' } },
         },
         news: {
            id: 'news',
            label: 'News',
            kind: 'content',
            route: { en: '/news/[slug]', it: '/notizie/[slug]' },
            blocks: { text: { label: 'Text', fields: { body: { label: 'Body', type: 'text' } } } },
         },
         blog: {
            id: 'blog',
            label: 'Blog',
            kind: 'content',
            blocks: { text: { label: 'Text', fields: { body: { label: 'Body', type: 'text' } } } },
         },
         authors: {
            id: 'authors',
            label: 'Authors',
            kind: 'collection',
            titleField: 'name',
            fields: { name: { label: 'Name', type: 'text', required: true } },
         },
         footer: {
            id: 'footer',
            label: 'Footer',
            kind: 'single',
            fields: {
               cta: { label: 'CTA', type: 'link', withLabel: true, translatable: true },
               menu: {
                  label: 'Menu',
                  type: 'blocks',
                  blocks: {
                     item: {
                        label: 'Item',
                        fields: {
                           link: { label: 'Link', type: 'link', withLabel: true, required: true },
                        },
                     },
                  },
               },
               ...extra,
            },
         },
      } as unknown as CmsConfig,
      I18N
   )
   config.pages!.pages = [
      { path: '/', key: 'home', label: 'Home' },
      { path: '/about', key: 'about', label: 'About' },
   ]
   return config
}

function parseLink(config: CmsConfig, field: FieldConfig, value: unknown) {
   const schema = buildEntrySchema({ fields: { link: field }, config }, I18N)
   return schema.safeParse({ link: value })
}

function linkError(config: CmsConfig, field: FieldConfig, value: unknown) {
   const result = parseLink(config, field, value)
   return result.success ? null : result.error.issues[0]!.message
}

describe('link urls', () => {
   it('accepts http, https, mailto, tel, root-relative paths and anchors', () => {
      for (const url of [
         'https://example.com/a?b=1#c',
         'http://example.com',
         'HTTPS://EXAMPLE.COM',
         'mailto:team@example.com',
         'tel:+39-000-0000',
         '/contact',
         '/',
         '#team',
      ])
         expect(linkUrlError(url), url).toBeNull()
   })

   it('refuses scripts, data urls, other schemes and malformed values', () => {
      expect(linkUrlError('javascript:alert(1)')).toMatch(/javascript: links are not allowed/)
      expect(linkUrlError('JavaScript:alert(1)')).toMatch(/not allowed/)
      expect(linkUrlError('data:text/html,<b>x</b>')).toMatch(/data: links are not allowed/)
      expect(linkUrlError('vbscript:x')).toMatch(/not allowed/)
      expect(linkUrlError('ftp://example.com')).toMatch(/not allowed/)
      expect(linkUrlError('java\tscript:alert(1)')).toMatch(/spaces/)
      expect(linkUrlError(' https://example.com')).toMatch(/spaces/)
      expect(linkUrlError('//evil.example')).toMatch(/https:\/\//)
      expect(linkUrlError('/\\evil.example')).toMatch(/https:\/\//)
      expect(linkUrlError('example.com')).toMatch(/full URL/)
      expect(linkUrlError('https:example.com')).toBe('Invalid URL')
      expect(linkUrlError('https://')).toBe('Invalid URL')
      expect(linkUrlError('mailto:')).toMatch(/email/)
      expect(linkUrlError('tel:abc')).toMatch(/phone/)
      expect(linkUrlError('#')).toMatch(/anchor/)
      expect(linkUrlError('')).toBe('Enter a URL')
      expect(linkUrlError(`/${'a'.repeat(2048)}`)).toMatch(/too long/)
   })

   it('tells external urls from site paths', () => {
      expect(linkUrlKind('https://example.com')).toBe('absolute')
      expect(linkUrlKind('/about')).toBe('path')
      expect(linkUrlKind('#top')).toBe('anchor')
      expect(linkUrlKind('javascript:x')).toBeNull()
      expect(isExternalLinkUrl('mailto:a@b.c')).toBe(true)
      expect(isExternalLinkUrl('/about')).toBe(false)
      expect(isExternalLinkUrl(null)).toBe(false)
   })
})

describe('link values', () => {
   it('reads stored values, json text and plain urls', () => {
      expect(readLinkValue({ entry: 'news', id: 'a', newTab: false, extra: 1 })).toEqual({
         entry: 'news',
         id: 'a',
      })
      expect(readLinkValue('{"url":"/a","newTab":true}')).toEqual({ url: '/a', newTab: true })
      expect(readLinkValue('https://example.com')).toEqual({ url: 'https://example.com' })
      expect(readLinkValue('{broken')).toBeNull()
      expect(readLinkValue(null)).toBeNull()
   })

   it('builds and parses target keys', () => {
      expect(linkTargetKey('news', 'a:b')).toBe('news:a:b')
      expect(parseLinkTargetKey('news:a:b')).toEqual({ entry: 'news', id: 'a:b' })
      expect(parseLinkTargetKey('news:')).toBeNull()
      expect(parseLinkTargetKey(':a')).toBeNull()
   })

   it('localizes the label with fallbacks', () => {
      expect(linkLabelText({ en: 'Read', it: 'Leggi' }, 'it', 'en')).toBe('Leggi')
      expect(linkLabelText({ en: 'Read' }, 'it', 'en')).toBe('Read')
      expect(linkLabelText({ it: 'Leggi' }, 'de', 'en')).toBe('Leggi')
      expect(linkLabelText('Read', 'it', 'en')).toBe('Read')
      expect(linkLabelText('', 'it', 'en')).toBeNull()
   })

   it('resolves hrefs for urls, pages and routed content', () => {
      const config = linkConfig()
      const item = { id: 'n1', slug: 'hello', publishedAt: '2026-01-01T00:00:00.000Z' }
      expect(linkHref(config, { url: '/contact' }, 'en')).toBe('/contact')
      expect(linkHref(config, { url: 'javascript:alert(1)' }, 'en')).toBeNull()
      expect(linkHref(config, { entry: 'pages', id: 'about' }, 'it')).toBe('/about')
      expect(linkHref(config, { entry: 'pages', id: 'gone' }, 'en')).toBeNull()
      expect(linkHref(config, { entry: 'news', id: 'n1' }, 'it', item)).toBe('/notizie/hello')
      expect(linkHref(config, { entry: 'news', id: 'n1' }, 'en', null)).toBeNull()
      expect(linkHref(config, { entry: 'blog', id: 'b1' }, 'en', item)).toBeNull()
      expect(linkHref(config, { entry: 'missing', id: 'x' }, 'en', item)).toBeNull()
   })

   it('resolves a stored value to the public shape', () => {
      const config = linkConfig()
      expect(
         resolveCmsLink(
            config,
            { url: 'https://example.com', label: { en: 'Go', it: 'Vai' }, newTab: true },
            'it',
            'en'
         )
      ).toEqual({
         href: 'https://example.com',
         label: 'Vai',
         newTab: true,
         external: true,
         entry: null,
         id: null,
      })
      expect(resolveCmsLink(config, { entry: 'pages', id: 'home' }, 'en', 'en')).toEqual({
         href: '/',
         label: null,
         newTab: false,
         external: false,
         entry: 'pages',
         id: 'home',
      })
      expect(resolveCmsLink(config, { label: 'Orphan' }, 'en', 'en')).toBeNull()
   })

   it('lists the internal targets of top-level and block links', () => {
      const config = linkConfig()
      const references = linkReferences(config.footer!.fields, {
         cta: { entry: 'news', id: 'n1' },
         menu: [
            { type: 'item', link: { url: '/a' } },
            { type: 'item', link: { entry: 'pages', id: 'about' } },
         ],
      })
      expect(references).toEqual([
         { field: 'cta', entry: 'news', id: 'n1' },
         { field: 'menu[1].link', entry: 'pages', id: 'about' },
      ])
   })

   it('shows a short text for list cells', () => {
      expect(linkDisplayText({ url: '/a', label: 'A' }, 'en', 'en')).toBe('A (/a)')
      expect(linkDisplayText({ entry: 'news', id: 'n1' }, 'en', 'en')).toBe('news #n1')
      expect(linkDisplayText(null, 'en', 'en')).toBe('')
      expect(linkDisplayText({ entry: 'news', id: 'n1', label: 'Read' }, 'en', 'en')).toBe('Read')
      expect(linkDisplayText({ entry: 'news', id: 'n1', label: 'Read' }, 'en', 'en', 'Hi')).toBe(
         'Read (Hi)'
      )
   })

   it('defaults the targets to the page entry and routed content', () => {
      const config = linkConfig()
      expect(linkTargetNames(config, { label: 'L', type: 'link' })).toEqual(['pages', 'news'])
      expect(linkTargetNames(config, { label: 'L', type: 'link', to: ['news'] })).toEqual(['news'])
   })

   it('makes a translatable link label switch the blocks locale', () => {
      expect(hasTranslatableBlockFields(linkConfig().footer!.fields.menu!)).toBe(false)
      const localized = linkConfig({
         extra: {
            label: 'Extra',
            type: 'blocks',
            blocks: {
               b: {
                  label: 'B',
                  fields: {
                     link: { label: 'L', type: 'link', withLabel: true, translatable: true },
                  },
               },
            },
         },
      })
      expect(hasTranslatableBlockFields(localized.footer!.fields.extra!)).toBe(true)
   })
})

describe('link validation', () => {
   const field: FieldConfig = { label: 'Link', type: 'link', withLabel: true }

   it('normalizes an external url and drops empty extras', () => {
      const result = parseLink(linkConfig(), field, {
         url: ' https://example.com ',
         label: '  ',
         newTab: false,
      })
      expect(result.success && result.data.link).toEqual({ url: 'https://example.com' })
   })

   it('keeps an internal target with its label and new tab flag', () => {
      const result = parseLink(linkConfig(), field, {
         entry: 'news',
         id: 'n1',
         label: 'Read',
         newTab: true,
      })
      expect(result.success && result.data.link).toEqual({
         entry: 'news',
         id: 'n1',
         label: 'Read',
         newTab: true,
      })
   })

   it('treats an empty value as null and enforces required', () => {
      const config = linkConfig()
      const empty = parseLink(config, field, { url: '', newTab: true })
      expect(empty.success && empty.data.link).toBeNull()
      expect(linkError(config, { ...field, required: true }, null)).toBe('Required field')
      expect(linkError(config, { ...field, required: true }, {})).toBe('Required field')
   })

   it('refuses unsafe urls, both kinds at once and a label without a target', () => {
      const config = linkConfig()
      expect(linkError(config, field, { url: 'javascript:alert(1)' })).toMatch(/not allowed/)
      expect(linkError(config, field, { url: 'data:text/html,x' })).toMatch(/not allowed/)
      expect(linkError(config, field, { url: '/a', entry: 'news', id: 'n1' })).toMatch(
         /either a URL or a target/
      )
      expect(linkError(config, field, { label: 'Read' })).toBe('Choose a page or enter a URL')
      expect(linkError(config, field, { entry: 'news' })).toBe('Choose a page or enter a URL')
      expect(linkError(config, field, 'https://example.com')).toBe('Choose a page or enter a URL')
   })

   it('applies external, to and the known page routes', () => {
      const config = linkConfig()
      const internal: FieldConfig = { label: 'L', type: 'link', external: false, to: ['pages'] }
      expect(linkError(config, internal, { url: '/a' })).toMatch(/external URL/)
      expect(linkError(config, internal, { entry: 'news', id: 'n1' })).toMatch(/'news'/)
      expect(linkError(config, internal, { entry: 'pages', id: 'gone' })).toBe('Unknown page')
      expect(linkError(config, internal, { entry: 'pages', id: 'about' })).toBeNull()
      expect(linkError(config, field, { entry: 'authors', id: 'a1' })).toMatch(/'authors'/)
   })

   it('drops the label without withLabel and keeps a translatable one per locale', () => {
      const config = linkConfig()
      const bare = parseLink(config, { label: 'L', type: 'link' }, { url: '/a', label: 'x' })
      expect(bare.success && bare.data.link).toEqual({ url: '/a' })
      const localized: FieldConfig = { ...field, translatable: true }
      const result = parseLink(config, localized, {
         url: '/a',
         label: { en: 'Read', it: ' ' },
      })
      expect(result.success && result.data.link).toEqual({ url: '/a', label: { en: 'Read' } })
      const plain = parseLink(config, localized, { url: '/a', label: 'Read' })
      expect(plain.success && plain.data.link).toEqual({ url: '/a', label: { en: 'Read' } })
      expect(linkError(config, localized, { url: '/a', label: { fr: 'Lire' } })).toBe(
         'Unknown locale key'
      )
      expect(linkError(config, field, { url: '/a', label: { en: 'x' } })).toBe('Invalid link text')
   })

   it('validates links inside blocks', () => {
      const config = linkConfig()
      const schema = buildEntrySchema({ ...config.footer!, config }, I18N)
      const ok = schema.safeParse({
         menu: [{ type: 'item', link: { entry: 'pages', id: 'home', label: 'Home' } }],
      })
      expect(ok.success).toBe(true)
      const bad = schema.safeParse({ menu: [{ type: 'item', link: { url: 'javascript:x' } }] })
      expect(bad.success).toBe(false)
      expect(bad.error!.issues[0]!.path).toEqual(['menu', 0, 'link'])
      const missing = schema.safeParse({ menu: [{ type: 'item', link: null }] })
      expect(missing.error!.issues[0]!.message).toBe('Required field')
   })

   it('checks only syntax and declared targets without a config', () => {
      const schema = buildEntrySchema({ fields: { link: { ...field, to: ['news'] } } }, I18N)
      expect(schema.safeParse({ link: { entry: 'news', id: 'x' } }).success).toBe(true)
      expect(schema.safeParse({ link: { entry: 'blog', id: 'x' } }).success).toBe(false)
   })
})

describe('link config validation', () => {
   function errorsFor(field: Record<string, unknown>, extra: Record<string, unknown> = {}) {
      const config = linkConfig({ probe: field as unknown as FieldConfig })
      Object.assign(config, extra)
      return validateConfig(config, I18N).filter((error) => error.includes("'probe'"))
   }

   it('accepts valid link fields', () => {
      expect(validateConfig(linkConfig(), I18N)).toEqual([])
      expect(
         errorsFor({ label: 'P', type: 'link', to: ['news', 'pages'], external: false })
      ).toEqual([])
   })

   it('refuses unknown, non-routed and repeated targets', () => {
      expect(errorsFor({ label: 'P', type: 'link', to: ['nope'] })).toEqual([
         expect.stringContaining("link target 'nope' is not in the registry"),
      ])
      expect(errorsFor({ label: 'P', type: 'link', to: ['blog', 'authors'] })).toEqual([
         expect.stringContaining("'blog' must be the page entry or a content entry with a route"),
         expect.stringContaining("'authors' must be the page entry"),
      ])
      expect(errorsFor({ label: 'P', type: 'link', to: ['news', 'news'] })).toEqual([
         expect.stringContaining("'news' is listed twice"),
      ])
      expect(errorsFor({ label: 'P', type: 'link', to: 'news' })).toEqual([
         expect.stringContaining('to must be a list of entry names'),
      ])
   })

   it('refuses a link with no possible target and bad option types', () => {
      expect(errorsFor({ label: 'P', type: 'link', to: [], external: false })).toEqual([
         expect.stringContaining('the link allows no target'),
      ])
      expect(errorsFor({ label: 'P', type: 'link', external: 'no', withLabel: 1 })).toEqual([
         expect.stringContaining('external must be a boolean'),
         expect.stringContaining('withLabel must be a boolean'),
      ])
      expect(errorsFor({ label: 'P', type: 'text', external: true, withLabel: true })).toEqual([
         expect.stringContaining('external is only supported on link fields'),
         expect.stringContaining('withLabel is only supported on link fields'),
      ])
   })

   it('needs withLabel for a translatable link and checks block links too', () => {
      expect(errorsFor({ label: 'P', type: 'link', translatable: true })).toEqual([
         expect.stringContaining('translatable needs withLabel'),
      ])
      const errors = errorsFor({
         label: 'P',
         type: 'blocks',
         blocks: { b: { label: 'B', fields: { l: { label: 'L', type: 'link', to: ['x'] } } } },
      })
      expect(errors).toEqual([expect.stringContaining("block 'b', field 'l': link target 'x'")])
   })

   it('reserves the CmsLink type name', () => {
      const config = linkConfig()
      Object.assign(config, {
         cms_link: {
            id: 'cms_link',
            label: 'X',
            kind: 'single',
            fields: { a: { label: 'A', type: 'text' } },
         },
      })
      expect(validateConfig(config, I18N)).toEqual([
         expect.stringContaining("GraphQL type name 'CmsLink' is reserved"),
      ])
   })
})

describe('link codegen', () => {
   it('stores links as json columns', () => {
      const config = linkConfig()
      expect(renderSchemaFile(config, 'sqlite')).toContain("cta: text('cta', { mode: 'json' }),")
      const pg = renderSchemaFile(config, 'postgres')
      expect(pg).toContain("cta: jsonb('cta'),")
      expect(pg).toMatch(/import \{[^}]*jsonb/)
   })

   it('adds CmsLink to the schema, the types and the generated queries', () => {
      const config = linkConfig()
      const sdl = renderGraphqlSdl(config)
      expect(sdl).toContain(
         'type CmsLink {\n  href: String\n  label: String\n  newTab: Boolean!\n  external: Boolean!\n  entry: String\n  id: String\n}'
      )
      expect(sdl).toMatch(/type Footer \{[^}]*cta: CmsLink\n/)
      expect(sdl).toMatch(/type FooterMenuItem implements FooterMenuBlock \{[^}]*link: CmsLink\n/)
      expect(sdl).toMatch(/interface FooterMenuBlock \{[^}]*link: CmsLink\n/)
      expect(sdl).not.toMatch(/FooterFilters/)
      const query = singleQuery(config, 'footer', config.footer!)
      expect(query).toContain('cta { href label newTab external entry id }')
      expect(query).toContain(
         '... on FooterMenuItem { link { href label newTab external entry id } }'
      )
      const schema = buildSchema(sdl)
      expect(validate(schema, parse(query))).toEqual([])
      expect(renderQueriesFile(config)).toContain('cta { href label newTab external entry id }')
      const types = renderTypesFile(config)
      expect(types).toContain('export interface CmsLink {\n  href: string | null')
      expect(types).toMatch(/export interface Footer \{[^}]*cta: CmsLink \| null/)
      expect(types).toMatch(/export interface FooterMenuItemProps \{\n  link: CmsLink \| null/)
   })

   it('keeps link fields out of the filters and sort of collections', () => {
      const config = linkConfig()
      config.authors!.fields.site = { label: 'Site', type: 'link' }
      const sdl = renderGraphqlSdl(config)
      expect(sdl).toMatch(/type Authors \{[^}]*site: CmsLink/)
      expect(sdl).not.toMatch(/input AuthorsFilters \{[^}]*site/)
      expect(sdl).not.toMatch(/enum AuthorsSortField \{[^}]*site/)
   })
})

describe('link previews, csv and usage', () => {
   it('resolves links in the visual editor preview', () => {
      const config = linkConfig()
      const footer = config.footer!
      const item = previewItem(
         footer.fields,
         { cta: { url: '/a', label: { en: 'A', it: 'B' } } },
         'it',
         'en',
         {}
      )
      expect(item.cta).toMatchObject({ href: '/a', label: 'B' })
      const blocks = previewBlocks(
         footer.fields.menu!,
         [{ type: 'item', link: { entry: 'news', id: 'n1' } }],
         'en',
         'en',
         {},
         (value) => resolveCmsLink(config, value, 'en', 'en', { id: 'n1', slug: 'hi' })
      )
      expect(blocks[0]!.link).toMatchObject({ href: '/news/hi', entry: 'news', id: 'n1' })
   })

   it('reads link cells as json text or a plain url', () => {
      const field: FieldConfig = { label: 'L', type: 'link' }
      expect(csvCellValue(field, '{"entry":"news","id":"n1"}')).toEqual({
         value: { entry: 'news', id: 'n1' },
      })
      expect(csvCellValue(field, ' https://example.com ')).toEqual({
         value: { url: 'https://example.com' },
      })
      expect(csvCellValue(field, '{nope')).toEqual({ error: 'Invalid JSON' })
      expect(csvCellValue(field, '')).toEqual({ value: null })
   })

   it('lists where an item is linked, without self links', () => {
      const config = linkConfig()
      config.news!.fields.related = { label: 'Related', type: 'link' }
      const usage = collectLinkUsage(
         [
            {
               name: 'footer',
               entry: config.footer!,
               rows: [
                  {
                     id: 'footer',
                     cta: { entry: 'news', id: 'n1' },
                     menu: [{ type: 'item', link: { entry: 'news', id: 'n1' } }],
                  },
               ],
            },
            {
               name: 'news',
               entry: config.news!,
               rows: [
                  { id: 'n1', title: { en: 'One' }, related: { entry: 'news', id: 'n1' } },
                  { id: 'n2', title: { en: 'Two' }, related: { entry: 'news', id: 'n1' } },
               ],
            },
         ],
         ['news:n1', 'news:n9']
      )
      expect(usage['news:n9']).toEqual([])
      expect(usage['news:n1']).toEqual([
         {
            collection: 'footer',
            label: 'Footer',
            kind: 'single',
            id: null,
            title: null,
            field: 'cta',
         },
         {
            collection: 'footer',
            label: 'Footer',
            kind: 'single',
            id: null,
            title: null,
            field: 'menu[0].link',
         },
         {
            collection: 'news',
            label: 'News',
            kind: 'content',
            id: 'n2',
            title: 'Two',
            field: 'related',
         },
      ])
   })
})

describe('link fields with field options and conditions', () => {
   function errorsFor(field: Record<string, unknown>) {
      const config = linkConfig({ probe: field as unknown as FieldConfig })
      return validateConfig(config, I18N).filter((error) => error.includes("'probe'"))
   }

   it('refuses default, unique, immutable, min and max on a link', () => {
      expect(errorsFor({ label: 'P', type: 'link', default: { url: '/' } })).toEqual([
         expect.stringContaining('default is only supported on text, richtext'),
      ])
      expect(errorsFor({ label: 'P', type: 'link', unique: true })).toEqual([
         expect.stringContaining('unique is only supported on text, email, number fields'),
      ])
      expect(errorsFor({ label: 'P', type: 'link', immutable: true })).toEqual([
         expect.stringContaining('immutable is only supported on'),
      ])
      expect(errorsFor({ label: 'P', type: 'link', min: 1, max: 2 })).toEqual([
         expect.stringContaining('min and max are only supported on number, text, blocks and tags'),
      ])
   })

   it('lets other fields test a link with empty only', () => {
      const extra = (showIf: unknown) => ({
         label: 'P',
         type: 'text',
         showIf: { field: 'cta', ...(showIf as object) },
      })
      expect(errorsFor(extra({ empty: false }))).toEqual([])
      expect(errorsFor(extra({ eq: '/about' }))).toEqual([
         expect.stringContaining("fields with 'eq' (got 'link')"),
      ])
      expect(errorsFor(extra({ has: '/about' }))).toEqual([
         expect.stringContaining("fields with 'has' (got 'link')"),
      ])
   })

   it('treats a link without address or target as empty, whatever its text', () => {
      const scope = { cta: { type: 'link' as const } }
      const visible = (cta: unknown) =>
         isFieldVisible(
            { label: 'P', type: 'text', showIf: { field: 'cta', empty: false } },
            { cta },
            scope
         )
      expect(visible(null)).toBe(false)
      expect(visible({ label: { en: 'Text only' }, newTab: true })).toBe(false)
      expect(visible({ entry: 'pages' })).toBe(false)
      expect(visible({ url: '/about' })).toBe(true)
      expect(visible({ entry: 'pages', id: 'about' })).toBe(true)
   })

   it('asks for a target on a required link only while it is visible', () => {
      const config = linkConfig()
      const schema = buildEntrySchema(
         {
            fields: {
               featured: { label: 'Featured', type: 'boolean' },
               cta: {
                  label: 'CTA',
                  type: 'link',
                  withLabel: true,
                  translatable: true,
                  required: true,
                  showIf: { field: 'featured', eq: true },
               },
            },
            config,
         },
         I18N
      )
      expect(schema.safeParse({ featured: false, cta: null }).success).toBe(true)
      const missing = schema.safeParse({ featured: true, cta: { label: { en: 'Go' } } })
      expect(missing.success).toBe(false)
      expect(
         schema.safeParse({ featured: true, cta: { url: '/x', label: { en: 'Go' } } }).success
      ).toBe(true)
   })
})
