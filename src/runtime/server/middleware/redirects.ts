import { defineEventHandler, sendRedirect } from 'h3'
import { normalizeRedirectPath, redirectApplies, redirectLocation } from '../../shared/index'
import { isLivePath, readRedirectTable } from '../utils/redirects'

export default defineEventHandler(async (event) => {
   if (event.method !== 'GET' && event.method !== 'HEAD') return
   const [pathname = '/', search = ''] = event.path.split(/\?(.*)/s)
   if (!redirectApplies(pathname)) return
   const table = await readRedirectTable().catch(() => null)
   if (!table?.size) return
   const path = normalizeRedirectPath(pathname)
   const redirect = table.get(path)
   if (!redirect || (await isLivePath(path).catch(() => false))) return
   return sendRedirect(
      event,
      redirectLocation(redirect.to, search, redirect.keepQuery),
      redirect.status
   )
})
