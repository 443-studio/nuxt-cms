import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { getRequestURL } from 'h3'
import { z } from 'zod'
import { useDb } from '#cms-db'
import { cms_settings } from '#cms-tables'
import { useRuntimeConfig } from '#imports'
import { cachedValue } from './cached-value'
import type { CmsI18n, CmsSiteSettings } from '../../shared/index'
import {
   CMS_SITE_SETTINGS_KEY,
   EMPTY_SITE_SETTINGS,
   SITE_TEXT_LIMITS,
   coerceSiteSettings,
   isForwardedHostTrusted,
   normalizeSiteUrl,
   seoRouteCacheControl,
   titleTemplateErrors,
} from '../../shared/index'

function localeTextSchema(max: number, locales: string[]) {
   return z
      .record(z.string(), z.string().max(max))
      .nullable()
      .superRefine((value, context) => {
         for (const locale of Object.keys(value ?? {})) {
            if (!locales.includes(locale))
               context.addIssue({ code: 'custom', message: `Unknown locale: ${locale}` })
         }
      })
      .transform((value) => {
         const entries = Object.entries(value ?? {})
            .map(([locale, text]) => [locale, text.trim()] as const)
            .filter(([, text]) => text)
         return entries.length ? Object.fromEntries(entries) : null
      })
}

export function siteSettingsSchema(i18n: CmsI18n) {
   const locales = i18n.locales.length ? i18n.locales : [i18n.defaultLocale]
   return z
      .object({
         name: localeTextSchema(SITE_TEXT_LIMITS.name, locales),
         titleTemplate: z
            .string()
            .max(SITE_TEXT_LIMITS.titleTemplate)
            .nullable()
            .transform((value) => value?.trim() || null)
            .superRefine((value, context) => {
               for (const message of value ? titleTemplateErrors(value) : [])
                  context.addIssue({ code: 'custom', message })
            }),
         description: localeTextSchema(SITE_TEXT_LIMITS.description, locales),
         image: z.string().min(1).max(1024).nullable(),
         hidden: z.boolean(),
      })
      .strict()
}

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
