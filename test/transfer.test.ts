import { describe, expect, it } from 'vitest'
import type { CmsEntry, CmsI18n } from '../src/runtime/shared/index'
import {
   canTransferCsv,
   csvColumns,
   csvImportSource,
   encodeCsv,
   entryRowsToCsv,
   exportFileName,
   exportRow,
   importRowTitle,
   importSource,
   IMPORT_MAX_ROWS,
   jsonImportSource,
   parseCsv,
} from '../src/runtime/shared/transfer'
import { validateImportRows } from '../src/runtime/server/utils/import'

const I18N: CmsI18n = { locales: ['it', 'de'], defaultLocale: 'it' }

const events: CmsEntry = {
   id: 'events',
   label: 'Events',
   kind: 'collection',
   titleField: 'title',
   drafts: true,
   fields: {
      title: { label: 'Title', type: 'text', translatable: true, required: true },
      seats: { label: 'Seats', type: 'number', integer: true },
      featured: { label: 'Featured', type: 'boolean' },
      visibility: {
         label: 'Visibility',
         type: 'select',
         options: ['public', { value: 'members', label: 'Club members' }],
      },
      topics: { label: 'Topics', type: 'select', options: ['a', 'b'], multiple: true },
      metadata: { label: 'Metadata', type: 'json' },
      poster: { label: 'Poster', type: 'media' },
      category: { label: 'Category', type: 'relation', to: 'categories' },
   },
   validate: (values) =>
      typeof values.seats === 'number' && values.seats > 100
         ? [{ field: 'seats', message: 'At most 100 seats' }]
         : [],
}

const articles: CmsEntry = {
   id: 'articles',
   label: 'Articles',
   kind: 'collection',
   titleField: 'title',
   fields: {
      title: { label: 'Title', type: 'text' },
      tags: { label: 'Tags', type: 'relation', to: 'tags', cardinality: 'many-to-many' },
   },
}

describe('csv encoding', () => {
   it('quotes only the cells that need it', () => {
      expect(encodeCsv([['a', 'b,c', 'say "hi"', 'line\nbreak', ' pad', '']])).toBe(
         'a,"b,c","say ""hi""","line\nbreak"," pad",\r\n'
      )
   })

   it('parses quotes, escaped quotes, CRLF, a BOM and blank lines', () => {
      const text = '﻿id,title\r\n1,"Hello, ""world"""\r\n\r\n2,"two\nlines"\n3,'
      expect(parseCsv(text)).toEqual([
         ['id', 'title'],
         ['1', 'Hello, "world"'],
         ['2', 'two\nlines'],
         ['3', ''],
      ])
   })

   it('round-trips any cell', () => {
      const rows = [['=1+1', '"', ',', '\r\n', 'ü ß 東京', '']]
      expect(parseCsv(encodeCsv(rows))).toEqual(rows)
   })

   it('reports an open quote', () => {
      expect(() => parseCsv('a,"b\n')).toThrow('A quoted cell is not closed')
   })
})

describe('csv columns', () => {
   it('gives one column per locale to translatable fields', () => {
      expect(csvColumns(events, I18N)).toEqual([
         'id',
         'title.it',
         'title.de',
         'seats',
         'featured',
         'visibility',
         'topics',
         'metadata',
         'poster',
         'category',
         'status',
         'createdAt',
         'updatedAt',
      ])
   })

   it('keeps a translatable field in one column without locales', () => {
      expect(csvColumns(events, { locales: [], defaultLocale: 'en' })[1]).toBe('title')
   })

   it('only allows flat entries', () => {
      expect(canTransferCsv(events)).toBe(true)
      expect(canTransferCsv(articles)).toBe(false)
      expect(
         canTransferCsv({
            fields: { body: { label: 'Body', type: 'blocks', blocks: {} } },
         })
      ).toBe(false)
      expect(importSource(articles, 'csv', 'id,title\n', I18N).errors).toEqual([
         'CSV needs an entry without blocks and many-to-many fields',
      ])
   })

   it('writes translatable values in their locale columns', () => {
      const row = exportRow(events, {
         id: 'events_1',
         title: { it: 'Fiera', de: 'Messe, "groß"' },
         seats: 40,
         featured: true,
         visibility: 'members',
         topics: ['a', 'b'],
         metadata: { level: 2 },
         poster: 'library/poster.webp',
         category: null,
         status: 'draft',
         createdAt: '2026-01-01T00:00:00.000Z',
         updatedAt: '2026-01-02T00:00:00.000Z',
         secret: 'not exported',
      })
      const csv = entryRowsToCsv(events, [row], I18N)
      expect(csv.startsWith('﻿')).toBe(true)
      expect(parseCsv(csv)[1]).toEqual([
         'events_1',
         'Fiera',
         'Messe, "groß"',
         '40',
         'true',
         'members',
         '["a","b"]',
         '{"level":2}',
         'library/poster.webp',
         '',
         'draft',
         '2026-01-01T00:00:00.000Z',
         '2026-01-02T00:00:00.000Z',
      ])
   })

   it('puts a plain stored value in the default locale column', () => {
      const csv = entryRowsToCsv(events, [{ id: 'x', title: 'Legacy' }], I18N)
      expect(parseCsv(csv)[1]!.slice(0, 3)).toEqual(['x', 'Legacy', ''])
   })
})

