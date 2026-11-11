import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { beforeEach, describe, expect, it } from 'vitest'
import { singleRowFirst } from '../src/runtime/server/utils/single-row'

const site = sqliteTable('site', {
   id: text('id').primaryKey(),
   title: text('title'),
})

function setup(rows: { id: string; title: string }[]) {
   const sqlite = new Database(':memory:')
   sqlite.exec('create table site (id text primary key, title text)')
   const db = drizzle(sqlite)
   for (const row of rows) db.insert(site).values(row).run()
   return db
}

const readSingle = (db: ReturnType<typeof setup>) =>
   db.select().from(site).orderBy(singleRowFirst(site.id, 'site')).limit(1).all()[0]

describe('singleRowFirst', () => {
   let db: ReturnType<typeof setup>

   beforeEach(() => {
      db = setup([
         { id: 'site_legacy', title: 'old' },
         { id: 'site', title: 'saved' },
      ])
   })

   it('reads the row the save writes, even when an older row comes first', () => {
      expect(readSingle(db)).toEqual({ id: 'site', title: 'saved' })
   })

   it('falls back to the existing row before the first save', () => {
      expect(readSingle(setup([{ id: 'site_legacy', title: 'old' }]))).toEqual({
         id: 'site_legacy',
         title: 'old',
      })
   })

   it('returns nothing on an empty table', () => {
      expect(readSingle(setup([]))).toBeUndefined()
   })
})
