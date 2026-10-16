import type { ImageData } from '../types'
import type { CartState } from './cart'

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
  /** The storefront asks for a password on every page but `/password`, https://shopify.dev/docs/api/liquid/objects/shop (`shop.password_message`). */
  password_enabled?: boolean
  password_message?: string
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
  /** `continue` sells past zero stock; `deny` (the default) stops at it. https://shopify.dev/docs/api/liquid/objects/variant#variant-inventory_policy */
  inventory_policy?: 'deny' | 'continue'
  /** `shopify` when Shopify tracks the stock, nil when nothing does (the default). */
  inventory_management?: 'shopify' | null
  /** Grams. */
  weight?: number
  requires_shipping?: boolean
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
  /** Picks `templates/product.<suffix>.json`. https://shopify.dev/docs/storefronts/themes/architecture/templates/alternate-templates */
  template_suffix?: string | null
  /** The product can be bought only with a selling plan. https://shopify.dev/docs/api/liquid/objects/product#product-requires_selling_plan */
  requires_selling_plan?: boolean
  selling_plan_groups?: SellingPlanGroupData[]
  /** Place in the store's best-selling order, 1 first; products without one follow, newest first (what Shopify lists for a store with no sales, fixture `probe-collection-sort-best-selling`). */
  sales_rank?: number
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
  /** The collection's default sort order, one of the `sort_by` values on https://shopify.dev/docs/api/liquid/objects/collection; `manual` when omitted. */
  sort_order?: 'manual' | 'best-selling' | 'title-ascending' | 'title-descending' | 'price-ascending' | 'price-descending' | 'created-ascending' | 'created-descending'
  template_suffix?: string | null
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
  template_suffix?: string | null
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

/** The cart as lines of products and variants by handle and id, https://shopify.dev/docs/api/liquid/objects/cart and https://shopify.dev/docs/api/liquid/objects/line_item. The variant id names the line; the handle is not read. The lines carry no properties or selling plan, which `CartState` adds. */
export interface CartLinesData {
  items: Array<{ product_handle: string, variant_id: number, quantity: number }>
  note?: string
}

/** The cart of the store data: either lines by product handle and variant id (`CartLinesData`) or a visitor's cart as the storefront keeps it (`CartState`). */
export type CartData = CartLinesData | CartState

/** The data behind Shopify's `localization` object, https://shopify.dev/docs/api/liquid/objects/localization (`country`: https://shopify.dev/docs/api/liquid/objects/country, `language`: https://shopify.dev/docs/api/liquid/objects/language). */
export interface LocalizationData {
  country: { iso_code: string, name: string, currency: { iso_code: string, symbol: string, name?: string } }
  language: { iso_code: string, name: string, endonym_name?: string }
}

/** A country as `country_option_tags` and `all_country_option_tags` list it: the name its `<option>` shows and submits, and its subregions as `[value, label]` pairs for `data-provinces`, https://shopify.dev/docs/api/liquid/objects/country_option_tags (`[&quot;District of Columbia&quot;,&quot;Washington DC&quot;]` in its example). */
export interface CountryOptionData {
  name: string
  provinces?: Array<[string, string]>
}

/** A storefront filter the merchant set up in the admin. `attribute` is what it filters on, one of the kinds the storefront filtering guide lists (https://shopify.dev/docs/storefronts/themes/navigation-search/filtering/storefront-filtering): variant availability, variant price, product type, vendor, product tag, the variant option named by `option`, or the product metafield named by `metafield`. `label` is what shoppers see; `presentation` is how an option filter's values are shown (https://shopify.dev/docs/api/liquid/objects/filter#filter-presentation). */
export interface FilterData {
  attribute: 'availability' | 'price' | 'product_type' | 'vendor' | 'tag' | 'option' | 'metafield'
  option?: string
  /** For `attribute: 'metafield'`: the product metafield the filter reads (`filter.p.m.<namespace>.<key>`). */
  metafield?: { namespace: string, key: string }
  label?: string
  presentation?: 'image' | 'swatch' | 'text'
  /** How the selected values of a list filter combine, https://shopify.dev/docs/api/liquid/objects/filter#filter-operator: a product must have every one (`AND`) or any one (`OR`, the default). The parity store's tag filter is `AND` and its others `OR` (fixture `probe-collection-all`). */
  operator?: 'AND' | 'OR'
}

