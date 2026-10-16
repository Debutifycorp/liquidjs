import { FilterImpl } from '../template'
import { stringify } from '../util/underscore'
import { stripTags } from '../util/strip-tags'

const escapeMap: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&#34;',
  "'": '&#39;'
}
const unescapeMap: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&#34;': '"',
  '&#39;': "'"
}

export function escape (this: FilterImpl, str: string) {
  str = stringify(str)
  this.context.memoryLimit.use(str.length)
  return str.replace(/&|<|>|"|'/g, m => escapeMap[m])
}

export function xml_escape (this: FilterImpl, str: string) {
  return escape.call(this, str)
}

function unescape (this: FilterImpl, str: string) {
  str = stringify(str)
  this.context.memoryLimit.use(str.length)
  return str.replace(/&(amp|lt|gt|#34|#39);/g, m => unescapeMap[m])
}

export function escape_once (this: FilterImpl, str: string) {
  return escape.call(this, unescape.call(this, str))
}

export function newline_to_br (this: FilterImpl, v: string) {
  const str = stringify(v)
  this.context.memoryLimit.use(str.length)
  return str.replace(/\r?\n/gm, '<br />\n')
}

// Raw-text blocks (HTML5) plus '<...>' as the catch-all kind; a regex
// equivalent is O(n^2) in V8 on unclosed openers.
export function strip_html (this: FilterImpl, v: string) {
  const str = stringify(v)
  this.context.memoryLimit.use(str.length)
  return stripTags(str)
}
