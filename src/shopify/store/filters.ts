import { withQuery } from '../util/query'
import type { LiquidObject } from './build'
import type { ViewCurrency } from './markets'
import type { FilterData } from './types'

/** The labels used when the store data gives none. shopify.dev does not list default filter or value labels, so these are not pinned: the parity store's own are `Brand` and `More filters` for the vendor and tag filters (fixture `probe-collection-all`), which its dataset sets as labels. */
const LABELS: Record<Exclude<FilterData['attribute'], 'option' | 'metafield'>, string> = { availability: 'Availability', price: 'Price', product_type: 'Product type', vendor: 'Vendor', tag: 'Tags' }

interface Entry { value: string, label: string, count: number }

type Variant = LiquidObject
type Active = ReadonlyArray<readonly [string, string]>

const variantsOf = (product: LiquidObject) => product.variants as Variant[]

const PARAMS: Record<Exclude<FilterData['attribute'], 'option' | 'metafield'>, string> = { availability: 'filter.v.availability', price: 'filter.v.price', product_type: 'filter.p.product_type', vendor: 'filter.p.vendor', tag: 'filter.p.tag' }
const OPTION = 'filter.v.option.'
const METAFIELD = 'filter.p.m.'
const PRICE_GTE = `${PARAMS.price}.gte`
const PRICE_LTE = `${PARAMS.price}.lte`

/** The URL parameter of a filter, https://shopify.dev/docs/storefronts/themes/navigation-search/filtering/storefront-filtering (`filter.v.option.<lower-cased name>` for an option, whose name the page gives as `filter.v.option.<option name>` and the parity store lower-cases, fixture `probe-collection-all`). */
export function paramOf (filter: FilterData): string {
  if (filter.attribute === 'option') return `${OPTION}${(filter.option ?? '').toLowerCase()}`
  if (filter.attribute === 'metafield') return `${METAFIELD}${filter.metafield?.namespace}.${filter.metafield?.key}`
  return PARAMS[filter.attribute]
}

/** The parameters whose selected values combine with `AND`: the list filters the store data gives that operator. A price range and an option are left out, as a variant has one value of each option and a range has no values. */
function andParams (filters: FilterData[] | undefined): Set<string> {
  return new Set((filters ?? []).filter(filter => filter.operator === 'AND' && filter.attribute !== 'price' && filter.attribute !== 'option').map(paramOf))
}

/** Whether the filter parameter `name` is `param` or one of its bounds (`filter.v.price` owns `.gte` and `.lte`). */
const belongsTo = (name: string, param: string) => name === param || name.startsWith(`${param}.`)

/**
 * The test a product passes when it matches every active filter, https://shopify.dev/docs/storefronts/themes/navigation-search/filtering/storefront-filtering: filters combine with `AND` and a filter's values with `OR` (`AND` for the parameters in `and`). Variant filters (availability, option, price) are tested together on one variant, so a product shows for a colour and a size only when one variant has both, as the parity store counts them (fixture `probe-collection-filter-unavailable`: Green 1 of the 3 products with a sold-out variant and a Green one). `filter.v.availability` is `1` for a variant in stock and `0` for one out of stock. Price bounds are decimals in the view currency, and only the shop's own currency has a price filter (https://help.shopify.com/en/manual/online-store/storefront-search/search-and-discovery-filters: "The price filter doesn't display for currencies other than your shop's default currency"), so the parity store ignores them in another (fixture `probe-collection-en-eu-price`: `filter.v.price.gte=20` keeps 29 of 29 products). A parameter that is no filter of this module is ignored.
 */
