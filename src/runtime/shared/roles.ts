import type { CmsConfig, CmsEntry, FieldConfig } from './index'
import { declaredLinkTargets, entryFieldsFor, isCollectionKind, relationTarget } from './index'

export const CMS_ADMIN_ROLE = 'admin'
export const CMS_SUPERADMIN_ROLE = 'superadmin'
export const CMS_RESERVED_ROLES = [CMS_ADMIN_ROLE, CMS_SUPERADMIN_ROLE] as const

export const CMS_ENTRY_PERMISSION_ACTIONS = [
   'read',
   'create',
   'update',
   'delete',
   'publish',
   'import',
   'export',
] as const

export const CMS_MEDIA_PERMISSION_ACTIONS = ['read', 'write', 'delete'] as const

export const CMS_SYSTEM_SCOPES = {
   media: CMS_MEDIA_PERMISSION_ACTIONS,
   users: ['manage'],
   settings: ['manage'],
   redirects: ['manage'],
} as const satisfies Record<string, readonly string[]>

export type CmsEntryPermissionAction = (typeof CMS_ENTRY_PERMISSION_ACTIONS)[number]

export type CmsSystemScope = keyof typeof CMS_SYSTEM_SCOPES

export interface CmsRoleInput {
   label?: string
   description?: string
   can: string[]
}

export type CmsRolesInput = Record<string, CmsRoleInput>

export interface CmsRole {
   label: string
   description: string | null
   can: string[]
}

export type CmsRoles = Record<string, CmsRole>

export interface CmsRoleOption {
   key: string
   label: string
   description: string | null
}

export interface CmsAccess {
   role: string
   known: boolean
   full: boolean
   permissions: string[]
}

const ROLE_KEY_PATTERN = /^[a-z][a-zA-Z0-9_-]*$/
const ROLE_KEYS = new Set(['label', 'description', 'can'])
const SYSTEM_SCOPES = Object.keys(CMS_SYSTEM_SCOPES) as CmsSystemScope[]

function isSystemScope(scope: string): scope is CmsSystemScope {
   return Object.hasOwn(CMS_SYSTEM_SCOPES, scope)
}

