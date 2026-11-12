import type { CmsEntryChange, CmsMediaChange } from '../../shared/hooks'
import type {
   CmsWebhookEntryPayload,
   CmsWebhookMediaPayload,
   CmsWebhookPayload,
} from '../../webhooks'
import {
   CMS_WEBHOOK_DELIVERY_HEADER,
   CMS_WEBHOOK_EVENT_HEADER,
   CMS_WEBHOOK_SIGNATURE_HEADER,
   signCmsWebhook,
} from '../../webhooks'

export interface CmsWebhookTarget {
   name: string
   url: string
   secret: string
   events: string[]
   timeout: number
}

export type CmsWebhookFetch = (
   url: string,
   init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }
) => Promise<{ ok: boolean; status: number }>

const DEFAULT_TIMEOUT = 5000

export function entryWebhookPayload(change: CmsEntryChange): CmsWebhookEntryPayload {
   return {
      event: `entry:${change.action}`,
      action: change.action,
      entry: change.entry,
      kind: change.kind,
      ids: change.ids,
      path: change.path,
      status: change.status,
      at: change.at,
   }
}

export function mediaWebhookPayload(change: CmsMediaChange): CmsWebhookMediaPayload {
   return {
      event: `media:${change.action}`,
      action: change.action,
      keys: change.keys,
      folder: change.folder,
      from: change.from,
      at: change.at,
   }
}

export function webhookWants(events: readonly string[], event: string): boolean {
   if (!events.length) return true
   const group = event.slice(0, event.indexOf(':'))
   return events.includes(event) || events.includes(group)
}

export function webhookTargets(config: unknown): CmsWebhookTarget[] {
   if (!config || typeof config !== 'object') return []
   return Object.entries(config as Record<string, Record<string, unknown> | null>).flatMap(
      ([name, value]) => {
         const url = value?.url == null ? '' : String(value.url)
         if (!url) return []
         const timeout = Number(value?.timeout)
         return [
            {
               name,
               url,
               secret: value?.secret == null ? '' : String(value.secret),
               events: Array.isArray(value?.events) ? value.events.map(String) : [],
               timeout: Number.isInteger(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT,
            },
         ]
      }
   )
}

function describeTarget(target: CmsWebhookTarget) {
   try {
      return `'${target.name}' (${new URL(target.url).host})`
   } catch {
      return `'${target.name}'`
   }
}

export async function deliverWebhook(
   target: CmsWebhookTarget,
   payload: CmsWebhookPayload,
   fetcher: CmsWebhookFetch = globalThis.fetch as unknown as CmsWebhookFetch
): Promise<void> {
   const body = JSON.stringify(payload)
   const headers: Record<string, string> = {
      'content-type': 'application/json',
      'user-agent': 'nuxt-cms-webhooks',
      [CMS_WEBHOOK_EVENT_HEADER]: payload.event,
      [CMS_WEBHOOK_DELIVERY_HEADER]: globalThis.crypto.randomUUID(),
   }
   if (target.secret)
      headers[CMS_WEBHOOK_SIGNATURE_HEADER] = await signCmsWebhook(body, target.secret)
   const response = await fetcher(target.url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(target.timeout),
   })
   if (!response.ok) throw new Error(`HTTP ${response.status}`)
}

export async function deliverWebhooks(
   targets: CmsWebhookTarget[],
   payload: CmsWebhookPayload,
   fetcher?: CmsWebhookFetch,
   log: (message: string) => void = (message) => console.warn(message)
): Promise<void> {
   await Promise.all(
      targets
         .filter((target) => webhookWants(target.events, payload.event))
         .map((target) =>
            deliverWebhook(target, payload, fetcher).catch((error: unknown) => {
               const reason =
                  error instanceof Error
                     ? error.name === 'TimeoutError'
                        ? `timed out after ${target.timeout} ms`
                        : error.message
                     : String(error)
               log(
                  `[nuxt-cms] webhook ${describeTarget(target)} failed on ${
                     payload.event
                  }: ${reason}`
               )
            })
         )
   )
}
