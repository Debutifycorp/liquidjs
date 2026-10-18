import { Drop } from '../../drop'
import { LiquidFloat } from '../../util/liquid-float'
import type { ImageData } from '../types'
import type { Metafields } from '../store/types'
import { attribute, escapeHtml } from '../util/html'
import { hasOwn, isRecord } from '../util/own'
import { isSafeUrl } from '../util/sanitize'
import { ColorDrop } from './color'
import { ImageDrop } from './image'
import { jsonRefused, refuseJson } from './json-refused'

/** Finds what a reference metafield points at: a product, collection or page by handle, a variant by id. Nil when the store has none. */
export type MetafieldResolver = (kind: 'product' | 'collection' | 'page' | 'variant', key: string) => Record<string, unknown> | null | undefined

/** The types whose `value` is the stored text: https://shopify.dev/docs/api/liquid/objects/metafield#metafield-value ("A string" for the text fields, "A date string" for `date` and `date_time`, "A url string" for `url`), and `id`, which https://shopify.dev/docs/apps/build/custom-data/metafields/list-of-data-types stores as text. */
const TEXT_TYPES = new Set(['single_line_text_field', 'multi_line_text_field', 'url', 'date', 'date_time', 'id'])

/** The reference types, by the kind of object each points at. */
const REFERENCES: Record<string, 'product' | 'collection' | 'page' | 'variant'> = { product_reference: 'product', collection_reference: 'collection', page_reference: 'page', variant_reference: 'variant' }

/** The `gid://shopify/<type>/<id>` an Admin API reference is stored as, https://shopify.dev/docs/apps/build/custom-data/metafields/list-of-data-types. */
const GID_TYPES: Record<string, string> = { product: 'Product', collection: 'Collection', page: 'Page', variant: 'ProductVariant' }

/** The type of a metafield the data gives as a plain value (`Metafields`). */
function inferredType (value: unknown): string {
  if (typeof value === 'string') return value.includes('\n') ? 'multi_line_text_field' : 'single_line_text_field'
  if (typeof value === 'number') return Number.isInteger(value) ? 'number_integer' : 'number_decimal'
  if (typeof value === 'boolean') return 'boolean'
  if (Array.isArray(value) && value.every(item => typeof item === 'string')) return 'list.single_line_text_field'
  return 'json'
}

/** Whether `value` is a `MetafieldData`: an object of `type` and `value` alone, whose type is a metafield type name. */
function isTyped (value: unknown): value is { type: string, value: unknown } {
  return isRecord(value) && typeof value.type === 'string' && /^(list\.)?[a-z_]+$/.test(value.type) && hasOwn(value, 'value') && Object.keys(value).every(key => key === 'type' || key === 'value')
}

