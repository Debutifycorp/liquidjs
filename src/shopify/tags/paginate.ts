import { Tag } from '../../template/tag'
import { Hash } from '../../template/hash'
import type { Template } from '../../template'
import type { Liquid } from '../../liquid'
import type { Parser } from '../../parser'
import type { Context } from '../../context'
import type { Emitter } from '../../emitters'
import type { TagToken, TopLevelToken, ValueToken } from '../../tokens'
import { evalToken } from '../../render'
import { isTagToken, toEnumerable, toValue } from '../../util'
import { shopifyState } from '../state'

export interface PaginatePart {
  title: string
  url: string | null
  is_link: boolean
}

/** The `paginate` object. https://shopify.dev/docs/api/liquid/objects/paginate */
export interface Paginate {
  current_offset: number
  current_page: number
  items: number
  next: PaginatePart | null
  page_param: string
  page_size: number
  pages: number
  parts: PaginatePart[]
  previous: PaginatePart | null
}

/** The most items `paginate` reaches. https://shopify.dev/docs/api/liquid/tags/paginate ("to the 25,000th item in the array and no further") and https://shopify.dev/docs/api/liquid/objects/paginate (`items`, `pages` and `current_page` are limited to 25,000, `current_offset` to 24,999). What Shopify does with a `?page=` past the limit is not pinned by shopify.dev: this package shows the last page it reaches. */
export const PAGINATION_LIMIT = 25000

/**
 * The `paginate` object. Pages around the current one get links (a page is in the window when it is fewer than `windowSize` pages from the current one, which reproduces the `window_size: 1` example on https://shopify.dev/docs/api/liquid/tags/paginate: 7 pages on page 1 give `1 … 7 Next`); the first and last page always do; each gap collapses into one `&hellip;` part. The default window of 3 is not pinned by shopify.dev: the 4-page examples on the paginate and default_pagination pages show every page, which a window of 3 also does. The part titles `Next &raquo;` and `&laquo; Previous` are the ones on https://shopify.dev/docs/api/liquid/filters/default_pagination.
 *
 * A single page still gets a `current` part (not pinned), and the shape follows https://shopify.dev/docs/api/liquid/objects/paginate and https://shopify.dev/docs/api/liquid/objects/part.
 */
export function buildPaginate (items: number, pageSize: number, currentPage: number, path: string, windowSize = 3): Paginate {
  items = Math.min(items, PAGINATION_LIMIT)
  currentPage = Math.min(currentPage, PAGINATION_LIMIT)
  const pages = items === 0 ? 0 : Math.ceil(items / pageSize)
  const url = (page: number) => `${path}?page=${page}`
  const parts: PaginatePart[] = []
  let gap = false
  for (let page = 1; page <= pages; page++) {
    if (page === currentPage) {
      parts.push({ title: String(page), url: null, is_link: false })
      gap = false
    } else if (page === 1 || page === pages || Math.abs(page - currentPage) < windowSize) {
      parts.push({ title: String(page), url: url(page), is_link: true })
      gap = false
    } else if (!gap) {
      parts.push({ title: '&hellip;', url: null, is_link: false })
      gap = true
    }
  }
  return {
    current_offset: Math.min((currentPage - 1) * pageSize, PAGINATION_LIMIT - 1),
    current_page: currentPage,
    items,
    next: currentPage < pages ? { title: 'Next &raquo;', url: url(currentPage + 1), is_link: true } : null,
    // always `page`: shopify.dev says a list setting or metafield list gets a unique key appended (`page_a9e329dc`) without saying how it is made, so that is not reproduced
    page_param: 'page',
    page_size: pageSize,
    pages,
    parts,
    previous: currentPage > 1 ? { title: '&laquo; Previous', url: url(currentPage - 1), is_link: true } : null
  }
}

/** A copy of `root` with the value at `path` replaced, keeping each object's prototype (so Drops stay Drops). The value is defined on the copy itself, so a Drop whose property is a getter-only accessor on its prototype can be replaced too. */
function replaceAt (root: unknown, path: string[], value: unknown): unknown {
  if (!path.length) return value
  const source = (root && typeof root === 'object' ? root : {}) as Record<PropertyKey, unknown>
  const descriptors = Object.getOwnPropertyDescriptors(source)
  for (const key of Reflect.ownKeys(descriptors)) descriptors[key as string].configurable = true
  const copy = Object.create(Object.getPrototypeOf(source), descriptors) as Record<string, unknown>
  Object.defineProperty(copy, path[0], { value: replaceAt(source[path[0]], path.slice(1), value), enumerable: true, configurable: true, writable: true })
  return copy
}

