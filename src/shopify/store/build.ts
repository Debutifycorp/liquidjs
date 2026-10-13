import { ImageDrop } from '../objects/image'
import { HandleMap } from '../objects/handle-map'
import { DEFAULT_MONEY_FORMAT, DEFAULT_MONEY_WITH_CURRENCY_FORMAT } from '../state'
import type { ImageData } from '../types'
import type { ArticleData, BlogData, CollectionData, LinkData, LinkListData, MediaData, PageData, ProductData, StoreData, VariantData } from './types'

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
}

const image = (data: ImageData | null | undefined) => data ? new ImageDrop(data) : null
const unique = <T>(items: T[]) => [...new Set(items)]

/** A field Liquid can read but `json` and `for` do not walk, for back references such as `variant.product`. */
function hidden (target: LiquidObject, key: string, value: unknown) {
  Object.defineProperty(target, key, { value, enumerable: false })
}

/** Product media: images (https://shopify.dev/docs/api/liquid/objects/media), videos (https://shopify.dev/docs/api/liquid/objects/video) and external videos (https://shopify.dev/docs/api/liquid/objects/external_video). Only media images carry a `preview_image`, https://shopify.dev/docs/api/liquid/objects/image#image-preview_image. `index` is the media's place in `product.media`, which becomes its 1-based `position` (https://shopify.dev/docs/api/liquid/objects/media#media-position); media from anywhere else has none. */
function buildMedia (media: MediaData, index?: number): unknown {
  const position = index === undefined ? null : index + 1
  if (media.media_type === 'image') return new ImageDrop(media, true, position)
  return { ...media, alt: media.alt ?? '', preview_image: image(media.preview_image), position }
}

