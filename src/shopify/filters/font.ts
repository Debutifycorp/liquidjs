import type { FilterImpl } from '../../template/filter-impl-options'
import { stringify, toValue } from '../../util'
import { FontDrop } from '../objects/font'
import { splitArgs } from '../util/args'
import { hasOwn } from '../util/own'
import { shopifyState, ShopifyState } from '../state'
import type { UnsupportedFeature } from '../report'
import type { ShopifyFilterSet } from './types'

/** The font a filter input names: a `font` object, or a font handle the font library knows. A handle the library does not know renders empty and is reported under the filter's name; an empty input (an unset setting) is silent. shopify.dev does not say what Shopify does there. */
function fontOf (state: ShopifyState, name: UnsupportedFeature, input: unknown): FontDrop | undefined {
  if (input instanceof FontDrop) return input
  const handle = stringify(toValue(input))
  if (!handle) return undefined
  const info = state.services.fontInfo(handle)
  if (!info) state.report.unsupported(name, `unknown font: ${handle}`)
  return info ? new FontDrop(info, state.services.fontInfo) : undefined
}

/** The font file's URL, `woff2` unless `'woff'` is asked for. https://shopify.dev/docs/api/liquid/filters/font_url. A system font has no file, and the parity store prints the empty string for it in both formats (fixtures `probe-fonts-library`: `mono`, `sans_serif_n4`, `serif`, `system_ui_n4`), so the `fontUrl` service is not asked for one. Any other format is reported and gets the `woff2` URL; the page does not pin that error case. */
function fontUrl (this: FilterImpl, input: unknown, format: unknown) {
  const state = shopifyState(this.context)
  const font = fontOf(state, 'font_url', input)
  if (!font) return ''
  const wanted = format === undefined || format === null ? '' : stringify(format)
  if (wanted && wanted !== 'woff' && wanted !== 'woff2') state.report.unsupported('font_url', `unknown format: ${wanted}`)
  if (font.info.system) return ''
  return state.services.fontUrl(font.info, wanted === 'woff' ? 'woff' : 'woff2')
}

/**
 * The `@font-face` rule, laid out as on https://shopify.dev/docs/api/liquid/filters/font_face, from the `fontUrl` service unless a `fontFace` service writes the whole rule. The rule ends with a line break, as the parity store prints it (scenario `page-home`: the last rule of the font block is followed by `\n:root`, and each rule by `\n` before the theme's own line break), where shopify.dev's example cannot show one. System fonts (the `font` object's `system?`, https://shopify.dev/docs/api/liquid/objects/font) need no rule and render empty; shopify.dev does not say what Shopify prints for one.
 */
function fontFace (this: FilterImpl, input: unknown, ...args: unknown[]) {
  const state = shopifyState(this.context)
  const font = fontOf(state, 'font_face', input)
  if (!font || font.info.system) return ''
  const { named } = splitArgs(args)
  const fontDisplay = named.font_display === undefined || named.font_display === null ? undefined : stringify(named.font_display)
  if (state.services.fontFace) return state.services.fontFace(font.info, { fontDisplay })
  return '@font-face {\n' +
    `  font-family: ${font.family};\n` +
    `  font-weight: ${font.weight};\n` +
    `  font-style: ${font.style};\n` +
    (fontDisplay ? `  font-display: ${fontDisplay};\n` : '') +
    `  src: url("${state.services.fontUrl(font.info, 'woff2')}") format("woff2"),\n` +
    `       url("${state.services.fontUrl(font.info, 'woff')}") format("woff");\n` +
    '}\n'
}

const WEIGHT_KEYWORDS: Record<string, number> = { normal: 400, bold: 700 }

const isHundred = (n: number) => n >= 100 && n <= 900 && n % 100 === 0

/** CSS's relative weights: https://developer.mozilla.org/en-US/docs/Web/CSS/font-weight#meaning_of_relative_weights */
function relativeWeight (weight: number, keyword: string): number {
  if (keyword === 'lighter') return weight <= 500 ? 100 : weight <= 700 ? 400 : 700
  return weight <= 300 ? 400 : weight <= 500 ? 700 : 900
}

/**
 * Another font of the same family, or nil when the family has no such variant. https://shopify.dev/docs/api/liquid/filters/font_modify pins `style` (`normal`, `italic`, `oblique`) and `weight` (`100` to `900`, `normal`, `bold`, `+100` to `+900`, `-100` to `-900`, `lighter` and `bolder`, the last two by CSS's relative-weight rules). It also says to apply "browser fallback weights" for `lighter` and `bolder`, which this does not: it returns nil when the computed weight is missing, so the fallback part is not pinned down here. An unknown property or an unusable value is reported and returns nil; the page does not pin that error case.
 */
function fontModify (this: FilterImpl, input: unknown, property: unknown, value: unknown) {
  const state = shopifyState(this.context)
  const font = fontOf(state, 'font_modify', input)
  if (!font) return null
  const text = stringify(value)
  const kind = stringify(property)
  if (kind === 'style') {
    if (!['normal', 'italic', 'oblique'].includes(text)) {
      state.report.unsupported('font_modify', `not a font style: ${text}`)
      return null
    }
    return font.variant(text, font.info.weight) ?? null
  }
  if (kind !== 'weight') {
    state.report.unsupported('font_modify', `unknown property: ${kind}`)
    return null
  }
  let weight: number
  const step = /^[+-](\d+)$/.exec(text)
  if (hasOwn(WEIGHT_KEYWORDS, text)) weight = WEIGHT_KEYWORDS[text]
  else if (text === 'lighter' || text === 'bolder') weight = relativeWeight(font.info.weight, text)
  else if (step && isHundred(Number(step[1]))) weight = font.info.weight + Number(text)
  else if (/^\d+$/.test(text) && isHundred(Number(text))) weight = Number(text)
  else {
    state.report.unsupported('font_modify', `not a font weight: ${text}`)
    return null
  }
  // A weight outside 100 to 900 is a variant the family cannot have: nil, as for any missing variant.
  if (weight < 100 || weight > 900) return null
  return font.variant(font.info.style, weight) ?? null
}

export const fontFilters: ShopifyFilterSet = {
  font_face: { status: 'approx', handler: fontFace },
  font_url: { status: 'approx', handler: fontUrl },
  font_modify: { status: 'approx', handler: fontModify }
}
