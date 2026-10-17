import type { FilterImpl } from '../../template/filter-impl-options'
import { stringify, toValue } from '../../util'
import { LiquidFloat } from '../../util/liquid-float'
import { plainValue } from '../util/args'
import { shopifyState } from '../state'
import { alphaText, brightness, clamp, formatColor, hslToRgb, luminance, oklchText, parseColor, rgbToHsl, Rgba, toHex, toRgbaFunction, toRgbFunction } from '../util/color'
import { ColorDrop } from '../objects/color'
import type { UnsupportedFeature } from '../report'
import type { ShopifyFilterSet } from './types'

/**
 * Shopify's colour filters (https://shopify.dev/docs/api/liquid/filters/color-filters). Every expected value in the tests comes from the filter's shopify.dev page. A value that is not a colour renders empty and is reported; shopify.dev does not say what Shopify does there, so that is Debutify's choice.
 */
function read (filter: FilterImpl, name: UnsupportedFeature, input: unknown): Rgba | undefined {
  const text = stringify(toValue(input))
  const color = parseColor(text)
  if (!color && text) shopifyState(filter.context).report.unsupported(name, `not a colour: ${text}`)
  return color
}

/** A colour passed as an argument (`color_mix: '#00936F'`). A missing or unreadable one is reported, and the filter returns its input unchanged (see `badArgument`). */
function readArgument (filter: FilterImpl, name: UnsupportedFeature, argument: unknown): Rgba | undefined {
  const text = stringify(toValue(argument))
  const color = parseColor(text)
  if (!color) shopifyState(filter.context).report.unsupported(name, text ? `not a colour: ${text}` : 'missing argument')
  return color
}

/** The colour a filter returns: a `color` object that prints as the text (`#bfbfbf`) and still answers `.red`, `.green`, `.blue` and the other fields, as on Shopify. Dawn's `layout/theme.liquid` assigns `settings.colors_background_1 | color_darken: 25` and prints its `.red`, `.green` and `.blue`, and the parity store prints `191,191,191` for white darkened by 25 (private parity recordings of Dawn). */
function colorObject (text: string): ColorDrop | string {
  return ColorDrop.from(text) ?? text
}

/** A number passed as an argument, or undefined for a missing or non-numeric one (`nil`, `''`, `'abc'`, `'30%'`). */
function num (value: unknown): number | undefined {
  const plain = plainValue(value)
  if (typeof plain !== 'number' && (typeof plain !== 'string' || plain.trim() === '')) return undefined
  const n = Number(plain)
  return Number.isFinite(n) ? n : undefined
}

/**
 * A missing or unusable argument (a number that is not one, an unknown component) returns the filter's input unchanged and is reported, so the page never carries `NaN` and the report names the filter. shopify.dev documents the arguments but not what Shopify does with a wrong one, so this error case is Debutify's choice.
 */
function badArgument (filter: FilterImpl, name: UnsupportedFeature, input: unknown, argument: unknown, expected: string) {
  const text = stringify(toValue(argument))
  shopifyState(filter.context).report.unsupported(name, text ? `not ${expected}: ${text}` : 'missing argument')
  return input
}

/** `color_lighten`, `color_darken`, `color_saturate` and `color_desaturate` move HSL lightness or saturation by the given points (https://shopify.dev/docs/api/liquid/filters/color_lighten and its siblings), and return a colour object (`colorObject`). The pages show hex input only, so the format printed for `rgb()` or `hsl()` input (hex when opaque, `rgba()` otherwise) is not pinned. */
function adjust (name: UnsupportedFeature, key: 's' | 'l', sign: 1 | -1) {
  return function (this: FilterImpl, input: unknown, amount: unknown) {
    const color = read(this, name, input)
    if (!color) return ''
    const points = num(amount)
    if (points === undefined) return badArgument(this, name, input, amount, 'a number')
    const hsl = rgbToHsl(color)
    hsl[key] = clamp(hsl[key] + sign * points, 0, 100)
    return colorObject(formatColor({ ...hslToRgb(hsl.h, hsl.s, hsl.l), a: color.a }))
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

/** The components the page lists: red, green, blue, alpha, hue, saturation and lightness (https://shopify.dev/docs/api/liquid/filters/color_extract). Any other name, or none, returns the input unchanged and is reported; the page does not pin that error case. */
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
    default: return badArgument(this, 'color_extract', input, component, 'a colour component')
  }
}

const COMPONENTS = ['red', 'green', 'blue', 'alpha', 'hue', 'saturation', 'lightness']

