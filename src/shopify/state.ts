import type { Context } from '../context'
import type { Liquid } from '../liquid'
import type { ClosestScope } from './objects/closest'
import { ReportCollector } from './report'
import { resolveServices, ShopifyServices } from './services'
import { emptyTranslator, SectionLocales, Translator } from './translations'
import type { FormOutcome } from './store/globals'
import type { BlockData, LocaleTree } from './types'

/** Where the per-render state lives: a symbol key on the render's globals, which LiquidJS shares with every partial and which no template can name. */
export const STATE = Symbol.for('@debutify/liquidjs/shopify:state')

/** The section or theme block being rendered, https://shopify.dev/docs/api/liquid/objects/section and https://shopify.dev/docs/api/liquid/objects/block. The theme runtime pushes one per section and block; `t`, `image_tag` and `content_for` read the innermost. The stack is Debutify's device for those filters; shopify.dev does not describe how Shopify scopes them. */
export interface Frame {
  kind: 'section' | 'block'
  /** For a block frame, the id and type of the theme block being rendered (reports name the container with them). */
  block?: { id: string, type: string }
  /** The section's id, type, 1-based index in its location (null when static) and schema `locales`. */
  section: { id: string, type: string, index: number | null, locales?: Record<string, LocaleTree> }
  /** The JSON data whose `blocks` and `block_order` `{% content_for 'blocks' %}` renders. */
  container: { blocks?: Record<string, BlockData>, block_order?: string[] }
  /** The Liquid `section` object of the enclosing section. */
  sectionObject: unknown
  /** What the global `closest` holds while this section or block renders (https://shopify.dev/docs/api/liquid/objects/closest); the template's resource when unset. */
  closest?: ClosestScope
  /** For a block frame, what its id and the ids of the blocks inside it end with when it is a repeat of a static block (`-1`, `-2`); see `renderStaticBlock`. */
  suffix?: string
  /** The section's id followed by the keys of the blocks from the section down to this frame's (`template--product__main/card/title`), without repeat numbers: what `themeBlockId` makes the ids of the theme blocks inside from. The section's id when unset. */
  path?: string
  /** How many times each static block id has been rendered in this frame, for the repeats' numbers. */
  staticRenders?: Map<string, number>
}

/** What the theme runtime offers the `section`, `sections`, `content_for` and `render` tags, https://shopify.dev/docs/api/liquid/tags/section, https://shopify.dev/docs/api/liquid/tags/sections and https://shopify.dev/docs/api/liquid/tags/content_for. */
export interface ThemeHooks {
  renderStaticSection: (name: string, ctx: Context) => Generator<unknown, string, unknown>
  renderSectionGroup: (name: string, ctx: Context) => Generator<unknown, string, unknown>
  /** `closest` holds what the tag's `closest.*` parameters pass to the blocks it renders. */
  renderBlocks: (ctx: Context, closest?: ClosestScope) => Generator<unknown, string, unknown>
  renderStaticBlock: (type: string, id: string, params: Record<string, unknown>, ctx: Context, closest?: ClosestScope) => Generator<unknown, string, unknown>
  /** `{% render block %}`: the block's markup, or `undefined` when `value` is not a block of this page. */
  renderBlockObject?: (value: object, ctx: Context) => Generator<unknown, string | undefined, unknown>
  /** The text of the theme's file at `path` (`assets/icon-cart.svg`), its base theme's when the theme lays over one, or `undefined` when neither has it; `inline_asset_content` reads assets through it. */
  themeFile?: (path: string) => string | undefined
}

export interface ShopifyState {
  services: ShopifyServices
  translator: Translator
  report: ReportCollector
  /** The shop's money formats (`shop.money_format`, `shop.money_with_currency_format`). */
  money: { format: string, withCurrencyFormat: string }
  /** The request being rendered: its path (for pagination links), origin (for video embeds) and `?page=`, https://shopify.dev/docs/api/liquid/objects/request, and the prefix every URL of its view starts with (the base path, then the locale prefix; empty for none), which the `form` tag puts before its actions and `content_for_header` before the routes root; `alternates` are the `hreflang` links `content_for_header` prints, each a tag and the path of the page there, and `query` is the address's query pairs, which pagination links keep. */
  request: { path: string, origin: string, page: number, prefix: string, alternates?: Array<{ hreflang: string, path: string }>, endpoints?: { buy?: string, atom?: string, oembed?: string }, noindex?: boolean, query?: Array<[string, string]> }
  /** The theme's `theme_info` (`config/settings_schema.json`), which `Shopify.theme` in `content_for_header` prints as `schema_name` and `schema_version`; unset when the theme has none. */
  theme?: { name: string, version: string }
  /** The currency of the view's market and its rate against the shop's (`Shopify.currency` in `content_for_header`); the shop's currency at rate 1 when unset. */
  currency?: { iso_code: string, rate: number }
  /** `payment_button` printed a dynamic checkout button on this page, so `content_for_header` adds the module that fills it (see `checkoutHeader`). */
  checkoutButton?: boolean
  frames: Frame[]
  /** `{% stylesheet %}` and `{% javascript %}` bodies met while rendering, by file (its theme path), in the order first rendered; `content_for_header` inlines them, or links the compiled files that hold them and names the page's sections for `scripts.js` (see `contentForHeader`). */
  assets: { stylesheets: Map<string, string>, javascripts: Map<string, string> }
  runtime?: ThemeHooks
  /** The engine of the page being rendered, through which `render` and `include` look snippets up: a section parsed once by a base theme's engine renders the snippet of the overlay being rendered, when the overlay replaces it. Unset for a render that is not a theme page: the tag then uses the engine that parsed it. Debutify's device for theme overlays; Shopify has no counterpart to cite. */
  liquid?: Liquid
  /** Set by `{% layout %}`: a layout name, `null` for `none`, `undefined` when the template did not say, https://shopify.dev/docs/api/liquid/tags/layout. */
  layout?: string | null
  /** The outcome of the form posted before this page (`RequestInput.form`), which the `form` tag of its type shows as `form.posted_successfully?`, `form.errors` and the posted values. https://shopify.dev/docs/api/liquid/objects/form */
  form?: FormOutcome
}

