import { Drop } from '../../drop/drop'
import { filters as engineFilters } from '../../filters'
import type { FilterHandler, FilterImpl } from '../../template/filter-impl-options'
import { isArrayLike, isIterable, isNil, stringify, toArray } from '../../util'
import { equals, evalToken, isTruthy } from '../../render'
import { Tokenizer } from '../../parser'
import type { ShopifyFilterSet } from './types'

const engineFirst = engineFilters.first as FilterHandler
const engineConcat = engineFilters.concat as FilterHandler

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

/**
 * The first place in `arr` whose item matches, for `find`, `find_index` and `has`. Ruby Liquid reads `item[property]` and, with no target value, takes the first item for which it is truthy, otherwise the first for which it equals the target (Shopify/liquid, `lib/liquid/standardfilters.rb`, `filter_array`). For a string item Ruby's `String#[]` answers the property itself when the item contains it and nil when not (`'056'['56']` is `'56'`), which Horizon's type scale relies on: it pads the sizes to `056` and asks `find_index: '56'` for the place of 56 (snippets/theme-styles-variables.liquid), and Shopify prints `--font-size--h1: clamp(3.0rem, 5.6vw, 3.5rem)` for it (the parity store's recording of Horizon). The engine reads a property such as `56` as a literal and finds no string. Every other item (a hash, a drop) is read by the engine's own property lookup, so `where`-style use on objects is unchanged. The root entry keeps upstream LiquidJS's three filters.
 * https://shopify.dev/docs/api/liquid/filters/find, https://shopify.dev/docs/api/liquid/filters/find_index and https://shopify.dev/docs/api/liquid/filters/has
 */
function * search (this: FilterImpl, arr: unknown, property: unknown, expected: unknown): Generator<unknown, [number, unknown] | undefined, any> {
  const array = toArray(arr)
  const name = stringify(property)
  const token = new Tokenizer(name).readScopeValue()
  for (let index = 0; index < array.length; index++) {
    const item = array[index]
    const value = typeof item === 'string' ? (item.includes(name) ? name : undefined) : yield evalToken(token, this.context.spawn(item))
    if (isNil(expected) ? isTruthy(value, this.context) : yield equals(value, expected)) return [index, item]
  }
}

const findFilter: FilterHandler = function * (this: FilterImpl, arr: unknown, property: unknown, expected?: unknown) {
  const found = yield * search.call(this, arr, property, expected)
  return found ? found[1] : undefined
}

const findIndexFilter: FilterHandler = function * (this: FilterImpl, arr: unknown, property: unknown, expected?: unknown) {
  const found = yield * search.call(this, arr, property, expected)
  return found ? found[0] : undefined
}

const hasFilter: FilterHandler = function * (this: FilterImpl, arr: unknown, property: unknown, expected?: unknown) {
  return !!(yield * search.call(this, arr, property, expected))
}

/**
 * `concat`, keeping a drop that is not a list as one item. Ruby Liquid's `concat` wraps its input in an `InputIterator`, which turns an object that is not an array, hash or enumerable into a one-element list (`Array(input)`), so `product.featured_media | concat: other_media` starts with the media object (Shopify/liquid, `lib/liquid/standardfilters.rb`). The engine's `concat` unwraps a drop to the text it prints. An array, a nil, a string and everything else go to the engine's `concat`; the root entry keeps upstream LiquidJS's.
 * https://shopify.dev/docs/api/liquid/filters/concat
 */
const concatFilter: FilterHandler = function (this: FilterImpl, value: unknown, ...rest: unknown[]) {
  if (value instanceof Drop && !isArrayLike(value) && !isIterable(value)) {
    return engineConcat.call(this, [value], ...rest)
  }
  return engineConcat.call(this, value, ...rest)
}

export const enumerableFilters: ShopifyFilterSet = {
  first: { status: 'approx', handler: firstFilter },
  concat: { status: 'approx', handler: concatFilter },
  find: { status: 'approx', handler: findFilter },
  find_index: { status: 'approx', handler: findIndexFilter },
  has: { status: 'approx', handler: hasFilter }
}
