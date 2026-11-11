import { describe, expect, it } from 'vitest'
import type { CmsConfig } from '../src/runtime/shared/index'
import type { CmsRoles } from '../src/runtime/shared/roles'
import {
   can,
   canGrantRole,
   canManageAccount,
   cmsPermissions,
   cmsRoleLabel,
   cmsRoleOptions,
   entryPermissionActions,
   expandPermissions,
   matchesPermission,
   publishPermissionError,
   resolveCmsAccess,
   resolveRoles,
   roleLabel,
   validateRoles,
} from '../src/runtime/shared/roles'

function config(): CmsConfig {
   return {
      news: {
         id: 'news',
         label: 'News',
         kind: 'collection',
         drafts: true,
         fields: {
            title: { label: 'Title', type: 'text' },
            cover: { label: 'Cover', type: 'media' },
            category: { label: 'Category', type: 'relation', to: 'categories' },
         },
      },
      categories: {
         id: 'categories',
         label: 'Categories',
         kind: 'collection',
         fields: { name: { label: 'Name', type: 'text' } },
      },
      home: {
         id: 'home',
         label: 'Home',
         kind: 'single',
         fields: { headline: { label: 'Headline', type: 'text' } },
      },
      pages: {
         id: 'pages',
         label: 'Pages',
         kind: 'page',
         fields: { title: { label: 'Title', type: 'text' } },
         pages: [{ path: '/', key: 'home', label: 'Home' }],
      },
   }
}

const ROLES: CmsRoles = resolveRoles({
   editor: { label: 'Editor', can: ['news.*', 'categories.read', 'media.read', 'media.write'] },
   writer: { can: ['news.read', 'news.create', 'news.update', 'categories.read', 'media.read'] },
   viewer: { can: ['*.read'] },
   manager: { can: ['users.manage', 'news.*', 'categories.read', 'media.*'] },
   everything: { can: ['*'] },
})

describe('matchesPermission', () => {
   it('matches exact permissions', () => {
      expect(matchesPermission('news.update', 'news.update')).toBe(true)
      expect(matchesPermission('news.update', 'news.delete')).toBe(false)
      expect(matchesPermission('news.update', 'events.update')).toBe(false)
   })

   it('treats * as any segment', () => {
      expect(matchesPermission('*', 'users.manage')).toBe(true)
      expect(matchesPermission('news.*', 'news.publish')).toBe(true)
      expect(matchesPermission('news.*', 'newsletter.read')).toBe(false)
      expect(matchesPermission('*.read', 'media.read')).toBe(true)
      expect(matchesPermission('*.read', 'news.update')).toBe(false)
      expect(matchesPermission('*.*', 'settings.manage')).toBe(true)
   })
})

describe('entry permissions', () => {
   it('depends on the kind and on drafts', () => {
      const cfg = config()
      expect(entryPermissionActions(cfg.news!)).toEqual([
         'read',
         'create',
         'update',
         'delete',
         'publish',
         'import',
         'export',
      ])
      expect(entryPermissionActions(cfg.categories!)).not.toContain('publish')
      expect(entryPermissionActions(cfg.home!)).toEqual(['read', 'update'])
      expect(entryPermissionActions(cfg.pages!)).toEqual(['read', 'update'])
   })

   it('lists every permission of the config plus the built-in scopes', () => {
      const all = cmsPermissions(config())
      expect(all).toContain('news.publish')
      expect(all).not.toContain('categories.publish')
      expect(all).not.toContain('home.delete')
      expect(all).toEqual(
         expect.arrayContaining([
            'media.read',
            'media.write',
            'media.delete',
            'users.manage',
            'settings.manage',
            'redirects.manage',
         ])
      )
   })

   it('makes every action imply read on the same scope', () => {
      const granted = expandPermissions(['news.update', 'media.write', 'users.manage'], config())
      expect(granted).toEqual(
         expect.arrayContaining(['news.read', 'news.update', 'media.read', 'media.write'])
      )
      expect(granted).not.toContain('users.read')
      expect(granted).not.toContain('news.delete')
   })
})

