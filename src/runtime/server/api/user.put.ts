import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, getRouterParam, readValidatedBody } from 'h3'
import { z } from 'zod'
import { useDb } from '#cms-db'
import { cms_users } from '#cms-tables'
import type { CmsAccount } from '../../shared/index'
import { MIN_PASSWORD_LENGTH } from '../../shared/index'
import { hashPassword } from '../utils/password'
import { forbidden, requireCmsPermission } from '../utils/permissions'
import { assertCanGrantRole, assertCanManageAccount } from '../utils/user-management'
import { findUserById, toAccount } from '../utils/users'

const bodySchema = z.object({
   name: z.string().trim().max(120).nullish(),
   password: z.string().min(MIN_PASSWORD_LENGTH).max(256).optional(),
   role: z.string().trim().min(1).max(64).optional(),
})

export default defineEventHandler(async (event): Promise<CmsAccount> => {
   const { user, access } = await requireCmsPermission(event, 'users.manage')
   const id = getRouterParam(event, 'id') ?? ''
   const body = await readValidatedBody(event, bodySchema.parse)
   const target = await findUserById(id)
   if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })
   assertCanManageAccount(access, target.role)
   const set: Partial<typeof cms_users.$inferInsert> = { updatedAt: new Date().toISOString() }
   if (body.role !== undefined && body.role !== target.role) {
      if (target.id === user.id) forbidden('You cannot change your own role')
      assertCanGrantRole(access, body.role)
      set.role = body.role
   }
   if (body.name !== undefined) set.name = body.name || null
   if (body.password) {
      set.passwordHash = await hashPassword(body.password)
      set.mustChangePassword = true
   }
   const [row] = await useDb().update(cms_users).set(set).where(eq(cms_users.id, id)).returning()
   if (!row) throw createError({ statusCode: 404, statusMessage: 'User not found' })
   return toAccount(row)
})
