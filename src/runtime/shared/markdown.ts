interface HtmlElement {
   tag: string
   attrs: Record<string, string>
   children: HtmlChild[]
}

type HtmlChild = HtmlElement | string

const VOID_TAGS = ['br', 'img', 'hr', 'input', 'meta', 'link', 'wbr', 'source', 'col', 'area']

const NAMED_ENTITIES: Record<string, string> = {
   amp: '&',
   lt: '<',
   gt: '>',
   quot: '"',
   apos: "'",
   nbsp: '\u00a0',
   ndash: '\u2013',
   mdash: '\u2014',
   hellip: '\u2026',
   laquo: '\u00ab',
   raquo: '\u00bb',
   lsquo: '\u2018',
   rsquo: '\u2019',
   ldquo: '\u201c',
   rdquo: '\u201d',
   copy: '\u00a9',
   reg: '\u00ae',
   euro: '\u20ac',
}

export const RICH_TEXT_LINK_ATTRIBUTES = 'target="_blank" rel="noopener noreferrer nofollow"'

function decodeEntities(text: string): string {
   return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (match, name: string) => {
      if (name[0] === '#') {
         const code =
            name[1] === 'x' || name[1] === 'X'
               ? Number.parseInt(name.slice(2), 16)
               : Number.parseInt(name.slice(1), 10)
         return Number.isFinite(code) && code > 0 && code <= 0x10ffff
            ? String.fromCodePoint(code)
            : match
      }
      return NAMED_ENTITIES[name.toLowerCase()] ?? match
   })
}

function parseAttributes(source: string): Record<string, string> {
   const attrs: Record<string, string> = {}
   const pattern = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
   for (const match of source.matchAll(pattern)) {
      attrs[match[1]!.toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '')
   }
   return attrs
}

function parseHtml(html: string): HtmlElement {
   const root: HtmlElement = { tag: '#root', attrs: {}, children: [] }
   const stack: HtmlElement[] = [root]
   const pattern = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g
   let last = 0
   for (const match of html.matchAll(pattern)) {
      const index = match.index ?? 0
      if (index > last) stack.at(-1)!.children.push(decodeEntities(html.slice(last, index)))
      last = index + match[0].length
      if (!match[2]) continue
      const tag = match[2].toLowerCase()
      if (match[1]) {
         const at = stack.map((element) => element.tag).lastIndexOf(tag)
         if (at > 0) stack.length = at
         continue
      }
      const element: HtmlElement = { tag, attrs: parseAttributes(match[3] ?? ''), children: [] }
      stack.at(-1)!.children.push(element)
      if (!VOID_TAGS.includes(tag) && !/\/\s*$/.test(match[3] ?? '')) stack.push(element)
   }
   if (last < html.length) stack.at(-1)!.children.push(decodeEntities(html.slice(last)))
   return root
}

type InlineMark = string

interface InlineSegment {
   text: string
   marks: InlineMark[]
   hardBreak?: boolean
}

const MARK_ORDER = ['link', 'strong', 'em', 's']

function markRank(mark: InlineMark) {
   return MARK_ORDER.indexOf(mark.startsWith('link:') ? 'link' : mark)
}

function inlineMarkFor(element: HtmlElement): InlineMark | null {
   switch (element.tag) {
      case 'strong':
      case 'b':
         return 'strong'
      case 'em':
      case 'i':
         return 'em'
      case 's':
      case 'del':
      case 'strike':
         return 's'
      case 'a':
         return element.attrs.href ? `link:${element.attrs.href}` : null
      default:
         return null
   }
}

function collectInline(children: HtmlChild[], marks: InlineMark[], out: InlineSegment[]) {
   for (const child of children) {
      if (typeof child === 'string') {
         out.push({ text: child.replace(/[ \t\n\r\f]+/g, ' '), marks })
         continue
      }
      if (child.tag === 'br') {
         out.push({ text: '', marks, hardBreak: true })
         continue
      }
      if (child.tag === 'img') continue
      const mark = inlineMarkFor(child)
      const next =
         mark && !marks.includes(mark) && !(mark.startsWith('link:') && marks.some(isLinkMark))
            ? [...marks, mark]
            : marks
      collectInline(child.children, next, out)
   }
}

