import { parseYAML, stringifyYAML } from 'confbox/yaml'
import { MAX_BLOCKS_DEPTH, formatBlockPath } from './block-paths'
import { pastedFieldValue } from './clipboard'
import type { BlockConfig, CmsI18n, FieldConfig } from './index'
import {
   BLOCK_HIDDEN_KEY,
   CONTENT_BODY_FIELD,
   declaresHiddenField,
   decodeTranslatableValue,
   isHiddenBlock,
   isLocalizedLinkField,
   isTranslatableField,
   selectOptionValues,
   selectOptions,
   slugify,
} from './index'
import type { CmsLinkValue } from './links'
import { allowsExternalLinks, declaredLinkTargets, linkUrlError } from './links'
import { htmlToMarkdown, markdownToHtml } from './markdown'

type Values = Record<string, unknown>

type BlockItem = Record<string, unknown>

export type CmsMdcIssueLevel = 'error' | 'warning'

export interface CmsMdcIssue {
   line: number | null
   message: string
   level: CmsMdcIssueLevel
   path?: string
}

export interface CmsMdcCheckIssue {
   path: readonly PropertyKey[]
   message: string
   level?: CmsMdcIssueLevel
}

export type CmsMdcCheck = (values: Values) => readonly CmsMdcCheckIssue[]

export interface CmsMdcOptions {
   i18n: CmsI18n
   locale?: string
}

export interface CmsMdcParseOptions extends CmsMdcOptions {
   check?: CmsMdcCheck
   media?: ReadonlySet<string> | null
}

export interface CmsBlocksMdcParseOptions extends CmsMdcParseOptions {
   current?: unknown
   key?: string
}

export interface CmsEntryMdcOptions extends CmsMdcOptions {
   body?: string
}

export interface CmsEntryMdcParseOptions extends CmsMdcParseOptions {
   body?: string
   current?: Values
}

export interface CmsBlocksMdcResult {
   value: BlockItem[] | null
   issues: CmsMdcIssue[]
}

export interface CmsEntryMdcResult {
   values: Values
   issues: CmsMdcIssue[]
}

export interface CmsMdcGuideOptions extends CmsMdcOptions {
   title?: string
   media?: readonly string[] | null
   body?: string
}

export const MDC_INLINE_PROP_MAX = 60

export const MDC_GUIDE_MEDIA_MAX = 100

const DEFAULT_BLOCKS_KEY = 'blocks'

interface SourceLine {
   text: string
   line: number
}

interface MdcSlot {
   name: string | null
   line: number
   text: SourceLine[]
   children: MdcNode[]
}

interface MdcNode {
   name: string
   colons: number
   line: number
   props: Values
   yaml: { lines: SourceLine[]; line: number } | null
   slots: MdcSlot[]
}

interface MdcDocument {
   frontmatter: { lines: SourceLine[]; line: number } | null
   nodes: MdcNode[]
}

interface BlockLayout {
   defaultKey: string | null
   slotKeys: string[]
}

interface ParsedBlock {
   type: string
   block: BlockConfig
   values: Values
   lists: Record<string, ParsedBlock[]>
   hidden: boolean
}

interface ParseState {
   i18n: CmsI18n
   locale: string
   media: ReadonlySet<string> | null
   issues: CmsMdcIssue[]
   lines: Map<string, number>
}

const OPEN_LINE = /^\s*(:{2,})([A-Za-z][\w-]*)(.*)$/
const CLOSE_LINE = /^\s*(:{2,})\s*$/
const SLOT_LINE = /^\s*#([A-Za-z_][\w-]*)\s*$/

function isRecord(value: unknown): value is Record<string, unknown> {
   return !!value && typeof value === 'object' && !Array.isArray(value)
}

function activeLocale(options: CmsMdcOptions) {
   return options.locale ?? options.i18n.defaultLocale
}

function localized(field: FieldConfig, i18n: CmsI18n) {
   return isTranslatableField(field) && i18n.locales.length > 0
}

function localizedLabel(field: FieldConfig, i18n: CmsI18n) {
   return isLocalizedLinkField(field) && i18n.locales.length > 0
}

function blockLayout(block: BlockConfig): BlockLayout {
   const entries = Object.entries(block.fields)
   const rich = entries.filter(([, field]) => field.type === 'richtext').map(([key]) => key)
   const lists = entries.filter(([, field]) => field.type === 'blocks').map(([key]) => key)
   let defaultKey: string | null = null
   if (rich.length === 1) defaultKey = rich[0]!
   else if (!rich.length && lists.length === 1) defaultKey = lists[0]!
   const slotKeys = entries
      .map(([key]) => key)
      .filter((key) => key !== defaultKey && (rich.includes(key) || lists.includes(key)))
   return { defaultKey, slotKeys }
}

function localeText(value: unknown, locale: string, defaultLocale: string): string | null {
   if (value == null) return null
   if (typeof value === 'string') return locale === defaultLocale ? value || null : null
   const map = decodeTranslatableValue(value, defaultLocale)
   const text = map?.[locale]
   return typeof text === 'string' && text ? text : null
}

function plainLink(field: FieldConfig, value: unknown, state: Pick<ParseState, 'i18n' | 'locale'>) {
   if (!isRecord(value)) return null
   const link: Values = {}
   if (typeof value.url === 'string' && value.url) link.url = value.url
   if (typeof value.entry === 'string' && value.entry) link.entry = value.entry
   if (typeof value.id === 'string' && value.id) link.id = value.id
   const label = localizedLabel(field, state.i18n)
      ? localeText(value.label, state.locale, state.i18n.defaultLocale)
      : typeof value.label === 'string'
        ? value.label
        : isRecord(value.label)
          ? localeText(value.label, state.i18n.defaultLocale, state.i18n.defaultLocale)
          : null
   if (label) link.label = label
   if (value.newTab === true) link.newTab = true
   return Object.keys(link).length ? link : null
}

function plainValue(
   field: FieldConfig,
   value: unknown,
   state: Pick<ParseState, 'i18n' | 'locale'>
): unknown {
   if (field.type === 'link') return plainLink(field, value, state)
   let plain = value
   if (localized(field, state.i18n))
      plain = localeText(value, state.locale, state.i18n.defaultLocale)
   else if (isRecord(value) && field.type !== 'json')
      plain = localeText(value, state.i18n.defaultLocale, state.i18n.defaultLocale)
   if (plain == null || plain === '') return null
   if (field.type === 'richtext')
      return typeof plain === 'string' ? htmlToMarkdown(plain) || null : null
   if (Array.isArray(plain) && !plain.length) return null
   return plain
}

