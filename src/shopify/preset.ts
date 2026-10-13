import { Context } from '../context'
import { Liquid } from '../liquid'
import type { LiquidOptions, RenderOptions } from '../liquid-options'
import type { Template } from '../template'
import type { ShopifyServices } from './services'
import { createState, engineState, ShopifyState, STATE, stateFromDefaults, ThemeHooks } from './state'
import { ThemeCache, ThemeFS } from './theme-fs'
import { installFallbacks } from './fallbacks'
import { registerShopifyFilters } from './filters'
import { registerShopifyTags } from './tags'
import type { Translator } from './translations'

/**
 * Tags whose bodies are never parsed under the Shopify preset. `style` is not here: Shopify evaluates the Liquid inside it, https://shopify.dev/docs/api/liquid/tags/style (its example prints `{{ settings.colors_accent_1 }}` as `#121212`).
 *
 * `raw`: https://shopify.dev/docs/api/liquid/tags/raw. `comment`: https://shopify.dev/docs/api/liquid/tags/comment says its Liquid is "parsed, but not executed" and does not mention nesting; nested comments follow Shopify Liquid's `CommentTagUnitTest#test_nested_comment_tag_with_extra_strings` in liquid-spec `specs/liquid_ruby/specs.yml`, and are not pinned by shopify.dev.
 *
 * `schema`: https://shopify.dev/docs/storefronts/themes/architecture/sections/section-schema (the Liquid reference has no page for it today). `javascript` and `stylesheet`: https://shopify.dev/docs/api/liquid/tags/javascript and https://shopify.dev/docs/api/liquid/tags/stylesheet ("Liquid isn't rendered inside").
 *
 * `doc`: https://shopify.dev/docs/api/liquid/tags/doc says its Liquid is "parsed but not executed", yet the body is read raw here because Shopify Liquid ignores even malformed syntax in it (liquid-spec `specs/liquid_ruby/specs.yml`: `DocTagUnitTest#test_doc_tag_ignores_malformed_syntax`, `…ignores_unclosed_assign`); the wording and the behaviour differ, so the behaviour is not pinned by shopify.dev.
 */
export const SHOPIFY_RAW_TAGS = ['raw', 'comment', 'schema', 'javascript', 'stylesheet', 'doc']

/** Safe defaults for untrusted themes; callers may lower (or deliberately raise) each. `parseLimit` counts characters per parsed file, `renderLimit` milliseconds per render call, `memoryLimit` LiquidJS's allocation units per render. These are Debutify's safety limits, not Shopify's: shopify.dev publishes no parse, render or memory limits for Liquid. */
export const SHOPIFY_DEFAULT_LIMITS = {
  parseLimit: 10000000,
  renderLimit: 2000,
  memoryLimit: 100000000
}

export interface ShopifyLiquidOptions {
  /** The theme's files by path (`snippets/price.liquid`). `render`, `include` and layouts read them; nothing is read from disk. https://shopify.dev/docs/api/liquid/tags/render and https://shopify.dev/docs/api/liquid/tags/include. */
  files?: Record<string, string>
  services?: Partial<ShopifyServices>
  translator?: Translator
  moneyFormat?: string
  moneyWithCurrencyFormat?: string
  /** `'report'` (default) renders unknown tags as nothing and reports them; `'error'` fails the parse with `Unknown tag 'name'`, as Shopify does (liquid-spec `specs/basics/error-handling.yml`: `unknown_tag_strict_parse_error`; shopify.dev does not document it). An unknown filter has no such option: set `engine: { strictFilters: true }` to make it a parse error. */
  unknownTags?: 'report' | 'error'
  runtime?: ThemeHooks
  parseLimit?: number
  renderLimit?: number
  memoryLimit?: number
  /** Advanced: engine options applied last, over the preset. `globals` are merged with the preset's state rather than replacing it. */
  engine?: LiquidOptions
}

