import { Liquid } from '../liquid'
import type { LiquidOptions } from '../liquid-options'
import type { ShopifyServices } from './services'
import { createState, STATE, ThemeHooks } from './state'
import { ThemeCache, ThemeFS } from './theme-fs'
import { installFallbacks } from './fallbacks'
import { registerShopifyFilters } from './filters'
import { registerShopifyTags } from './tags'
import type { Translator } from './translations'

/** Tags whose bodies are never parsed under the Shopify preset. `style` is not here: Shopify evaluates the Liquid inside it. */
export const SHOPIFY_RAW_TAGS = ['raw', 'comment', 'schema', 'javascript', 'stylesheet', 'doc']

/** Safe defaults for untrusted themes; callers may lower (or deliberately raise) each. `parseLimit` counts characters per parsed file, `renderLimit` milliseconds per render call, `memoryLimit` LiquidJS's allocation units per render. */
export const SHOPIFY_DEFAULT_LIMITS = {
  parseLimit: 10000000,
  renderLimit: 2000,
  memoryLimit: 100000000
}

export interface ShopifyLiquidOptions {
  /** The theme's files by path (`snippets/price.liquid`). `render`, `include` and layouts read them; nothing is read from disk. */
  files?: Record<string, string>
  services?: Partial<ShopifyServices>
  translator?: Translator
  moneyFormat?: string
  moneyWithCurrencyFormat?: string
  /** `'report'` (default) renders unknown tags as nothing and reports them; `'error'` fails the parse with `Unknown tag 'name'`, as Shopify does. */
  unknownTags?: 'report' | 'error'
  /** Render the Liquid in `liquid` type settings. Off by default: their values are escaped. */
  trustLiquidSettings?: boolean
  /** Leave `html` type settings unsanitised. Off by default: they pass an allowlist sanitiser. */
  trustHtmlSettings?: boolean
  runtime?: ThemeHooks
  parseLimit?: number
  renderLimit?: number
  memoryLimit?: number
  /** Advanced: engine options applied last, over the preset. */
  engine?: LiquidOptions
}

/**
 * A `Liquid` engine configured as Shopify renders themes: Ruby number semantics, raw `schema`/`javascript`/`stylesheet`/`doc` bodies, nesting comments, inline errors, theme files from memory, safe limits, and every Shopify tag and filter registered.
 */
export function createShopifyLiquid (options: ShopifyLiquidOptions = {}): Liquid {
  const files = options.files ?? {}
  const cache = new ThemeCache(files)
  const state = createState(options)
  const liquid = new Liquid({
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
    // 'UTC', not 0: with an offset `%Z` prints `+0000`, where Ruby and liquid-spec print `UTC`
    timezoneOffset: 'UTC',
    parseLimit: options.parseLimit ?? SHOPIFY_DEFAULT_LIMITS.parseLimit,
    renderLimit: options.renderLimit ?? SHOPIFY_DEFAULT_LIMITS.renderLimit,
    memoryLimit: options.memoryLimit ?? SHOPIFY_DEFAULT_LIMITS.memoryLimit,
    globals: { [STATE]: state },
    ...options.engine
  })
  cache.attach(liquid)
  registerShopifyTags(liquid)
  registerShopifyFilters(liquid)
  installFallbacks(liquid, options.unknownTags ?? 'report')
  return liquid
}