function inlineProp(key: string, value: unknown): string | null {
   if (typeof value === 'boolean') return value ? key : `${key}=false`
   if (typeof value === 'number' && Number.isFinite(value)) return `${key}=${value}`
   if (
      typeof value === 'string' &&
      value.length <= MDC_INLINE_PROP_MAX &&
      !/["\n\r]/.test(value) &&
      value.trim() === value
   )
      return `${key}="${value}"`
   return null
}

function yamlLines(value: Values): string[] {
   return stringifyYAML(value, { lineWidth: -1, indent: 2 }).trimEnd().split('\n')
}

function serializeList(
   items: unknown,
   field: FieldConfig,
   colons: number,
   state: Pick<ParseState, 'i18n' | 'locale'>
): string[] {
   const out: string[] = []
   const list = Array.isArray(items) ? items : []
   for (const item of list) {
      if (!isRecord(item)) continue
      const type = String(item.type)
      const block = field.blocks?.[type]
      if (!block) continue
      if (out.length) out.push('')
      out.push(...serializeBlock(type, block, item, colons, state))
   }
   return out
}

function serializeBlock(
   type: string,
   block: BlockConfig,
   item: BlockItem,
   colons: number,
   state: Pick<ParseState, 'i18n' | 'locale'>
): string[] {
   const layout = blockLayout(block)
   const inline: string[] = []
   const yaml: Values = {}
   for (const [key, field] of Object.entries(block.fields)) {
      if (key === layout.defaultKey || layout.slotKeys.includes(key)) continue
      const value = plainValue(field, item[key], state)
      if (value == null) continue
      const prop = field.type === 'json' ? null : inlineProp(key, value)
      if (prop) inline.push(prop)
      else yaml[key] = value
   }
   if (isHiddenBlock(item) && !declaresHiddenField(block)) inline.push(BLOCK_HIDDEN_KEY)
   const fence = ':'.repeat(colons)
   const lines = [`${fence}${type}${inline.length ? `{${inline.join(' ')}}` : ''}`]
   if (Object.keys(yaml).length) lines.push('---', ...yamlLines(yaml), '---')
   const slotLines = (key: string) => {
      const field = block.fields[key]!
      if (field.type === 'blocks') return serializeList(item[key], field, colons + 1, state)
      const markdown = plainValue(field, item[key], state)
      return typeof markdown === 'string' ? markdown.split('\n') : []
   }
   if (layout.defaultKey) lines.push(...slotLines(layout.defaultKey))
   for (const key of layout.slotKeys) {
      const content = slotLines(key)
      if (content.length) lines.push(`#${key}`, ...content)
   }
   lines.push(fence)
   return lines
}

export function blocksToMdc(field: FieldConfig, value: unknown, options: CmsMdcOptions): string {
   const state = { i18n: options.i18n, locale: activeLocale(options) }
   const lines = serializeList(value, field, 2, state)
   return lines.length ? `${lines.join('\n')}\n` : ''
}

export function mdcFrontmatterKeys(
   fields: Record<string, FieldConfig>,
   body: string = CONTENT_BODY_FIELD
): string[] {
   return Object.keys(fields).filter((key) => key !== body && fields[key]!.type !== 'blocks')
}

function frontmatterValue(
   field: FieldConfig,
   value: unknown,
   state: Pick<ParseState, 'i18n' | 'locale'>
) {
   const plain = plainValue(field, value, state)
   if (plain == null) return null
   if (field.type === 'boolean') return plain === true
   return plain
}

export function entryToMdc(
   fields: Record<string, FieldConfig>,
   values: Values,
   options: CmsEntryMdcOptions
): string {
   const state = { i18n: options.i18n, locale: activeLocale(options) }
   const body = options.body ?? CONTENT_BODY_FIELD
   const front: Values = {}
   for (const key of mdcFrontmatterKeys(fields, body)) {
      const value = frontmatterValue(fields[key]!, values[key], state)
      if (value != null) front[key] = value
   }
   const head = Object.keys(front).length ? ['---', ...yamlLines(front), '---'] : ['---', '---']
   const field = fields[body]
   const blocks = field?.type === 'blocks' ? serializeList(values[body], field, 2, state) : []
   return `${[...head, ...(blocks.length ? ['', ...blocks] : [])].join('\n')}\n`
}

function editDistance(a: string, b: string): number {
   const row = Array.from({ length: b.length + 1 }, (_, index) => index)
   for (let i = 1; i <= a.length; i++) {
      let previous = row[0]!
      row[0] = i
      for (let j = 1; j <= b.length; j++) {
         const current = row[j]!
         row[j] = Math.min(
            row[j]! + 1,
            row[j - 1]! + 1,
            previous + (a[i - 1]!.toLowerCase() === b[j - 1]!.toLowerCase() ? 0 : 1)
         )
         previous = current
      }
   }
   return row[b.length]!
}

function suggestion(name: string, candidates: readonly string[]): string {
   let best: string | null = null
   let distance = 3
   for (const candidate of candidates) {
      const next = editDistance(name, candidate)
      if (next < distance) {
         best = candidate
         distance = next
      }
   }
   return best ? ` Did you mean "${best}"?` : ''
}

function quoteList(names: readonly string[]) {
   return names.map((name) => `"${name}"`).join(', ')
}

function addIssue(
   state: Pick<ParseState, 'issues'>,
   line: number | null,
   message: string,
   level: CmsMdcIssueLevel = 'error',
   path?: string
) {
   state.issues.push({ line, message, level, ...(path ? { path } : {}) })
}

function parseInlineProps(source: string, line: number, state: ParseState): Values {
   const props: Values = {}
   const text = source.trim()
   if (!text) return props
   if (!text.startsWith('{') || !text.endsWith('}')) {
      addIssue(
         state,
         line,
         'Unexpected text after the block name: write props as {key="value"} and the content on the next lines.'
      )
      return props
   }
   const inner = text.slice(1, -1)
   const pattern =
      /\s*(?:(:?)([A-Za-z_][\w-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'}]+)))?|([.#][\w-]+))\s*/y
   let at = 0
   while (at < inner.length) {
      pattern.lastIndex = at
      const match = pattern.exec(inner)
      if (!match || match[0].length === 0) {
         addIssue(state, line, `Cannot read the props near "${inner.slice(at, at + 20)}".`)
         break
      }
      at = pattern.lastIndex
      if (match[6]) {
         addIssue(state, line, `Classes and ids (${match[6]}) are not supported in props.`)
         continue
      }
      const key = match[2]!
      const raw = match[3] ?? match[4] ?? match[5]
      let value: unknown = raw === undefined ? true : raw
      if (match[1] && typeof raw === 'string') {
         try {
            value = JSON.parse(raw)
         } catch {
            value = raw
         }
      }
      if (Object.hasOwn(props, key)) addIssue(state, line, `The prop "${key}" is written twice.`)
      props[key] = value
   }
   return props
}

function withoutCodeFence(lines: string[]): string[] {
   const filled = lines.flatMap((line, index) => (line.trim() ? [index] : []))
   const first = filled[0]
   const last = filled.at(-1)
   if (first === undefined || last === undefined || first === last) return lines
   const fence = /^\s*(`{3,}|~{3,})[\w-]*\s*$/.exec(lines[first]!)
   if (!fence || lines[last]!.trim() !== fence[1]) return lines
   return lines.map((line, index) => (index === first || index === last ? '' : line))
}

function parseDocument(text: string, frontmatter: boolean, state: ParseState): MdcDocument {
   const lines = withoutCodeFence(text.replace(/\r\n?/g, '\n').split('\n'))
   const doc: MdcDocument = { frontmatter: null, nodes: [] }
   let at = 0
   while (at < lines.length && !lines[at]!.trim()) at++
   if (lines[at]?.trim() === '---') {
      const start = at
      const body: SourceLine[] = []
      at++
      while (at < lines.length && lines[at]!.trim() !== '---') {
         body.push({ text: lines[at]!, line: at + 1 })
         at++
      }
      if (at >= lines.length) {
         addIssue(
            state,
            start + 1,
            'The front matter starts with --- but never ends: add a closing ---.'
         )
         return doc
      }
      at++
      if (frontmatter) doc.frontmatter = { lines: body, line: start + 1 }
      else addIssue(state, start + 1, 'Front matter is not used here: write only blocks.')
   }

   const parseComponent = (from: number): { node: MdcNode; next: number } => {
      const match = OPEN_LINE.exec(lines[from]!)!
      const node: MdcNode = {
         name: match[2]!,
         colons: match[1]!.length,
         line: from + 1,
         props: parseInlineProps(match[3] ?? '', from + 1, state),
         yaml: null,
         slots: [{ name: null, line: from + 1, text: [], children: [] }],
      }
      const fence = ':'.repeat(node.colons)
      let cursor = from + 1
      let ahead = cursor
      while (ahead < lines.length && !lines[ahead]!.trim()) ahead++
      if (lines[ahead]?.trim() === '---') cursor = ahead
      if (lines[cursor]?.trim() === '---') {
         const start = cursor
         const body: SourceLine[] = []
         cursor++
         while (cursor < lines.length && lines[cursor]!.trim() !== '---') {
            body.push({ text: lines[cursor]!, line: cursor + 1 })
            cursor++
         }
         if (cursor >= lines.length) {
            addIssue(
               state,
               start + 1,
               `The props of "${node.name}" start with --- but never end: add a closing ---.`
            )
            return { node, next: lines.length }
         }
         node.yaml = { lines: body, line: start + 1 }
         cursor++
      }
      let slot = node.slots[0]!
      while (cursor < lines.length) {
         const raw = lines[cursor]!
         const close = CLOSE_LINE.exec(raw)
         if (close) {
            const count = close[1]!.length
            if (count === node.colons) return { node, next: cursor + 1 }
            if (count < node.colons) {
               addIssue(state, node.line, `"${node.name}" is not closed: end it with ${fence}.`)
               return { node, next: cursor }
            }
            addIssue(state, cursor + 1, `Unexpected ${close[1]}: there is no block to close here.`)
            cursor++
            continue
         }
         if (OPEN_LINE.test(raw)) {
            const child = parseComponent(cursor)
            slot.children.push(child.node)
            cursor = child.next
            continue
         }
         const named = SLOT_LINE.exec(raw)
         if (named) {
            slot = { name: named[1]!, line: cursor + 1, text: [], children: [] }
            node.slots.push(slot)
            cursor++
            continue
         }
         slot.text.push({ text: raw, line: cursor + 1 })
         cursor++
      }
      addIssue(state, node.line, `"${node.name}" is not closed: end it with ${fence}.`)
      return { node, next: lines.length }
   }

   let stray = false
   while (at < lines.length) {
      const raw = lines[at]!
      if (!raw.trim()) {
         stray = false
         at++
         continue
      }
      if (OPEN_LINE.test(raw)) {
         const parsed = parseComponent(at)
         doc.nodes.push(parsed.node)
         at = parsed.next
         stray = false
         continue
      }
      if (CLOSE_LINE.test(raw)) {
         addIssue(state, at + 1, `Unexpected ${raw.trim()}: there is no block to close here.`)
      } else if (!stray) {
         addIssue(
            state,
            at + 1,
            'Text outside a block: put it inside a block, between ::name and ::.'
         )
         stray = true
      }
      at++
   }
   return doc
}

function yamlKeyLines(lines: readonly SourceLine[]): Map<string, number> {
   const keys = new Map<string, number>()
   const indents = lines
      .filter((line) => line.text.trim() && !line.text.trim().startsWith('#'))
      .map((line) => /^ */.exec(line.text)![0].length)
   const indent = indents.length ? Math.min(...indents) : 0
   for (const line of lines) {
      if (/^ */.exec(line.text)![0].length !== indent) continue
      const match = /^\s*(["']?)([^"':#\s][^"':]*?)\1\s*:(?:\s|$)/.exec(line.text)
      if (match && !keys.has(match[2]!)) keys.set(match[2]!, line.line)
   }
   return keys
}

function parseYamlBlock(
   block: { lines: SourceLine[]; line: number },
   what: string,
   state: ParseState
): Values | null {
   const source = block.lines.map((line) => line.text).join('\n')
   if (!source.trim()) return {}
   let data: unknown
   try {
      data = parseYAML(source)
   } catch (error) {
      const mark = (error as { mark?: { line?: number } }).mark
      const reason = (error as { reason?: string }).reason ?? (error as Error).message
      const line =
         typeof mark?.line === 'number'
            ? Math.min(block.line + 1 + mark.line, block.line + block.lines.length)
            : block.line
      addIssue(state, line, `Invalid YAML in ${what}: ${reason}.`)
      return null
   }
   if (data == null) return {}
   if (!isRecord(data)) {
      addIssue(state, block.line, `The YAML of ${what} must be a list of key: value lines.`)
      return null
   }
   return data
}

function dateText(value: Date, field: FieldConfig): string {
   const iso = value.toISOString()
   if (field.type === 'datetime') return iso
   return field.type === 'date' || iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso
}

function textValue(value: unknown, field: FieldConfig): unknown {
   if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : dateText(value, field)
   if (typeof value === 'number' || typeof value === 'boolean') return String(value)
   return value
}

function typeLabel(field: FieldConfig): string {
   switch (field.type) {
      case 'number':
         return field.integer ? 'a whole number' : 'a number'
      case 'boolean':
         return 'true or false'
      case 'richtext':
         return 'Markdown text'
      case 'select':
         return field.multiple ? 'a list of options' : 'one option'
      case 'tags':
         return 'a list of tags'
      case 'media':
         return 'a media key'
      case 'relation':
         return field.cardinality === 'many-to-many' ? 'a list of ids' : 'an id'
      case 'link':
         return 'a link'
      default:
         return 'text'
   }
}

function coerceList(value: unknown): unknown {
   if (typeof value === 'string')
      return value
         .split(',')
         .map((part) => part.trim())
         .filter(Boolean)
   if (Array.isArray(value))
      return value.map((item) => textValue(item, { label: '', type: 'text' }))
   return value
}

function coerceSelect(field: FieldConfig, value: unknown): unknown {
   const options = selectOptions(field)
   const pick = (item: unknown) => {
      const text = typeof item === 'number' ? String(item) : item
      if (typeof text !== 'string') return text
      if (options.some((option) => option.value === text)) return text
      const lower = text.trim().toLowerCase()
      return (
         options.find(
            (option) => option.value.toLowerCase() === lower || option.label.toLowerCase() === lower
         )?.value ?? text
      )
   }
   if (field.multiple) {
      const list = coerceList(value)
      return Array.isArray(list) ? list.map(pick) : list
   }
   return pick(value)
}

function coerceLink(value: unknown): unknown {
   if (typeof value === 'string') return value.trim() ? { url: value.trim() } : null
   if (!isRecord(value)) return value
   const link: Values = {}
   for (const key of ['url', 'entry', 'id', 'label'] as const) {
      const part = value[key]
      if (part != null) link[key] = typeof part === 'number' ? String(part) : part
   }
   if (value.newTab === true || value.newTab === 'true') link.newTab = true
   return link
}

function coerce(field: FieldConfig, value: unknown): unknown {
   switch (field.type) {
      case 'number':
         if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value)))
            return Number(value)
         return value
      case 'boolean':
         if (value === 'true' || value === 'yes') return true
         if (value === 'false' || value === 'no') return false
         return value
      case 'select':
         return coerceSelect(field, value)
      case 'tags':
         return coerceList(value)
      case 'relation':
         if (field.cardinality === 'many-to-many') return coerceList(value)
         return textValue(value, field)
      case 'link':
         return coerceLink(value)
      case 'json':
         return value instanceof Date ? value.toISOString() : value
      case 'richtext':
         return typeof value === 'string' ? markdownToHtml(value) : value
      default:
         return textValue(value, field)
   }
}

function linkProblem(field: FieldConfig, value: unknown): string {
   if (!isRecord(value))
      return 'Write a link as YAML: { url: /path } or { entry: <entry>, id: <id> }.'
   const url = typeof value.url === 'string' ? value.url.trim() : ''
   if (url) {
      if (value.entry || value.id) return 'A link has either a url or an entry and id, not both.'
      if (!allowsExternalLinks(field)) return 'This link cannot point to a URL: use { entry, id }.'
      return linkUrlError(url) ?? 'Invalid URL.'
   }
   if (!value.entry || !value.id) return 'A link needs a url, or an entry and an id.'
   const targets = declaredLinkTargets(field)
   return targets ? `This link can point to: ${quoteList(targets)}.` : 'Invalid link.'
}

function shapeProblem(field: FieldConfig, value: unknown): string {
   if (field.type === 'select') {
      const options = quoteList(selectOptionValues(field))
      const shown = Array.isArray(value) ? value.join(', ') : String(value)
      return `"${shown}" is not an option. Use one of: ${options}.`
   }
   if (field.type === 'link') return linkProblem(field, value)
   if (field.type === 'media')
      return 'Invalid media key: write the path of a file in the media library.'
   return `Expected ${typeLabel(field)}.`
}

function readPlain(
   field: FieldConfig,
   raw: unknown,
   state: ParseState,
   line: number | null,
   where: string
): unknown {
   if (raw === undefined || raw === null) return null
   if (typeof raw === 'string' && !raw.trim() && field.type !== 'json') return null
   const value = coerce(field, raw)
   if (value === null) return null
   let shaped: unknown
   if (field.type === 'relation' && field.cardinality === 'many-to-many') {
      shaped =
         Array.isArray(value) && value.every((item) => typeof item === 'string' && item)
            ? value
            : null
   } else {
      const plainField: FieldConfig = { ...field, translatable: false }
      shaped = pastedFieldValue(plainField, value, { locales: [], defaultLocale: state.locale })
   }
   if (
      shaped == null ||
      (Array.isArray(value) && Array.isArray(shaped) && shaped.length < value.length)
   ) {
      if (Array.isArray(value) && !value.length) return null
      addIssue(state, line, `${where}: ${shapeProblem(field, value)}`)
      return null
   }
   if (field.type === 'media' && state.media && !state.media.has(String(shaped)))
      addIssue(state, line, `${where}: "${String(shaped)}" is not in the media library.`, 'warning')
   return shaped
}

function storedValue(
   field: FieldConfig,
   plain: unknown,
   current: unknown,
   state: ParseState
): unknown {
   const { i18n, locale } = state
   if (localized(field, i18n)) {
      const map = Object.fromEntries(
         Object.entries(decodeTranslatableValue(current, i18n.defaultLocale) ?? {}).filter(
            ([code, text]) => i18n.locales.includes(code) && typeof text === 'string' && !!text
         )
      )
      if (typeof plain === 'string' && plain) map[locale] = plain
      else delete map[locale]
      return Object.keys(map).length ? map : null
   }
   if (field.type === 'link' && localizedLabel(field, i18n) && isRecord(plain)) {
      const { label, ...rest } = plain as CmsLinkValue
      const previous = isRecord(current) ? current.label : undefined
      const map: Record<string, string> = Object.fromEntries(
         Object.entries(
            isRecord(previous)
               ? previous
               : typeof previous === 'string' && previous
                 ? { [i18n.defaultLocale]: previous }
                 : {}
         ).filter(
            (pair): pair is [string, string] =>
               i18n.locales.includes(pair[0]) && typeof pair[1] === 'string' && !!pair[1]
         )
      )
      if (typeof label === 'string' && label) map[locale] = label
      else delete map[locale]
      const ordered: CmsLinkValue = {
         ...(rest.url ? { url: rest.url } : { entry: rest.entry, id: rest.id }),
      }
      if (Object.keys(map).length) ordered.label = map
      if (rest.newTab) ordered.newTab = true
      return ordered
   }
   return plain
}

function describeBlock(block: BlockConfig, type: string) {
   return `"${type}" (${block.label})`
}

function readBlock(
   node: MdcNode,
   field: FieldConfig,
   path: (string | number)[],
   depth: number,
   state: ParseState
): ParsedBlock | null {
   const block = field.blocks?.[node.name]
   const names = Object.keys(field.blocks ?? {})
   if (!block) {
      addIssue(
         state,
         node.line,
         `Unknown block "${node.name}" in ${field.label}.${suggestion(
            node.name,
            names
         )} Use one of: ${quoteList(names)}.`
      )
      return null
   }
   const pathText = formatBlockPath(path)
   state.lines.set(pathText, node.line)
   const where = (key: string) => `${describeBlock(block, node.name)}, ${key}`
   const layout = blockLayout(block)
   const keys = Object.keys(block.fields)
   const raw: Values = {}
   const rawLines = new Map<string, number>()
   const parsed: ParsedBlock = { type: node.name, block, values: {}, lists: {}, hidden: false }
   const accept = (key: string, value: unknown, line: number) => {
      if (key === BLOCK_HIDDEN_KEY && !declaresHiddenField(block)) {
         const hidden = coerce({ label: '', type: 'boolean' }, value)
         if (typeof hidden !== 'boolean')
            addIssue(state, line, `${where('hidden')}: write hidden or hidden=false.`)
         else parsed.hidden = hidden
         return
      }
      const subfield = block.fields[key]
      if (!subfield) {
         addIssue(
            state,
            line,
            `Unknown field "${key}" in block ${describeBlock(block, node.name)}.${suggestion(
               key,
               keys
            )} Fields: ${quoteList(keys)}.`
         )
         return
      }
      if (subfield.type === 'blocks') {
         addIssue(
            state,
            line,
            `${where(key)} holds blocks: write them inside the block${
               key === layout.defaultKey ? '' : ` after a #${key} line`
            }.`
         )
         return
      }
      if (Object.hasOwn(raw, key)) {
         addIssue(state, line, `${where(key)} is written twice.`)
         return
      }
      raw[key] = value
      rawLines.set(key, line)
   }
   for (const [key, value] of Object.entries(node.props)) accept(key, value, node.line)
   if (node.yaml) {
      const data = parseYamlBlock(node.yaml, `the props of "${node.name}"`, state)
      const keyLines = yamlKeyLines(node.yaml.lines)
      if (data)
         for (const [key, value] of Object.entries(data))
            accept(key, value, keyLines.get(key) ?? node.yaml.line)
   }
   const children: Record<string, MdcNode[]> = {}
   const childLines = new Map<string, number>()
   const singleList = keys.filter((key) => block.fields[key]!.type === 'blocks')
   for (const slot of node.slots) {
      const key = slot.name ?? layout.defaultKey
      const text = slot.text.filter((line) => line.text.trim())
      if (!key) {
         if (text.length || slot.children.length)
            addIssue(
               state,
               (text[0] ?? slot.children[0])!.line,
               `Block ${describeBlock(block, node.name)} has no body: put its fields in props.`
            )
         continue
      }
      const subfield = block.fields[key]
      if (!subfield || (subfield.type !== 'richtext' && subfield.type !== 'blocks')) {
         const slots = [layout.defaultKey, ...layout.slotKeys].filter(Boolean) as string[]
         addIssue(
            state,
            slot.line,
            `Unknown slot "#${key}" in block ${describeBlock(block, node.name)}.${
               slots.length ? ` Slots: ${slots.map((name) => `#${name}`).join(', ')}.` : ''
            }`
         )
         continue
      }
      if (subfield.type === 'richtext') {
         if (slot.children.length) {
            const target = singleList.length === 1 ? singleList[0]! : null
            if (target && !children[target]) {
               children[target] = slot.children
               childLines.set(target, slot.children[0]!.line)
            } else
               addIssue(
                  state,
                  slot.children[0]!.line,
                  `${where(
                     key
                  )} is rich text: nested blocks go after a #field line of a block list.`
               )
         }
         if (!text.length) continue
         if (Object.hasOwn(raw, key)) {
            addIssue(state, text[0]!.line, `${where(key)} is written twice.`)
            continue
         }
         raw[key] = slot.text.map((line) => line.text).join('\n')
         rawLines.set(key, text[0]!.line)
         continue
      }
      if (text.length)
         addIssue(
            state,
            text[0]!.line,
            `${where(key)} holds blocks only: write each one as ${':'.repeat(
               node.colons + 1
            )}name ... ${':'.repeat(node.colons + 1)}.`
         )
      if (children[key]) {
         addIssue(state, slot.line, `${where(key)} is written twice.`)
         continue
      }
      children[key] = slot.children
      childLines.set(key, slot.name ? slot.line : slot.children[0]?.line ?? node.line)
   }
   for (const [key, subfield] of Object.entries(block.fields)) {
      const fieldPath = [...path, key]
      if (subfield.type === 'blocks') {
         state.lines.set(formatBlockPath(fieldPath), childLines.get(key) ?? node.line)
         if (depth >= MAX_BLOCKS_DEPTH && children[key]?.length) {
            addIssue(
               state,
               children[key]![0]!.line,
               `${where(key)}: blocks nest at most ${MAX_BLOCKS_DEPTH} levels.`
            )
            continue
         }
         parsed.lists[key] = readList(children[key] ?? [], subfield, fieldPath, depth + 1, state)
         continue
      }
      const line = rawLines.get(key) ?? node.line
      state.lines.set(formatBlockPath(fieldPath), line)
      parsed.values[key] = readPlain(subfield, raw[key], state, line, where(key))
   }
   return parsed
}

function readList(
   nodes: readonly MdcNode[],
   field: FieldConfig,
   path: (string | number)[],
   depth: number,
   state: ParseState
): ParsedBlock[] {
   const out: ParsedBlock[] = []
   for (const node of nodes) {
      const parsed = readBlock(node, field, [...path, out.length], depth, state)
      if (parsed) out.push(parsed)
   }
   return out
}

function projection(block: BlockConfig, item: unknown, state: ParseState): string {
   if (!isRecord(item)) return ''
   const values: Values = {}
   for (const [key, field] of Object.entries(block.fields)) {
      if (field.type === 'blocks') continue
      const plain = plainValue(field, item[key], state)
      values[key] =
         field.type === 'richtext' && typeof plain === 'string' ? markdownToHtml(plain) : plain
   }
   return JSON.stringify(values)
}

function parsedProjection(parsed: ParsedBlock, state: ParseState): string {
   const values: Values = {}
   for (const [key, field] of Object.entries(parsed.block.fields)) {
      if (field.type === 'blocks') continue
      values[key] =
         field.type === 'link'
            ? plainLink({ ...field, translatable: false }, parsed.values[key], state)
            : parsed.values[key] ?? null
   }
   return JSON.stringify(values)
}

function alignBlocks(
   parsed: ParsedBlock[],
   current: unknown[],
   state: ParseState
): (number | null)[] {
   const n = parsed.length
   const m = current.length
   const pairs: (number | null)[] = parsed.map(() => null)
   if (!n || !m) return pairs
   const score = (i: number, j: number) => {
      const item = current[j]
      if (!isRecord(item) || String(item.type) !== parsed[i]!.type) return -1
      return projection(parsed[i]!.block, item, state) === parsedProjection(parsed[i]!, state)
         ? 3
         : 2
   }
   const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
   for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
         const pair = score(i - 1, j - 1)
         table[i]![j] = Math.max(
            table[i - 1]![j]!,
            table[i]![j - 1]!,
            pair > 0 ? table[i - 1]![j - 1]! + pair : 0
         )
      }
   }
   let i = n
   let j = m
   while (i > 0 && j > 0) {
      const pair = score(i - 1, j - 1)
      if (pair > 0 && table[i]![j] === table[i - 1]![j - 1]! + pair) {
         pairs[i - 1] = j - 1
         i--
         j--
      } else if (table[i - 1]![j]! >= table[i]![j - 1]!) i--
      else j--
   }
   return pairs
}

