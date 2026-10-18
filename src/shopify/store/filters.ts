import { swatchOf } from '../objects/product-option'
import type { SwatchDrop } from '../objects/product-option'
import { own } from '../util/own'
import { prepareQuery, withPrepared } from '../util/query'
import type { LiquidObject } from './build'
import type { RequestInput } from './globals'
import type { ViewCurrency } from './markets'
import type { FilterData } from './types'

/** The labels used when the store data gives none. shopify.dev does not list default filter or value labels, so these are not pinned: the parity store's own are `Brand` and `More filters` for the vendor and tag filters (fixture `probe-collection-all`), which its dataset sets as labels. */
const LABELS: Record<Exclude<FilterData['attribute'], 'option' | 'metafield'>, string> = { availability: 'Availability', price: 'Price', product_type: 'Product type', vendor: 'Vendor', tag: 'Tags' }

interface Entry { value: string, label: string, count: number, swatch?: SwatchDrop | null }

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

/** The parameters whose selected values combine with `AND`: the list filters the store data gives that operator. A price range, an option and availability are left out, as a range has no values and a variant has one value of each option and one stock status. */
function andParams (filters: FilterData[] | undefined): Set<string> {
  return new Set((filters ?? []).filter(filter => filter.operator === 'AND' && filter.attribute !== 'price' && filter.attribute !== 'option' && filter.attribute !== 'availability').map(paramOf))
}

/** The metafield `namespace.key` of a product; the names come from a URL or the store data, so only the product's own namespaces and keys are read (`Object.prototype` has none to find). */
const metafieldValue = (product: LiquidObject, namespace: string, key: string) => own(own(product.metafields as Record<string, Record<string, unknown>> | undefined, namespace), key)

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
        const found = metafieldValue(product, namespace, key.join('.'))
        return found !== undefined && found !== null && String(found) === value
      }))
    }
  }
  const product = (candidate: LiquidObject) => onProduct.every(test => test(candidate))
  const variant = (candidate: Variant, owner: LiquidObject) => onVariant.every(test => test(candidate, owner))
  return {
    test: candidate => product(candidate) && (!onVariant.length || variantsOf(candidate).some(found => variant(found, candidate))),
    product,
    variant,
    firstVariant: candidate => {
      const all = variantsOf(candidate)
      const found = onVariant.length ? all.filter(entry => variant(entry, candidate)) : []
      return found.length && found.length < all.length ? found[0] : undefined
    }
  }
}

/** What a set of active filters tests, compiled once for any number of products. */
export interface Matcher {
  /** Whether the product passes every active filter. */
  test: (product: LiquidObject) => boolean
  /** Whether the product passes the active filters that are not variant filters. */
  product: (product: LiquidObject) => boolean
  /** Whether the variant of the product passes every active variant filter (true when none is active). */
  variant: (variant: LiquidObject, product: LiquidObject) => boolean
  /**
   * The variant a product shows under the active variant filters: its first variant that passes all of them, when they leave some of its variants out; undefined when all of them pass, none does or no variant filter is active. https://shopify.dev/docs/storefronts/themes/navigation-search/filtering/storefront-filtering says that with variant filters active "the product object's `featured_media` and `url` change to reflect the first variant that matches". The parity store links only the products the filters narrow, to the first variant that matches even when it is the product's first (fixtures `probe-collection-filter-combined` and `-filter-option`: high-top-sneakers, with one size sold out, and beanie, with one variant of five Green); a product all of whose variants match keeps its URL (fixture `probe-collection-filter-available`: 26 products, none linked). That variant is also the product's `selected_variant` (and `selected_or_first_available_variant`), by the product object's page (https://shopify.dev/docs/api/liquid/objects/product#product-selected_variant) and the recording of Dawn's `page-collection-filtered`, where only the narrowed high-top-sneakers prints `"selectedVariant":{…"title":"6"…}` in its `standard_event_data` and the products the filters leave whole print `null`.
   */
  firstVariant: (product: LiquidObject) => LiquidObject | undefined
}

/** The matcher of the `filter.*` pairs `active` in `currency`; `filters` are the store's filters, which say which parameters combine with `AND`. */
export function filterMatcher (active: Active, currency?: ViewCurrency, filters?: FilterData[]): Matcher {
  return compile(active, currency, andParams(filters))
}