/** The data behind Shopify's `gift_card` object, https://shopify.dev/docs/api/liquid/objects/gift_card: a gift card issued to a customer, shown by the `gift_card` template. `balance` and `initial_value` are in the currency's subunit; `product_handle` and `variant_id` name the gift card product and variant in the store. */
export interface GiftCardData {
  balance: number
  initial_value: number
  code: string
  currency?: string
  enabled?: boolean
  expired?: boolean
  expires_on?: string | null
  /** The customer who is logged in; nobody when omitted. */
  customer?: CustomerData | null
  message?: string | null
  send_on?: string | null
  pass_url?: string | null
  product_handle?: string
  variant_id?: number
  properties?: Record<string, unknown> | null
  qr_identifier?: string | null
  recipient?: Record<string, unknown> | null
  template_suffix?: string | null
  url?: string | null
}

/** An address, https://shopify.dev/docs/api/liquid/objects/address: one of the customer's addresses, or an order's billing or shipping address. `country` is the country's name and `country_code` its ISO 3166-1 alpha-2 code; `province_code` leaves out the country code (`ON`, not `CA-ON`). A customer address needs its `id`, which its URL and its edit form use. */
export interface AddressData {
  id?: number
  first_name?: string | null
  last_name?: string | null
  company?: string | null
  address1: string
  address2?: string | null
  city: string
  province?: string | null
  province_code?: string | null
  country: string
  country_code: string
  zip: string
  phone?: string | null
}

/** A line of an order: a product and variant by handle and id, as in `CartData`, https://shopify.dev/docs/api/liquid/objects/line_item. */
export interface OrderLineData {
  product_handle: string
  variant_id: number
  quantity: number
}

/** A shipment of an order, https://shopify.dev/docs/api/liquid/objects/fulfillment. `line_items` names the lines it ships by their variant (the order's first line of that variant) and how many of each (the whole line when `quantity` is omitted). */
export interface FulfillmentData {
  created_at: string
  tracking_company?: string | null
  tracking_number?: string | null
  tracking_url?: string | null
  line_items: Array<{ variant_id: number, quantity?: number }>
}

/** A payment of an order, https://shopify.dev/docs/api/liquid/objects/transaction. `amount` is in the currency's subunit. */
export interface TransactionData {
  id: number
  amount: number
  kind: 'authorization' | 'capture' | 'sale' | 'void' | 'refund'
  status: 'success' | 'pending' | 'failure' | 'error'
  /** The handleized name of the payment provider (`shopify_payments`). */
  gateway: string
  /** Defaults to `gateway`. */
  gateway_display_name?: string
  created_at: string
  name?: string | null
  payment_details?: Record<string, unknown> | null
  receipt?: string | null
}

/** An order the customer placed, https://shopify.dev/docs/api/liquid/objects/order. Amounts are in the currency's subunit; the order's totals are computed from its lines, shipping methods and tax lines. */
export interface OrderData {
  id: number
  order_number: number
  /** Defaults to `#<order_number>`. */
  name?: string
  created_at: string
  email?: string | null
  phone?: string | null
  confirmation_number?: string | null
  line_items: OrderLineData[]
  billing_address?: AddressData | null
  shipping_address?: AddressData | null
  shipping_methods?: Array<{ title: string, price: number }>
  tax_lines?: Array<{ title: string, rate: number, price: number }>
  /** One of the values the order page lists (`paid`, `pending`, `refunded`…); `paid` when omitted. */
  financial_status?: string
  /** `fulfilled`, `partial` or `unfulfilled` from `fulfillments` when omitted. */
  fulfillment_status?: string
  fulfillments?: FulfillmentData[]
  transactions?: TransactionData[]
  total_refunded_amount?: number
  cancelled_at?: string | null
  cancel_reason?: 'customer' | 'declined' | 'fraud' | 'inventory' | 'staff' | 'other' | null
  note?: string | null
  tags?: string[]
  attributes?: Record<string, string>
}

