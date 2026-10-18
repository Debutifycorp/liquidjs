/* The public API of `@debutify/liquidjs/storefront`, the names semver covers. A `Request` in, a `Response` out; the engine comes from `@debutify/liquidjs/shopify`, kept external, so a process holds one copy of it. */
import { AJAX_HANDLERS } from './ajax'
import { CHECKOUT_HANDLERS } from './checkout'
import { cartForm, FORM_HANDLERS } from './forms'
import { ROUTE_HANDLERS } from './handler'
import { STORAGE_HANDLERS } from './storage'

// each unit exports its handlers as a plain object and this, the one module that imports them all, fills the table: no unit imports another for its side effects
Object.assign(ROUTE_HANDLERS, AJAX_HANDLERS, FORM_HANDLERS, STORAGE_HANDLERS, CHECKOUT_HANDLERS)

// the cart routes have two formats, `/cart/add.js` (JSON, the Ajax unit's) and `/cart/add` (a form post or link, the forms unit's), so the one entry chooses by the route's format
const cartJs = AJAX_HANDLERS.cart
if (!cartJs) throw new Error('the Ajax unit has no cart handler')

/** Whether a `POST` to a cart endpoint without an extension asks for JSON: its `Accept` names JSON or JavaScript, or it is an `XMLHttpRequest`. https://github.com/Shopify/dawn/blob/main/assets/product-form.js posts the add form to `routes.cart_add_url` (`/cart/add`) with `Accept: application/javascript` and `X-Requested-With: XMLHttpRequest` and reads the answer as JSON, and a theme's cart code posts `cart_change_url` and `cart_update_url` with `Accept: application/json`. No shopify.dev page states the rule and no recording holds it: it is what those themes need. A browser's form post asks for `text/html` and stays a redirect. */
function wantsJson (request: Request): boolean {
  if (request.method.toUpperCase() !== 'POST') return false
  if (request.headers.get('x-requested-with')?.toLowerCase() === 'xmlhttprequest') return true
  return (request.headers.get('accept') ?? '').split(',').some(range => {
    const type = range.split(';')[0].trim().toLowerCase()
    return type === 'application/json' || type === 'application/javascript' || type === 'text/javascript' || type.endsWith('+json')
  })
}

ROUTE_HANDLERS.cart = ctx => ctx.routed.route.kind === 'cart' && ctx.routed.route.format === 'form' && !wantsJson(ctx.request) ? cartForm(ctx) : cartJs(ctx)

export { storefrontClientScript } from './client'
export { createStorefront } from './handler'
export { DEFAULT_LIMITS } from './types'
export type { CartStore, HandleOptions, Storefront, StorefrontLimits, StorefrontOptions, StorefrontReport, VisitorState } from './types'
export { memoryCartStore } from './visitor'
