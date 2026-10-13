import { Tag } from '../../template/tag'
import { Hash } from '../../template/hash'
import type { Liquid } from '../../liquid'
import type { Context } from '../../context'
import type { TagToken, TopLevelToken, ValueToken } from '../../tokens'
import { evalToken } from '../../render'
import { isNil, stringify } from '../../util'
import { shopifyState } from '../state'

/**
 * `{% content_for 'blocks' %}` renders the theme blocks of the current section or block in their saved order; `{% content_for 'block', type: 'slide', id: 'slide-1', color: '#111' %}` renders one static block, with the extra parameters as variables inside it. https://shopify.dev/docs/api/liquid/tags/content_for
 *
 * Outside `renderPage` there is no theme to take blocks from, so the tag renders nothing and the report says so. An unknown first argument, and a `'block'` without its `type` or `id`, are render errors printed inline; shopify.dev does not word them. Only nil and an empty string are "without": an `id` of `0` (a `for` loop's `forloop.index0`) is an id.
 */
export class ContentForTag extends Tag {
  private readonly kind: ValueToken
  private readonly hash: Hash

  public constructor (token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(token, remainTokens, liquid)
    const kind = this.tokenizer.readValue()
    if (!kind) throw new Error("content_for needs 'blocks' or 'block'")
    this.kind = kind
    this.tokenizer.skipBlank()
    if (this.tokenizer.peek() === ',') this.tokenizer.advance()
    this.hash = new Hash(this.tokenizer, liquid.options.keyValueSeparator)
  }

  public * render (ctx: Context): Generator<unknown, string, unknown> {
    const state = shopifyState(ctx)
    const kind = stringify(yield evalToken(this.kind, ctx))
    if (!state.runtime) {
      state.report.unsupported('content_for', `{% content_for '${kind}' %} outside renderPage`)
      return ''
    }
    if (kind === 'blocks') return (yield state.runtime.renderBlocks(ctx)) as string
    if (kind !== 'block') throw new Error(`content_for: unknown type '${kind}'`)
    const params = (yield this.hash.render(ctx)) as Record<string, unknown>
    const { type, id, ...rest } = params
    const typeName = isNil(type) ? '' : stringify(type)
    const blockId = isNil(id) ? '' : stringify(id)
    if (!typeName || !blockId) throw new Error("content_for 'block' needs type and id")
    return (yield state.runtime.renderStaticBlock(typeName, blockId, rest, ctx)) as string
  }
}