describe('can', () => {
   it('gives the super admin everything', () => {
      const access = resolveCmsAccess('superadmin', ROLES, config())
      expect(access.full).toBe(true)
      for (const permission of cmsPermissions(config())) expect(can(access, permission)).toBe(true)
   })

   it('gives the built-in admin role everything except managing users', () => {
      for (const role of ['admin', undefined, null, '']) {
         const access = resolveCmsAccess(role, ROLES, config())
         expect(can(access, 'news.publish')).toBe(true)
         expect(can(access, 'settings.manage')).toBe(true)
         expect(can(access, 'redirects.manage')).toBe(true)
         expect(can(access, 'media.delete')).toBe(true)
         expect(can(access, 'users.manage')).toBe(false)
      }
   })

   it('applies the patterns of a configured role', () => {
      const editor = resolveCmsAccess('editor', ROLES, config())
      expect(can(editor, 'news.publish')).toBe(true)
      expect(can(editor, 'news.delete')).toBe(true)
      expect(can(editor, 'categories.read')).toBe(true)
      expect(can(editor, 'categories.update')).toBe(false)
      expect(can(editor, 'home.read')).toBe(false)
      expect(can(editor, 'media.delete')).toBe(false)
      expect(can(editor, 'settings.manage')).toBe(false)
      expect(can(editor, 'redirects.manage')).toBe(false)
      expect(can(editor, 'users.manage')).toBe(false)

      const viewer = resolveCmsAccess('viewer', ROLES, config())
      expect(can(viewer, 'home.read')).toBe(true)
      expect(can(viewer, 'media.read')).toBe(true)
      expect(can(viewer, 'home.update')).toBe(false)
   })

   it('grants nothing to a role that is not configured', () => {
      const access = resolveCmsAccess('removed', ROLES, config())
      expect(access.known).toBe(false)
      expect(can(access, 'news.read')).toBe(false)
      expect(can(null, 'news.read')).toBe(false)
   })

   it('does not grant unknown permissions', () => {
      const access = resolveCmsAccess('everything', ROLES, config())
      expect(can(access, 'news.read')).toBe(true)
      expect(can(access, 'home.delete')).toBe(false)
   })
})

describe('publishPermissionError', () => {
   const cfg = config()
   const writer = resolveCmsAccess('writer', ROLES, cfg)
   const editor = resolveCmsAccess('editor', ROLES, cfg)

   it('lets a user without publish save drafts', () => {
      expect(publishPermissionError(writer, 'news', cfg.news!, null, 'draft')).toBeNull()
      expect(publishPermissionError(writer, 'news', cfg.news!, 'draft', 'draft')).toBeNull()
   })

   it('refuses publishing, unpublishing and editing a published item without publish', () => {
      expect(publishPermissionError(writer, 'news', cfg.news!, null, 'published')).toMatch(
         /news\.publish/
      )
      expect(publishPermissionError(writer, 'news', cfg.news!, 'draft', 'published')).toMatch(
         /Publishing/
      )
      expect(publishPermissionError(writer, 'news', cfg.news!, 'published', 'draft')).toMatch(
         /published item/
      )
      expect(publishPermissionError(writer, 'news', cfg.news!, 'published', 'published')).toMatch(
         /published item/
      )
   })

   it('allows every transition with publish, and ignores entries without drafts', () => {
      expect(publishPermissionError(editor, 'news', cfg.news!, 'published', 'draft')).toBeNull()
      expect(
         publishPermissionError(writer, 'categories', cfg.categories!, 'published', 'published')
      ).toBeNull()
   })
})

