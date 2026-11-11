import type { EventHandler } from 'h3'
import { createApp, createError, createRouter, toWebHandler } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const STAMP = 'stamp-0123456789'

const state = vi.hoisted(() => ({
   session: {} as { user?: Record<string, unknown> },
   users: {} as Record<string, { id: string; email: string; role: string; passwordHash: string }>,
   search: null as Record<string, unknown> | null,
}))

vi.mock('#imports', () => ({
   getUserSession: async () => state.session,
   useRuntimeConfig: () => ({
      cms: { adminEmail: 'root@example.com', media: { storage: 's3' } },
      public: { cms: { i18n: { locales: [], defaultLocale: 'en' } } },
   }),
}))

vi.mock('#cms-db', () => {
   const reached = () => {
      throw createError({ statusCode: 599, statusMessage: 'Database reached' })
   }
   const db = new Proxy({}, { get: reached })
   return { useDb: () => db, runBatch: reached, cmsDialect: 'sqlite' }
})

vi.mock('#cms-tables', () => ({
   cms_users: { id: 'id', email: 'email' },
   cms_settings: { key: 'key' },
   cms_media: { key: 'key' },
}))

vi.mock('#cms-media-manifest', () => ({ builtAt: null, files: null }))

vi.mock('#cms-config', () => ({
   default: {
      news: {
         id: 'news',
         label: 'News',
         kind: 'collection',
         drafts: true,
         table: {},
         fields: { title: { label: 'Title', type: 'text' } },
      },
      categories: {
         id: 'categories',
         label: 'Categories',
         kind: 'collection',
         table: {},
         fields: { name: { label: 'Name', type: 'text' } },
      },
      home: {
         id: 'home',
         label: 'Home',
         kind: 'single',
         table: {},
         fields: { headline: { label: 'Headline', type: 'text' } },
      },
   },
}))

vi.mock('#cms-roles', () => ({
   default: {
      writer: {
         label: 'Writer',
         description: null,
         can: ['news.read', 'news.create', 'news.update', 'categories.read', 'media.read'],
      },
      manager: {
         label: 'Manager',
         description: null,
         can: ['users.manage', 'news.*', 'categories.read', 'media.read'],
      },
   },
}))

vi.mock('../src/runtime/server/utils/users', async (importOriginal) => ({
   ...(await importOriginal<typeof import('../src/runtime/server/utils/users')>()),
   findUserById: async (id: string) => state.users[id],
   findUserByEmail: async () => undefined,
}))

vi.mock('../src/runtime/server/utils/search', () => ({
   searchCms: async (options: Record<string, unknown>) => {
      state.search = options
      return { query: '', hits: [], truncated: false }
   },
}))

vi.mock('../src/runtime/server/utils/password', () => ({
   hashPassword: async () => `hash-${STAMP}`,
}))

import collectionGet from '../src/runtime/server/api/collection.get'
import collectionPost from '../src/runtime/server/api/collection.post'
import collectionPut from '../src/runtime/server/api/collection.put'
import collectionExport from '../src/runtime/server/api/collection-export.get'
import collectionImport from '../src/runtime/server/api/collection-import.post'
import itemDelete from '../src/runtime/server/api/item.delete'
import itemGet from '../src/runtime/server/api/item.get'
import itemPut from '../src/runtime/server/api/item.put'
import mediaDelete from '../src/runtime/server/api/media.delete'
import mediaGet from '../src/runtime/server/api/media.get'
import mediaPost from '../src/runtime/server/api/media.post'
import searchGet from '../src/runtime/server/api/search.get'
import settingsDelete from '../src/runtime/server/api/settings.delete'
import settingsGet from '../src/runtime/server/api/settings.get'
import settingsPut from '../src/runtime/server/api/settings.put'
import tagsGet from '../src/runtime/server/api/tags.get'
import userDelete from '../src/runtime/server/api/user.delete'
import userPut from '../src/runtime/server/api/user.put'
import usersGet from '../src/runtime/server/api/users.get'
import usersPost from '../src/runtime/server/api/users.post'