function compile (active: Active, currency: ViewCurrency | undefined, and: Set<string>): Matcher {
  const byName = new Map<string, string[]>()
  for (const [name, value] of active) byName.set(name, [...(byName.get(name) ?? []), value])
  const onProduct: Array<(product: LiquidObject) => boolean> = []
  const onVariant: Array<(variant: Variant, product: LiquidObject) => boolean> = []
  for (const [name, values] of byName) {
    const hits = (has: (value: string) => boolean) => and.has(name) ? values.every(has) : values.some(has)
    if (name === PARAMS.availability) onVariant.push(variant => values.some(value => value === '1' ? !!variant.available : value === '0' ? !variant.available : false))
    else if (name === PRICE_GTE || name === PRICE_LTE) {
      const bound = values[0].trim() === '' ? NaN : Math.round(Number(values[0]) * 100)
      if (Number.isFinite(bound) && currency?.own !== false) onVariant.push(variant => name === PRICE_GTE ? Number(variant.price) >= bound : Number(variant.price) <= bound)
    } else if (name === PARAMS.vendor) onProduct.push(product => hits(value => value === product.vendor))
    else if (name === PARAMS.product_type) onProduct.push(product => hits(value => value === product.type))
    else if (name === PARAMS.tag) onProduct.push(product => hits(value => (product.tags as string[]).includes(value)))
    else if (name.startsWith(OPTION)) {
      const wanted = name.slice(OPTION.length).toLowerCase()
      onVariant.push((variant, product) => {
        const index = (product.options as string[]).findIndex(option => option.toLowerCase() === wanted)
        return index >= 0 && values.includes((variant.options as string[])[index])
      })
    } else if (name.startsWith(METAFIELD)) {
      const [namespace, ...key] = name.slice(METAFIELD.length).split('.')
      onProduct.push(product => hits(value => {
        const found = (product.metafields as Record<string, Record<string, unknown>> | undefined)?.[namespace]?.[key.join('.')]
        return found !== undefined && found !== null && String(found) === value
      }))
    }
  }
  const passes = (variant: Variant, product: LiquidObject) => onVariant.every(test => test(variant, product))
  return {
    test: product => onProduct.every(test => test(product)) && (!onVariant.length || variantsOf(product).some(variant => passes(variant, product))),
    variant: product => {
      const all = variantsOf(product)
      const found = onVariant.length ? all.filter(variant => passes(variant, product)) : []
      return found.length && found.length < all.length ? found[0] : undefined
    }
  }
}

interface Matcher {
  /** Whether the product passes every active filter. */
  test: (product: LiquidObject) => boolean
  /** The first variant that passes every active variant filter, when the filters leave some of the product's variants out; undefined when all of them pass, none does or no variant filter is active. */
  variant: (product: LiquidObject) => Variant | undefined
}

/** The products that pass every filter in `active` (the `filter.*` pairs of a request); `except` leaves out one filter's pairs (`filter.v.price` leaves out both bounds), and `filters` are the store's filters, which say which parameters combine with `AND`. */
export function applyFilters (products: LiquidObject[], active: Active, currency?: ViewCurrency, except?: string, filters?: FilterData[]): LiquidObject[] {
  return products.filter(compile(except === undefined ? active : active.filter(([name]) => !belongsTo(name, except)), currency, andParams(filters)).test)
}

/**
 * The variant a product shows under the active variant filters: its first variant that passes all of them, when they leave some of its variants out; undefined when all of them pass, none does or no variant filter is active. https://shopify.dev/docs/storefronts/themes/navigation-search/filtering/storefront-filtering says that with variant filters active "the product object's `featured_media` and `url` change to reflect the first variant that matches". The parity store links only the products the filters narrow, to the first variant that matches even when it is the product's first (fixtures `probe-collection-filter-combined` and `-filter-option`: high-top-sneakers, with one size sold out, and beanie, with one variant of five Green); a product all of whose variants match keeps its URL (fixture `probe-collection-filter-available`: 26 products, none linked).
 */
export function matchingVariant (product: LiquidObject, active: Active, currency?: ViewCurrency, filters?: FilterData[]): LiquidObject | undefined {
  return compile(active, currency, andParams(filters)).variant(product)
}

const ascending = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true })

/** The common sizing scale, smallest first. The help page says "Custom sort orders are applied for filters named Size, so that common sizing terms are displayed in the correct order" and names only XS before S, so the scale is the usual one; the parity store lists Small, Medium, Large and X-Large before the numeric sizes (fixture `probe-collection-all`). */
const SIZES = [['xxs', 'xx-small'], ['xs', 'x-small', 'extra small'], ['s', 'small'], ['m', 'medium'], ['l', 'large'], ['xl', 'x-large', 'extra large'], ['xxl', 'xx-large', 'extra extra large'], ['xxxl', 'xxx-large']]
const sizeRank = (value: string) => {
  const rank = SIZES.findIndex(names => names.includes(value.toLowerCase()))
  return rank < 0 ? SIZES.length : rank
}