describe('grant rule', () => {
   const cfg = config()
   const superadmin = resolveCmsAccess('superadmin', ROLES, cfg)
   const admin = resolveCmsAccess('admin', ROLES, cfg)
   const manager = resolveCmsAccess('manager', ROLES, cfg)
   const editor = resolveCmsAccess('editor', ROLES, cfg)

   it('lets the super admin grant every role but its own', () => {
      for (const role of ['admin', 'editor', 'viewer', 'everything']) {
         expect(canGrantRole(superadmin, role, ROLES, cfg)).toBe(true)
      }
      expect(canGrantRole(superadmin, 'superadmin', ROLES, cfg)).toBe(false)
      expect(canGrantRole(superadmin, 'removed', ROLES, cfg)).toBe(false)
   })

   it('only grants roles whose permissions are all held', () => {
      expect(canGrantRole(manager, 'editor', ROLES, cfg)).toBe(true)
      expect(canGrantRole(manager, 'writer', ROLES, cfg)).toBe(true)
      expect(canGrantRole(manager, 'manager', ROLES, cfg)).toBe(true)
      expect(canGrantRole(manager, 'viewer', ROLES, cfg)).toBe(false)
      expect(canGrantRole(manager, 'admin', ROLES, cfg)).toBe(false)
      expect(canGrantRole(manager, 'everything', ROLES, cfg)).toBe(false)
      expect(canGrantRole(admin, 'everything', ROLES, cfg)).toBe(false)
      expect(canGrantRole(admin, 'editor', ROLES, cfg)).toBe(true)
   })

   it('needs users.manage and a grantable role to manage an account', () => {
      expect(canManageAccount(manager, 'editor', ROLES, cfg)).toBe(true)
      expect(canManageAccount(manager, 'admin', ROLES, cfg)).toBe(false)
      expect(canManageAccount(manager, 'removed', ROLES, cfg)).toBe(true)
      expect(canManageAccount(editor, 'writer', ROLES, cfg)).toBe(false)
      expect(canManageAccount(admin, 'writer', ROLES, cfg)).toBe(false)
      expect(canManageAccount(superadmin, 'admin', ROLES, cfg)).toBe(true)
      expect(canManageAccount(superadmin, 'superadmin', ROLES, cfg)).toBe(false)
   })
})

describe('role labels', () => {
   it('derives a label from the key', () => {
      expect(roleLabel('contentEditor')).toBe('Content editor')
      expect(roleLabel('shop-manager')).toBe('Shop manager')
      expect(ROLES.writer!.label).toBe('Writer')
   })

   it('lists the admin role first and names built-in roles', () => {
      expect(cmsRoleOptions(ROLES).map((option) => option.key)).toEqual([
         'admin',
         'editor',
         'writer',
         'viewer',
         'manager',
         'everything',
      ])
      expect(cmsRoleLabel('superadmin', ROLES)).toBe('Super admin')
      expect(cmsRoleLabel(undefined, ROLES)).toBe('Admin')
      expect(cmsRoleLabel('editor', ROLES)).toBe('Editor')
      expect(cmsRoleLabel('removed', ROLES)).toBe('removed')
   })
})

