import { createError } from 'h3'
import cmsConfig from '#cms-config'
import cmsRoles from '#cms-roles'
import type { CmsConfig } from '../../shared/index'
import type { CmsAccess, CmsRoles } from '../../shared/roles'
import { canGrantRole, canManageAccount, cmsRoleOptions } from '../../shared/roles'
import { forbidden } from './permissions'

export function assertKnownRole(role: string) {
   if (cmsRoleOptions(cmsRoles as CmsRoles).some((option) => option.key === role)) return
   throw createError({ statusCode: 400, statusMessage: `Unknown role: ${role}` })
}

export function assertCanGrantRole(access: CmsAccess, role: string) {
   assertKnownRole(role)
   if (!canGrantRole(access, role, cmsRoles as CmsRoles, cmsConfig as CmsConfig)) {
      forbidden(`You cannot grant the role '${role}': it has permissions you do not hold`)
   }
}

export function assertCanManageAccount(access: CmsAccess, role: string) {
   if (!canManageAccount(access, role, cmsRoles as CmsRoles, cmsConfig as CmsConfig)) {
      forbidden('You cannot manage this account: its role has permissions you do not hold')
   }
}
