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
import {
   cmsCollectionQueries,
   cmsContentItemQueries,
   cmsContentQueries,
   cmsPageQueries,
   cmsRouteEntries,
   cmsRouteQuery,
   cmsSingleQueries,
} from '#cms-queries'
import { useAsyncData } from '#imports'
import type { CmsAsyncDataOptions } from './cms-query'
import { cmsPreviewKey, cmsPreviewToken, cmsQueryWithPreview } from './cms-query'

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

function unknownEntry(name: string): never {
   throw new Error(`[nuxt-cms] no generated query for "${name}"; check cms.config.ts`)
}

function listVariables<Entry>({ locale, filters, sort, limit, offset }: CmsListQuery<Entry>) {
   return { locale, filters, sort, limit, offset }
}

async function fetchSingle<K extends CmsSingleName>(
   name: K,
   { locale }: CmsEntryQuery,
   preview: string | null
) {
   const entryName = String(name)
   const query = cmsSingleQueries[entryName]
   if (!query) unknownEntry(entryName)
   const result = await cmsQueryWithPreview(query, { locale }, preview)
   return (result?.[entryName] ?? null) as CmsSingleTypes[K] | null
}

async function fetchCollection<K extends CmsCollectionName>(
   name: K,
   listQuery: CmsListQuery<CmsCollectionTypes[K]>,
   preview: string | null
) {
   const entryName = String(name)
   const query = cmsCollectionQueries[entryName]
   if (!query) unknownEntry(entryName)
   const result = await cmsQueryWithPreview(query, listVariables(listQuery), preview)
   return (result?.[entryName] ?? []) as CmsCollectionTypes[K][]
}

async function fetchContents<K extends CmsContentName>(
   name: K,
   listQuery: CmsListQuery<CmsContentTypes[K]>,
   preview: string | null
) {
   const entryName = String(name)
   const query = cmsContentQueries[entryName]
   if (!query) unknownEntry(entryName)
   const result = await cmsQueryWithPreview(query, listVariables(listQuery), preview)
   return (result?.[entryName] ?? []) as CmsContentTypes[K][]
}

async function fetchContent<K extends CmsContentName>(
   name: K,
   slug: string,
   { locale }: CmsEntryQuery,
   preview: string | null
) {
   const entryName = String(name)
   const query = cmsContentItemQueries[entryName]
   if (!query) unknownEntry(entryName)
   const result = await cmsQueryWithPreview(query, { slug, locale }, preview)
   return (result?.item ?? null) as CmsContentTypes[K] | null
}

async function fetchPage<P extends CmsPagePath>(
   path: P,
   { locale }: CmsEntryQuery,
   preview: string | null
) {
   const pagePath = String(path)
   const query = cmsPageQueries[pagePath]
   if (!query) unknownEntry(pagePath)
   const result = await cmsQueryWithPreview(query, { path: pagePath, locale }, preview)
   return (result?.page ?? null) as CmsPageTypes[P] | null
}

async function fetchRoute(path: string, { locale }: CmsEntryQuery, preview: string | null) {
   if (!cmsRouteQuery) return null
   const result = await cmsQueryWithPreview(cmsRouteQuery, { path, locale }, preview)
   const entry = cmsRouteEntries.find((name) => result?.[name])
   if (!entry) return null
   return { entry, item: result[entry] } as CmsContentRouteMatch
}

export function $cmsSingle<K extends CmsSingleName>(name: K, query: CmsEntryQuery = {}) {
   return fetchSingle(name, query, cmsPreviewToken())
}

export function $cmsCollection<K extends CmsCollectionName>(
   name: K,
   query: CmsListQuery<CmsCollectionTypes[K]> = {}
) {
   return fetchCollection(name, query, cmsPreviewToken())
}

export function $cmsContents<K extends CmsContentName>(
   name: K,
   query: CmsListQuery<CmsContentTypes[K]> = {}
) {
   return fetchContents(name, query, cmsPreviewToken())
}

export function $cmsContent<K extends CmsContentName>(
   name: K,
   slug: string,
   query: CmsEntryQuery = {}
) {
   return fetchContent(name, slug, query, cmsPreviewToken())
}

export function $cmsPage<P extends CmsPagePath>(path: P, query: CmsEntryQuery = {}) {
   return fetchPage(path, query, cmsPreviewToken())
}

export function $cmsRoute(path: string, query: CmsEntryQuery = {}) {
   return fetchRoute(path, query, cmsPreviewToken())
}

