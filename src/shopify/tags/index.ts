import type { Liquid } from '../../liquid'
import type { TagClass } from '../../template/tag'
import { SchemaTag, JavascriptTag, StylesheetTag, DocTag } from './raw'
import { StyleTag } from './style'
import { ShopifyLayoutTag } from './layout'
import { FormTag } from './form'
import { PaginateTag } from './paginate'
import { SectionTag, SectionsTag } from './section'
import { ContentForTag } from './content-for'
import { ShopifyTablerowTag } from './tablerow'
import { ShopifyRenderTag } from './render'
import { ShopifyIncludeTag } from './include'
import { registerBlankText } from './blank'

/** Shopify's platform tags, by name. */
export const SHOPIFY_TAGS: Readonly<Record<string, TagClass>> = Object.freeze({
  schema: SchemaTag,
  javascript: JavascriptTag,
  stylesheet: StylesheetTag,
  doc: DocTag,
  style: StyleTag,
  layout: ShopifyLayoutTag,
  form: FormTag,
  paginate: PaginateTag,
  section: SectionTag,
  sections: SectionsTag,
  content_for: ContentForTag,
  tablerow: ShopifyTablerowTag,
  render: ShopifyRenderTag,
  include: ShopifyIncludeTag
})

export function registerShopifyTags (liquid: Liquid) {
  for (const [name, tag] of Object.entries(SHOPIFY_TAGS)) liquid.registerTag(name, tag)
  registerBlankText(liquid)
}
