import { stringify } from '../../util/underscore'

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

/** Ruby's `CGI.escapeHTML`, which Shopify's tag filters use for attribute values and its `escape` filter for text. */
export function escapeHtml (value: unknown): string {
  return stringify(value).replace(/[&<>"']/g, ch => ESCAPES[ch])
}

/** One HTML attribute with a leading space. `true` writes the boolean form Shopify uses (`defer="defer"`); `false`, `null` and `undefined` write nothing. */
export function attribute (name: string, value: unknown): string {
  if (value === false || value === null || value === undefined) return ''
  if (value === true) return ` ${name}="${name}"`
  return ` ${name}="${escapeHtml(value)}"`
}

/** Inserts attributes right after the element name of the first tag in `markup` (`<svg` becomes `<svg class="x"`), as Shopify's SVG filters do. */
export function insertAttributes (markup: string, attributes: string): string {
  if (!attributes) return markup
  return markup.replace(/^(\s*<[a-zA-Z][\w-]*)/, `$1${attributes}`)
}
