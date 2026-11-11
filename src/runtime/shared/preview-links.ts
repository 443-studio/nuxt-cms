export const PREVIEW_QUERY_PARAM = 'cms-preview'

export const PREVIEW_HEADER = 'x-cms-preview'

export const PREVIEW_TOKEN_BYTES = 32

export const PREVIEW_RESPONSE_HEADERS = {
   'cache-control': 'private, no-store',
   'x-robots-tag': 'noindex, nofollow',
   'referrer-policy': 'same-origin',
} as const

const HOUR_MS = 3_600_000

export const PREVIEW_LINK_DURATIONS = [
   { value: '1h', label: '1 hour', ms: HOUR_MS },
   { value: '1d', label: '1 day', ms: 24 * HOUR_MS },
   { value: '7d', label: '7 days', ms: 7 * 24 * HOUR_MS },
   { value: '30d', label: '30 days', ms: 30 * 24 * HOUR_MS },
] as const

export type CmsPreviewLinkDuration = (typeof PREVIEW_LINK_DURATIONS)[number]['value']

export const DEFAULT_PREVIEW_LINK_DURATION: CmsPreviewLinkDuration = '1d'

export interface CmsPreviewLink {
   id: string
   entry: string
   itemId: string
   locale: string | null
   path: string
   createdBy: string | null
   createdAt: string
   expiresAt: string
}

export interface CmsCreatedPreviewLink {
   link: CmsPreviewLink
   url: string
}

export interface CmsPreviewGrant {
   entry: string
   itemId: string
   expiresAt: string
}

export interface CmsPreviewMode {
   entry: string
   id: string
   expiresAt: string
}

export interface CmsPreviewLinkState {
   expiresAt: string
   revokedAt: string | null
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export function isPreviewToken(value: unknown): value is string {
   return typeof value === 'string' && TOKEN_PATTERN.test(value)
}

export function previewTokenFrom(value: unknown): string | null {
   const candidate = Array.isArray(value) ? value[0] : value
   return isPreviewToken(candidate) ? candidate : null
}

export function hasPreviewQuery(path: string): boolean {
   const query = path.replace(/#.*$/s, '').split('?').slice(1).join('?')
   return query.split('&').some((part) => part.split('=')[0] === PREVIEW_QUERY_PARAM)
}

export function isPreviewLinkDuration(value: unknown): value is CmsPreviewLinkDuration {
   return PREVIEW_LINK_DURATIONS.some((duration) => duration.value === value)
}

export function previewLinkExpiry(duration: CmsPreviewLinkDuration, now: Date = new Date()) {
   const ms = PREVIEW_LINK_DURATIONS.find((option) => option.value === duration)!.ms
   return new Date(now.getTime() + ms).toISOString()
}

export function isPreviewLinkActive(link: CmsPreviewLinkState, now: Date = new Date()): boolean {
   if (link.revokedAt) return false
   const expires = Date.parse(link.expiresAt)
   return Number.isFinite(expires) && expires > now.getTime()
}

export function previewGrantAllows(
   grant: CmsPreviewGrant | null | undefined,
   entry: string,
   itemId?: string
): boolean {
   if (!grant || grant.entry !== entry) return false
   return itemId === undefined || grant.itemId === itemId
}

export function previewLinkUrl(path: string, token: string): string {
   const [base = '', hash] = path.split(/#(.*)/s)
   const separator = base.includes('?') ? '&' : '?'
   const url = `${base}${separator}${PREVIEW_QUERY_PARAM}=${token}`
   return hash === undefined ? url : `${url}#${hash}`
}

export function previewBannerErrors(banner: unknown): string[] {
   if (banner === undefined || typeof banner === 'boolean') return []
   return [`preview.banner must be a boolean, got ${JSON.stringify(banner)}`]
}
