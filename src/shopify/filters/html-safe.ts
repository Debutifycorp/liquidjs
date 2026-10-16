import { filters as engineFilters } from '../../filters'
import type { FilterHandler, FilterImpl } from '../../template/filter-impl-options'
import { SafeHtmlDrop } from '../objects/safe-html'
import type { ShopifyFilterSet } from './types'

const engineDefault = engineFilters.default as FilterHandler

/**
 * `default`, keeping HTML-safe markup (`SafeHtmlDrop`) as it is when it has something to print. Ruby's `default` returns its input itself, so an HTML-safe string stays HTML-safe through `assign og_title = page_title | default: shop.name` and a later `| escape` leaves it alone; the engine's `default` hands back the drop's plain text, which `escape` would escape a second time. The parity store prints `Search: 5 results found for &quot;shirt&quot;` in `og:title` and `twitter:title` (recording `page-search`), which only an HTML-safe `page_title` gives. Anything else goes to the engine's `default`.
 * https://shopify.dev/docs/api/liquid/filters/default
 */
const defaultFilter: FilterHandler = function (this: FilterImpl, value: unknown, ...rest: unknown[]) {
  if (value instanceof SafeHtmlDrop && value.html.length) return value
  return engineDefault.call(this, value, ...rest)
}

export const htmlSafeFilters: ShopifyFilterSet = {
  default: { status: 'approx', handler: defaultFilter }
}