/** `{% paginate array by size %}`: the array, as the block sees it, holds the current page only, and `paginate` describes the pages. https://shopify.dev/docs/api/liquid/tags/paginate */
export class PaginateTag extends Tag {
  private readonly collection: ValueToken
  private readonly path?: string[]
  private readonly pageSize: ValueToken
  private readonly hash: Hash
  private readonly templates: Template[] = []

  public constructor (token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(token, remainTokens, liquid)
    const tokenizer = this.tokenizer
    const collection = tokenizer.readValue()
    const by = tokenizer.readIdentifier()
    const pageSize = tokenizer.readValue()
    if (!collection || by.content !== 'by' || !pageSize) throw new Error("Syntax Error in 'paginate' - Valid syntax: paginate [collection] by [number]")
    this.collection = collection
    this.pageSize = pageSize
    const text = collection.getText()
    if (/^[\w-]+(\.[\w-]+)*$/.test(text)) this.path = text.split('.')
    this.hash = new Hash(tokenizer, liquid.options.keyValueSeparator)
    while (remainTokens.length) {
      const next = remainTokens.shift()!
      if (isTagToken(next) && next.name === 'endpaginate') return
      this.templates.push(parser.parseToken(next, remainTokens))
    }
    throw new Error(`tag ${token.getText()} not closed`)
  }

  /** The total number of items. shopify.dev's examples (https://shopify.dev/docs/api/liquid/tags/paginate, https://shopify.dev/docs/api/liquid/objects/part and https://shopify.dev/docs/api/liquid/filters/default_pagination) give `collection.products` as one page of products, or none, next to `collection.products_count: 19`, and expect the pages of all 19: `<name>_count` beside the array is the total when it is a number, and the array's own size otherwise. Whether Shopify reads it this way is not pinned. */
  private * totalItems (ctx: Context, items: unknown[]): Generator<unknown, number, unknown> {
    if (!this.path || this.path.length < 2) return items.length
    const parent = yield ctx._get(this.path.slice(0, -1))
    if (parent === undefined || parent === null) return items.length
    const count = toValue(yield ctx._getFromScope(parent, [`${this.path[this.path.length - 1]}_count`], false))
    return typeof count === 'number' && Number.isFinite(count) && count >= 0 ? Math.floor(count) : items.length
  }

  public * render (ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    const state = shopifyState(ctx)
    const items = toEnumerable(yield evalToken(this.collection, ctx))
    // https://shopify.dev/docs/api/liquid/tags/paginate says the page size is between 1 and 250; what Shopify does outside that range (0, a negative number, 300) is not pinned, so this package clamps into it
    const pageSize = Math.min(250, Math.max(1, Math.floor(Number(toValue(yield evalToken(this.pageSize, ctx))) || 1)))
    const options = (yield this.hash.render(ctx)) as Record<string, unknown>
    const windowSize = Number(toValue(options.window_size)) || 3
    const page = Math.min(Math.max(1, Math.floor(state.request.page) || 1), PAGINATION_LIMIT)
    const offset = (page - 1) * pageSize
    const total: number = (yield * this.totalItems(ctx, items)) as number
    const scope: Record<string, unknown> = { paginate: buildPaginate(total, pageSize, page, state.request.path, windowSize) }
    if (this.path) {
      // an array as long as the total is the whole list and gets sliced; a shorter one is taken to be the page the host already fetched
      const pageItems = items.length >= total ? items.slice(offset, Math.min(offset + pageSize, PAGINATION_LIMIT)) : items
      const [root, ...rest] = this.path
      scope[root] = replaceAt(yield ctx._get([root]), rest, pageItems)
    }
    ctx.push(scope)
    yield this.liquid.renderer.renderTemplates(this.templates, ctx, emitter)
    ctx.pop()
  }

  public * children (): Generator<unknown, Template[]> {
    return this.templates
  }
}
