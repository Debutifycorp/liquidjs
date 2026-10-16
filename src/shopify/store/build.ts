import { ImageDrop } from '../objects/image'
import { HandleMap } from '../objects/handle-map'
import { DEFAULT_MONEY_FORMAT, DEFAULT_MONEY_WITH_CURRENCY_FORMAT } from '../state'
import type { ImageData } from '../types'
import { escapeHtml } from '../util/html'
import { buildFilters } from './filters'
import { buildLocalization, currencyOf, enabledCurrencies } from './markets'
import type { ViewCurrency } from './markets'
import { convert } from './pricing'
import { translateData } from './translate'
import { resolveView, viewKey, withoutPrefix, withPrefix } from './view'
import type { StoreView } from './view'
import type { AddressData, ArticleData, BlogData, CollectionData, CountryOptionData, CustomerData, FilterData, GiftCardData, LinkData, LinkListData, MediaData, OrderData, PageData, ProductData, StoreData, TransactionData, VariantData } from './types'

/**
 * Turns `StoreData` into the objects Liquid reads, computing what Shopify derives (URLs, price ranges, the first available variant, option values) so templates find every field they expect. Built objects are plain objects, readable under `ownPropertyOnly`; images become `ImageDrop`s and handle-keyed collections `HandleMap`s. Field lists follow https://shopify.dev/docs/api/liquid/objects, object by object as each builder cites.
 */
export type LiquidObject = Record<string, unknown>

export interface StoreObjects {
  shop: LiquidObject
  products: HandleMap<LiquidObject>
  collections: HandleMap<LiquidObject>
  pages: HandleMap<LiquidObject>
  blogs: HandleMap<LiquidObject>
  /** Articles by `<blog handle>/<article handle>`, the key https://shopify.dev/docs/api/liquid/objects/articles shows (`articles['blog/article']`). */
  articles: HandleMap<LiquidObject>
  images: HandleMap<ImageDrop>
  videos: Record<string, LiquidObject>
  linklists: LinkListData[]
  cart: LiquidObject
  customer: LiquidObject | null
  localization: LiquidObject
  /** The currency of the view's market, in which prices print (`state.money`) and the cart is held. */
  currency: ViewCurrency
  country_option_tags: string
  all_country_option_tags: string
  gift_card: LiquidObject | null
  /** The store data's storefront filters, which the search builds its `filters` from. */
  storefrontFilters: FilterData[]
}

const image = (data: ImageData | null | undefined) => data ? new ImageDrop(data) : null
const unique = <T>(items: T[]) => [...new Set(items)]

/** A field Liquid can read but `json` and `for` do not walk, for back references such as `variant.product`. */
function hidden (target: LiquidObject, key: string, value: unknown) {
  Object.defineProperty(target, key, { value, enumerable: false })
}

/**
 * Makes `object` print as its handle: https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings says of the `product`, `collection`, `page`, `blog` and `article` settings that "outputting the setting directly will return the object's handle". Applied to the object itself, so a setting returns the store's own object and `==`, `contains` and the filters that take the object work as on any other; shopify.dev does not say what the object prints elsewhere (a `product_list` element, `{{ product }}` on a product page), so the same handle is printed there too, on the confirm-on-a-development-store list. The `toString` is not enumerable, so `json`, `inspect` and `for` do not see it.
 */
export function printsHandle (object: LiquidObject): LiquidObject {
  Object.defineProperty(object, 'toString', { value: () => String(object.handle ?? ''), enumerable: false })
  return object
}

/** Product media: images (https://shopify.dev/docs/api/liquid/objects/media), videos (https://shopify.dev/docs/api/liquid/objects/video) and external videos (https://shopify.dev/docs/api/liquid/objects/external_video). Only media images carry a `preview_image`, https://shopify.dev/docs/api/liquid/objects/image#image-preview_image. `index` is the media's place in `product.media`; it becomes the media's `position`, counted from 1 (https://shopify.dev/docs/api/liquid/objects/media#media-position). That base is not pinned: the media page and shopify.dev's image page (https://shopify.dev/docs/api/liquid/objects/image#image-position) both show `1` in their example for the first entry but neither states the base, so it is on the confirm-on-a-development-store list. Media from anywhere else has no position. */
function buildMedia (media: MediaData, index?: number): unknown {
  const position = index === undefined ? null : index + 1
  if (media.media_type === 'image') return new ImageDrop(media, true, position)
  return { ...media, alt: media.alt ?? '', preview_image: image(media.preview_image), position }
}

/** Whether two image entries are the same image: matched by `id` when both have one, by `src` otherwise. */
const sameImage = (a: ImageData, b: ImageData) => a.id != null && b.id != null ? a.id === b.id : a.src === b.src

/** The place, counted from 1, of an image in a list of a product's images or media (a media entry that is not an image keeps its slot but never matches), or nil when the list does not hold it. The counting base is the unpinned one of `buildMedia`. */
function positionIn (list: Array<ImageData | { media_type: string }>, target: ImageData): number | null {
  const index = list.findIndex(item => 'src' in item && sameImage(item, target))
  return index < 0 ? null : index + 1
}