function buildList(parsed: ParsedBlock[], current: unknown, state: ParseState): BlockItem[] | null {
   if (!parsed.length) return null
   const list = Array.isArray(current) ? current : []
   const pairs = alignBlocks(parsed, list, state)
   return parsed.map((item, index) => {
      const match = pairs[index]
      return buildBlock(item, match == null ? null : (list[match] as BlockItem), state)
   })
}

function buildBlock(parsed: ParsedBlock, current: BlockItem | null, state: ParseState): BlockItem {
   const item: BlockItem = { type: parsed.type }
   for (const [key, field] of Object.entries(parsed.block.fields)) {
      item[key] =
         field.type === 'blocks'
            ? buildList(parsed.lists[key] ?? [], current?.[key], state)
            : storedValue(field, parsed.values[key], current?.[key], state)
   }
   if (parsed.hidden) item[BLOCK_HIDDEN_KEY] = true
   return item
}

function createState(options: CmsMdcParseOptions): ParseState {
   return {
      i18n: options.i18n,
      locale: activeLocale(options),
      media: options.media ?? null,
      issues: [],
      lines: new Map(),
   }
}

function pathLabel(
   fields: Record<string, FieldConfig>,
   values: Values,
   path: readonly PropertyKey[]
) {
   const parts: string[] = []
   let field: FieldConfig | undefined = fields[String(path[0])]
   if (!field) return ''
   parts.push(field.label)
   let value: unknown = values[String(path[0])]
   for (let at = 1; at < path.length; at++) {
      const segment = path[at]
      if (field?.type === 'blocks' && typeof segment === 'number' && Array.isArray(value)) {
         const item: unknown = value[segment]
         const block: BlockConfig | undefined = isRecord(item)
            ? field.blocks?.[String(item.type)]
            : undefined
         if (!block) break
         parts.push(block.label)
         const key = path[at + 1]
         if (typeof key !== 'string' || !block.fields[key]) break
         field = block.fields[key]
         parts.push(field!.label)
         value = (item as Values)[key]
         at++
         continue
      }
      break
   }
   return parts.join(' > ')
}

