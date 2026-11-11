import { defineEventHandler, getRouterParam } from 'h3'
import type { CmsPreviewLink } from '../../shared/index'
import { listPreviewLinks, requirePreviewLinkAccess } from '../utils/preview-links'

export default defineEventHandler(async (event): Promise<CmsPreviewLink[]> => {
   const access = await requirePreviewLinkAccess(event, getRouterParam(event, 'collection') ?? '')
   return listPreviewLinks(access, getRouterParam(event, 'id') ?? '')
})
