import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { useDb } from '#cms-db'
import { cms_users } from '#cms-tables'
import { forbidden, requireCmsPermission } from '../utils/permissions'
import { assertCanManageAccount } from '../utils/user-management'
import { findUserById } from '../utils/users'

export default defineEventHandler(async (event) => {
   const { user, access } = await requireCmsPermission(event, 'users.manage')
   const id = getRouterParam(event, 'id') ?? ''
   const target = await findUserById(id)
   if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })
   if (target.id === user.id) forbidden('You cannot delete your own account')
   assertCanManageAccount(access, target.role)
   const [row] = await useDb().delete(cms_users).where(eq(cms_users.id, id)).returning()
   if (!row) throw createError({ statusCode: 404, statusMessage: 'User not found' })
   return { ok: true }
})