export function useCmsSingle<K extends CmsSingleName, DefaultT = null>(
   name: K,
   options: CmsSingleOptions<CmsSingleTypes[K] | null, DefaultT> = {}
): AsyncData<CmsSingleTypes[K] | DefaultT | null, Error | undefined> {
   const { locale, key, default: fallback, ...asyncDataOptions } = options
   const preview = cmsPreviewToken()
   return useAsyncData(
      key ?? cmsPreviewKey(`cms-single:${String(name)}:${locale ?? ''}`, preview),
      () => fetchSingle(name, { locale }, preview),
      {
         default: (fallback ?? (() => null)) as () => CmsSingleTypes[K] | null,
         ...asyncDataOptions,
      }
   ) as AsyncData<CmsSingleTypes[K] | DefaultT | null, Error | undefined>
}

export function useCmsCollection<K extends CmsCollectionName, DefaultT = CmsCollectionTypes[K][]>(
   name: K,
   options: CmsCollectionOptions<CmsCollectionTypes[K][], DefaultT, CmsCollectionTypes[K]> = {}
): AsyncData<CmsCollectionTypes[K][] | DefaultT, Error | undefined> {
   const {
      locale,
      filters,
      sort,
      limit,
      offset,
      key,
      default: fallback,
      ...asyncDataOptions
   } = options
   const variables = { locale, filters, sort, limit, offset }
   const preview = cmsPreviewToken()
   return useAsyncData(
      key ?? cmsPreviewKey(`cms-collection:${String(name)}:${JSON.stringify(variables)}`, preview),
      () => fetchCollection(name, variables, preview),
      {
         default: (fallback ?? (() => [])) as () => CmsCollectionTypes[K][],
         ...asyncDataOptions,
      }
   ) as AsyncData<CmsCollectionTypes[K][] | DefaultT, Error | undefined>
}

export function useCmsContents<K extends CmsContentName, DefaultT = CmsContentTypes[K][]>(
   name: K,
   options: CmsContentsOptions<CmsContentTypes[K][], DefaultT, CmsContentTypes[K]> = {}
): AsyncData<CmsContentTypes[K][] | DefaultT, Error | undefined> {
   const {
      locale,
      filters,
      sort,
      limit,
      offset,
      key,
      default: fallback,
      ...asyncDataOptions
   } = options
   const variables = { locale, filters, sort, limit, offset }
   const preview = cmsPreviewToken()
   return useAsyncData(
      key ?? cmsPreviewKey(`cms-contents:${String(name)}:${JSON.stringify(variables)}`, preview),
      () => fetchContents(name, variables, preview),
      {
         default: (fallback ?? (() => [])) as () => CmsContentTypes[K][],
         ...asyncDataOptions,
      }
   ) as AsyncData<CmsContentTypes[K][] | DefaultT, Error | undefined>
}

export function useCmsContent<K extends CmsContentName, DefaultT = null>(
   name: K,
   slug: string,
   options: CmsContentOptions<CmsContentTypes[K] | null, DefaultT> = {}
): AsyncData<CmsContentTypes[K] | DefaultT | null, Error | undefined> {
   const { locale, key, default: fallback, ...asyncDataOptions } = options
   const preview = cmsPreviewToken()
   return useAsyncData(
      key ?? cmsPreviewKey(`cms-content:${String(name)}:${slug}:${locale ?? ''}`, preview),
      () => fetchContent(name, slug, { locale }, preview),
      {
         default: (fallback ?? (() => null)) as () => CmsContentTypes[K] | null,
         ...asyncDataOptions,
      }
   ) as AsyncData<CmsContentTypes[K] | DefaultT | null, Error | undefined>
}

export function useCmsPage<P extends CmsPagePath, DefaultT = null>(
   path: P,
   options: CmsPageOptions<CmsPageTypes[P] | null, DefaultT> = {}
): AsyncData<CmsPageTypes[P] | DefaultT | null, Error | undefined> {
   const { locale, key, default: fallback, ...asyncDataOptions } = options
   const preview = cmsPreviewToken()
   return useAsyncData(
      key ?? cmsPreviewKey(`cms-page:${String(path)}:${locale ?? ''}`, preview),
      () => fetchPage(path, { locale }, preview),
      {
         default: (fallback ?? (() => null)) as () => CmsPageTypes[P] | null,
         ...asyncDataOptions,
      }
   ) as AsyncData<CmsPageTypes[P] | DefaultT | null, Error | undefined>
}

export function useCmsRoute<DefaultT = null>(
   path: string,
   options: CmsRouteOptions<CmsContentRouteMatch | null, DefaultT> = {}
): AsyncData<CmsContentRouteMatch | DefaultT | null, Error | undefined> {
   const { locale, key, default: fallback, ...asyncDataOptions } = options
   const preview = cmsPreviewToken()
   return useAsyncData(
      key ?? cmsPreviewKey(`cms-route:${path}:${locale ?? ''}`, preview),
      () => fetchRoute(path, { locale }, preview),
      {
         default: (fallback ?? (() => null)) as () => CmsContentRouteMatch | null,
         ...asyncDataOptions,
      }
   ) as AsyncData<CmsContentRouteMatch | DefaultT | null, Error | undefined>
}
