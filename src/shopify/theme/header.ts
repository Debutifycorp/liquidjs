import type { ShopifyState } from '../state'

/** Where `content_for_header` goes while the layout renders; replaced once the whole page has rendered, so it can include every section's `{% stylesheet %}` and `{% javascript %}`. */
export const HEADER_MARKER = '\u0000content_for_header\u0000'

/** JSON safe inside `<script>`; a missing value is `null`. */
function scriptJson (value: unknown): string {
  return JSON.stringify(value ?? null).replace(/</g, '\\u003c')
}

/**
 * A minimal `content_for_header`: the `window.Shopify` globals themes read (shop, locale, currency, country, routes, design mode), then the bodies of the `{% stylesheet %}` tags rendered on the page in one `<style>`, then the `{% javascript %}` bodies, each in its own function, run on `DOMContentLoaded`.
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
    'Shopify.designMode = false;Shopify.routes = Shopify.routes || {};Shopify.routes.root = "/";</script>'
  const css = [...state.assets.stylesheets.values()].join('\n')
  if (css) header += `<style data-shopify="stylesheet-tags">${css.replace(/<\/style/gi, '<\\/style')}</style>`
  const scripts = [...state.assets.javascripts.values()].map(body => `(function () {\n${body}\n})();`).join('\n')
  if (scripts) header += `<script>document.addEventListener('DOMContentLoaded', function () {\n${scripts.replace(/<\/script/gi, '<\\/script')}\n});</script>`
  return header
}
