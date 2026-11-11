import { defineEventHandler, getRouterParam } from 'h3'
import { requirePreviewLinkAccess, revokePreviewLink } from '../utils/preview-links'

export default defineEventHandler(async (event) => {
   const access = await requirePreviewLinkAccess(event, getRouterParam(event, 'collection') ?? '')
   await revokePreviewLink(
      access,
      getRouterParam(event, 'id') ?? '',
      getRouterParam(event, 'linkId') ?? ''
   )
   return { ok: true }
})
