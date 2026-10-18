import { randomBytes } from 'crypto'
import { addToCart, clearCart } from './cart'
import type { Context, RouteHandler } from './handler'
import { pageForPath } from './pages'

const opaque = (bytes: number) => randomBytes(bytes).toString('base64url')

/** A redirect with the `Location` exactly as given (under the base path, never a locale prefix: Shopify's checkout, account and permalink addresses carry none in their path). */
const found = (ctx: Context, path: string): Response => new Response(null, { status: 302, headers: { location: `${ctx.basePath}${path}` } })

/** The country of the visitor's cart: the one they chose, otherwise the primary market's default. */
const cartCountry = (ctx: Context): string => ctx.visitor.country ?? pageForPath(ctx, '/').request.country ?? 'US'

/**
 * Shopify's checkout address for the visitor's cart, `/checkouts/cn/<cart token>/<language>-<country>?_r=<signature>`, as recorded (scenario `ajax-checkout-redirects`, `ajax-cart-form-add`): the language is the page's, from its locale prefix, and the country the cart's (`/en-eu/checkout` of a cart made at the root is `en-us`). `_r` is 4 fixed characters and 48 opaque ones. The checkout itself is Shopify's, so the address answers the notice page.
 */
export function checkoutPath (ctx: Context, extra: Record<string, string> = {}, country = cartCountry(ctx)): string {
  const token = ctx.visitor.cart.token.split('?')[0]
  const query = new URLSearchParams({ _r: `AQAB${opaque(36)}`, ...extra })
  return `/checkouts/cn/${encodeURIComponent(token)}/${ctx.routed.language}-${country.toLowerCase()}?${query.toString()}`
}

/** The 302 to Shopify's checkout address that the cart form's checkout button answers. */
export const checkoutRedirect = (ctx: Context): Response => found(ctx, checkoutPath(ctx))

/**
 * `GET /checkout`, and `POST /checkout`. As the parity store answers them (scenario `ajax-checkout-redirects`): a visitor who has no cart yet is sent to the checkout address of the cart this request makes, and one whose cart is empty to the root of the page's market (`/`, `/en-eu`), where a cart with lines goes to the checkout address, in the page's language. Whether a cart exists is read from its note, which is nil until the cart is first changed; this request makes the cart, so the next empty-cart request goes to the root. That rule is inferred from one session of seven requests, not documented.
 */
export const checkout: RouteHandler = async ctx => {
  const cart = ctx.visitor.cart
  if (cart.lines.length > 0) return { response: checkoutRedirect(ctx) }
  if (cart.note === null) return { response: checkoutRedirect(ctx), state: { ...ctx.visitor, cart: { ...cart, note: '' } } }
  return { response: found(ctx, ctx.routed.localePrefix || '/') }
}

/** Where the storefront sends a visitor who opens the customer account: Shopify's customer-authentication address with the page's language and the cart's country (`/fr-ca/account` is `locale=fr&region_country=US` on the parity store), which answers the notice page. */
export function accountPath (ctx: Context): string {
  return `/customer_authentication/redirect?locale=${encodeURIComponent(ctx.routed.language)}&region_country=${encodeURIComponent(cartCountry(ctx))}`
}

/** `/account` and every address under it: Shopify answers each with a 302 to the customer accounts, which are not served here. */
export const account: RouteHandler = async ctx => ({ response: found(ctx, accountPath(ctx)) })

const LINK_GONE = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Link no longer exists.</title><meta name="referrer" content="never"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;font-weight:300;color:#6c6c6c}.wrapper{max-width:650px;margin:0 auto;padding:20px}h1{font-size:28px;color:#31373d}h3{font-size:17px;color:#31373d}a{color:#479ccf}</style></head><body><div class="wrapper"><div class="hero"><h1>Something went wrong.</h1></div><div class="content--block"><h3>What happened?</h3><div class="content--desc">Link no longer exists.: Link no longer exists.</div></div><div class="content--block"><h3>What can I do?</h3><div class="content--desc"><ul><li><a href="javascript:history.back()">Return to the previous page.</a></li></ul></div></div></div></body></html>'

/**
 * `GET /cart/<variant id>:<quantity>[,…]`, the cart permalink, https://shopify.dev/docs/apps/build/checkout/create-cart-permalinks. As the parity store answers it (scenario `ajax-checkout-redirects`): the cart is replaced by exactly those lines (newest first, the note and attributes the link names or none, no stock or quantity limit: a sold-out variant and 99999 units go in, a quantity of 0 adds nothing), and the answer is a 302 to the checkout address in the language of the page and the country of its market (`/en-eu/cart/…` is `en-de`), with `cart_link_id=<8 characters>` and `discount=<code>` added when the link names one; with `storefront=true` it goes to `/cart?cart_link_id=…` (and `&discount=<code>`). The code a link names is added to the cart's discount codes, in both forms, and stays through the next permalinks (a code the cart cannot use is listed as not `applicable`). A variant the store lacks answers 410 with Shopify's "Link no longer exists." page.
 */
export const permalink: RouteHandler = async ctx => {
  const route = ctx.routed.route
  if (route.kind !== 'permalink') throw new Error('not a permalink route')
  const query = ctx.routed.query
  const wanted = route.lines.filter(line => Number(line.quantity) > 0)
  const empty = clearCart({ ...ctx.visitor, cart: { ...ctx.visitor.cart, note: null, attributes: {}, discountCodes: [] } })
  if (!empty.ok) return { response: found(ctx, '/cart') }
  const limits = { ...ctx.limits, quantity: Math.max(ctx.limits.quantity, 999_999) }
  let state = empty.state
  for (const line of wanted) {
    const added = addToCart(state, { id: line.id, quantity: line.quantity }, ctx.data, limits, false)
    if (!added.ok) return { response: new Response(LINK_GONE, { status: 410, headers: { 'content-type': 'text/html; charset=utf-8' } }) }
    state = added.state
  }
  const attributes: Record<string, string> = {}
  for (const [name, value] of query) {
    const match = /^attributes\[(.+)\]$/.exec(name)
    if (match) attributes[match[1]] = value
  }
  const discount = query.get('discount')
  const storefront = query.get('storefront') === 'true'
  const codes = discount && !ctx.visitor.cart.discountCodes.includes(discount) ? [...ctx.visitor.cart.discountCodes, discount] : ctx.visitor.cart.discountCodes
  state = { ...state, cart: { ...state.cart, note: query.get('note') ?? '', attributes, discountCodes: codes } }
  const extra = { cart_link_id: opaque(6).slice(0, 8), ...(discount ? { discount } : {}) }
  const country = pageForPath(ctx, `${ctx.routed.localePrefix}/`).request.country
  const response = storefront ? found(ctx, `/cart?${new URLSearchParams(extra).toString()}`) : found(ctx, checkoutPath({ ...ctx, visitor: state }, extra, country))
  return { response, state }
}

export const CHECKOUT_HANDLERS = { checkout, account, permalink }
