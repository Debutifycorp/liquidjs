import { Tag } from '../template/tag'
import type { TagClass } from '../template/tag'
import type { FilterHandler, FilterImplOptions } from '../template/filter-impl-options'
import type { TagToken, TopLevelToken } from '../tokens'
import type { Context } from '../context'
import type { Liquid } from '../liquid'
import { shopifyState } from './state'

/** A tag the engine does not know: renders nothing and is listed in the render report, so one unknown tag never blanks a section. Its `end…` tag, if any, is another unknown tag and behaves the same. This is Debutify's choice: Shopify fails the parse on an unknown tag (the `'error'` mode below), and shopify.dev does not describe either behaviour. */
export class UnknownTag extends Tag {
  public constructor (token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(token, remainTokens, liquid)
  }

  public render (ctx: Context) {
    shopifyState(ctx).report.unknownTag(this.name, this.token.file)
    return ''
  }
}

/** With `unknownTags: 'error'`: fails the parse with Shopify's message, `Unknown tag 'name'`, as Shopify Liquid does in every error mode (liquid-spec `specs/basics/error-handling.yml`: `unknown_tag_lax`, `unknown_tag_strict_parse_error`, `unknown_tag_strict2_parse_error`). shopify.dev does not document the message. */
function strictUnknownTag (name: string): TagClass {
  return class extends Tag {
    public constructor (token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
      super(token, remainTokens, liquid)
      throw new Error(`Unknown tag '${name}'`)
    }

    public render () {
      return ''
    }
  }
}

/** A filter neither Shopify's docs nor the engine know: passes its input through unchanged, as Shopify Liquid does (liquid-spec `specs/basics/error-handling.yml`: `unknown_filter_lax`, `unknown_filter_strict_in_liquid_ruby`), and is listed in the render report. shopify.dev does not document what an unknown filter does. */
function unknownFilter (name: string): FilterHandler {
  return function (value: unknown) {
    shopifyState(this.context).report.unknownFilter(name, this.token?.file)
    return value
  }
}

/**
 * Makes unknown filters and tags resolve to the fallbacks above. The engine looks names up in `liquid.filters` and `liquid.tags` at parse time, so both records are wrapped in a Proxy that answers for missing names; registered names are untouched. With `strictFilters` set (through the preset's `engine` option) the filter Proxy stays silent, so an unknown filter is a parse error as in the core.
 */
export function installFallbacks (liquid: Liquid, unknownTags: 'report' | 'error') {
  const filterCache = new Map<string, FilterHandler>()
  const filters = new Proxy(liquid.filters, {
    get (target, name) {
      if (typeof name !== 'string' || name in target || liquid.options.strictFilters) return (target as Record<string | symbol, FilterImplOptions>)[name]
      let handler = filterCache.get(name)
      if (!handler) {
        handler = unknownFilter(name)
        filterCache.set(name, handler)
      }
      return handler
    }
  })
  Object.defineProperty(liquid, 'filters', { value: filters })
  const tags = new Proxy(liquid.tags, {
    get (target, name) {
      if (typeof name !== 'string' || name in target) return (target as Record<string | symbol, TagClass>)[name]
      return unknownTags === 'report' ? UnknownTag : strictUnknownTag(name)
    }
  })
  Object.defineProperty(liquid, 'tags', { value: tags })
}
