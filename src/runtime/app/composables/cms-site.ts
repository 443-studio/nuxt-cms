import type { AsyncData } from 'nuxt/app'
import { useAsyncData } from '#imports'
import type { CmsSite } from '../../shared/index'
import type { CmsAsyncDataOptions } from './cms-query'
import { $cmsQuery } from './cms-query'

export interface CmsSiteOptions<DefaultT> extends CmsAsyncDataOptions<CmsSite | null, DefaultT> {
   locale?: string
}

const SITE_QUERY = `query ($locale: String) {
   cmsSite(locale: $locale) {
      name titleTemplate description hidden
      image { key url type alt mime width height }
   }
}`

export function useCmsSite<DefaultT = null>(
   options: CmsSiteOptions<DefaultT> = {}
): AsyncData<CmsSite | DefaultT | null, Error | undefined> {
   const { locale, key, default: fallback, ...asyncDataOptions } = options
   return useAsyncData(
      key ?? `cms-site:${locale ?? ''}`,
      async () => {
         const result = await $cmsQuery(SITE_QUERY, { locale })
         return (result?.cmsSite ?? null) as CmsSite | null
      },
      {
         default: (fallback ?? (() => null)) as () => CmsSite | null,
         ...asyncDataOptions,
      }
   ) as AsyncData<CmsSite | DefaultT | null, Error | undefined>
}
