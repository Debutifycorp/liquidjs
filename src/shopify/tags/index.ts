import type { Liquid } from '../../liquid'
import type { TagClass } from '../../template/tag'

/** Shopify's platform tags, by name. */
export const SHOPIFY_TAGS: Record<string, TagClass> = {}

export function registerShopifyTags (liquid: Liquid) {
  for (const [name, tag] of Object.entries(SHOPIFY_TAGS)) liquid.registerTag(name, tag)
}
