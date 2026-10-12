import { Drop } from '../drop/drop'

/**
 * Formats a number the way Ruby's `Float#to_s` does, which is what Shopify Liquid prints: a whole-valued decimal keeps `.0`, and exponent form is used below 1e-4 and from 1e16 up, with at least two exponent digits.
 */
export function formatRubyFloat (n: number): string {
  if (Number.isNaN(n)) return 'NaN'
  if (!Number.isFinite(n)) return n > 0 ? 'Infinity' : '-Infinity'
  if (n === 0) return Object.is(n, -0) ? '-0.0' : '0.0'
  const abs = Math.abs(n)
  if (abs >= 1e16 || abs < 1e-4) {
    const [mantissa, exponent] = n.toExponential().split('e')
    const digits = mantissa.includes('.') ? mantissa : `${mantissa}.0`
    const power = Number(exponent)
    return `${digits}e${power < 0 ? '-' : '+'}${String(Math.abs(power)).padStart(2, '0')}`
  }
  const text = String(n)
  return text.includes('.') ? text : `${text}.0`
}

/**
 * A decimal under `numberSemantics: 'ruby'`. JavaScript has one number type, so `2.0` and `2` are the same value; wrapping decimals keeps Shopify's behaviour: they print with a point and make arithmetic decimal. Comparisons and plain filters see the number through `valueOf()`.
 */
export class LiquidFloat extends Drop {
  public constructor (public readonly value: number) {
    super()
  }

  public valueOf (): number {
    return this.value
  }

  public toString (): string {
    return formatRubyFloat(this.value)
  }

  public toJSON (): number {
    return this.value
  }
}
