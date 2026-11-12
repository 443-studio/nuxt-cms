import { defineEventHandler } from 'h3'
import type { CmsPreviewMode } from '../../shared/index'
import { markPreviewResponse, readPreviewGrant } from '../utils/preview-links'

export default defineEventHandler(async (event): Promise<CmsPreviewMode | null> => {
   markPreviewResponse(event)
   const grant = await readPreviewGrant(event)
   return grant ? { entry: grant.entry, id: grant.itemId, expiresAt: grant.expiresAt } : null
})
