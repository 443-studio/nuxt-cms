import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { getRequestURL } from 'h3'
import { useDb } from '#cms-db'
import { cms_settings } from '#cms-tables'
import { useRuntimeConfig } from '#imports'
import { cachedValue } from './cached-value'
import type { CmsSiteSettings } from '../../shared/index'
import {
   CMS_SITE_SETTINGS_KEY,
   EMPTY_SITE_SETTINGS,
   coerceSiteSettings,
   isForwardedHostTrusted,
   normalizeSiteUrl,
   seoRouteCacheControl,
} from '../../shared/index'

export { siteSettingsSchema } from './site-schema'

export function parseSiteSettings(raw: string | null | undefined): CmsSiteSettings {
   if (!raw) return { ...EMPTY_SITE_SETTINGS }
   try {
      return coerceSiteSettings(JSON.parse(raw))
   } catch {
      return { ...EMPTY_SITE_SETTINGS }
   }
}

export async function readSiteSettings(): Promise<CmsSiteSettings> {
   const [row] = await useDb()
      .select({ value: cms_settings.value })
      .from(cms_settings)
      .where(eq(cms_settings.key, CMS_SITE_SETTINGS_KEY))
      .limit(1)
   return parseSiteSettings(row?.value)
}

export const SITE_SETTINGS_CACHE_TTL_MS = 30_000

const siteSettingsCache = cachedValue(readSiteSettings, SITE_SETTINGS_CACHE_TTL_MS)

export function readCachedSiteSettings(): Promise<CmsSiteSettings> {
   return siteSettingsCache.get()
}

export async function writeSiteSettings(settings: CmsSiteSettings): Promise<void> {
   const value = JSON.stringify(settings)
   const updatedAt = new Date().toISOString()
   await useDb()
      .insert(cms_settings)
      .values({ key: CMS_SITE_SETTINGS_KEY, value, updatedAt })
      .onConflictDoUpdate({ target: cms_settings.key, set: { value, updatedAt } })
   siteSettingsCache.invalidate()
}

export function configuredSiteUrl(event: H3Event): string {
   const { siteUrl } = useRuntimeConfig(event).public as { siteUrl?: string }
   return normalizeSiteUrl(siteUrl)
}

export function trustsForwardedHost(event: H3Event): boolean {
   const config = useRuntimeConfig(event).public as { cmsTrustForwardedHost?: unknown }
   return isForwardedHostTrusted(config.cmsTrustForwardedHost)
}

export function resolveSiteUrl(event: H3Event): string {
   const trusted = trustsForwardedHost(event)
   return (
      configuredSiteUrl(event) ||
      getRequestURL(event, { xForwardedHost: trusted, xForwardedProto: trusted }).origin
   )
}

export function seoRouteCacheHeader(event: H3Event): string {
   return seoRouteCacheControl(configuredSiteUrl(event))
}
