import type { ImageData } from '../types'

/** Metafields by namespace and key, https://shopify.dev/docs/api/liquid/objects/metafield. Plain values only: shopify.dev's metafield object (type-aware `value`, `list?`) is not built here. */
export type Metafields = Record<string, Record<string, unknown>>

/** The data behind Shopify's `shop` object, https://shopify.dev/docs/api/liquid/objects/shop. */
export interface ShopData {
  name: string
  /** The shop's domain without a scheme (`example.myshopify.com`); the default `request.host`. */
  domain: string
  email?: string
  description?: string
  /** ISO 4217 code (`USD`). */
  currency: string
  money_format?: string
  money_with_currency_format?: string
  /** The primary locale (`en`). */
  locale?: string
  enabled_payment_types?: string[]
  metafields?: Metafields
}

/** The data behind Shopify's `variant` object, https://shopify.dev/docs/api/liquid/objects/variant. Prices are integers in the currency's minor unit. */
export interface VariantData {
  id: number
  title: string
  price: number
  compare_at_price?: number | null
  available: boolean
  sku?: string
  option1?: string | null
  option2?: string | null
  option3?: string | null
  image?: ImageData | null
  inventory_quantity?: number
}

/** An image as product media, https://shopify.dev/docs/api/liquid/objects/media (`media_type` is `image`). */
export interface ImageMediaData extends ImageData {
  media_type: 'image'
}

/** One file of a hosted video, https://shopify.dev/docs/api/liquid/objects/video_source. */
export interface VideoSourceData {
  url: string
  mime_type: string
  format: string
  width?: number
  height?: number
}

/** Hosted video media, https://shopify.dev/docs/api/liquid/objects/video. */
export interface VideoMediaData {
  media_type: 'video'
  id: number
  alt?: string
  preview_image: ImageData
  sources: VideoSourceData[]
}

/** Externally hosted video media, https://shopify.dev/docs/api/liquid/objects/external_video. */
export interface ExternalVideoMediaData {
  media_type: 'external_video'
  id: number
  alt?: string
  host: 'youtube' | 'vimeo'
  external_id: string
  preview_image?: ImageData
}

/** The three kinds of product media, https://shopify.dev/docs/api/liquid/objects/media. */
export type MediaData = ImageMediaData | VideoMediaData | ExternalVideoMediaData

/** The data behind Shopify's `product` object, https://shopify.dev/docs/api/liquid/objects/product. */
export interface ProductData {
  id: number
  handle: string
  title: string
  /** HTML. */
  description?: string
  vendor?: string
  type?: string
  tags?: string[]
  images?: ImageData[]
  /** Defaults to the images as image media. */
  media?: MediaData[]
  /** Option names; Shopify's single-variant products have `['Title']`. */
  options?: string[]
  variants: VariantData[]
  created_at?: string
  published_at?: string
  metafields?: Metafields
}

/** The data behind Shopify's `collection` object, https://shopify.dev/docs/api/liquid/objects/collection. */
export interface CollectionData {
  id: number
  handle: string
  title: string
  description?: string
  image?: ImageData | null
  /** Product handles, in collection order. */
  products: string[]
  metafields?: Metafields
}

/** The data behind Shopify's `page` object, https://shopify.dev/docs/api/liquid/objects/page. */
export interface PageData {
  id: number
  handle: string
  title: string
  /** HTML. */
  content: string
  published_at?: string
  metafields?: Metafields
}

/** The data behind Shopify's `article` object, https://shopify.dev/docs/api/liquid/objects/article. */
export interface ArticleData {
  id: number
  handle: string
  title: string
  /** HTML. */
  content: string
  excerpt?: string
  author?: string
  published_at: string
  image?: ImageData | null
  tags?: string[]
}

/** The data behind Shopify's `blog` object, https://shopify.dev/docs/api/liquid/objects/blog. */
export interface BlogData {
  id: number
  handle: string
  title: string
  articles: ArticleData[]
}

/** The data behind Shopify's `link` object, https://shopify.dev/docs/api/liquid/objects/link. */
export interface LinkData {
  title: string
  url: string
  links?: LinkData[]
}

/** The data behind one menu of Shopify's `linklists` object, https://shopify.dev/docs/api/liquid/objects/linklist. */
export interface LinkListData {
  handle: string
  title: string
  links: LinkData[]
}

/** The cart as lines of products and variants by handle and id, https://shopify.dev/docs/api/liquid/objects/cart and https://shopify.dev/docs/api/liquid/objects/line_item. */
export interface CartData {
  items: Array<{ product_handle: string, variant_id: number, quantity: number }>
  note?: string
}

/** The data behind Shopify's `localization` object, https://shopify.dev/docs/api/liquid/objects/localization (`country`: https://shopify.dev/docs/api/liquid/objects/country, `language`: https://shopify.dev/docs/api/liquid/objects/language). */
export interface LocalizationData {
  country: { iso_code: string, name: string, currency: { iso_code: string, symbol: string, name?: string } }
  language: { iso_code: string, name: string, endonym_name?: string }
}

/**
 * The store a page renders against. Field names follow Shopify's Liquid objects (https://shopify.dev/docs/api/liquid/objects), so data moves into Liquid without renaming. Money amounts are integers in the currency's minor unit (cents), as in Liquid. Derived fields (URLs, price ranges, first available variant) are computed by `buildStore`.
 */
export interface StoreData {
  shop: ShopData
  products?: ProductData[]
  collections?: CollectionData[]
  pages?: PageData[]
  blogs?: BlogData[]
  linklists?: LinkListData[]
  /** Files a theme references as `shopify://shop_images/<name>` from `image_picker` settings. */
  images?: Record<string, ImageData>
  /** Files a theme references as `shopify://files/videos/<name>` from `video` settings. */
  videos?: Record<string, VideoMediaData>
  cart?: CartData
  customer?: Record<string, unknown> | null
  localization?: LocalizationData
}
