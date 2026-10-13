import { formatRubyFloat } from '../../util/liquid-float'

/** A colour as sRGB channels (0–255, unrounded) and alpha (0–1). */
export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

const HEX = /^#([0-9a-f]{3,8})$/i
const RGB = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i
const HSL = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i

function alphaOf (text: string | undefined): number {
  if (text === undefined) return 1
  return text.endsWith('%') ? Number(text.slice(0, -1)) / 100 : Number(text)
}

/** Reads the colour notations Shopify's colour filters accept: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, `hsl()` and `hsla()`. */
export function parseColor (input: string): Rgba | undefined {
  const text = input.trim()
  let match = HEX.exec(text)
  if (match) {
    let hex = match[1]
    if (hex.length === 3 || hex.length === 4) hex = hex.split('').map(ch => ch + ch).join('')
    if (hex.length !== 6 && hex.length !== 8) return undefined
    const channel = (at: number) => parseInt(hex.slice(at, at + 2), 16)
    return { r: channel(0), g: channel(2), b: channel(4), a: hex.length === 8 ? channel(6) / 255 : 1 }
  }
  match = RGB.exec(text)
  if (match) return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]), a: alphaOf(match[4]) }
  match = HSL.exec(text)
  if (match) return { ...hslToRgb(Number(match[1]), Number(match[2]), Number(match[3])), a: alphaOf(match[4]) }
  return undefined
}

/** Hue in degrees, saturation and lightness in percent, unrounded. */
export function rgbToHsl ({ r, g, b }: Rgba): { h: number, s: number, l: number } {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255]
  const max = Math.max(rr, gg, bb)
  const min = Math.min(rr, gg, bb)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  let s = 0
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === rr) h = (gg - bb) / d + (gg < bb ? 6 : 0)
    else if (max === gg) h = (bb - rr) / d + 2
    else h = (rr - gg) / d + 4
    h *= 60
  }
  return { h, s: s * 100, l: l * 100 }
}

export function hslToRgb (h: number, s: number, l: number): { r: number, g: number, b: number } {
  const hue = (((h % 360) + 360) % 360) / 360
  const sat = s / 100
  const light = l / 100
  if (sat === 0) return { r: light * 255, g: light * 255, b: light * 255 }
  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat
  const p = 2 * light - q
  const channel = (t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return { r: channel(hue + 1 / 3) * 255, g: channel(hue) * 255, b: channel(hue - 1 / 3) * 255 }
}

/** OKLCH lightness (0–1), chroma and hue in degrees, through OKLab (https://bottosson.github.io/posts/oklab/). */
export function rgbToOklch ({ r, g, b }: Rgba): { l: number, c: number, h: number } {
  const linear = (v: number) => {
    const x = v / 255
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  }
  const [lr, lg, lb] = [linear(r), linear(g), linear(b)]
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  const c = Math.sqrt(A * A + B * B)
  const h = c < 1e-4 ? 0 : (Math.atan2(B, A) * 180 / Math.PI + 360) % 360
  return { l: L, c, h }
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
const byte = (n: number) => Math.round(clamp(n, 0, 255))
const hex2 = (n: number) => byte(n).toString(16).padStart(2, '0')

/** Alpha with at most two decimals, as Shopify prints it in `rgba()` (`0.88`, `1`). */
export function alphaText (a: number): string {
  return String(Number(clamp(a, 0, 1).toFixed(2)))
}

export function toHex (color: Rgba): string {
  return `#${hex2(color.r)}${hex2(color.g)}${hex2(color.b)}`
}

/** `rgba(234, 90, 185, 0.85)`. */
export function toRgbaFunction (color: Rgba): string {
  return `rgba(${byte(color.r)}, ${byte(color.g)}, ${byte(color.b)}, ${alphaText(color.a)})`
}

/** `rgb(234, 90, 185)`, or `rgba(234, 90, 185, 0.5)` when the colour is not opaque. */
export function toRgbFunction (color: Rgba): string {
  return color.a < 1 ? toRgbaFunction(color) : `rgb(${byte(color.r)}, ${byte(color.g)}, ${byte(color.b)})`
}

/** How the modifying colour filters return a colour: hex when opaque, `rgba()` otherwise. https://shopify.dev/docs/api/liquid/filters/color_modify */
export function formatColor (color: Rgba): string {
  return color.a < 1 ? toRgbFunction(color) : toHex(color)
}

/** `68% 0.2 343` — OKLCH as Shopify's `color.oklch` and `color_to_oklch` print it. */
export function oklchText (color: Rgba): string {
  const { l, c, h } = rgbToOklch(color)
  return `${Math.round(l * 100)}% ${formatRubyFloat(Number(c.toFixed(2)))} ${Math.round(h)}`
}

/** W3C perceived brightness, 0–255. https://shopify.dev/docs/api/liquid/filters/color_brightness */
export function brightness ({ r, g, b }: Rgba): number {
  return (r * 299 + g * 587 + b * 114) / 1000
}

/** WCAG relative luminance. https://shopify.dev/docs/api/liquid/filters/color_contrast */
export function luminance ({ r, g, b }: Rgba): number {
  const channel = (v: number) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export { clamp }
