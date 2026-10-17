import type { FilterImpl } from '../../template/filter-impl-options'
import { stringify } from '../../util'
import { attribute, escapeHtml, insertAttributes, namedAttributes } from '../util/html'
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
function stylesheetTag (this: FilterImpl, url: unknown, ...args: unknown[]) {
  const { named, order } = splitArgs(args)
  const type = named.type ?? 'text/css'
  const media = named.media ?? 'all'
  const extra = namedAttributes(shopifyState(this.context).report, 'stylesheet_tag', named, order, ['href', 'rel', 'type', 'media', 'preload'])
  return `<link href="${escapeHtml(url)}" rel="stylesheet"${attribute('type', type)}${attribute('media', media)}${extra} />`
}

/** `<script src type></script>`, booleans as `defer="defer"`. https://shopify.dev/docs/api/liquid/filters/script_tag */
function scriptTag (this: FilterImpl, url: unknown, ...args: unknown[]) {
  const { named, order } = splitArgs(args)
  const extra = namedAttributes(shopifyState(this.context).report, 'script_tag', named, order, ['src', 'type'])
  return `<script src="${escapeHtml(url)}"${attribute('type', named.type ?? 'text/javascript')}${extra}></script>`
}

/** The caller's placeholder artwork, with an optional class on the `<svg>`. https://shopify.dev/docs/api/liquid/filters/placeholder_svg_tag */
function placeholderSvgTag (this: FilterImpl, name: unknown, ...args: unknown[]) {
  const { positional, named } = splitArgs(args)
  const className = positional[0] ?? named.class
  const svg = shopifyState(this.context).services.placeholderSvg(stringify(name))
  return className ? insertAttributes(svg, attribute('class', className)) : svg
}

/** The payment icon of the `paymentTypeSvg` service (Shopify's own file by default), with an optional class on the `<svg>`, written right after the element name even when the file starts with an XML prolog (`<?xml version="1.0"?><svg class="icon" xmlns=`, scenario `probe-payment-icons`). https://shopify.dev/docs/api/liquid/filters/payment_type_svg_tag */
function paymentTypeSvgTag (this: FilterImpl, type: unknown, ...args: unknown[]) {
  const { positional, named } = splitArgs(args)
  const className = named.class ?? positional[0]
  const svg = shopifyState(this.context).services.paymentTypeSvg(stringify(type))
  if (!className) return svg
  const attributes = attribute('class', className)
  // a function replacer, so a `$&` in the class is not read as a replacement pattern; markup without an `<svg>` element keeps the class on its first tag
  return /<svg\b/.test(svg) ? svg.replace(/<svg\b/, match => match + attributes) : insertAttributes(svg, attributes)
}

/** The container Shopify fills with accelerated checkout buttons, `<div data-shopify="payment-button" class="shopify-payment-button">` as https://shopify.dev/docs/api/liquid/filters/payment_button prints it. The page's inside is a `<shopify-accelerated-checkout>` element carrying the shop's access token, shop id and variant data, which this package cannot know; the disabled unbranded "Buy it now" button here is Debutify's stand-in, not Shopify's markup. */
function paymentButton () {
  return '<div data-shopify="payment-button" class="shopify-payment-button"><button type="button" class="shopify-payment-button__button shopify-payment-button__button--unbranded" disabled="disabled">Buy it now</button></div>'
}

/** The Shop Pay Installments banner, which Shopify shows "only if Shop Pay Installments is enabled in the merchant's store" (https://shopify.dev/docs/storefronts/themes/pricing-payments/installments). The store data has no such setting, so this prints what Shopify prints for a store without it: nothing, as recorded in liquid-spec's Dawn product page. https://shopify.dev/docs/api/liquid/filters/payment_terms does not show the banner's markup. */
function paymentTerms () {
  return ''
}

export const assetFilters: ShopifyFilterSet = {
  asset_url: { status: 'approx', handler: assetUrl },
  shopify_asset_url: { status: 'approx', handler: shopifyAssetUrl },
  stylesheet_tag: { status: 'approx', handler: stylesheetTag },
  script_tag: { status: 'approx', handler: scriptTag },
  placeholder_svg_tag: { status: 'approx', handler: placeholderSvgTag },
  payment_type_svg_tag: { status: 'exact', handler: paymentTypeSvgTag },
  payment_button: { status: 'approx', handler: paymentButton },
  payment_terms: { status: 'approx', handler: paymentTerms }
}
