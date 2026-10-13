import type { FilterImpl } from '../../template/filter-impl-options'
import { stringify, toValue } from '../../util'
import { FontDrop } from '../objects/font'
import { splitArgs } from '../util/args'
import { shopifyState, ShopifyState } from '../state'
import type { ShopifyFilterSet } from './types'

/** The font a filter input names: a `font` object, or a font handle the font library knows. */
function fontOf (state: ShopifyState, input: unknown): FontDrop | undefined {
  if (input instanceof FontDrop) return input
  const handle = stringify(toValue(input))
  const info = handle ? state.services.fontInfo(handle) : undefined
  return info ? new FontDrop(info, state.services.fontInfo) : undefined
}

/** The font file's URL, `woff2` unless `'woff'` is asked for. https://shopify.dev/docs/api/liquid/filters/font_url */
function fontUrl (this: FilterImpl, input: unknown, format: unknown) {
  const state = shopifyState(this.context)
  const font = fontOf(state, input)
  return font ? state.services.fontUrl(font.info, stringify(format) === 'woff' ? 'woff' : 'woff2') : ''
}

/**
 * The `@font-face` rule, laid out as on https://shopify.dev/docs/api/liquid/filters/font_face, from the `fontUrl` service unless a `fontFace` service writes the whole rule. System fonts (the `font` object's `system?`, https://shopify.dev/docs/api/liquid/objects/font) need no rule and render empty; shopify.dev does not say what Shopify prints for one.
 */
function fontFace (this: FilterImpl, input: unknown, ...args: unknown[]) {
  const state = shopifyState(this.context)
  const font = fontOf(state, input)
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
    '}'
}

const WEIGHT_KEYWORDS: Record<string, number> = { normal: 400, bold: 700 }

/** CSS's relative weights: https://developer.mozilla.org/en-US/docs/Web/CSS/font-weight#meaning_of_relative_weights */
function relativeWeight (weight: number, keyword: string): number {
  if (keyword === 'lighter') return weight <= 500 ? 100 : weight <= 700 ? 400 : 700
  return weight <= 300 ? 400 : weight <= 500 ? 700 : 900
}

/** Another font of the same family, or nil when the family has no such variant. https://shopify.dev/docs/api/liquid/filters/font_modify shows `style` and `weight` with `normal`, `italic`, `oblique`, numbers and `bold`; `lighter`, `bolder` and `+100`/`-100` steps are not pinned there. */
function fontModify (this: FilterImpl, input: unknown, property: unknown, value: unknown) {
  const font = fontOf(shopifyState(this.context), input)
  if (!font) return null
  const text = stringify(value)
  if (stringify(property) === 'style') {
    if (!['normal', 'italic', 'oblique'].includes(text)) return null
    return font.variant(text, font.info.weight) ?? null
  }
  if (stringify(property) !== 'weight') return null
  let weight: number
  if (text in WEIGHT_KEYWORDS) weight = WEIGHT_KEYWORDS[text]
  else if (text === 'lighter' || text === 'bolder') weight = relativeWeight(font.info.weight, text)
  else if (/^[+-]\d+$/.test(text)) weight = font.info.weight + Number(text)
  else weight = Number(text)
  if (!Number.isInteger(weight) || weight < 100 || weight > 900 || weight % 100 !== 0) return null
  return font.variant(font.info.style, weight) ?? null
}

export const fontFilters: ShopifyFilterSet = {
  font_face: { status: 'approx', handler: fontFace },
  font_url: { status: 'approx', handler: fontUrl },
  font_modify: { status: 'approx', handler: fontModify }
}
