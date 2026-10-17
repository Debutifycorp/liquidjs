import { findVariant, requestFromUrl } from '../shopify'
import type { PageRequest, StoreData } from '../shopify'

export type CartAction = 'add' | 'change' | 'update' | 'clear'

export type Route =
  | { kind: 'page', page: PageRequest, sectionId?: string, sections?: string[] }
  | { kind: 'not-found', page: PageRequest }
  | { kind: 'cart-json' }
  | { kind: 'cart', action: CartAction, format: 'js' | 'form' }
  | { kind: 'discount', code: string, redirect: string | null }
  | { kind: 'variant', handle: string, variant: number }
  | { kind: 'variant-gone' }
  | { kind: 'shipping', action: 'prepare' | 'async' | 'rates' }
  | { kind: 'product-json', handle: string }
  | { kind: 'suggest-json', page: PageRequest }
  | { kind: 'recommendations-json', page: PageRequest }
  | { kind: 'contact' }
  | { kind: 'localization' }
  | { kind: 'password' }
  | { kind: 'notice', notice: 'checkout' | 'account' }

export interface Routed {
  route: Route
  localePrefix: string
  market: string
  language: string
  query: URLSearchParams
}

// https://shopify.dev/docs/api/ajax/reference/cart documents add, change, update and clear as POST at `/cart/<action>.js`. The spellings without an extension, the targets of forms and links, come from https://shopify.dev/docs/api/liquid/objects/routes alone (`cart_add_url`, `cart_change_url`, `cart_update_url` and `cart_clear_url`). The `.json` spelling is not documented and no fixture pins it: it is accepted as the same endpoint as the `.js` one.
const CART = /^\/cart\/(add|change|update|clear)(\.js|\.json)?$/