function lineOf(state: ParseState, path: readonly PropertyKey[], fallback: number | null) {
   for (let length = path.length; length > 0; length--) {
      const line = state.lines.get(path.slice(0, length).map(String).join('.'))
      if (line !== undefined) return line
   }
   return fallback
}

function applyCheck(
   check: CmsMdcCheck | undefined,
   fields: Record<string, FieldConfig>,
   values: Values,
   state: ParseState,
   fallback: (path: readonly PropertyKey[]) => number | null
) {
   if (!check) return
   const seen = new Set<string>()
   for (const issue of check(values)) {
      const path = issue.path.filter(
         (segment): segment is string | number =>
            typeof segment === 'string' || typeof segment === 'number'
      )
      const label = pathLabel(fields, values, path)
      const message = label ? `${label}: ${issue.message}` : issue.message
      const key = `${path.join('.')}|${message}`
      if (seen.has(key)) continue
      seen.add(key)
      addIssue(
         state,
         lineOf(state, path, fallback(path)),
         message,
         issue.level === 'warning' ? 'warning' : 'error',
         path.join('.')
      )
   }
}

function sortIssues(issues: CmsMdcIssue[]): CmsMdcIssue[] {
   return issues
      .map((issue, index) => ({ issue, index }))
      .sort(
         (a, b) =>
            (a.issue.line ?? Number.MAX_SAFE_INTEGER) - (b.issue.line ?? Number.MAX_SAFE_INTEGER) ||
            a.index - b.index
      )
      .map(({ issue }) => issue)
}

