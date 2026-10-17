import type { FilterImpl } from '../../template/filter-impl-options'
import { stringify, toValue } from '../../util'
import { stripTags } from '../../util/strip-tags'
import { imageSource } from '../objects/image'
import { shopifyState, ShopifyState } from '../state'
import { isBuiltArticle, isBuiltCollection, isBuiltProduct, isBuiltVariant } from '../store/build'
import type { LiquidObject } from '../store/build'
import { codeStatus, isBuiltCart } from '../store/cart'
import { splitArgs } from '../util/args'
import { decimalAmount } from './money'
import { escapeJson } from './json'
import type { ShopifyFilterSet } from './types'

/** JSON text as Shopify's JSON filters print it: `/` as `\/` and `<`, `>`, `&` as `\uXXXX` escapes (`escapeJson`), which is what the parity store prints in the payloads below (`"Ocean \/ Small"`, `?v=1792086417&width=1920`). */
function printJson (filter: FilterImpl, value: unknown): string {
  const json = escapeJson(JSON.stringify(value))
  filter.context.memoryLimit.use(json.length)
  return json
}

/** A value of the render's scope (`shop.name`), or undefined when it is not there. */
function lookup (filter: FilterImpl, path: string[]): unknown {
  try {
    return toValue(filter.context.getSync(path))
  } catch (err) {
    return undefined
  }
}

/** The view's currency code: the market's (`Shopify.currency`), else the shop's. */
function currencyCode (filter: FilterImpl, state: ShopifyState): string {
  return state.currency ? state.currency.iso_code : stringify(lookup(filter, ['shop', 'currency']) ?? '')
}

/** The shop's address for absolute URLs: the request's origin, which `canonical_url` starts with too. */
const originOf = (state: ShopifyState): string => state.request.origin

/** A variant's option names and values as the Storefront API writes `selectedOptions`. */
function selectedOptions (product: LiquidObject, variant: LiquidObject): Array<{ name: string, value: unknown }> {
  const names = (product.options as string[] | undefined) ?? []
  const values = (variant.options as unknown[] | undefined) ?? []
  return names.map((name, i) => ({ name, value: values[i] ?? null }))
}

/** A price in the payloads of `standard_event_data`: the amount as a plain decimal (`90.0`, `82.95`) and the currency code. */
const moneyJson = (filter: FilterImpl, state: ShopifyState, cents: unknown, code = currencyCode(filter, state)) => ({ amount: decimalAmount(Number(cents) || 0), currencyCode: code })

/** The product contexts https://shopify.dev/docs/api/liquid/filters/standard_event_data lists, and the cart ones. */
const PRODUCT_CONTEXTS = new Set(['page', 'search', 'collection', 'dialog', 'recommendation'])
const CART_CONTEXTS = new Set(['page', 'dialog'])

/**
 * The JSON payload of a standard `view` event, https://shopify.dev/docs/api/liquid/filters/standard_event_data, for a product, a collection or a cart, in the keys and order the page's examples and the parity store print (private parity recordings of Horizon and Dawn, the `view-event-payload` attributes of every page):
 *
 * - a product: `{"product":{"id","title","handle","selectedVariant"},"context","selectedOptions"}`. `selectedVariant` is the variant the request selected (`product.selected_variant`) as `{"id","title","availableForSale","price":{"amount","currencyCode"},"selectedOptions":[{"name","value"}]}`, and null without one; the top-level `selectedOptions` repeats its options, `[]` without one (recordings `page-product-variant`, `/products/hoodie?variant=…`: `"title":"Ocean \/ Small"`, `"price":{"amount":"90.0","currencyCode":"USD"}`, and `page-product`: `"selectedVariant":null`, `"selectedOptions":[]`).
 * - a collection: `{"collection":{"id","handle","productsCount"}}`, the count after the page's filters (recording `page-collection-filtered` of Horizon: `{"id":null,"handle":"all","productsCount":5}`, the catalogue having no id); the context is ignored, as the page says.
 * - a cart: `{"context","cart"}`, with `cart` null for a cart that was never created (recording `page-cart-empty` of Dawn: `{"context":"page","cart":null}`), and otherwise `{"totalQuantity","cost":{"totalAmount"},"lines":[{"id","quantity","cost":{"totalAmount"}}],"discountCodes"}` (recording `ajax-cart-sections` of Dawn: `{"totalQuantity":1,"cost":{"totalAmount":{"amount":"50.0","currencyCode":"USD"}},"lines":[{"id":"<line key>","quantity":1,…}],"discountCodes":[]}`).
 *
 * `context` is null when it is not given, as the page says. Not pinned: a context outside the lists the page gives (null here); a line's amount with a discount on it (its final line price here) and the entries of `discountCodes` (`{"code","applicable"}`, as the Storefront API writes a cart's codes); a cart that holds no lines but was created (null here, like one never created). An event type other than `view`, which the page says is the only one, or another object prints nothing and is reported. Nil prints nothing and is not reported, since a theme passes nil where a page has no such object (Horizon's `closest.product` outside a product); what Shopify prints for nil is not pinned.
 */
