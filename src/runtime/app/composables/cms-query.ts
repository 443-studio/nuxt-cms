import type { CmsResult, CmsVariables } from '#cms-graphql'
import type { AsyncData, AsyncDataOptions } from 'nuxt/app'
import { tryUseNuxtApp, useAsyncData } from '#imports'
import {
   CMS_GRAPHQL_BATCH_LIMIT,
   PREVIEW_HEADER,
   PREVIEW_QUERY_PARAM,
   previewTokenFrom,
} from '../../shared/index'

interface GraphqlResponse<T> {
   data?: T
   errors?: { message: string }[]
}

export interface CmsAsyncDataOptions<ResT, DefaultT>
   extends Pick<
      AsyncDataOptions<ResT>,
      'server' | 'lazy' | 'immediate' | 'deep' | 'dedupe' | 'watch' | 'getCachedData'
   > {
   key?: string
   default?: () => DefaultT
}

interface GraphqlRequest {
   query: string
   variables?: unknown
}

interface PendingRequest {
   body: GraphqlRequest
   resolve: (response: GraphqlResponse<unknown>) => void
   reject: (error: unknown) => void
}

const ENDPOINT = '/api/cms/graphql'

const inFlight = new Map<string, Promise<GraphqlResponse<unknown>>>()
let queues = new Map<string, PendingRequest[]>()
let scheduled = false

function responseError(response: GraphqlResponse<unknown> | undefined) {
   return new Error(
      response?.errors?.map((e) => e.message).join('; ') || 'Invalid batched GraphQL response'
   )
}

async function sendBatch(batch: PendingRequest[], preview: string) {
   const headers = preview ? { headers: { [PREVIEW_HEADER]: preview } } : {}
   try {
      if (batch.length === 1) {
         batch[0]!.resolve(
            await $fetch<GraphqlResponse<unknown>>(ENDPOINT, {
               method: 'POST',
               body: batch[0]!.body,
               ...headers,
            })
         )
         return
      }
      const responses = await $fetch<GraphqlResponse<unknown>[] | GraphqlResponse<unknown>>(
         ENDPOINT,
         { method: 'POST', body: batch.map((pending) => pending.body), ...headers }
      )
      if (!Array.isArray(responses)) throw responseError(responses)
      batch.forEach((pending, index) => {
         const response = responses[index]
         if (response) pending.resolve(response)
         else pending.reject(responseError(response))
      })
   } catch (error) {
      for (const pending of batch) pending.reject(error)
   }
}

function flushQueue() {
   const pending = queues
   queues = new Map()
   scheduled = false
   for (const [preview, list] of pending) {
      for (let index = 0; index < list.length; index += CMS_GRAPHQL_BATCH_LIMIT) {
         void sendBatch(list.slice(index, index + CMS_GRAPHQL_BATCH_LIMIT), preview)
      }
   }
}

function enqueue(body: GraphqlRequest, preview: string): Promise<GraphqlResponse<unknown>> {
   return new Promise<GraphqlResponse<unknown>>((resolve, reject) => {
      const queue = queues.get(preview) ?? []
      queue.push({ body, resolve, reject })
      queues.set(preview, queue)
      if (!scheduled) {
         scheduled = true
         setTimeout(flushQueue, 0)
      }
   })
}

function requestGraphql(
   body: GraphqlRequest,
   preview: string | null
): Promise<GraphqlResponse<unknown>> {
   if (preview) return enqueue(body, preview)
   const key = JSON.stringify(body)
   const existing = inFlight.get(key)
   if (existing) return existing
   const request = enqueue(body, '').finally(() => inFlight.delete(key))
   inFlight.set(key, request)
   return request
}

export function cmsPreviewToken(): string | null {
   return previewTokenFrom(tryUseNuxtApp()?._route?.query?.[PREVIEW_QUERY_PARAM])
}

export function cmsPreviewKey(key: string, preview: string | null) {
   return preview ? `${key}:cms-preview` : key
}

export function cmsQueryKey(query: string, variables?: unknown) {
   return `cms-gql:${query}:${JSON.stringify(variables ?? {})}`
}

export async function cmsQueryWithPreview<const Q extends string>(
   query: Q,
   variables: CmsVariables<Q> | undefined,
   preview: string | null
): Promise<CmsResult<Q>> {
   const res = (await requestGraphql({ query, variables }, preview)) as GraphqlResponse<
      CmsResult<Q>
   >
   if (res.errors?.length) {
      throw new Error(res.errors.map((e) => e.message).join('; '))
   }
   return res.data as CmsResult<Q>
}

export function $cmsQuery<const Q extends string>(
   query: Q,
   variables?: CmsVariables<Q>
): Promise<CmsResult<Q>> {
   return cmsQueryWithPreview(query, variables, cmsPreviewToken())
}

export function useCms<const Q extends string, DefaultT = undefined>(
   query: Q,
   variables?: CmsVariables<Q>,
   options: CmsAsyncDataOptions<CmsResult<Q>, DefaultT> = {}
): AsyncData<CmsResult<Q> | DefaultT | undefined, Error | undefined> {
   const { key, ...asyncDataOptions } = options
   const preview = cmsPreviewToken()
   return useAsyncData<CmsResult<Q>>(
      key ?? cmsPreviewKey(cmsQueryKey(query, variables), preview),
      () => cmsQueryWithPreview(query, variables, preview),
      asyncDataOptions as AsyncDataOptions<CmsResult<Q>>
   ) as AsyncData<CmsResult<Q> | DefaultT | undefined, Error | undefined>
}
