import type { H3Event } from 'h3'
import { createError } from 'h3'
import { getUserSession, useRuntimeConfig } from '#imports'
import type { CmsSessionUser } from '../../shared/index'
import { assertSameOrigin } from './same-origin'
import { findUserById, passwordStamp } from './users'

export function isSuperAdminEmail(event: H3Event, email: string) {
   const { adminEmail } = useRuntimeConfig(event).cms as { adminEmail: string }
   return !!adminEmail && email.toLowerCase() === adminEmail.toLowerCase()
}

export async function requireAdmin(event: H3Event): Promise<CmsSessionUser> {
   assertSameOrigin(event)
   const session = await getUserSession(event)
   const user = session.user
   if (!user?.email) {
      throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
   }
   if (!user.id) {
      if (!isSuperAdminEmail(event, user.email)) {
         throw createError({ statusCode: 403, statusMessage: 'Not authorized' })
      }
      return { email: user.email.toLowerCase(), name: null, role: 'superadmin' }
   }
   const row = await findUserById(user.id)
   if (!row || user.passwordStamp !== passwordStamp(row.passwordHash)) {
      throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
   }
   if (row.role === 'superadmin') {
      throw createError({ statusCode: 403, statusMessage: 'Not authorized' })
   }
   return {
      id: row.id,
      email: row.email,
      name: row.name ?? null,
      role: row.role,
      firstLogin: !!row.mustChangePassword,
      passwordStamp: user.passwordStamp,
   }
}
