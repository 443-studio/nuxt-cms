import { buildSchema, parse, validate } from 'graphql'
import { describe, expect, it } from 'vitest'
import { collectBlockComponents } from '../src/blocks-codegen'
import { collectionQuery, pageQuery } from '../src/queries-codegen'
import { validateConfig } from '../src/schema-codegen'
import { renderTypesFile } from '../src/types-codegen'
import { createDepthRule } from '../src/runtime/server/utils/graphql-depth'
import { mediaReferences } from '../src/runtime/server/utils/media-references'
import { decodePageRow, encodePageRows } from '../src/runtime/server/utils/page-rows'
import { cmsBlockAnnotation, cmsBlockScope } from '../src/runtime/app/blocks/resolve'
import { blockSignature } from '../src/runtime/shared/block-signature'
import { pasteBlocks } from '../src/runtime/shared/clipboard'
import { renderGraphqlSdl } from '../src/runtime/shared/graphql-sdl'
import type {
   BlockConfig,
   CmsConfig,
   CmsEntry,
   CmsI18n,
   FieldConfig,
} from '../src/runtime/shared/index'
import {
   MAX_BLOCKS_DEPTH,
   blockAt,
   blockListAt,
   blockPathDepth,
   blockReferenceLabel,
   blockSchemaPath,
   blockTypeName,
   blocksFieldAt,
   blocksFieldAtSchemaPath,
   blocksFieldPaths,
   blocksFieldTypeName,
   formatBlockPath,
   hasTranslatableBlockFields,
   insertBlocks,
   isBlockItemPath,
   isBlockListPath,
   localizeBlocks,
   mapBlocks,
   moveBlock,
   normalizeCmsConfig,
   parentBlockPath,
   parseBlockPath,
   publicBlocks,
   removeBlock,
   resolveBlockPath,
   resolveBlocksMedia,
   updateBlockAt,
   walkBlocks,
} from '../src/runtime/shared/index'
import { linkReferences } from '../src/runtime/shared/links'
import { blockSummary } from '../src/runtime/shared/preview'
import { searchCmsLabels } from '../src/runtime/shared/search'
import {
   clearTranslations,
   copyTranslations,
   translationProgress,
} from '../src/runtime/shared/translations'
import { buildEntrySchema, entryValidationIssues } from '../src/runtime/shared/validation'

const I18N: CmsI18n = { locales: ['en', 'it'], defaultLocale: 'en' }

function leafBlocks(): Record<string, BlockConfig> {
   return {
      text: {
         label: 'Text',
         component: 'SectionText',
         fields: {
            heading: { label: 'Heading', type: 'text', translatable: true, max: 20 },
            body: { label: 'Body', type: 'richtext' },
         },
      },
      image: {
         label: 'Image',
         fields: { photo: { label: 'Photo', type: 'media', mediaType: 'image' } },
      },
      cta: {
         label: 'Call to action',
         fields: { link: { label: 'Link', type: 'link', withLabel: true, translatable: true } },
      },
   }
}

function columnsBlock(inner: Record<string, BlockConfig> = leafBlocks()): BlockConfig {
   return {
      label: 'Columns',
      component: 'SectionColumns',
      layout: [['count', 'items']],
      fields: {
         count: { label: 'Count', type: 'select', options: ['2', '3'] },
         items: { label: 'Items', type: 'blocks', blocks: inner, min: 2, max: 3 },
         note: {
            label: 'Note',
            type: 'text',
            showIf: { field: 'items', empty: false },
         },
      },
   }
}

function nestedConfig(): CmsConfig {
   return normalizeCmsConfig(
      {
         news: {
            id: 'news',
            label: 'News',
            kind: 'collection',
            titleField: 'title',
            fields: {
               title: { label: 'Title', type: 'text', required: true },
               body: {
                  label: 'Body',
                  type: 'blocks',
                  blocks: { ...leafBlocks(), columns: columnsBlock() },
               },
            },
         },
      } as CmsConfig,
      I18N
   )
}

function recursiveSet(): Record<string, BlockConfig> {
   const set: Record<string, BlockConfig> = {
      ...leafBlocks(),
      columns: {
         label: 'Columns',
         fields: { items: { label: 'Items', type: 'blocks', blocks: {} } },
      },
   }
   set.columns!.fields.items!.blocks = set
   return set
}

