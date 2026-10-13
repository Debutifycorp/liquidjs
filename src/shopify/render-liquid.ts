import type { Liquid } from '../liquid'
import { toPromise } from '../util/async'
import type { LiquidError } from '../util/error'
import { getPerformance } from '../util/performance'
import type { RenderReport } from './report'
import { engineState, STATE, StateInit, stateFromDefaults } from './state'

export interface RenderLiquidResult {
  html: string
  report: RenderReport
}

/** Renders one Liquid source with an engine from `createShopifyLiquid` and a fresh state, returning the HTML and its render report. `scope` is the template's scope. Use it for snippets; `renderPage` renders whole themes. */
export async function renderLiquid (liquid: Liquid, source: string, scope: object = {}): Promise<RenderLiquidResult> {
  return renderWithState(liquid, source, scope)
}

/** `renderLiquid` with `init` over the engine's default state, field by field (a request, frames that make the source render as if inside a section, theme hooks), and `filepath` as the source's file name. Internal: the package's tests use it. */
export async function renderWithState (liquid: Liquid, source: string, scope: object = {}, init: StateInit = {}, filepath?: string): Promise<RenderLiquidResult> {
  const started = getPerformance().now()
  const state = stateFromDefaults(engineState(liquid.options.globals), init)
  const errors: LiquidError[] = []
  const templates = liquid.parse(source, filepath)
  const html = await toPromise(liquid._render(templates, scope, { globals: { ...liquid.options.globals, [STATE]: state }, errors, sync: false }))
  return { html, report: state.report.toReport(errors, getPerformance().now() - started) }
}
