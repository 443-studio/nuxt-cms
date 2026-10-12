import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import { boolean as pgBoolean, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { describe, expect, it } from 'vitest'
import type { CmsEntry } from '../src/runtime/shared/index'
import { isListFilterField, listFilterKeys } from '../src/runtime/shared/index'
import {
   entryListFilterKeys,
   listFilterOptions,
   listFilterQuery,
   listFilterValueLabel,
   parseListFilters,
   readListFilterQuery,
   withoutListFilterQuery,
} from '../src/runtime/shared/list-filters'
import { listFilterConditions, listWhere } from '../src/runtime/server/utils/list-query'
import { validateConfig } from '../src/schema-codegen'
import { I18N, sampleConfig } from './fixtures'

const events: CmsEntry = {
   id: 'events',
   label: 'Events',
   kind: 'collection',
   titleField: 'title',
   drafts: true,
   fields: {
      title: { label: 'Title', type: 'text' },
      featured: { label: 'Featured', type: 'boolean' },
      visibility: {
         label: 'Visibility',
         type: 'select',
         options: ['public', { value: 'members', label: 'Club members' }],
      },
      topics: { label: 'Topics', type: 'select', options: ['a', 'b'], multiple: true },
      category: { label: 'Category', type: 'relation', to: 'categories' },
      tags: { label: 'Tags', type: 'relation', to: 'tags', cardinality: 'many-to-many' },
      seats: { label: 'Seats', type: 'number' },
   },
}

const sqliteEvents = sqliteTable('events', {
   id: text('id').primaryKey(),
   title: text('title'),
   featured: integer('featured', { mode: 'boolean' }),
   visibility: text('visibility'),
   category: text('category'),
   status: text('status'),
   createdAt: text('created_at'),
})

const pgEvents = pgTable('events', {
   id: pgText('id').primaryKey(),
   title: pgText('title'),
   featured: pgBoolean('featured'),
   visibility: pgText('visibility'),
   category: pgText('category'),
   status: pgText('status'),
   createdAt: pgText('created_at'),
})

function sqliteQuery(filters: Record<string, string>, search?: string) {
   const db = drizzle(new Database(':memory:'))
   const where = listWhere('sqlite', events, sqliteEvents, { search, filters })
   return db.select().from(sqliteEvents).where(where).toSQL()
}

function pgQuery(filters: Record<string, string>, search?: string) {
   const table = pgEvents as unknown as SQLiteTable
   const where = listWhere('postgres', events, table, { search, filters })
   return drizzlePg
      .mock()
      .select()
      .from(pgEvents)
      .where(where as never)
      .toSQL()
}

describe('filter eligibility', () => {
   it('accepts single selects, booleans and single relations', () => {
      expect(isListFilterField(events.fields.featured!)).toBe(true)
      expect(isListFilterField(events.fields.visibility!)).toBe(true)
      expect(isListFilterField(events.fields.category!)).toBe(true)
      expect(isListFilterField(events.fields.topics!)).toBe(false)
      expect(isListFilterField(events.fields.tags!)).toBe(false)
      expect(isListFilterField(events.fields.seats!)).toBe(false)
   })

   it('offers every eligible field plus status without a config', () => {
      expect(entryListFilterKeys(events)).toEqual(['featured', 'visibility', 'category', 'status'])
   })

   it('keeps only the visible columns when they are given', () => {
      expect(entryListFilterKeys(events, ['title', 'visibility', 'status'])).toEqual([
         'visibility',
         'status',
      ])
   })

   it('uses list.filters when it is set', () => {
      const entry = { ...events, list: { filters: ['category', 'featured', 'seats'] } }
      expect(entryListFilterKeys(entry, ['title'])).toEqual(['category', 'featured'])
      expect(listFilterKeys(entry.fields, { filters: [] })).toEqual([])
   })

   it('has no filters on singles and pages', () => {
      expect(entryListFilterKeys({ ...events, kind: 'single' })).toEqual([])
      expect(entryListFilterKeys({ ...events, kind: 'page' })).toEqual([])
   })

   it('lists options with select labels', () => {
      expect(listFilterOptions(events, 'visibility')).toEqual([
         { value: 'public', label: 'public' },
         { value: 'members', label: 'Club members' },
      ])
      expect(listFilterOptions(events, 'status')?.map((option) => option.value)).toEqual([
         'draft',
         'published',
      ])
      expect(listFilterOptions(events, 'category')).toBeNull()
      expect(listFilterValueLabel(events, 'visibility', 'members')).toBe('Club members')
      expect(listFilterValueLabel(events, 'featured', 'false')).toBe('No')
   })
})

describe('filter query', () => {
   it('reads and writes the prefixed query keys', () => {
      const query = listFilterQuery({ visibility: 'members', featured: '' })
      expect(query).toEqual({ 'filter.visibility': 'members' })
      expect(readListFilterQuery({ ...query, page: '2', 'filter.': 'x' })).toEqual({
         visibility: 'members',
      })
      expect(withoutListFilterQuery({ ...query, field: 'title' })).toEqual({ field: 'title' })
   })

   it('accepts known fields with allowed values', () => {
      expect(
         parseListFilters(events, {
            'filter.visibility': 'members',
            'filter.featured': 'false',
            'filter.category': 'categories_1',
            'filter.status': 'draft',
            limit: '10',
         })
      ).toEqual({
         filters: {
            visibility: 'members',
            featured: 'false',
            category: 'categories_1',
            status: 'draft',
         },
         errors: [],
      })
   })

   it('skips empty values', () => {
      expect(parseListFilters(events, { 'filter.visibility': ' ' })).toEqual({
         filters: {},
         errors: [],
      })
   })

   it('rejects unknown fields, unknown values and repeated keys', () => {
      const { filters, errors } = parseListFilters(events, {
         'filter.title': 'x',
         'filter.topics': 'a',
         'filter.visibility': 'secret',
         'filter.featured': 'maybe',
         'filter.status': 'archived',
         'filter.category': ['a', 'b'],
      })
      expect(filters).toEqual({})
      expect(errors).toEqual([
         "Unknown filter 'title'",
         "Unknown filter 'topics'",
         "Invalid value for filter 'visibility'",
         "Invalid value for filter 'featured'",
         "Invalid value for filter 'status'",
         "Filter 'category' takes one value",
      ])
   })

   it('rejects an overlong relation id', () => {
      expect(parseListFilters(events, { 'filter.category': 'x'.repeat(257) }).errors).toEqual([
         "Invalid value for filter 'category'",
      ])
   })

   it('rejects a field that list.filters leaves out', () => {
      const entry = { ...events, list: { filters: ['visibility'] } }
      expect(parseListFilters(entry, { 'filter.featured': 'true' }).errors).toEqual([
         "Unknown filter 'featured'",
      ])
   })
})

describe('filter conditions', () => {
   it('binds every value as a parameter on sqlite', () => {
      const { sql, params } = sqliteQuery({
         visibility: "members' or 1=1 --",
         featured: 'true',
         category: 'categories_1',
      })
      expect(sql).toBe(
         'select "id", "title", "featured", "visibility", "category", "status", "created_at" from "events" where ("events"."visibility" = ? and "events"."featured" = ? and "events"."category" = ?)'
      )
      expect(params).toEqual(["members' or 1=1 --", 1, 'categories_1'])
   })

   it('matches false and empty booleans', () => {
      const { sql, params } = sqliteQuery({ featured: 'false' })
      expect(sql).toContain('("events"."featured" = ? or "events"."featured" is null)')
      expect(params).toEqual([0])
   })

   it('combines the search and the filters with AND on postgres', () => {
      const { sql, params } = pgQuery({ status: 'published', featured: 'true' }, 'Fair')
      expect(sql).toContain(
         `where (lower(cast("events"."title" as text)) like $1 escape '\\' and "events"."status" = $2 and "events"."featured" = $3)`
      )
      expect(params).toEqual(['%fair%', 'published', true])
   })

   it('rejects a filter without a column', () => {
      expect(() => listFilterConditions(events, sqliteEvents, { seats: '1' })).toThrow(
         "Unknown filter 'seats'"
      )
   })

   it('returns no condition without search and filters', () => {
      expect(listWhere('sqlite', events, sqliteEvents, {})).toBeUndefined()
   })
})

describe('validateConfig with list.filters', () => {
   it('accepts eligible fields and status', () => {
      const config = sampleConfig()
      config.events!.list = { filters: ['visibility', 'featured', 'category', 'status'] }
      expect(validateConfig(config, I18N)).toEqual([])
   })

   it('rejects unknown and ineligible fields', () => {
      const config = sampleConfig()
      config.events!.list = { filters: ['nope', 'species', 'tags', 'title'] }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes("list.filters names 'nope', which is not a"))).toBe(true)
      for (const key of ['species', 'tags', 'title']) {
         expect(
            errors.some((e) =>
               e.includes(
                  `list.filters names '${key}', which is not a single select, boolean or single relation field`
               )
            )
         ).toBe(true)
      }
   })

   it('rejects status without drafts and a non-array value', () => {
      const config = sampleConfig()
      config.categories!.list = { filters: ['status'] }
      config.events!.list = { filters: 'visibility' as never }
      const errors = validateConfig(config, I18N)
      expect(errors.some((e) => e.includes("list.filters names 'status'"))).toBe(true)
      expect(errors.some((e) => e.includes('list.filters must be an array'))).toBe(true)
   })
})
