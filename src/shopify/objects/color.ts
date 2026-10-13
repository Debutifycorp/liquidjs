import { Drop } from '../../drop'
import { LiquidFloat, formatRubyFloat } from '../../util/liquid-float'
import { oklchText, parseColor, rgbToHsl, rgbToOklch, Rgba } from '../util/color'

/** Shopify's `color` object for a `color` setting. Printed on its own it is the setting's value as saved (`#334fb4`). https://shopify.dev/docs/api/liquid/objects/color */
export class ColorDrop extends Drop {
  public readonly red: number
  public readonly green: number
  public readonly blue: number
  public readonly alpha: LiquidFloat
  public readonly hue: number
  public readonly saturation: number
  public readonly lightness: number
  public readonly rgb: string
  public readonly rgba: string
  public readonly chroma: LiquidFloat
  public readonly color_space = 'srgb'
  public readonly oklch: string
  public readonly oklcha: string

  private constructor (private readonly text: string, color: Rgba) {
    super()
    const hsl = rgbToHsl(color)
    this.red = Math.round(color.r)
    this.green = Math.round(color.g)
    this.blue = Math.round(color.b)
    this.alpha = new LiquidFloat(Number(color.a.toFixed(2)))
    this.hue = Math.round(hsl.h)
    this.saturation = Math.round(hsl.s)
    this.lightness = Math.round(hsl.l)
    this.rgb = `${this.red} ${this.green} ${this.blue}`
    this.rgba = `${this.rgb} / ${formatRubyFloat(this.alpha.value)}`
    this.chroma = new LiquidFloat(Number(rgbToOklch(color).c.toFixed(2)))
    this.oklch = oklchText(color)
    this.oklcha = `${this.oklch} / ${formatRubyFloat(this.alpha.value)}`
  }

  /** The colour object for a setting value, or undefined when the value is blank or not a colour. */
  public static from (value: string): ColorDrop | undefined {
    const color = value ? parseColor(value) : undefined
    return color ? new ColorDrop(value, color) : undefined
  }

  public valueOf () {
    return this.text
  }
}
