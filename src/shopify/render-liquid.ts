import type { Liquid } from '../liquid'
import { toPromise } from '../util/async'
import type { LiquidError } from '../util/error'
import { getPerformance } from '../util/performance'
import type { RenderReport } from './report'
import { createState, STATE, ShopifyState, StateInit } from './state'

export interface RenderLiquidResult {
  html: string
  report: RenderReport
}

/** Renders one Liquid source with a Shopify engine and a fresh state, returning the HTML and its render report. Use it for snippets and tests; `renderPage` renders whole themes. */
export async function renderLiquid (liquid: Liquid, source: string, scope: object = {}, init: StateInit = {}, filepath?: string): Promise<RenderLiquidResult> {
  const started = getPerformance().now()
  const defaults = (liquid.options.globals as Record<symbol, ShopifyState | undefined>)[STATE]
  const state = createState({
    translator: defaults?.translator,
    moneyFormat: defaults?.money.format,
    moneyWithCurrencyFormat: defaults?.money.withCurrencyFormat,
    trustLiquidSettings: defaults?.trust.liquidSettings,
    trustHtmlSettings: defaults?.trust.htmlSettings,
    ...init,
    services: { ...defaults?.services, ...init.services }
  })
  const errors: LiquidError[] = []
  const templates = liquid.parse(source, filepath)
  const html = await toPromise(liquid._render(templates, scope, { globals: { ...liquid.options.globals, [STATE]: state }, errors, sync: false }))
  return { html, report: state.report.toReport(errors, getPerformance().now() - started) }
}
