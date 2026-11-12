import { CMS_ENTRY_ACTIONS, CMS_MEDIA_ACTIONS } from './runtime/shared/hooks'
import type { CmsWebhookEvent } from './runtime/webhooks'

export type CmsWebhookEventFilter = 'entry' | 'media' | CmsWebhookEvent

export interface ModuleOptionsWebhook {
   name: string
   url?: string
   secret?: string
   events?: CmsWebhookEventFilter[]
   timeout?: number
}

export interface ResolvedWebhook {
   url: string
   secret: string
   events: CmsWebhookEventFilter[]
   timeout: number
}

export const DEFAULT_WEBHOOK_TIMEOUT = 5000
export const MAX_WEBHOOK_TIMEOUT = 30000
export const MIN_WEBHOOK_SECRET_LENGTH = 16

const WEBHOOK_KEYS = new Set(['name', 'url', 'secret', 'events', 'timeout'])
const WEBHOOK_NAME_PATTERN = /^[a-z]+(?:[A-Z][a-z]+)*[0-9]*$/

export const WEBHOOK_EVENT_FILTERS: readonly CmsWebhookEventFilter[] = [
   'entry',
   'media',
   ...CMS_ENTRY_ACTIONS.map((action) => `entry:${action}` as const),
   ...CMS_MEDIA_ACTIONS.map((action) => `media:${action}` as const),
]

export function webhookEnvName(name: string, key: 'url' | 'secret') {
   return `NUXT_CMS_WEBHOOKS_${name
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .toUpperCase()}_${key.toUpperCase()}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
   return !!value && typeof value === 'object' && !Array.isArray(value)
}

function urlError(label: string, url: string) {
   try {
      const parsed = new URL(url)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return null
   } catch {
      return `${label}.url '${url}' is not a valid URL`
   }
   return `${label}.url '${url}' must use http or https`
}

export function resolveWebhooks(
   input: unknown,
   env: Record<string, string | undefined> = {}
): { webhooks: Record<string, ResolvedWebhook>; errors: string[]; warnings: string[] } {
   const webhooks: Record<string, ResolvedWebhook> = {}
   const errors: string[] = []
   const warnings: string[] = []
   if (input === undefined) return { webhooks, errors, warnings }
   if (!Array.isArray(input)) {
      return {
         webhooks,
         errors: ['webhooks must be an array of { name, url, secret, events }'],
         warnings,
      }
   }
   input.forEach((item, index) => {
      const label = `webhooks[${index}]`
      if (!isRecord(item)) {
         errors.push(`${label} must be an object`)
         return
      }
      for (const key of Object.keys(item)) {
         if (!WEBHOOK_KEYS.has(key)) errors.push(`${label} has an unknown key '${key}'`)
      }
      const { name, url, secret, events, timeout } = item
      if (typeof name !== 'string' || !WEBHOOK_NAME_PATTERN.test(name)) {
         errors.push(
            `${label}.name must be a camelCase identifier like 'deploy' or 'searchIndex', got ${JSON.stringify(
               name
            )}`
         )
         return
      }
      const named = `webhooks '${name}'`
      if (Object.hasOwn(webhooks, name)) {
         errors.push(`${named} is declared twice`)
         return
      }
      if (url !== undefined && typeof url !== 'string') errors.push(`${named}.url must be a string`)
      else if (url) {
         const error = urlError(named, url)
         if (error) errors.push(error)
      } else if (!env[webhookEnvName(name, 'url')]) {
         warnings.push(
            `${named} has no url: set ${webhookEnvName(name, 'url')} at runtime or it never fires`
         )
      }
      if (secret !== undefined && typeof secret !== 'string')
         errors.push(`${named}.secret must be a string`)
      else if (secret && secret.length < MIN_WEBHOOK_SECRET_LENGTH)
         errors.push(`${named}.secret must be at least ${MIN_WEBHOOK_SECRET_LENGTH} characters`)
      if (events !== undefined) {
         if (!Array.isArray(events) || !events.length) {
            errors.push(`${named}.events must be a non-empty array (omit it for every event)`)
         } else {
            for (const value of events) {
               if (!WEBHOOK_EVENT_FILTERS.includes(value as CmsWebhookEventFilter))
                  errors.push(
                     `${named}.events has an unknown event ${JSON.stringify(
                        value
                     )}: use 'entry', 'media', 'entry:<action>' or 'media:<action>'`
                  )
            }
         }
      }
      if (
         timeout !== undefined &&
         (typeof timeout !== 'number' ||
            !Number.isInteger(timeout) ||
            timeout < 1 ||
            timeout > MAX_WEBHOOK_TIMEOUT)
      ) {
         errors.push(`${named}.timeout must be an integer between 1 and ${MAX_WEBHOOK_TIMEOUT} ms`)
      }
      webhooks[name] = {
         url: typeof url === 'string' ? url : '',
         secret: typeof secret === 'string' ? secret : '',
         events: Array.isArray(events) ? [...new Set(events as CmsWebhookEventFilter[])] : [],
         timeout: typeof timeout === 'number' ? timeout : DEFAULT_WEBHOOK_TIMEOUT,
      }
   })
   return { webhooks, errors, warnings }
}
