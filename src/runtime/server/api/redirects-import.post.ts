import { defineEventHandler, readValidatedBody } from 'h3'
import { z } from 'zod'
import { REDIRECT_IMPORT_MAX_ROWS } from '../../shared/index'
import type { RedirectImportResult } from '../utils/redirects'
import { importRedirects, redirectInputSchema, requireRedirectsAccess } from '../utils/redirects'

const bodySchema = z.object({
   redirects: z.array(redirectInputSchema).min(1).max(REDIRECT_IMPORT_MAX_ROWS),
})

export default defineEventHandler(async (event): Promise<RedirectImportResult> => {
   await requireRedirectsAccess(event)
   const { redirects } = await readValidatedBody(event, bodySchema.parse)
   return importRedirects(redirects)
})