/** Filter values come "in ascending order by default, both alphabetically and numerically" (https://help.shopify.com/en/manual/online-store/storefront-search/search-and-discovery-filters), which the fixtures show for every filter: product types, brands, tags, colours and materials. */
const sorted = (entries: Entry[], compare: (a: string, b: string) => number = ascending) => entries.sort((a, b) => compare(a.value, b.value))

/** The values of a list filter over `products`, each once, in first-seen order. */
function distinct (products: LiquidObject[], valuesOf: (product: LiquidObject) => string[]): Entry[] {
  const seen = new Map<string, Entry>()
  for (const product of products) {
    for (const value of valuesOf(product).filter(Boolean)) if (!seen.has(value)) seen.set(value, { value, label: value, count: 0 })
  }
  return [...seen.values()]
}

function optionValues (products: LiquidObject[], name: string): Entry[] {
  const wanted = name.toLowerCase()
  const entries = distinct(products, product => {
    const index = (product.options as string[]).findIndex(option => option.toLowerCase() === wanted)
    return index < 0 ? [] : variantsOf(product).map(variant => (variant.options as string[])[index])
  })
  return sorted(entries, wanted === 'size' ? (a, b) => sizeRank(a) - sizeRank(b) || ascending(a, b) : ascending)
}

const metafieldValue = (product: LiquidObject, namespace: string, key: string) => (product.metafields as Record<string, Record<string, unknown>> | undefined)?.[namespace]?.[key]

const listEntries: Record<Exclude<FilterData['attribute'], 'price' | 'option' | 'metafield'>, (products: LiquidObject[]) => Entry[]> = {
  availability: () => [{ value: '1', label: 'In stock', count: 0 }, { value: '0', label: 'Out of stock', count: 0 }],
  product_type: products => sorted(distinct(products, product => [product.type as string])),
  vendor: products => sorted(distinct(products, product => [product.vendor as string])),
  tag: products => sorted(distinct(products, product => product.tags as string[]))
}

/**
 * The storefront filters of a list of products shown at `url` (a collection's `filters`), following https://shopify.dev/docs/api/liquid/objects/filter and https://shopify.dev/docs/api/liquid/objects/filter_value, with the parameter names of https://shopify.dev/docs/storefronts/themes/navigation-search/filtering/storefront-filtering. As the collection page says, only filters relevant to the products are returned: a list filter needs at least one value among them, a price filter at least one product. Availability, price, product type, vendor, tag, option and metafield filters are `list` or `price_range`; an option filter is a `list` named after its option, and a metafield filter reads `filter.p.m.<namespace>.<key>` and is labelled by the data, otherwise by its key.
 *
 * `products` are all the products the page can show before its filters (the collection, narrowed by its tags), and `query` is the request's query pairs, filters and the rest (`sort_by`, `q`, `view`), without which every value is inactive. A value counts the products that pass every active filter with the value added and, for an `OR` filter, its own selected values left out, so the counts of a filter's other values show what choosing them would give; an `AND` filter's counts keep its selected values (fixtures `probe-collection-filter-combined` and `probe-collection-filter-types-or`). Values with no product come after the others, each group in the default order (fixtures `probe-collection-filter-tag` and `probe-collection-filter-option`). `url_to_add` and `url_to_remove` are `url` with the query (its pairs ordered by name, `withQuery`) and without `page`, with the value's pair added or taken out, the filter's `url_to_remove` taking out every pair of its parameter (fixture `probe-collection-filter-types-or`: a selected value's `url_to_add` is the current query and the others append theirs). A `url` that has a query of its own keeps it before the pairs. A price filter's `min_value.value` and `max_value.value` are the active bounds in the minor unit of the view currency (fixture `probe-collection-filter-price`: 20 and 40 print 2000 and 4000) and `range_max` is the highest variant price of `products`, whatever the filters (fixture `probe-collection-filter-metafield`: 100000 with only cotton products shown); the shop's price filter is left out in a view currency other than the shop's, where the parity store shows none (fixture `probe-collection-en-eu-price`).
 *
 * Not pinned by shopify.dev, for the "confirm on a development store" list: the default labels, availability's value labels (`In stock` for `1`, `Out of stock` for `0`) and its listing both values even at count 0, availability counting a product under each stock status one of its variants has (a product with an in-stock and a sold-out variant counts under both), a value counting each product once, the lower-cased option name in `filter.v.option.<name>`, `encodeURIComponent` for values in URLs, and `swatch`, `image` and `display` being nil (the store data has no swatches).
 */
