import { defineEventHandler, getRouterParam, readValidatedBody } from 'h3'
import type { CmsCreatedPreviewLink } from '../../shared/index'
import {
   createPreviewLink,
   markPreviewResponse,
   previewLinkInputSchema,
   requirePreviewLinkAccess,
} from '../utils/preview-links'

export default defineEventHandler(async (event): Promise<CmsCreatedPreviewLink> => {
   const access = await requirePreviewLinkAccess(
      event,
      getRouterParam(event, 'collection') ?? '',
      'update'
   )
   const input = await readValidatedBody(event, previewLinkInputSchema.parse)
   markPreviewResponse(event)
   return createPreviewLink(access, getRouterParam(event, 'id') ?? '', input)
})
