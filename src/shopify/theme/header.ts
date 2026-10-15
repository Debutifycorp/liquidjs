import type { ShopifyState } from '../state'

/** Where `content_for_header` goes while the layout renders; replaced once the whole page has rendered, so it can include every section's `{% stylesheet %}` and `{% javascript %}`. A render swaps in `newHeaderMarker()`, not this constant. */
export const HEADER_MARKER = '\u0000content_for_header\u0000'

let counter = 0

/** `HEADER_MARKER` with a nonce, made once per render: store data that happens to hold the plain `HEADER_MARKER` (`escape` leaves `\u0000` alone) is then printed as data and not swapped for the header. The nonce keeps a render's marker from being guessed by data written before it, which is all it has to do; it is not a secret. */
export function newHeaderMarker (): string {
  counter = (counter + 1) % Number.MAX_SAFE_INTEGER
  return `${HEADER_MARKER.slice(0, -1)}:${counter.toString(36)}${Math.random().toString(36).slice(2)}\u0000`
}

/** JSON safe inside `<script>`; a missing value is `null`. */
function scriptJson (value: unknown): string {
  return JSON.stringify(value ?? null).replace(/</g, '\\u003c')
}

/**
 * A minimal `content_for_header`: the `window.Shopify` globals themes read (shop, locale, currency, country, routes, design mode, and the customer events API `Shopify.analytics`), then the bodies of the `{% stylesheet %}` tags rendered on the page in one `<style>`, then the `{% javascript %}` bodies, each in its own function, run on `DOMContentLoaded`.
 *
 * https://shopify.dev/docs/api/liquid/objects/content_for_header says only that it "dynamically returns all scripts required by Shopify" and that themes must not modify or parse it, and https://shopify.dev/docs/storefronts/themes/architecture/layouts says it goes in the `<head>`. Its content is therefore Debutify's: Shopify serves the stylesheet and javascript bodies as files and adds analytics and app scripts, which a preview leaves out, and the `Shopify` globals here are the ones themes are known to read, not a list from shopify.dev.
 */
export function contentForHeader (state: ShopifyState, globals: Record<string | symbol, unknown>): string {
  const shop = globals.shop as Record<string, unknown>
  const localization = globals.localization as { country?: { iso_code?: string } }
  const request = globals.request as { locale?: { iso_code?: string } }
  let header = '<script>var Shopify = Shopify || {};' +
    `Shopify.shop = ${scriptJson(shop.permanent_domain)};` +
    `Shopify.locale = ${scriptJson(request.locale?.iso_code)};` +
    `Shopify.currency = ${scriptJson({ active: shop.currency, rate: '1.0' })};` +
    `Shopify.country = ${scriptJson(localization.country?.iso_code)};` +
    'Shopify.designMode = false;Shopify.routes = Shopify.routes || {};' +
    // the root route of the view, with a trailing slash: `"/"` unprefixed and `"/fr-ca/"` under `/fr-ca`, as the parity store's header writes it (its recorded home pages, recordings `page-home` and `page-home-fr-ca`, which are not among the fork's fixtures)
    `Shopify.routes.root = ${scriptJson(`${state.request.prefix}/`)};` +
    // The customer events API, https://shopify.dev/docs/api/web-pixels-api/emitting-data: on the online store `Shopify.analytics.publish(name, data)` publishes a custom event and `Shopify.analytics.visitor(info, options)` hands over the visitor's email or phone and "Returns `true` if the visitor method was successful, and returns `false` if the payload was rejected". Shopify's header defines both on every storefront, `publish` answering true as it queues (the parity store's recorded home page, recording `page-home`, in its web pixels manager script); with no pixels loaded here nothing is delivered, so `publish` keeps the event in `events` (which the storefront's sandbox mode reads) and answers true, and `visitor` answers whether it was given data. The page does not say what `publish` returns; `true` is the parity store's.
    'Shopify.analytics = Shopify.analytics || { events: [], publish: function (name, data) { this.events.push({ name: String(name), data: data }); return true; }, visitor: function (data, options) { return !!data; } };' +
    '</script>'
  const css = [...state.assets.stylesheets.values()].join('\n')
  if (css) header += `<style data-shopify="stylesheet-tags">${css.replace(/<\/style/gi, '<\\/style')}</style>`
  const scripts = [...state.assets.javascripts.values()].map(body => `(function () {\n${body}\n})();`).join('\n')
  if (scripts) header += `<script>document.addEventListener('DOMContentLoaded', function () {\n${scripts.replace(/<\/script/gi, '<\\/script')}\n});</script>`
  return header
}
