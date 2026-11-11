import type { CmsLocalePath } from './content-routes'
import { normalizeTimestamp } from './timestamps'

export const CMS_SITE_SETTINGS_KEY = 'cms:site'

export const DEFAULT_TITLE_TEMPLATE = '%s | %siteName'

export const TITLE_PLACEHOLDER = '%s'

export const SITE_NAME_PLACEHOLDER = '%siteName'

export const SITEMAP_PATH = '/sitemap.xml'

export const ROBOTS_PATH = '/robots.txt'

export const SITEMAP_MAX_URLS = 50000

export const SEO_ADMIN_PREFIX = '/cms'

export const SITE_TEXT_LIMITS = { name: 200, titleTemplate: 200, description: 1000 } as const

export const SITEMAP_CONFLICT_MODULES = ['@nuxtjs/sitemap', 'nuxt-simple-sitemap']

export const ROBOTS_CONFLICT_MODULES = ['@nuxtjs/robots', 'nuxt-simple-robots']

export type CmsLocaleText = Record<string, string> | null

export interface CmsSiteSettings {
   name: CmsLocaleText
   titleTemplate: string | null
   description: CmsLocaleText
   image: string | null
   hidden: boolean
}

export const EMPTY_SITE_SETTINGS: CmsSiteSettings = {
   name: null,
   titleTemplate: null,
   description: null,
   image: null,
   hidden: false,
}

function coerceLocaleText(value: unknown): CmsLocaleText {
   if (!value || typeof value !== 'object' || Array.isArray(value)) return null
   const entries = Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && !!entry[1].trim()
   )
   return entries.length ? Object.fromEntries(entries) : null
}

export function coerceSiteSettings(value: unknown): CmsSiteSettings {
   if (!value || typeof value !== 'object' || Array.isArray(value))
      return { ...EMPTY_SITE_SETTINGS }
   const raw = value as Record<string, unknown>
   return {
      name: coerceLocaleText(raw.name),
      titleTemplate:
         typeof raw.titleTemplate === 'string' && raw.titleTemplate.trim()
            ? raw.titleTemplate
            : null,
      description: coerceLocaleText(raw.description),
      image: typeof raw.image === 'string' && raw.image ? raw.image : null,
      hidden: raw.hidden === true,
   }
}

export interface CmsSeoMedia {
   url: string | null
   type?: string | null
   alt?: string | null
   width?: number | null
   height?: number | null
   mime?: string | null
}

export interface CmsSite {
   name: string | null
   titleTemplate: string | null
   description: string | null
   image: CmsSeoMedia | null
   hidden: boolean
}

export interface CmsSeoSource {
   title?: string | null
   seoTitle?: string | null
   description?: string | null
   excerpt?: string | null
   seoDescription?: string | null
   cover?: CmsSeoMedia | null
   seoImage?: CmsSeoMedia | null
   seoNoindex?: boolean | null
   path?: string | null
   paths?: readonly CmsLocalePath[] | null
   publishedAt?: string | null
   updatedAt?: string | null
}

export type CmsSeoType = 'website' | 'article'

export interface CmsSeoOverrides {
   title?: string | null
   description?: string | null
   image?: string | CmsSeoMedia | null
   path?: string | null
   alternates?: readonly CmsLocalePath[] | null
   noindex?: boolean | null
   type?: CmsSeoType
   titleTemplate?: string | false | null
}

export interface CmsSeoContext {
   siteUrl: string
   path: string
   defaultLocale: string
}

export interface CmsSeoAlternate {
   hreflang: string
   href: string
}

export interface CmsSeoImage {
   url: string
   alt: string | null
   width: number | null
   height: number | null
   type: string | null
}

export interface CmsSeoMeta {
   title: string
   pageTitle: string | null
   description: string | null
   canonical: string
   image: CmsSeoImage | null
   robots: string | null
   alternates: CmsSeoAlternate[]
   type: CmsSeoType
   siteName: string | null
   publishedTime: string | null
   modifiedTime: string | null
}

export function localeText(
   value: CmsLocaleText | undefined,
   locale: string,
   defaultLocale: string
): string | null {
   if (!value) return null
   const pick = (candidate: string | undefined) =>
      typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null
   return (
      pick(value[locale]) ??
      pick(value[defaultLocale]) ??
      Object.values(value).map(pick).find(Boolean) ??
      null
   )
}

export function normalizeSiteUrl(url: string | null | undefined): string {
   return (url ?? '').trim().replace(/\/+$/, '')
}

export function isAbsoluteUrl(value: string): boolean {
   return /^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('//')
}

