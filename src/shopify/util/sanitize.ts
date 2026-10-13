/**
 * An allowlist HTML sanitiser for setting values written by people or models the caller does not trust (`html`, `richtext` and `inline_richtext` settings, and text-like values that contain markup). It keeps formatting markup and links, and drops scripts, styles, frames, forms, event handlers, inline styles and every URL scheme but `http`, `https`, `mailto` and `tel`. It is not a general-purpose sanitiser: it only has to make theme setting values safe to print.
 *
 * The output is self-contained: an element left open at the end of the value is closed, and a closing tag that closes nothing opened inside the value is dropped, so the value cannot reopen a link over, or close a wrapper of, the markup around it.
 *
 * Choices that are Debutify's, not Shopify's (Shopify itself removes only `<html>`, `<head>` and `<body>` from an `html` setting and limits `richtext` to a short list of tags, https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings): `target` is limited to `_blank` and `_self` and a `_blank` link always gets `rel="noopener noreferrer"`; `rel` keeps only `noopener`, `noreferrer` and `nofollow`; `class` is kept as written, so rich text can carry the theme's own classes (and a hostile value can use utility classes to restyle the page, an accepted risk for a value that has no `style` attribute and no script); `img` keeps any `http` or `https` source, so the caller's `img-src` content security policy is what limits which hosts an image is fetched from.
 */
const ALLOWED_TAGS = new Set(['a', 'abbr', 'b', 'blockquote', 'br', 'code', 'del', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li', 'mark', 'ol', 'p', 'pre', 's', 'small', 'span', 'strong', 'sub', 'sup', 'u', 'ul'])
const VOID_TAGS = new Set(['br', 'hr', 'img'])
/** Elements removed together with everything inside them. */
const DROPPED_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'textarea', 'select', 'svg', 'math', 'title', 'head'])
/** Attributes any allowed element keeps. */
const GLOBAL_ATTRIBUTES = new Set(['title', 'class'])
/** Attributes only these elements keep. */
const TAG_ATTRIBUTES = new Map([['a', new Set(['href', 'target', 'rel'])], ['img', new Set(['src', 'alt', 'width', 'height'])]])
const TARGETS = new Set(['_blank', '_self'])
const REL_TOKENS = new Set(['noopener', 'noreferrer', 'nofollow'])
/** Elements nested deeper than this are dropped, so a long run of openers cannot build a tree a browser would cut off differently. */
const MAX_DEPTH = 100
const URL_ATTRIBUTES = new Set(['href', 'src'])
const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel'])

const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

/** Every match of a global regular expression, without `String#matchAll` (ES2020): the tsconfig `lib` targets ES2017; `matchAll` type-checks only through `@types/node`. */
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

function cleanAttributes (tag: string, source: string): string {
  const allowed = TAG_ATTRIBUTES.get(tag)
  const seen = new Set<string>()
  const kept = new Map<string, string>()
  for (const match of matches(ATTRIBUTE, source)) {
    const name = match[1].toLowerCase()
    // A browser uses the first of two attributes with one name, so only the first is looked at.
    if (seen.has(name)) continue
    seen.add(name)
    if (!GLOBAL_ATTRIBUTES.has(name) && !allowed?.has(name)) continue
    const value = match[2] ?? match[3] ?? match[4] ?? ''
    if (URL_ATTRIBUTES.has(name) && !isSafeUrl(value)) continue
    if (name === 'target') {
      if (!TARGETS.has(value.toLowerCase())) continue
      kept.set(name, value.toLowerCase())
    } else if (name === 'rel') {
      kept.set(name, [...new Set(value.toLowerCase().split(/\s+/).filter(token => REL_TOKENS.has(token)))].join(' '))
    } else {
      kept.set(name, value)
    }
  }
  if (kept.get('target') === '_blank') {
    kept.set('rel', [...new Set([...(kept.get('rel') ?? '').split(' ').filter(Boolean), 'noopener', 'noreferrer'])].join(' '))
  }
  let out = ''
  for (const [name, value] of kept) {
    if (name === 'rel' && !value) continue
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

/** Elements whose start tag a browser answers by closing an open `p` (the HTML parsing algorithm's "in body" insertion mode), so the sanitiser closes it first and its own stack of open elements stays the browser's. */
const CLOSES_P = new Set(['p', 'div', 'blockquote', 'pre', 'ul', 'ol', 'li', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
/** The elements a `li` start tag looks through on its way to an open `li` it closes: the phrasing elements here, which are not "special" in the HTML parsing algorithm, and `div` and `p`, which that step skips explicitly. Any other open element (`ul`, `ol`, `blockquote`, `pre`, a heading) stops the search. */
const LOOKED_THROUGH_FOR_LI = new Set(['a', 'abbr', 'b', 'code', 'del', 'em', 'i', 'mark', 's', 'small', 'span', 'strong', 'sub', 'sup', 'u', 'div', 'p'])

/**
 * Sanitises `html` to markup that is safe to print inside another element and leaves that element's own markup alone. The output is balanced, and it is balanced the way a browser reads it: where the HTML parser would close an element by itself (`<p>` before a block, `<li>` before a `<li>`, a heading inside a heading, a link inside a link), the sanitiser writes that closing tag itself, so a closing tag it writes always closes the element it opened and never one of the page around the value.
 */
export function sanitizeHtml (html: string): string {
  let out = ''
  let skipping: string | undefined
  // The open elements, innermost last. Nesting is capped at MAX_DEPTH, so searching it is bounded.
  const open: string[] = []
  const closeTo = (index: number) => {
    while (open.length > index) out += `</${open.pop()}>`
  }
  for (const token of tokens(String(html))) {
    if (typeof token === 'string') {
      if (!skipping) out += token
    } else if (skipping) {
      if (token.closing && token.name === skipping) skipping = undefined
    } else if (DROPPED_WITH_CONTENT.has(token.name)) {
      if (!token.closing && !token.selfClosing) skipping = token.name
    } else if (ALLOWED_TAGS.has(token.name)) {
      const name = token.name
      const isVoid = VOID_TAGS.has(name)
      if (token.closing) {
        // A closing tag closes the innermost open element of its name and what is open inside it, and nothing when none is open.
        if (!isVoid) {
          const index = open.lastIndexOf(name)
          if (index !== -1) closeTo(index)
        }
        continue
      }
      if (!isVoid && open.length >= MAX_DEPTH) continue
      if (name === 'li') {
        for (let i = open.length - 1; i >= 0; i--) {
          if (open[i] === 'li') {
            closeTo(i)
            break
          }
          if (!LOOKED_THROUGH_FOR_LI.has(open[i])) break
        }
      }
      if (CLOSES_P.has(name)) {
        const index = open.lastIndexOf('p')
        if (index !== -1) closeTo(index)
      }
      if (HEADINGS.has(name) && HEADINGS.has(open[open.length - 1])) closeTo(open.length - 1)
      if (name === 'a') {
        const index = open.lastIndexOf('a')
        if (index !== -1) closeTo(index)
      }
      out += `<${name}${cleanAttributes(name, token.attributes)}>`
      if (!isVoid) open.push(name)
    }
  }
  closeTo(0)
  return out
}
