import type { FilterImpl } from '../../template/filter-impl-options'
import { stringify, toValue } from '../../util'
import { LiquidFloat } from '../../util/liquid-float'
import { plainValue } from '../util/args'
import { shopifyState } from '../state'
import { alphaText, brightness, clamp, formatColor, hslToRgb, luminance, oklchText, parseColor, rgbToHsl, Rgba, toHex, toRgbaFunction, toRgbFunction } from '../util/color'
import type { ShopifyFilterSet } from './types'

/**
 * Shopify's colour filters (https://shopify.dev/docs/api/liquid/filters/color-filters). Every expected value in the tests comes from the filter's shopify.dev page. A value that is not a colour renders empty and is reported; shopify.dev does not say what Shopify does there, so that is Debutify's choice.
 */
function read (filter: FilterImpl, name: string, input: unknown): Rgba | undefined {
  const text = stringify(toValue(input))
  const color = parseColor(text)
  if (!color && text) shopifyState(filter.context).report.unsupported(name, `not a colour: ${text}`)
  return color
}

const num = (value: unknown) => Number(plainValue(value))

/** `color_lighten`, `color_darken`, `color_saturate` and `color_desaturate` move HSL lightness or saturation by the given points (https://shopify.dev/docs/api/liquid/filters/color_lighten and its siblings). The pages show hex input only, so the format returned for `rgb()` or `hsl()` input (hex when opaque, `rgba()` otherwise) is not pinned. */
function adjust (name: string, key: 's' | 'l', sign: 1 | -1) {
  return function (this: FilterImpl, input: unknown, amount: unknown) {
    const color = read(this, name, input)
    if (!color) return ''
    const hsl = rgbToHsl(color)
    hsl[key] = clamp(hsl[key] + sign * num(amount), 0, 100)
    return formatColor({ ...hslToRgb(hsl.h, hsl.s, hsl.l), a: color.a })
  }
}

/** https://shopify.dev/docs/api/liquid/filters/color_to_rgb */
function colorToRgb (this: FilterImpl, input: unknown) {
  const color = read(this, 'color_to_rgb', input)
  return color ? toRgbFunction(color) : ''
}

/** https://shopify.dev/docs/api/liquid/filters/color_to_hsl shows only an opaque colour; the `hsla()` form for a translucent one is not pinned. */
function colorToHsl (this: FilterImpl, input: unknown) {
  const color = read(this, 'color_to_hsl', input)
  if (!color) return ''
  const { h, s, l } = rgbToHsl(color)
  const body = `${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%`
  return color.a < 1 ? `hsla(${body}, ${alphaText(color.a)})` : `hsl(${body})`
}

/** https://shopify.dev/docs/api/liquid/filters/color_to_hex */
function colorToHex (this: FilterImpl, input: unknown) {
  const color = read(this, 'color_to_hex', input)
  return color ? toHex(color) : ''
}

/** https://shopify.dev/docs/api/liquid/filters/color_to_oklch (the page's example prints the alpha as `1.0`). */
function colorToOklch (this: FilterImpl, input: unknown) {
  const color = read(this, 'color_to_oklch', input)
  return color ? `oklch(${oklchText(color)} / ${new LiquidFloat(Number(color.a.toFixed(2)))})` : ''
}

/** The components the page lists: red, green, blue, alpha, hue, saturation and lightness (https://shopify.dev/docs/api/liquid/filters/color_extract). Any other name renders empty, which the page does not pin. */
function colorExtract (this: FilterImpl, input: unknown, component: unknown) {
  const color = read(this, 'color_extract', input)
  if (!color) return ''
  const hsl = rgbToHsl(color)
  switch (stringify(component)) {
    case 'red': return Math.round(color.r)
    case 'green': return Math.round(color.g)
    case 'blue': return Math.round(color.b)
    case 'alpha': return new LiquidFloat(Number(color.a.toFixed(2)))
    case 'hue': return Math.round(hsl.h)
    case 'saturation': return Math.round(hsl.s)
    case 'lightness': return Math.round(hsl.l)
    default: return ''
  }
}

