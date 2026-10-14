import { HandleMap } from '../objects/handle-map'
import type { ReportCollector } from '../report'
import type { LiquidObject, StoreObjects } from './build'

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

/** Debutify's related products, from what the store data holds: the products of the collections the product is in (collections in store order, products in collection order, `all` and `frontpage` left out as shopify.dev's related-collections rule says), then the products of the same product type in store order. Shopify ranks by purchase history and product descriptions first and uses related collections when those are not available; the store data has no purchase history, and the product type stands in for similar descriptions. */
function related (store: StoreObjects, product: LiquidObject): LiquidObject[] {
  const fromCollections = HandleMap.values(store.collections)
    .filter(collection => !SKIPPED_COLLECTIONS.has(String(collection.handle)) && (collection.products as LiquidObject[]).includes(product))
    .flatMap(collection => collection.products as LiquidObject[])
  const sameType = product.type ? HandleMap.values(store.products).filter(other => other.type === product.type) : []
  return [...fromCollections, ...sameType]
}

/**
 * The `recommendations` object, https://shopify.dev/docs/api/liquid/objects/recommendations. Without a recommendations request it is not performed: `performed?` false, no products, `products_count` 0 and `intent` nil, as the page gives for that case (`performed` mirrors `performed?`). With one, it is performed for the product whose `id` is `productId`, with the request's `intent`, and holds up to `limit` products. Related products come from the store data (`related`, Debutify's rule); complementary products are set up by the merchant in the admin ("Complementary recommendations need to be manually set up", https://shopify.dev/docs/storefronts/themes/product-merchandising/recommendations), which the store data does not model, so they are none. Either way the product itself, products that are not available, products with a price of 0, gift cards and products in the cart are left out, as the related and complementary products pages list in their limitations. A product id the store does not have is reported as a missing resource and an intent other than `related` or `complementary` as unsupported, and both leave `recommendations` not performed, where Shopify answers 404 and 422.
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
