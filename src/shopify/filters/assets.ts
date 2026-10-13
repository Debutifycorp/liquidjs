import type { FilterImpl } from '../../template/filter-impl-options'
import { stringify } from '../../util'
import { attribute, escapeHtml, insertAttributes } from '../util/html'
import { splitArgs } from '../util/args'
import { shopifyState } from '../state'
import type { ShopifyFilterSet } from './types'

/** https://shopify.dev/docs/api/liquid/filters/asset_url */
function assetUrl (this: FilterImpl, input: unknown) {
  return shopifyState(this.context).services.assetUrl(stringify(input))
}

/** https://shopify.dev/docs/api/liquid/filters/shopify_asset_url */
function shopifyAssetUrl (this: FilterImpl, input: unknown) {
  return shopifyState(this.context).services.shopifyAssetUrl(stringify(input))
}

/** `<link href rel type media />`, `media` and `type` overridable in place, other attributes after them; `preload` only adds a Link header on Shopify. https://shopify.dev/docs/api/liquid/filters/stylesheet_tag */
function stylesheetTag (url: unknown, ...args: unknown[]) {
  const { named, order } = splitArgs(args)
  const type = named.type ?? 'text/css'
  const media = named.media ?? 'all'
  const extra = order.filter(name => !['href', 'rel', 'type', 'media', 'preload'].includes(name)).map(name => attribute(name, named[name])).join('')
  return `<link href="${escapeHtml(url)}" rel="stylesheet"${attribute('type', type)}${attribute('media', media)}${extra} />`
}

/** `<script src type></script>`, booleans as `defer="defer"`. https://shopify.dev/docs/api/liquid/filters/script_tag */
function scriptTag (url: unknown, ...args: unknown[]) {
  const { named, order } = splitArgs(args)
  const extra = order.filter(name => name !== 'src' && name !== 'type').map(name => attribute(name, named[name])).join('')
  return `<script src="${escapeHtml(url)}"${attribute('type', named.type ?? 'text/javascript')}${extra}></script>`
}

/** The caller's placeholder artwork, with an optional class on the `<svg>`. https://shopify.dev/docs/api/liquid/filters/placeholder_svg_tag */
function placeholderSvgTag (this: FilterImpl, name: unknown, ...args: unknown[]) {
  const { positional, named } = splitArgs(args)
  const className = positional[0] ?? named.class
  const svg = shopifyState(this.context).services.placeholderSvg(stringify(name))
  return className ? insertAttributes(svg, attribute('class', className)) : svg
}

/** The caller's payment icon, with an optional class on the `<svg>`. https://shopify.dev/docs/api/liquid/filters/payment_type_svg_tag */
function paymentTypeSvgTag (this: FilterImpl, type: unknown, ...args: unknown[]) {
  const { positional, named } = splitArgs(args)
  const className = named.class ?? positional[0]
  const svg = shopifyState(this.context).services.paymentTypeSvg(stringify(type))
  return className ? insertAttributes(svg, attribute('class', className)) : svg
}

/** The container Shopify fills with accelerated checkout buttons, holding the unbranded "Buy it now" fallback button themes style. https://shopify.dev/docs/api/liquid/filters/payment_button */
function paymentButton () {
  return '<div data-shopify="payment-button" class="shopify-payment-button"><button type="button" class="shopify-payment-button__button shopify-payment-button__button--unbranded" disabled="disabled">Buy it now</button></div>'
}

export const assetFilters: ShopifyFilterSet = {
  asset_url: { status: 'approx', handler: assetUrl },
  shopify_asset_url: { status: 'approx', handler: shopifyAssetUrl },
  stylesheet_tag: { status: 'approx', handler: stylesheetTag },
  script_tag: { status: 'approx', handler: scriptTag },
  placeholder_svg_tag: { status: 'approx', handler: placeholderSvgTag },
  payment_type_svg_tag: { status: 'approx', handler: paymentTypeSvgTag },
  payment_button: { status: 'approx', handler: paymentButton }
}
