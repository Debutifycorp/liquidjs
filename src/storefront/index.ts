/* The public API of `@debutify/liquidjs/storefront`, the names semver covers. A `Request` in, a `Response` out; the engine comes from `@debutify/liquidjs/shopify`, kept external, so a process holds one copy of it. */
export { DEFAULT_LIMITS } from './types'
export type { CartStore, HandleOptions, Storefront, StorefrontLimits, StorefrontOptions, StorefrontReport, VisitorState } from './types'
export { memoryCartStore } from './visitor'
