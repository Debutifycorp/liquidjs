import { Drop } from '../../drop'
import { filters as engineFilters } from '../../filters'
import { toValue } from '../../util'
import type { FilterHandler, FilterImpl } from '../../template/filter-impl-options'
import { SafeHtmlDrop } from '../objects/safe-html'
import type { ShopifyFilterSet } from './types'

const engineDefault = engineFilters.default as FilterHandler

/** A drop that answers `empty?` with true (a settings object with no settings): Ruby's `default` takes the default for it, as for any input whose `empty?` is true. */
const isEmptyDrop = (value: Drop) => {
  const empty = (value as unknown as Record<string, unknown>)['empty?']
  return Boolean(typeof empty === 'function' ? empty.call(value) : empty)
}

/** A hash with no keys (`{}`, a store's empty `metafields`): Ruby's `default` takes it for empty (`input.respond_to?(:empty?) && input.empty?`), where the engine's prints it. Drops, arrays and strings are the engine's. */
const isEmptyHash = (value: unknown) => typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length === 0

/**
 * `default`, keeping HTML-safe markup (`SafeHtmlDrop`) as it is when it has something to print. Ruby's `default` returns its input itself, so an HTML-safe string stays HTML-safe through `assign og_title = page_title | default: shop.name` and a later `| escape` leaves it alone; the engine's `default` hands back the drop's plain text, which `escape` would escape a second time. The parity store prints `Search: 5 results found for &quot;shirt&quot;` in `og:title` and `twitter:title` (recording `page-search`), which only an HTML-safe `page_title` gives. Any other drop comes back as itself too when the engine would keep it, so `assign c = settings.colour | default: '#000'` still reads `c.red`, where the engine's `default` hands back the drop's printed value; a drop whose `empty?` is true, and an empty hash, get the default, as in Ruby. Anything else goes to the engine's `default`. The root entry keeps upstream LiquidJS's `default` Horizon's resource card assigns `card_image = product.featured_media.preview_image | default: product.featured_image` and passes it to `image_url`, which needs the image's width and height (the parity store prints `height` on those cards, private parity recordings of Horizon), where the engine would hand on the image's `src` text.
 * https://shopify.dev/docs/api/liquid/filters/default
 */
const defaultFilter: FilterHandler = function (this: FilterImpl, value: unknown, ...rest: unknown[]) {
  if (value instanceof SafeHtmlDrop && value.html.length) return value
  if (isEmptyHash(value)) return rest[0]
  if (value instanceof Drop) {
    if (isEmptyDrop(value)) return rest[0]
    const result = engineDefault.call(this, value, ...rest)
    return result === toValue(value) ? value : result
  }
  return engineDefault.call(this, value, ...rest)
}

export const htmlSafeFilters: ShopifyFilterSet = {
  default: { status: 'approx', handler: defaultFilter }
}