export function buildFilters (filters: FilterData[] | undefined, products: LiquidObject[], url: string, query: Array<[string, string]> = [], currency?: ViewCurrency): LiquidObject[] {
  const kept = query.filter(([name]) => name !== 'page')
  const active = kept.filter(([name]) => name.startsWith('filter.'))
  const and = andParams(filters)
  const href = (pairs: Active) => withQuery(url, pairs)
  const without = (drop: (name: string, value: string) => boolean) => kept.filter(([name, value]) => !drop(name, value))
  const value = (param: string, entry: Entry) => {
    const selected = active.some(([name, found]) => name === param && found === entry.value)
    return {
      label: entry.label,
      value: entry.value,
      param_name: param,
      count: entry.count,
      active: selected,
      image: null,
      swatch: null,
      display: null,
      url_to_add: href(selected ? kept : [...kept, [param, entry.value] as const]),
      url_to_remove: href(without((name, found) => name === param && found === entry.value))
    }
  }
  const out: LiquidObject[] = []
  for (const filter of filters ?? []) {
    const param = paramOf(filter)
    if (filter.attribute === 'price') {
      if (!products.length || currency?.own === false) continue
      const prices = products.flatMap(product => variantsOf(product).map(variant => variant.price as number))
      const bound = (name: string) => {
        const raw = active.find(([found]) => found === name)?.[1]
        const amount = raw === undefined || raw.trim() === '' ? NaN : Math.round(Number(raw) * 100)
        const set = Number.isFinite(amount)
        return { label: null, value: set ? amount : null, param_name: name, count: null, active: set, image: null, swatch: null, display: null, url_to_add: href(kept), url_to_remove: href(without(found => found === name)) }
      }
      out.push({ label: filter.label ?? LABELS.price, type: 'price_range', param_name: param, operator: null, presentation: null, values: [], active_values: [], inactive_values: [], true_value: null, false_value: null, min_value: bound(PRICE_GTE), max_value: bound(PRICE_LTE), range_max: prices.reduce((highest, price) => Math.max(highest, price), 0), url_to_remove: href(without(name => belongsTo(name, param))) })
      continue
    }
    const option = filter.attribute === 'option' ? filter.option ?? '' : null
    let entries: Entry[]
    if (option !== null) entries = optionValues(products, option)
    else if (filter.attribute === 'metafield') {
      if (!filter.metafield) continue
      const { namespace, key } = filter.metafield
      entries = sorted(distinct(products, product => {
        const found = metafieldValue(product, namespace, key)
        return found === undefined || found === null ? [] : [String(found)]
      }))
    } else entries = listEntries[filter.attribute as keyof typeof listEntries](products)
    if (!products.length || !entries.length) continue
    const others = and.has(param) ? active : active.filter(([name]) => name !== param)
    for (const entry of entries) entry.count = products.filter(compile([...others, [param, entry.value] as const], currency, and).test).length
    const values = [...entries.filter(entry => entry.count > 0), ...entries.filter(entry => entry.count === 0)].map(entry => value(param, entry))
    out.push({ label: filter.label ?? (option ?? (filter.attribute === 'metafield' ? filter.metafield?.key : LABELS[filter.attribute as keyof typeof LABELS])), type: 'list', param_name: param, operator: and.has(param) ? 'AND' : 'OR', presentation: option !== null ? filter.presentation ?? 'text' : 'text', values, active_values: values.filter(entry => entry.active), inactive_values: values.filter(entry => !entry.active), true_value: null, false_value: null, min_value: null, max_value: null, range_max: null, url_to_remove: href(without(name => belongsTo(name, param))) })
  }
  return out
}
