import type { FilterImpl } from '../../template/filter-impl-options'
import { isNil, stringify, toValue } from '../../util'
import { ImageDrop, imageSource } from '../objects/image'
import { shopifyState } from '../state'
import { plainValue, splitArgs } from '../util/args'
import { escapeHtml } from '../util/html'
import { hasOwn } from '../util/own'
import { escapeJson } from './json'
import { formatMoney } from './money'
import type { ShopifyFilterSet } from './types'

type Fields = Record<string, unknown>

const isRecord = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value)

/** What a metafield, or a field of a metaobject, holds: its `value` when it is an object with one (the form of https://shopify.dev/docs/api/liquid/objects/metafield), else itself, as the store data's plain metafield values are. */
export function fieldValue (field: unknown): unknown {
  const value = toValue(field)
  return isRecord(value) && hasOwn(value, 'value') ? toValue(value.value) : value
}

/** A decimal as the measurement types print it: "If it's a decimal with more than two places, then it'll be formatted to have a precision of two with trailing zeros removed" (https://shopify.dev/docs/api/liquid/filters/metafield_tag, `dimension`, `volume`, `weight`). */
const measurementNumber = (value: unknown): string => {
  const n = Number(plainValue(value))
  return Number.isFinite(n) ? String(Number(n.toFixed(2))) : stringify(value)
}

/** Text with `'` as `&#39;` and the other HTML characters escaped, as the page's `rich_text_field` output writes `we&#39;ve`. */
const text = (value: unknown) => escapeHtml(value)

/** One node of a rich text document (`{"type":"root","children":[…]}`, https://shopify.dev/docs/apps/build/custom-data/metafields/list-of-data-types `rich_text_field`) as HTML: `paragraph` is `<p>`, `heading` `<h1>` to `<h6>` by its `level`, `list` `<ul>` or `<ol>` by its `listType`, `list-item` `<li>`, `link` `<a href>` with its `title` and `target`, and `text` its escaped `value`, inside `<strong>` when `bold` and `<em>` when `italic`. */
function richNode (node: unknown): string {
  if (!isRecord(node)) return ''
  const children = Array.isArray(node.children) ? node.children.map(richNode).join('') : ''
  switch (node.type) {
    case 'root': return children
    case 'paragraph': return `<p>${children}</p>`
    case 'heading': {
      const level = Math.min(Math.max(Math.trunc(Number(node.level)) || 1, 1), 6)
      return `<h${level}>${children}</h${level}>`
    }
    case 'list': return node.listType === 'ordered' ? `<ol>${children}</ol>` : `<ul>${children}</ul>`
    case 'list-item': return `<li>${children}</li>`
    case 'link': return `<a href="${escapeHtml(node.url)}"${node.title ? ` title="${escapeHtml(node.title)}"` : ''}${node.target ? ` target="${escapeHtml(node.target)}"` : ''}>${children}</a>`
    case 'text': {
      let html = text(node.value)
      if (node.italic) html = `<em>${html}</em>`
      if (node.bold) html = `<strong>${html}</strong>`
      return html
    }
    default: return children
  }
}

/** A rich text value: the document, or its JSON text. */
function richText (value: unknown): string {
  if (typeof value === 'string') {
    try {
      return richNode(JSON.parse(value))
    } catch (err) {
      return text(value)
    }
  }
  return richNode(value)
}

