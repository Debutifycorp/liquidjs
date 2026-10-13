import { stringify } from '../../util/underscore'
import type { ReportCollector, UnsupportedFeature } from '../report'

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

/** Ruby's `CGI.escapeHTML`, which Shopify's tag filters use for attribute values and its `escape` filter for text, https://shopify.dev/docs/api/liquid/filters/escape (it escapes special characters "such as `<>`, `'`, and `&`"; the page does not list `"` nor name the entity written for `'`, so `&quot;` and `&#39;` follow Ruby and are not pinned by shopify.dev). */
export function escapeHtml (value: unknown): string {
  return stringify(value).replace(/[&<>"']/g, ch => ESCAPES[ch])
}

/** The entity for one of `& < > " '`, as `escapeHtml` writes it. */
export function escapeChar (ch: string): string {
  return ESCAPES[ch]
}

/** What may be written as an attribute name: letters, digits, `-`, `_`, `:` and `.`, not starting with a digit, `-` or `.`. This is a safety rule of this package (an attribute name comes from a template's argument name, or from data when a template passes an array), not a shopify.dev one; shopify.dev has no page on attribute names. */
const ATTRIBUTE_NAME = /^[A-Za-z_:][A-Za-z0-9_:.-]*$/

export function isAttributeName (name: string): boolean {
  return ATTRIBUTE_NAME.test(name)
}

/** One HTML attribute with a leading space. `true` writes the boolean form Shopify uses (`defer="defer"`); `false`, `null` and `undefined` write nothing, and neither does a name that is not a valid attribute name. The boolean form and the omission of `false` are https://shopify.dev/docs/api/liquid/filters/script_tag (its example prints `defer="defer"`). */
export function attribute (name: string, value: unknown): string {
  if (value === false || value === null || value === undefined || !isAttributeName(name)) return ''
  if (value === true) return ` ${name}="${name}"`
  return ` ${name}="${escapeHtml(value)}"`
}

/** The attributes a template named in a filter call (`names`, in the order written, minus the `skip` ones the filter handles itself), written in order. A name that is not a valid attribute name is dropped and reported as unsupported, so data cannot inject markup through it. */
export function namedAttributes (report: ReportCollector, filter: UnsupportedFeature, named: Record<string, unknown>, names: string[], skip: string[] = []): string {
  let html = ''
  for (const name of names) {
    if (skip.includes(name)) continue
    if (isAttributeName(name)) html += attribute(name, named[name])
    else report.unsupported(filter, `attribute name ${JSON.stringify(name.slice(0, 40))} is not valid and was dropped`)
  }
  return html
}

/** Inserts attributes right after the element name of the first tag in `markup` (`<svg` becomes `<svg class="x"`), as Shopify's SVG filters do, https://shopify.dev/docs/api/liquid/filters/placeholder_svg_tag (the `class` argument lands on the `<svg>` element; where among its attributes is not pinned). */
export function insertAttributes (markup: string, attributes: string): string {
  if (!attributes) return markup
  return markup.replace(/^(\s*<[a-zA-Z][\w-]*)/, `$1${attributes}`)
}