type TestBlock = Record<string, unknown> & { type: string; items?: TestBlock[] }

const values = (): { title: string; body: TestBlock[] } => ({
   title: 'Hello',
   body: [
      { type: 'text', heading: { en: 'Intro' } },
      {
         type: 'columns',
         count: '2',
         items: [
            { type: 'text', heading: { en: 'Left', it: 'Sinistra' }, body: '<p>Left side</p>' },
            { type: 'image', photo: 'photos/right.webp' },
            { type: 'cta', link: { entry: 'news', id: 'n2', label: { en: 'Read' } } },
         ],
      },
   ],
})

describe('block paths', () => {
   it('formats and parses item and list paths', () => {
      expect(formatBlockPath(['body', 2, 'items', 0])).toBe('body.2.items.0')
      expect(parseBlockPath('body.2.items.0')).toEqual(['body', 2, 'items', 0])
      expect(parseBlockPath('body.2.items')).toEqual(['body', 2, 'items'])
      expect(parseBlockPath('body.x')).toBeNull()
      expect(parseBlockPath('2.body')).toBeNull()
      expect(parseBlockPath('')).toBeNull()
      expect(isBlockItemPath(['body', 2])).toBe(true)
      expect(isBlockItemPath(['body', 2, 'items'])).toBe(false)
      expect(isBlockListPath(['body', 2, 'items'])).toBe(true)
      expect(isBlockListPath(['body', -1, 'items'])).toBe(false)
      expect(blockPathDepth(['body', 2, 'items', 0])).toBe(2)
      expect(parentBlockPath(['body', 2, 'items', 0])).toEqual(['body', 2])
      expect(parentBlockPath(['body', 2])).toBeNull()
      expect(blockReferenceLabel(['body', 1, 'items', 0], 'photo')).toBe('body[1].items[0].photo')
   })

   it('reads blocks and their config by path', () => {
      const config = nestedConfig()
      const fields = config.news!.fields
      const data = values()
      expect(blockAt(data, ['body', 1, 'items', 1])).toEqual({
         type: 'image',
         photo: 'photos/right.webp',
      })
      expect(blockAt(data, ['body', 1, 'items', 9])).toBeNull()
      expect(blockListAt(data, ['body', 1, 'items'])).toHaveLength(3)
      expect(blocksFieldAt(fields, data, ['body', 1, 'items'])?.label).toBe('Items')
      expect(blocksFieldAt(fields, data, ['body', 0, 'items'])).toBeNull()
      const location = resolveBlockPath(fields, data, ['body', 1, 'items', 0])
      expect(location?.block?.label).toBe('Text')
      expect(location?.index).toBe(0)
      expect(location?.depth).toBe(2)
      expect(blockSchemaPath(fields, data, ['body', 1, 'items', 0])).toEqual([
         'body',
         'columns',
         'items',
      ])
      expect(blocksFieldAtSchemaPath(fields, 'body.columns.items')?.max).toBe(3)
      expect(blocksFieldAtSchemaPath(fields, 'body.text.heading')).toBeNull()
      expect(blocksFieldAtSchemaPath(fields, 'body.columns')).toBeNull()
   })

   it('updates, inserts and removes without touching unrelated branches', () => {
      const data = values()
      const updated = updateBlockAt(data, ['body', 1, 'items', 0], (item) => ({
         ...item,
         body: '<p>New</p>',
      }))
      expect(blockAt(updated, ['body', 1, 'items', 0])?.body).toBe('<p>New</p>')
      expect((updated.body as unknown[])[0]).toBe(data.body[0])
      expect(data.body[1]!.items![0]!.body).toBe('<p>Left side</p>')

      const inserted = insertBlocks(data, ['body', 1, 'items'], 1, [{ type: 'text' }])
      expect(blockListAt(inserted, ['body', 1, 'items'])!.map((item) => item.type)).toEqual([
         'text',
         'text',
         'image',
         'cta',
      ])
      expect(insertBlocks(data, ['body', 5, 'items'], 0, [{ type: 'text' }])).toBe(data)
      const fresh = insertBlocks(data, ['body', 0, 'items'], 0, [{ type: 'image' }])
      expect(blockListAt(fresh, ['body', 0, 'items'])).toEqual([{ type: 'image' }])

      const removed = removeBlock(data, ['body', 1, 'items', 1])
      expect(blockListAt(removed, ['body', 1, 'items'])!.map((item) => item.type)).toEqual([
         'text',
         'cta',
      ])
      const emptied = removeBlock({ body: [{ type: 'text' }] }, ['body', 0])
      expect(emptied.body).toBeNull()
   })

   it('moves blocks within a list, out of a list and into a list', () => {
      const data = values()
      const later = moveBlock(data, ['body', 1, 'items', 0], ['body', 1, 'items'], 3)
      expect(blockListAt(later, ['body', 1, 'items'])!.map((item) => item.type)).toEqual([
         'image',
         'cta',
         'text',
      ])
      const out = moveBlock(data, ['body', 1, 'items', 1], ['body'], 0)
      expect((out.body as { type: string }[]).map((item) => item.type)).toEqual([
         'image',
         'text',
         'columns',
      ])
      const into = moveBlock(data, ['body', 0], ['body', 1, 'items'], 0)
      expect((into.body as { type: string }[]).map((item) => item.type)).toEqual(['columns'])
      expect(blockListAt(into, ['body', 0, 'items'])!.map((item) => item.type)).toEqual([
         'text',
         'text',
         'image',
         'cta',
      ])
      expect(moveBlock(data, ['body', 1], ['body', 1, 'items'], 0)).toBe(data)
      expect(moveBlock(data, ['body', 0], ['body'], 0)).toBe(data)
   })

   it('walks blocks at every depth with their paths and configs', () => {
      const config = nestedConfig()
      const seen: string[] = []
      walkBlocks(config.news!.fields, values(), ({ path, block, schemaPath, depth }) => {
         seen.push(`${formatBlockPath(path)}:${block.label}:${schemaPath.join('.')}:${depth}`)
      })
      expect(seen).toEqual([
         'body.0:Text:body:1',
         'body.1:Columns:body:1',
         'body.1.items.0:Text:body.columns.items:2',
         'body.1.items.1:Image:body.columns.items:2',
         'body.1.items.2:Call to action:body.columns.items:2',
      ])
      const skipped: string[] = []
      walkBlocks(config.news!.fields, values(), ({ path }) => {
         skipped.push(formatBlockPath(path))
         return false
      })
      expect(skipped).toEqual(['body.0', 'body.1'])
   })

   it('maps blocks recursively and drops items', () => {
      const config = nestedConfig()
      const field = config.news!.fields.body!
      const mapped = mapBlocks(field, values().body, (item) =>
         item.type === 'image' ? null : { ...item, seen: true }
      ) as Record<string, unknown>[]
      expect(mapped.map((item) => item.seen)).toEqual([true, true])
      expect((mapped[1]!.items as Record<string, unknown>[]).map((item) => item.type)).toEqual([
         'text',
         'cta',
      ])
   })
})

