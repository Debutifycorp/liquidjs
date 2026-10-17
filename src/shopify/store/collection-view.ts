import { HandleMap } from '../objects/handle-map'
import { variantMedia } from '../objects/image'
import { SafeHtmlDrop } from '../objects/safe-html'
import { escapeHtml } from '../util/html'
import { AUTOMATIC_COLLECTIONS, buildCollection, copyObject, lazy, manualProductsOf } from './build'
import type { LiquidObject, StoreObjects } from './build'
import { applyFilters, buildFilters, filterMatcher, requestQuery } from './filters'
import type { RequestInput } from './globals'
import type { ViewCurrency } from './markets'
import { SORT_VALUES, sortProducts } from './sort'
import type { FilterData } from './types'
import { withPrefix } from './view'

export { applyFilters, SORT_VALUES, sortProducts }

type Product = LiquidObject

/** A copy of a built object with `changes` set, keeping its accessors (a collection's `tags` reads the copy's `products`), its hidden fields and its printing as a handle. */
function copyOf (object: LiquidObject, changes: LiquidObject): LiquidObject {
  const copy = copyObject(object)
  for (const [key, value] of Object.entries(changes)) Object.defineProperty(copy, key, { value, enumerable: true, configurable: true, writable: true })
  return copy
}

/**
 * The collection a request shows, https://shopify.dev/docs/api/liquid/objects/collection: its products narrowed to the tag path's tags (every tag, https://shopify.dev/docs/storefronts/themes/navigation-search/filtering/tag-filtering), then to the active filters, then sorted by the request's `sort_by` (the collection's default order when it names none or a value the sort options do not list). `products_count` counts the result and `all_products_count` stays the collection's size, as the parity store prints them (fixture `probe-collection-tag`: 6 of 29); `sort_by` is the requested value, empty when the request names none (fixture `probe-collection-all`); `filters` come from the products before the filters, with the active ones marked (`buildFilters`). Under variant filters a product's `url` and `featured_media` are those of its first matching variant (`Matcher.firstVariant`). The built collection is shared by every request of a view, so this returns a copy, which keeps the built collection's `tags` (`buildCollection`): a collection of the store's has the tags of all its products whatever the filters and the page (recorded: page 1, page 3 and `filter.p.tag`, fixtures `probe-collection-suffix`, `-page-3` and `-filtered`; a tag path and a sort are not recorded), and one Shopify makes the tags of its `products`, the page's inside a `paginate` block (fixtures `probe-collection-all` and `probe-collection-page-2`). `path` is the address the filters' links extend, without its query.
 */
export function collectionView (collection: LiquidObject, request: RequestInput, storefrontFilters: FilterData[], currency: ViewCurrency, path: string): LiquidObject {
  // the data's order, not `products`, which is already in the default order: `sort_by=manual` and the ties of every other sort keep the data's
  const all = manualProductsOf(collection) as Product[]
  const tags = request.tags ?? []
  const tagged = tags.length ? all.filter(product => tags.every(tag => (product.tags as string[]).includes(tag))) : all
  const { query, active } = requestQuery(request)
  const named = request.sortBy && SORT_VALUES.includes(request.sortBy) ? request.sortBy : undefined
  const matcher = filterMatcher(active, currency, storefrontFilters)
  const automatic = AUTOMATIC_COLLECTIONS.has(String(collection.handle))
  const sorted = sortProducts(tagged.filter(matcher.test), named ?? String(collection.default_sort_by), automatic)
  const link = (product: Product) => {
    const variant = matcher.firstVariant(product)
    // the matching variant's media is shown as the bare image: its `alt` is empty where the product's reads the title (scenario `page-collection-filtered`: `<img alt="">` for the card of a product shown through its variant)
    const media = variant?.featured_media
    return variant ? copyOf(product, { url: variant.url, featured_media: variantMedia(media) ?? product.featured_media }) : product
  }
  const linked = active.some(([name]) => name.startsWith('filter.v.'))
  const view = copyOf(collection, { products_count: sorted.length, sort_by: named ?? '' })
  // what a template reads is made when it reads it (final review B, I1): `products` links only the products that are read, and `filters` are built from the products before the filters, once, or are the collection's own when the request changes nothing: no tag path, no query and the collection's own address, where the filters are those the store already built for the collection (`buildCollection`)
  lazy(view, 'products', () => linked ? linkedLazily(sorted, link) : sorted)
  lazy(view, 'filters', () => !tags.length && !query.length && path === collection.url ? collection.filters : buildFilters(storefrontFilters, tagged, path, query, currency))
  return view
}

/** `products` with `link` applied to each one when it is first read, and kept: an array of the same length whose elements are made on demand, so a page that shows 24 of 5,000 products copies 24. The elements are accessors, which `slice`, `map`, `for` and `json` read like any value. */
function linkedLazily (products: Product[], link: (product: Product) => Product): Product[] {
  const out = new Array<Product>(products.length)
  products.forEach((product, at) => {
    let linked: Product | undefined
    Object.defineProperty(out, at, { get: () => (linked ??= link(product)), enumerable: true, configurable: true })
  })
  return out
}

/**
 * The `/collections/vendors?q=` and `/collections/types?q=` collection: every product whose vendor (or type) is `term`, compared without regard to case, titled with the term, handled `vendors` (or `types`), sorted by title by default and listed at that address with its `q` (fixtures `probe-collection-vendors` and `probe-collection-types`). shopify.dev's collection page says nothing of these two; the parity store answers them. A term no product has gives an empty collection. `prefix` is the view's.
 */
function automaticCollection (store: StoreObjects, handle: 'vendors' | 'types', term: string, prefix: string): LiquidObject {
  const wanted = term.toLowerCase()
  const field = handle === 'vendors' ? 'vendor' : 'type'
  const found = HandleMap.values(store.products).filter(product => term !== '' && String(product[field]).toLowerCase() === wanted)
  const built = buildCollection({ id: 0, handle, title: term, products: found.map(product => String(product.handle)), sort_order: 'title-ascending' }, store.products, store.storefrontFilters, prefix, store.currency)
  // the term is the visitor's, and the layout prints `page_title` (this title) unescaped inside `<title>`, so the title is HTML-safe with the term escaped, as the search page's title is (`templateTitle`); `escape` leaves it alone and the page cannot be given markup through `?q=`. Shopify's own escaping of this title is not recorded; the term's characters are the only thing the engine escapes.
  return copyOf(built, { title: new SafeHtmlDrop(escapeHtml(term)), url: withPrefix(prefix, `/collections/${handle}?q=${encodeURIComponent(term)}`) })
}

export const vendorCollection = (store: StoreObjects, term: string, prefix = ''): LiquidObject => automaticCollection(store, 'vendors', term, prefix)
export const typeCollection = (store: StoreObjects, term: string, prefix = ''): LiquidObject => automaticCollection(store, 'types', term, prefix)
