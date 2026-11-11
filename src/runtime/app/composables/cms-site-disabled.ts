import type { AsyncData } from 'nuxt/app'
import { useAsyncData } from '#imports'
import type { CmsSite } from '../../shared/index'
import type { CmsAsyncDataOptions } from './cms-query-disabled'

export interface CmsSiteOptions<DefaultT> extends CmsAsyncDataOptions<CmsSite | null, DefaultT> {
   locale?: string
}

export function useCmsSite<DefaultT = null>(
   options: CmsSiteOptions<DefaultT> = {}
): AsyncData<CmsSite | DefaultT | null, Error | undefined> {
   const { locale, key, default: fallback } = options
   return useAsyncData(key ?? `cms-site:${locale ?? ''}`, async () =>
      fallback ? fallback() : null
   ) as unknown as AsyncData<CmsSite | DefaultT | null, Error | undefined>
}
