import { createError, defineEventHandler, getRouterParam } from 'h3'
import { deleteRedirects, requireRedirectsAccess } from '../utils/redirects'

export default defineEventHandler(async (event) => {
   await requireRedirectsAccess(event)
   const id = getRouterParam(event, 'id') ?? ''
   if (!(await deleteRedirects([id])))
      throw createError({ statusCode: 404, statusMessage: 'Redirect not found' })
   return { ok: true }
})
