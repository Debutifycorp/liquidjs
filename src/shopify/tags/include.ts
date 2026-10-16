import CoreIncludeTag from '../../tags/include'
import type { Context } from '../../context'
import type { Liquid } from '../../liquid'
import { peekShopifyState } from '../state'

/**
 * `{% include %}` looks a snippet up as `{% render %}` does under a theme overlay: through the engine of the page being rendered, so a base section parsed once renders an overlay's snippet that replaces the base's. https://shopify.dev/docs/api/liquid/tags/include documents the tag (deprecated in favour of `render`); the lookup through the render's engine is Debutify's device for overlays, not Shopify's.
 */
export class ShopifyIncludeTag extends CoreIncludeTag {
  protected partialEngine (ctx: Context): Liquid {
    return peekShopifyState(ctx)?.liquid ?? this.liquid
  }
}