/** The products that pass every filter in `active` (the `filter.*` pairs of a request); `except` leaves out one filter's pairs (`filter.v.price` leaves out both bounds), and `filters` are the store's filters, which say which parameters combine with `AND`. */
export function applyFilters (products: LiquidObject[], active: Active, currency?: ViewCurrency, except?: string, filters?: FilterData[]): LiquidObject[] {
  return products.filter(filterMatcher(except === undefined ? active : active.filter(([name]) => !belongsTo(name, except)), currency, filters).test)
}

const collator = new Intl.Collator('en', { numeric: true })
const ascending = (a: string, b: string) => collator.compare(a, b)

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

const listEntries: Record<Exclude<FilterData['attribute'], 'price' | 'option' | 'metafield'>, (products: LiquidObject[]) => Entry[]> = {
  availability: () => [{ value: '1', label: 'In stock', count: 0 }, { value: '0', label: 'Out of stock', count: 0 }],
  product_type: products => sorted(distinct(products, product => [product.type as string])),
  vendor: products => sorted(distinct(products, product => [product.vendor as string])),
  tag: products => sorted(distinct(products, product => product.tags as string[]))
}

/** The values a product has for a product-level list filter. */
const productValues: Record<'product_type' | 'vendor' | 'tag', (product: LiquidObject) => string[]> = {
  product_type: product => [product.type as string],
  vendor: product => [product.vendor as string],
  tag: product => product.tags as string[]
}

/**
 * How many products have each value of a list filter, in one pass over `products` however many values there are: `others` is the matcher of every active filter that counts (the filter's own selected values left out for an `OR` filter), and a product counts once under each value it has. A product-level filter reads the product's values (`ofProduct`) and needs the product to pass `others` whole; a variant-level one (availability, option) reads the value of each variant that passes the other variant filters (`ofVariant`), so a value counts a product only when one variant has the value and passes them all, as the parity store counts (fixture `probe-collection-filter-unavailable`).
 */