/** The customer who is logged in, https://shopify.dev/docs/api/liquid/objects/customer, with their addresses and orders. Fields this type does not name are passed through as given. */
export interface CustomerData {
  id?: number
  email?: string
  first_name?: string
  last_name?: string
  phone?: string | null
  accepts_marketing?: boolean
  tax_exempt?: boolean
  tags?: string[]
  addresses?: AddressData[]
  /** The `id` of the default address among `addresses`; the first address when omitted. */
  default_address_id?: number
  /** The customer's orders, in the order `customer.orders` lists them. */
  orders?: OrderData[]
  metafields?: Metafields
  [key: string]: unknown
}

/** One price change of a selling plan, https://shopify.dev/docs/api/liquid/objects/selling_plan_price_adjustment. `value` is a percentage (10 = 10%) for `percentage` and an amount in the minor unit otherwise. `order_count` is how many orders it lasts; nil for the last adjustment. */
export interface SellingPlanPriceAdjustmentData {
  value_type: 'percentage' | 'fixed_amount' | 'price'
  value: number
  order_count?: number | null
}

/** https://shopify.dev/docs/api/liquid/objects/selling_plan. `options` are this plan's values for its group's options, in order. */
export interface SellingPlanData {
  id: number
  name: string
  description?: string | null
  options: string[]
  recurring_deliveries: boolean
  price_adjustments: SellingPlanPriceAdjustmentData[]
}

/** https://shopify.dev/docs/api/liquid/objects/selling_plan_group. It applies to every variant of its product unless `variant_ids` lists some. */
export interface SellingPlanGroupData {
  id: string
  name: string
  app_id?: string | null
  options: Array<{ name: string, values: string[] }>
  selling_plans: SellingPlanData[]
  variant_ids?: number[]
}

/** The products a discount applies to or counts: all of them, or the products and collections named by handle. */
export type DiscountItemsData = { all: true } | { products?: string[], collections?: string[] }

/** A percentage (10 = 10%) or an amount in the minor unit; `each` applies the amount to each item instead of once across them. */
export type DiscountValueData = { percentage: number } | { amount: number, each?: boolean }

interface DiscountBaseData {
  id: number
  title: string
  /** The code a shopper enters; an automatic discount has none. */
  code?: string
  combines_with?: { product?: boolean, order?: boolean, shipping?: boolean }
  /** At most one of the two, in the minor unit and in items. */
  minimum?: { subtotal?: number, quantity?: number }
}

export interface AmountOffProductsDiscountData extends DiscountBaseData {
  type: 'amount_off_products'
  value: DiscountValueData
  items: DiscountItemsData
  applies_on_one_time_purchase?: boolean
  applies_on_subscription?: boolean
}

export interface AmountOffOrderDiscountData extends DiscountBaseData {
  type: 'amount_off_order'
  value: DiscountValueData
}

export interface FreeShippingDiscountData extends DiscountBaseData {
  type: 'free_shipping'
  /** ISO country codes; every country when omitted. */
  countries?: string[]
  /** Rates above this price, in the minor unit, are not made free. */
  max_shipping_price?: number
}

export interface BuyXGetYDiscountData extends DiscountBaseData {
  type: 'buy_x_get_y'
  /** What the cart must hold: a quantity or an amount (minor unit) of `items`. */
  buys: { items: DiscountItemsData, quantity?: number, amount?: number }
  /** What it then gets: `quantity` of `items` at `value` off (`{ percentage: 100 }` is free). */
  gets: { items: DiscountItemsData, quantity: number, value: DiscountValueData }
  uses_per_order?: number
}

