import type { CmsRedirectStatus } from '#nuxt-cms'

export const REDIRECT_STATUS_LABELS: Record<CmsRedirectStatus, string> = {
   301: 'Moved permanently',
   302: 'Found (temporary)',
   307: 'Temporary redirect',
   308: 'Permanent redirect',
}

export const REDIRECT_STATUS_OPTIONS = (
   Object.entries(REDIRECT_STATUS_LABELS) as [string, string][]
).map(([status, label]) => ({ value: Number(status), label: `${status} ${label}` }))
