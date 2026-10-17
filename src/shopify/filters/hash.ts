import { createHash } from 'crypto'
import type { FilterImpl } from '../../template/filter-impl-options'
import { stringify } from '../../util'
import type { ShopifyFilterSet } from './types'

/** The MD5 digest of the string as 32 lower-case hex digits, https://shopify.dev/docs/api/liquid/filters/md5 (`{{ '' | md5 }}` prints `d41d8cd98f00b204e9800998ecf8427e`). The string is hashed as UTF-8, and nil hashes as the empty string. The parity store prints the same digests: Horizon's product cards are `<a id="{{ product_card_id | md5 }}">`, and every card of its recorded collection page (private parity recording `page-collection` of Horizon) holds the MD5 of `product-card-link-<block id>-<product id>`. */
function md5 (this: FilterImpl, input: unknown) {
  const text = stringify(input)
  this.context.memoryLimit.use(text.length)
  return createHash('md5').update(text, 'utf8').digest('hex')
}

export const hashFilters: ShopifyFilterSet = {
  md5: { status: 'exact', handler: md5 }
}
