import { HandleMap } from '../objects/handle-map'
import { printsHandle, type LiquidObject, type StoreObjects } from './build'
import { buildFilters } from './filters'
import { withPrefix } from './view'

const words = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
const plain = (html: unknown) => String(html ?? '').replace(/<[^>]*>/g, ' ').replace(/&[#\w]+;/g, ' ')

/** The words a resource is found by: a product's title, vendor, type, tags and description; a page's title and content; an article's title, tags and content. HTML tags and entities are not words. */
function searchable (item: LiquidObject, kind: 'product' | 'page' | 'article'): string[] {
  const tags = (item.tags as string[] | undefined) ?? []
  const fields = kind === 'product'
    ? [item.title, item.vendor, item.type, ...tags, plain(item.description)]
    : kind === 'page' ? [item.title, plain(item.content)] : [item.title, ...tags, plain(item.content)]
  return fields.flatMap(field => words(String(field ?? '')))
}

/** Every term but the last is a whole word of the resource, and the last starts one, as shopify.dev's storefront search page describes its default `prefix: last`. */
function matches (found: string[], terms: string[]): boolean {
  const all = new Set(found)
  return terms.every((term, at) => at < terms.length - 1 ? all.has(term) : found.some(word => word.startsWith(term)))
}

const SORT_OPTIONS = [{ name: 'Relevance', value: 'relevance' }, { name: 'Price, low to high', value: 'price-ascending' }, { name: 'Price, high to low', value: 'price-descending' }]
const LIMIT = 1000

/**
 * The `search` object of https://shopify.dev/docs/api/liquid/objects/search. Without terms no search is run: `performed` is false and nothing is found. With terms, `results` holds the store's products, pages and articles whose words match every term, case-insensitively, each a copy with the `object_type` that page documents; `results_count` and the results stop at 1,000, `types` is all three (the `type` parameter is not modelled), `sort_by` and `default_sort_by` are `relevance` (no `sort_by` parameter is modelled), `sort_options` are the three sort orders shopify.dev's storefront search page lists (https://shopify.dev/docs/storefronts/themes/navigation-search/search), and `filters` are the store's storefront filters over the matching products (`buildFilters`), at `/search?q=<terms>` under `prefix` (the view's base path and locale prefix, like the search route). As that page gives for its defaults, the last term matches the start of a word (`prefix: last`) and unavailable products come after every other result (`unavailable_products: last`).
 *
 * Debutify's matching, which shopify.dev does not pin and so goes on the "confirm on a development store" list: the fields searched (a product's title, vendor, type, tags and description; a page's title and content; an article's title, tags and content), splitting text into words at anything that is not a letter or digit, the order of results (available products, then pages, then articles, each in store order, then unavailable products) in place of Shopify's relevance ranking, the sort option names, and the `q` parameter's encoding in the filter URLs.
 */
export function buildSearch (store: StoreObjects, terms: string | undefined, prefix = ''): LiquidObject {
  if (terms === undefined || terms.trim() === '') return { performed: false, results: [], results_count: 0, terms: terms ?? '', types: ['product', 'page', 'article'], filters: [], sort_by: 'relevance', default_sort_by: 'relevance' }
  const wanted = words(terms)
  const find = (items: LiquidObject[], kind: 'product' | 'page' | 'article') => wanted.length ? items.filter(item => matches(searchable(item, kind), wanted)) : []
  const products = find(HandleMap.values(store.products), 'product')
  const found = [
    ...products.filter(product => product.available).map(product => ({ item: product, kind: 'product' })),
    ...find(HandleMap.values(store.pages), 'page').map(page => ({ item: page, kind: 'page' })),
    ...find(HandleMap.values(store.articles), 'article').map(article => ({ item: article, kind: 'article' })),
    ...products.filter(product => !product.available).map(product => ({ item: product, kind: 'product' }))
  ].slice(0, LIMIT)
  return {
    performed: true,
    results: found.map(({ item, kind }) => printsHandle({ ...item, object_type: kind })),
    results_count: found.length,
    terms,
    types: ['article', 'page', 'product'],
    filters: buildFilters(store.storefrontFilters, found.filter(entry => entry.kind === 'product').map(entry => entry.item), withPrefix(prefix, `/search?q=${encodeURIComponent(terms)}`)),
    sort_by: 'relevance',
    default_sort_by: 'relevance',
    sort_options: SORT_OPTIONS.map(option => ({ ...option }))
  }
}
