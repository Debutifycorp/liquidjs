/* The public API of `@debutify/liquidjs/storefront`, the names semver covers. A `Request` in, a `Response` out; the engine comes from `@debutify/liquidjs/shopify`, kept external, so a process holds one copy of it. */
import { AJAX_HANDLERS } from './ajax'
import { cartForm, FORM_HANDLERS } from './forms'
import { ROUTE_HANDLERS } from './handler'

// each unit exports its handlers as a plain object and this, the one module that imports them all, fills the table: no unit imports another for its side effects
Object.assign(ROUTE_HANDLERS, AJAX_HANDLERS, FORM_HANDLERS)

// the cart routes have two formats, `/cart/add.js` (JSON, the Ajax unit's) and `/cart/add` (a form post or link, the forms unit's), so the one entry chooses by the route's format
const cartJs = AJAX_HANDLERS.cart
if (!cartJs) throw new Error('the Ajax unit has no cart handler')
ROUTE_HANDLERS.cart = ctx => ctx.routed.route.kind === 'cart' && ctx.routed.route.format === 'form' ? cartForm(ctx) : cartJs(ctx)

export { createStorefront } from './handler'
export { DEFAULT_LIMITS } from './types'
export type { CartStore, HandleOptions, Storefront, StorefrontLimits, StorefrontOptions, StorefrontReport, VisitorState } from './types'
export { memoryCartStore } from './visitor'
