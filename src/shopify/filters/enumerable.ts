import { Drop } from '../../drop/drop'
import { filters as engineFilters } from '../../filters'
import type { FilterHandler, FilterImpl } from '../../template/filter-impl-options'
import { isArrayLike, isIterable } from '../../util'
import type { ShopifyFilterSet } from './types'

const engineFirst = engineFilters.first as FilterHandler

/**
 * `first`, giving the first item of a drop that iterates. Ruby Liquid's `first` is `array.first if array.respond_to?(:first)` (Shopify/liquid, `lib/liquid/standardfilters.rb`), which any enumerable answers, so `settings.color_schemes | first` gives the first scheme and an empty one gives nil. The engine's `first` reads only arrays and strings. Arrays, strings and everything else go to the engine's `first`; the root entry keeps upstream LiquidJS's `first`.
 * https://shopify.dev/docs/api/liquid/filters/first
 */
const firstFilter: FilterHandler = function (this: FilterImpl, value: unknown, ...rest: unknown[]) {
  if (value instanceof Drop && !isArrayLike(value) && isIterable(value)) {
    const next = value[Symbol.iterator]().next()
    return next.done ? undefined : next.value
  }
  return engineFirst.call(this, value, ...rest)
}

export const enumerableFilters: ShopifyFilterSet = {
  first: { status: 'approx', handler: firstFilter }
}
