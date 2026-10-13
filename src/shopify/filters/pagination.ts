import type { FilterImpl } from '../../template/filter-impl-options'
import { stringify, toValue } from '../../util'
import { splitArgs } from '../util/args'
import { escapeHtml } from '../util/html'
import type { Paginate } from '../tags/paginate'
import type { ShopifyFilterSet } from './types'

/** `default_pagination`, in the markup of the examples on https://shopify.dev/docs/api/liquid/filters/default_pagination (links carry `title=""`). Page windows larger than the documented example are not pinned by shopify.dev. */
function defaultPagination (this: FilterImpl, input: unknown, ...args: unknown[]): string {
  const paginate = toValue(input) as Paginate | undefined
  if (!paginate || !Array.isArray(paginate.parts)) return ''
  const { named } = splitArgs(args)
  // the anchor is escaped for the attribute; the `previous` and `next` texts are not, because they may carry entities (`&laquo;`) as the default titles do
  const anchor = named.anchor ? `#${escapeHtml(named.anchor)}` : ''
  const link = (url: string | null, text: string) => `<a href="${url}${anchor}" title="">${text}</a>`
  const html: string[] = []
  if (paginate.previous?.url) html.push(`<span class="prev">${link(paginate.previous.url, named.previous ? stringify(named.previous) : paginate.previous.title)}</span>`)
  for (const part of paginate.parts) {
    if (part.is_link) html.push(`<span class="page">${link(part.url, part.title)}</span>`)
    else if (part.title === String(paginate.current_page)) html.push(`<span class="page current">${part.title}</span>`)
    else html.push(`<span class="deco">${part.title}</span>`)
  }
  if (paginate.next?.url) html.push(`<span class="next">${link(paginate.next.url, named.next ? stringify(named.next) : paginate.next.title)}</span>`)
  return html.join(' ')
}

export const paginationFilters: ShopifyFilterSet = {
  default_pagination: { status: 'approx', handler: defaultPagination }
}
