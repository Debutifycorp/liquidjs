import { HandleMap } from '../objects/handle-map'
import { buildCollection, copyObject } from './build'
import type { LiquidObject, StoreObjects } from './build'
import { applyFilters, buildFilters, filterMatcher, normalizeQuery } from './filters'
import type { RequestInput } from './globals'
import type { ViewCurrency } from './markets'
import type { FilterData } from './types'
import { withPrefix } from './view'

export { applyFilters }

type Product = LiquidObject

/** The time a product was created, from its `created_at` with any UTC offset; -Infinity when it has none or it is no date, which then sorts before every date. */
const stamp = (product: Product) => {
  const time = Date.parse(String(product.created_at ?? ''))
  return Number.isNaN(time) ? -Infinity : time
}
const sold = (product: Product) => typeof product.sales_rank === 'number' ? product.sales_rank : Infinity

/** The collections Shopify makes itself: the catalogue and the vendor and type collections. They have no manual order, and `manual` shows their default one, by title (fixture `probe-collection-sort-manual`). */
const AUTOMATIC = new Set(['all', 'vendors', 'types'])

/** The `sort_by` values of https://shopify.dev/docs/api/liquid/objects/collection#collection-sort_by. */
export const SORT_VALUES = ['manual', 'best-selling', 'title-ascending', 'title-descending', 'price-ascending', 'price-descending', 'created-ascending', 'created-descending']

const collator = new Intl.Collator('en')

const BY: Record<'title' | 'price' | 'created', (a: Product, b: Product) => number> = {
  title: (a, b) => collator.compare(String(a.title), String(b.title)),
  price: (a, b) => Number(a.price) - Number(b.price),
  created: (a, b) => {
    const [x, y] = [stamp(a), stamp(b)]
    if (x !== y) return x < y ? -1 : 1
    return x === -Infinity ? 0 : Number(a.id) - Number(b.id)
  }
}

/**
 * `products` in the order `sortBy` names, a copy. Products that tie keep the order they came in, and a descending order is exactly the reverse of the ascending one, ties included, as the parity store lists them (fixtures `probe-collection-sort-price-ascending` and `-descending`: the two 25.00 products come slides then clear-sunnies, and the 120.00 ones women-crewneck first descending). Best selling puts the products with a `sales_rank` first, by rank, and the rest newest first, which is what the parity store lists with no sales (fixtures `probe-collection-sort-best-selling` and `probe-collection-best-selling`: hoodie, beanie, high-top-sneakers, clear-sunnies, gray-runners, gray-leather-sneakers, the catalogue's newest first, not the collection's order); with no `created_at` to tell which is newest, the rest keep their order. A product is newer than another by its `created_at` (compared as the time it holds, whatever its UTC offset) and, at the same time, by its larger `id`, as Shopify numbers products in the order it makes them (the fixtures' ties fall that way); products with no `created_at` tie and keep their order. `manual` keeps the order, except in the collections Shopify makes itself (`automatic`), where it is the title order. Price is the product's lowest price and title the title in English collation, neither of which shopify.dev pins; a `created_at` that is no date sorts before every date.
 */
export function sortProducts (products: Product[], sortBy: string, automatic = false): Product[] {
  const list = [...products]
  if (sortBy === 'manual') return automatic ? list.sort(BY.title) : list
  if (sortBy === 'best-selling') {
    const newest = list.some(product => stamp(product) !== -Infinity) ? list.sort(BY.created).reverse() : list
    return newest.sort((a, b) => sold(a) === sold(b) ? 0 : sold(a) < sold(b) ? -1 : 1)
  }
  const [key, direction] = sortBy.split('-') as ['title' | 'price' | 'created', 'ascending' | 'descending']
  list.sort(BY[key])
  return direction === 'descending' ? list.reverse() : list
}

/** A copy of a built object with `changes` set, keeping its accessors (a collection's `tags` reads the copy's `products`), its hidden fields and its printing as a handle. */
function copyOf (object: LiquidObject, changes: LiquidObject): LiquidObject {
  const copy = copyObject(object)
  for (const [key, value] of Object.entries(changes)) Object.defineProperty(copy, key, { value, enumerable: true, configurable: true, writable: true })
  return copy
}