describe('nested block config', () => {
   it('accepts a nested blocks field with layout, showIf and min/max', () => {
      expect(validateConfig(nestedConfig(), I18N)).toEqual([])
   })

   it('rejects nesting deeper than the limit', () => {
      const deepest = { leaf: { label: 'Leaf', fields: { x: { label: 'X', type: 'text' } } } }
      const level3: BlockConfig = {
         label: 'L3',
         fields: { inner: { label: 'Inner', type: 'blocks', blocks: deepest } as FieldConfig },
      }
      const level2: BlockConfig = {
         label: 'L2',
         fields: { inner: { label: 'Inner', type: 'blocks', blocks: { level3 } } },
      }
      const config = {
         news: {
            id: 'news',
            label: 'News',
            kind: 'single',
            fields: {
               body: {
                  label: 'Body',
                  type: 'blocks',
                  blocks: {
                     level2: {
                        label: 'L1',
                        fields: { inner: { label: 'Inner', type: 'blocks', blocks: { level2 } } },
                     },
                  },
               },
            },
         },
      } as CmsConfig
      expect(validateConfig(normalizeCmsConfig(config, I18N), I18N)).toEqual([
         `cms.config entry 'news', field 'body', block 'level2', field 'inner', block 'level2', field 'inner', block 'level3', field 'inner': blocks nest at most ${MAX_BLOCKS_DEPTH} levels deep (a blocks field in a block in a blocks field counts as 2)`,
      ])
   })

   it('checks nested blocks like top-level ones', () => {
      const config = nestedConfig()
      const items = config.news!.fields.body!.blocks!.columns!.fields.items!
      items.min = 5
      items.translatable = true
      items.blocks!.text!.fields.key = { label: 'Key', type: 'text' }
      items.blocks!.text!.layout = ['nope']
      items.blocks!.image!.fields.photo!.showIf = { field: 'ghost', empty: true }
      items.blocks!.cta!.fields.rel = { label: 'Rel', type: 'relation', to: 'news' }
      const errors = validateConfig(config, I18N)
      const at = "cms.config entry 'news', field 'body', block 'columns', field 'items'"
      expect(errors).toEqual(
         expect.arrayContaining([
            `${at}: blocks fields cannot be translatable`,
            `${at}: min (5) cannot be greater than max (3)`,
            `${at}, block 'text', field 'key': 'key' cannot be a prop of the block component, rename it`,
            `${at}, block 'cta', field 'rel': relation fields are not supported inside blocks`,
         ])
      )
      expect(
         errors.some((error) => error.startsWith(`${at}, block 'text'`) && error.includes("'nope'"))
      ).toBe(true)
      expect(errors.some((error) => error.startsWith(`${at}, block 'image', field 'photo'`))).toBe(
         true
      )
   })

   it('bounds a block set that contains itself at the depth limit', () => {
      const config = normalizeCmsConfig(
         {
            pages: {
               id: 'pages',
               label: 'Pages',
               kind: 'single',
               fields: { body: { label: 'Body', type: 'blocks', blocks: recursiveSet() } },
            },
         } as CmsConfig,
         I18N
      )
      expect(validateConfig(config, I18N)).toEqual([])
      const paths = blocksFieldPaths(config.pages!.fields).map((visit) =>
         visit.schemaPath.join('.')
      )
      expect(paths).toEqual(['body', 'body.columns.items', 'body.columns.items.columns.items'])
      const deepest = blocksFieldAtSchemaPath(
         config.pages!.fields,
         'body.columns.items.columns.items'
      )!
      expect(Object.keys(deepest.blocks!)).toEqual(['text', 'image', 'cta'])
      const again = normalizeCmsConfig(config, I18N)
      expect(again.pages!.fields.body).toBe(config.pages!.fields.body)
      expect(renderGraphqlSdl(config)).toContain('PagesBodyColumnsItemsColumnsItemsText')
   })

   it('reports clashing generated type names', () => {
      const config = nestedConfig()
      config.news!.fields.body!.blocks!.columnsItemsText = {
         label: 'Clash',
         fields: { x: { label: 'X', type: 'text' } },
      }
      expect(validateConfig(config, I18N)).toEqual([
         "cms.config: GraphQL type name 'NewsBodyColumnsItemsText' of block 'text' of 'news.body.columns.items' clashes with block 'columnsItemsText' of 'news.body', rename a block or field",
      ])
   })
})