function isLinkMark(mark: InlineMark) {
   return mark.startsWith('link:')
}

function escapeInline(text: string): string {
   return text.replace(/[\\*_~[\]`]/g, '\\$&')
}

function escapeLineStart(line: string): string {
   if (/^[#>+\-=:|]/.test(line)) return `\\${line}`
   const ordered = /^(\d+)([.)])/.exec(line)
   if (ordered) return `${ordered[1]}\\${line.slice(ordered[1]!.length)}`
   return line
}

function markOpener(mark: InlineMark) {
   if (isLinkMark(mark)) return '['
   return mark === 'strong' ? '**' : mark === 'em' ? '*' : '~~'
}

function markCloser(mark: InlineMark) {
   if (isLinkMark(mark)) return `](${linkDestination(mark.slice(5))})`
   return mark === 'strong' ? '**' : mark === 'em' ? '*' : '~~'
}

function linkDestination(href: string) {
   return /[\s()<>]/.test(href) ? `<${href.replace(/[<>]/g, encodeURIComponent)}>` : href
}

function trimSegments(segments: InlineSegment[]): InlineSegment[] {
   const out: InlineSegment[] = []
   let previousSpace = true
   for (const segment of segments) {
      if (segment.hardBreak) {
         const last = out.at(-1)
         if (last && !last.hardBreak) last.text = last.text.replace(/ +$/, '')
         out.push(segment)
         previousSpace = true
         continue
      }
      let text = segment.text
      if (previousSpace) text = text.replace(/^ +/, '')
      if (!text) continue
      previousSpace = text.endsWith(' ')
      out.push({ ...segment, text })
   }
   const last = out.at(-1)
   if (last && !last.hardBreak) last.text = last.text.replace(/ +$/, '')
   while (out.length && (out.at(-1)!.hardBreak || !out.at(-1)!.text)) out.pop()
   return out
}

function inlineMarkdown(children: HtmlChild[]): string {
   const segments: InlineSegment[] = []
   collectInline(children, [], segments)
   let out = ''
   let pending = ''
   const stack: InlineMark[] = []
   const closeTo = (length: number) => {
      while (stack.length > length) out += markCloser(stack.pop()!)
   }
   for (const segment of trimSegments(segments)) {
      if (segment.hardBreak) {
         closeTo(0)
         pending = ''
         out += '\\\n'
         continue
      }
      const match = /^( *)(.*?)( *)$/s.exec(segment.text)!
      const [, lead = '', core = '', trail = ''] = match
      if (!core) {
         pending += segment.text
         continue
      }
      let keep = 0
      while (keep < stack.length && segment.marks.includes(stack[keep]!)) keep++
      closeTo(keep)
      out += pending + lead
      pending = ''
      const opening = segment.marks
         .filter((mark) => !stack.includes(mark))
         .sort((a, b) => markRank(a) - markRank(b))
      for (const mark of opening) {
         out += markOpener(mark)
         stack.push(mark)
      }
      out += escapeInline(core)
      pending = trail
   }
   closeTo(0)
   return out
      .split('\n')
      .map((line) => escapeLineStart(line))
      .join('\n')
}

const BLOCK_TAGS = [
   'p',
   'h1',
   'h2',
   'h3',
   'h4',
   'h5',
   'h6',
   'ul',
   'ol',
   'li',
   'blockquote',
   'div',
   'section',
   'article',
   'header',
   'footer',
   'pre',
   'hr',
   'table',
   'figure',
]

function isBlockChild(child: HtmlChild) {
   return typeof child !== 'string' && BLOCK_TAGS.includes(child.tag)
}

function indentLines(text: string, first: string, rest: string) {
   return text
      .split('\n')
      .map((line, index) => (index === 0 ? first + line : line ? rest + line : line))
      .join('\n')
}

function listMarkdown(element: HtmlElement): string {
   const ordered = element.tag === 'ol'
   const start = ordered ? Number.parseInt(element.attrs.start ?? '1', 10) || 1 : 1
   const items = element.children.filter(
      (child): child is HtmlElement => typeof child !== 'string' && child.tag === 'li'
   )
   let loose = false
   const rendered = items.map((item, index) => {
      const marker = ordered ? `${start + index}. ` : '- '
      const parts = blockParts(item.children)
      if (parts.filter((part) => part.kind !== 'list').length > 1) loose = true
      const body = parts
         .map((part, at) => (at > 0 && part.kind !== 'list' ? `\n${part.text}` : part.text))
         .join('\n')
      return indentLines(body || '', marker, ' '.repeat(marker.length))
   })
   return rendered.join(loose ? '\n\n' : '\n')
}

interface BlockPart {
   kind: 'paragraph' | 'heading' | 'list' | 'quote'
   text: string
}

function blockParts(children: HtmlChild[]): BlockPart[] {
   const parts: BlockPart[] = []
   let inline: HtmlChild[] = []
   const flush = () => {
      const text = inlineMarkdown(inline)
      inline = []
      if (text) parts.push({ kind: 'paragraph', text })
   }
   for (const child of children) {
      if (!isBlockChild(child)) {
         inline.push(child)
         continue
      }
      flush()
      const element = child as HtmlElement
      switch (element.tag) {
         case 'p':
         case 'pre': {
            const text = inlineMarkdown(element.children)
            if (text) parts.push({ kind: 'paragraph', text })
            break
         }
         case 'h1':
         case 'h2':
         case 'h3':
         case 'h4':
         case 'h5':
         case 'h6': {
            const text = inlineMarkdown(element.children).replace(/\\\n/g, ' ')
            const level = element.tag === 'h1' || element.tag === 'h2' ? '##' : '###'
            if (text) parts.push({ kind: 'heading', text: `${level} ${text}` })
            break
         }
         case 'ul':
         case 'ol': {
            const text = listMarkdown(element)
            if (text) parts.push({ kind: 'list', text })
            break
         }
         case 'blockquote': {
            const text = blockParts(element.children)
               .map((part) => part.text)
               .join('\n\n')
            if (text) {
               const quoted = text
                  .split('\n')
                  .map((line) => (line ? `> ${line}` : '>'))
                  .join('\n')
               parts.push({ kind: 'quote', text: quoted })
            }
            break
         }
         case 'hr':
            break
         default:
            parts.push(...blockParts(element.children))
      }
   }
   flush()
   return parts
}

export function htmlToMarkdown(html: string | null | undefined): string {
   if (typeof html !== 'string' || !html.trim()) return ''
   return blockParts(parseHtml(html).children)
      .map((part) => part.text)
      .join('\n\n')
}

function escapeHtml(text: string): string {
   return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\u00a0/g, '&nbsp;')
}

function escapeAttribute(text: string): string {
   return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

export function isAllowedRichTextHref(href: string): boolean {
   const value = href.trim()
   if (!value || /[\u0000-\u001f\s]/.test(value)) return false
   const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value)
   if (!scheme) return true
   return ['http', 'https', 'mailto', 'tel'].includes(scheme[1]!.toLowerCase())
}

type InlineNode =
   | { kind: 'text'; value: string }
   | { kind: 'break' }
   | {
        kind: 'delim'
        char: string
        count: number
        canOpen: boolean
        canClose: boolean
     }
   | { kind: 'element'; tag: 'strong' | 'em' | 's' | 'a'; href?: string; children: InlineNode[] }

function isWhitespace(char: string | undefined) {
   return char === undefined || /\s/.test(char)
}

function isPunctuation(char: string | undefined) {
   return char !== undefined && /[\p{P}\p{S}]/u.test(char)
}

function delimiterNode(source: string, at: number, char: string, count: number): InlineNode {
   const before = source[at - 1]
   const after = source[at + count]
   const left =
      !isWhitespace(after) &&
      (!isPunctuation(after) || isWhitespace(before) || isPunctuation(before))
   const right =
      !isWhitespace(before) &&
      (!isPunctuation(before) || isWhitespace(after) || isPunctuation(after))
   if (char === '_')
      return {
         kind: 'delim',
         char,
         count,
         canOpen: left && (!right || isPunctuation(before)),
         canClose: right && (!left || isPunctuation(after)),
      }
   return { kind: 'delim', char, count, canOpen: left, canClose: right }
}

function findLinkEnd(
   source: string,
   start: number
): { label: string; href: string; end: number } | null {
   let depth = 0
   let at = start
   for (; at < source.length; at++) {
      const char = source[at]
      if (char === '\\') {
         at++
         continue
      }
      if (char === '[') depth++
      else if (char === ']') {
         depth--
         if (depth === 0) break
      }
   }
   if (depth !== 0 || source[at + 1] !== '(') return null
   const label = source.slice(start + 1, at)
   let cursor = at + 2
   while (source[cursor] === ' ') cursor++
   let href = ''
   if (source[cursor] === '<') {
      const close = source.indexOf('>', cursor)
      if (close === -1) return null
      href = source.slice(cursor + 1, close)
      cursor = close + 1
   } else {
      let parens = 0
      const from = cursor
      for (; cursor < source.length; cursor++) {
         const char = source[cursor]
         if (char === '\\') {
            cursor++
            continue
         }
         if (char === '(') parens++
         else if (char === ')') {
            if (parens === 0) break
            parens--
         } else if (char === ' ') break
      }
      href = source.slice(from, cursor).replace(/\\([!-/:-@[-`{-~])/g, '$1')
   }
   while (source[cursor] === ' ') cursor++
   if (source[cursor] === '"' || source[cursor] === "'") {
      const quote = source[cursor]!
      const close = source.indexOf(quote, cursor + 1)
      if (close === -1) return null
      cursor = close + 1
      while (source[cursor] === ' ') cursor++
   }
   if (source[cursor] !== ')') return null
   return { label, href: href.trim(), end: cursor + 1 }
}

