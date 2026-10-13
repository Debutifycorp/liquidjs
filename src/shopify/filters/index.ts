import { filters as engineFilters } from '../../filters'
import type { FilterHandler } from '../../template/filter-impl-options'
import type { Liquid } from '../../liquid'
import { shopifyState } from '../state'
import { own } from '../util/own'
import { SHOPIFY_FILTER_DOCS } from './registry.generated'
import type { FilterStatus, ShopifyFilterEntry, ShopifyFilterSet } from './types'
import { paginationFilters } from './pagination'
import { translateFilters } from './translate'
import { moneyFilters } from './money'
import { textFilters } from './text'
import { mediaFilters } from './media'
import { assetFilters } from './assets'
import { colorFilters } from './color'
import { fontFilters } from './font'

/** The Shopify filter implementations, one set per module. */
export const SHOPIFY_FILTER_SETS: ShopifyFilterSet[] = [
  paginationFilters,
  translateFilters,
  moneyFilters,
  textFilters,
  mediaFilters,
  assetFilters,
  colorFilters,
  fontFilters
]

export function shopifyFilterImplementations (): ShopifyFilterSet {
  return Object.assign({}, ...SHOPIFY_FILTER_SETS)
}

/** A Shopify filter this package does not implement: renders nothing and is reported. */
function stub (name: string): FilterHandler {
  return function () {
    shopifyState(this.context).report.stubbedFilter(name, this.token?.file)
    return ''
  }
}

/** Whether the plain engine provides `name`. An own-property check: `engineFilters` is a plain object, so `name in engineFilters` would also find `constructor` and `toString`. */
function engineProvides (name: string): boolean {
  return Object.prototype.hasOwnProperty.call(engineFilters, name)
}

/** Registers every implemented Shopify filter, and a stub for every other filter in Shopify's docs that the engine does not provide. */
export function registerShopifyFilters (liquid: Liquid) {
  const implementations = shopifyFilterImplementations()
  for (const [name, filter] of Object.entries(implementations)) liquid.registerFilter(name, filter.handler)
  for (const doc of SHOPIFY_FILTER_DOCS) {
    for (const name of [doc.name, ...doc.aliases]) {
      if (own(implementations, name) || engineProvides(name)) continue
      liquid.registerFilter(name, stub(name))
    }
  }
}

/** How closely `name` follows Shopify: its implementation's status, `engine` for a filter only the plain engine provides, `stub` for every other name (a documented filter this package does not implement, or no filter at all). Names are looked up as own properties, so `filterStatus('constructor')` is `stub`, not an inherited `Object` member. */
export function filterStatus (name: string): FilterStatus {
  const implementation = own(shopifyFilterImplementations(), name)
  if (implementation) return implementation.status
  return engineProvides(name) ? 'engine' : 'stub'
}

/** Every filter in Shopify's docs with its status in this package. */
export function shopifyFilterRegistry (): ShopifyFilterEntry[] {
  return SHOPIFY_FILTER_DOCS.map(doc => ({ ...doc, status: filterStatus(doc.name) }))
}
