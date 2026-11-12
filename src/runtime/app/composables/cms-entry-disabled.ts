import type { AsyncData } from 'nuxt/app'
import type {
   CmsCollectionName,
   CmsCollectionTypes,
   CmsContentName,
   CmsContentRouteMatch,
   CmsContentTypes,
   CmsPagePath,
   CmsPageTypes,
   CmsSingleName,
   CmsSingleTypes,
} from '#cms-types'
import { useAsyncData } from '#imports'
import type { CmsAsyncDataOptions } from './cms-query-disabled'

export interface CmsSortInput<Entry> {
   field: Extract<keyof Entry, string>
   direction?: 'asc' | 'desc'
}

export interface CmsEntryQuery {
   locale?: string
}

export interface CmsListQuery<Entry> extends CmsEntryQuery {
   filters?: Record<string, unknown>
   sort?: CmsSortInput<Entry>[]
   limit?: number
   offset?: number
}

export interface CmsSingleOptions<ResT, DefaultT>
   extends CmsAsyncDataOptions<ResT, DefaultT>,
      CmsEntryQuery {}

export interface CmsPageOptions<ResT, DefaultT>
   extends CmsAsyncDataOptions<ResT, DefaultT>,
      CmsEntryQuery {}

export interface CmsCollectionOptions<ResT, DefaultT, Entry>
   extends CmsAsyncDataOptions<ResT, DefaultT>,
      CmsListQuery<Entry> {}

export interface CmsContentOptions<ResT, DefaultT>
   extends CmsAsyncDataOptions<ResT, DefaultT>,
      CmsEntryQuery {}

export type CmsContentsOptions<ResT, DefaultT, Entry> = CmsCollectionOptions<ResT, DefaultT, Entry>

export interface CmsRouteOptions<ResT, DefaultT>
   extends CmsAsyncDataOptions<ResT, DefaultT>,
      CmsEntryQuery {}

export async function $cmsSingle<K extends CmsSingleName>(
   name: K,
   query: CmsEntryQuery = {}
): Promise<CmsSingleTypes[K] | null> {
   return null
}

export async function $cmsCollection<K extends CmsCollectionName>(
   name: K,
   query: CmsListQuery<CmsCollectionTypes[K]> = {}
): Promise<CmsCollectionTypes[K][]> {
   return []
}

export async function $cmsContents<K extends CmsContentName>(
   name: K,
   query: CmsListQuery<CmsContentTypes[K]> = {}
): Promise<CmsContentTypes[K][]> {
   return []
}

export async function $cmsContent<K extends CmsContentName>(
   name: K,
   slug: string,
   query: CmsEntryQuery = {}
): Promise<CmsContentTypes[K] | null> {
   return null
}

export async function $cmsPage<P extends CmsPagePath>(
   path: P,
   query: CmsEntryQuery = {}
): Promise<CmsPageTypes[P] | null> {
   return null
}

export async function $cmsRoute(
   path: string,
   query: CmsEntryQuery = {}
): Promise<CmsContentRouteMatch | null> {
   return null
}

export function useCmsSingle<K extends CmsSingleName, DefaultT = null>(
   name: K,
   options: CmsSingleOptions<CmsSingleTypes[K] | null, DefaultT> = {}
): AsyncData<CmsSingleTypes[K] | DefaultT | null, Error | undefined> {
   const { locale, key, default: fallback } = options
   return useAsyncData(key ?? `cms-single:${String(name)}:${locale ?? ''}`, async () =>
      fallback ? fallback() : null
   ) as unknown as AsyncData<CmsSingleTypes[K] | DefaultT | null, Error | undefined>
}

export function useCmsCollection<K extends CmsCollectionName, DefaultT = CmsCollectionTypes[K][]>(
   name: K,
   options: CmsCollectionOptions<CmsCollectionTypes[K][], DefaultT, CmsCollectionTypes[K]> = {}
): AsyncData<CmsCollectionTypes[K][] | DefaultT, Error | undefined> {
   const { locale, filters, sort, limit, offset, key, default: fallback } = options
   const variables = { locale, filters, sort, limit, offset }
   return useAsyncData(
      key ?? `cms-collection:${String(name)}:${JSON.stringify(variables)}`,
      async () => (fallback ? fallback() : [])
   ) as unknown as AsyncData<CmsCollectionTypes[K][] | DefaultT, Error | undefined>
}

export function useCmsContents<K extends CmsContentName, DefaultT = CmsContentTypes[K][]>(
   name: K,
   options: CmsContentsOptions<CmsContentTypes[K][], DefaultT, CmsContentTypes[K]> = {}
): AsyncData<CmsContentTypes[K][] | DefaultT, Error | undefined> {
   const { locale, filters, sort, limit, offset, key, default: fallback } = options
   const variables = { locale, filters, sort, limit, offset }
   return useAsyncData(
      key ?? `cms-contents:${String(name)}:${JSON.stringify(variables)}`,
      async () => (fallback ? fallback() : [])
   ) as unknown as AsyncData<CmsContentTypes[K][] | DefaultT, Error | undefined>
}

export function useCmsContent<K extends CmsContentName, DefaultT = null>(
   name: K,
   slug: string,
   options: CmsContentOptions<CmsContentTypes[K] | null, DefaultT> = {}
): AsyncData<CmsContentTypes[K] | DefaultT | null, Error | undefined> {
   const { locale, key, default: fallback } = options
   return useAsyncData(key ?? `cms-content:${String(name)}:${slug}:${locale ?? ''}`, async () =>
      fallback ? fallback() : null
   ) as unknown as AsyncData<CmsContentTypes[K] | DefaultT | null, Error | undefined>
}

export function useCmsPage<P extends CmsPagePath, DefaultT = null>(
   path: P,
   options: CmsPageOptions<CmsPageTypes[P] | null, DefaultT> = {}
): AsyncData<CmsPageTypes[P] | DefaultT | null, Error | undefined> {
   const { locale, key, default: fallback } = options
   return useAsyncData(key ?? `cms-page:${String(path)}:${locale ?? ''}`, async () =>
      fallback ? fallback() : null
   ) as unknown as AsyncData<CmsPageTypes[P] | DefaultT | null, Error | undefined>
}

export function useCmsRoute<DefaultT = null>(
   path: string,
   options: CmsRouteOptions<CmsContentRouteMatch | null, DefaultT> = {}
): AsyncData<CmsContentRouteMatch | DefaultT | null, Error | undefined> {
   const { locale, key, default: fallback } = options
   return useAsyncData(key ?? `cms-route:${path}:${locale ?? ''}`, async () =>
      fallback ? fallback() : null
   ) as unknown as AsyncData<CmsContentRouteMatch | DefaultT | null, Error | undefined>
}