export function mdcToBlocks(
   text: string,
   field: FieldConfig,
   options: CmsBlocksMdcParseOptions
): CmsBlocksMdcResult {
   const state = createState(options)
   const key = options.key ?? DEFAULT_BLOCKS_KEY
   const doc = parseDocument(text, false, state)
   state.lines.set(key, doc.nodes[0]?.line ?? 1)
   const parsed = readList(doc.nodes, field, [key], 1, state)
   const value = buildList(parsed, options.current, state)
   applyCheck(
      options.check,
      { [key]: field },
      { [key]: value },
      state,
      () => doc.nodes[0]?.line ?? null
   )
   return { value, issues: sortIssues(state.issues) }
}

function slugFallback(
   fields: Record<string, FieldConfig>,
   values: Values,
   current: Values,
   i18n: CmsI18n
) {
   for (const [key, field] of Object.entries(fields)) {
      if (field.type !== 'slug') continue
      const value = values[key]
      if (typeof value === 'string' && value.trim()) continue
      const previous = current[key]
      if (typeof previous === 'string' && previous.trim()) {
         values[key] = previous
         continue
      }
      const source = field.from ? values[field.from] : null
      const text =
         typeof source === 'string'
            ? source
            : decodeTranslatableValue(source, i18n.defaultLocale)?.[i18n.defaultLocale]
      if (typeof text === 'string' && slugify(text)) values[key] = slugify(text)
   }
}