/** https://shopify.dev/docs/api/liquid/filters/color_modify: hex when opaque, `rgba()` once alpha is changed. An unknown component returns the colour unchanged, which the page does not pin. */
function colorModify (this: FilterImpl, input: unknown, component: unknown, value: unknown) {
  const color = read(this, 'color_modify', input)
  if (!color) return ''
  const n = num(value)
  const name = stringify(component)
  if (name === 'red' || name === 'green' || name === 'blue') return formatColor({ ...color, [name[0]]: clamp(n, 0, 255) })
  if (name === 'alpha') return toRgbaFunction({ ...color, a: clamp(n, 0, 1) })
  const hsl = rgbToHsl(color)
  if (name === 'hue') hsl.h = clamp(n, 0, 360)
  else if (name === 'saturation') hsl.s = clamp(n, 0, 100)
  else if (name === 'lightness') hsl.l = clamp(n, 0, 100)
  else return formatColor(color)
  return formatColor({ ...hslToRgb(hsl.h, hsl.s, hsl.l), a: color.a })
}

/** Channel-wise blend, `weight` percent of the input; alpha blends the same way. https://shopify.dev/docs/api/liquid/filters/color_mix */
function colorMix (this: FilterImpl, input: unknown, other: unknown, weight: unknown) {
  const x = read(this, 'color_mix', input)
  const y = read(this, 'color_mix', other)
  if (!x || !y) return ''
  const p = clamp(num(weight), 0, 100) / 100
  const mix = (a: number, b: number) => a * p + b * (1 - p)
  const alpha = Number(mix(x.a, y.a).toFixed(2))
  return formatColor({ r: mix(x.r, y.r), g: mix(x.g, y.g), b: mix(x.b, y.b), a: alpha })
}

/** The W3C perceived brightness (https://shopify.dev/docs/api/liquid/filters/color_brightness). */
function colorBrightness (this: FilterImpl, input: unknown) {
  const color = read(this, 'color_brightness', input)
  return color ? new LiquidFloat(Math.round(brightness(color) * 100) / 100) : ''
}

/** The WCAG contrast ratio to one decimal (https://shopify.dev/docs/api/liquid/filters/color_contrast). */
function colorContrast (this: FilterImpl, input: unknown, other: unknown) {
  const x = read(this, 'color_contrast', input)
  const y = read(this, 'color_contrast', other)
  if (!x || !y) return ''
  const [a, b] = [luminance(x), luminance(y)]
  return new LiquidFloat(Math.round((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) * 10) / 10)
}

/** https://shopify.dev/docs/api/liquid/filters/color_difference */
function colorDifference (this: FilterImpl, input: unknown, other: unknown) {
  const x = read(this, 'color_difference', input)
  const y = read(this, 'color_difference', other)
  if (!x || !y) return ''
  return Math.round(Math.abs(x.r - y.r) + Math.abs(x.g - y.g) + Math.abs(x.b - y.b))
}

/** https://shopify.dev/docs/api/liquid/filters/brightness_difference */
function brightnessDifference (this: FilterImpl, input: unknown, other: unknown) {
  const x = read(this, 'brightness_difference', input)
  const y = read(this, 'brightness_difference', other)
  if (!x || !y) return ''
  return Math.round(Math.abs(brightness(x) - brightness(y)))
}

/** `rgba(234,90,185,1)`, no spaces, alpha 1 by default. https://shopify.dev/docs/api/liquid/filters/hex_to_rgba */
function hexToRgba (this: FilterImpl, input: unknown, alpha: unknown) {
  const color = read(this, 'hex_to_rgba', input)
  if (!color) return ''
  const a = alpha === undefined ? color.a : clamp(num(alpha), 0, 1)
  return `rgba(${Math.round(color.r)},${Math.round(color.g)},${Math.round(color.b)},${alphaText(a)})`
}

export const colorFilters: ShopifyFilterSet = {
  color_brightness: { status: 'approx', handler: colorBrightness },
  color_contrast: { status: 'approx', handler: colorContrast },
  color_darken: { status: 'approx', handler: adjust('color_darken', 'l', -1) },
  color_desaturate: { status: 'approx', handler: adjust('color_desaturate', 's', -1) },
  color_difference: { status: 'approx', handler: colorDifference },
  color_extract: { status: 'approx', handler: colorExtract },
  color_lighten: { status: 'approx', handler: adjust('color_lighten', 'l', 1) },
  color_mix: { status: 'approx', handler: colorMix },
  color_modify: { status: 'approx', handler: colorModify },
  color_saturate: { status: 'approx', handler: adjust('color_saturate', 's', 1) },
  color_to_hex: { status: 'approx', handler: colorToHex },
  color_to_hsl: { status: 'approx', handler: colorToHsl },
  color_to_oklch: { status: 'approx', handler: colorToOklch },
  color_to_rgb: { status: 'approx', handler: colorToRgb },
  brightness_difference: { status: 'approx', handler: brightnessDifference },
  hex_to_rgba: { status: 'approx', handler: hexToRgba }
}