/** Shopify's formats for a new USD shop. https://shopify.dev/docs/api/liquid/objects/shop shows `money_format` as `${{amount}}` and `money_with_currency_format` as `${{amount}} CAD` for a Canadian shop; the ` USD` suffix here is the same pattern for a USD shop and is not pinned by shopify.dev. */
export const DEFAULT_MONEY_FORMAT = '${{amount}}' // eslint-disable-line no-template-curly-in-string
export const DEFAULT_MONEY_WITH_CURRENCY_FORMAT = '${{amount}} USD' // eslint-disable-line no-template-curly-in-string

export interface StateInit {
  services?: Partial<ShopifyServices>
  translator?: Translator
  moneyFormat?: string
  moneyWithCurrencyFormat?: string
  request?: Partial<ShopifyState['request']>
  runtime?: ThemeHooks
  /** See `ShopifyState.liquid`. */
  liquid?: Liquid
  /** Frames to start with, for rendering a snippet as if inside a section. */
  frames?: Frame[]
}

export function createState (init: StateInit = {}): ShopifyState {
  return {
    services: resolveServices(init.services),
    translator: init.translator ?? emptyTranslator(),
    report: new ReportCollector(),
    money: { format: init.moneyFormat ?? DEFAULT_MONEY_FORMAT, withCurrencyFormat: init.moneyWithCurrencyFormat ?? DEFAULT_MONEY_WITH_CURRENCY_FORMAT },
    request: { path: '/', origin: '', page: 1, prefix: '', ...init.request },
    frames: [...(init.frames ?? [])],
    assets: { stylesheets: new Map(), javascripts: new Map() },
    runtime: init.runtime,
    liquid: init.liquid
  }
}

/** The Shopify state of the render `ctx` belongs to. */
export function shopifyState (ctx: Context): ShopifyState {
  const state = (ctx.globals as Record<symbol, ShopifyState | undefined>)[STATE]
  if (!state) throw new Error('this render has no Shopify state: render with an engine from createShopifyLiquid, renderLiquid or renderPage, or pass liquid.options.globals as the globals of a Context you build yourself')
  return state
}

/** The Shopify state of the render `ctx` belongs to, or undefined for a context built without one (`shopifyState` throws there). For tags that behave as the plain engine does when no state is there. */
export function peekShopifyState (ctx: Context): ShopifyState | undefined {
  return (ctx.globals as Record<symbol, ShopifyState | undefined>)[STATE]
}

/** The state an engine made by `createShopifyLiquid` keeps in its `globals`: the defaults every render starts from, never a render's own state. */
export function engineState (globals: object): ShopifyState | undefined {
  return (globals as Record<symbol, ShopifyState | undefined>)[STATE]
}

/** A new state for one render: the engine's `defaults` with `init` over them, field by field. The report, frames and assets are always new, so no render sees another's. */
export function stateFromDefaults (defaults: ShopifyState | undefined, init: StateInit = {}): ShopifyState {
  return createState({
    translator: init.translator ?? defaults?.translator,
    moneyFormat: init.moneyFormat ?? defaults?.money.format,
    moneyWithCurrencyFormat: init.moneyWithCurrencyFormat ?? defaults?.money.withCurrencyFormat,
    runtime: init.runtime ?? defaults?.runtime,
    liquid: init.liquid,
    request: init.request,
    frames: init.frames,
    services: { ...defaults?.services, ...init.services }
  })
}

export function currentFrame (state: ShopifyState): Frame | undefined {
  return state.frames[state.frames.length - 1]
}

/** The `locales` of the section being rendered, for `t`. */
export function sectionLocales (state: ShopifyState): SectionLocales | undefined {
  const frame = currentFrame(state)
  return frame?.section.locales ? { type: frame.section.type, locales: frame.section.locales } : undefined
}
