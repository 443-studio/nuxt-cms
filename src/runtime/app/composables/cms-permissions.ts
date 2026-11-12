import type { CmsConfig, CmsEntry } from '#nuxt-cms'
import { computed } from '#imports'
import cmsConfig from '#cms-config'
import cmsRoles from '#cms-roles'
import type { CmsRoles } from '../../shared/roles'
import {
   can as canAccess,
   canGrantRole,
   canManageAccount,
   cmsRoleLabel,
   cmsRoleOptions,
   CMS_SUPERADMIN_ROLE,
   resolveCmsAccess,
} from '../../shared/roles'
import { useCmsAccount } from './cms-account'

export interface CmsEntryLockOptions {
   isNew: boolean
   status?: unknown
}

export function useCmsPermissions() {
   const { user, isSuperAdmin } = useCmsAccount()
   const roles = cmsRoles as CmsRoles
   const config = cmsConfig as CmsConfig

   const role = computed(() =>
      user.value ? (isSuperAdmin.value ? CMS_SUPERADMIN_ROLE : user.value.role) : null
   )
   const access = computed(() =>
      role.value === null ? null : resolveCmsAccess(role.value, roles, config)
   )

   function can(permission: string) {
      return canAccess(access.value, permission)
   }

   function entryLock(name: string, entry: CmsEntry, options: CmsEntryLockOptions) {
      if (options.isNew) {
         return can(`${name}.create`) ? null : 'Your role cannot create entries here.'
      }
      if (!can(`${name}.update`)) return 'Your role can view this entry but not edit it.'
      if (entry.drafts && options.status === 'published' && !can(`${name}.publish`)) {
         return 'This entry is published. Your role can only edit drafts.'
      }
      return null
   }

   function firstPath() {
      const first = Object.keys(config).find((name) => can(`${name}.read`))
      if (first) return `/cms/${first}`
      return can('media.read') ? '/cms/media' : null
   }

   return {
      role,
      access,
      roles,
      can,
      entryLock,
      firstPath,
      roleLabel: (key: string | null | undefined) => cmsRoleLabel(key, roles),
      roleOptions: cmsRoleOptions(roles),
      canGrant: (key: string) => canGrantRole(access.value, key, roles, config),
      canManage: (key: string) => canManageAccount(access.value, key, roles, config),
   }
}