const routes: [string, string, EventHandler][] = [
   ['get', '/api/cms/search', searchGet],
   ['get', '/api/cms/users', usersGet],
   ['post', '/api/cms/users', usersPost],
   ['put', '/api/cms/users/:id', userPut],
   ['delete', '/api/cms/users/:id', userDelete],
   ['get', '/api/cms/admin/settings', settingsGet],
   ['put', '/api/cms/admin/settings/:key', settingsPut],
   ['delete', '/api/cms/admin/settings/:key', settingsDelete],
   ['get', '/api/cms/admin/media', mediaGet],
   ['post', '/api/cms/admin/media', mediaPost],
   ['delete', '/api/cms/admin/media', mediaDelete],
   ['get', '/api/cms/tags/:collection/:field', tagsGet],
   ['get', '/api/cms/export/:collection', collectionExport],
   ['post', '/api/cms/import/:collection', collectionImport],
   ['get', '/api/cms/admin/:collection', collectionGet],
   ['post', '/api/cms/admin/:collection', collectionPost],
   ['put', '/api/cms/admin/:collection', collectionPut],
   ['get', '/api/cms/admin/:collection/:id', itemGet],
   ['put', '/api/cms/admin/:collection/:id', itemPut],
   ['delete', '/api/cms/admin/:collection/:id', itemDelete],
]

const router = createRouter()
for (const [method, path, handler] of routes) {
   router[method as 'get'](path, handler)
}
const web = toWebHandler(createApp().use(router))

async function call(method: string, path: string, body?: unknown) {
   const response = await web(
      new Request(`http://cms.test${path}`, {
         method,
         headers: {
            host: 'cms.test',
            origin: 'http://cms.test',
            'content-type': 'application/json',
         },
         body: body === undefined ? undefined : JSON.stringify(body),
      })
   )
   const text = await response.text()
   let message = ''
   try {
      message = (JSON.parse(text) as { statusMessage?: string }).statusMessage ?? ''
   } catch {}
   return { status: response.status, message }
}

function signIn(id: string, role: string) {
   state.users[id] = { id, email: `${id}@example.com`, role, passwordHash: `hash-${STAMP}` }
   state.session = { user: { id, email: `${id}@example.com`, role, passwordStamp: STAMP } }
}

beforeEach(() => {
   state.users = {}
   state.session = {}
   state.search = null
})