export function mdcToEntry(
   text: string,
   fields: Record<string, FieldConfig>,
   options: CmsEntryMdcParseOptions
): CmsEntryMdcResult {
   const state = createState(options)
   const body = options.body ?? CONTENT_BODY_FIELD
   const current = options.current ?? {}
   const values: Values = { ...current }
   const doc = parseDocument(text, true, state)
   const allowed = mdcFrontmatterKeys(fields, body)
   const keyLines = doc.frontmatter
      ? yamlKeyLines(doc.frontmatter.lines)
      : new Map<string, number>()
   const front = doc.frontmatter ? parseYamlBlock(doc.frontmatter, 'the front matter', state) : {}
   for (const [key, raw] of Object.entries(front ?? {})) {
      const line = keyLines.get(key) ?? doc.frontmatter?.line ?? null
      const field = fields[key]
      if (!field || !allowed.includes(key)) {
         const reason =
            key === body
               ? `"${key}" is the body: write its blocks after the front matter.`
               : field
                 ? `"${key}" cannot be edited as text: use the form.`
                 : `Unknown field "${key}".${suggestion(key, allowed)} Fields: ${quoteList(
                      allowed
                   )}.`
         addIssue(state, line, reason)
         continue
      }
      if (line !== null) state.lines.set(key, line)
      const plain = readPlain(field, raw, state, line, field.label)
      values[key] = storedValue(field, plain, current[key], state)
   }
   slugFallback(fields, values, current, state.i18n)
   const blocksField = fields[body]
   if (blocksField?.type === 'blocks') {
      state.lines.set(body, doc.nodes[0]?.line ?? doc.frontmatter?.line ?? 1)
      const parsed = readList(doc.nodes, blocksField, [body], 1, state)
      values[body] = buildList(parsed, current[body], state)
   } else if (doc.nodes.length) {
      addIssue(state, doc.nodes[0]!.line, 'This item has no blocks: write only the front matter.')
   }
   applyCheck(options.check, fields, values, state, (path) =>
      path[0] === body ? doc.nodes[0]?.line ?? null : doc.frontmatter?.line ?? null
   )
   return { values, issues: sortIssues(state.issues) }
}

export function hasMdcErrors(issues: readonly CmsMdcIssue[]): boolean {
   return issues.some((issue) => issue.level === 'error')
}

function languageName(locale: string) {
   try {
      const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(locale)
      return name && name !== locale ? `${name} (${locale})` : locale
   } catch {
      return locale
   }
}

function sizeRule(field: FieldConfig): string | null {
   const { min, max } = field
   if (min === undefined && max === undefined) return null
   const unit =
      field.type === 'blocks'
         ? 'blocks'
         : field.type === 'tags'
           ? 'tags'
           : field.type === 'number'
             ? ''
             : 'characters'
   const suffix = unit ? ` ${unit}` : ''
   const counted = (value: number) => (value === 1 && unit ? ` ${unit.replace(/s$/, '')}` : suffix)
   if (min !== undefined && max !== undefined)
      return min === max ? `exactly ${min}${counted(min)}` : `${min} to ${max}${suffix}`
   return max !== undefined ? `at most ${max}${counted(max)}` : `at least ${min}${counted(min!)}`
}

function mediaKinds(field: FieldConfig) {
   const kinds = [field.mediaType ?? 'file'].flat()
   return kinds.includes('file') ? 'any file' : kinds.join(' or ')
}

function fieldTypeText(field: FieldConfig): string {
   switch (field.type) {
      case 'text':
         return field.textarea ? 'text, may span several lines' : 'text, one line'
      case 'richtext':
         return 'rich text in Markdown'
      case 'number':
         return field.integer ? 'whole number' : 'number'
      case 'boolean':
         return 'true or false'
      case 'date':
         return 'date, yyyy-mm-dd'
      case 'datetime':
         return 'date and time, ISO 8601 with a time zone, like 2026-03-09T09:00:00Z'
      case 'email':
         return 'email address'
      case 'slug':
         return 'slug: lowercase letters, numbers and dashes'
      case 'select':
         return field.multiple ? 'list of option values' : 'one option value'
      case 'tags':
         return 'list of short tags'
      case 'json':
         return 'any YAML value'
      case 'media':
         return `media key (${mediaKinds(field)})`
      case 'relation':
         return field.cardinality === 'many-to-many'
            ? `list of ids of items of "${String(field.to)}"`
            : `id of an item of "${String(field.to)}"`
      case 'link':
         return linkTypeText(field)
      case 'blocks':
         return 'list of blocks'
   }
}

