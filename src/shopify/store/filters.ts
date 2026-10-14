import type { LiquidObject } from './build'
import type { FilterData } from './types'

/** The labels used when the store data gives none. shopify.dev does not list default filter or value labels, so these are not pinned. */
const LABELS: Record<FilterData['attribute'], string> = { availability: 'Availability', price: 'Price', product_type: 'Product type', vendor: 'Vendor', tag: 'Tags', option: '' }

interface Entry { value: string, label: string, count: number }

const variantsOf = (product: LiquidObject) => product.variants as LiquidObject[]

/** The values of a list filter over `products`, each counted by the products that have it, in first-seen order. */
function countValues (products: LiquidObject[], valuesOf: (product: LiquidObject) => string[]): Entry[] {
  const counts = new Map<string, number>()
  for (const product of products) {
    for (const value of new Set(valuesOf(product).filter(Boolean))) counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts].map(([value, count]) => ({ value, label: value, count }))
}

const sorted = (entries: Entry[]) => entries.sort((a, b) => a.value < b.value ? -1 : a.value > b.value ? 1 : 0)

function optionValues (products: LiquidObject[], name: string): Entry[] {
  const wanted = name.toLowerCase()
  return countValues(products, product => {
    const index = (product.options as string[]).findIndex(option => option.toLowerCase() === wanted)
    return index < 0 ? [] : variantsOf(product).map(variant => (variant.options as string[])[index])
  })
}

const listEntries: Record<Exclude<FilterData['attribute'], 'price' | 'option'>, (products: LiquidObject[]) => Entry[]> = {
  availability: products => [
    { value: '1', label: 'In stock', count: products.filter(product => variantsOf(product).some(variant => variant.available)).length },
    { value: '0', label: 'Out of stock', count: products.filter(product => variantsOf(product).some(variant => !variant.available)).length }
  ],
  product_type: products => sorted(countValues(products, product => [product.type as string])),
  vendor: products => sorted(countValues(products, product => [product.vendor as string])),
  tag: products => sorted(countValues(products, product => product.tags as string[]))
}

const PARAMS: Record<Exclude<FilterData['attribute'], 'option'>, string> = { availability: 'filter.v.availability', price: 'filter.v.price', product_type: 'filter.p.product_type', vendor: 'filter.p.vendor', tag: 'filter.p.tag' }

/**
 * The storefront filters of a list of products shown at `url` (a collection's `filters`), following https://shopify.dev/docs/api/liquid/objects/filter and https://shopify.dev/docs/api/liquid/objects/filter_value, with the parameter names of https://shopify.dev/docs/storefronts/themes/navigation-search/filtering/storefront-filtering. As the collection page says, only filters relevant to the products are returned: a list filter needs at least one value among them, a price filter at least one product. The request carries no query string here, so no filter is applied: every value is inactive, `active_values` is empty, the price filter's `min_value` and `max_value` have no `value`, `url_to_remove` is `url` and `url_to_add` is `url` with the value's parameter added to its query. Availability, price, product type, vendor and tag filters are `list` or `price_range`; an option filter is a `list` named after its option.
 *
 * Not pinned by shopify.dev, for the "confirm on a development store" list: the default labels, availability's value labels (`In stock` for `1`, `Out of stock` for `0`) and its listing both values even at count 0, the value order (product types, vendors and tags sorted, option values in the order the products give them), a value counting each product once, the lower-cased option name in `filter.v.option.<name>`, `encodeURIComponent` for values in URLs, the `OR` operator for every list filter, and `swatch`, `image` and `display` being nil (the store data has no swatches).
 */
export function buildFilters (filters: FilterData[] | undefined, products: LiquidObject[], url: string): LiquidObject[] {
  const value = (param: string, entry: Entry | null) => ({
    label: entry?.label ?? null,
    value: entry?.value ?? null,
    param_name: param,
    count: entry ? entry.count : null,
    active: false,
    image: null,
    swatch: null,
    display: null,
    url_to_add: entry ? `${url}${url.includes('?') ? '&' : '?'}${param}=${encodeURIComponent(entry.value)}` : url,
    url_to_remove: url
  })
  const out: LiquidObject[] = []
  for (const filter of filters ?? []) {
    if (filter.attribute === 'price') {
      if (!products.length) continue
      const prices = products.flatMap(product => variantsOf(product).map(variant => variant.price as number))
      out.push({ label: filter.label ?? LABELS.price, type: 'price_range', param_name: PARAMS.price, operator: null, presentation: null, values: [], active_values: [], inactive_values: [], true_value: null, false_value: null, min_value: value(`${PARAMS.price}.gte`, null), max_value: value(`${PARAMS.price}.lte`, null), range_max: Math.max(...prices), url_to_remove: url })
      continue
    }
    const option = filter.attribute === 'option' ? filter.option ?? '' : null
    const entries = option !== null ? optionValues(products, option) : listEntries[filter.attribute as keyof typeof listEntries](products)
    if (!products.length || !entries.length) continue
    const param = option !== null ? `filter.v.option.${option.toLowerCase()}` : PARAMS[filter.attribute as keyof typeof PARAMS]
    const values = entries.map(entry => value(param, entry))
    out.push({ label: filter.label ?? (option ?? LABELS[filter.attribute]), type: 'list', param_name: param, operator: 'OR', presentation: option !== null ? filter.presentation ?? 'text' : 'text', values, active_values: [], inactive_values: values, true_value: null, false_value: null, min_value: null, max_value: null, range_max: null, url_to_remove: url })
  }
  return out
}
