import { HandleMap } from '../objects/handle-map'
import { ReportCollector } from '../report'
import { buildStore } from './build'
import type { LiquidObject, StoreObjects } from './build'
import { buildCartObject } from './cart'
import type { CartState } from './cart'
import { productJson } from './product-json'
import type { StoreData } from './types'
import { resolveView } from './view'
import type { StoreView } from './view'

/** A request to the Product Recommendations API, `/recommendations/products?product_id=<id>&limit=<n>&intent=<intent>` with its `section_id` (https://shopify.dev/docs/api/ajax/reference/product-recommendations): the section is rendered with `recommendations` for this product. */
export interface RecommendationsRequest {
  /** The `product_id` parameter: the product's `id`, as a number or the string a URL carries. */
  productId: number | string
  /** The `limit` parameter, 1 to 10; 10 when omitted. */
  limit?: number | string | null
  /** The `intent` parameter, `related` or `complementary`; `related` when omitted. */
  intent?: string | null
}

/** "Products from collections that the current product is part of, excluding collections with handles `all` and `frontpage`", https://shopify.dev/docs/storefronts/themes/product-merchandising/recommendations/related-products. */
const SKIPPED_COLLECTIONS = new Set(['all', 'frontpage'])
/** "The value can range from `1` to `10`, and the default is `10`." https://shopify.dev/docs/api/ajax/reference/product-recommendations */
const MAX_LIMIT = 10

const notPerformed = (): LiquidObject => ({ 'performed?': false, performed: false, products: [], products_count: 0, intent: null })

function limitOf (value: RecommendationsRequest['limit']): number {
  const limit = Math.floor(Number(value))
  return value === undefined || value === null || value === '' || !Number.isFinite(limit) ? MAX_LIMIT : Math.min(MAX_LIMIT, Math.max(1, limit))
}

/** Debutify's related products, from what the store data holds: the products of the collections the product is in (collections in store order, products in the collection's default order, `all` and `frontpage` left out as shopify.dev's related-collections rule says), then the products of the same product type in store order. Shopify ranks by purchase history and product descriptions first and uses related collections when those are not available; the store data has no purchase history, and the product type stands in for similar descriptions. */
function related (store: StoreObjects, product: LiquidObject): LiquidObject[] {
  const fromCollections = HandleMap.values(store.collections)
    .filter(collection => !SKIPPED_COLLECTIONS.has(String(collection.handle)) && (collection.products as LiquidObject[]).includes(product))
    .flatMap(collection => collection.products as LiquidObject[])
  const sameType = product.type ? HandleMap.values(store.products).filter(other => other.type === product.type) : []
  return [...fromCollections, ...sameType]
}

/**
 * The `recommendations` object, https://shopify.dev/docs/api/liquid/objects/recommendations. Without a recommendations request it is not performed: `performed?` false, no products, `products_count` 0 and `intent` nil, as the page gives for that case (`performed` mirrors `performed?`). With one, it is performed for the product whose `id` is `productId`, with the request's `intent`, and holds up to `limit` products. Related products come from the store data (`related`, Debutify's rule); complementary products are set up by the merchant in the admin ("Complementary recommendations need to be manually set up", https://shopify.dev/docs/storefronts/themes/product-merchandising/recommendations), which the store data does not model, so they are none, as the parity store, which has none set up, answers (fixture `probe-recommendations-complementary`). Either way the product itself, products that are not available, products with a price of 0, gift cards and products in the cart are left out, as the related and complementary products pages list in their limitations. A product id the store does not have is reported as a missing resource and an intent other than `related` or `complementary` as unsupported, and both leave `recommendations` not performed, where Shopify answers 404 and 422.
 */
