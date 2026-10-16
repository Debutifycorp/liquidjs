/* The public API of `@debutify/liquidjs/storefront`, the names semver covers. A `Request` in, a `Response` out; the engine comes from `@debutify/liquidjs/shopify`, kept external, so a process holds one copy of it. */
import { FORM_HANDLERS } from './forms'
import { ROUTE_HANDLERS } from './handler'

// each unit exports its handlers as a plain object and this, the one module that imports them all, fills the table: no unit imports another for its side effects
Object.assign(ROUTE_HANDLERS, FORM_HANDLERS)

export { createStorefront } from './handler'
export { DEFAULT_LIMITS } from './types'
export type { CartStore, HandleOptions, Storefront, StorefrontLimits, StorefrontOptions, StorefrontReport, VisitorState } from './types'
export { memoryCartStore } from './visitor'
