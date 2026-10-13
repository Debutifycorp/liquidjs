import type { FilterHandler } from '../../template/filter-impl-options'

/** One filter as Shopify's theme-liquid-docs describe it. */
export interface ShopifyFilterDoc {
  name: string
  aliases: string[]
  category: string
  deprecated: boolean
  syntax: string
}

/**
 * How closely a filter follows Shopify: `exact` (matches output recorded from Shopify on Debutify's parity suite), `approx` (renders sensibly, known or suspected to differ), `stub` (renders nothing and is reported), `engine` (a standard Liquid filter the engine provides, checked by liquid-spec).
 */
export type FilterStatus = 'exact' | 'approx' | 'stub' | 'engine'

export interface ShopifyFilter {
  status: 'exact' | 'approx'
  handler: FilterHandler
}

export type ShopifyFilterSet = Record<string, ShopifyFilter>

export interface ShopifyFilterEntry extends ShopifyFilterDoc {
  status: FilterStatus
}
