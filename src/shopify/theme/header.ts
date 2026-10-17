import type { ShopifyState } from '../state'
import { escapeHtml } from '../util/html'
import { BUNDLED_FILE, CompiledAssets, SECTION_FILE } from './compiled-assets'

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
 * A minimal `content_for_header`: the `hreflang` links of the page in every market and language (https://shopify.dev/docs/storefronts/themes/seo/hreflang, which says Shopify adds them through `content_for_header`; `state.request.alternates` holds them and the parity store prints them first, one a line, before its scripts), then the `window.Shopify` globals themes read (shop, locale, currency, country, routes, design mode, and the customer events API `Shopify.analytics`), then the page's `{% stylesheet %}` and `{% javascript %}` bodies.
 *
 * With `compiled` (the address the theme's compiled files are served under, and the files), the bodies are linked as the parity store links them, last in its `content_for_header` (recordings of Horizon 4.3.0 and Dawn 16.0.0): `<link rel="stylesheet" media="screen" href="<url>styles.css?v=<version>">` when the theme has a stylesheet in a section, block or snippet (on every page, as the file holds them all), then `<script id="sections-script" data-sections="<names>" defer="defer" src="<url>scripts.js?v=<version>"></script>`, naming the sections rendered on the page that have a `{% javascript %}` in the order first rendered (`data-sections="main-collection"` on Horizon's collection pages, `"header"` on every page of Dawn), when there are any. The bodies those files do not hold are still inlined after them: a stylesheet of a layout or a template, which Shopify does not bundle, and the javascript of blocks and snippets, whose files (`block-scripts.js`, `snippet-scripts.js`) no recording shows. Without `compiled`, every stylesheet body rendered on the page is inlined in one `<style>`, then every javascript body, each in its own function, run on `DOMContentLoaded`. Each inlined javascript body runs in a `try` that logs its error (`console.error`), as the parity store's compiled `scripts.js` runs each section's, so one that throws does not stop the others (shopify.dev: each body is wrapped so "runtime exceptions won't affect other sections").
 *
 * https://shopify.dev/docs/api/liquid/objects/content_for_header says only that it "dynamically returns all scripts required by Shopify" and that themes must not modify or parse it, and https://shopify.dev/docs/storefronts/themes/architecture/layouts says it goes in the `<head>`. Its content is therefore Debutify's: Shopify adds analytics and app scripts, which a preview leaves out, and the `Shopify` globals here are the ones themes are known to read, not a list from shopify.dev.
 */
export function contentForHeader (state: ShopifyState, globals: Record<string | symbol, unknown>, compiled?: { url: string, assets: CompiledAssets }): string {
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
  const styles = compiled?.assets.styles
  if (compiled && styles) header += `<link rel="stylesheet" media="screen" href="${escapeHtml(`${compiled.url}styles.css?v=${styles.version}`)}">`
  // a stylesheet the linked file holds is not inlined; one of a layout or template is
  const css = [...state.assets.stylesheets].filter(([file]) => !(styles && BUNDLED_FILE.test(file))).map(([, body]) => body).join('\n')
  if (css) header += `<style data-shopify="stylesheet-tags">${css.replace(/<\/style/gi, '<\\/style')}</style>`
  const compiledScripts = compiled?.assets.scripts
  // a section's javascript is in the linked file (a blank one is in neither); a block's or a snippet's is inlined
  const linked = (file: string) => !!compiledScripts && SECTION_FILE.test(file)
  const names = [...state.assets.javascripts].filter(([file, body]) => linked(file) && body.trim() !== '').map(([file]) => SECTION_FILE.exec(file)![1])
  if (compiled && compiledScripts && names.length) header += `<script id="sections-script" data-sections="${escapeHtml(names.join(','))}" defer="defer" src="${escapeHtml(`${compiled.url}scripts.js?v=${compiledScripts.version}`)}"></script>`
  const scripts = [...state.assets.javascripts].filter(([file]) => !linked(file)).map(([, body]) => `(function () {\ntry {\n${body}\n} catch (e) { console.error(e); }\n})();`).join('\n')
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