/** The preset's engine. Its state is the defaults, and every top-level render starts from a copy of them: partials a render spawns share that render's globals, so they see its state, and no other render does. */
class ShopifyLiquid extends Liquid {
  public _render (tpl: Template[], scope: Context | object | undefined, renderOptions: RenderOptions): IterableIterator<any> {
    return super._render(tpl, scope, scope instanceof Context ? renderOptions : this.withFreshState(renderOptions))
  }

  public renderToNodeStream (tpl: Template[], scope?: object, renderOptions: RenderOptions = {}): NodeJS.ReadableStream {
    return super.renderToNodeStream(tpl, scope, this.withFreshState(renderOptions))
  }

  public _evalValue (str: string, scope?: object | Context): IterableIterator<any> {
    return super._evalValue(str, scope instanceof Context ? scope : new Context(scope, this.options, this.withFreshState({}), { liquid: this }))
  }

  /** Keeps a state the caller put in the render's `globals` (`renderLiquid` and `renderPage` do). Otherwise the render's `globals` (the engine's when it gives none) get a new state. */
  private withFreshState (renderOptions: RenderOptions): RenderOptions {
    const given = renderOptions.globals as Record<symbol, ShopifyState | undefined> | undefined
    const defaults = engineState(this.options.globals)
    if (given?.[STATE] && given[STATE] !== defaults) return renderOptions
    return { ...renderOptions, globals: { ...(given ?? this.options.globals), [STATE]: stateFromDefaults(defaults) } }
  }
}

/**
 * A `Liquid` engine configured as Shopify renders themes: Ruby number semantics, raw `schema`/`javascript`/`stylesheet`/`doc` bodies, nesting comments, inline errors, theme files from memory, safe limits, and every Shopify tag and filter registered.
 *
 * Ruby number semantics: https://shopify.dev/docs/api/liquid/filters/divided_by ("the result will be the same type as the divisor"). Inline errors: the `Liquid error (line N): …` text is not documented on shopify.dev; it follows liquid-spec `specs/basics/error-handling.yml` and `specs/shopify_production_recordings/recorded_specs.yml`. Limits and safe defaults: Debutify's, see `SHOPIFY_DEFAULT_LIMITS`.
 */
export function createShopifyLiquid (options: ShopifyLiquidOptions = {}): Liquid {
  const files = options.files ?? {}
  const cache = new ThemeCache(files)
  const state = createState(options)
  const liquid = new ShopifyLiquid({
    numberSemantics: 'ruby',
    rawTags: [...SHOPIFY_RAW_TAGS],
    inlineErrors: true,
    jsTruthy: false,
    ownPropertyOnly: true,
    extname: '.liquid',
    root: ['.'],
    partials: ['snippets'],
    layouts: ['layout'],
    relativeReference: false,
    fs: new ThemeFS(files),
    cache,
    // 'UTC', not 0: with an offset `%Z` prints `+0000`, where Ruby and liquid-spec print `UTC` (specs/basics/date-filters.yml `date_format_Z_timezone_name`); https://shopify.dev/docs/api/liquid/filters/date defers to Ruby's strftime and does not name the zone Shopify renders in
    // an undefined top-level `{{ size }}` is nil, as every unknown name is in Ruby Liquid (`Context#find_variable`), where the engine's default would print the number of keys in the render's globals; shopify.dev does not pin the case, and liquid-spec has no spec for it
    topLevelSize: false,
    timezoneOffset: 'UTC',
    parseLimit: options.parseLimit ?? SHOPIFY_DEFAULT_LIMITS.parseLimit,
    renderLimit: options.renderLimit ?? SHOPIFY_DEFAULT_LIMITS.renderLimit,
    memoryLimit: options.memoryLimit ?? SHOPIFY_DEFAULT_LIMITS.memoryLimit,
    ...options.engine,
    globals: { ...options.engine?.globals, [STATE]: state }
  })
  cache.attach(liquid)
  registerShopifyTags(liquid)
  registerShopifyFilters(liquid)
  installFallbacks(liquid, options.unknownTags ?? 'report')
  return liquid
}