export function absoluteUrl(siteUrl: string, pathOrUrl: string): string {
   if (isAbsoluteUrl(pathOrUrl)) return pathOrUrl
   const base = normalizeSiteUrl(siteUrl)
   const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`
   return `${base}${path}`
}

function hasTitlePlaceholder(template: string): boolean {
   return template.split(SITE_NAME_PLACEHOLDER).join('').includes(TITLE_PLACEHOLDER)
}

export function applyTitleTemplate(
   template: string | null | undefined,
   title: string | null | undefined,
   siteName: string | null | undefined
): string {
   const page = title?.trim() || ''
   const site = siteName?.trim() || ''
   if (!page) return site
   const pattern = template?.trim() || (site ? DEFAULT_TITLE_TEMPLATE : TITLE_PLACEHOLDER)
   if (!hasTitlePlaceholder(pattern)) return page
   if (pattern.includes(SITE_NAME_PLACEHOLDER) && !site) return page
   if (site && page === site) return page
   return pattern
      .split(SITE_NAME_PLACEHOLDER)
      .map((part) => part.split(TITLE_PLACEHOLDER).join(page))
      .join(site)
}

export function titleTemplateErrors(template: string): string[] {
   return hasTitlePlaceholder(template)
      ? []
      : [`The title template needs ${TITLE_PLACEHOLDER} where the page title goes`]
}

const ENTITIES: Record<string, string> = {
   amp: '&',
   lt: '<',
   gt: '>',
   quot: '"',
   apos: "'",
   nbsp: ' ',
   '#39': "'",
}

export function plainText(value: string | null | undefined): string | null {
   if (typeof value !== 'string') return null
   const text = value
      .replace(/<[^>]*>/g, ' ')
      .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (_, name: string) => ENTITIES[name] ?? '')
      .replace(/\s+/g, ' ')
      .trim()
   return text || null
}

export function seoAlternates(
   paths: readonly CmsLocalePath[] | null | undefined,
   siteUrl: string,
   defaultLocale: string
): CmsSeoAlternate[] {
   const byLocale = new Map<string, string>()
   for (const { locale, path } of paths ?? []) {
      if (locale && path && !byLocale.has(locale)) byLocale.set(locale, path)
   }
   if (new Set(byLocale.values()).size < 2) return []
   const links = [...byLocale].map(([locale, path]) => ({
      hreflang: locale,
      href: absoluteUrl(siteUrl, path),
   }))
   const fallback = byLocale.get(defaultLocale) ?? byLocale.values().next().value!
   links.push({ hreflang: 'x-default', href: absoluteUrl(siteUrl, fallback) })
   return links
}

function cleanText(value: unknown): string | null {
   return typeof value === 'string' && value.trim() ? value.trim() : null
}

function seoImageOf(media: CmsSeoMedia | null | undefined, siteUrl: string): CmsSeoImage | null {
   if (!media?.url) return null
   if (media.type && media.type !== 'image') return null
   return {
      url: absoluteUrl(siteUrl, media.url),
      alt: media.alt ?? null,
      width: media.width ?? null,
      height: media.height ?? null,
      type: media.mime ?? null,
   }
}

function pickImage(
   candidates: (string | CmsSeoMedia | null | undefined)[],
   siteUrl: string
): CmsSeoImage | null {
   for (const candidate of candidates) {
      const image =
         typeof candidate === 'string'
            ? seoImageOf({ url: candidate }, siteUrl)
            : seoImageOf(candidate, siteUrl)
      if (image) return image
   }
   return null
}

export function resolveSeoMeta(
   source: CmsSeoSource | null | undefined,
   site: CmsSite | null | undefined,
   context: CmsSeoContext,
   overrides: CmsSeoOverrides = {}
): CmsSeoMeta {
   const item = source ?? {}
   const siteName = cleanText(site?.name)
   const pageTitle =
      cleanText(overrides.title) ?? cleanText(item.seoTitle) ?? cleanText(item.title) ?? null
   const template =
      overrides.titleTemplate === false
         ? TITLE_PLACEHOLDER
         : cleanText(overrides.titleTemplate) ?? cleanText(site?.titleTemplate)
   const description =
      plainText(overrides.description) ??
      plainText(item.seoDescription) ??
      plainText(item.excerpt) ??
      plainText(item.description) ??
      plainText(site?.description)
   const path = cleanText(overrides.path) ?? cleanText(item.path) ?? context.path
   const hidden = !!site?.hidden
   const noindex = overrides.noindex ?? item.seoNoindex ?? false
   return {
      title: applyTitleTemplate(template, pageTitle, siteName),
      pageTitle,
      description,
      canonical: absoluteUrl(context.siteUrl, path.replace(/[?#].*$/, '') || '/'),
      image: pickImage(
         overrides.image !== undefined
            ? [overrides.image]
            : [item.seoImage, item.cover, site?.image],
         context.siteUrl
      ),
      robots: hidden ? 'noindex, nofollow' : noindex ? 'noindex' : null,
      alternates: seoAlternates(
         overrides.alternates ?? item.paths,
         context.siteUrl,
         context.defaultLocale
      ),
      type: overrides.type ?? (item.publishedAt ? 'article' : 'website'),
      siteName,
      publishedTime: cleanText(item.publishedAt),
      modifiedTime: cleanText(item.updatedAt),
   }
}

export interface SitemapUrl {
   loc: string
   lastmod?: string | null
   alternates?: CmsSeoAlternate[]
}

export function escapeXml(value: string): string {
   return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
}

export const SITEMAP_URLSET_OPEN =
   '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'

export const SITEMAP_URLSET_CLOSE = '</urlset>\n'

export function renderSitemapUrl(url: SitemapUrl): string {
   const lines = ['  <url>', `    <loc>${escapeXml(url.loc)}</loc>`]
   if (url.lastmod) lines.push(`    <lastmod>${escapeXml(url.lastmod)}</lastmod>`)
   for (const alternate of url.alternates ?? []) {
      lines.push(
         `    <xhtml:link rel="alternate" hreflang="${escapeXml(
            alternate.hreflang
         )}" href="${escapeXml(alternate.href)}"/>`
      )
   }
   lines.push('  </url>')
   return `${lines.join('\n')}\n`
}