describe('csv import', () => {
   it('reads typed values and locale columns back', () => {
      const text = [
         'id,title.it,title.de,seats,featured,visibility,topics,metadata,status',
         'events_1,Fiera,,12,yes,members,"[""a""]","{""x"":1}",published',
         ',Sagra,Fest,,0,,,,',
      ].join('\n')
      const { rows, errors } = csvImportSource(events, text, I18N)
      expect(errors).toEqual([])
      expect(rows[0]).toEqual({
         index: 1,
         errors: [],
         values: {
            id: 'events_1',
            title: { it: 'Fiera' },
            seats: 12,
            featured: true,
            visibility: 'members',
            topics: ['a'],
            metadata: { x: 1 },
            status: 'published',
         },
      })
      expect(rows[1]!.values).toEqual({
         id: null,
         title: { it: 'Sagra', de: 'Fest' },
         seats: null,
         featured: false,
         visibility: null,
         topics: null,
         metadata: null,
         status: null,
      })
   })

   it('reports cells that do not parse', () => {
      const { rows } = csvImportSource(
         events,
         'title.it,seats,featured,metadata\nA,many,perhaps,{oops\nB,1',
         I18N
      )
      expect(rows[0]!.errors).toEqual([
         { path: 'seats', message: 'Not a number' },
         { path: 'featured', message: 'Not a boolean (true or false)' },
         { path: 'metadata', message: 'Invalid JSON' },
      ])
      expect(rows[1]!.errors).toEqual([{ path: '', message: 'Expected 4 cells, found 2' }])
   })

   it('rejects unknown and repeated columns', () => {
      expect(csvImportSource(events, 'title,title.it,title.it\nx,y,z', I18N).errors).toEqual([
         "Unknown column 'title'",
         "Column 'title.it' appears twice",
      ])
   })

   it('caps the number of rows', () => {
      const text = ['title.it', ...Array.from({ length: IMPORT_MAX_ROWS + 1 }, () => 'x')].join(
         '\n'
      )
      expect(csvImportSource(events, text, I18N).errors).toEqual([
         `The file has ${IMPORT_MAX_ROWS + 1} rows; the limit is ${IMPORT_MAX_ROWS}`,
      ])
   })
})

describe('json import', () => {
   it('accepts an array or an export file', () => {
      const items = [{ title: { it: 'A' } }]
      expect(jsonImportSource(events, JSON.stringify(items)).rows).toHaveLength(1)
      expect(
         jsonImportSource(events, JSON.stringify({ collection: 'events', items })).rows
      ).toHaveLength(1)
   })

   it('reports broken files, non-object rows and unknown fields', () => {
      expect(jsonImportSource(events, '{').errors[0]).toMatch(/^Invalid JSON/)
      expect(jsonImportSource(events, '{"rows":[]}').errors).toEqual([
         'Expected an array of entries or an object with an items array',
      ])
      const { rows } = jsonImportSource(events, '[1, {"title": {"it": "A"}, "colour": "red"}]')
      expect(rows[0]!.errors).toEqual([{ path: '', message: 'Not an object' }])
      expect(rows[1]!.errors).toEqual([{ path: 'colour', message: "Unknown field 'colour'" }])
   })
})

describe('import validation', () => {
   it('runs the entry schema and the validate hook on every row', () => {
      const { rows } = jsonImportSource(
         events,
         JSON.stringify([
            { id: 'events_1', title: { it: 'Fiera' }, seats: 10, createdAt: 'x' },
            { title: { de: 'Nur Deutsch' }, seats: 1.5, visibility: 'secret' },
            { id: 'bad id!', title: { it: 'Grande' }, seats: 500 },
         ])
      )
      const prepared = validateImportRows(events, rows, I18N)
      expect(prepared[0]).toMatchObject({ id: 'events_1', errors: [] })
      expect(prepared[0]!.values).toMatchObject({ title: { it: 'Fiera' }, seats: 10 })
      expect(prepared[1]!.values).toBeNull()
      expect(prepared[1]!.errors.map((issue) => issue.path)).toEqual([
         'title',
         'seats',
         'visibility',
      ])
      expect(prepared[2]!.errors).toEqual([
         { path: 'id', message: 'Invalid id: use letters, numbers, _ and -, up to 128 characters' },
         { path: 'seats', message: 'At most 100 seats' },
      ])
   })

   it('does not repeat a cell error as a schema error', () => {
      const { rows } = csvImportSource(events, 'title.it,seats\nA,lots', I18N)
      expect(validateImportRows(events, rows, I18N)[0]!.errors).toEqual([
         { path: 'seats', message: 'Not a number' },
      ])
   })
})

describe('transfer helpers', () => {
   it('names the export file after the entry and the day', () => {
      expect(exportFileName('events', 'csv', new Date('2026-10-12T10:00:00Z'))).toBe(
         'events-2026-10-12.csv'
      )
   })

   it('titles a preview row in the default locale or with a select label', () => {
      expect(importRowTitle(events, { title: { de: 'B', it: 'A' } }, 'it')).toBe('A')
      expect(
         importRowTitle({ ...events, titleField: 'visibility' }, { visibility: 'members' }, 'it')
      ).toBe('Club members')
      expect(importRowTitle(events, { title: null }, 'it')).toBeNull()
   })
})