/** https://shopify.dev/docs/api/liquid/objects/variant. `url` carries `?variant=<id>` as that page documents. `unit_price_measurement` and `selling_plan_allocations` are left empty and `quantity_rule` holds Shopify's defaults; shopify.dev documents the fields but this layer has no data for them. `featured_image` and `featured_media` are the product's own image, so they carry the `position` of the matching entry in `product.images` and `product.media` (nil when the product does not list that image); shopify.dev does not say so, and it goes on the confirm-on-a-development-store list with the counting base. `price` and `compare_at_price` are in the view's currency when `currency` is given (`convert`: the market's rate, price adjustment and rounding, https://help.shopify.com/en/manual/international/pricing/exchange-rates), the dataset's shop-currency amounts otherwise; a variant without a compare-at price keeps nil. A market that hides compare-at prices (`ViewCurrency.hide_compare_at_prices`, Shopify's "Hide compare-at" setting, https://help.shopify.com/en/manual/compliance/legal/pricing-indication-directive) gives its variants none: nil, as the parity store prints the hoodie's on-sale variant in the Europe market (fixture `probe-product-en-eu-hoodie`). */
function buildVariant (variant: VariantData, productUrl: string, productImages: ImageData[], productMedia: MediaData[], currency?: ViewCurrency): LiquidObject {
  const options = [variant.option1, variant.option2, variant.option3].filter((option): option is string => typeof option === 'string')
  const featured = variant.image ? new ImageDrop(variant.image, false, positionIn(productImages, variant.image)) : null
  return {
    id: variant.id,
    title: variant.title,
    price: currency ? convert(variant.price, currency) : variant.price,
    compare_at_price: variant.compare_at_price == null || currency?.hide_compare_at_prices ? null : currency ? convert(variant.compare_at_price, currency) : variant.compare_at_price,
    available: variant.available,
    sku: variant.sku ?? '',
    option1: variant.option1 ?? null,
    option2: variant.option2 ?? null,
    option3: variant.option3 ?? null,
    options,
    url: `${productUrl}?variant=${variant.id}`,
    image: featured,
    featured_image: featured,
    featured_media: variant.image ? new ImageDrop(variant.image, true, positionIn(productMedia, variant.image)) : null,
    inventory_quantity: variant.inventory_quantity ?? (variant.available ? 1 : 0),
    inventory_management: null,
    inventory_policy: 'deny',
    requires_shipping: true,
    taxable: true,
    weight: 0,
    unit_price_measurement: null,
    selling_plan_allocations: [],
    quantity_rule: { min: 1, max: null, increment: 1 }
  }
}

/**
 * https://shopify.dev/docs/api/liquid/objects/product. The product's and its variants' URLs sit under `prefix` (the view's base path and locale prefix, as the parity store prints them, fixture `probe-page-fr-ca`). `price` is the lowest variant price and `compare_at_price` the lowest variant compare-at price, as that page documents them; `compare_at_price` is nil when no variant has one (shopify.dev does not pin that case, so dividing by it raises "divided by 0" as Ruby does). `first_available_variant`, `selected_or_first_available_variant` (no `?variant=` is known here, so the first available one), `options_with_values` and `has_only_default_variant` follow the same page. Selling plans are left out. Every price field is in the view's currency when `currency` is given, because the variants' are (`buildVariant`) and the product's are the lowest and highest of them; the parity store's product-level `compare_at_price` is the lowest converted variant compare-at price in the markets that show them (fixtures `probe-product-default` and `probe-product-en-ca`: 110.00 USD and 149.00 CAD, with one variant on sale) and nil in one that hides them, with `compare_at_price_min` and `compare_at_price_max` 0 as for any product without one (fixtures `probe-product-en-eu-hoodie` and `ajax-product-js`).
 */