function standardEventData (this: FilterImpl, input: unknown, ...args: unknown[]) {
  const state = shopifyState(this.context)
  const { positional, named } = splitArgs(args)
  const eventType = positional[0]
  if (eventType !== 'view') {
    state.report.unsupported('standard_event_data', `the event type ${JSON.stringify(stringify(eventType).slice(0, 40))} is not view`)
    return ''
  }
  const value = toValue(input)
  const context = typeof named.context === 'string' ? named.context : null
  if (isBuiltProduct(value)) {
    const variant = value.selected_variant as LiquidObject | null
    const options = variant ? selectedOptions(value, variant) : []
    const selectedVariant = variant ? { id: variant.id, title: variant.title, availableForSale: !!variant.available, price: moneyJson(this, state, variant.price), selectedOptions: options } : null
    return printJson(this, { product: { id: value.id, title: value.title, handle: value.handle, selectedVariant }, context: context !== null && PRODUCT_CONTEXTS.has(context) ? context : null, selectedOptions: options })
  }
  if (isBuiltCollection(value)) {
    // the engine's catalogue is id 0, where Shopify's has none
    return printJson(this, { collection: { id: value.id || null, handle: value.handle, productsCount: value.products_count } })
  }
  if (isBuiltCart(value)) {
    const lines = value.items as LiquidObject[]
    const code = stringify((value.currency as LiquidObject | undefined)?.iso_code ?? currencyCode(this, state))
    const cart = lines.length
      ? {
        totalQuantity: value.item_count,
        cost: { totalAmount: moneyJson(this, state, value.total_price, code) },
        lines: lines.map(line => ({ id: line.key, quantity: line.quantity, cost: { totalAmount: moneyJson(this, state, line.final_line_price, code) } })),
        discountCodes: codeStatus(value)
      }
      : null
    return printJson(this, { context: context !== null && CART_CONTEXTS.has(context) ? context : null, cart })
  }
  if (value !== null && value !== undefined && value !== '') state.report.unsupported('standard_event_data', 'only a product, a collection or a cart has standard event data')
  return ''
}

/** An image's address in the structured data: the `imageUrl` service at a width of 1920 with `https:` before a protocol-relative address, as the parity store prints it (`https:\/\/<shop>\/cdn\/shop\/files\/…?v=…&width=1920`) and the page's example does. */
function imageAddress (state: ShopifyState, image: unknown): string | undefined {
  const source = imageSource(image)
  if (!source) return undefined
  const url = String(state.services.imageUrl(source.image, { width: 1920 }))
  return url.startsWith('//') ? `https:${url}` : url
}

const SCHEMA = 'http://schema.org/'

/** A variant's offer: its address with `#offer`, its availability, its price with two decimals in the view's currency, and its absolute address. */
function offerJson (filter: FilterImpl, state: ShopifyState, variant: LiquidObject): Record<string, unknown> {
  const url = stringify(variant.url)
  return {
    '@id': `${url}#offer`,
    '@type': 'Offer',
    availability: `${SCHEMA}${variant.available ? 'InStock' : 'OutOfStock'}`,
    price: ((Number(variant.price) || 0) / 100).toFixed(2),
    priceCurrency: currencyCode(filter, state),
    url: `${originOf(state)}${url}`
  }
}

/** A product's `Product` (one default variant) or `ProductGroup` (variants), keys in the order the page and the parity store print them, which is alphabetical after `@context`, `@id` and `@type`. */
function productJson (filter: FilterImpl, state: ShopifyState, product: LiquidObject): Record<string, unknown> {
  const url = stringify(product.url)
  const head = {
    '@context': SCHEMA,
    '@id': `${url}#product`,
    '@type': product.has_only_default_variant ? 'Product' : 'ProductGroup',
    brand: { '@type': 'Brand', name: product.vendor },
    category: product.type,
    description: stripTags(stringify(product.description))
  }
  const variants = (product.variants as LiquidObject[] | undefined) ?? []
  if (product.has_only_default_variant) {
    const image = imageAddress(state, variants[0]?.featured_image ?? product.featured_image)
    return { ...head, ...(image === undefined ? {} : { image }), name: product.title, offers: offerJson(filter, state, variants[0]), url: `${originOf(state)}${url}` }
  }
  return {
    ...head,
    hasVariant: variants.map(variant => {
      const image = imageAddress(state, variant.featured_image ?? product.featured_image)
      return {
        '@id': `${stringify(variant.url)}#variant`,
        '@type': 'Product',
        ...(image === undefined ? {} : { image }),
        name: variant.title === 'Default Title' ? product.title : `${stringify(product.title)} - ${stringify(variant.title)}`,
        offers: offerJson(filter, state, variant)
      }
    }),
    name: product.title,
    productGroupID: String(product.id),
    url: `${originOf(state)}${url}`
  }
}