/** A discount of the store, by the four kinds the Admin API creates (basic, free shipping and Buy X Get Y, as codes or automatic). */
export type DiscountData = AmountOffProductsDiscountData | AmountOffOrderDiscountData | FreeShippingDiscountData | BuyXGetYDiscountData

/** One shipping rate of a zone, in the shop's currency and minor unit; weights in grams. A rate applies when the cart is inside every range it gives. */
export interface ShippingRateData {
  name: string
  price: number
  min_subtotal?: number
  max_subtotal?: number
  min_weight?: number
  max_weight?: number
}

/** A shipping zone: the countries it covers (every province, or the ones named by code), or every country no other zone covers. */
export interface ShippingZoneData {
  name: string
  countries: Array<{ code: string, provinces?: string[] }> | 'rest_of_world'
  rates: ShippingRateData[]
}

/** A market, https://shopify.dev/docs/api/liquid/objects/market. The primary market is served without a URL prefix; another market is served at `/<language>-<subfolder>` for each of its languages. `rate` converts the shop's currency into the market's (1 for the shop's own), `price_adjustment` is a percentage (-10 lowers prices by 10%), and `rounding` turns on Shopify's price rounding: `true` uses Shopify's value for the currency, a number is the value prices are rounded up to (Shopify's "Round up to the nearest {value}" setting, in major units: 1 rounds to whole units, 0.95 to x.95). */
export interface MarketData {
  handle: string
  name: string
  primary?: boolean
  countries: Array<{ iso_code: string, name: string }>
  currency: { iso_code: string, symbol: string, /** The currency's name (`Canadian Dollar`, https://shopify.dev/docs/api/liquid/objects/currency); its ISO code when omitted. */ name?: string, rate: number, rounding?: boolean | number, money_format?: string, money_with_currency_format?: string }
  price_adjustment?: number
  /** Shopify's market setting "Hide compare-at" for a market that holds a country of the European Economic Area (https://help.shopify.com/en/manual/compliance/legal/pricing-indication-directive): the market's variants have no compare-at price, in Liquid and in the Ajax API. False when omitted. */
  hide_compare_at_prices?: boolean
  /** ISO codes, the market's default language first. */
  languages: string[]
  subfolder?: string
}

/** A language the store is published in, https://shopify.dev/docs/api/liquid/objects/language. */
export interface LanguageData {
  iso_code: string
  name: string
  endonym_name: string
}

/** Translated fields of one resource; a field that is missing shows the default locale's value. */
export interface ResourceTranslations {
  title?: string
  description?: string
  content?: string
  excerpt?: string
}

/** Content translations by locale. Menus are by handle, each a list of link titles in the order the menu lists its links, children after their parent. */
export interface TranslationsData {
  [locale: string]: {
    shop?: { name?: string, description?: string }
    products?: Record<string, ResourceTranslations>
    collections?: Record<string, ResourceTranslations>
    pages?: Record<string, ResourceTranslations>
    /** By `<blog handle>/<article handle>`. */
    articles?: Record<string, ResourceTranslations>
    menus?: Record<string, string[]>
  }
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
  /** The storefront filters, in the order shoppers see them; none when omitted. */
  filters?: FilterData[]
  /** The gift card the `gift_card` template shows; none when omitted. */
  gift_card?: GiftCardData
  /** The countries in the store's shipping zones, in the order `country_option_tags` prints them; the store's country when omitted. */
  country_option_tags?: CountryOptionData[]
  /** Every country, in the order `all_country_option_tags` prints them; the `country_option_tags` countries when omitted. */
  all_country_option_tags?: CountryOptionData[]
  /** The store's discounts, codes and automatic ones; none when omitted. */
  discounts?: DiscountData[]
  shipping_zones?: ShippingZoneData[]
  /** The store's markets, the primary one first; one market of the shop's country and currency when omitted. */
  markets?: MarketData[]
  /** The languages the store is published in, the primary one first; the shop's locale alone when omitted. */
  languages?: LanguageData[]
  translations?: TranslationsData
}
