import { defineEventHandler, readValidatedBody } from 'h3'
import { z } from 'zod'
import { REDIRECT_IMPORT_MAX_ROWS } from '../../shared/index'
import type { RedirectImportResult } from '../utils/redirects'
import { requireCmsPermission } from '../utils/permissions'
import { importRedirects, redirectInputSchema } from '../utils/redirects'

const bodySchema = z.object({
   redirects: z.array(redirectInputSchema).min(1).max(REDIRECT_IMPORT_MAX_ROWS),
})

export default defineEventHandler(async (event): Promise<RedirectImportResult> => {
   await requireCmsPermission(event, 'redirects.manage')
   const { redirects } = await readValidatedBody(event, bodySchema.parse)
   return importRedirects(redirects)
})
