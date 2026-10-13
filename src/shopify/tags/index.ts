import type { Liquid } from '../../liquid'
import type { TagClass } from '../../template/tag'
import { SchemaTag, JavascriptTag, StylesheetTag, DocTag } from './raw'
import { StyleTag } from './style'
import { ShopifyLayoutTag } from './layout'
import { FormTag } from './form'
import { PaginateTag } from './paginate'

/** Shopify's platform tags, by name. */
export const SHOPIFY_TAGS: Record<string, TagClass> = {
  schema: SchemaTag,
  javascript: JavascriptTag,
  stylesheet: StylesheetTag,
  doc: DocTag,
  style: StyleTag,
  layout: ShopifyLayoutTag,
  form: FormTag,
  paginate: PaginateTag
}

export function registerShopifyTags (liquid: Liquid) {
  for (const [name, tag] of Object.entries(SHOPIFY_TAGS)) liquid.registerTag(name, tag)
}