function tally (products: LiquidObject[], others: Matcher, ofProduct?: (product: LiquidObject) => string[], ofVariant?: (variant: Variant, product: LiquidObject) => string | undefined): Map<string, number> {
  const counts = new Map<string, number>()
  for (const product of products) {
    const seen = new Set<string>()
    if (ofVariant) {
      if (!others.product(product)) continue
      for (const variant of variantsOf(product)) {
        const value = others.variant(variant, product) ? ofVariant(variant, product) : undefined
        if (value) seen.add(value)
      }
    } else if (ofProduct && others.test(product)) {
      for (const value of ofProduct(product)) if (value) seen.add(value)
    }
    for (const value of seen) counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return counts
}

/** `query` with the option name of each `filter.v.option.<name>` pair lower-cased, as the filters' own parameters are, so a hand-typed `filter.v.option.Color=Green` filters, is marked active, counts and links like `filter.v.option.color=Green`. */
export function normalizeQuery (query: Array<[string, string]>): Array<[string, string]> {
  return query.map(([name, value]) => name.startsWith(OPTION) ? [`${OPTION}${name.slice(OPTION.length).toLowerCase()}`, value] : [name, value])
}

/** The most `filter.*` parameters a request is read for. Debutify's bound, final review B (I1): the work of a collection or search request grows with the filters it names and with the pairs its links repeat, and shopify.dev gives no limit. The store data lists a handful of filters, so a request that names more is not a shopper's. */
export const MAX_FILTER_PARAMS = 25

/** The most values of one `filter.*` parameter a request is read for (see `MAX_FILTER_PARAMS`): each value is tested against every product of the page. */
export const MAX_FILTER_VALUES = 50

/** The most query pairs a request keeps, for its filter and page links (see `MAX_FILTER_PARAMS`): every link repeats them. */
export const MAX_QUERY_PAIRS = 100

/** `pairs` with the filter parameters, the values of a parameter and the pairs past the limits left out, in order: the first `MAX_FILTER_PARAMS` `filter.*` names, the first `MAX_FILTER_VALUES` values of each, and the first `MAX_QUERY_PAIRS` pairs in all. The rest of the request is not read, as no limit of Shopify's says. */
export function boundQuery (pairs: Array<[string, string]>): Array<[string, string]> {
  const values = new Map<string, number>()
  const kept: Array<[string, string]> = []
  for (const pair of pairs) {
    if (kept.length >= MAX_QUERY_PAIRS) break
    const name = pair[0]
    if (name.startsWith('filter.')) {
      const count = values.get(name)
      if (count === undefined ? values.size >= MAX_FILTER_PARAMS : count >= MAX_FILTER_VALUES) continue
      values.set(name, (count ?? 0) + 1)
    }
    kept.push(pair)
  }
  return kept
}

/** The query pairs a request's filter links keep and the `filter.*` pairs it has active (option names lower-cased, `normalizeQuery`): the request's `query` without `page`, or, for a request built by hand without one, its `sort_by` and `filters`; the active pairs are the request's `filters`, or the `filter.*` pairs of that query. Both are bounded (`boundQuery`). A collection page and a search page both read their request this way. */
export function requestQuery (request: Pick<RequestInput, 'query' | 'sortBy' | 'filters'>): { query: Array<[string, string]>, active: Array<[string, string]> } {
  const query = boundQuery(normalizeQuery(request.query ?? [...(request.sortBy ? [['sort_by', request.sortBy] as [string, string]] : []), ...(request.filters ?? [])]).filter(([name]) => name !== 'page'))
  return { query, active: request.filters ? boundQuery(normalizeQuery(request.filters)) : query.filter(([name]) => name.startsWith('filter.')) }
}

/**
 * The storefront filters of a list of products shown at `url` (a collection's `filters`), following https://shopify.dev/docs/api/liquid/objects/filter and https://shopify.dev/docs/api/liquid/objects/filter_value, with the parameter names of https://shopify.dev/docs/storefronts/themes/navigation-search/filtering/storefront-filtering. As the collection page says, only filters relevant to the products are returned: a list filter needs at least one value among them, a price filter at least one product. Availability, price, product type, vendor, tag, option and metafield filters are `list` or `price_range`; an option filter is a `list` named after its option, and a metafield filter reads `filter.p.m.<namespace>.<key>` and is labelled by the data, otherwise by its key.
 *
 * `products` are all the products the page can show before its filters (the collection, narrowed by its tags), and `query` is the request's query pairs, filters and the rest (`sort_by`, `q`, `view`), without which every value is inactive. A value counts the products that pass every active filter with the value added and, for an `OR` filter, its own selected values left out, so the counts of a filter's other values show what choosing them would give; an `AND` filter's counts keep its selected values (fixtures `probe-collection-filter-combined` and `probe-collection-filter-types-or`). Values with no product come after the others, each group in the default order (fixtures `probe-collection-filter-tag` and `probe-collection-filter-option`). `url_to_add` and `url_to_remove` are `url` with the query (its pairs ordered by name, `withQuery`) and without `page`, with the value's pair added or taken out, the filter's `url_to_remove` taking out every pair of its parameter (fixture `probe-collection-filter-types-or`: a selected value's `url_to_add` is the current query and the others append theirs). A `url` that has a query of its own keeps it before the pairs. A price filter's `min_value.value` and `max_value.value` are the active bounds in the minor unit of the view currency (fixture `probe-collection-filter-price`: 20 and 40 print 2000 and 4000) and `range_max` is the highest variant price of `products`, whatever the filters (fixture `probe-collection-filter-metafield`: 100000 with only cotton products shown); the shop's price filter is left out in a view currency other than the shop's, where the parity store shows none (fixture `probe-collection-en-eu-price`).
 *
 * Not pinned by shopify.dev and printed so by the parity store: the default labels `Availability`, `Price`, `Product type` and an option's own name (fixture `probe-collection-all`, where the dataset labels only the vendor, tag and metafield filters), availability's value labels (`In stock` for `1`, `Out of stock` for `0`, same fixture) and its listing both values even at count 0 (fixture `probe-search-filtered`), availability counting a product under each stock status one of its variants has (fixture `probe-collection-all`: 26 in stock and 6 out of stock of 29, the hoodie, hoodie-old and high-top-sneakers under both), a value counting each product once, and the lower-cased option name in `filter.v.option.<name>` (fixture `probe-collection-filter-option`: `filter.v.option.color` for `Color`). Still to confirm on a development store: the default labels of the vendor, tag and metafield filters (`Vendor`, `Tags`, the metafield's key), and `image` and `display` being nil, and `swatch` nil unless the filter's presentation is `swatch` and an option value has one (`ProductData.option_values`).
 */
export function buildFilters (filters: FilterData[] | undefined, products: LiquidObject[], url: string, query: Array<[string, string]> = [], currency?: ViewCurrency): LiquidObject[] {
  const kept = normalizeQuery(query).filter(([name]) => name !== 'page')
  const active = kept.filter(([name]) => name.startsWith('filter.'))
  const and = andParams(filters)
  // the whole query sorted and encoded once, for the links of every value (final review B, I1)
  const sortedQuery = prepareQuery(kept)
  const href = (change?: Parameters<typeof withPrepared>[2]) => withPrepared(url, sortedQuery, change)
  const value = (param: string, entry: Entry) => {
    const selected = active.some(([name, found]) => name === param && found === entry.value)
    // the links are made when a template reads them (final review B, I1): a filter has a value for each tag or option of the page, and each link sorts and encodes the whole query, which a template that prints only the labels never needs
    let add: string | undefined
    let remove: string | undefined
    return {
      label: entry.label,
      value: entry.value,
      param_name: param,
      count: entry.count,
      active: selected,
      image: null,
      swatch: entry.swatch ?? null,
      display: null,
      get url_to_add () {
        add ??= href(selected ? undefined : { add: [param, entry.value] })
        return add
      },
      get url_to_remove () {
        remove ??= href({ drop: (name, found) => name === param && found === entry.value })
        return remove
      }
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
        return { label: null, value: set ? amount : null, param_name: name, count: null, active: set, image: null, swatch: null, display: null, url_to_add: href(), url_to_remove: href({ drop: found => found === name }) }
      }
      out.push({ label: filter.label ?? LABELS.price, type: 'price_range', param_name: param, operator: null, presentation: null, values: [], active_values: [], inactive_values: [], true_value: null, false_value: null, min_value: bound(PRICE_GTE), max_value: bound(PRICE_LTE), range_max: prices.reduce((highest, price) => Math.max(highest, price), 0), url_to_remove: href({ drop: name => belongsTo(name, param) }) })
      continue
    }
    const option = filter.attribute === 'option' ? filter.option ?? '' : null
    const others = filterMatcher(and.has(param) ? active : active.filter(([name]) => name !== param), currency, filters)
    let entries: Entry[]
    let counts: Map<string, number>
    if (option !== null) {
      const wanted = option.toLowerCase()
      entries = optionValues(products, option)
      // https://shopify.dev/docs/api/liquid/objects/filter_value#filter_value-swatch: a swatch "Requires the filter presentation to be `swatch` and saved color or image content for the swatch. Otherwise, returns `nil`"; the value's swatch is the option value's (`ProductData.option_values`) in the first product that has one
      if (filter.presentation === 'swatch') for (const entry of entries) entry.swatch = swatchOf(products, option, entry.value)
      counts = tally(products, others, undefined, (variant, product) => {
        const index = (product.options as string[]).findIndex(name => name.toLowerCase() === wanted)
        return index < 0 ? undefined : (variant.options as string[])[index]
      })
    } else if (filter.attribute === 'metafield') {
      if (!filter.metafield) continue
      const { namespace, key } = filter.metafield
      const ofProduct = (product: LiquidObject) => {
        const found = metafieldValue(product, namespace, key)
        return found === undefined || found === null ? [] : [String(found)]
      }
      entries = sorted(distinct(products, ofProduct))
      counts = tally(products, others, ofProduct)
    } else if (filter.attribute === 'availability') {
      entries = listEntries.availability(products)
      counts = tally(products, others, undefined, variant => variant.available ? '1' : '0')
    } else {
      entries = listEntries[filter.attribute as keyof typeof listEntries](products)
      counts = tally(products, others, productValues[filter.attribute as keyof typeof productValues])
    }
    if (!products.length || !entries.length) continue
    for (const entry of entries) entry.count = counts.get(entry.value) ?? 0
    const values = [...entries.filter(entry => entry.count > 0), ...entries.filter(entry => entry.count === 0)].map(entry => value(param, entry))
    out.push({ label: filter.label ?? (option ?? (filter.attribute === 'metafield' ? filter.metafield?.key : LABELS[filter.attribute as keyof typeof LABELS])), type: 'list', param_name: param, operator: and.has(param) ? 'AND' : 'OR', presentation: option !== null ? filter.presentation ?? 'text' : 'text', values, active_values: values.filter(entry => entry.active), inactive_values: values.filter(entry => !entry.active), true_value: null, false_value: null, min_value: null, max_value: null, range_max: null, url_to_remove: href({ drop: name => belongsTo(name, param) }) })
  }
  return out
}
