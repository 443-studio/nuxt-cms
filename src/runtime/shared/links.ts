import type { CmsConfig, CmsEntry, FieldConfig } from './index'
import { contentItemPath, isRoutedContent } from './content-routes'

export const LINK_URL_MAX_LENGTH = 2048

export const LINK_URL_SCHEMES: readonly string[] = ['http', 'https', 'mailto', 'tel']

export const LINK_TARGET_SEPARATOR = ':'

export interface CmsLinkValue {
   url?: string
   entry?: string
   id?: string
   label?: string | Record<string, string>
   newTab?: boolean
}

export interface CmsLink {
   href: string | null
   label: string | null
   newTab: boolean
   external: boolean
   entry: string | null
   id: string | null
}

export interface CmsLinkTarget {
   entry: string
   id: string
}

export interface CmsLinkReference extends CmsLinkTarget {
   field: string
}

export type CmsLinkUrlKind = 'absolute' | 'path' | 'anchor'

const SCHEME = /^([a-z][a-z\d+.-]*):/i
const UNSAFE_CHARACTERS = /[\s\u0000-\u001F\u007F]/
const TEL_NUMBER = /^\+?[\d().\-/]+$/

export function linkUrlKind(url: string): CmsLinkUrlKind | null {
   if (url.startsWith('#')) return 'anchor'
   if (url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\')) return 'path'
   const scheme = SCHEME.exec(url)?.[1]?.toLowerCase()
   return scheme && LINK_URL_SCHEMES.includes(scheme) ? 'absolute' : null
}

export function linkUrlError(url: unknown): string | null {
   if (typeof url !== 'string' || !url) return 'Enter a URL'
   if (url.length > LINK_URL_MAX_LENGTH) return 'The URL is too long'
   if (UNSAFE_CHARACTERS.test(url)) return 'A URL cannot contain spaces'
   if (url.startsWith('//') || url.startsWith('/\\') || url.startsWith('\\'))
      return 'Use https:// for links to other sites'
   if (url.startsWith('/')) return null
   if (url.startsWith('#')) return url.length > 1 ? null : 'Add an anchor name after #'
   const scheme = SCHEME.exec(url)?.[1]?.toLowerCase()
   if (!scheme) return 'Use a full URL (https://...), a path starting with / or an #anchor'
   if (!LINK_URL_SCHEMES.includes(scheme))
      return `${scheme}: links are not allowed (use http, https, mailto or tel)`
   const rest = url.slice(scheme.length + 1)
   if (scheme === 'mailto') return rest ? null : 'Add an email address after mailto:'
   if (scheme === 'tel') return TEL_NUMBER.test(rest) ? null : 'Add a phone number after tel:'
   if (!rest.startsWith('//')) return 'Invalid URL'
   try {
      return new URL(url).hostname ? null : 'Invalid URL'
   } catch {
      return 'Invalid URL'
   }
}

export function isExternalLinkUrl(url: string | null | undefined): boolean {
   return !!url && linkUrlKind(url) === 'absolute'
}

export function isLinkTargetEntry(entry: CmsEntry | null | undefined): boolean {
   return !!entry && (entry.kind === 'page' || isRoutedContent(entry))
}

export function declaredLinkTargets(field: FieldConfig): string[] | null {
   const to: unknown = field.to
   if (!Array.isArray(to)) return null
   return to.filter((name): name is string => typeof name === 'string')
}

export function linkTargetNames(config: CmsConfig, field: FieldConfig): string[] {
   const declared = declaredLinkTargets(field)
   if (declared) return declared.filter((name) => isLinkTargetEntry(config[name]))
   return Object.entries(config)
      .filter(([, entry]) => isLinkTargetEntry(entry))
      .map(([name]) => name)
}

export function allowsExternalLinks(field: FieldConfig): boolean {
   return field.external !== false
}

export function linkTargetKey(entry: string, id: string): string {
   return `${entry}${LINK_TARGET_SEPARATOR}${id}`
}

export function parseLinkTargetKey(key: string): CmsLinkTarget | null {
   const index = key.indexOf(LINK_TARGET_SEPARATOR)
   if (index <= 0 || index === key.length - 1) return null
   return { entry: key.slice(0, index), id: key.slice(index + 1) }
}

function isRecord(value: unknown): value is Record<string, unknown> {
   return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function readLinkValue(value: unknown): CmsLinkValue | null {
   let parsed = value
   if (typeof parsed === 'string') {
      const text = parsed.trim()
      if (!text.startsWith('{')) return text ? { url: text } : null
      try {
         parsed = JSON.parse(text)
      } catch {
         return null
      }
   }
   if (!isRecord(parsed)) return null
   const link: CmsLinkValue = {}
   if (typeof parsed.url === 'string' && parsed.url) link.url = parsed.url
   if (typeof parsed.entry === 'string' && parsed.entry) link.entry = parsed.entry
   if (typeof parsed.id === 'string' && parsed.id) link.id = parsed.id
   if (typeof parsed.label === 'string' || isRecord(parsed.label))
      link.label = parsed.label as CmsLinkValue['label']
   if (parsed.newTab === true) link.newTab = true
   return link
}

export function linkTargetOf(value: unknown): CmsLinkTarget | null {
   const link = readLinkValue(value)
   if (!link?.entry || !link.id || link.url) return null
   return { entry: link.entry, id: link.id }
}

export function linkLabelText(
   label: unknown,
   locale: string,
   defaultLocale: string
): string | null {
   if (typeof label === 'string') return label || null
   if (!isRecord(label)) return null
   const pick = (key: string) => {
      const text = label[key]
      return typeof text === 'string' && text ? text : null
   }
   return (
      pick(locale) ??
      pick(defaultLocale) ??
      Object.keys(label)
         .map(pick)
         .find((text) => text !== null) ??
      null
   )
}

export function linkLabelTexts(label: unknown): { locale: string | null; text: string }[] {
   if (typeof label === 'string') return label ? [{ locale: null, text: label }] : []
   if (!isRecord(label)) return []
   return Object.entries(label)
      .filter((pair): pair is [string, string] => typeof pair[1] === 'string' && !!pair[1])
      .map(([locale, text]) => ({ locale, text }))
}

export function pageLinkPath(entry: CmsEntry | undefined, id: string): string | null {
   if (entry?.kind !== 'page') return null
   return entry.pages?.find((route) => route.key === id)?.path ?? null
}

export function linkHref(
   config: CmsConfig,
   link: CmsLinkValue | null,
   locale: string,
   target?: Record<string, unknown> | null
): string | null {
   if (!link) return null
   if (link.url) return linkUrlError(link.url) ? null : link.url
   if (!link.entry || !link.id) return null
   const entry = config[link.entry]
   if (entry?.kind === 'page') return pageLinkPath(entry, link.id)
   if (!target || !isRoutedContent(entry)) return null
   return contentItemPath(entry!, target, locale)
}

export function resolveCmsLink(
   config: CmsConfig,
   value: unknown,
   locale: string,
   defaultLocale: string,
   target?: Record<string, unknown> | null
): CmsLink | null {
   const link = readLinkValue(value)
   if (!link || (!link.url && !(link.entry && link.id))) return null
   return {
      href: linkHref(config, link, locale, target),
      label: linkLabelText(link.label, locale, defaultLocale),
      newTab: !!link.newTab,
      external: isExternalLinkUrl(link.url),
      entry: link.url ? null : link.entry ?? null,
      id: link.url ? null : link.id ?? null,
   }
}

export function linkReferences(
   fields: Record<string, FieldConfig>,
   values: Record<string, unknown>
): CmsLinkReference[] {
   const references: CmsLinkReference[] = []
   for (const [key, field] of Object.entries(fields)) {
      const value = values[key]
      if (field.type === 'link') {
         const target = linkTargetOf(value)
         if (target) references.push({ field: key, ...target })
         continue
      }
      if (field.type !== 'blocks' || !Array.isArray(value)) continue
      value.forEach((item: unknown, index) => {
         if (!isRecord(item)) return
         const block = field.blocks?.[String(item.type)]
         for (const [blockFieldKey, blockField] of Object.entries(block?.fields ?? {})) {
            if (blockField.type !== 'link') continue
            const target = linkTargetOf(item[blockFieldKey])
            if (target) references.push({ field: `${key}[${index}].${blockFieldKey}`, ...target })
         }
      })
   }
   return references
}

export function linkDisplayText(
   value: unknown,
   locale: string,
   defaultLocale: string,
   targetTitle?: string | null
): string {
   const link = readLinkValue(value)
   if (!link) return ''
   const label = linkLabelText(link.label, locale, defaultLocale)
   const target = link.url ?? targetTitle ?? null
   if (label && target) return `${label} (${target})`
   return label ?? target ?? (link.entry && link.id ? `${link.entry} #${link.id}` : '')
}