function tokenizeInline(source: string): InlineNode[] {
   const nodes: InlineNode[] = []
   let text = ''
   const flush = () => {
      if (text) nodes.push({ kind: 'text', value: text })
      text = ''
   }
   let at = 0
   while (at < source.length) {
      const char = source[at]!
      if (char === '\\') {
         const next = source[at + 1]
         if (next === '\n') {
            text = text.replace(/ +$/, '')
            flush()
            nodes.push({ kind: 'break' })
            at += 2
            while (source[at] === ' ') at++
            continue
         }
         if (next !== undefined && /[!-/:-@[-`{-~]/.test(next)) {
            text += next
            at += 2
            continue
         }
         text += char
         at++
         continue
      }
      if (char === '\n') {
         const hard = / {2,}$/.test(text)
         text = text.replace(/ +$/, '')
         if (hard) {
            flush()
            nodes.push({ kind: 'break' })
         } else text += ' '
         at++
         while (source[at] === ' ') at++
         continue
      }
      if (char === '`') {
         const run = /^`+/.exec(source.slice(at))![0]
         const close = source.indexOf(run, at + run.length)
         if (close !== -1) {
            text += source.slice(at + run.length, close).trim()
            at = close + run.length
            continue
         }
         text += run
         at += run.length
         continue
      }
      if (char === '<') {
         const auto = /^<((?:https?:\/\/|mailto:)[^\s<>]+)>/i.exec(source.slice(at))
         if (auto) {
            flush()
            nodes.push({
               kind: 'element',
               tag: 'a',
               href: auto[1]!,
               children: [{ kind: 'text', value: auto[1]! }],
            })
            at += auto[0].length
            continue
         }
      }
      if (char === '!' && source[at + 1] === '[') {
         const image = findLinkEnd(source, at + 1)
         if (image) {
            text += image.label
            at = image.end
            continue
         }
      }
      if (char === '[') {
         const link = findLinkEnd(source, at)
         if (link) {
            flush()
            const children = parseInlineNodes(link.label)
            if (isAllowedRichTextHref(link.href))
               nodes.push({ kind: 'element', tag: 'a', href: link.href, children })
            else nodes.push(...children)
            at = link.end
            continue
         }
      }
      if (char === '*' || char === '_' || char === '~') {
         const count = /^(\*+|_+|~+)/.exec(source.slice(at))![0].length
         if (char === '~' && count !== 2) {
            text += char.repeat(count)
            at += count
            continue
         }
         flush()
         nodes.push(delimiterNode(source, at, char, count))
         at += count
         continue
      }
      text += char
      at++
   }
   flush()
   return nodes
}

function delimiterText(node: InlineNode): InlineNode {
   return node.kind === 'delim' ? { kind: 'text', value: node.char.repeat(node.count) } : node
}

function processEmphasis(nodes: InlineNode[]): InlineNode[] {
   let closer = 0
   while (closer < nodes.length) {
      const node = nodes[closer]!
      if (node.kind !== 'delim' || !node.canClose || node.count === 0) {
         closer++
         continue
      }
      let opener = closer - 1
      for (; opener >= 0; opener--) {
         const candidate = nodes[opener]!
         if (
            candidate.kind === 'delim' &&
            candidate.char === node.char &&
            candidate.canOpen &&
            candidate.count > 0 &&
            (node.char !== '~' || candidate.count >= 2)
         )
            break
      }
      if (opener < 0) {
         closer++
         continue
      }
      const open = nodes[opener] as Extract<InlineNode, { kind: 'delim' }>
      const use = node.char === '~' ? 2 : open.count >= 2 && node.count >= 2 ? 2 : 1
      const tag = node.char === '~' ? 's' : use === 2 ? 'strong' : 'em'
      const inner = nodes.slice(opener + 1, closer).map(delimiterText)
      open.count -= use
      node.count -= use
      nodes.splice(opener + 1, closer - opener - 1, { kind: 'element', tag, children: inner })
      closer = opener + 2
      if (open.count === 0) {
         nodes.splice(opener, 1)
         closer--
      }
      if (node.count === 0) nodes.splice(closer, 1)
   }
   return nodes.map(delimiterText)
}

function parseInlineNodes(source: string): InlineNode[] {
   return processEmphasis(tokenizeInline(source))
}

function renderInline(nodes: InlineNode[]): string {
   let html = ''
   for (const node of nodes) {
      if (node.kind === 'text') html += escapeHtml(node.value)
      else if (node.kind === 'break') html += '<br>'
      else if (node.kind === 'element') {
         const only = node.children.length === 1 ? node.children[0] : undefined
         if (node.tag === 'em' && only?.kind === 'element' && only.tag === 'strong') {
            html += renderInline([{ ...only, children: [{ ...node, children: only.children }] }])
            continue
         }
         const inner = renderInline(node.children)
         if (node.tag === 'a')
            html += `<a ${RICH_TEXT_LINK_ATTRIBUTES} href="${escapeAttribute(
               node.href ?? ''
            )}">${inner}</a>`
         else html += `<${node.tag}>${inner}</${node.tag}>`
      } else html += escapeHtml(node.char.repeat(node.count))
   }
   return html
}

function inlineHtml(lines: string[]): string {
   const source = lines.join('\n').trim()
   return renderInline(parseInlineNodes(source)).replace(/(?:<br>)+$/, '')
}

const LIST_ITEM = /^( *)([-*+]|\d{1,9}[.)])( +|$)(.*)$/
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/
const QUOTE = /^ {0,3}> ?(.*)$/