describe('nested block codegen', () => {
   it('names nested interfaces, types and props after their path', () => {
      expect(blocksFieldTypeName('news', ['body', 'columns', 'items'])).toBe(
         'NewsBodyColumnsItemsBlock'
      )
      expect(blockTypeName('news', 'body.columns.items', 'text')).toBe('NewsBodyColumnsItemsText')
      expect(blockTypeName('news', 'body', 'text')).toBe('NewsBodyText')
   })

   it('renders nested GraphQL types and a query within the depth limit', () => {
      const config = nestedConfig()
      const sdl = renderGraphqlSdl(config)
      expect(sdl).toContain('interface NewsBodyColumnsItemsBlock {')
      expect(sdl).toContain('  items: [NewsBodyColumnsItemsBlock!]')
      expect(sdl).toContain(
         'type NewsBodyColumnsItemsImage implements NewsBodyColumnsItemsBlock {\n  type: String!\n  photo: CmsMedia\n}'
      )
      const query = collectionQuery(config, 'news', config.news!)
      expect(query).toContain(
         'items { __typename type ... on NewsBodyColumnsItemsText { heading body } ... on NewsBodyColumnsItemsImage { photo { key url type alt folder mime size width height focalX focalY } }'
      )
      const errors = validate(buildSchema(sdl), parse(query), [createDepthRule(8)])
      expect(errors.map((error) => error.message)).toEqual([])
   })

   it('selects the deepest level of a recursive set in page queries', () => {
      const pages: CmsEntry = {
         id: 'pages',
         label: 'Pages',
         kind: 'page',
         fields: { body: { label: 'Body', type: 'blocks', blocks: recursiveSet() } },
         pages: [{ path: '/', key: 'home', label: 'Home' }],
      }
      const config = normalizeCmsConfig({ pages } as CmsConfig, I18N)
      const query = pageQuery(config, 'pages', config.pages!, '/')
      expect(query).toContain('... on PagesBodyColumnsItemsColumnsItemsText')
      expect(query).not.toContain('PagesBodyColumnsItemsColumnsItemsColumns')
      const errors = validate(buildSchema(renderGraphqlSdl(config)), parse(query), [
         createDepthRule(8),
      ])
      expect(errors).toEqual([])
   })

   it('types nested props and maps their components', () => {
      const config = nestedConfig()
      const types = renderTypesFile(config)
      expect(types).toContain('export interface NewsBodyColumnsProps {')
      expect(types).toContain('  items: NewsBodyColumnsItemsBlock[] | null')
      expect(types).toContain(
         'export type NewsBodyColumnsItemsBlock = NewsBodyColumnsItemsText | NewsBodyColumnsItemsImage | NewsBodyColumnsItemsCta'
      )
      expect(types).toContain('    "body.columns.items": {')
      expect(collectBlockComponents(config).map((ref) => ref.typeName)).toEqual([
         'NewsBodyText',
         'NewsBodyColumns',
         'NewsBodyColumnsItemsText',
      ])
   })
})