export function renderSitemap(urls: readonly SitemapUrl[]): string {
   return `${SITEMAP_URLSET_OPEN}${urls.map(renderSitemapUrl).join('')}${SITEMAP_URLSET_CLOSE}`
}

export function renderSitemapIndex(locs: readonly string[]): string {
   const items = locs.map((loc) => `  <sitemap>\n    <loc>${escapeXml(loc)}</loc>\n  </sitemap>\n`)
   return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.join(
      ''
   )}</sitemapindex>\n`
}

export function sitemapUrlsForPaths(
   paths: readonly CmsLocalePath[],
   siteUrl: string,
   defaultLocale: string,
   lastmod: string | null
): SitemapUrl[] {
   const alternates = seoAlternates(paths, siteUrl, defaultLocale)
   const seen = new Set<string>()
   const urls: SitemapUrl[] = []
   for (const { path } of paths) {
      if (!path || seen.has(path) || isAdminPath(path)) continue
      seen.add(path)
      urls.push({
         loc: absoluteUrl(siteUrl, path),
         lastmod,
         ...(alternates.length ? { alternates } : {}),
      })
   }
   return urls
}

export function isAdminPath(path: string): boolean {
   return path === SEO_ADMIN_PREFIX || path.startsWith(`${SEO_ADMIN_PREFIX}/`)
}

export function sitemapLastmod(value: unknown): string | null {
   const normalized = normalizeTimestamp(value)
   return typeof normalized === 'string' && normalized ? normalized : null
}

export function pageSitemapUrls(
   paths: readonly string[],
   rows: readonly Record<string, unknown>[],
   siteUrl: string
): SitemapUrl[] {
   const byPath = new Map(rows.map((row) => [row.path, row]))
   const urls: SitemapUrl[] = []
   for (const path of paths) {
      if (!path.startsWith('/') || /[[\]:*]/.test(path) || isAdminPath(path)) continue
      const row = byPath.get(path)
      if (row?.seoNoindex === true) continue
      urls.push({ loc: absoluteUrl(siteUrl, path), lastmod: sitemapLastmod(row?.updatedAt) })
   }
   return urls
}

export interface SitemapSourceSize {
   source: string
   count: number
   urlsPerItem: number
}

export interface SitemapChunk {
   source: string
   offset: number
   limit: number
}

export function sitemapUrlCount(sizes: readonly SitemapSourceSize[]): number {
   return sizes.reduce((total, size) => total + size.count * Math.max(1, size.urlsPerItem), 0)
}

export function planSitemapChunks(
   sizes: readonly SitemapSourceSize[],
   maxUrls: number = SITEMAP_MAX_URLS
): SitemapChunk[] {
   const chunks: SitemapChunk[] = []
   for (const { source, count, urlsPerItem } of sizes) {
      const perChunk = Math.max(1, Math.floor(maxUrls / Math.max(1, urlsPerItem)))
      for (let offset = 0; offset < count; offset += perChunk) {
         chunks.push({ source, offset, limit: Math.min(perChunk, count - offset) })
      }
   }
   return chunks
}

export function sitemapPartUrl(siteUrl: string, part: number): string {
   return absoluteUrl(siteUrl, `${SITEMAP_PATH}?part=${part}`)
}

export interface RobotsOptions {
   hidden: boolean
   sitemapUrl: string | null
}

export function renderRobotsTxt(options: RobotsOptions): string {
   const lines = [
      'User-agent: *',
      options.hidden ? 'Disallow: /' : `Disallow: ${SEO_ADMIN_PREFIX}/`,
   ]
   if (!options.hidden && options.sitemapUrl) lines.push('', `Sitemap: ${options.sitemapUrl}`)
   return `${lines.join('\n')}\n`
}

export interface CmsSeoModuleOptions {
   sitemap?: boolean
   robots?: boolean
}

export interface CmsSiteModuleOptions {
   url?: string
}

const SEO_OPTION_KEYS = ['sitemap', 'robots']
const SITE_OPTION_KEYS = ['url']

function isPlainObject(value: unknown): value is Record<string, unknown> {
   return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function siteUrlErrors(url: unknown, at = 'cms.site.url'): string[] {
   if (typeof url !== 'string') return [`${at} must be a string`]
   if (!url.trim()) return []
   let parsed: URL
   try {
      parsed = new URL(url.trim())
   } catch {
      return [`${at} must be an absolute URL like https://example.com, got '${url}'`]
   }
   if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      return [`${at} must use http or https, got '${url}'`]
   if (parsed.search || parsed.hash || url.includes('?') || url.includes('#'))
      return [`${at} cannot hold a query or a hash, got '${url}'`]
   if (parsed.username || parsed.password) return [`${at} cannot hold credentials`]
   return []
}