export function buildProduct (data: ProductData, prefix = '', currency?: ViewCurrency): LiquidObject {
  const url = withPrefix(prefix, `/products/${data.handle}`)
  // The image `position` counts from 1, which shopify.dev's image page does not state (its example shows 1 for the first image): unpinned, on the confirm-on-a-development-store list.
  const images = (data.images ?? []).map((img, i) => new ImageDrop(img, false, i + 1))
  const mediaData: MediaData[] = data.media ?? (data.images ?? []).map(img => ({ ...img, media_type: 'image' as const }))
  const media = mediaData.map(buildMedia)
  const variants = data.variants.map(variant => buildVariant(variant, url, data.images ?? [], mediaData, currency))
  const options = data.options ?? ['Title']
  const prices = variants.map(variant => variant.price as number)
  const compares = variants.map(variant => variant.compare_at_price as number | null).filter((price): price is number => typeof price === 'number')
  const firstAvailable = variants.find(variant => variant.available) ?? variants[0] ?? null
  const optionsWithValues = options.map((name, i) => ({
    name,
    position: i + 1,
    values: unique(variants.map(variant => (variant.options as string[])[i]).filter(value => value !== undefined)),
    selected_value: firstAvailable ? (firstAvailable.options as string[])[i] ?? null : null
  }))
  const product: LiquidObject = {
    id: data.id,
    handle: data.handle,
    title: data.title,
    description: data.description ?? '',
    content: data.description ?? '',
    vendor: data.vendor ?? '',
    type: data.type ?? '',
    tags: data.tags ?? [],
    url,
    available: variants.some(variant => variant.available),
    price: prices.length ? Math.min(...prices) : 0,
    price_min: prices.length ? Math.min(...prices) : 0,
    price_max: prices.length ? Math.max(...prices) : 0,
    price_varies: unique(prices).length > 1,
    compare_at_price: compares.length ? Math.min(...compares) : null,
    compare_at_price_min: compares.length ? Math.min(...compares) : 0,
    compare_at_price_max: compares.length ? Math.max(...compares) : 0,
    compare_at_price_varies: unique(compares).length > 1,
    images,
    featured_image: images[0] ?? null,
    media,
    featured_media: media[0] ?? null,
    options,
    options_with_values: optionsWithValues,
    options_by_name: Object.fromEntries(optionsWithValues.map(option => [option.name.toLowerCase(), option])),
    has_only_default_variant: variants.length === 1 && options.length === 1 && options[0] === 'Title',
    variants,
    first_available_variant: firstAvailable,
    selected_variant: null,
    selected_or_first_available_variant: firstAvailable,
    requires_selling_plan: false,
    selling_plan_groups: [],
    'gift_card?': false,
    'quantity_price_breaks_configured?': false,
    template_suffix: null,
    created_at: data.created_at ?? null,
    published_at: data.published_at ?? null,
    metafields: data.metafields ?? {}
  }
  for (const variant of variants) hidden(variant, 'product', product)
  return printsHandle(product)
}

/** https://shopify.dev/docs/api/liquid/objects/collection, at its URL under `prefix`. Filtering, tags and sorting are not applied: `products` is the collection's product list as given, `filters` are the store's storefront filters over those products (`buildFilters`), `tags` is empty and `sort_options` lists Shopify's standard options. */
function buildCollection (data: CollectionData, products: HandleMap<LiquidObject>, filters: FilterData[] | undefined, prefix: string): LiquidObject {
  const items = data.products.map(handle => HandleMap.get(products, handle)).filter((product): product is LiquidObject => !!product)
  const collect = (key: string) => unique(items.flatMap(product => product[key] as string | string[]).filter(Boolean)).sort()
  const own = image(data.image)
  const url = withPrefix(prefix, `/collections/${data.handle}`)
  return printsHandle({
    id: data.id,
    handle: data.handle,
    title: data.title,
    description: data.description ?? '',
    url,
    image: own,
    featured_image: own ?? items[0]?.featured_image ?? null,
    products: items,
    products_count: items.length,
    all_products_count: items.length,
    all_tags: collect('tags'),
    all_types: collect('type'),
    all_vendors: collect('vendor'),
    tags: [],
    filters: buildFilters(filters, items, url),
    sort_by: null,
    default_sort_by: 'manual',
    sort_options: [
      { name: 'Featured', value: 'manual' },
      { name: 'Best selling', value: 'best-selling' },
      { name: 'Alphabetically, A-Z', value: 'title-ascending' },
      { name: 'Alphabetically, Z-A', value: 'title-descending' },
      { name: 'Price, low to high', value: 'price-ascending' },
      { name: 'Price, high to low', value: 'price-descending' },
      { name: 'Date, old to new', value: 'created-ascending' },
      { name: 'Date, new to old', value: 'created-descending' }
    ],
    template_suffix: null,
    metafields: data.metafields ?? {}
  })
}

/** https://shopify.dev/docs/api/liquid/objects/page, at its URL under `prefix`. */
function buildPage (data: PageData, prefix: string): LiquidObject {
  return printsHandle({ ...data, url: withPrefix(prefix, `/pages/${data.handle}`), template_suffix: null, published_at: data.published_at ?? null, metafields: data.metafields ?? {} })
}

/** https://shopify.dev/docs/api/liquid/objects/article, at its URL under `prefix`. Comments are not modelled: `comments` is empty and `comments_enabled?` false. */
function buildArticle (data: ArticleData, blogHandle: string, prefix: string): LiquidObject {
  const author = data.author ?? ''
  return printsHandle({
    id: data.id,
    handle: data.handle,
    title: data.title,
    content: data.content,
    excerpt: data.excerpt ?? '',
    excerpt_or_content: data.excerpt || data.content,
    url: withPrefix(prefix, `/blogs/${blogHandle}/${data.handle}`),
    author,
    user: { name: author, first_name: author.split(' ')[0] ?? '', last_name: author.split(' ').slice(1).join(' ') },
    published_at: data.published_at,
    created_at: data.published_at,
    image: image(data.image),
    tags: data.tags ?? [],
    comments: [],
    comments_count: 0,
    'comments_enabled?': false,
    metafields: {}
  })
}

/** https://shopify.dev/docs/api/liquid/objects/blog, at its URL under `prefix`. Comments are not modelled: `comments_enabled?` and `moderated?` are false. */
function buildBlog (data: BlogData, prefix: string): LiquidObject {
  const articles = data.articles.map(article => buildArticle(article, data.handle, prefix))
  return printsHandle({
    id: data.id,
    handle: data.handle,
    title: data.title,
    url: withPrefix(prefix, `/blogs/${data.handle}`),
    articles,
    articles_count: articles.length,
    all_tags: unique(data.articles.flatMap(article => article.tags ?? [])).sort(),
    tags: [],
    'comments_enabled?': false,
    'moderated?': false,
    metafields: {}
  })
}

