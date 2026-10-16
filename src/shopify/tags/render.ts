import CoreRenderTag from '../../tags/render'
import { evalToken } from '../../render'
import { isNil, isString, toValue } from '../../util'
import type { Context } from '../../context'
import type { Liquid } from '../../liquid'
import type { Emitter } from '../../emitters'
import type { Token } from '../../tokens'
import { shopifyState } from '../state'

/**
 * `{% render %}` as Shopify reads it: a snippet name, or a block. https://shopify.dev/docs/api/liquid/tags/render renders "a snippet or app block", and https://shopify.dev/docs/storefronts/themes/architecture/blocks/app-blocks writes `{% render block %}` in a section's block loop. A theme block given to it renders as `content_for` renders it, in its wrapper unless its schema says `"tag": null` and with its own blocks; shopify.dev documents only the app-block case, so this is Debutify's reading. An app block is rendered by its app, so it prints nothing and is reported, as under `content_for 'blocks'`. Parameters after a block are not passed (shopify.dev shows none), and any other value that is not a string, such as a number or an object, is a render error printed inline (Debutify's wording; shopify.dev does not say). A string and nil are read as the engine reads them.
 */
export class ShopifyRenderTag extends CoreRenderTag {
  /** Snippets are looked up through the engine of the page being rendered, so a base section parsed once renders an overlay's snippet that replaces the base's (Task 16 of item 22's engine plan). */
  protected partialEngine (ctx: Context): Liquid {
    return shopifyState(ctx).liquid ?? this.liquid
  }

  public * render (ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    const file = this.file
    if (file === undefined || isString(file) || Array.isArray(file)) {
      yield super.render(ctx, emitter)
      return
    }
    const value = toValue(yield evalToken(file as Token, ctx))
    if (isNil(value) || isString(value)) {
      yield super.render(ctx, emitter)
      return
    }
    const runtime = shopifyState(ctx).runtime
    const html = typeof value === 'object' && runtime?.renderBlockObject ? (yield runtime.renderBlockObject(value, ctx)) as string | undefined : undefined
    if (html === undefined) throw new Error(`render needs a snippet name or a block, not ${Array.isArray(value) ? 'an array' : typeof value === 'object' ? 'an object' : `a ${typeof value}`}`)
    emitter.write(html)
  }
}
