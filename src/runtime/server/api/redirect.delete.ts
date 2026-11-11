import { createError, defineEventHandler, getRouterParam } from 'h3'
import { deleteRedirects } from '../utils/redirects'
import { requireCmsPermission } from '../utils/permissions'

export default defineEventHandler(async (event) => {
   await requireCmsPermission(event, 'redirects.manage')
   const id = getRouterParam(event, 'id') ?? ''
   if (!(await deleteRedirects([id])))
      throw createError({ statusCode: 404, statusMessage: 'Redirect not found' })
   return { ok: true }
})
