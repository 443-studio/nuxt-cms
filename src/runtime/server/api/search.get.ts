import { defineEventHandler, getValidatedQuery } from 'h3'
import { z } from 'zod'
import cmsConfig from '#cms-config'
import { cmsDialect, useDb } from '#cms-db'
import * as cmsTables from '#cms-tables'
import type { CmsConfig } from '../../shared/index'
import type { CmsSearchResponse } from '../../shared/search'
import { CMS_SEARCH_MAX_LENGTH } from '../../shared/search'
import { getContentI18n } from '../utils/registry'
import { requireCmsAccess } from '../utils/permissions'
import { can } from '../../shared/roles'
import type { SearchDb } from '../utils/search'
import { searchCms } from '../utils/search'

const querySchema = z.object({
   q: z.string().max(CMS_SEARCH_MAX_LENGTH).default(''),
})

export default defineEventHandler(async (event): Promise<CmsSearchResponse> => {
   const { access } = await requireCmsAccess(event)
   const { q } = await getValidatedQuery(event, querySchema.parse)
   const readable = Object.fromEntries(
      Object.entries(cmsConfig as CmsConfig).filter(([name]) => can(access, `${name}.read`))
   )
   return searchCms({
      db: useDb() as unknown as SearchDb,
      dialect: cmsDialect,
      config: readable,
      media: can(access, 'media.read'),
      tables: cmsTables as Record<string, unknown>,
      i18n: getContentI18n(),
      query: q,
   })
})