describe('nested block validation', () => {
   const schema = () => buildEntrySchema(nestedConfig().news!, I18N)

   it('reports errors with the full path of the nested field', () => {
      const data = values()
      data.body[1]!.items![0]!.heading = { en: 'x'.repeat(30) }
      const result = schema().safeParse(data)
      expect(result.success).toBe(false)
      expect(result.error!.issues.map((issue) => issue.path.join('.'))).toEqual([
         'body.1.items.0.heading',
      ])
   })

   it('checks min and max of nested blocks fields', () => {
      const data = values()
      data.body[1]!.items = data.body[1]!.items!.slice(0, 1)
      const result = schema().safeParse(data)
      expect(result.error!.issues).toEqual([
         expect.objectContaining({ path: ['body', 1, 'items'], message: 'Add at least 2 blocks' }),
      ])
      data.body[1]!.items = [
         { type: 'image' },
         { type: 'image' },
         { type: 'image' },
         { type: 'image' },
      ]
      expect(schema().safeParse(data).error!.issues[0]!.message).toBe('Add at most 3 blocks')
   })

   it('rejects unknown nested block types and keeps nested values', () => {
      const data = values()
      const parsed = schema().parse(data) as { body: Record<string, unknown>[] }
      expect((parsed.body[1]!.items as unknown[]).length).toBe(3)
      data.body[1]!.items![0]!.type = 'columns'
      expect(schema().safeParse(data).success).toBe(false)
   })

   it('applies required while visible inside nested blocks', () => {
      const config = nestedConfig()
      const inner = config.news!.fields.body!.blocks!.columns!.fields.items!.blocks!
      inner.text!.fields.body = {
         label: 'Body',
         type: 'richtext',
         required: true,
         showIf: { field: 'heading', empty: false },
      }
      const data = values()
      data.body[1]!.items![0]!.body = null as unknown as string
      const result = buildEntrySchema(config.news!, I18N).safeParse(data)
      expect(result.error!.issues.map((issue) => issue.path.join('.'))).toEqual([
         'body.1.items.0.body',
      ])
   })

   it('runs block validate hooks at every depth with the item and its path', () => {
      const config = nestedConfig()
      const calls: string[] = []
      config.news!.fields.body!.blocks!.columns!.fields.items!.blocks!.image!.validate = (
         item,
         { index, blockPath }
      ) => {
         calls.push(`${blockPath}:${index}:${String(item.photo)}`)
         return [{ field: 'photo', message: 'Pick a landscape photo' }]
      }
      const issues = entryValidationIssues(config.news!, values(), I18N)
      expect(calls).toEqual(['body.1.items.1:1:photos/right.webp'])
      expect(issues).toEqual([
         {
            path: ['body', 1, 'items', 1, 'photo'],
            message: 'Pick a landscape photo',
            level: 'error',
         },
      ])
      const result = buildEntrySchema(config.news!, I18N).safeParse(values())
      expect(result.error!.issues[0]!.path).toEqual(['body', 1, 'items', 1, 'photo'])
   })
})

