/** A blanked stretch of the source: a comment, or a trailing comma. */
interface Blank {
  start: number
  end: number
}

/** `line 3 column 5` for the character at `index`, counting from 1 as the JSON error messages do. */
function lineColumn (source: string, index: number): string {
  let line = 1
  let last = -1
  for (let at = source.indexOf('\n'); at !== -1 && at < index; at = source.indexOf('\n', at + 1)) {
    line++
    last = at
  }
  return `line ${line} column ${index - last}`
}

/**
 * The source with every comment outside a string and every trailing comma replaced by blanks. A comment's line breaks stay and every other character keeps its place, so a position in a JSON error message still points at the original text.
 *
 * A string is walked with its escapes, so `"https://x"`, `"a /* b"` and `"a\" // b"` are text. A comma is trailing when the next character that is not blank or a comment closes an object or an array and the comma follows a value; a comma after `[`, `{`, `:` or another comma is left for the JSON parser to reject.
 */
function blankOut (source: string): string {
  const blanks: Blank[] = []
  const length = source.length
  let last = ''
  let comma = -1
  let i = 0
  while (i < length) {
    const c = source[i]
    if (c === ' ' || c === '\n' || c === '\r' || c === '\t') {
      i++
    } else if (c === '"') {
      i++
      while (i < length && source[i] !== '"') i += source[i] === '\\' ? 2 : 1
      i++
      last = '"'
      comma = -1
    } else if (c === '/' && source[i + 1] === '/') {
      let end = i + 2
      while (end < length && source[end] !== '\n' && source[end] !== '\r') end++
      blanks.push({ start: i, end })
      i = end
    } else if (c === '/' && source[i + 1] === '*') {
      const close = source.indexOf('*/', i + 2)
      if (close === -1) throw new SyntaxError(`Unterminated comment at position ${i} (${lineColumn(source, i)})`)
      blanks.push({ start: i, end: close + 2 })
      i = close + 2
    } else {
      if (c === ',') comma = last === '' || '[{,:'.includes(last) ? -1 : i
      else if (c === '}' || c === ']') {
        if (comma !== -1) blanks.push({ start: comma, end: comma + 1 })
        comma = -1
      } else comma = -1
      last = c
      i++
    }
  }
  if (blanks.length === 0) return source
  blanks.sort((a, b) => a.start - b.start)
  let out = ''
  let from = 0
  for (const { start, end } of blanks) {
    out += source.slice(from, start) + source.slice(start, end).replace(/[^\r\n]/g, ' ')
    from = end
  }
  return out + source.slice(from)
}

/**
 * Parses JSON the way Shopify reads its theme files: `//` and `/* *\/` comments anywhere outside a string, and trailing commas, are accepted. https://shopify.dev/docs/storefronts/themes/architecture#json-with-comments says "Theme files with JSON support comments and trailing commas", and its example `config/settings_schema.json` has both a `//` comment after a value and a trailing comma. Shopify's own themes rely on it: Horizon's locale files have `//` comments between their keys.
 *
 * Valid JSON goes straight to `JSON.parse`. Anything else is scanned for comments and trailing commas, and a source that still does not parse throws `JSON.parse`'s error, whose position is a position in the original text.
 */
export function parseJsonc (source: string): unknown {
  try {
    return JSON.parse(source)
  } catch (err) {
    const blanked = blankOut(source)
    if (blanked === source) throw err
    return JSON.parse(blanked)
  }
}