/** https://shopify.dev/docs/api/liquid/objects/variant. `url` carries `?variant=<id>` as that page documents. `unit_price_measurement` and `selling_plan_allocations` are left empty and `quantity_rule` holds Shopify's defaults; shopify.dev documents the fields but this layer has no data for them. */
function buildVariant (variant: VariantData, productUrl: string): LiquidObject {
  const options = [variant.option1, variant.option2, variant.option3].filter((option): option is string => typeof option === 'string')
  const featured = image(variant.image)
  return {
    id: variant.id,
    title: variant.title,
    price: variant.price,
    compare_at_price: variant.compare_at_price ?? null,
    available: variant.available,
    sku: variant.sku ?? '',
    option1: variant.option1 ?? null,
    option2: variant.option2 ?? null,
    option3: variant.option3 ?? null,
    options,
    url: `${productUrl}?variant=${variant.id}`,
    image: featured,
    featured_image: featured,
    featured_media: variant.image ? new ImageDrop(variant.image, true) : null,
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
 * https://shopify.dev/docs/api/liquid/objects/product. `price` is the lowest variant price and `compare_at_price` the lowest variant compare-at price, as that page documents them; `compare_at_price` is nil when no variant has one (shopify.dev does not pin that case, so dividing by it raises "divided by 0" as Ruby does). `first_available_variant`, `selected_or_first_available_variant` (no `?variant=` is known here, so the first available one), `options_with_values` and `has_only_default_variant` follow the same page. Selling plans are left out.
 */
export function buildProduct (data: ProductData): LiquidObject {
  const url = `/products/${data.handle}`
  const images = (data.images ?? []).map((img, i) => new ImageDrop(img, false, i + 1))
  const media = (data.media ?? (data.images ?? []).map(img => ({ ...img, media_type: 'image' as const }))).map(buildMedia)
  const variants = data.variants.map(variant => buildVariant(variant, url))
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
  return product
}

/** https://shopify.dev/docs/api/liquid/objects/collection. Filtering, tags and sorting are not applied: `products` is the collection's product list as given, `filters` and `tags` are empty and `sort_options` lists Shopify's standard options. */
function buildCollection (data: CollectionData, products: HandleMap<LiquidObject>): LiquidObject {
  const items = data.products.map(handle => HandleMap.get(products, handle)).filter((product): product is LiquidObject => !!product)
  const collect = (key: string) => unique(items.flatMap(product => product[key] as string | string[]).filter(Boolean)).sort()
  const own = image(data.image)
  return {
    id: data.id,
    handle: data.handle,
    title: data.title,
    description: data.description ?? '',
    url: `/collections/${data.handle}`,
    image: own,
    featured_image: own ?? items[0]?.featured_image ?? null,
    products: items,
    products_count: items.length,
    all_products_count: items.length,
    all_tags: collect('tags'),
    all_types: collect('type'),
    all_vendors: collect('vendor'),
    tags: [],
    filters: [],
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
  }
}

/** https://shopify.dev/docs/api/liquid/objects/page. */
function buildPage (data: PageData): LiquidObject {
  return { ...data, url: `/pages/${data.handle}`, template_suffix: null, published_at: data.published_at ?? null, metafields: data.metafields ?? {} }
}

/** https://shopify.dev/docs/api/liquid/objects/article. Comments are not modelled: `comments` is empty and `comments_enabled?` false. */
function buildArticle (data: ArticleData, blogHandle: string): LiquidObject {
  const author = data.author ?? ''
  return {
    id: data.id,
    handle: data.handle,
    title: data.title,
    content: data.content,
    excerpt: data.excerpt ?? '',
    excerpt_or_content: data.excerpt || data.content,
    url: `/blogs/${blogHandle}/${data.handle}`,
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
  }
}

/** https://shopify.dev/docs/api/liquid/objects/blog. Comments are not modelled: `comments_enabled?` and `moderated?` are false. */
function buildBlog (data: BlogData): LiquidObject {
  const articles = data.articles.map(article => buildArticle(article, data.handle))
  return {
    id: data.id,
    handle: data.handle,
    title: data.title,
    url: `/blogs/${data.handle}`,
    articles,
    articles_count: articles.length,
    all_tags: unique(data.articles.flatMap(article => article.tags ?? [])).sort(),
    tags: [],
    'comments_enabled?': false,
    'moderated?': false,
    metafields: {}
  }
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
 * One menu link, https://shopify.dev/docs/api/liquid/objects/link. `current` is true when the link's path is the request path and `active` when it is the path or a parent of it ("matches, or contains, the link's url"); both ignore query strings, `current` also reads a product in a collection as the product, and `child_active` and `child_current` look at the children. `levels` counts the nested levels below the link. `object` is always nil: the page says it is the article, blog, collection, metaobject, page, policy or product the link points at, which this layer does not resolve from a URL. `handle` and `data_sharing_opt_out_icon` are not built.
 */
function buildLink (data: LinkData, path: string): LiquidObject {
  const links = (data.links ?? []).map(child => buildLink(child, path))
  const current = linkPath(data.url) === linkPath(path)
  const target = stripQuery(data.url)
  const active = current || (target !== '/' && stripQuery(path).startsWith(`${target}/`))
  return {
    title: data.title,
    url: data.url,
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

/** The `linklists` object for one request path, https://shopify.dev/docs/api/liquid/objects/linklists (each menu is https://shopify.dev/docs/api/liquid/objects/linklist). */
export function buildLinklists (lists: LinkListData[], path: string): HandleMap<LiquidObject> {
  return new HandleMap(lists.map(list => {
    const links = list.links.map(link => buildLink(link, path))
    return [list.handle, { handle: list.handle, title: list.title, links, levels: links.length ? 1 + Math.max(...links.map(link => link.levels as number)) : 0 }]
  }))
}

/** https://shopify.dev/docs/api/liquid/objects/cart and https://shopify.dev/docs/api/liquid/objects/line_item. Lines naming a product or variant the store does not have are skipped. No discounts, properties or selling plans are applied, so original, final and line prices are equal. */
function buildCart (data: StoreData, products: HandleMap<LiquidObject>): LiquidObject {
  const items: LiquidObject[] = []
  for (const line of data.cart?.items ?? []) {
    const product = HandleMap.get(products, line.product_handle)
    const variant = (product?.variants as LiquidObject[] | undefined)?.find(item => item.id === line.variant_id)
    if (!product || !variant) continue
    const price = variant.price as number
    items.push({
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
    currency: { iso_code: data.shop.currency },
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

/** https://shopify.dev/docs/api/liquid/objects/localization, with its `country` (https://shopify.dev/docs/api/liquid/objects/country), `language` (https://shopify.dev/docs/api/liquid/objects/language) and `market` (https://shopify.dev/docs/api/liquid/objects/market). A store has one country and one language here. */
function buildLocalization (data: StoreData): LiquidObject {
  const locale = data.shop.locale ?? 'en'
  const country = data.localization?.country ?? { iso_code: 'US', name: 'United States', currency: { iso_code: data.shop.currency, symbol: '$', name: data.shop.currency } }
  const language = { endonym_name: data.localization?.language.name ?? locale, primary: true, root_url: '/', ...(data.localization?.language ?? { iso_code: locale, name: locale }) }
  return {
    country: { unit_system: 'metric', ...country },
    language,
    available_countries: [country],
    available_languages: [language],
    market: { id: 1, handle: 'default' }
  }
}

const built = new WeakMap<StoreData, StoreObjects>()

/**
 * The Liquid objects for `data`, built once per `data` object and reused. `shop` follows https://shopify.dev/docs/api/liquid/objects/shop; `shop.url` and `shop.secure_url` are `https://<domain>`, as shopify.dev gives no other form for a store without its own scheme.
 */
export function buildStore (data: StoreData): StoreObjects {
  const cached = built.get(data)
  if (cached) return cached
  const products = new HandleMap((data.products ?? []).map(product => [product.handle, buildProduct(product)]))
  // Every shop answers `collections.all` with all its products. https://shopify.dev/docs/api/liquid/objects/collections
  const all = buildCollection({ id: 0, handle: 'all', title: 'Products', products: (data.products ?? []).map(product => product.handle) }, products)
  const collections = new HandleMap((data.collections ?? []).map(collection => [collection.handle, buildCollection(collection, products)]), [['all', all]])
  const blogs = new HandleMap((data.blogs ?? []).map(blog => [blog.handle, buildBlog(blog)]))
  const articles = new HandleMap(HandleMap.values(blogs).flatMap(blog => (blog.articles as LiquidObject[]).map(article => [`${blog.handle}/${article.handle}`, article] as [string, LiquidObject])))
  const objects: StoreObjects = {
    shop: {
      name: data.shop.name,
      email: data.shop.email ?? '',
      description: data.shop.description ?? '',
      domain: data.shop.domain,
      permanent_domain: data.shop.domain,
      url: `https://${data.shop.domain}`,
      secure_url: `https://${data.shop.domain}`,
      currency: data.shop.currency,
      money_format: data.shop.money_format ?? DEFAULT_MONEY_FORMAT,
      money_with_currency_format: data.shop.money_with_currency_format ?? DEFAULT_MONEY_WITH_CURRENCY_FORMAT,
      locale: data.shop.locale ?? 'en',
      enabled_payment_types: data.shop.enabled_payment_types ?? [],
      customer_accounts_enabled: true,
      customer_accounts_optional: true,
      products_count: data.products?.length ?? 0,
      collections_count: data.collections?.length ?? 0,
      types: unique((data.products ?? []).map(product => product.type ?? '').filter(Boolean)).sort(),
      vendors: unique((data.products ?? []).map(product => product.vendor ?? '').filter(Boolean)).sort(),
      policies: [],
      metafields: data.shop.metafields ?? {}
    },
    products,
    collections,
    pages: new HandleMap((data.pages ?? []).map(page => [page.handle, buildPage(page)])),
    blogs,
    articles,
    images: new HandleMap(Object.entries(data.images ?? {}).map(([name, img]) => [name, new ImageDrop(img)])),
    videos: Object.fromEntries(Object.entries(data.videos ?? {}).map(([name, video]) => [name, buildMedia(video) as LiquidObject])),
    linklists: data.linklists ?? [],
    cart: buildCart(data, products),
    customer: data.customer ?? null,
    localization: buildLocalization(data)
  }
  built.set(data, objects)
  return objects
}