function indentOf(line: string) {
   return /^ */.exec(line)![0].length
}

function isBlank(line: string | undefined) {
   return line === undefined || !line.trim()
}

function startsBlock(line: string) {
   return HEADING.test(line) || QUOTE.test(line) || listItem(line) !== null
}

function interruptsParagraph(line: string) {
   if (HEADING.test(line) || QUOTE.test(line)) return true
   const item = listItem(line)
   return !!item && !!item.content.trim() && (!item.ordered || item.start === 1)
}

function listItem(line: string) {
   const match = LIST_ITEM.exec(line)
   if (!match) return null
   const marker = match[2]!
   if (marker === '*' && /^\*\s*\*\s*\*[\s*]*$/.test(line.trim())) return null
   if (marker === '-' && /^-\s*-\s*-[\s-]*$/.test(line.trim())) return null
   const ordered = /\d/.test(marker)
   const spaces = match[3]!.length
   const width = marker.length + (spaces === 0 || spaces > 4 ? 1 : spaces)
   return {
      indent: match[1]!.length,
      ordered,
      start: ordered ? Number.parseInt(marker, 10) : 1,
      content: match[4]!,
      contentIndent: match[1]!.length + width,
   }
}

function dedent(line: string, amount: number) {
   const strip = Math.min(indentOf(line), amount)
   return line.slice(strip)
}

