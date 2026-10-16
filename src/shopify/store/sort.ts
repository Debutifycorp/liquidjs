import type { LiquidObject } from './build'

type Product = LiquidObject

/** The time a product was created, from its `created_at` with any UTC offset; -Infinity when it has none or it is no date, which then sorts before every date. */
const stamp = (product: Product) => {
  const time = Date.parse(String(product.created_at ?? ''))
  return Number.isNaN(time) ? -Infinity : time
}
const sold = (product: Product) => typeof product.sales_rank === 'number' ? product.sales_rank : Infinity

/** The `sort_by` values of https://shopify.dev/docs/api/liquid/objects/collection#collection-sort_by. */
export const SORT_VALUES = ['manual', 'best-selling', 'title-ascending', 'title-descending', 'price-ascending', 'price-descending', 'created-ascending', 'created-descending']

const collator = new Intl.Collator('en')

/** Orders two resources by their title in English collation, the order Shopify lists collections in (https://shopify.dev/docs/api/liquid/objects/collections shows its example alphabetical by title). */
export const byTitle = (a: { title?: unknown }, b: { title?: unknown }) => collator.compare(String(a.title ?? ''), String(b.title ?? ''))

const BY: Record<'title' | 'price' | 'created', (a: Product, b: Product) => number> = {
  title: byTitle,
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
