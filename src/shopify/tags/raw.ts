import { RawBodyTag } from '../../tags/raw-body'
import type { Context } from '../../context'
import { shopifyState, ShopifyState } from '../state'

/** A raw-body tag that prints nothing where it stands, so its `blank()` is `true`: a block that holds only one is blank too. Ruby Liquid's `Raw#blank?` is `@body.empty?`, which the engine's `RawBodyTag` follows; `schema`, `javascript` and `stylesheet` are Shopify's own, and Shopify does not document their blankness. `DocTag` follows Ruby's `Doc#blank?` instead. */
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

/** `{% doc %}`: LiquidDoc annotations, never output. https://shopify.dev/docs/api/liquid/tags/doc. Blank only when empty, as Ruby Liquid's `Doc#blank?` (`@body.empty?`, lib/liquid/tags/doc.rb), so whitespace around a doc with text stays in a block. */
export class DocTag extends SilentRawTag {
  public blank (): boolean {
    return this.body === ''
  }
}

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

/** `{% javascript %}`: renders nothing where it stands and records its body. https://shopify.dev/docs/storefronts/themes/best-practices/javascript-and-stylesheet-tags#javascript says Shopify concatenates the bodies of the section, block and snippet files into `scripts.js`, `block-scripts.js` and `snippet-scripts.js`, loads them through `content_for_header` in a deferred `<script>`, and wraps each body in a self-executing function. That is the theme runtime's job: this tag only records the body in one map keyed by file (the bundle a file belongs to follows from the file's path), the first body of a file winning. The page says a second `{% javascript %}` in one file is a syntax error when editing the theme; here the later one is ignored without a message. Inlining the recorded bodies in `content_for_header`, rather than linking generated files, is Debutify's choice and is not pinned by shopify.dev. */
export class JavascriptTag extends AssetTag {
  protected readonly assets = (state: ShopifyState) => state.assets.javascripts
}

/** `{% stylesheet %}`: renders nothing where it stands and records its body. https://shopify.dev/docs/storefronts/themes/best-practices/javascript-and-stylesheet-tags#stylesheet says Shopify collects the bodies into one `styles.css` that `content_for_header` links to (subsetting it to the files each page renders). That is the theme runtime's job: this tag only records the body in one map keyed by file, the first body of a file winning. The page says a second `{% stylesheet %}` in one file is a syntax error when editing the theme; here the later one is ignored without a message. Inlining the recorded bodies in `content_for_header`, rather than linking `styles.css`, is Debutify's choice and is not pinned by shopify.dev. */
export class StylesheetTag extends AssetTag {
  protected readonly assets = (state: ShopifyState) => state.assets.stylesheets
}