function parseList(lines: string[], from: number): { html: string; next: number } {
   const first = listItem(lines[from]!)!
   const items: string[][] = []
   let at = from
   while (at < lines.length) {
      const item = listItem(lines[at]!)
      if (!item || item.ordered !== first.ordered || item.indent > first.contentIndent - 1) break
      const body = [item.content]
      at++
      while (at < lines.length) {
         const line = lines[at]!
         if (isBlank(line)) {
            let ahead = at + 1
            while (ahead < lines.length && isBlank(lines[ahead])) ahead++
            const next = lines[ahead]
            if (next !== undefined && indentOf(next) > item.indent && !isBlank(next)) {
               body.push('')
               at++
               continue
            }
            break
         }
         if (indentOf(line) > item.indent) {
            body.push(dedent(line, item.contentIndent))
            at++
            continue
         }
         if (listItem(line) || startsBlock(line)) break
         if (isBlank(body.at(-1))) break
         body.push(line.replace(/^ +/, ''))
         at++
      }
      items.push(body)
      let ahead = at
      while (ahead < lines.length && isBlank(lines[ahead])) ahead++
      const following = ahead < lines.length ? listItem(lines[ahead]!) : null
      if (
         ahead !== at &&
         following &&
         following.ordered === first.ordered &&
         following.indent <= first.indent + 1
      )
         at = ahead
   }
   const tag = first.ordered ? 'ol' : 'ul'
   const start = first.ordered && first.start !== 1 ? ` start="${first.start}"` : ''
   const html = items.map((body) => `<li>${blocksHtml(body) || '<p></p>'}</li>`).join('')
   return { html: `<${tag}${start}>${html}</${tag}>`, next: at }
}

