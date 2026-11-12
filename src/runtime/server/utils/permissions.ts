import type { H3Event } from 'h3'
import { createError } from 'h3'
import cmsConfig from '#cms-config'
import cmsRoles from '#cms-roles'
import type { CmsConfig, CmsEntry, CmsSessionUser } from '../../shared/index'
import type { CmsAccess, CmsRoles } from '../../shared/roles'
import {
   can,
   deletePermissionError,
   publishPermissionError,
   resolveCmsAccess,
} from '../../shared/roles'
import { requireAdmin } from './require-admin'

export interface CmsAuthorized {
   user: CmsSessionUser
   access: CmsAccess
}

export function cmsAccessFor(role: string | null | undefined): CmsAccess {
   return resolveCmsAccess(role, cmsRoles as CmsRoles, cmsConfig as CmsConfig)
}

export function forbidden(message: string): never {
   throw createError({ statusCode: 403, statusMessage: message })
}

export function assertCmsPermission(access: CmsAccess, permission: string) {
   if (can(access, permission)) return
   if (!access.known) forbidden(`Your role '${access.role}' no longer exists`)
   forbidden(`Missing permission: ${permission}`)
}

export async function requireCmsAccess(event: H3Event): Promise<CmsAuthorized> {
   const cached = event.context.cmsAuthorized as CmsAuthorized | undefined
   if (cached) return cached
   const user = await requireAdmin(event)
   const authorized = { user, access: cmsAccessFor(user.role) }
   event.context.cmsAuthorized = authorized
   return authorized
}

export async function requireCmsPermission(
   event: H3Event,
   permission: string
): Promise<CmsAuthorized> {
   const authorized = await requireCmsAccess(event)
   assertCmsPermission(authorized.access, permission)
   return authorized
}

export function assertDeleteAllowed(
   access: CmsAccess,
   name: string,
   entry: Pick<CmsEntry, 'drafts'>,
   status: unknown
) {
   assertCmsPermission(access, `${name}.delete`)
   const message = deletePermissionError(access, name, entry, status)
   if (message) forbidden(message)
}

export function assertPublishAllowed(
   access: CmsAccess,
   name: string,
   entry: Pick<CmsEntry, 'drafts'>,
   previous: unknown,
   next: unknown
) {
   const message = publishPermissionError(access, name, entry, previous, next)
   if (message) forbidden(message)
}
