import { RawBodyTag } from '../../tags/raw-body'
import type { Context } from '../../context'
import { shopifyState, ShopifyState } from '../state'

/** A raw-body tag that prints nothing where it stands, so its `blank()` is `true` (Ruby Liquid's `Raw#blank?` is `@body.empty?`, which the engine's `RawBodyTag` follows; these four tags never print the body, so a block that holds only one is blank too). Shopify does not document blankness. */
abstract class SilentRawTag extends RawBodyTag {
  public get source (): string {
    return this.body
  }

  public render (_ctx?: Context): string {
    return ''
  }

  public blank (): boolean {
    return true
  }
}

/** `{% schema %}`: JSON for the theme editor. Renders nothing; the theme runtime reads `json`. https://shopify.dev/docs/storefronts/themes/architecture/sections/section-schema */
export class SchemaTag extends SilentRawTag {
  private parsed?: { value: unknown }

  /** The schema, parsed on first use. Throws the JSON error if the body is not valid JSON. */
  public get json (): unknown {
    if (!this.parsed) this.parsed = { value: JSON.parse(this.body) }
    return this.parsed.value
  }
}

/** `{% doc %}`: LiquidDoc annotations, never output. https://shopify.dev/docs/api/liquid/tags/doc */
export class DocTag extends SilentRawTag {}

/** A tag that renders nothing where it stands and records its body, once per file, in `state.assets`. `JavascriptTag` and `StylesheetTag` differ only in which map. */
abstract class AssetTag extends SilentRawTag {
  protected abstract readonly assets: (state: ShopifyState) => Map<string, string>

  /** `ctx` is optional only to match `RawBodyTag.render()`; the renderer always passes it. */
  public render (ctx?: Context): string {
    if (!ctx) return ''
    const bodies = this.assets(shopifyState(ctx))
    const file = this.token.file ?? ''
    if (!bodies.has(file)) bodies.set(file, this.body)
    return ''
  }
}

/** `{% javascript %}`: renders nothing where it stands; Shopify bundles the body into a deferred script loaded by `content_for_header`, which is what the theme runtime does with the bodies it records here. https://shopify.dev/docs/storefronts/themes/best-practices/javascript-and-stylesheet-tags#javascript (that Shopify loads the bodies through `content_for_header` is not pinned by shopify.dev; recording them per file is Debutify's choice) */
export class JavascriptTag extends AssetTag {
  protected readonly assets = (state: ShopifyState) => state.assets.javascripts
}

/** `{% stylesheet %}`: renders nothing where it stands; Shopify bundles the body into `styles.css`, linked from `content_for_header`, which is what the theme runtime does with the bodies it records here. https://shopify.dev/docs/storefronts/themes/best-practices/javascript-and-stylesheet-tags#stylesheet (that Shopify loads the bodies through `content_for_header` is not pinned by shopify.dev; recording them per file is Debutify's choice) */
export class StylesheetTag extends AssetTag {
  protected readonly assets = (state: ShopifyState) => state.assets.stylesheets
}