/** A timestamp as the data gives it (a string as written, a date in ISO 8601 without milliseconds). */
const timestamp = (value: unknown): unknown => value instanceof Date ? value.toISOString().replace(/\.\d{3}Z$/, 'Z') : value ?? null

/** An article's `Article`, in the order the parity store prints it. */
function articleJson (filter: FilterImpl, state: ShopifyState, article: LiquidObject): Record<string, unknown> {
  const url = stringify(article.url)
  return {
    '@context': SCHEMA,
    '@id': `${url}#article`,
    '@type': 'Article',
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${originOf(state)}${url}` },
    articleBody: stripTags(stringify(article.content)),
    headline: article.title,
    description: article.excerpt,
    datePublished: timestamp(article.created_at),
    dateModified: timestamp(article.published_at),
    author: { '@type': 'Person', name: article.author },
    publisher: { '@type': 'Organization', name: lookup(filter, ['shop', 'name']) ?? '' }
  }
}

/**
 * The schema.org JSON-LD of a product or an article, https://shopify.dev/docs/api/liquid/filters/structured_data: a product with only its default variant is a `Product` and one with variants a `ProductGroup`, an article an `Article`. The keys, their order and their values are the ones the parity store prints for Horizon and Dawn (private parity recordings `page-product`, `page-product-variant`, `page-product-subscription`, `page-product-requires-plan`, `page-product-en-eu` and `page-article`):
 *
 * - `ProductGroup`: `@context` (`http://schema.org/`), `@id` (the product's address with `#product`), `@type`, `brand` (the vendor), `category` (the product type, which is what the parity store prints for products seeded with a type and no taxonomy category), `description` (the description without its tags, line breaks kept), `hasVariant`, `name`, `productGroupID` (the product id as a string), `url` (absolute). Each variant is a `Product` with `@id` (its address with `#variant`), `image` (its image, else the product's, at a width of 1920), `name` (`<product> - <variant>`) and `offers`: `@id` (its address with `#offer`), `availability` (`http://schema.org/InStock` or `OutOfStock`), `price` (two decimals, a string, in the view's currency: `82.95` and `EUR` on the Europe market), `priceCurrency` and `url` (absolute). The addresses carry the view's prefix (`/en-eu/products/hoodie#product`).
 * - `Product`: the page's example (`crocodile-tears`): the same head, then `image`, `name`, `offers` (one offer) and `url`; the parity store has not printed one, because the products it was recorded on have variants.
 * - `Article`: `@context`, `@id` (the article's address with `#article`), `@type`, `mainEntityOfPage` (a `WebPage` at the absolute address), `articleBody` (the content without its tags), `headline`, `description` (the excerpt), `datePublished`, `dateModified`, `author` (a `Person`), `publisher` (an `Organization`, the shop's name). The parity store prints the article's `created_at` (or `updated_at`, which the recording cannot tell apart: both are the seeding time, seconds apart) as `datePublished` and its `published_at` as `dateModified`; this package prints the same fields, which the store data holds as one (`published_at`, see `buildArticle`), as the data gives them: Shopify prints them in the shop's zone (`-04:00`), which the store data has none of (Known gaps).
 *
 * The JSON is escaped as `json` escapes it. Not pinned: an article's image, a variant's SKU or barcode (none in the store data), a product without an image or a vendor, an empty excerpt, entities in the text (kept as written), a currency without two decimals. Any other object prints nothing and is reported; nil prints nothing and is not reported, since a theme passes nil where a page has no such object (Horizon's `closest.product` outside a product), and what Shopify prints for nil is not pinned.
 */
function structuredData (this: FilterImpl, input: unknown) {
  const state = shopifyState(this.context)
  const value = toValue(input)
  if (isBuiltProduct(value)) return printJson(this, productJson(this, state, value))
  if (isBuiltArticle(value)) return printJson(this, articleJson(this, state, value))
  if (value !== null && value !== undefined && value !== '') state.report.unsupported('structured_data', 'only a product or an article has structured data')
  return ''
}

/**
 * The cart's lines that hold a product or a variant, https://shopify.dev/docs/api/liquid/filters/line_items_for (`cart | line_items_for: product`, then `| sum: 'quantity'`): the lines whose `product_id` is the product's id, or whose `variant_id` is the variant's. Anything else gives an empty list; what Shopify returns for an object of another type is not pinned.
 */
function lineItemsFor (this: FilterImpl, input: unknown, target: unknown) {
  const cart = toValue(input)
  const object = toValue(target)
  if (!isBuiltCart(cart)) return []
  const lines = cart.items as LiquidObject[]
  if (isBuiltProduct(object)) return lines.filter(line => line.product_id === object.id)
  if (isBuiltVariant(object)) return lines.filter(line => line.variant_id === object.id)
  return []
}

export const structuredFilters: ShopifyFilterSet = {
  standard_event_data: { status: 'exact', handler: standardEventData },
  structured_data: { status: 'exact', handler: structuredData },
  line_items_for: { status: 'approx', handler: lineItemsFor }
}
