import { describe, expect, it } from 'vitest'
import {
   PREVIEW_LINK_DURATIONS,
   hasPreviewQuery,
   isPreviewLinkActive,
   isPreviewLinkDuration,
   isPreviewToken,
   previewBannerErrors,
   previewGrantAllows,
   previewLinkExpiry,
   previewLinkUrl,
   previewTokenFrom,
} from '../src/runtime/shared/index'

const TOKEN = 'AbC-_0123456789abcdefghijklmnopqrstuvwxyzAB'

describe('preview tokens', () => {
   it('accepts only 43 character base64url tokens', () => {
      expect(TOKEN).toHaveLength(43)
      expect(isPreviewToken(TOKEN)).toBe(true)
      expect(isPreviewToken(`${TOKEN}C`)).toBe(false)
      expect(isPreviewToken(TOKEN.replace('-', '+'))).toBe(false)
      expect(isPreviewToken(42)).toBe(false)
   })

   it('reads the token from a query value', () => {
      expect(previewTokenFrom(TOKEN)).toBe(TOKEN)
      expect(previewTokenFrom([TOKEN, 'other'])).toBe(TOKEN)
      expect(previewTokenFrom('short')).toBeNull()
      expect(previewTokenFrom(undefined)).toBeNull()
      expect(previewTokenFrom(null)).toBeNull()
   })

   it('builds the shareable link from the item path', () => {
      expect(previewLinkUrl('/news/spring', TOKEN)).toBe(`/news/spring?cms-preview=${TOKEN}`)
      expect(previewLinkUrl('/news/spring?ref=x#top', TOKEN)).toBe(
         `/news/spring?ref=x&cms-preview=${TOKEN}#top`
      )
   })

   it('detects the query parameter on a request path', () => {
      expect(hasPreviewQuery(`/news/spring?cms-preview=${TOKEN}`)).toBe(true)
      expect(hasPreviewQuery('/news/spring?a=1&cms-preview')).toBe(true)
      expect(hasPreviewQuery('/news/spring?xcms-preview=1')).toBe(false)
      expect(hasPreviewQuery('/news/cms-preview')).toBe(false)
      expect(hasPreviewQuery('/news#cms-preview=1')).toBe(false)
   })
})

describe('preview link durations and expiry', () => {
   it('offers durations from one hour up to 30 days', () => {
      expect(PREVIEW_LINK_DURATIONS.map((option) => option.value)).toEqual([
         '1h',
         '1d',
         '7d',
         '30d',
      ])
      expect(Math.max(...PREVIEW_LINK_DURATIONS.map((option) => option.ms))).toBe(
         30 * 24 * 3_600_000
      )
      expect(isPreviewLinkDuration('7d')).toBe(true)
      expect(isPreviewLinkDuration('90d')).toBe(false)
   })

   it('computes the expiry from now', () => {
      const now = new Date('2026-05-01T10:00:00.000Z')
      expect(previewLinkExpiry('1h', now)).toBe('2026-05-01T11:00:00.000Z')
      expect(previewLinkExpiry('30d', now)).toBe('2026-05-31T10:00:00.000Z')
   })

   it('treats revoked and expired links as inactive', () => {
      const now = new Date('2026-05-01T10:00:00.000Z')
      const link = { expiresAt: '2026-05-01T10:00:01.000Z', revokedAt: null }
      expect(isPreviewLinkActive(link, now)).toBe(true)
      expect(isPreviewLinkActive({ ...link, expiresAt: now.toISOString() }, now)).toBe(false)
      expect(isPreviewLinkActive({ ...link, revokedAt: '2026-05-01T09:00:00.000Z' }, now)).toBe(
         false
      )
      expect(isPreviewLinkActive({ ...link, expiresAt: 'soon' }, now)).toBe(false)
   })
})

describe('preview grants', () => {
   const grant = { entry: 'news', itemId: 'n1', expiresAt: '2999-01-01T00:00:00.000Z' }

   it('scopes a grant to one entry and one item', () => {
      expect(previewGrantAllows(grant, 'news')).toBe(true)
      expect(previewGrantAllows(grant, 'news', 'n1')).toBe(true)
      expect(previewGrantAllows(grant, 'news', 'n2')).toBe(false)
      expect(previewGrantAllows(grant, 'blog', 'n1')).toBe(false)
      expect(previewGrantAllows(null, 'news')).toBe(false)
   })
})

describe('preview banner option', () => {
   it('accepts a boolean or nothing', () => {
      expect(previewBannerErrors(undefined)).toEqual([])
      expect(previewBannerErrors(false)).toEqual([])
      expect(previewBannerErrors('no')).toEqual(['preview.banner must be a boolean, got "no"'])
   })
})