function linkTypeText(field: FieldConfig) {
   const forms: string[] = []
   if (allowsExternalLinks(field)) forms.push('{ url: /path or https://... }')
   const targets = declaredLinkTargets(field)
   forms.push(`{ entry: ${targets ? targets.join(' | ') : '<entry>'}, id: <id> }`)
   const extra = [field.withLabel ? 'label: <link text>' : null, 'newTab: true (optional)'].filter(
      Boolean
   )
   return `link as YAML, ${forms.join(' or ')}, plus ${extra.join(', ')}`
}

function fieldLine(
   key: string,
   field: FieldConfig,
   placement: string | null,
   locale: string,
   i18n: CmsI18n
): string {
   const notes = [fieldTypeText(field)]
   if (field.required) notes.push(field.showIf ? 'required when shown' : 'required')
   const size = sizeRule(field)
   if (size) notes.push(size)
   if (placement) notes.push(placement)
   if ((localized(field, i18n) || localizedLabel(field, i18n)) && i18n.locales.length > 1)
      notes.push(`in ${languageName(locale)}`)
   let line = `- \`${key}\` (${notes.join(', ')}): ${field.label}`
   if (field.description) line += `. ${field.description}`
   if (field.type === 'select') {
      const options = selectOptions(field)
         .map((option) =>
            option.label === option.value
               ? `\`${option.value}\``
               : `\`${option.value}\` (${option.label})`
         )
         .join(', ')
      line += `. Options: ${options}`
   }
   if (!placement && field.type === 'relation')
      line += '. Leave it out unless you know the id: it keeps its current value'
   if (!placement && field.type === 'slug')
      line += '. Leave it out to keep the current one, or to make it from the title'
   return line
}

function sampleMediaKey(field: FieldConfig, media: readonly string[] | null | undefined) {
   const kinds = [field.mediaType ?? 'file'].flat()
   const extension = (key: string) => key.split('.').pop()?.toLowerCase() ?? ''
   const images = ['webp', 'jpg', 'jpeg', 'png', 'gif', 'avif', 'svg']
   const videos = ['mp4', 'webm', 'mov', 'm4v']
   const fits = (key: string) =>
      kinds.includes('file') ||
      (kinds.includes('image') && images.includes(extension(key))) ||
      (kinds.includes('video') && videos.includes(extension(key)))
   const found = media?.find(fits)
   if (found) return found
   if (kinds.includes('image') || kinds.includes('file')) return 'folder/example.webp'
   return 'folder/example.mp4'
}

function clampText(text: string, field: FieldConfig) {
   return field.max !== undefined && text.length > field.max ? text.slice(0, field.max) : text
}

function sampleValue(field: FieldConfig, options: CmsMdcGuideOptions, depth: number): unknown {
   switch (field.type) {
      case 'text':
         return clampText(
            field.textarea ? `${field.label} text, one or two sentences.` : `${field.label} text`,
            field
         )
      case 'richtext':
         return '<p>A paragraph with <strong>bold</strong> and <em>italic</em> words.</p><ul><li><p>A list item</p></li></ul>'
      case 'number': {
         const base = field.min ?? (field.integer ? 3 : 1.5)
         return field.max !== undefined ? Math.min(base, field.max) : base
      }
      case 'boolean':
         return true
      case 'date':
         return '2026-01-15'
      case 'datetime':
         return '2026-01-15T09:00:00.000Z'
      case 'email':
         return 'name@example.com'
      case 'slug':
         return 'example-item'
      case 'select': {
         const first = selectOptionValues(field)[0]
         if (first === undefined) return null
         return field.multiple ? [first] : first
      }
      case 'tags':
         return ['example']
      case 'json':
         return { key: 'value' }
      case 'media':
         return sampleMediaKey(field, options.media)
      case 'link': {
         const label = field.withLabel ? { label: 'Read more' } : {}
         if (allowsExternalLinks(field)) return { url: '/contact', ...label }
         const target = declaredLinkTargets(field)?.[0] ?? 'pages'
         return { entry: target, id: 'home', ...label }
      }
      case 'blocks': {
         const entries = Object.entries(field.blocks ?? {})
         if (!entries.length || depth >= MAX_BLOCKS_DEPTH) return null
         const count = Math.max(1, Math.min(field.min ?? 1, field.max ?? 1, 2))
         return Array.from({ length: count }, (_, index) => {
            const [type, block] = entries[index % entries.length]!
            return sampleBlock(type, block, options, depth + 1)
         })
      }
      default:
         return null
   }
}

function storedSample(field: FieldConfig, value: unknown, options: CmsMdcGuideOptions) {
   if (value == null) return null
   const locale = activeLocale(options)
   if (localized(field, options.i18n)) return { [locale]: value }
   if (field.type === 'link' && localizedLabel(field, options.i18n) && isRecord(value)) {
      const { label, ...rest } = value
      return label ? { ...rest, label: { [locale]: label } } : rest
   }
   return value
}

function sampleBlock(
   type: string,
   block: BlockConfig,
   options: CmsMdcGuideOptions,
   depth: number
): BlockItem {
   const item: BlockItem = { type }
   for (const [key, field] of Object.entries(block.fields)) {
      if (field.type === 'blocks') {
         item[key] = sampleValue(field, options, depth)
         continue
      }
      item[key] = storedSample(field, sampleValue(field, options, depth), options)
   }
   return item
}

interface GuideBlock {
   type: string
   block: BlockConfig
   parent: string | null
   depth: number
}

function collectGuideBlocks(
   field: FieldConfig,
   depth: number,
   parent: string | null,
   out: GuideBlock[]
) {
   for (const [type, block] of Object.entries(field.blocks ?? {})) {
      const signature = JSON.stringify(block.fields)
      const seen = out.find(
         (entry) => entry.type === type && JSON.stringify(entry.block.fields) === signature
      )
      if (seen) continue
      out.push({ type, block, parent, depth })
      for (const sub of Object.values(block.fields)) {
         if (sub.type === 'blocks' && depth < MAX_BLOCKS_DEPTH)
            collectGuideBlocks(sub, depth + 1, type, out)
      }
   }
}

function placementText(key: string, field: FieldConfig, layout: BlockLayout, colons: number) {
   if (key === layout.defaultKey)
      return field.type === 'blocks'
         ? `nested blocks written inside the block with ${':'.repeat(colons + 1)}`
         : 'the block body: Markdown between the opening and the closing line'
   if (layout.slotKeys.includes(key))
      return field.type === 'blocks'
         ? `nested blocks after a \`#${key}\` line inside the block, with ${':'.repeat(colons + 1)}`
         : `Markdown after a \`#${key}\` line inside the block`
   return field.type === 'link' || field.type === 'json' ? 'YAML props' : 'prop'
}