function isRecord(value: unknown): value is Record<string, unknown> {
   return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function roleLabel(key: string): string {
   const words = key
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .trim()
      .toLowerCase()
   return words.charAt(0).toUpperCase() + words.slice(1)
}

export function entryPermissionActions(
   entry: Pick<CmsEntry, 'kind' | 'drafts'>
): CmsEntryPermissionAction[] {
   if (!isCollectionKind(entry)) return ['read', 'update']
   return CMS_ENTRY_PERMISSION_ACTIONS.filter((action) => action !== 'publish' || !!entry.drafts)
}

export function cmsPermissions(config: CmsConfig): string[] {
   return [
      ...Object.entries(config).flatMap(([name, entry]) =>
         entryPermissionActions(entry).map((action) => `${name}.${action}`)
      ),
      ...SYSTEM_SCOPES.flatMap((scope) =>
         CMS_SYSTEM_SCOPES[scope].map((action) => `${scope}.${action}`)
      ),
   ]
}

function splitPermission(value: string): [string, string] {
   const dot = value.indexOf('.')
   return dot === -1 ? [value, ''] : [value.slice(0, dot), value.slice(dot + 1)]
}

export function matchesPermission(pattern: string, permission: string): boolean {
   if (pattern === '*') return true
   const [patternScope, patternAction] = splitPermission(pattern)
   const [scope, action] = splitPermission(permission)
   return (
      (patternScope === '*' || patternScope === scope) &&
      (patternAction === '*' || patternAction === action)
   )
}

export function expandPermissions(patterns: readonly string[], config: CmsConfig): string[] {
   const universe = cmsPermissions(config)
   const granted = new Set(
      universe.filter((permission) =>
         patterns.some((pattern) => matchesPermission(pattern, permission))
      )
   )
   for (const permission of [...granted]) {
      const [scope, action] = splitPermission(permission)
      if (action === 'manage') continue
      const read = `${scope}.read`
      if (universe.includes(read)) granted.add(read)
   }
   return universe.filter((permission) => granted.has(permission))
}

export function resolveCmsAccess(
   role: string | null | undefined,
   roles: CmsRoles,
   config: CmsConfig
): CmsAccess {
   const key = role || CMS_ADMIN_ROLE
   if (key === CMS_SUPERADMIN_ROLE) {
      return { role: key, known: true, full: true, permissions: cmsPermissions(config) }
   }
   if (key === CMS_ADMIN_ROLE) {
      return {
         role: key,
         known: true,
         full: false,
         permissions: cmsPermissions(config).filter((permission) => permission !== 'users.manage'),
      }
   }
   const definition = Object.hasOwn(roles, key) ? roles[key] : undefined
   if (!definition) return { role: key, known: false, full: false, permissions: [] }
   return {
      role: key,
      known: true,
      full: false,
      permissions: expandPermissions(definition.can, config),
   }
}

export function can(access: CmsAccess | null | undefined, permission: string): boolean {
   if (!access?.known) return false
   return access.full || access.permissions.includes(permission)
}

export function canAny(access: CmsAccess | null | undefined, permissions: string[]): boolean {
   return permissions.some((permission) => can(access, permission))
}

export function publishPermissionError(
   access: CmsAccess,
   name: string,
   entry: Pick<CmsEntry, 'drafts'>,
   previous: unknown,
   next: unknown
): string | null {
   if (!entry.drafts || can(access, `${name}.publish`)) return null
   if (previous === 'published') {
      return `Editing a published item needs the ${name}.publish permission`
   }
   if (next === 'published') return `Publishing needs the ${name}.publish permission`
   return null
}

export function canGrantRole(
   access: CmsAccess | null | undefined,
   role: string,
   roles: CmsRoles,
   config: CmsConfig
): boolean {
   if (!access?.known || role === CMS_SUPERADMIN_ROLE) return false
   const target = resolveCmsAccess(role, roles, config)
   if (!target.known) return false
   if (access.full) return true
   if (target.full) return false
   return target.permissions.every((permission) => access.permissions.includes(permission))
}

export function canManageAccount(
   access: CmsAccess | null | undefined,
   role: string,
   roles: CmsRoles,
   config: CmsConfig
): boolean {
   if (!can(access, 'users.manage') || role === CMS_SUPERADMIN_ROLE) return false
   if (!resolveCmsAccess(role, roles, config).known) return true
   return canGrantRole(access, role, roles, config)
}

export function cmsRoleOptions(roles: CmsRoles): CmsRoleOption[] {
   return [
      {
         key: CMS_ADMIN_ROLE,
         label: 'Admin',
         description: 'Everything in the panel except managing users.',
      },
      ...Object.entries(roles).map(([key, role]) => ({
         key,
         label: role.label,
         description: role.description,
      })),
   ]
}

export function cmsRoleLabel(role: string | null | undefined, roles: CmsRoles): string {
   const key = role || CMS_ADMIN_ROLE
   if (key === CMS_SUPERADMIN_ROLE) return 'Super admin'
   if (key === CMS_ADMIN_ROLE) return 'Admin'
   return Object.hasOwn(roles, key) ? roles[key]!.label : key
}

export function resolveRoles(input: CmsRolesInput | undefined): CmsRoles {
   return Object.fromEntries(
      Object.entries(input ?? {}).map(([key, role]) => [
         key,
         {
            label: role.label?.trim() || roleLabel(key),
            description: role.description?.trim() || null,
            can: [...new Set(role.can)],
         },
      ])
   )
}

function permissionError(
   permission: string,
   config: CmsConfig,
   allActions: Set<string>
): string | null {
   if (permission === '*') return null
   const parts = permission.split('.')
   if (parts.length !== 2 || parts.some((part) => !part)) {
      return `'${permission}' must be '*' or '<scope>.<action>' (for example 'news.update' or 'media.write')`
   }
   const [scope, action] = parts as [string, string]
   if (scope === '*') {
      if (action === '*' || allActions.has(action)) return null
      return `'${permission}': unknown action '${action}' (expected one of ${[...allActions].join(
         ', '
      )})`
   }
   const entry = Object.hasOwn(config, scope) ? config[scope] : undefined
   if (entry && isSystemScope(scope)) {
      const systemActions: readonly string[] = CMS_SYSTEM_SCOPES[scope]
      if (action === '*') {
         return `'${permission}' is ambiguous: '${scope}' is both an entry and a built-in scope, list the actions instead`
      }
      if (systemActions.includes(action)) return null
   }
   if (entry) {
      if (action === '*') return null
      const actions = entryPermissionActions(entry)
      if ((actions as string[]).includes(action)) return null
      if (action === 'publish' && isCollectionKind(entry)) {
         return `'${permission}': entry '${scope}' has no drafts, so there is nothing to publish`
      }
      return `'${permission}': ${entry.kind} entry '${scope}' supports ${actions.join(', ')}`
   }
   if (isSystemScope(scope)) {
      const actions: readonly string[] = CMS_SYSTEM_SCOPES[scope]
      if (action === '*' || actions.includes(action)) return null
      return `'${permission}': '${scope}' supports ${actions.join(', ')}`
   }
   return `'${permission}': unknown entry or scope '${scope}' (expected an entry key, ${SYSTEM_SCOPES.join(
      ', '
   )} or '*')`
}

function collectFields(fields: Record<string, FieldConfig>): FieldConfig[] {
   return Object.values(fields).flatMap((field) => [
      field,
      ...Object.values(field.blocks ?? {}).flatMap((block) => collectFields(block.fields)),
   ])
}

function accessWarnings(key: string, permissions: string[], config: CmsConfig): string[] {
   const warnings: string[] = []
   const granted = new Set(permissions)
   const relationTargets = new Set<string>()
   let needsMedia = false
   for (const [name, entry] of Object.entries(config)) {
      if (!granted.has(`${name}.create`) && !granted.has(`${name}.update`)) continue
      for (const field of collectFields(entryFieldsFor(entry))) {
         if (field.type === 'media') needsMedia = true
         if (field.type === 'relation' && relationTarget(field))
            relationTargets.add(relationTarget(field))
         if (field.type === 'link')
            for (const target of declaredLinkTargets(field) ?? []) relationTargets.add(target)
      }
   }
   if (needsMedia && !granted.has('media.read')) {
      warnings.push(
         `cms.roles.${key} edits entries with media fields but cannot pick media: add 'media.read'`
      )
   }
   for (const target of relationTargets) {
      if (!granted.has(`${target}.read`)) {
         warnings.push(
            `cms.roles.${key} edits entries that link to '${target}' but cannot list it: add '${target}.read'`
         )
      }
   }
   return warnings
}

export function validateRoles(
   input: unknown,
   config: CmsConfig
): { roles: CmsRoles; errors: string[]; warnings: string[] } {
   const errors: string[] = []
   const warnings: string[] = []
   if (input === undefined) return { roles: {}, errors, warnings }
   if (!isRecord(input)) {
      return {
         roles: {},
         errors: ["cms.roles must be an object like { editor: { label, can: ['news.*'] } }"],
         warnings,
      }
   }
   const allActions = new Set<string>([
      ...CMS_ENTRY_PERMISSION_ACTIONS,
      ...SYSTEM_SCOPES.flatMap((scope) => CMS_SYSTEM_SCOPES[scope]),
   ])
   const valid: CmsRolesInput = {}
   for (const [key, role] of Object.entries(input)) {
      const at = `cms.roles.${key}`
      const before = errors.length
      if ((CMS_RESERVED_ROLES as readonly string[]).includes(key)) {
         errors.push(`${at}: '${key}' is a built-in role and always has full access`)
         continue
      }
      if (!ROLE_KEY_PATTERN.test(key)) {
         errors.push(
            `${at}: role key must start with a lowercase letter and use letters, digits, '-' or '_'`
         )
      }
      if (!isRecord(role)) {
         errors.push(`${at} must be an object like { label, can: [...] }`)
         continue
      }
      for (const name of Object.keys(role)) {
         if (!ROLE_KEYS.has(name)) errors.push(`${at} has an unknown key '${name}'`)
      }
      if (role.label !== undefined && (typeof role.label !== 'string' || !role.label.trim())) {
         errors.push(`${at}.label must be a non-empty string`)
      }
      if (role.description !== undefined && typeof role.description !== 'string') {
         errors.push(`${at}.description must be a string`)
      }
      if (!Array.isArray(role.can)) {
         errors.push(`${at}.can must be an array of permissions`)
         continue
      }
      for (const permission of role.can) {
         if (typeof permission !== 'string') {
            errors.push(`${at}.can must only hold strings`)
            continue
         }
         const error = permissionError(permission, config, allActions)
         if (error) errors.push(`${at}.can: ${error}`)
      }
      if (errors.length === before) valid[key] = role as unknown as CmsRoleInput
   }
   const roles = resolveRoles(valid)
   for (const [key, role] of Object.entries(roles)) {
      warnings.push(...accessWarnings(key, expandPermissions(role.can, config), config))
   }
   return { roles, errors, warnings }
}
