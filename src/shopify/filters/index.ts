import type { Liquid } from '../../liquid'
import type { ShopifyFilterSet } from './types'

/** The Shopify filter implementations, one set per module; each filter module adds its set here. */
export const SHOPIFY_FILTER_SETS: ShopifyFilterSet[] = []

export function shopifyFilterImplementations (): ShopifyFilterSet {
  return Object.assign({}, ...SHOPIFY_FILTER_SETS)
}

/** Registers every implemented Shopify filter on `liquid`. */
export function registerShopifyFilters (liquid: Liquid) {
  for (const [name, filter] of Object.entries(shopifyFilterImplementations())) liquid.registerFilter(name, filter.handler)
}
