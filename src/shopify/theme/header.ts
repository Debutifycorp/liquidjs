import type { ShopifyState } from '../state'
import { escapeHtml } from '../util/html'

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

/** A currency rate as Ruby prints a float, which is how the parity store writes `Shopify.currency`'s `rate` (`"1.0"`, `"1.35"`, `"0.92"`, recordings `page-home`, `page-home-fr-ca` and `page-product-en-eu`). */
const rateText = (rate: number) => Number.isInteger(rate) ? rate.toFixed(1) : String(rate)

/**
 * A minimal `content_for_header`: the `hreflang` links of the page in every market and language (https://shopify.dev/docs/storefronts/themes/seo/hreflang, which says Shopify adds them through `content_for_header`; `state.request.alternates` holds them and the parity store prints them first, one a line, before its scripts), then the `window.Shopify` globals themes read (shop, locale, currency, country, routes, design mode, and the customer events API `Shopify.analytics`), then the bodies of the `{% stylesheet %}` tags rendered on the page in one `<style>`, then the `{% javascript %}` bodies, each in its own function, run on `DOMContentLoaded`.
 *
 * https://shopify.dev/docs/api/liquid/objects/content_for_header says only that it "dynamically returns all scripts required by Shopify" and that themes must not modify or parse it, and https://shopify.dev/docs/storefronts/themes/architecture/layouts says it goes in the `<head>`. Its content is therefore Debutify's: Shopify serves the stylesheet and javascript bodies as files and adds analytics and app scripts, which a preview leaves out, and the `Shopify` globals here are the ones themes are known to read, not a list from shopify.dev.
 */
export function contentForHeader (state: ShopifyState, globals: Record<string | symbol, unknown>): string {
  const shop = globals.shop as Record<string, unknown>
  const localization = globals.localization as { country?: { iso_code?: string } }
  const request = globals.request as { locale?: { iso_code?: string } }
  const links = (state.request.alternates ?? []).map(({ hreflang, path }) => `<link rel="alternate" hreflang="${escapeHtml(hreflang)}" href="${escapeHtml(`${state.request.origin}${path}`)}">\n`).join('')
  let header = links + '<script>var Shopify = Shopify || {};' +
    `Shopify.shop = ${scriptJson(shop.permanent_domain)};` +
    `Shopify.locale = ${scriptJson(request.locale?.iso_code)};` +
    // the currency and country of the shopper's market: `{"active":"CAD","rate":"1.35"}` and `"CA"` on the parity store's recorded Canadian French home page (recording `page-home-fr-ca`), the rate a string
    `Shopify.currency = ${scriptJson({ active: state.currency?.iso_code ?? shop.currency, rate: rateText(state.currency?.rate ?? 1) })};` +
    `Shopify.country = ${scriptJson(localization.country?.iso_code)};` +
    'Shopify.designMode = false;Shopify.routes = Shopify.routes || {};' +
    // the root route of the view, with a trailing slash: `"/"` unprefixed and `"/fr-ca/"` under `/fr-ca`, as the parity store's header writes it (its recorded home pages, recordings `page-home` and `page-home-fr-ca`, which are not among the fork's fixtures)
    `Shopify.routes.root = ${scriptJson(`${state.request.prefix}/`)};` +
    // The customer events API, https://shopify.dev/docs/api/web-pixels-api/emitting-data: on the online store `Shopify.analytics.publish(name, data, customData)` publishes a custom event and `Shopify.analytics.visitor(info, options)` hands over the visitor's email or phone and "Returns `true` if the visitor method was successful, and returns `false` if the payload was rejected". Shopify's header defines only `replayQueue` and `publish` up front, `publish` a closure that queues `[name, data, customData]` and answers true, and sets `visitor` once its web pixels manager loads (the parity store's recorded home page, recording `page-home`); the page does not say what `publish` returns, so `true` is the parity store's. Defining `visitor` up front, answering whether it was given data, is Debutify's own addition. With no pixels loaded here nothing is delivered: `publish` keeps the event in `events`, which the storefront's sandbox mode reads. Both are closures over `events`, as Shopify's `publish` is over its queue, so they work passed around or called detached.
    'Shopify.analytics = Shopify.analytics || (function () { var events = []; return { events: events, publish: function (name, data, customData) { events.push({ name: String(name), data: data, customData: customData }); return true; }, visitor: function (data, options) { return !!data; } }; })();' +
    '</script>'
  const css = [...state.assets.stylesheets.values()].join('\n')
  if (css) header += `<style data-shopify="stylesheet-tags">${css.replace(/<\/style/gi, '<\\/style')}</style>`
  const scripts = [...state.assets.javascripts.values()].map(body => `(function () {\n${body}\n})();`).join('\n')
  if (scripts) header += `<script>document.addEventListener('DOMContentLoaded', function () {\n${scripts.replace(/<\/script/gi, '<\\/script')}\n});</script>`
  return header
}