/** The time a `date` or `date_time` value names, or undefined. */
function instant (value: unknown): Date | undefined {
  const date = value instanceof Date ? value : new Date(stringify(value))
  return isNaN(date.getTime()) ? undefined : date
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** `date` and `date_time` as the page's outputs print them, in English and in UTC: `January 1, 2040` and `Jun 22, 2022, 1:00 pm`. The page says the value "is localized to the customer"; the words of other languages and the zone are not pinned. */
function localDate (date: Date, withTime: boolean): string {
  const month = MONTHS[date.getUTCMonth()]
  if (!withTime) return `${month} ${date.getUTCDate()}, ${date.getUTCFullYear()}`
  const hours = date.getUTCHours()
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  return `${month.slice(0, 3)} ${date.getUTCDate()}, ${date.getUTCFullYear()}, ${hours % 12 || 12}:${minutes} ${hours < 12 ? 'am' : 'pm'}`
}

/** A list in `<ul>` (or `<ol>` with `list_format: 'ordered'`) of `<li class="metafield-single_line_text_field">` items. */
function listOf (items: unknown[], ordered: boolean): string {
  const tag = ordered ? 'ol' : 'ul'
  return `<${tag} class="metafield-single_line_text_field-array">${items.map(item => `<li class="metafield-single_line_text_field">${text(item)}</li>`).join('')}</${tag}>`
}

/** A measurement (`dimension`, `volume`, `weight`): the value, a space and the unit, each in a span of its own. */
const measurement = (type: string, value: unknown): string => {
  const record = isRecord(value) ? value : {}
  return `<span class="metafield-${type}"><span class="metafield-${type}_value">${measurementNumber(record.value)} </span><span class="metafield-${type}_unit">${text(record.unit)}</span></span>`
}

/** A link to a resource a reference names: its `url` and, for its text, its `title`. */
const reference = (type: string, value: unknown): string => {
  const record = isRecord(value) ? value : {}
  return `<a href="${escapeHtml(record.url)}" class="metafield-${type}">${text(record.title)}</a>`
}

/** The amount of a `money` value in cents: a number of cents, or a money object whose `amount` is the decimal (`"0.10"`). */
function moneyCents (value: unknown): number | undefined {
  const record = isRecord(value) ? value : undefined
  const amount = record ? Number(plainValue(record.amount)) * 100 : Number(plainValue(value))
  return Number.isFinite(amount) ? Math.round(amount) : undefined
}

/**
 * The HTML element that holds a metafield, https://shopify.dev/docs/api/liquid/filters/metafield_tag, for a metafield given as an object with its `type` and `value` (the shape of https://shopify.dev/docs/api/liquid/objects/metafield; the store data's metafields are plain values, which carry no type, and print nothing here). Each type prints the element and class of the page's examples:
 *
 * - `boolean`, `color`, `number_decimal`, `number_integer`, `rating` (its `value`), `single_line_text_field` and `multi_line_text_field` (line breaks as `<br />` and a line break) in a `<span class="metafield-<type>">`; `money` in the shop's "HTML with currency" format;
 * - `date` and `date_time` in a `<time datetime="<value>" class="metafield-<type>">`, the page's `January 1, 2040` and `Jun 22, 2022, 1:00 pm`;
 * - `json` in a `<script type="application/json" class="metafield-json">`, escaped as the `json` filter escapes;
 * - `url` and the references (`collection_reference`, `page_reference`, `product_reference`, `variant_reference`, given as the object with its `url` and `title`) in an `<a href class="metafield-<type>">`, a `url` showing its address without the scheme;
 * - `rich_text_field` in a `<div class="metafield-rich_text_field">` (`richNode`);
 * - `dimension`, `volume` and `weight` as their value and unit in nested spans;
 * - `list.single_line_text_field`, and `list.metaobject_reference` with `field:`, as a `<ul class="metafield-single_line_text_field-array">` (`list_format: 'ordered'` for an `<ol>`), and `metaobject_reference` with `field:` as the field's `<span>`;
 * - a `file_reference` to an image as `<img src loading="lazy" class="metafield-file_reference">`.
 *
 * Text is escaped as `escape` escapes it (`we&#39;ve` in the page's rich text). Not pinned: the localised words and zone of the dates, a `file_reference` image's `alt`, the order of a rich text link's `title` and `target`, and what the filter prints for a plain value, a video or other file, or a type the page does not list (nothing here, and reported).
 */
function metafieldTag (this: FilterImpl, input: unknown, ...args: unknown[]) {
  const state = shopifyState(this.context)
  const metafield = toValue(input)
  if (!isRecord(metafield) || typeof metafield.type !== 'string') {
    if (!isNil(metafield) && metafield !== '') state.report.unsupported('metafield_tag', 'the value is not a metafield with a type')
    return ''
  }
  const type = metafield.type
  const value = toValue(metafield.value)
  const { named } = splitArgs(args)
  const ordered = named.list_format === 'ordered'
  const span = (inner: string) => `<span class="metafield-${type}">${inner}</span>`
  switch (type) {
    case 'boolean': return span(String(plainValue(value) === true || value === 'true'))
    case 'color':
    case 'number_decimal':
    case 'number_integer':
    case 'single_line_text_field': return span(text(plainValue(value)))
    case 'rating': return span(text(plainValue(isRecord(value) ? value.value : value)))
    case 'multi_line_text_field': return span(text(value).replace(/\r?\n/g, '<br />\n'))
    case 'money': {
      const cents = moneyCents(value)
      return cents === undefined ? '' : span(formatMoney(cents, state.money.withCurrencyFormat))
    }
    case 'date':
    case 'date_time': {
      const date = instant(value)
      return date ? `<time datetime="${escapeHtml(value)}" class="metafield-${type}">${localDate(date, type === 'date_time')}</time>` : ''
    }
    case 'json': return `<script type="application/json" class="metafield-json">${escapeJson(JSON.stringify(value) ?? 'null')}</script>`
    case 'url': return `<a href="${escapeHtml(value)}" class="metafield-url">${text(stringify(value).replace(/^[a-z][a-z0-9+.-]*:\/\//i, ''))}</a>`
    case 'collection_reference':
    case 'page_reference':
    case 'product_reference':
    case 'variant_reference': return reference(type, value)
    case 'rich_text_field': return `<div class="metafield-rich_text_field">${richText(value)}</div>`
    case 'dimension':
    case 'volume':
    case 'weight': return measurement(type, value)
    case 'list.single_line_text_field': return listOf(Array.isArray(value) ? value.map(item => plainValue(toValue(item))) : [], ordered)
    case 'list.metaobject_reference': return listOf(Array.isArray(value) ? value.map(item => isRecord(toValue(item)) ? fieldValue((toValue(item) as Fields)[stringify(named.field)]) : '') : [], ordered)
    case 'metaobject_reference': return `<span class="metafield-single_line_text_field">${text(isRecord(value) ? fieldValue(value[stringify(named.field)]) : '')}</span>`
    case 'file_reference': {
      const source = value instanceof ImageDrop || (isRecord(value) && typeof value.src === 'string') ? imageSource(value) : undefined
      if (source) return `<img src="${escapeHtml(state.services.imageUrl(source.image, {}))}" loading="lazy" class="metafield-file_reference">`
      break
    }
  }
  state.report.unsupported('metafield_tag', `the type ${type.slice(0, 40)} is not printed`)
  return ''
}

/** The two-letter country code of the buyer: the page's `localization.country`. */
function buyerCountry (filter: FilterImpl): string | undefined {
  try {
    const code = toValue(filter.context.getSync(['localization', 'country', 'iso_code']))
    return typeof code === 'string' && code ? code.toUpperCase() : undefined
  } catch (err) {
    return undefined
  }
}

/** A disclosure's jurisdiction codes, upper-cased: a list, a JSON list (the form the Admin API stores, `["US-CA"]`) or one code. */
function jurisdictionsOf (value: unknown): string[] {
  let codes = toValue(value)
  if (typeof codes === 'string' && codes.trim().startsWith('[')) {
    try {
      codes = JSON.parse(codes)
    } catch (err) {
      codes = []
    }
  }
  const list = Array.isArray(codes) ? codes : typeof codes === 'string' ? [codes] : []
  return list.map(code => stringify(toValue(code)).trim().toUpperCase()).filter(Boolean)
}

/**
 * The disclosures of a list that apply to the buyer, https://shopify.dev/docs/api/liquid/filters/applicable_disclosures: "Disclosures scoped to a country or a country subdivision are returned only for buyers in that jurisdiction. A disclosure is returned whenever the buyer's jurisdiction cannot be determined." A disclosure's scope is its `jurisdictions` field, a list of codes such as `US-CA` (https://shopify.dev/docs/apps/build/product-merchandising/product-disclosures), read as a metaobject field (`fieldValue`).
 *
 * The buyer's country is the page's `localization.country`; a storefront does not know the buyer's subdivision, so a disclosure scoped to a subdivision of the buyer's country is returned, and one scoped elsewhere is not. A disclosure without jurisdictions, or a page without a country, returns every disclosure. Nil, or anything that is not a list, gives the empty list. Which of Shopify's buyer signals decide the subdivision is not pinned. The store data has no disclosures (`product.metafields.shopify.disclosure` is nil), so the themes get the empty list.
 */
function applicableDisclosures (this: FilterImpl, input: unknown) {
  const list = toValue(input)
  if (!Array.isArray(list)) return []
  const country = buyerCountry(this)
  if (!country) return [...list]
  return list.filter(disclosure => {
    const entry = toValue(disclosure)
    const scope = jurisdictionsOf(isRecord(entry) ? fieldValue(entry.jurisdictions) : undefined)
    return !scope.length || scope.some(code => code.split('-')[0] === country)
  })
}

export const metafieldFilters: ShopifyFilterSet = {
  metafield_tag: { status: 'approx', handler: metafieldTag },
  applicable_disclosures: { status: 'approx', handler: applicableDisclosures }
}
