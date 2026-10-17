import type { FilterImpl } from '../../template/filter-impl-options'
import { stringify } from '../../util'
import { attribute, escapeHtml, insertAttributes, namedAttributes } from '../util/html'
import { splitArgs } from '../util/args'
import { shopifyState } from '../state'
import { ThemeFS } from '../theme-fs'
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
  return className ? insertAttributes(svg, attribute('class', className)) : svg
}

/** `<link href as rel="preload">`, the attributes a template names written after `as` and before `rel`, with no closing slash, as https://shopify.dev/docs/api/liquid/filters/preload_tag prints them (`<link href="//…/cart.js?v=…" as="script" type="text/javascript" rel="preload">`) and the parity store prints Horizon's `{{ 'overflow-list.css' | asset_url | preload_tag: as: 'style' }}` (`<link href="//…/overflow-list.css?v=…" as="style" rel="preload">`, private parity recordings of Horizon). `href` and `rel` are the filter's own and a template cannot set them. The page says `as` is required and does not say what Shopify prints without it: the tag is printed without `as` here and the call is reported, which is not pinned. The `Link` header Shopify adds is the host's to send. */
function preloadTag (this: FilterImpl, url: unknown, ...args: unknown[]) {
  const { named, order } = splitArgs(args)
  const report = shopifyState(this.context).report
  if (named.as === undefined || named.as === null || named.as === '') report.unsupported('preload_tag', 'the as argument is required')
  const extra = namedAttributes(report, 'preload_tag', named, order, ['href', 'as', 'rel'])
  return `<link href="${escapeHtml(url)}"${attribute('as', named.as)}${extra} rel="preload">`
}

/** The asset types https://shopify.dev/docs/api/liquid/filters/inline_asset_content inlines: "The asset must be either a SVG, JS, or CSS file." */
const INLINE_ASSET = /\.(svg|js|css)$/i

/** "The asset size must be less than 15KB to be inlined" (https://shopify.dev/docs/api/liquid/filters/inline_asset_content): 15 KB read as 15 × 1024 bytes of UTF-8, which the page does not pin. */
const INLINE_ASSET_LIMIT = 15 * 1024

/** The text of the theme file at `path`: through the page's theme (its base's file where the theme lays over one), or the engine's own `files` outside a page render. */
function themeFile (filter: FilterImpl, path: string): string | undefined {
  const state = shopifyState(filter.context)
  const hook = state.runtime?.themeFile
  if (hook) return hook.call(state.runtime, path)
  const fs = (state.liquid ?? filter.liquid).options.fs
  if (!(fs instanceof ThemeFS)) return undefined
  try {
    return fs.readFileSync(path)
  } catch (err) {
    return undefined
  }
}

/**
 * The text of the theme's asset `assets/<name>`, read from the theme's own files (never from the network), https://shopify.dev/docs/api/liquid/filters/inline_asset_content (`{{ 'icon.svg' | inline_asset_content }}` prints the file's `<svg …/>`). The file is printed byte for byte, its last line break included, as the parity store prints Horizon's icons (private parity recordings of Horizon: `assets/icon-search.svg`, `icon-cart.svg`, `icon-checkmark.svg` and the rest appear whole in the page).
 *
 * Only SVG, JS and CSS assets under 15 KB are inlined, as the page says. What Shopify prints for another type, a larger file or a missing one is not pinned: here each prints nothing; a missing asset is reported as a missing resource (`assets/<name>`) and the other two as unsupported.
 */
function inlineAssetContent (this: FilterImpl, input: unknown) {
  const report = shopifyState(this.context).report
  const name = stringify(input)
  if (!INLINE_ASSET.test(name)) {
    report.unsupported('inline_asset_content', `${name.slice(0, 80)} is not an SVG, JS or CSS asset`)
    return ''
  }
  const path = `assets/${name}`
  const text = themeFile(this, path)
  if (text === undefined) {
    report.missing('resource', path)
    return ''
  }
  if (Buffer.byteLength(text, 'utf8') >= INLINE_ASSET_LIMIT) {
    report.unsupported('inline_asset_content', `${path} is 15 KB or larger`)
    return ''
  }
  this.context.memoryLimit.use(text.length)
  return text
}

/** The Shop sign-in or "Follow on Shop" button, https://shopify.dev/docs/api/liquid/filters/login_button. The page shows no output: the button is Shop's own component, which needs the shop's Shop account and app ids, and themes print it only when `shop.features.follow_on_shop?` is true. The store data has no Shop account, so `shop.features.follow_on_shop?` is nil and the filter prints what a store without the feature shows: nothing. The markup of a store with the feature is not pinned. */
function loginButton () {
  return ''
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
  payment_terms: { status: 'approx', handler: paymentTerms },
  preload_tag: { status: 'exact', handler: preloadTag },
  inline_asset_content: { status: 'exact', handler: inlineAssetContent },
  login_button: { status: 'approx', handler: loginButton }
}