export function seoOptionErrors(seo: unknown, site: unknown): string[] {
   const errors: string[] = []
   if (seo !== undefined) {
      if (!isPlainObject(seo)) {
         errors.push('cms.seo must be an object like { sitemap: true, robots: true }')
      } else {
         for (const [key, value] of Object.entries(seo)) {
            if (!SEO_OPTION_KEYS.includes(key))
               errors.push(`cms.seo.${key} is not an option (use ${SEO_OPTION_KEYS.join(', ')})`)
            else if (value !== undefined && typeof value !== 'boolean')
               errors.push(`cms.seo.${key} must be true or false`)
         }
      }
   }
   if (site !== undefined) {
      if (!isPlainObject(site)) {
         errors.push("cms.site must be an object like { url: 'https://example.com' }")
      } else {
         for (const [key, value] of Object.entries(site)) {
            if (!SITE_OPTION_KEYS.includes(key))
               errors.push(`cms.site.${key} is not an option (use ${SITE_OPTION_KEYS.join(', ')})`)
            else if (value !== undefined) errors.push(...siteUrlErrors(value))
         }
      }
   }
   return errors
}

export interface SeoConflicts {
   sitemap: string[]
   robots: string[]
}

export interface ResolvedSeoSwitches {
   sitemap: boolean
   robots: boolean
   warnings: string[]
}

function resolveSwitch(
   key: 'sitemap' | 'robots',
   option: boolean | undefined,
   conflicts: string[],
   route: string
): { enabled: boolean; warning: string | null } {
   if (option === false) return { enabled: false, warning: null }
   if (!conflicts.length) return { enabled: true, warning: null }
   const found = conflicts.join(', ')
   if (option === true)
      return {
         enabled: true,
         warning: `[nuxt-cms] cms.seo.${key} is on but ${found} also serves ${route}; only one of them answers. Set cms.seo.${key} to false to keep the other one.`,
      }
   return {
      enabled: false,
      warning: `[nuxt-cms] ${found} found, so the cms ${route} is off. Set cms.seo.${key} to true or false to silence this.`,
   }
}

export function resolveSeoSwitches(
   seo: CmsSeoModuleOptions | undefined,
   conflicts: SeoConflicts
): ResolvedSeoSwitches {
   const sitemap = resolveSwitch('sitemap', seo?.sitemap, conflicts.sitemap, SITEMAP_PATH)
   const robots = resolveSwitch('robots', seo?.robots, conflicts.robots, ROBOTS_PATH)
   return {
      sitemap: sitemap.enabled,
      robots: robots.enabled,
      warnings: [sitemap.warning, robots.warning].filter((warning): warning is string => !!warning),
   }
}
