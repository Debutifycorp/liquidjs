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

/** Pages around the current one get links; the first and last always do; gaps collapse into one `&hellip;` part. https://shopify.dev/docs/api/liquid/objects/paginate shows the shape of the parts; the window around the current page is not pinned by shopify.dev beyond the examples on https://shopify.dev/docs/api/liquid/tags/paginate and https://shopify.dev/docs/api/liquid/filters/default_pagination. */
export function buildPaginate (items: number, pageSize: number, currentPage: number, path: string, windowSize = 3): Paginate {
  const pages = items === 0 ? 0 : Math.ceil(items / pageSize)
  const url = (page: number) => `${path}?page=${page}`
  const parts: PaginatePart[] = []
  let gap = false
  for (let page = 1; page <= pages; page++) {
    if (page === currentPage) {
      parts.push({ title: String(page), url: null, is_link: false })
      gap = false
    } else if (page === 1 || page === pages || Math.abs(page - currentPage) <= windowSize) {
      parts.push({ title: String(page), url: url(page), is_link: true })
      gap = false
    } else if (!gap) {
      parts.push({ title: '&hellip;', url: null, is_link: false })
      gap = true
    }
  }
  return {
    current_offset: (currentPage - 1) * pageSize,
    current_page: currentPage,
    items,
    next: currentPage < pages ? { title: 'Next &raquo;', url: url(currentPage + 1), is_link: true } : null,
    page_param: 'page',
    page_size: pageSize,
    pages,
    parts,
    previous: currentPage > 1 ? { title: '&laquo; Previous', url: url(currentPage - 1), is_link: true } : null
  }
}

/** A copy of `root` with the value at `path` replaced, keeping each object's prototype (so Drops stay Drops). */
function replaceAt (root: unknown, path: string[], value: unknown): unknown {
  if (!path.length) return value
  const source = (root && typeof root === 'object' ? root : {}) as Record<string, unknown>
  const copy = Object.assign(Object.create(Object.getPrototypeOf(source)), source) as Record<string, unknown>
  copy[path[0]] = replaceAt(source[path[0]], path.slice(1), value)
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

  public * render (ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    const state = shopifyState(ctx)
    const items = toEnumerable(yield evalToken(this.collection, ctx))
    const pageSize = Math.min(250, Math.max(1, Math.floor(Number(toValue(yield evalToken(this.pageSize, ctx))) || 1)))
    const options = (yield this.hash.render(ctx)) as Record<string, unknown>
    const windowSize = Number(toValue(options.window_size)) || 3
    const page = Math.max(1, Math.floor(state.request.page) || 1)
    const offset = (page - 1) * pageSize
    const scope: Record<string, unknown> = { paginate: buildPaginate(items.length, pageSize, page, state.request.path, windowSize) }
    if (this.path) {
      const [root, ...rest] = this.path
      scope[root] = replaceAt(yield ctx._get([root]), rest, items.slice(offset, offset + pageSize))
    }
    ctx.push(scope)
    yield this.liquid.renderer.renderTemplates(this.templates, ctx, emitter)
    ctx.pop()
  }

  public * children (): Generator<unknown, Template[]> {
    return this.templates
  }
}
