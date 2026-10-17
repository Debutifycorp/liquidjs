import { Tag } from '../../template/tag'
import type { Liquid } from '../../liquid'
import type { Context } from '../../context'
import type { TagToken, TopLevelToken, ValueToken } from '../../tokens'
import { evalToken } from '../../render'
import { isNil, stringify } from '../../util'
import { ClosestScope, CLOSEST_TYPES } from '../objects/closest'
import { shopifyState } from '../state'

/**
 * `{% content_for 'blocks' %}` renders the theme blocks of the current section or block in their saved order; `{% content_for 'block', type: 'slide', id: 'slide-1', color: '#111' %}` renders one static block, with the extra parameters as variables inside it. https://shopify.dev/docs/api/liquid/tags/content_for
 *
 * Both take `closest.product: <product>` and the same for `collection`, `article`, `blog` and `page`, and `closest.metaobject.<definition_type>: <metaobject>`, which set what `closest` holds for the blocks they render and their settings; a `closest.` parameter of any other type is an error. https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks/dynamic-sources ("Passing resources down in Liquid using closest": "If the resource type doesn't match one of these parameters, then an error is returned"). Other parameters of `'blocks'` are ignored.
 *
 * Outside `renderPage` there is no theme to take blocks from, so the tag renders nothing and the report says so. An unknown first argument, and a `'block'` without its `type` or `id`, are render errors printed inline; shopify.dev does not word them. Only nil and an empty string are "without": an `id` of `0` (a `for` loop's `forloop.index0`) is an id.
 */
export class ContentForTag extends Tag {
  private readonly kind: ValueToken
  private readonly params: Array<[string, ValueToken | undefined]> = []

  public constructor (token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(token, remainTokens, liquid)
    const kind = this.tokenizer.readValue()
    if (!kind) throw new Error("content_for needs 'blocks' or 'block'")
    this.kind = kind
    const separator = liquid.options.keyValueSeparator
    for (;;) {
      this.tokenizer.skipBlank()
      if (this.tokenizer.peek() === ',') this.tokenizer.advance()
      // a parameter name may be a dotted path, as `closest.product` is
      let name = this.tokenizer.readIdentifier().getText()
      if (!name) break
      while (this.tokenizer.peek() === '.') {
        this.tokenizer.advance()
        name += `.${this.tokenizer.readIdentifier().getText()}`
      }
      this.tokenizer.skipBlank()
      let value: ValueToken | undefined
      if (this.tokenizer.peek() === separator) {
        this.tokenizer.advance()
        value = this.tokenizer.readValue()
      }
      this.params.push([name, value])
    }
  }

  public * render (ctx: Context): Generator<unknown, string, unknown> {
    const state = shopifyState(ctx)
    const kind = stringify(yield evalToken(this.kind, ctx))
    if (!state.runtime) {
      state.report.unsupported('content_for', `{% content_for '${kind}' %} outside renderPage`)
      return ''
    }
    if (kind !== 'blocks' && kind !== 'block') throw new Error(`content_for: unknown type '${kind}'`)
    const params: Record<string, unknown> = {}
    const closest = { resources: {} as Record<string, unknown>, metaobjects: {} as Record<string, unknown> }
    let passes = false
    for (const [name, token] of this.params) {
      const value = token === undefined ? true : yield evalToken(token, ctx)
      if (!name.startsWith('closest.')) {
        params[name] = value
        continue
      }
      const [, type, definition, ...rest] = name.split('.')
      if (type === 'metaobject' && definition && !rest.length) closest.metaobjects[definition] = value ?? null
      else if (CLOSEST_TYPES.includes(type) && definition === undefined) closest.resources[type] = value ?? null
      else throw new Error(`content_for: ${name} is not a resource type closest holds`)
      passes = true
    }
    const passed: ClosestScope | undefined = passes ? closest : undefined
    if (kind === 'blocks') return (yield state.runtime.renderBlocks(ctx, passed)) as string
    const { type, id, ...rest } = params
    const typeName = isNil(type) ? '' : stringify(type)
    const blockId = isNil(id) ? '' : stringify(id)
    if (!typeName || !blockId) throw new Error("content_for 'block' needs type and id")
    return (yield state.runtime.renderStaticBlock(typeName, blockId, rest, ctx, passed)) as string
  }
}
