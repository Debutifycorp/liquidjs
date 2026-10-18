import { formatRubyFloat } from '../../util/liquid-float'
import { escapeJson } from '../filters/json'
import type { ImageDrop } from '../objects/image'
import { HandleMap } from '../objects/handle-map'
import { buildStore } from './build'
import type { LiquidObject } from './build'
import { resolveView } from './view'
import type { StoreView } from './view'
import type { StoreData } from './types'

/** A price as the answer writes it, Ruby's float (`90.0`, `82.95`), which JSON.stringify would write `90`: carried as a marked string until the text is made. */
const FLOAT = '\u0000float:'

const offerOf = (variant: LiquidObject, currency: string) => ({
  title: variant.title,
  offer_id: variant.id,
  sku: variant.sku === '' || variant.sku === undefined ? null : variant.sku,
  price: `${FLOAT}${formatRubyFloat(Number(variant.price) / 100)}`,
  currency_code: currency,
  in_stock: variant.available
})

const thumbnailOf = (image: unknown): { thumbnail_url?: string } => image ? { thumbnail_url: (image as ImageDrop).src } : {}

const productOf = (product: LiquidObject, currency: string) => ({
  product_id: product.handle,
  title: product.title,
  description: product.description,
  brand: product.vendor,
  offers: (product.variants as LiquidObject[]).map(variant => offerOf(variant, currency)),
  ...thumbnailOf(product.featured_image)
})

/** The text of an oEmbed answer, escaped as Rails writes JSON (`/` as `\/`, `<` as `\u003c`) and with its prices as floats. */
const text = (value: unknown) => escapeJson(JSON.stringify(value)).replace(/"\\u0000float:([^"]+)"/g, '$1')

/**
 * The oEmbed answers `content_for_header` links, https://oembed.com/: `/products/<handle>.oembed` (the product with one offer for each variant) and `/collections/<handle>.oembed` (the collection with its products oldest first (by id), not in the order its page lists them, each as the product answer without its `url`), as the parity store answers them (scenario `ajax-endpoint-links`): the keys in that order, `provider` the shop's name, `type` `link`, the prices in the view's market and currency. The product's `url` is its page, the collection's its own `.oembed` address (the store writes it so). A handle the store lacks gives null, where the store answers 404 with an empty body.
 */
export function oembedJson (data: StoreData, kind: 'product' | 'collection', handle: string, view: StoreView = resolveView(data, {})): string | null {
  const store = buildStore(data, view)
  const shop = store.shop
  const currency = store.currency.iso_code
  const tail = { provider: shop.name, version: '1.0', type: 'link' }
  if (kind === 'product') {
    const product = HandleMap.get(store.products, handle)
    if (!product) return null
    return text({ ...productOf(product, currency), url: `${shop.url}${product.url}`, ...tail })
  }
  const collection = HandleMap.get(store.collections, handle)
  if (!collection) return null
  const products = [...(collection.products as LiquidObject[])].sort((a, b) => Number(a.id) - Number(b.id)).map(product => {
    const { product_id, title, description, brand, offers, thumbnail_url } = productOf(product, currency)
    return { product_id, title, description, brand, offers, thumbnail_url }
  })
  return text({ title: collection.title, description: collection.description, products, ...thumbnailOf(collection.featured_image), url: `${shop.url}${collection.url}.oembed`, ...tail })
}
