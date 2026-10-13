import { Tag } from '../../template/tag'
import type { Liquid } from '../../liquid'
import type { Context } from '../../context'
import type { TagToken, TopLevelToken, ValueToken } from '../../tokens'
import { evalToken } from '../../render'
import { stringify } from '../../util'
import { shopifyState } from '../state'

/** Shopify's `{% layout 'name' %}` / `{% layout none %}`: chooses the layout that wraps the template, and renders nothing. https://shopify.dev/docs/api/liquid/tags/layout */
export class ShopifyLayoutTag extends Tag {
  private readonly value: ValueToken

  public constructor (token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(token, remainTokens, liquid)
    const value = this.tokenizer.readValue()
    if (!value) throw new Error('layout needs a layout name or none')
    this.value = value
  }

  public * render (ctx: Context): Generator<unknown, string, unknown> {
    const state = shopifyState(ctx)
    state.layout = this.value.getText() === 'none' ? null : stringify(yield evalToken(this.value, ctx))
    return ''
  }
}
