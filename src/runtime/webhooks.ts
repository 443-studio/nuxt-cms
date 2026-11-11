import type {
   CmsEntryAction,
   CmsEntryStatus,
   CmsMediaAction,
   CmsEntryChange,
   CmsMediaChange,
} from './shared/hooks'
import type { CmsEntryKind } from './shared/index'

export type {
   CmsEntryAction,
   CmsEntryChange,
   CmsEntryKind,
   CmsEntryStatus,
   CmsMediaAction,
   CmsMediaChange,
}

export const CMS_WEBHOOK_SIGNATURE_HEADER = 'x-cms-signature'
export const CMS_WEBHOOK_EVENT_HEADER = 'x-cms-event'
export const CMS_WEBHOOK_DELIVERY_HEADER = 'x-cms-delivery'
export const CMS_WEBHOOK_TOLERANCE_SECONDS = 300

export type CmsWebhookEvent = `entry:${CmsEntryAction}` | `media:${CmsMediaAction}`

export interface CmsWebhookEntryPayload {
   event: `entry:${CmsEntryAction}`
   action: CmsEntryAction
   entry: string
   kind: CmsEntryKind
   ids: string[]
   path: string | null
   status: CmsEntryStatus | null
   at: string
}

export interface CmsWebhookMediaPayload {
   event: `media:${CmsMediaAction}`
   action: CmsMediaAction
   keys: string[]
   folder: string | null
   from: string | null
   at: string
}

export type CmsWebhookPayload = CmsWebhookEntryPayload | CmsWebhookMediaPayload

const encoder = new TextEncoder()

function toHex(buffer: ArrayBuffer) {
   return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function hmacHex(secret: string, message: string) {
   const key = await globalThis.crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
   )
   return toHex(await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(message)))
}

function safeEqual(a: string, b: string) {
   if (a.length !== b.length) return false
   let diff = 0
   for (let index = 0; index < a.length; index++) diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
   return diff === 0
}

export async function signCmsWebhook(
   body: string,
   secret: string,
   timestamp: number = Math.floor(Date.now() / 1000)
): Promise<string> {
   return `t=${timestamp},v1=${await hmacHex(secret, `${timestamp}.${body}`)}`
}

export function parseCmsWebhookSignature(
   header: string
): { timestamp: number; signatures: string[] } | null {
   let timestamp: number | null = null
   const signatures: string[] = []
   for (const part of header.split(',')) {
      const separator = part.indexOf('=')
      if (separator < 0) continue
      const key = part.slice(0, separator).trim()
      const value = part.slice(separator + 1).trim()
      if (key === 't' && /^\d+$/.test(value)) timestamp = Number(value)
      if (key === 'v1' && /^[0-9a-f]{64}$/.test(value)) signatures.push(value)
   }
   return timestamp === null || !signatures.length ? null : { timestamp, signatures }
}

export async function verifyCmsWebhook(
   input: Request | string,
   header: string | null | undefined,
   secret: string,
   toleranceSeconds: number = CMS_WEBHOOK_TOLERANCE_SECONDS
): Promise<CmsWebhookPayload | null> {
   if (!secret) return null
   const signatureHeader =
      header ?? (typeof input === 'string' ? null : input.headers.get(CMS_WEBHOOK_SIGNATURE_HEADER))
   if (!signatureHeader) return null
   const parsed = parseCmsWebhookSignature(signatureHeader)
   if (!parsed) return null
   if (Math.abs(Math.floor(Date.now() / 1000) - parsed.timestamp) > toleranceSeconds) return null
   const body = typeof input === 'string' ? input : await input.text()
   const expected = await hmacHex(secret, `${parsed.timestamp}.${body}`)
   if (!parsed.signatures.some((signature) => safeEqual(signature, expected))) return null
   try {
      const payload = JSON.parse(body) as unknown
      return payload && typeof payload === 'object' ? (payload as CmsWebhookPayload) : null
   } catch {
      return null
   }
}