describe('nested page storage', () => {
   function pageEntry(): CmsEntry {
      return normalizeCmsConfig(
         {
            pages: {
               id: 'pages',
               label: 'Pages',
               kind: 'page',
               fields: {
                  title: { label: 'Title', type: 'text' },
                  body: {
                     label: 'Body',
                     type: 'blocks',
                     blocks: { ...leafBlocks(), columns: columnsBlock() },
                  },
               },
               pages: [{ path: '/', key: 'home', label: 'Home' }],
            },
         } as CmsConfig,
         I18N
      ).pages!
   }

   it('stores a nested blocks subfield as one JSON row and reads it back', () => {
      const entry = pageEntry()
      const data = values()
      const encoded = encodePageRows(entry, 'home', { title: 'Home', body: data.body })
      const nestedRow = encoded.fields.find((row) => row.key === 'body.items')
      expect(nestedRow).toEqual({
         pageId: 'home',
         key: 'body.items',
         position: 1,
         value: JSON.stringify(data.body[1]!.items),
      })
      expect(encoded.fieldKeys).toContain('body.items')
      expect(encoded.media).toEqual([])
      const row = {
         id: 'home',
         path: '/',
         $fields: JSON.stringify(encoded.fields.map((f) => [f.key, f.position, f.value])),
         $media: JSON.stringify(encoded.media.map((m) => [m.key, m.position, m.mediaKey])),
      }
      const decoded = decodePageRow(entry, row)
      expect(decoded.body).toEqual([
         { type: 'text', heading: { en: 'Intro' }, body: null },
         { type: 'columns', count: '2', items: data.body[1]!.items, note: null },
      ])
      expect(mediaReferences(entry.fields, decoded)).toEqual([
         { field: 'body[1].items[1].photo', key: 'photos/right.webp' },
      ])
   })

   it('reads page rows saved before the nested field existed', () => {
      const entry = pageEntry()
      const row = {
         id: 'home',
         path: '/',
         $fields: JSON.stringify([
            ['body._type', 0, 'columns'],
            ['body.count', 0, '3'],
         ]),
         $media: '[]',
      }
      expect(decodePageRow(entry, row).body).toEqual([
         { type: 'columns', count: '3', items: null, note: null },
      ])
   })
})

