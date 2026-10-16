import { NullDrop } from '../../drop'
import { filters as engineFilters } from '../../filters'
import type { FilterImpl } from '../../template/filter-impl-options'
import { isBuiltProduct, isBuiltVariant } from '../store/build'
import { cartLiquidJson, isBuiltCart, isBuiltLine, lineItemJson } from '../store/cart'
import { productLiquidJson, variantLiquidJson } from '../store/product-json'
import type { ShopifyFilterSet } from './types'

const ESCAPES: Record<string, string> = { '/': '\\/', '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029' }

/**
 * JSON text with `/` written as `\/` and `<`, `>`, `&`, U+2028 and U+2029 as `\uXXXX` escapes. These characters can only be inside a JSON string, where each escape reads back as the same character, so the JSON value is unchanged; the text can no longer end a `<script>` block (`</script>`), open a tag or an entity, or break a script that reads it as JavaScript.
 */
export function escapeJson (json: string): string {
  return json.replace(/[/<>&\u2028\u2029]/g, ch => ESCAPES[ch])
}

type JsonFilter = (this: FilterImpl, value: unknown, space?: number) => string | undefined

/** A product, or a list of them (`collection.products`), as the parity store prints it (`productLiquidJson`; fixtures `probe-product-default`, `probe-product-en-ca` and `probe-product-en-eu-hoodie`), which is not the `/products/<handle>.js` object. A variant, or a list of them (`product.variants`), prints as in `product | json` (`variantLiquidJson`; scenarios `page-product` and `page-product-variant`). Any other value is left as it is. */
const printedProducts = (value: unknown): unknown => isBuiltProduct(value) ? productLiquidJson(value) : isBuiltVariant(value) ? variantLiquidJson(value) : Array.isArray(value) && value.some(item => isBuiltProduct(item) || isBuiltVariant(item)) ? value.map(printedProducts) : value

/** A cart built for a page (`cart`), as the parity store prints it (`cartLiquidJson`; fixtures `ajax-cart-session` and `ajax-cart-en-ca`), which is neither the engine's cart object nor the `/cart.js` answer. A line item of the cart, or a list of them (`cart.items`), prints as a line of that answer (`lineItemJson` in its `liquid` form): no recording prints a line or the list on its own, so this is the line the cart holds, not a pinned shape. Any other value is left as it is. */
const printedCart = (value: unknown): unknown => isBuiltCart(value) ? cartLiquidJson(value) : isBuiltLine(value) ? lineItemJson(value, 'liquid') : Array.isArray(value) && value.some(isBuiltLine) ? value.map(printedCart) : value

/** The engine's filter, with its output escaped by `escapeJson`. The longer output is charged to the memory limit. */
function escaping (name: 'json' | 'jsonify' | 'inspect') {
  const engine = engineFilters[name] as unknown as JsonFilter
  return function (this: FilterImpl, value: unknown, space?: number) {
    const json = engine.call(this, name === 'json' ? printedCart(printedProducts(value)) : value, space)
    // Shopify writes nil as `null` (the parity store prints `{{ product.selected_selling_plan.id | json }}` on a product with no selected plan as `null`, fixture `probe-product-default`; https://shopify.dev/docs/api/liquid/filters/json shows nil fields as `null` in its product example); the engine has no text for `undefined`, which would leave `"key":,` in a JSON a theme builds, and prints the `nil` literal (a `NullDrop`) as `{}`. `jsonify` and `inspect` keep printing nothing for nil.
    if (name === 'json' && (json === undefined || value instanceof NullDrop)) return 'null'
    if (typeof json !== 'string') return json
    const escaped = escapeJson(json)
    this.context.memoryLimit.use(escaped.length - json.length)
    return escaped
  }
}

/**
 * `json` as Shopify documents it, https://shopify.dev/docs/api/liquid/filters/json ("Converts a string, or object, into JSON format"), plus the engine's `jsonify` and `inspect`, with the characters `escapeJson` lists escaped. Themes print `json` inside `<script type="application/json">` blocks and attributes, so a stored value or key such as `</script><img onerror=…>` would otherwise end the block and run.
 *
 * `/` as `\/` is Shopify's own output: the Dawn pages recorded in liquid-spec (for example `specs/shopify_theme_dawn/index-header/expected.html`, at the revision pinned in spec/liquid-spec/Gemfile) print `"url": "https:\/\/shop1…"` for `{{ request.origin | append: page.url | json }}`. shopify.dev says nothing about escaping, and no recording holds a `json` output with `<`, `>`, `&`, U+2028 or U+2029 in it (searched in `shopify_production_recordings/recorded_specs.yml` and the Dawn expected pages); the only trace is recorded markup in the Dawn spec environments (for example `specs/shopify_theme_dawn/index-header/environment.yml`), where a province list written as JSON carries `&` as `\u0026`, the escaping of Ruby on Rails's JSON encoder. Escaping those characters is Debutify's safety choice, made in `json`, `jsonify` and `inspect` whatever the trust settings. The filters stay `approx`.
 */
export const jsonFilters: ShopifyFilterSet = {
  json: { status: 'approx', handler: escaping('json') },
  jsonify: { status: 'approx', handler: escaping('jsonify') },
  inspect: { status: 'approx', handler: escaping('inspect') }
}