/** A URL without its query string and fragment: `link.current` and `link.child_current` "ignore URL parameters". https://shopify.dev/docs/api/liquid/objects/link */
function stripQuery (url: string): string {
  return url.split(/[?#]/)[0]
}

/** The path `link.current` compares: a product reached through a collection (`/collections/x/products/y`) is "treated as equal to a standard product URL for the same product". https://shopify.dev/docs/api/liquid/objects/link */
function linkPath (url: string): string {
  return stripQuery(url).replace(/^\/collections\/[^/]+(\/products\/)/, '$1')
}

/**
 * The `link.type` of a URL. shopify.dev lists the types and what each points at (`frontpage_link`, `catalog_link`, `collections_link`, `collection_link`, `product_link`, `page_link`, `blog_link`, `article_link`, `search_link`, `policy_link`, `customer_account_page_link`, `http_link` for "an external web page, or a product type or vendor collection", `metaobject_link`) but not the URL each one is chosen from, so the patterns here are Shopify's storefront paths read from those descriptions. `metaobject_link` is never produced: a metaobject page has no URL form in the store data. https://shopify.dev/docs/api/liquid/objects/link
 */
function linkType (url: string): string {
  const path = linkPath(url)
  if (path === '/') return 'frontpage_link'
  if (path === '/collections') return 'collections_link'
  if (path === '/collections/all') return 'catalog_link'
  if (path === '/collections/vendors' || path === '/collections/types') return 'http_link'
  if (/^\/collections\/[^/]+$/.test(path)) return 'collection_link'
  if (/^\/products\/[^/]+$/.test(path)) return 'product_link'
  if (/^\/pages\/[^/]+$/.test(path)) return 'page_link'
  if (/^\/blogs\/[^/]+$/.test(path)) return 'blog_link'
  if (/^\/blogs\/[^/]+\/[^/]+$/.test(path)) return 'article_link'
  if (path === '/search') return 'search_link'
  if (/^\/policies\/[^/]+$/.test(path)) return 'policy_link'
  if (path === '/account' || path.startsWith('/account/')) return 'customer_account_page_link'
  return 'http_link'
}

/**
 * One menu link, https://shopify.dev/docs/api/liquid/objects/link. Its `url` sits under `prefix` (`withPrefix`), as a link of the parity store's menu does under a locale prefix (fixture `probe-page-fr-ca`); `type` and the comparisons below read the store's own path, without the prefix, and so does the request `path`, which carries it. `current` is true when the link's path is the request path and `active` when it is the path or a parent of it ("matches, or contains, the link's url"); both ignore query strings, `current` also reads a product in a collection as the product, and `child_active` and `child_current` look at the children. `levels` counts the nested levels below the link. `object` is always nil: the page says it is the article, blog, collection, metaobject, page, policy or product the link points at, which this layer does not resolve from a URL. `handle` and `data_sharing_opt_out_icon` are not built.
 */
function buildLink (data: LinkData, path: string, prefix: string): LiquidObject {
  const links = (data.links ?? []).map(child => buildLink(child, path, prefix))
  const here = withoutPrefix(prefix, path)
  const current = linkPath(data.url) === linkPath(here)
  const target = stripQuery(data.url)
  const active = current || (target !== '/' && stripQuery(here).startsWith(`${target}/`))
  return {
    title: data.title,
    url: withPrefix(prefix, data.url),
    type: linkType(data.url),
    active,
    current,
    child_active: links.some(link => link.active || link.child_active),
    child_current: links.some(link => link.current || link.child_current),
    levels: links.length ? 1 + Math.max(...links.map(link => link.levels as number)) : 0,
    links,
    object: null
  }
}

/** The `linklists` object for one request path, https://shopify.dev/docs/api/liquid/objects/linklists (each menu is https://shopify.dev/docs/api/liquid/objects/linklist), with its links under `prefix`. */
export function buildLinklists (lists: LinkListData[], path: string, prefix = ''): HandleMap<LiquidObject> {
  return new HandleMap(lists.map(list => {
    const links = list.links.map(link => buildLink(link, path, prefix))
    return [list.handle, { handle: list.handle, title: list.title, links, levels: links.length ? 1 + Math.max(...links.map(link => link.levels as number)) : 0 }]
  }))
}

/** The line items of `lines`, https://shopify.dev/docs/api/liquid/objects/line_item, for a cart or an order. Lines naming a product or variant the store does not have are skipped. No discounts, properties or selling plans are applied, so original, final and line prices are equal. */
function buildLineItems (lines: Array<{ product_handle: string, variant_id: number, quantity: number }>, products: HandleMap<LiquidObject>): LiquidObject[] {
  const items: LiquidObject[] = []
  for (const line of lines) {
    const product = HandleMap.get(products, line.product_handle)
    const variant = (product?.variants as LiquidObject[] | undefined)?.find(item => item.id === line.variant_id)
    if (!product || !variant) continue
    const price = variant.price as number
    items.push({
      // `index` (0-based) is not a property of https://shopify.dev/docs/api/liquid/objects/line_item, but themes read it as a row number (`item.index | plus: 1`), so it is built; the page does not pin its base
      index: items.length,
      id: variant.id,
      key: `${variant.id}:${items.length + 1}`,
      quantity: line.quantity,
      product,
      variant,
      product_id: product.id,
      variant_id: variant.id,
      title: variant.title === 'Default Title' ? product.title : `${product.title} - ${variant.title}`,
      product_title: product.title,
      variant_title: variant.title === 'Default Title' ? null : variant.title,
      url: variant.url,
      image: variant.featured_image ?? product.featured_image,
      sku: variant.sku,
      vendor: product.vendor,
      price,
      original_price: price,
      final_price: price,
      line_price: price * line.quantity,
      original_line_price: price * line.quantity,
      final_line_price: price * line.quantity,
      options_with_values: (product.options as string[]).map((name, i) => ({ name, value: (variant.options as string[])[i] ?? null })),
      properties: {},
      discount_allocations: [],
      line_level_discount_allocations: [],
      unit_price_measurement: null,
      selling_plan_allocation: null,
      requires_shipping: true,
      gift_card: false
    })
  }
  return items
}

/** https://shopify.dev/docs/api/liquid/objects/cart, with its line items (`buildLineItems`). */
function buildCart (data: StoreData, products: HandleMap<LiquidObject>, currency: string): LiquidObject {
  const items = buildLineItems(data.cart?.items ?? [], products)
  const total = items.reduce((sum, item) => sum + (item.final_line_price as number), 0)
  return {
    items,
    item_count: items.reduce((sum, item) => sum + (item.quantity as number), 0),
    total_price: total,
    items_subtotal_price: total,
    original_total_price: total,
    checkout_charge_amount: total,
    total_discount: 0,
    total_weight: 0,
    currency: { iso_code: currency },
    note: data.cart?.note ?? null,
    attributes: {},
    requires_shipping: items.length > 0,
    cart_level_discount_applications: [],
    discount_applications: [],
    taxes_included: false,
    duties_included: false,
    'empty?': items.length === 0
  }
}

/** The `<option>` tags of https://shopify.dev/docs/api/liquid/objects/country_option_tags, one a line as its example prints them: a `---` option first, then each country, its subregions JSON-encoded in `data-provinces` (an empty array when it has none). The page shows no example for https://shopify.dev/docs/api/liquid/objects/all_country_option_tags, which is printed the same way; whether it starts with `---` too is not pinned. */
function countryOptionTags (countries: CountryOptionData[]): string {
  const option = (name: string, provinces: Array<[string, string]>) => `<option value="${escapeHtml(name)}" data-provinces="${escapeHtml(JSON.stringify(provinces))}">${escapeHtml(name)}</option>`
  return [option('---', []), ...countries.map(country => option(country.name, country.provinces ?? []))].join('\n')
}

/** https://shopify.dev/docs/api/liquid/objects/gift_card, with the properties that page lists: `last_four_characters` is the code's last four characters (spaces left out, as its example's code `WCGX 7X97 K9HJ DFR8` ends `DFR8`), `currency` defaults to the shop's, `enabled` to true, `expired` to false, `product` and `variant` are the store's own objects, and every other property the data leaves out is nil. */
function buildGiftCard (data: GiftCardData, products: HandleMap<LiquidObject>, currency: string): LiquidObject {
  const product = data.product_handle ? HandleMap.get(products, data.product_handle) ?? null : null
  const variant = product && data.variant_id !== undefined ? (product.variants as LiquidObject[]).find(entry => entry.id === data.variant_id) ?? null : null
  return {
    balance: data.balance,
    initial_value: data.initial_value,
    code: data.code,
    last_four_characters: data.code.replace(/\s+/g, '').slice(-4),
    currency: data.currency ?? currency,
    enabled: data.enabled ?? true,
    expired: data.expired ?? false,
    expires_on: data.expires_on ?? null,
    customer: data.customer ?? null,
    message: data.message ?? null,
    send_on: data.send_on ?? null,
    pass_url: data.pass_url ?? null,
    product,
    variant,
    properties: data.properties ?? null,
    qr_identifier: data.qr_identifier ?? null,
    recipient: data.recipient ?? null,
    template_suffix: data.template_suffix ?? null,
    url: data.url ?? null
  }
}

/** A status value as English text, its first letter upper-case and `_` as a space (`partially_paid` is `Partially paid`), for the `_label` properties, which shopify.dev describes as the localized value and shows only as `Paid`, `Partial` and `Success` in its examples. */
const statusLabel = (value: string) => value ? value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ') : value

/** The `cancel_reason_label` of each `cancel_reason`: the description the order page gives each value. https://shopify.dev/docs/api/liquid/objects/order#order-cancel_reason */
const CANCEL_REASON_LABELS: Record<string, string> = { customer: 'Customer changed/cancelled order', declined: 'Payment declined', fraud: 'Fraudulent order', inventory: 'Items unavailable', staff: 'Staff error', other: 'Other' }

/** https://shopify.dev/docs/api/liquid/objects/address. `name` joins the first and last names, `street` the two lines, and `summary` the name, lines, city, province and country, as the page lists them (its example joins them with `, `). `country` is a country object (https://shopify.dev/docs/api/liquid/objects/country) that prints its name, as that page says a country does when referenced directly. `url` is `/account/addresses/<id>` for a customer address, as the page's example shows, under `prefix` like the account routes, and nil for an order's address ("This only applies to customer addresses"). */
function buildAddress (data: AddressData, ofCustomer: boolean, prefix: string): LiquidObject {
  const name = [data.first_name, data.last_name].filter(Boolean).join(' ')
  const street = [data.address1, data.address2].filter(Boolean).join(', ')
  const country: LiquidObject = { iso_code: data.country_code, name: data.country }
  Object.defineProperty(country, 'toString', { value: () => data.country, enumerable: false })
  return {
    id: data.id ?? null,
    first_name: data.first_name ?? null,
    last_name: data.last_name ?? null,
    name,
    company: data.company ?? null,
    address1: data.address1,
    address2: data.address2 ?? null,
    street,
    city: data.city,
    province: data.province ?? null,
    province_code: data.province_code ?? null,
    country,
    country_code: data.country_code,
    zip: data.zip,
    phone: data.phone ?? null,
    summary: [name, street, data.city, data.province, data.country].filter(Boolean).join(', '),
    url: ofCustomer && data.id !== undefined ? withPrefix(prefix, `/account/addresses/${data.id}`) : null
  }
}

/** https://shopify.dev/docs/api/liquid/objects/transaction. */
function buildTransaction (data: TransactionData): LiquidObject {
  return {
    id: data.id,
    amount: data.amount,
    kind: data.kind,
    status: data.status,
    status_label: statusLabel(data.status),
    gateway: data.gateway,
    gateway_display_name: data.gateway_display_name ?? data.gateway,
    created_at: data.created_at,
    name: data.name ?? null,
    payment_details: data.payment_details ?? null,
    receipt: data.receipt ?? null,
    buyer_pending_payment_instructions: [],
    buyer_pending_payment_notice: null,
    'show_buyer_pending_payment_instructions?': false
  }
}

/**
 * https://shopify.dev/docs/api/liquid/objects/order, with its line items (https://shopify.dev/docs/api/liquid/objects/line_item), addresses, shipping methods (https://shopify.dev/docs/api/liquid/objects/shipping_method), tax lines (https://shopify.dev/docs/api/liquid/objects/tax_line), fulfillments (https://shopify.dev/docs/api/liquid/objects/fulfillment) and transactions. No discounts or duties are modelled: `line_items_subtotal_price` and `subtotal_price` are the sum of the lines, `total_price` adds the shipping and tax prices to it, `total_net_amount` is `total_price` minus `total_refunded_amount`, as the page defines it, and `total_duties` is nil ("If there are no duties"). Each line item carries the `fulfillment` that ships it (the first one that lists it) and its `successfully_fulfilled_quantity`. `tags` are sorted, as the page says. `customer_url` is `/account/orders/<id>` under `prefix`, and `order_status_url` and `customer_order_url` are nil: the page's examples are URLs with tokens a store issues.
 */
function buildOrder (data: OrderData, products: HandleMap<LiquidObject>, prefix: string): LiquidObject {
  const lineItems = buildLineItems(data.line_items, products)
  const fulfilled = new Map<LiquidObject, number>()
  const fulfillments = (data.fulfillments ?? []).map(entry => {
    const lines = entry.line_items.flatMap(line => {
      const item = lineItems.find(candidate => candidate.variant_id === line.variant_id)
      if (!item) return []
      const quantity = line.quantity ?? item.quantity as number
      fulfilled.set(item, (fulfilled.get(item) ?? 0) + quantity)
      const part: LiquidObject = { quantity }
      hidden(part, 'line_item', item)
      return [part]
    })
    const fulfillment: LiquidObject = {
      created_at: entry.created_at,
      fulfillment_line_items: lines,
      item_count: lines.reduce((sum, line) => sum + (line.quantity as number), 0),
      tracking_company: entry.tracking_company ?? null,
      tracking_number: entry.tracking_number ?? null,
      tracking_numbers: entry.tracking_number ? [entry.tracking_number] : [],
      tracking_url: entry.tracking_url ?? null
    }
    for (const line of lines) {
      const item = line.line_item as LiquidObject
      if (!item.fulfillment) item.fulfillment = fulfillment
    }
    return fulfillment
  })
  for (const item of lineItems) {
    item.fulfillment ??= null
    item.successfully_fulfilled_quantity = Math.min(item.quantity as number, fulfilled.get(item) ?? 0)
    item.fulfillment_service = 'manual'
  }
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)
  const itemCount = sum(lineItems.map(item => item.quantity as number))
  const shippedCount = sum(lineItems.map(item => item.successfully_fulfilled_quantity as number))
  const fulfillmentStatus = data.fulfillment_status ?? (itemCount > 0 && shippedCount === itemCount ? 'fulfilled' : shippedCount > 0 ? 'partial' : 'unfulfilled')
  const financialStatus = data.financial_status ?? 'paid'
  const shippingMethods = (data.shipping_methods ?? []).map(method => ({ title: method.title, price: method.price, original_price: method.price, price_with_discounts: method.price, handle: null, id: null, tax_lines: [], discount_allocations: [] }))
  const taxLines = (data.tax_lines ?? []).map(line => ({ title: line.title, rate: line.rate, rate_percentage: Math.round(line.rate * 10000) / 100, price: line.price }))
  const subtotal = sum(lineItems.map(item => item.final_line_price as number))
  const shippingPrice = sum(shippingMethods.map(method => method.price))
  const taxPrice = sum(taxLines.map(line => line.price))
  const totalPrice = subtotal + shippingPrice + taxPrice
  const refunded = data.total_refunded_amount ?? 0
  return {
    id: data.id,
    name: data.name ?? `#${data.order_number}`,
    order_number: data.order_number,
    confirmation_number: data.confirmation_number ?? null,
    created_at: data.created_at,
    email: data.email ?? null,
    phone: data.phone ?? null,
    customer_url: withPrefix(prefix, `/account/orders/${data.id}`),
    customer_order_url: null,
    order_status_url: null,
    line_items: lineItems,
    subtotal_line_items: lineItems,
    item_count: itemCount,
    billing_address: data.billing_address ? buildAddress(data.billing_address, false, prefix) : null,
    shipping_address: data.shipping_address ? buildAddress(data.shipping_address, false, prefix) : null,
    'pickup_in_store?': false,
    shipping_methods: shippingMethods,
    shipping_price: shippingPrice,
    tax_lines: taxLines,
    tax_price: taxPrice,
    line_items_subtotal_price: subtotal,
    subtotal_price: subtotal,
    total_discounts: 0,
    total_duties: null,
    total_price: totalPrice,
    total_refunded_amount: refunded,
    total_net_amount: totalPrice - refunded,
    cart_level_discount_applications: [],
    discount_applications: [],
    financial_status: financialStatus,
    financial_status_label: statusLabel(financialStatus),
    fulfillment_status: fulfillmentStatus,
    fulfillment_status_label: statusLabel(fulfillmentStatus),
    fulfillments,
    transactions: (data.transactions ?? []).map(buildTransaction),
    cancelled: !!data.cancelled_at,
    cancelled_at: data.cancelled_at ?? null,
    cancel_reason: data.cancel_reason ?? null,
    cancel_reason_label: data.cancel_reason ? CANCEL_REASON_LABELS[data.cancel_reason] ?? statusLabel(data.cancel_reason) : null,
    note: data.note ?? null,
    tags: [...(data.tags ?? [])].sort(),
    attributes: data.attributes ?? {},
    metafields: {}
  }
}

/**
 * https://shopify.dev/docs/api/liquid/objects/customer, built from `data`, whose other fields are kept as given. `name` joins the first and last names; `addresses` are address objects (`buildAddress`) with `addresses_count`, and `default_address` is the one `default_address_id` names, the first address without it, or nil without addresses; `orders` are order objects (`buildOrder`) in the order the data gives them, each with this customer as its `customer`, with `orders_count`, `last_order` (the order created last) and `total_spent` (the sum of the orders' `total_net_amount`). The customer is not B2B, has an account, has no avatar, saved payment methods, store credit or company locations, and accepts marketing and is tax exempt only when the data says so.
 */
function buildCustomer (data: CustomerData, products: HandleMap<LiquidObject>, prefix: string): LiquidObject {
  const { addresses: addressData, orders: orderData, default_address_id: defaultId, ...rest } = data
  const addresses = (addressData ?? []).map(address => buildAddress(address, true, prefix))
  const orders = (orderData ?? []).map(order => buildOrder(order, products, prefix))
  const created = (order: LiquidObject) => Date.parse(String(order.created_at)) || 0
  const firstName = data.first_name ?? ''
  const lastName = data.last_name ?? ''
  const customer: LiquidObject = {
    ...rest,
    id: data.id ?? null,
    email: data.email ?? null,
    first_name: firstName,
    last_name: lastName,
    name: [firstName, lastName].filter(Boolean).join(' '),
    phone: data.phone ?? null,
    accepts_marketing: data.accepts_marketing ?? false,
    tax_exempt: data.tax_exempt ?? false,
    tags: data.tags ?? [],
    'b2b?': false,
    has_account: true,
    'has_avatar?': false,
    addresses,
    addresses_count: addresses.length,
    default_address: addresses.find(address => defaultId !== undefined && address.id === defaultId) ?? addresses[0] ?? null,
    orders,
    orders_count: orders.length,
    last_order: orders.reduce<LiquidObject | null>((last, order) => !last || created(order) >= created(last) ? order : last, null),
    total_spent: orders.reduce((sum, order) => sum + (order.total_net_amount as number), 0),
    payment_methods: [],
    company_available_locations: [],
    company_available_locations_count: 0,
    current_company: null,
    current_location: null,
    store_credit_account: null,
    metafields: data.metafields ?? {}
  }
  for (const order of orders) hidden(order, 'customer', customer)
  return customer
}

const built = new WeakMap<StoreData, Map<string, StoreObjects>>()

/** The most views kept for one `data` object; the least recently used one is dropped past it. A store served under many base paths (one a preview session) would otherwise grow without bound. */
const MAX_VIEWS = 64

/**
 * The Liquid objects for `data` in `view`, built once per `data` object and view and reused, the 64 most recently used views of a `data` object kept. Without a view it is the one a request that says nothing renders in (`resolveView`): the primary market and language, no prefix. Every resource URL sits under the view's prefix (the base path, then the locale prefix), as the parity store prints them under a locale prefix (fixture `probe-page-fr-ca`). `shop` follows https://shopify.dev/docs/api/liquid/objects/shop; `shop.url` and `shop.secure_url` are `https://<domain>`, as shopify.dev gives no other form for a store without its own scheme.
 */
export function buildStore (data: StoreData, view?: StoreView): StoreObjects {
  const resolved = view ?? resolveView(data, {})
  const key = viewKey(resolved)
  let views = built.get(data)
  if (!views) {
    views = new Map()
    built.set(data, views)
  }
  const cached = views.get(key)
  if (cached) {
    // read again, so it is now the most recently used
    views.delete(key)
    views.set(key, cached)
    return cached
  }
  const objects = buildObjects(data, resolved)
  views.set(key, objects)
  if (views.size > MAX_VIEWS) views.delete(views.keys().next().value as string)
  return objects
}

/** The objects of `data` in `view`: every resource is built from `source`, `data` in the view's language (`translateData`), while the market, its currency and the localization come from `data`, which the language does not change. */
function buildObjects (data: StoreData, view: StoreView): StoreObjects {
  const { prefix } = view
  const source = translateData(data, view.language)
  const currency = currencyOf(data, view)
  const products = new HandleMap((source.products ?? []).map(product => [product.handle, buildProduct(product, prefix, currency)]))
  // Every shop answers `collections.all` with all its products. https://shopify.dev/docs/api/liquid/objects/collections
  const all = buildCollection({ id: 0, handle: 'all', title: 'Products', products: (source.products ?? []).map(product => product.handle) }, products, data.filters, prefix)
  const collections = new HandleMap((source.collections ?? []).map(collection => [collection.handle, buildCollection(collection, products, data.filters, prefix)]), [['all', all]])
  const blogs = new HandleMap((source.blogs ?? []).map(blog => [blog.handle, buildBlog(blog, prefix)]))
  const localization = buildLocalization(data, view)
  const shippingCountries = data.country_option_tags ?? [{ name: String((localization.country as LiquidObject | null)?.name ?? '') }]
  const articles = new HandleMap(HandleMap.values(blogs).flatMap(blog => (blog.articles as LiquidObject[]).map(article => [`${blog.handle}/${article.handle}`, article] as [string, LiquidObject])))
  const objects: StoreObjects = {
    shop: {
      name: source.shop.name,
      email: data.shop.email ?? '',
      description: source.shop.description ?? '',
      domain: data.shop.domain,
      permanent_domain: data.shop.domain,
      url: `https://${data.shop.domain}`,
      secure_url: `https://${data.shop.domain}`,
      currency: data.shop.currency,
      money_format: data.shop.money_format ?? DEFAULT_MONEY_FORMAT,
      money_with_currency_format: data.shop.money_with_currency_format ?? DEFAULT_MONEY_WITH_CURRENCY_FORMAT,
      locale: data.shop.locale ?? 'en',
      // https://shopify.dev/docs/api/liquid/objects/shop lists both: the currencies of the store's markets and its published locales. The parity store prints the currencies by ISO code and, as `published_locales`, the languages of the market the page is in with their URLs there (fixtures `probe-page-home` and `probe-page-en-ca`), not every language the store is published in.
      enabled_currencies: enabledCurrencies(data),
      published_locales: localization.available_languages,
      enabled_payment_types: data.shop.enabled_payment_types ?? [],
      customer_accounts_enabled: true,
      customer_accounts_optional: true,
      products_count: source.products?.length ?? 0,
      collections_count: source.collections?.length ?? 0,
      types: unique((source.products ?? []).map(product => product.type ?? '').filter(Boolean)).sort(),
      vendors: unique((source.products ?? []).map(product => product.vendor ?? '').filter(Boolean)).sort(),
      policies: [],
      metafields: data.shop.metafields ?? {}
    },
    products,
    collections,
    pages: new HandleMap((source.pages ?? []).map(page => [page.handle, buildPage(page, prefix)])),
    blogs,
    articles,
    images: new HandleMap(Object.entries(data.images ?? {}).map(([name, img]) => [name, new ImageDrop(img)])),
    videos: Object.fromEntries(Object.entries(data.videos ?? {}).map(([name, video]) => [name, buildMedia(video) as LiquidObject])),
    linklists: source.linklists ?? [],
    cart: buildCart(data, products, currency.iso_code),
    customer: data.customer ? buildCustomer(data.customer, products, prefix) : null,
    localization,
    currency,
    country_option_tags: countryOptionTags(shippingCountries),
    all_country_option_tags: countryOptionTags(data.all_country_option_tags ?? shippingCountries),
    gift_card: data.gift_card ? buildGiftCard(data.gift_card, products, data.shop.currency) : null,
    storefrontFilters: data.filters ?? []
  }
  return objects
}