function blocksHtml(lines: string[]): string {
   let html = ''
   let at = 0
   while (at < lines.length) {
      const line = lines[at]!
      if (isBlank(line)) {
         at++
         continue
      }
      const heading = HEADING.exec(line)
      if (heading) {
         const level = heading[1]!.length <= 2 ? 2 : 3
         const text = inlineHtml([heading[2] ?? ''])
         if (text) html += `<h${level}>${text}</h${level}>`
         at++
         continue
      }
      if (QUOTE.test(line)) {
         const quoted: string[] = []
         while (at < lines.length && !isBlank(lines[at])) {
            const match = QUOTE.exec(lines[at]!)
            quoted.push(match ? match[1]! : lines[at]!.trim())
            at++
            if (at < lines.length && isBlank(lines[at]) && QUOTE.test(lines[at + 1] ?? '')) {
               quoted.push('')
               at++
            }
         }
         const inner = blocksHtml(quoted)
         if (inner) html += `<blockquote>${inner}</blockquote>`
         continue
      }
      if (listItem(line)) {
         const list = parseList(lines, at)
         html += list.html
         at = list.next
         continue
      }
      const paragraph: string[] = []
      while (at < lines.length && !isBlank(lines[at])) {
         if (paragraph.length && interruptsParagraph(lines[at]!)) break
         paragraph.push(lines[at]!.replace(/^ +/, ''))
         at++
      }
      const text = inlineHtml(paragraph)
      if (text) html += `<p>${text}</p>`
   }
   return html
}

export function markdownToHtml(markdown: string | null | undefined): string | null {
   if (typeof markdown !== 'string') return null
   const lines = markdown.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n')
   const indent = Math.min(...lines.filter((line) => line.trim()).map(indentOf))
   const html = blocksHtml(
      Number.isFinite(indent) ? lines.map((line) => line.slice(indent)) : lines
   )
   return html || null
}