function guideBlockSection(entry: GuideBlock, options: CmsMdcGuideOptions): string[] {
   const { type, block, depth } = entry
   const colons = depth + 1
   const layout = blockLayout(block)
   const locale = activeLocale(options)
   const lines = [
      `### \`${type}\`: ${block.label}${entry.parent ? ` (inside \`${entry.parent}\`)` : ''}`,
      '',
   ]
   const about = [block.description, block.group ? `Group: ${block.group}.` : null]
      .filter(Boolean)
      .join(' ')
   if (about) lines.push(about, '')
   const fields = Object.entries(block.fields)
   if (!fields.length) lines.push('No fields.')
   for (const [key, field] of fields) {
      let line = fieldLine(
         key,
         field,
         placementText(key, field, layout, colons),
         locale,
         options.i18n
      )
      if (field.type === 'blocks') {
         const names = Object.keys(field.blocks ?? {}).map((name) => `\`${name}\``)
         line += `. Blocks allowed inside: ${names.join(', ')}`
      }
      lines.push(line)
   }
   if (!declaresHiddenField(block))
      lines.push('- `hidden` (bare prop, optional): hides the block on the site')
   const field: FieldConfig = { label: block.label, type: 'blocks', blocks: { [type]: block } }
   const example = serializeList([sampleBlock(type, block, options, depth)], field, colons, {
      i18n: options.i18n,
      locale,
   })
   lines.push('', 'Example:', '', '```mdc', ...example, '```', '')
   return lines
}

function syntaxRules(options: CmsMdcGuideOptions, frontmatter: boolean): string[] {
   const locale = activeLocale(options)
   const media = options.media?.length ? options.media.slice(0, MDC_GUIDE_MEDIA_MAX) : null
   const rules = [
      '## Syntax',
      '',
      ...(frontmatter
         ? [
              '- The text starts with a YAML front matter between two `---` lines, with the fields listed under "Front matter". Leave out a field you cannot fill: it keeps its current value. `field: null` clears it.',
              '- After the front matter comes the body: a list of blocks.',
           ]
         : ['- The text is a list of blocks, with no front matter.']),
      '- A block starts with `::name` on its own line and ends with `::` on its own line. Use only the block names listed below, exactly as written. Leave an empty line between blocks. Never write text outside a block.',
      '- Short values go in braces right after the name: `::name{key="text" count=3 flag}`. Text goes in double quotes (no double quotes inside), numbers and `true`/`false` go without quotes, a bare key means true.',
      '- Long text, text with double quotes, lists, links and JSON go in a YAML block between two `---` lines right after the opening line, before anything else. A key goes either in braces or in the YAML block, never in both.',
      '- Rich text is Markdown limited to: paragraphs, `## heading`, `### subheading`, `**bold**`, `*italic*`, `~~strike~~`, bullet lists (`- item`), numbered lists (`1. item`), quotes (`> text`) and links (`[text](https://example.com)` or `[text](/page)`). No images, tables, code, HTML, `#` or `####` headings.',
      '- When a block has a rich text body, write the Markdown between the opening and the closing line. Other rich text fields and block lists go after a line `#field` (the field key) inside the block.',
      `- A block that holds other blocks contains them, written with one more colon: \`:::name\` inside \`::name\`, \`::::name\` inside \`:::name\`. Blocks nest at most ${MAX_BLOCKS_DEPTH} levels.`,
      '- Select fields take one of the listed option values (the value, not the label).',
      '- Links are YAML: `link: { url: /contact, label: Contact us }` for an address (`https://...`, `/path`, `#anchor`, `mailto:`, `tel:`) or `{ entry: <entry>, id: <id> }` for a page or an item of the site; add `newTab: true` to open it in a new tab.',
      media
         ? `- Media fields take the key of a file of the media library. Use only these keys: ${media
              .map((key) => `\`${key}\``)
              .join(', ')}${(options.media?.length ?? 0) > media.length ? ' (and more)' : ''}.`
         : '- Media fields take the key (path) of a file of the media library, like `news/cover.webp`. Leave optional media fields out unless you know a key.',
      '- Fill every required field and respect the limits (characters, values, number of blocks).',
      '- Add the bare prop `hidden` to hide a block on the site.',
   ]
   if (options.i18n.locales.length > 1) rules.push(`- Write every text in ${languageName(locale)}.`)
   return [...rules, '']
}

function topLevelRule(field: FieldConfig) {
   const names = Object.keys(field.blocks ?? {}).map((name) => `\`${name}\``)
   const size = sizeRule(field)
   return `Blocks allowed in ${field.label}: ${names.join(', ')}${size ? ` (${size})` : ''}${
      field.required ? ', at least one is required' : ''
   }.`
}

function guideHeader(title: string, options: CmsMdcGuideOptions) {
   const locale = activeLocale(options)
   const language = options.i18n.locales.length > 1 ? ` Write it in ${languageName(locale)}.` : ''
   return [
      `# Writing "${title}" as MDC text`,
      '',
      `You write content for a website. The content is MDC text: Markdown with block components. Answer with only the MDC text: no explanation before or after it, no code fence around it.${language}`,
      '',
   ]
}

export function blocksMdcGuide(field: FieldConfig, options: CmsMdcGuideOptions): string {
   const blocks: GuideBlock[] = []
   collectGuideBlocks(field, 1, null, blocks)
   const lines = [
      ...guideHeader(options.title ?? field.label, options),
      ...syntaxRules(options, false),
      '## Blocks',
      '',
      topLevelRule(field),
      '',
   ]
   for (const entry of blocks) lines.push(...guideBlockSection(entry, options))
   return `${lines.join('\n').trimEnd()}\n`
}

export function entryMdcGuide(
   fields: Record<string, FieldConfig>,
   options: CmsMdcGuideOptions
): string {
   const body = options.body ?? CONTENT_BODY_FIELD
   const locale = activeLocale(options)
   const lines = [
      ...guideHeader(options.title ?? 'the item', options),
      ...syntaxRules(options, true),
      '## Front matter',
      '',
   ]
   const keys = mdcFrontmatterKeys(fields, body)
   for (const key of keys) lines.push(fieldLine(key, fields[key]!, null, locale, options.i18n))
   lines.push('')
   const blocksField = fields[body]
   const sample: Values = {}
   for (const key of keys) {
      const field = fields[key]!
      if (!field.required && !['title', 'excerpt', 'publishedAt'].includes(key)) continue
      if (field.type === 'relation') continue
      sample[key] = storedSample(field, sampleValue(field, options, 1), options)
   }
   if (blocksField?.type === 'blocks') {
      const blocks: GuideBlock[] = []
      collectGuideBlocks(blocksField, 1, null, blocks)
      lines.push('## Blocks', '', topLevelRule(blocksField), '')
      for (const entry of blocks) lines.push(...guideBlockSection(entry, options))
      sample[body] = Object.entries(blocksField.blocks ?? {})
         .slice(0, 2)
         .map(([type, block]) => sampleBlock(type, block, options, 1))
   }
   lines.push(
      '## Full example',
      '',
      '```mdc',
      ...entryToMdc(fields, sample, { ...options, body })
         .trimEnd()
         .split('\n'),
      '```',
      ''
   )
   return `${lines.join('\n').trimEnd()}\n`
}
