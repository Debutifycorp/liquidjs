import type { Context } from '../context'
import { ReportCollector } from './report'
import { resolveServices, ShopifyServices } from './services'
import { emptyTranslator, SectionLocales, Translator } from './translations'
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
}

/** What the theme runtime offers the `section`, `sections` and `content_for` tags, https://shopify.dev/docs/api/liquid/tags/section, https://shopify.dev/docs/api/liquid/tags/sections and https://shopify.dev/docs/api/liquid/tags/content_for. */
export interface ThemeHooks {
  renderStaticSection: (name: string, ctx: Context) => Generator<unknown, string, unknown>
  renderSectionGroup: (name: string, ctx: Context) => Generator<unknown, string, unknown>
  renderBlocks: (ctx: Context) => Generator<unknown, string, unknown>
  renderStaticBlock: (type: string, id: string, params: Record<string, unknown>, ctx: Context) => Generator<unknown, string, unknown>
}

export interface ShopifyState {
  services: ShopifyServices
  translator: Translator
  report: ReportCollector
  /** The shop's money formats (`shop.money_format`, `shop.money_with_currency_format`). */
  money: { format: string, withCurrencyFormat: string }
  /** The request being rendered: its path (for pagination links), origin (for video embeds) and `?page=`, https://shopify.dev/docs/api/liquid/objects/request. */
  request: { path: string, origin: string, page: number }
  frames: Frame[]
  /** `{% stylesheet %}` and `{% javascript %}` bodies met while rendering, by file, in the order first rendered; `content_for_header` inlines them. https://shopify.dev/docs/api/liquid/tags/stylesheet and https://shopify.dev/docs/api/liquid/tags/javascript say how the bodies are loaded only by reference, and https://shopify.dev/docs/api/liquid/objects/content_for_header says only that it returns the scripts Shopify requires, so inlining the bodies there is Debutify's choice. */
  assets: { stylesheets: Map<string, string>, javascripts: Map<string, string> }
  runtime?: ThemeHooks
  /** Set by `{% layout %}`: a layout name, `null` for `none`, `undefined` when the template did not say, https://shopify.dev/docs/api/liquid/tags/layout. */
  layout?: string | null
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
  /** Frames to start with, for rendering a snippet as if inside a section. */
  frames?: Frame[]
}

export function createState (init: StateInit = {}): ShopifyState {
  return {
    services: resolveServices(init.services),
    translator: init.translator ?? emptyTranslator(),
    report: new ReportCollector(),
    money: { format: init.moneyFormat ?? DEFAULT_MONEY_FORMAT, withCurrencyFormat: init.moneyWithCurrencyFormat ?? DEFAULT_MONEY_WITH_CURRENCY_FORMAT },
    request: { path: '/', origin: '', page: 1, ...init.request },
    frames: [...(init.frames ?? [])],
    assets: { stylesheets: new Map(), javascripts: new Map() },
    runtime: init.runtime
  }
}

/** The Shopify state of the render `ctx` belongs to. */
export function shopifyState (ctx: Context): ShopifyState {
  const state = (ctx.globals as Record<symbol, ShopifyState | undefined>)[STATE]
  if (!state) throw new Error('this render has no Shopify state: render with an engine from createShopifyLiquid, renderLiquid or renderPage, or keep STATE in the globals of a Context you build yourself')
  return state
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
