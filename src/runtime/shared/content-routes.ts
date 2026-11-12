import type { CmsConfig, CmsEntry, CmsI18n } from './index'

export const CONTENT_ROUTE_FIELDS: readonly string[] = ['path', 'paths']

export const CONTENT_ROUTE_PARAMS = ['slug', 'id', 'year', 'month', 'day'] as const

export type CmsContentRouteParam = (typeof CONTENT_ROUTE_PARAMS)[number]

export type CmsContentRoute = string | Readonly<Record<string, string>>

export type CmsContentRouteParams = Partial<Record<CmsContentRouteParam, string>>

export type CmsContentRouteItem = Readonly<Record<string, unknown>>

export interface CmsLocalePath {
   locale: string
   path: string
}

export interface CmsContentPathMatch {
   entry: string
   pattern: string
   params: CmsContentRouteParams
}

type RouteSegment = { param: CmsContentRouteParam } | { text: string }

type RoutedEntry = Pick<CmsEntry, 'kind' | 'route'>

const PARAM_SEGMENT = /^\[([^\]]*)\]$/
const FORBIDDEN_CHARACTERS = /[?#\s\\]/
const RESERVED_PREFIX = 'cms'

const PARAM_VALUES: Record<CmsContentRouteParam, RegExp> = {
   slug: /^.+$/,
   id: /^.+$/,
   year: /^\d{4}$/,
   month: /^\d{2}$/,
   day: /^\d{2}$/,
}

const DATE_PARAMS: readonly CmsContentRouteParam[] = ['year', 'month', 'day']

function isRouteParam(name: string): name is CmsContentRouteParam {
   return (CONTENT_ROUTE_PARAMS as readonly string[]).includes(name)
}

export function contentRouteSegments(pattern: string): RouteSegment[] {
   return pattern
      .split('/')
      .filter(Boolean)
      .map((segment) => {
         const name = PARAM_SEGMENT.exec(segment)?.[1]
         return name && isRouteParam(name) ? { param: name } : { text: segment }
      })
}

export function contentRouteErrors(pattern: unknown): string[] {
   if (typeof pattern !== 'string' || !pattern) return ['must be a non-empty string']
   if (!pattern.startsWith('/')) return [`'${pattern}' must start with /`]
   if (FORBIDDEN_CHARACTERS.test(pattern))
      return [`'${pattern}' cannot hold spaces, backslashes, ? or #`]
   const segments = pattern.slice(1).split('/')
   if (segments.some((segment) => !segment))
      return [`'${pattern}' has an empty segment or a trailing slash`]
   const errors: string[] = []
   if (segments[0] === RESERVED_PREFIX)
      errors.push(`'${pattern}' is under /${RESERVED_PREFIX}, which belongs to the admin`)
   const seen = new Set<string>()
   for (const segment of segments) {
      const name = PARAM_SEGMENT.exec(segment)?.[1]
      if (name === undefined) {
         if (/[[\]]/.test(segment))
            errors.push(`'${pattern}': a placeholder must fill a whole segment ('${segment}')`)
         continue
      }
      if (!isRouteParam(name)) {
         errors.push(
            `'${pattern}': unknown placeholder [${name}] (use ${CONTENT_ROUTE_PARAMS.map(
               (param) => `[${param}]`
            ).join(', ')})`
         )
      } else if (seen.has(name)) {
         errors.push(`'${pattern}': placeholder [${name}] is used twice`)
      }
      seen.add(name)
   }
   if (!seen.has('slug') && !seen.has('id'))
      errors.push(`'${pattern}' needs a [slug] or [id] placeholder`)
   return errors
}

export function contentRouteShape(pattern: string): string {
   const shape = contentRouteSegments(pattern).map((segment) => {
      if ('text' in segment) return segment.text
      if (segment.param === 'year') return '[yyyy]'
      if (DATE_PARAMS.includes(segment.param)) return '[nn]'
      return '[*]'
   })
   return `/${shape.join('/')}`
}

function routeRank(pattern: string): [number, number, number] {
   const segments = contentRouteSegments(pattern)
   const statics = segments.filter((segment) => 'text' in segment).length
   const dates = segments.filter(
      (segment) => 'param' in segment && DATE_PARAMS.includes(segment.param)
   ).length
   return [statics, dates, segments.length]
}

export function compareContentRoutes(a: string, b: string): number {
   const left = routeRank(a)
   const right = routeRank(b)
   return right[0] - left[0] || right[1] - left[1] || right[2] - left[2] || a.localeCompare(b)
}

export function contentRouteLocales(i18n: Pick<CmsI18n, 'locales' | 'defaultLocale'>): string[] {
   return i18n.locales.length ? [...i18n.locales] : [i18n.defaultLocale]
}

export function contentRoutePattern(
   route: CmsContentRoute | null | undefined,
   locale: string
): string | null {
   if (!route) return null
   if (typeof route === 'string') return route
   return route[locale] ?? null
}

export function contentRoutePatterns(route: CmsContentRoute | null | undefined): string[] {
   if (!route) return []
   return typeof route === 'string' ? [route] : [...new Set(Object.values(route))]
}

export function isRoutedContent(entry: RoutedEntry | null | undefined): boolean {
   return entry?.kind === 'content' && !!entry.route
}

function datePart(value: unknown, part: 'year' | 'month' | 'day'): string | undefined {
   if (typeof value !== 'string' || !value) return undefined
   const date = new Date(value)
   if (Number.isNaN(date.getTime())) return undefined
   if (part === 'year') return String(date.getUTCFullYear()).padStart(4, '0')
   const number = part === 'month' ? date.getUTCMonth() + 1 : date.getUTCDate()
   return String(number).padStart(2, '0')
}

function textValue(value: unknown): string | undefined {
   if (typeof value === 'number') return String(value)
   return typeof value === 'string' && value ? value : undefined
}

export function contentRouteValues(item: CmsContentRouteItem): CmsContentRouteParams {
   const values: CmsContentRouteParams = {}
   const slug = textValue(item.slug)
   const id = textValue(item.id)
   if (slug) values.slug = slug
   if (id) values.id = id
   for (const part of ['year', 'month', 'day'] as const) {
      const value = datePart(item.publishedAt, part)
      if (value) values[part] = value
   }
   return values
}

export function buildContentPath(pattern: string, item: CmsContentRouteItem): string | null {
   const values = contentRouteValues(item)
   const parts: string[] = []
   for (const segment of contentRouteSegments(pattern)) {
      if ('text' in segment) {
         parts.push(segment.text)
         continue
      }
      const value = values[segment.param]
      if (!value) return null
      parts.push(encodeURIComponent(value))
   }
   return `/${parts.join('/')}`
}

export function contentItemPath(
   entry: RoutedEntry,
   item: CmsContentRouteItem,
   locale: string
): string | null {
   if (!isRoutedContent(entry)) return null
   const pattern = contentRoutePattern(entry.route, locale)
   return pattern ? buildContentPath(pattern, item) : null
}

export function contentItemPaths(
   entry: RoutedEntry,
   item: CmsContentRouteItem,
   locales: readonly string[]
): CmsLocalePath[] {
   const paths: CmsLocalePath[] = []
   for (const locale of locales) {
      const path = contentItemPath(entry, item, locale)
      if (path) paths.push({ locale, path })
   }
   return paths
}

export function normalizeContentPath(path: string): string {
   const bare = path.replace(/[?#].*$/, '')
   const segments = bare.split('/').filter(Boolean)
   return `/${segments.join('/')}`
}

function decodeSegment(segment: string): string | null {
   try {
      return decodeURIComponent(segment)
   } catch {
      return null
   }
}

export function matchContentPattern(pattern: string, path: string): CmsContentRouteParams | null {
   const segments = contentRouteSegments(pattern)
   const parts = normalizeContentPath(path).split('/').filter(Boolean)
   if (parts.length !== segments.length) return null
   const params: CmsContentRouteParams = {}
   for (const [index, segment] of segments.entries()) {
      const part = decodeSegment(parts[index]!)
      if (part === null) return null
      if ('text' in segment) {
         if (part !== segment.text) return null
         continue
      }
      if (!PARAM_VALUES[segment.param].test(part)) return null
      params[segment.param] = part
   }
   return params
}

export function contentPathParamsMatch(
   params: CmsContentRouteParams,
   item: CmsContentRouteItem
): boolean {
   const values = contentRouteValues(item)
   return (Object.entries(params) as [CmsContentRouteParam, string][]).every(
      ([param, value]) => values[param] === value
   )
}

export function matchContentPath(
   config: CmsConfig,
   path: string,
   locale: string
): CmsContentPathMatch[] {
   const matches: CmsContentPathMatch[] = []
   for (const [name, entry] of Object.entries(config)) {
      if (!isRoutedContent(entry)) continue
      const pattern = contentRoutePattern(entry.route, locale)
      if (!pattern) continue
      const params = matchContentPattern(pattern, path)
      if (params) matches.push({ entry: name, pattern, params })
   }
   return matches.sort((a, b) => compareContentRoutes(a.pattern, b.pattern))
}

function mostSpecificRoute(entry: RoutedEntry): string {
   return contentRoutePatterns(entry.route).sort(compareContentRoutes)[0] ?? ''
}

export function routedContentNames(config: CmsConfig): string[] {
   return Object.entries(config)
      .filter(([, entry]) => isRoutedContent(entry))
      .sort(([, a], [, b]) => compareContentRoutes(mostSpecificRoute(a), mostSpecificRoute(b)))
      .map(([name]) => name)
}

export function contentRouteConfigErrors(
   at: string,
   route: unknown,
   i18n: Pick<CmsI18n, 'locales'>
): string[] {
   if (typeof route === 'string') return contentRouteErrors(route).map((e) => `${at}: route ${e}`)
   if (!route || typeof route !== 'object' || Array.isArray(route))
      return [`${at}: route must be a path pattern or a map of locale to path pattern`]
   const { locales } = i18n
   if (!locales.length)
      return [`${at}: a per-locale route needs cms.i18n locales, use a single pattern instead`]
   const errors: string[] = []
   const map = route as Record<string, unknown>
   for (const [locale, pattern] of Object.entries(map)) {
      if (!locales.includes(locale))
         errors.push(`${at}: route names the unknown locale '${locale}'`)
      errors.push(...contentRouteErrors(pattern).map((e) => `${at}: route.${locale} ${e}`))
   }
   const missing = locales.filter((locale) => !Object.hasOwn(map, locale))
   if (missing.length)
      errors.push(`${at}: route has no pattern for the locale(s) ${missing.join(', ')}`)
   return errors
}

export function contentRouteClashErrors(config: CmsConfig): string[] {
   const errors: string[] = []
   const owners = new Map<string, { entry: string; pattern: string }>()
   for (const [name, entry] of Object.entries(config)) {
      if (!isRoutedContent(entry)) continue
      const patterns = contentRoutePatterns(entry.route).filter(
         (pattern) => !contentRouteErrors(pattern).length
      )
      for (const shape of new Set(patterns.map(contentRouteShape))) {
         const pattern = patterns.find((candidate) => contentRouteShape(candidate) === shape)!
         const owner = owners.get(shape)
         if (owner) {
            errors.push(
               `cms.config entry '${name}': route '${pattern}' matches the same paths as '${owner.pattern}' of entry '${owner.entry}'`
            )
         } else {
            owners.set(shape, { entry: name, pattern })
         }
      }
   }
   return errors
}
