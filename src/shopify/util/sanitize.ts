/**
 * An allowlist HTML sanitiser for setting values written by people or models the caller does not trust (`html`, `richtext` and `inline_richtext` settings). It keeps formatting markup and links, and drops scripts, styles, frames, forms, event handlers, inline styles and every URL scheme but `http`, `https`, `mailto` and `tel`. It is not a general-purpose sanitiser: it only has to make theme setting values safe to print. Shopify itself removes only `<html>`, `<head>` and `<body>` from an `html` setting and limits `richtext` to a short list of tags (https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings); this sanitiser is stricter on purpose, as Debutify's safety choice for content it does not control.
 */
const ALLOWED_TAGS = new Set(['a', 'abbr', 'b', 'blockquote', 'br', 'code', 'del', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li', 'mark', 'ol', 'p', 'pre', 's', 'small', 'span', 'strong', 'sub', 'sup', 'u', 'ul'])
const VOID_TAGS = new Set(['br', 'hr', 'img'])
/** Elements removed together with everything inside them. */
const DROPPED_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'textarea', 'select', 'svg', 'math', 'title', 'head'])
const ALLOWED_ATTRIBUTES = new Set(['href', 'src', 'alt', 'title', 'class', 'target', 'rel', 'width', 'height'])
const URL_ATTRIBUTES = new Set(['href', 'src'])
const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel'])

const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

/** Every match of a global regular expression, without `String#matchAll` (ES2020): the tsconfig `lib` targets ES2017, and `matchAll` type-checks only through `@types/node`. */
function * matches (pattern: RegExp, text: string): Generator<RegExpExecArray> {
  pattern.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    if (match[0] === '') pattern.lastIndex++
    yield match
  }
}

/** The character a numeric reference names; one outside Unicode reads as U+FFFD, as in a browser, instead of throwing a RangeError on hostile input. */
function fromCodePoint (code: number): string {
  return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '\ufffd'
}

function decodeEntities (value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec) => fromCodePoint(Number(dec)))
    .replace(/&colon;/gi, ':').replace(/&tab;/gi, '\t').replace(/&newline;/gi, '\n')
}

/** Whether a URL is relative or uses an allowed scheme, judged as a browser would read it (entities decoded, control characters and spaces removed). */
export function isSafeUrl (value: string): boolean {
  // eslint-disable-next-line no-control-regex
  const url = decodeEntities(value).replace(/[\u0000- \u007f-\u009f]/g, '')
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(url)
  return !scheme || SAFE_SCHEMES.has(scheme[1].toLowerCase())
}

function escapeAttribute (value: string): string {
  return value.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function cleanAttributes (source: string): string {
  let out = ''
  for (const match of matches(ATTRIBUTE, source)) {
    const name = match[1].toLowerCase()
    if (!ALLOWED_ATTRIBUTES.has(name)) continue
    const value = match[2] ?? match[3] ?? match[4] ?? ''
    if (URL_ATTRIBUTES.has(name) && !isSafeUrl(value)) continue
    out += ` ${name}="${escapeAttribute(value)}"`
  }
  return out
}

interface Tag {
  name: string
  closing: boolean
  selfClosing: boolean
  attributes: string
}

/** The end of a construct that runs to `terminator`, or the end of the input when it never closes (a browser drops such a construct together with the rest of the input). */
function endOf (html: string, from: number, terminator: string): number {
  const end = html.indexOf(terminator, from)
  return end === -1 ? html.length : end + terminator.length
}

/**
 * Splits markup into text (a string) and tags, in one pass: every scan moves forward and an unterminated comment, declaration or tag consumes the rest of the input, so hostile input cannot make it quadratic. A `<` that starts no tag is text and comes out as `&lt;`. Comments, declarations, CDATA sections and processing instructions are dropped.
 */
function * tokens (html: string): Generator<string | Tag> {
  const length = html.length
  let i = 0
  while (i < length) {
    const lt = html.indexOf('<', i)
    if (lt === -1) {
      yield html.slice(i)
      return
    }
    if (lt > i) yield html.slice(i, lt)
    i = lt
    if (html.startsWith('<!--', i)) {
      i = endOf(html, i + 4, '-->')
    } else if (html.startsWith('<![CDATA[', i)) {
      i = endOf(html, i + 9, ']]>')
    } else if (html.startsWith('<!', i) || html.startsWith('<?', i)) {
      i = endOf(html, i + 2, '>')
    } else {
      const closing = html[i + 1] === '/'
      const nameStart = i + (closing ? 2 : 1)
      const name = /^[a-zA-Z][a-zA-Z0-9-]*/.exec(html.slice(nameStart, nameStart + 64))
      if (!name) {
        yield '&lt;'
        i++
        continue
      }
      const attributesStart = nameStart + name[0].length
      let end = attributesStart
      while (end < length && html[end] !== '>') {
        const ch = html[end]
        if (ch === '"' || ch === "'") {
          const close = html.indexOf(ch, end + 1)
          end = close === -1 ? length : close + 1
        } else {
          end++
        }
      }
      if (end >= length) return
      yield { name: name[0].toLowerCase(), closing, selfClosing: html[end - 1] === '/', attributes: html.slice(attributesStart, end) }
      i = end + 1
    }
  }
}

export function sanitizeHtml (html: string): string {
  let out = ''
  let skipping: string | undefined
  for (const token of tokens(String(html))) {
    if (typeof token === 'string') {
      if (!skipping) out += token
    } else if (skipping) {
      if (token.closing && token.name === skipping) skipping = undefined
    } else if (DROPPED_WITH_CONTENT.has(token.name)) {
      if (!token.closing && !token.selfClosing) skipping = token.name
    } else if (ALLOWED_TAGS.has(token.name)) {
      if (!token.closing) out += `<${token.name}${cleanAttributes(token.attributes)}>`
      else if (!VOID_TAGS.has(token.name)) out += `</${token.name}>`
    }
  }
  return out
}