/** A stored JSON text read as its value; text that is not JSON stays as it is. */
function parsed (value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

const decimal = (value: unknown) => new LiquidFloat(Number(value))

/** A number a metafield stores, nil when the text is not one (`Number('abc')` is `NaN`, which Shopify cannot store in a number field). */
function finite (value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  return Number.isFinite(n) ? n : null
}

/** A decimal of a rating, which Shopify writes as text in JSON (`"ratingValue": {{ rating.rating | json }}` prints `"4.5"`, `"bestRating"` prints `"5.0"`, fixture `page-product-unit-price`) and prints and computes as a number everywhere else. */
class RatingNumber extends LiquidFloat {
  public toJSON (): never {
    return this.toString() as never
  }
}

/**
 * The rating object a `rating` metafield gives, https://shopify.dev/docs/api/liquid/objects/rating: `rating`, `scale_min` and `scale_max`, each a number. Printed on its own it is its `rating`, which Dawn and our theme print as `{{ product.metafields.reviews.rating.value }} / {{ product.metafields.reviews.rating.value.scale_max }}`; shopify.dev does not say what the object prints and no recording holds a rating, so the print is not pinned.
 */
export class RatingDrop extends Drop {
  public readonly rating: LiquidFloat
  public readonly scale_min: LiquidFloat
  public readonly scale_max: LiquidFloat

  public constructor (rating: number, scaleMin: number, scaleMax: number) {
    super()
    this.rating = new RatingNumber(rating)
    this.scale_min = new RatingNumber(scaleMin)
    this.scale_max = new RatingNumber(scaleMax)
  }

  public valueOf () {
    return this.rating
  }

  public toString () {
    return this.rating.toString()
  }

  /** Shopify's `json` refuses a rating (scenario `probe-product-extras-unit-price`: `{{ rating.value | json }}` is `{"error":"json not allowed for this object"}`, while `{{ rating.value.rating | json }}` is `"4.5"`). */
  public toJSON () {
    return jsonRefused()
  }
}

/**
 * The measurement object a `weight`, `volume` or `dimension` metafield gives, https://shopify.dev/docs/api/liquid/objects/measurement: `type`, `unit` and `value`. Printed on its own it is its value and unit (`500.0 mL`); shopify.dev does not say what the object prints and no recording holds one, so the print is not pinned.
 */
export class MeasurementDrop extends Drop {
  public readonly type: string
  public readonly value: LiquidFloat
  public readonly unit: string

  public constructor (type: string, value: number, unit: string) {
    super()
    this.type = type
    this.value = new LiquidFloat(value)
    this.unit = unit
  }

  public valueOf () {
    return this.toString()
  }

  public toString () {
    return this.unit ? `${this.value.toString()} ${this.unit}` : this.value.toString()
  }

  public toJSON () {
    return { type: this.type, unit: this.unit, value: this.value.toString() }
  }
}

/** The HTML of one node of a rich text field: `root`, `paragraph`, `heading` (its `level`), `list` (`listType` `ordered` or `unordered`), `list-item`, `link` (`url`, `title`, `target`) and `text` (`value`, `bold`, `italic`), the nodes https://shopify.dev/docs/apps/build/custom-data/metafields/list-of-data-types lists for `rich_text_field`. Text is escaped and a link whose URL is not safe loses its `href`. */
function richTextHtml (node: unknown): string {
  if (!isRecord(node)) return ''
  const inner = Array.isArray(node.children) ? node.children.map(richTextHtml).join('') : ''
  switch (node.type) {
    case 'root': return inner
    case 'paragraph': return `<p>${inner}</p>`
    case 'heading': {
      const level = Math.min(6, Math.max(1, Math.trunc(Number(node.level)) || 1))
      return `<h${level}>${inner}</h${level}>`
    }
    case 'list': return node.listType === 'ordered' ? `<ol>${inner}</ol>` : `<ul>${inner}</ul>`
    case 'list-item': return `<li>${inner}</li>`
    case 'link': {
      const url = typeof node.url === 'string' && isSafeUrl(node.url) ? node.url : null
      return `<a${attribute('href', url)}${attribute('title', typeof node.title === 'string' ? node.title : null)}${attribute('target', typeof node.target === 'string' ? node.target : null)}>${inner}</a>`
    }
    case 'text': {
      let text = escapeHtml(typeof node.value === 'string' ? node.value : '')
      if (node.italic === true) text = `<em>${text}</em>`
      if (node.bold === true) text = `<strong>${text}</strong>`
      return text
    }
    default: return inner
  }
}

/**
 * The value of a `rich_text_field` metafield: its JSON tree (`type` and `children`, readable as before), which prints as the HTML of the tree (`<p>`, `<h1>` to `<h6>`, `<ul>`, `<ol>`, `<li>`, `<a>`, `<strong>`, `<em>`). The metafield page calls the value "A field that supports headings, lists, links, bold, and italics" and does not say what it prints; HTML is the form `metafield_tag` gives the field, so the print is not pinned.
 */
export class RichTextDrop extends Drop {
  public readonly type: unknown
  public readonly children: unknown

  public constructor (private readonly tree: Record<string, unknown>) {
    super()
    this.type = tree.type
    this.children = tree.children
  }

  public valueOf () {
    return this.toString()
  }

  public toString () {
    return richTextHtml(this.tree)
  }

  public toJSON () {
    return this.tree
  }
}

/** The money object a `money` metafield gives, https://shopify.dev/docs/api/liquid/objects/money: its `currency`, and the amount in the minor unit when the money filters read it. */
class MoneyDrop extends Drop {
  public readonly currency: { iso_code: string }
  private readonly cents: number

  public constructor (amount: number, currency: string) {
    super()
    this.cents = Math.round(amount * 100)
    this.currency = { iso_code: currency }
  }

  public valueOf () {
    return this.cents
  }
}

/** One value of `type` (not a list), as https://shopify.dev/docs/api/liquid/objects/metafield#metafield-value says each type returns it. */
function typedValue (type: string, value: unknown, resolve: MetafieldResolver | undefined): unknown {
  if (value === null || value === undefined) return null
  if (TEXT_TYPES.has(type)) return String(value)
  if (type === 'number_integer') {
    const n = finite(value)
    return n === null ? null : Math.trunc(n)
  }
  if (type === 'number_decimal') {
    const n = finite(value)
    return n === null ? null : decimal(n)
  }
  if (type === 'boolean') return value === true || value === 'true'
  if (type === 'color') return ColorDrop.from(String(value)) ?? null
  if (hasOwn(REFERENCES, type)) return resolve?.(REFERENCES[type], String(value)) ?? null
  if (type === 'file_reference') return isRecord(value) && typeof value.src === 'string' ? new ImageDrop(value as unknown as ImageData) : null
  const data = parsed(value)
  if (type === 'weight' || type === 'volume' || type === 'dimension') {
    const amount = isRecord(data) ? finite(data.value) : null
    return isRecord(data) && amount !== null ? new MeasurementDrop(type, amount, String(data.unit ?? '')) : null
  }
  if (type === 'rating') {
    const rating = isRecord(data) ? finite(data.value ?? data.rating) : null
    return isRecord(data) && rating !== null ? new RatingDrop(rating, finite(data.scale_min) ?? 0, finite(data.scale_max) ?? 0) : null
  }
  if (type === 'rich_text_field') return isRecord(data) ? new RichTextDrop(data) : null
  if (type === 'money') return isRecord(data) ? new MoneyDrop(Number(data.amount), String(data.currency_code ?? data.currency ?? '')) : null
  return data
}

const STORED = Symbol('stored')
const RESOLVE = Symbol('resolve')
const TYPED = Symbol('typed')

/** A list metafield's value: the typed items, without the nil ones, with `count` on a list of references, as the page's example reads `value.count`. */
function listValue (item: string, stored: unknown, resolve: MetafieldResolver | undefined): unknown[] {
  const items = parsed(stored)
  if (!Array.isArray(items)) return []
  const list = items.map(entry => typedValue(item, entry, resolve)).filter(entry => entry !== null)
  if (hasOwn(REFERENCES, item)) Object.defineProperty(list, 'count', { value: list.length, enumerable: false })
  return list
}

/**
 * Shopify's `metafield` object, https://shopify.dev/docs/api/liquid/objects/metafield: its `type`, `list?` and `value`, typed as the page's table says (a string for the text types, a number, a boolean, a `color` object, a `measurement` object (`MeasurementDrop`), a `rating` object (`RatingDrop`), a money object, the product, collection, page or variant a reference points at, an image for a file reference, a JSON object for `json`, a rich text tree that prints as HTML for `rich_text_field` (`RichTextDrop`), and an array for a list, whose reference lists also have `count`). Printed on its own it is the metafield as stored: the text, the number or the boolean, a reference's `gid://shopify/…` address, and the JSON text of anything else; shopify.dev does not say what the object prints, and no recording shows one. What the data stored, the resolver and the typed value are kept under symbols, which Liquid cannot name and `json` does not print.
 */
export class MetafieldDrop extends Drop {
  public readonly type: string
  public readonly 'list?': boolean
  private readonly [STORED]: unknown
  private readonly [RESOLVE]: MetafieldResolver | undefined
  private [TYPED]?: { value: unknown }

  public constructor (type: string, stored: unknown, resolve?: MetafieldResolver) {
    super()
    this.type = type
    this['list?'] = type.startsWith('list.')
    this[STORED] = stored
    this[RESOLVE] = resolve
  }

  /** The metafield of the data's `value`: a `MetafieldData` keeps its type, a plain value has the type `inferredType` reads from it. */
  public static from (value: unknown, resolve?: MetafieldResolver): MetafieldDrop {
    return isTyped(value) ? new MetafieldDrop(value.type, value.value, resolve) : new MetafieldDrop(inferredType(value), value, resolve)
  }

  public get value (): unknown {
    this[TYPED] ??= { value: this['list?'] ? listValue(this.type.slice('list.'.length), this[STORED], this[RESOLVE]) : typedValue(this.type, this[STORED], this[RESOLVE]) }
    return this[TYPED].value
  }

  public valueOf (): unknown {
    const stored = this[STORED]
    const item = this['list?'] ? this.type.slice('list.'.length) : this.type
    if (hasOwn(REFERENCES, item)) {
      // a reference as Shopify stores it, `gid://shopify/Product/<id>`, for one that resolves; the stored key otherwise
      const gid = (key: unknown) => {
        const found = this[RESOLVE]?.(REFERENCES[item], String(key))
        return found?.id !== undefined && found?.id !== null ? `gid://shopify/${GID_TYPES[REFERENCES[item]]}/${String(found.id)}` : String(key)
      }
      if (!this['list?']) return gid(stored)
      const refs = parsed(stored)
      return JSON.stringify(Array.isArray(refs) ? refs.map(gid) : [])
    }
    if (typeof stored === 'string' || typeof stored === 'number' || typeof stored === 'boolean') return stored
    return stored === null || stored === undefined ? '' : JSON.stringify(stored)
  }

  public toString (): string {
    return String(this.valueOf())
  }

  public toJSON (): unknown {
    // a metafield prints as its value, so a rating (or a list of them) prints as the rating does: refused (scenario `probe-product-extras-unit-price`)
    if (this.type === 'rating') return jsonRefused()
    if (this.type === 'list.rating') return (this.value as unknown[]).map(() => jsonRefused())
    const stored = this.valueOf()
    return typeof stored === 'string' && !TEXT_TYPES.has(this.type) ? parsed(stored) : stored
  }
}

/** The `metafields` of a resource, https://shopify.dev/docs/api/liquid/objects/metafield (`json` refuses the whole object, `refuseJson`): each namespace an object of its keys, each key a `MetafieldDrop`. A key whose value is nil or empty text (or a typed entry whose `value` is) is left out, as a metafield with no value does not exist: Shopify does not store an empty value. Only the data's own namespaces and keys are read. */
export function buildMetafields (data: Metafields | undefined, resolve?: MetafieldResolver): Record<string, Record<string, MetafieldDrop>> {
  const out: Record<string, Record<string, MetafieldDrop>> = {}
  if (!isRecord(data)) return refuseJson(out)
  for (const namespace of Object.keys(data)) {
    const keys = data[namespace]
    if (!isRecord(keys)) continue
    const built: Record<string, MetafieldDrop> = {}
    for (const key of Object.keys(keys)) {
      const value = keys[key]
      if (value === null || value === undefined || value === '') continue
      if (isTyped(value) && (value.value === null || value.value === undefined || value.value === '')) continue
      built[key] = MetafieldDrop.from(value, resolve)
    }
    out[namespace] = built
  }
  // `{{ product.metafields | json }}` is refused, with metafields or none (scenarios `probe-product-extras-unit-price`, `probe-product-extras-gift-card` and `probe-product-extras-pickup`)
  return refuseJson(out)
}