describe('nested block consumers', () => {
   it('finds media and link references at every depth', () => {
      const fields = nestedConfig().news!.fields
      expect(mediaReferences(fields, values())).toEqual([
         { field: 'body[1].items[1].photo', key: 'photos/right.webp' },
      ])
      expect(linkReferences(fields, values())).toEqual([
         { field: 'body[1].items[2].link', entry: 'news', id: 'n2' },
      ])
   })

   it('drops hidden items, localizes and resolves media at every depth', () => {
      const field = nestedConfig().news!.fields.body!
      const data = values().body
      ;(data[1]!.items![1] as Record<string, unknown>).hidden = true
      const visible = publicBlocks(field, data) as Record<string, unknown>[]
      expect((visible[1]!.items as unknown[]).length).toBe(2)
      const localized = localizeBlocks(field, visible, 'it', 'en') as Record<string, unknown>[]
      expect((localized[1]!.items as Record<string, unknown>[])[0]!.heading).toBe('Sinistra')
      expect(localized[0]!.heading).toBe('Intro')
      const media = resolveBlocksMedia(field, data, (key) => ({ key })) as Record<string, unknown>[]
      expect((media[1]!.items as Record<string, unknown>[])[1]!.photo).toEqual({
         key: 'photos/right.webp',
      })
      expect(hasTranslatableBlockFields(field)).toBe(true)
   })

   it('counts, copies and clears translations inside nested blocks', () => {
      const fields = nestedConfig().news!.fields
      const progress = translationProgress(fields, values(), I18N)
      expect(progress.it).toMatchObject({ filled: 1, total: 3 })
      const copied = copyTranslations(fields, values(), I18N, { from: 'en', to: 'it' })
      expect(copied.count).toBe(2)
      const nested = blockAt(copied.values, ['body', 1, 'items', 2])!
      expect(nested.link).toEqual({ entry: 'news', id: 'n2', label: { en: 'Read', it: 'Read' } })
      const cleared = clearTranslations(fields, values(), I18N, 'it')
      expect(cleared.count).toBe(1)
      expect(blockAt(cleared.values, ['body', 1, 'items', 0])!.heading).toEqual({ en: 'Left' })
   })

   it('pastes nested blocks with only the types of each level', () => {
      const field = nestedConfig().news!.fields.body!
      const result = pasteBlocks(
         [],
         0,
         [
            {
               type: 'columns',
               count: '2',
               items: [
                  { type: 'text', heading: 'Plain', extra: 1 },
                  { type: 'columns' },
                  { type: 'image', photo: 'a.webp', hidden: true },
               ],
            },
         ],
         field,
         I18N
      )
      expect(result.list).toEqual([
         {
            type: 'columns',
            count: '2',
            note: null,
            items: [
               { type: 'text', heading: { en: 'Plain' }, body: null },
               { type: 'image', photo: 'a.webp', hidden: true },
            ],
         },
      ])
   })

   it('includes nested shapes in block signatures', () => {
      const plain = columnsBlock()
      const changed = columnsBlock({
         ...leafBlocks(),
         quote: { label: 'Quote', fields: { text: { label: 'Text', type: 'text' } } },
      })
      expect(blockSignature(plain)).not.toBe(blockSignature(changed))
      expect(blockSignature(plain)).toBe(blockSignature(columnsBlock()))
      expect(blockSignature(leafBlocks().image!)).toBe(
         blockSignature({
            fields: { photo: { label: 'Other', type: 'media', mediaType: 'image' } },
         })
      )
   })

   it('summarizes a container block from its first nested block', () => {
      const block = columnsBlock()
      expect(blockSummary(block, values().body[1]!, 'en', 'en')).toBe('Left')
      expect(blockSummary(block, { type: 'columns', items: [{ type: 'image' }] }, 'en', 'en')).toBe(
         '1 block'
      )
      expect(blockSummary(block, { type: 'columns' }, 'en', 'en')).toBe('')
   })

   it('lists nested block labels in the admin search', () => {
      const hits = searchCmsLabels(nestedConfig(), 'call to')
      expect(hits.hits.map((hit) => hit.fieldLabel)).toContain(
         'Body › Columns › Items › Call to action'
      )
   })
})

describe('nested block rendering', () => {
   it('derives the scope of nested CmsBlocks from the parent block', () => {
      const top = cmsBlockScope({ entry: 'news', field: 'body' })
      expect(top).toEqual({ entry: 'news', schemaPath: 'body', listPath: 'body' })
      const items = [{ type: 'text' }]
      const parent = {
         entry: 'news',
         schemaPath: 'body',
         itemPath: 'body.1',
         type: 'columns',
         props: { count: '2', items },
      }
      expect(cmsBlockScope({}, parent, items)).toEqual({
         entry: 'news',
         schemaPath: 'body.columns.items',
         listPath: 'body.1.items',
      })
      expect(
         cmsBlockScope({ field: 'items' }, { ...parent, schemaPath: null }, [...items])
      ).toEqual({ entry: 'news', schemaPath: null, listPath: 'body.1.items' })
   })

   it('marks top-level roots with their index and nested roots with their path', () => {
      expect(
         cmsBlockAnnotation({ index: 1, type: 'columns' }, { listPath: 'body' }, false)
      ).toEqual({
         'data-cms-block': 1,
         'data-cms-block-path': 'body.1',
         'data-cms-block-type': 'columns',
      })
      expect(
         cmsBlockAnnotation({ index: 0, type: 'text' }, { listPath: 'body.1.items' }, true)
      ).toEqual({
         'data-cms-block-path': 'body.1.items.0',
         'data-cms-block-parent': 'body.1',
         'data-cms-block-type': 'text',
      })
   })
})