describe('admin endpoint permissions', () => {
   it('requires a session', async () => {
      expect((await call('GET', '/api/cms/admin/news')).status).toBe(401)
   })

   it('answers 403 to a writer for every action outside the role', async () => {
      signIn('usr_writer', 'writer')
      const forbidden: [string, string, unknown?][] = [
         ['GET', '/api/cms/admin/home'],
         ['PUT', '/api/cms/admin/home', { headline: 'x' }],
         ['DELETE', '/api/cms/admin/news/news_1'],
         ['GET', '/api/cms/export/news'],
         ['POST', '/api/cms/import/news?format=json', { items: [] }],
         ['PUT', '/api/cms/admin/settings/entry:news', {}],
         ['DELETE', '/api/cms/admin/settings/entry:news'],
         ['POST', '/api/cms/admin/media', { key: 'a.png' }],
         ['DELETE', '/api/cms/admin/media?key=a.png'],
         ['GET', '/api/cms/users'],
         ['POST', '/api/cms/users', { email: 'a@example.com', password: 'long-password' }],
         ['DELETE', '/api/cms/users/usr_other'],
         ['GET', '/api/cms/tags/home/headline'],
      ]
      for (const [method, path, body] of forbidden) {
         const result = await call(method, path, body)
         expect(result.status, `${method} ${path}`).toBe(403)
         expect(result.message, `${method} ${path}`).toMatch(/^Missing permission: /)
      }
   })

   it('lets a writer through the actions of the role', async () => {
      signIn('usr_writer', 'writer')
      const allowed: [string, string, unknown?][] = [
         ['GET', '/api/cms/admin/news'],
         ['GET', '/api/cms/admin/news/news_1'],
         ['GET', '/api/cms/admin/categories'],
         ['GET', '/api/cms/admin/settings'],
         ['POST', '/api/cms/admin/news', { title: 'Draft' }],
         ['PUT', '/api/cms/admin/news/news_1', { title: 'Draft' }],
      ]
      for (const [method, path, body] of allowed) {
         expect((await call(method, path, body)).status, `${method} ${path}`).toBe(599)
      }
   })

   it('refuses to publish without the publish permission', async () => {
      signIn('usr_writer', 'writer')
      const result = await call('POST', '/api/cms/admin/news', {
         title: 'Live',
         status: 'published',
      })
      expect(result.status).toBe(403)
      expect(result.message).toBe('Publishing needs the news.publish permission')
   })

   it('gives no access to a role that is not configured anymore', async () => {
      signIn('usr_old', 'removed')
      const result = await call('GET', '/api/cms/admin/news')
      expect(result.status).toBe(403)
      expect(result.message).toBe("Your role 'removed' no longer exists")
   })

   it('keeps the built-in admin role on everything but users', async () => {
      signIn('usr_admin', 'admin')
      expect((await call('DELETE', '/api/cms/admin/news/news_1')).status).toBe(599)
      expect((await call('PUT', '/api/cms/admin/settings/entry:news', {})).status).not.toBe(403)
      expect((await call('GET', '/api/cms/users')).status).toBe(403)
   })

   it('gives the env super admin every permission', async () => {
      state.session = { user: { email: 'root@example.com', role: 'superadmin' } }
      expect((await call('DELETE', '/api/cms/admin/news/news_1')).status).toBe(599)
      expect((await call('GET', '/api/cms/users')).status).toBe(599)
   })

   it('refuses a database account that claims the super admin role', async () => {
      signIn('usr_fake', 'superadmin')
      expect((await call('GET', '/api/cms/admin/news')).status).toBe(403)
   })

   it('filters search to the readable entries and media', async () => {
      signIn('usr_writer', 'writer')
      expect((await call('GET', '/api/cms/search?q=hello')).status).toBe(200)
      expect(Object.keys(state.search!.config as object)).toEqual(['news', 'categories'])
      expect(state.search!.media).toBe(true)
   })
})

describe('user management permissions', () => {
   beforeEach(() => {
      state.users.usr_admin = {
         id: 'usr_admin',
         email: 'admin@example.com',
         role: 'admin',
         passwordHash: 'x',
      }
      state.users.usr_writer = {
         id: 'usr_writer',
         email: 'writer@example.com',
         role: 'writer',
         passwordHash: 'x',
      }
      signIn('usr_manager', 'manager')
   })

   it('only grants roles the manager fully holds', async () => {
      const body = { email: 'new@example.com', password: 'long-password' }
      const admin = await call('POST', '/api/cms/users', { ...body, role: 'admin' })
      expect(admin.status).toBe(403)
      expect(admin.message).toMatch(/cannot grant the role 'admin'/)
      expect((await call('POST', '/api/cms/users', { ...body, role: 'superadmin' })).status).toBe(
         400
      )
      expect((await call('POST', '/api/cms/users', { ...body, role: 'ghost' })).status).toBe(400)
      expect((await call('POST', '/api/cms/users', { ...body, role: 'writer' })).status).toBe(599)
   })

   it('cannot edit or delete an account whose role is beyond its own', async () => {
      expect((await call('PUT', '/api/cms/users/usr_admin', { name: 'x' })).status).toBe(403)
      expect((await call('DELETE', '/api/cms/users/usr_admin')).status).toBe(403)
      expect((await call('PUT', '/api/cms/users/usr_writer', { role: 'admin' })).status).toBe(403)
      expect((await call('PUT', '/api/cms/users/usr_writer', { role: 'manager' })).status).toBe(599)
      expect((await call('DELETE', '/api/cms/users/usr_writer')).status).toBe(599)
   })

   it('cannot change its own role nor delete itself', async () => {
      const role = await call('PUT', '/api/cms/users/usr_manager', { role: 'writer' })
      expect(role.status).toBe(403)
      expect(role.message).toBe('You cannot change your own role')
      expect((await call('DELETE', '/api/cms/users/usr_manager')).status).toBe(403)
   })
})