describe('validateRoles', () => {
   it('accepts no roles and valid roles', () => {
      expect(validateRoles(undefined, config())).toEqual({ roles: {}, errors: [], warnings: [] })
      const result = validateRoles(
         {
            editor: {
               label: 'Editor',
               description: 'Writes the news',
               can: [
                  'news.*',
                  'categories.read',
                  'media.read',
                  'media.write',
                  'pages.update',
                  '*.export',
               ],
            },
            root: { can: ['*'] },
         },
         config()
      )
      expect(result.errors).toEqual([])
      expect(result.roles.editor).toEqual({
         label: 'Editor',
         description: 'Writes the news',
         can: [
            'news.*',
            'categories.read',
            'media.read',
            'media.write',
            'pages.update',
            '*.export',
         ],
      })
   })

   it('rejects a non-object', () => {
      expect(validateRoles(['editor'], config()).errors[0]).toMatch(/must be an object/)
   })

   it('rejects reserved and malformed role keys', () => {
      const { errors, roles } = validateRoles(
         { admin: { can: [] }, superadmin: { can: [] }, 'Bad key': { can: [] } },
         config()
      )
      expect(errors).toEqual([
         "cms.roles.admin: 'admin' is a built-in role and always has full access",
         "cms.roles.superadmin: 'superadmin' is a built-in role and always has full access",
         "cms.roles.Bad key: role key must start with a lowercase letter and use letters, digits, '-' or '_'",
      ])
      expect(roles).toEqual({})
   })

   it('rejects unknown keys, bad labels and a missing can', () => {
      const { errors } = validateRoles(
         {
            a: { label: '', can: [] },
            b: { label: 'B', permissions: [], can: [] },
            c: { label: 'C' },
            d: { can: [1] },
            e: { description: 3, can: [] },
         },
         config()
      )
      expect(errors).toEqual([
         'cms.roles.a.label must be a non-empty string',
         "cms.roles.b has an unknown key 'permissions'",
         'cms.roles.c.can must be an array of permissions',
         'cms.roles.d.can must only hold strings',
         'cms.roles.e.description must be a string',
      ])
   })

   it('rejects unknown entries and actions', () => {
      const { errors } = validateRoles(
         {
            editor: {
               can: [
                  'blog.read',
                  'news.archive',
                  'categories.publish',
                  'home.delete',
                  'pages.create',
                  'media.manage',
                  'users.read',
                  'redirects.write',
                  '*.archive',
                  'news',
                  'news.read.all',
               ],
            },
         },
         config()
      )
      expect(errors).toEqual([
         "cms.roles.editor.can: 'blog.read': unknown entry or scope 'blog' (expected an entry key, media, users, settings, redirects or '*')",
         "cms.roles.editor.can: 'news.archive': collection entry 'news' supports read, create, update, delete, publish, import, export",
         "cms.roles.editor.can: 'categories.publish': entry 'categories' has no drafts, so there is nothing to publish",
         "cms.roles.editor.can: 'home.delete': single entry 'home' supports read, update",
         "cms.roles.editor.can: 'pages.create': page entry 'pages' supports read, update",
         "cms.roles.editor.can: 'media.manage': 'media' supports read, write, delete",
         "cms.roles.editor.can: 'users.read': 'users' supports manage",
         "cms.roles.editor.can: 'redirects.write': 'redirects' supports manage",
         "cms.roles.editor.can: '*.archive': unknown action 'archive' (expected one of read, create, update, delete, publish, import, export, write, manage)",
         "cms.roles.editor.can: 'news' must be '*' or '<scope>.<action>' (for example 'news.update' or 'media.write')",
         "cms.roles.editor.can: 'news.read.all' must be '*' or '<scope>.<action>' (for example 'news.update' or 'media.write')",
      ])
   })

   it('refuses a wildcard on an entry named like a built-in scope', () => {
      const cfg: CmsConfig = {
         ...config(),
         users: {
            id: 'users',
            label: 'Users',
            kind: 'collection',
            fields: { name: { label: 'Name', type: 'text' } },
         },
      }
      const { errors } = validateRoles(
         { a: { can: ['users.*'] }, b: { can: ['users.read', 'users.manage'] } },
         cfg
      )
      expect(errors).toEqual([
         "cms.roles.a.can: 'users.*' is ambiguous: 'users' is both an entry and a built-in scope, list the actions instead",
      ])
   })

   it('warns when a role edits media or relation fields it cannot browse', () => {
      const { errors, warnings } = validateRoles({ writer: { can: ['news.update'] } }, config())
      expect(errors).toEqual([])
      expect(warnings).toEqual([
         "cms.roles.writer edits entries with media fields but cannot pick media: add 'media.read'",
         "cms.roles.writer edits entries that link to 'categories' but cannot list it: add 'categories.read'",
      ])
   })

   it('warns when a role edits a link field whose declared targets it cannot read', () => {
      const cfg = config()
      cfg.home!.fields.cta = { label: 'Call to action', type: 'link', to: ['pages'] }
      cfg.home!.fields.anywhere = { label: 'Anywhere', type: 'link' }
      const { warnings } = validateRoles({ writer: { can: ['home.update'] } }, cfg)
      expect(warnings).toEqual([
         "cms.roles.writer edits entries that link to 'pages' but cannot list it: add 'pages.read'",
      ])
      expect(
         validateRoles({ writer: { can: ['home.update', 'pages.read'] } }, cfg).warnings
      ).toEqual([])
   })
})