export function buildRecommendations (store: StoreObjects, request: RecommendationsRequest | undefined, report: ReportCollector): LiquidObject {
  if (!request) return notPerformed()
  const intent = request.intent === undefined || request.intent === null || request.intent === '' ? 'related' : String(request.intent)
  if (intent !== 'related' && intent !== 'complementary') {
    report.unsupported('recommendations', `recommendations intent ${intent} is not related or complementary`)
    return notPerformed()
  }
  const product = HandleMap.values(store.products).find(item => String(item.id) === String(request.productId))
  if (!product) {
    report.missing('resource', `product ${request.productId}`)
    return notPerformed()
  }
  const inCart = new Set((store.cart.items as LiquidObject[]).map(item => item.product))
  const candidates = intent === 'related' ? related(store, product) : []
  const products = [...new Set(candidates)]
    .filter(item => item !== product && item.available && (item.price as number) > 0 && !item['gift_card?'] && !inCart.has(item))
    .slice(0, limitOf(request.limit))
  return { 'performed?': true, performed: true, products, products_count: products.length, intent }
}

/** The id the Product Recommendations and Predictive Search answers put in the tracking parameters of the URLs they list (`pr_rec_id`, `_psid`): nine hex digits, as the parity store prints them (fixtures `ajax-recommendations-json` and `ajax-suggest-json`). Shopify makes a new one for each request; the same request here gets the same id, so an answer is stable (two FNV-style hashes of the parts). */
export function trackingId (...parts: Array<string | number>): string {
  const text = parts.join('|')
  let a = 0x811c9dc5
  let b = 0x9e3779b9
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 0x01000193)
    b = Math.imul(b ^ text.charCodeAt(i), 0x85ebca6b)
  }
  return ((a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0')).slice(0, 9)
}

/**
 * The `/recommendations/products.json` answer, https://shopify.dev/docs/api/ajax/reference/product-recommendations: `products`, each as `/products/<handle>.js` prints it (`productJson`), and the `intent`, in that order (fixture `ajax-recommendations-json`). Each product's `url` carries the tracking parameters the parity store adds, in its order: `pr_prod_strat` (`collection_fallback`, the one strategy any recording shows, and the one Debutify's related products follow: the product's collections first), `pr_rec_id` (`trackingId`), `pr_rec_pid` (the recommended product), `pr_ref_pid` (the product asked about) and `pr_seq` (`uniform`). A request the engine cannot answer (a product the store does not have, an intent that is neither `related` nor `complementary`) gives no products, where Shopify answers 404 or 422; `intent` is then the request's, or `related`.
 *
 * `cart` is the visitor's cart (a `CartState`, as `renderPage` takes it): the products in it are left out, as shopify.dev's limitations pages say and as the `recommendations` of a page rendered for that cart leaves them out; without it the cart of the store data is the one that counts.
 *
 * Which products come back is Debutify's rule (`buildRecommendations`), not Shopify's: the parity store samples at random from the collections the product is in (two recordings of the same request, fixtures `ajax-recommendations-json` and `probe-recommendations-related`, share two of their four products, `soft-cotton-hoodie-in-jam` first in both and `women-t-shirt` in different places, and all eight are in the dataset's `tops` collection), and the dataset does not list the parity store's `hoodie` in any collection.
 */
export function recommendationsJson (data: StoreData, request: RecommendationsRequest, view: StoreView = resolveView(data, {}), cart?: CartState): Record<string, unknown> {
  const built = buildStore(data, view)
  // the visitor's cart, when the caller has one, is built on the shared store's products, currency and prefix, as a page's is (`buildGlobals`), so the products in it are left out as they are on the `section_id` path
  const store = cart ? { ...built, cart: buildCartObject(built, cart) } : built
  const found = buildRecommendations(store, request, new ReportCollector())
  const intent = typeof found.intent === 'string' ? found.intent : request.intent || 'related'
  const id = trackingId(request.productId, limitOf(request.limit), intent)
  const products = ((found.products ?? []) as LiquidObject[]).map(product => {
    const json = productJson(data, String(product.handle), view) as Record<string, unknown>
    return { ...json, url: `${json.url}?pr_prod_strat=collection_fallback&pr_rec_id=${id}&pr_rec_pid=${product.id}&pr_ref_pid=${request.productId}&pr_seq=uniform` }
  })
  return { products, intent }
}