/**
 * The collection a request shows, https://shopify.dev/docs/api/liquid/objects/collection: its products narrowed to the tag path's tags (every tag, https://shopify.dev/docs/storefronts/themes/navigation-search/filtering/tag-filtering), then to the active filters, then sorted by the request's `sort_by` (the collection's default order when it names none or a value the sort options do not list). `products_count` counts the result and `all_products_count` stays the collection's size, as the parity store prints them (fixture `probe-collection-tag`: 6 of 29); `sort_by` is the requested value, empty when the request names none (fixture `probe-collection-all`); `filters` come from the products before the filters, with the active ones marked (`buildFilters`). Under variant filters a product's `url` and `featured_media` are those of its first matching variant (`matchingVariant`). The built collection is shared by every request of a view, so this returns a copy, and its `tags` follow its `products` (inside a `paginate` block, the page's). `path` is the address the filters' links extend, without its query.
 */
export function collectionView (collection: LiquidObject, request: RequestInput, storefrontFilters: FilterData[], currency: ViewCurrency, path: string): LiquidObject {
  const all = collection.products as Product[]
  const tags = request.tags ?? []
  const tagged = tags.length ? all.filter(product => tags.every(tag => (product.tags as string[]).includes(tag))) : all
  const query = normalizeQuery(request.query ?? [...(request.sortBy ? [['sort_by', request.sortBy] as [string, string]] : []), ...(request.filters ?? [])]).filter(([name]) => name !== 'page')
  const active = request.filters ? normalizeQuery(request.filters) : query.filter(([name]) => name.startsWith('filter.'))
  const named = request.sortBy && SORT_VALUES.includes(request.sortBy) ? request.sortBy : undefined
  const matcher = filterMatcher(active, currency, storefrontFilters)
  const sorted = sortProducts(tagged.filter(matcher.test), named ?? String(collection.default_sort_by), AUTOMATIC.has(String(collection.handle)))
  const link = (product: Product) => {
    const variant = matcher.firstVariant(product)
    return variant ? copyOf(product, { url: variant.url, featured_media: variant.featured_media ?? product.featured_media }) : product
  }
  const shown = active.some(([name]) => name.startsWith('filter.v.')) ? sorted.map(link) : sorted
  return copyOf(collection, { products: shown, products_count: shown.length, sort_by: named ?? '', filters: buildFilters(storefrontFilters, tagged, path, query, currency) })
}

/**
 * The `/collections/vendors?q=` and `/collections/types?q=` collection: every product whose vendor (or type) is `term`, compared without regard to case, titled with the term, handled `vendors` (or `types`), sorted by title by default and listed at that address with its `q` (fixtures `probe-collection-vendors` and `probe-collection-types`). shopify.dev's collection page says nothing of these two; the parity store answers them. A term no product has gives an empty collection. `prefix` is the view's.
 */
function automaticCollection (store: StoreObjects, handle: 'vendors' | 'types', term: string, prefix: string): LiquidObject {
  const wanted = term.toLowerCase()
  const field = handle === 'vendors' ? 'vendor' : 'type'
  const found = HandleMap.values(store.products).filter(product => term !== '' && String(product[field]).toLowerCase() === wanted)
  const built = buildCollection({ id: 0, handle, title: term, products: found.map(product => String(product.handle)), sort_order: 'title-ascending' }, store.products, store.storefrontFilters, prefix, store.currency)
  return copyOf(built, { url: withPrefix(prefix, `/collections/${handle}?q=${encodeURIComponent(term)}`) })
}

export const vendorCollection = (store: StoreObjects, term: string, prefix = ''): LiquidObject => automaticCollection(store, 'vendors', term, prefix)
export const typeCollection = (store: StoreObjects, term: string, prefix = ''): LiquidObject => automaticCollection(store, 'types', term, prefix)
