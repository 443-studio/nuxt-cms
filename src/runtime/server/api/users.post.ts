import { createError, defineEventHandler, readValidatedBody } from 'h3'
import { z } from 'zod'
import { useDb } from '#cms-db'
import { cms_users } from '#cms-tables'
import type { CmsAccount } from '../../shared/index'
import { MIN_PASSWORD_LENGTH } from '../../shared/index'
import { customId } from '../utils/custom-id'
import { mapConstraintErrors } from '../utils/db-errors'
import { hashPassword } from '../utils/password'
import { requireCmsPermission } from '../utils/permissions'
import { isSuperAdminEmail } from '../utils/require-admin'
import { assertCanGrantRole } from '../utils/user-management'
import { findUserByEmail, toAccount } from '../utils/users'

const bodySchema = z.object({
   email: z.string().trim().toLowerCase().email().max(254),
   name: z.string().trim().max(120).nullish(),
   password: z.string().min(MIN_PASSWORD_LENGTH).max(256),
   role: z.string().trim().min(1).max(64).default('admin'),
})

export default defineEventHandler(async (event): Promise<CmsAccount> => {
   const { access } = await requireCmsPermission(event, 'users.manage')
   const body = await readValidatedBody(event, bodySchema.parse)
   assertCanGrantRole(access, body.role)
   if (isSuperAdminEmail(event, body.email) || (await findUserByEmail(body.email))) {
      throw createError({ statusCode: 409, statusMessage: 'A user with this email already exists' })
   }
   const now = new Date().toISOString()
   const passwordHash = await hashPassword(body.password)
   const [row] = await mapConstraintErrors(() =>
      useDb()
         .insert(cms_users)
         .values({
            id: customId('usr'),
            email: body.email,
            name: body.name || null,
            role: body.role,
            passwordHash,
            createdAt: now,
            updatedAt: now,
         })
         .returning()
   )
   return toAccount(row!)
})