/** One path segment with its percent escapes decoded; a malformed escape leaves the segment as the address wrote it, so a bad address names nothing rather than throwing. */
export function decode (segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/** The path with its empty segments dropped, as the engine reads a page's address (`/products//hoodie` is `/products/hoodie`, `/cart/` is `/cart`). Linear in the path, which a visitor writes: a regex that trims trailing slashes is quadratic on a long run of them. */
function squeeze (path: string): string {
  return `/${path.split('/').filter(Boolean).join('/')}`
}

/** Whether `path` starts with `prefix`, a path of whole segments such as `/p/tok`, compared by decoded segment as the engine's reading of the address does. */
function within (path: string, prefix: string): boolean {
  const have = path.split('/')
  const want = prefix.split('/')
  return want.length <= have.length && want.every((segment, i) => decode(segment) === decode(have[i]))
}

/** The address with its search term (`q`, the only one a page, a section or a list reads) cut to `max` characters, so that a term costs the same on every route: `/search`, a section of it, `/search/suggest` and the vendor and type lists. An address whose term is within `max` (or that has none) comes back as it was; one that is cut comes back as a path with its query and fragment. Final review A, M2: the spec's "search terms up to 256 characters". */
export function cutSearch (url: string, max: number): string {
  try {
    const parsed = new URL(url.replace(/^\/{2,}/, '/'), 'https://storefront.invalid')
    const term = parsed.searchParams.get('q')
    if (term === null || term.length <= max) return url
    parsed.searchParams.set('q', term.slice(0, max))
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return url
  }
}

/**
 * What a storefront request asks for, from its method and address: the routes of the spec's "Routes" table. The base path and the locale prefix are taken off first; a page is read by the engine's `requestFromUrl`. A search term is cut to `options.search` characters when that is given (`cutSearch`). Pure: it renders nothing and does no input or output.
 */
export function routeRequest (method: string, rawUrl: string, data: StoreData, options: { basePath: string, country?: string, search?: number }): Routed {
  const squeezedBase = squeeze(options.basePath)
  const basePath = squeezedBase === '/' ? '' : squeezedBase
  const url = options.search === undefined ? rawUrl : cutSearch(rawUrl, options.search)
  // an address that opens with `//` is a path, not a host (as `requestFromUrl` reads it)
  const parsed = new URL(url.replace(/^\/{2,}/, '/'), 'https://storefront.invalid')
  const query = parsed.searchParams
  // an address outside the base path is not the store's, whatever it says after it: its 404 page is the store's root read, with the primary market and language and no locale prefix
  const outside = basePath !== '' && !within(parsed.pathname, basePath)
  const page = requestFromUrl(outside ? basePath : url, data, { basePath, country: options.country })
  // the engine's reading of the address finds the locale prefix (engine Task 1) and keeps what follows it percent-encoded in `request.path`, after the base path and the prefix it has just taken off
  const localePrefix = page.request.localePrefix ?? ''
  const done = (route: Route): Routed => ({ route, localePrefix, market: page.request.market ?? 'default', language: page.request.language ?? page.locale, query })
  const notFound = (): Routed => done({ kind: 'not-found', page: { ...page, templateName: '404' } })
  if (outside) return notFound()
  const path = squeeze((page.request.path ?? '/').slice(basePath.length + localePrefix.length))
  const verb = method.toUpperCase()
  const read = verb === 'GET' || verb === 'HEAD'
  // checkout and the customer account pages are Shopify's, not the storefront's (https://shopify.dev/docs/api/liquid/objects/routes lists `/account/login` and the other account links; checkout has no route there, and its address is Shopify's `/checkouts/cn/<token>`): the notice page answers them, whatever the method
  if (path === '/checkout' || path === '/checkouts' || path.startsWith('/checkouts/')) return done({ kind: 'notice', notice: 'checkout' })
  if (path === '/account' || path.startsWith('/account/')) return done({ kind: 'notice', notice: 'account' })
  // https://shopify.dev/docs/api/ajax/reference/cart: `GET /cart.js` (`/cart.json` is the same cart, undocumented)
  if (read && (path === '/cart.js' || path === '/cart.json')) return done({ kind: 'cart-json' })
  const cart = CART.exec(path)
  if (cart && verb === 'POST') return done({ kind: 'cart', action: cart[1] as CartAction, format: cart[2] ? 'js' : 'form' })
  // a line's `url_to_remove` is a plain link, so `/cart/change` also answers GET (`/cart/change?id=<key>&quantity=0`, fixtures `ajax-cart-session` and `ajax-cart-en-ca`)
  if (path === '/cart/change' && read) return done({ kind: 'cart', action: 'change', format: 'form' })
  // the `cart` form posts to `/cart` (https://shopify.dev/docs/api/liquid/tags/form), which updates the quantities
  if (path === '/cart' && verb === 'POST') return done({ kind: 'cart', action: 'update', format: 'form' })
  // https://help.shopify.com/en/manual/discounts/discount-methods/discount-links: `/discount/<code>` applies the code, then redirects (`?redirect=`, fixture `ajax-discount-codes`); an address with no code names no discount
  const code = read && path.startsWith('/discount/') ? decode(path.slice('/discount/'.length)) : ''
  if (code) return done({ kind: 'discount', code, redirect: query.get('redirect') })
  // https://shopify.dev/docs/api/ajax/reference/cart: POST `prepare_shipping_rates.json`, then GET `async_shipping_rates.json` (or the throttled `shipping_rates.json`)
  if (path === '/cart/prepare_shipping_rates.json' && verb === 'POST') return done({ kind: 'shipping', action: 'prepare' })
  if (path === '/cart/async_shipping_rates.json' && read) return done({ kind: 'shipping', action: 'async' })
  if (path === '/cart/shipping_rates.json' && read) return done({ kind: 'shipping', action: 'rates' })
  // https://shopify.dev/docs/api/ajax/reference/product: `GET /products/<handle>.js`
  const product = /^\/products\/([^/]+)\.js$/.exec(path)
  if (product && read) return done({ kind: 'product-json', handle: decode(product[1]) })
  // https://shopify.dev/docs/api/ajax/reference/predictive-search (`/search/suggest.json`) and https://shopify.dev/docs/api/ajax/reference/product-recommendations (`/recommendations/products.json`): the engine reads each as the page its section-rendering twin answers for
  const answered = (endpoint: string): PageRequest => requestFromUrl(`${basePath}${localePrefix}${endpoint}${parsed.search}`, data, { basePath, country: options.country })
  if (path === '/search/suggest.json' && read) return done({ kind: 'suggest-json', page: answered('/search/suggest') })
  if (path === '/recommendations/products.json' && read) return done({ kind: 'recommendations-json', page: answered('/recommendations/products') })
  // the forms' targets, https://shopify.dev/docs/api/liquid/tags/form: `contact` posts to `/contact`, `localization` to `/localization` and `storefront_password` to `/password`
  if (verb === 'POST' && path === '/contact') return done({ kind: 'contact' })
  if (verb === 'POST' && path === '/localization') return done({ kind: 'localization' })
  if (verb === 'POST' && path === '/password') return done({ kind: 'password' })
  // https://shopify.dev/docs/api/section-rendering: `section_id` answers one section's HTML and `sections` a JSON map of up to five, on any page address; the handler enforces the count
  const sectionId = query.get('section_id') ?? undefined
  const sections = query.get('sections')?.split(',').map(s => s.trim()).filter(Boolean)
  const asked = { ...(sectionId ? { sectionId } : {}), ...(sections?.length ? { sections } : {}) }
  // no shopify.dev page documents `/variants/<id>` itself: as the parity store answers it, a 302 to `/products/<handle>?variant=<id>` (fixture `flow-variant-route`)
  const variant = /^\/variants\/(\d+)$/.exec(path)
  const found = variant && read ? findVariant(data, Number(variant[1])) : null
  // a section requested at a variant's address is rendered, not redirected: https://shopify.dev/docs/storefronts/themes/delivery-fulfillment/pickup-availability says the request "needs to be prefixed with a /variants/[variant-id] parameter", and the parity store answered `/variants/<id>/?section_id=pickup-availability` with 200, `text/html; charset=utf-8` and the section's wrapper, no redirect; the section reads the variant as `product_variant` and has no `product` (the page is the 404 template's, as the address names no other)
  if (found && (sectionId || sections?.length)) return done({ kind: 'page', page: { ...page, request: { ...page.request, productVariant: found.variant.id } }, ...asked })
  if (found) return done({ kind: 'variant', handle: found.product.handle, variant: found.variant.id })
  // the same request for a variant the store lacks answered 404 with an empty body typed `text/html; charset=utf-8` on the parity store, one observation (the address of a section the theme lacks answers alike)
  if (variant && read && (sectionId || sections?.length)) return done({ kind: 'variant-gone' })
  if (!read || page.templateName === '404') return notFound()
  return done({ kind: 'page', page, ...asked })
}