/** What `withStoreElements` stops at: the opening of a script, a style, a textarea or a comment, whose text it skips to the closing tag as the HTML parser does (a `<shopify-account` inside one is text, not an element), and the opening of an account element. */
const OPENING = /<(script|style|textarea)(?=[\s/>])|<!--|<shopify-account(?=[\s/>])/gi

/**
 * The page with Shopify's store element before every `<shopify-account>` element: `<shopify-store store-domain="<origin>" country="<country>" language="<language>"></shopify-store>` and a line break, right before the theme's `<shopify-account`, its indentation left before the store element. https://shopify.dev/docs/api/storefront-web-components/components/shopify-store says the element sets up "your credentials and market configuration for a storefront", with `store-domain` ("The myshopify.com domain of the store"), `country` and `language`, and https://shopify.dev/docs/storefronts/themes/customer-engagement/account-component says a theme prints only `<shopify-account>`; neither says that Shopify adds the store element. The parity store does, on every page of Horizon 4.3.0 and Dawn 16.0.0 (their private parity recordings), with the market's country and the page's language (`country="CA" language="fr"` under `/fr-ca`, `country="DE" language="en"` under `/en-eu`, as `Shopify.country` and `Shopify.locale` print them), and `store-domain` the address the page is served at: the parity store's own on its preview, and `https://kith.com` on kith.com, whose `Shopify.shop` is `kithnyc.myshopify.com`, so not the myshopify.com domain the page names. Debutify's, not pinned: an element in a script, a style, a textarea or a comment gets none (its text is not an element), every account element gets its own (each recorded page has one), and a section rendered alone gets none.
 */
export function withStoreElements (html: string, state: ShopifyState, globals: Record<string | symbol, unknown>): string {
  if (!/<shopify-account[\s/>]/i.test(html)) return html
  const localization = globals.localization as { country?: { iso_code?: string } } | undefined
  const request = globals.request as { locale?: { iso_code?: string } } | undefined
  const shop = globals.shop as { domain?: unknown } | undefined
  const domain = state.request.origin || `https://${String(shop?.domain ?? '')}`
  const store = `<shopify-store store-domain="${escapeHtml(domain)}" country="${escapeHtml(localization?.country?.iso_code ?? '')}" language="${escapeHtml(request?.locale?.iso_code ?? '')}"></shopify-store>\n`
  // one pass: each search starts where the last one ended, and a text element with no closing tag ends the search, so a page full of unclosed scripts costs no more than one that closes them
  const opening = new RegExp(OPENING.source, OPENING.flags)
  let out = ''
  let copied = 0
  for (let found = opening.exec(html); found; found = opening.exec(html)) {
    if (found[0] === '<!--') {
      const end = html.indexOf('-->', opening.lastIndex)
      if (end === -1) break
      opening.lastIndex = end + 3
    } else if (found[1]) {
      const closing = new RegExp(`</${found[1]}(?=[\\s/>])`, 'gi')
      closing.lastIndex = opening.lastIndex
      if (!closing.exec(html)) break
      opening.lastIndex = closing.lastIndex
    } else {
      out += html.slice(copied, found.index) + store
      copied = found.index
    }
  }
  return out + html.slice(copied)
}