/** https://shopify.dev/docs/api/liquid/filters/color_modify: hex when opaque, `rgba()` once alpha is changed, returned as a colour object (`colorObject`). An unknown component, or a value that is not a number, returns the input unchanged and is reported; the page does not pin that error case. */
function colorModify (this: FilterImpl, input: unknown, component: unknown, value: unknown) {
  const color = read(this, 'color_modify', input)
  if (!color) return ''
  const name = stringify(component)
  if (!COMPONENTS.includes(name)) return badArgument(this, 'color_modify', input, component, 'a colour component')
  const n = num(value)
  if (n === undefined) return badArgument(this, 'color_modify', input, value, 'a number')
  if (name === 'red' || name === 'green' || name === 'blue') return colorObject(formatColor({ ...color, [name[0]]: clamp(n, 0, 255) }))
  if (name === 'alpha') return colorObject(toRgbaFunction({ ...color, a: clamp(n, 0, 1) }))
  const hsl = rgbToHsl(color)
  if (name === 'hue') hsl.h = clamp(n, 0, 360)
  else if (name === 'saturation') hsl.s = clamp(n, 0, 100)
  else hsl.l = clamp(n, 0, 100)
  return colorObject(formatColor({ ...hslToRgb(hsl.h, hsl.s, hsl.l), a: color.a }))
}

/**
 * Channel-wise blend, alpha included. https://shopify.dev/docs/api/liquid/filters/color_mix pins the direction of the weight in its tip ("A percentage factor of 100 returns the color being filtered. A percentage factor of 0 returns the color supplied to the filter."): `weight` is the percentage of the input, so 25 is 25% of the first colour. The page's example shows only a weight of 50, so how the values between the two ends are interpolated (linearly, per channel, alpha included) is not pinned. A missing or non-numeric weight, or an unreadable second colour, returns the input unchanged and is reported (not pinned either). The blend is returned as a colour object (`colorObject`).
 */
function colorMix (this: FilterImpl, input: unknown, other: unknown, weight: unknown) {
  const x = read(this, 'color_mix', input)
  if (!x) return ''
  const y = readArgument(this, 'color_mix', other)
  if (!y) return input
  const amount = num(weight)
  if (amount === undefined) return badArgument(this, 'color_mix', input, weight, 'a number')
  const p = clamp(amount, 0, 100) / 100
  const mix = (a: number, b: number) => a * p + b * (1 - p)
  const alpha = Number(mix(x.a, y.a).toFixed(2))
  return colorObject(formatColor({ r: mix(x.r, y.r), g: mix(x.g, y.g), b: mix(x.b, y.b), a: alpha }))
}

/** The W3C perceived brightness (https://shopify.dev/docs/api/liquid/filters/color_brightness). */
function colorBrightness (this: FilterImpl, input: unknown) {
  const color = read(this, 'color_brightness', input)
  return color ? new LiquidFloat(Math.round(brightness(color) * 100) / 100) : ''
}

/** The WCAG contrast ratio to one decimal (https://shopify.dev/docs/api/liquid/filters/color_contrast). */
function colorContrast (this: FilterImpl, input: unknown, other: unknown) {
  const x = read(this, 'color_contrast', input)
  if (!x) return ''
  const y = readArgument(this, 'color_contrast', other)
  if (!y) return input
  const [a, b] = [luminance(x), luminance(y)]
  return new LiquidFloat(Math.round((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) * 10) / 10)
}

/** https://shopify.dev/docs/api/liquid/filters/color_difference */
function colorDifference (this: FilterImpl, input: unknown, other: unknown) {
  const x = read(this, 'color_difference', input)
  if (!x) return ''
  const y = readArgument(this, 'color_difference', other)
  if (!y) return input
  return Math.round(Math.abs(x.r - y.r) + Math.abs(x.g - y.g) + Math.abs(x.b - y.b))
}

/** https://shopify.dev/docs/api/liquid/filters/brightness_difference */
function brightnessDifference (this: FilterImpl, input: unknown, other: unknown) {
  const x = read(this, 'brightness_difference', input)
  if (!x) return ''
  const y = readArgument(this, 'brightness_difference', other)
  if (!y) return input
  return Math.round(Math.abs(brightness(x) - brightness(y)))
}

/** `rgba(234,90,185,1)`, no spaces, alpha 1 by default. https://shopify.dev/docs/api/liquid/filters/hex_to_rgba */
function hexToRgba (this: FilterImpl, input: unknown, alpha: unknown) {
  const color = read(this, 'hex_to_rgba', input)
  if (!color) return ''
  let a = color.a
  if (alpha !== undefined) {
    const amount = num(alpha)
    if (amount === undefined) return badArgument(this, 'hex_to_rgba', input, alpha, 'a number')
    a = clamp(amount, 0, 1)
  }
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
