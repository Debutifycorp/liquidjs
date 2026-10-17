/**
 * Shopify's payment icons and font library: the data the `@debutify/liquidjs/shopify` entry's default services read. Both /shopify bundles import this entry by the package's name, so the data ships once (dist/shopify-library.js) and not inside each bundle. Not public API: use `shopifyPaymentIcon`, `shopifyFontInfo` and `isShopifyFontFile` from `@debutify/liquidjs/shopify`.
 */
export { PAYMENT_ICONS } from './payment-icons'
export { FONT_LIBRARY, FONT_REPLACEMENTS } from './font-library'
export type { LibraryFamily, LibraryFont } from './font-library'
