import { toValue } from '../util/underscore'
import { LiquidFloat } from '../util/liquid-float'
import type { FilterImplOptions } from '../template'

interface RubyNumber {
  value: number
  float: boolean
}

const DECIMAL = /^-?\d+\.\d+$/

/** Shopify's `Utils.to_number`: decimals stay decimal, decimal strings become decimals, other strings take their leading integer, anything else is 0. */
export function toRubyNumber (input: unknown): RubyNumber {
  if (input instanceof LiquidFloat) return { value: input.value, float: true }
  const value = toValue(input)
  if (typeof value === 'number') return { value, float: !Number.isInteger(value) }
  if (typeof value === 'string') {
    const text = value.trim()
    if (DECIMAL.test(text)) return { value: Number(text), float: true }
    const whole = parseInt(text, 10)
    return { value: Number.isNaN(whole) ? 0 : whole, float: false }
  }
  return { value: 0, float: false }
}

function decimalPlaces (n: number): number {
  const text = String(n)
  if (/e/i.test(text)) return -1
  const point = text.indexOf('.')
  return point === -1 ? 0 : text.length - point - 1
}

/** Rounds away binary noise to the places the operands imply, as Ruby's BigDecimal arithmetic would (0.1 + 0.2 is 0.3). */
function exact (result: number, places: number): number {
  if (places < 0 || places > 100 || !Number.isFinite(result)) return result
  return Number(result.toFixed(places))
}

function wrap (value: number, float: boolean): number | LiquidFloat {
  return float ? new LiquidFloat(value) : value
}

function zeroCheck (divisor: number) {
  if (divisor === 0) throw new Error('divided by 0')
}

/** `plus` and `minus`: exact to the larger number of decimal places when either side is a decimal. */
function additive (input: unknown, operand: unknown, operate: (a: number, b: number) => number) {
  const a = toRubyNumber(input)
  const b = toRubyNumber(operand)
  const float = a.float || b.float
  const places = Math.max(decimalPlaces(a.value), decimalPlaces(b.value))
  const result = operate(a.value, b.value)
  return wrap(float ? exact(result, places) : result, float)
}

function plus (input: unknown, operand: unknown) {
  return additive(input, operand, (a, b) => a + b)
}

function minus (input: unknown, operand: unknown) {
  return additive(input, operand, (a, b) => a - b)
}

function times (input: unknown, operand: unknown) {
  const a = toRubyNumber(input)
  const b = toRubyNumber(operand)
  const float = a.float || b.float
  const da = decimalPlaces(a.value)
  const db = decimalPlaces(b.value)
  const places = da < 0 || db < 0 ? -1 : da + db
  return wrap(float ? exact(a.value * b.value, places) : a.value * b.value, float)
}

interface Scaled {
  a: number
  b: number
  factor: number
}

/** Both operands as integers scaled by 10^places, when they have a finite number of decimal places and the scaled values stay within the safe-integer range. Dividing and taking remainders of those integers is exact, as Ruby's BigDecimal arithmetic is. */
function scaleToIntegers (a: number, b: number): Scaled | undefined {
  const da = decimalPlaces(a)
  const db = decimalPlaces(b)
  if (da < 0 || db < 0) return undefined
  const places = Math.max(da, db)
  // 10^22 is the largest power of ten a double holds exactly
  if (places > 22) return undefined
  const factor = Number(`1e${places}`)
  const scaledA = Math.round(a * factor)
  const scaledB = Math.round(b * factor)
  if (!Number.isSafeInteger(scaledA) || !Number.isSafeInteger(scaledB)) return undefined
  // scaling must be lossless: dividing back by the exact power of ten has to give the operands again
  if (scaledA / factor !== a || scaledB / factor !== b) return undefined
  return { a: scaledA, b: scaledB, factor }
}

function dividedBy (input: unknown, operand: unknown) {
  const a = toRubyNumber(input)
  const b = toRubyNumber(operand)
  // only whole numbers raise: a decimal on either side divides as a Float does, to Infinity, -Infinity or NaN
  if (!a.float && !b.float) {
    zeroCheck(b.value)
    return Math.floor(a.value / b.value)
  }
  const scaled = scaleToIntegers(a.value, b.value)
  return new LiquidFloat(scaled ? scaled.a / scaled.b : a.value / b.value)
}

function modulo (input: unknown, operand: unknown) {
  const a = toRubyNumber(input)
  const b = toRubyNumber(operand)
  zeroCheck(b.value)
  const float = a.float || b.float
  const scaled = float ? scaleToIntegers(a.value, b.value) : undefined
  // the remainder takes the divisor's sign, as Ruby's does; adding 0 turns -0 into 0
  if (scaled) return new LiquidFloat((((scaled.a % scaled.b) + scaled.b) % scaled.b) / scaled.factor + 0)
  const result = ((a.value % b.value) + b.value) % b.value + 0
  const places = Math.max(decimalPlaces(a.value), decimalPlaces(b.value))
  return wrap(float ? exact(result, places) : result, float)
}

function roundHalfAwayFromZero (value: number, places: number): number {
  const factor = Math.pow(10, places)
  return Math.sign(value) * Math.round(Math.abs(value) * factor * (1 + Number.EPSILON)) / factor
}

function round (input: unknown, places: unknown = 0) {
  const a = toRubyNumber(input)
  const n = toRubyNumber(places).value
  const rounded = roundHalfAwayFromZero(a.value, n)
  if (!a.float || n === 0) return Math.trunc(rounded) === rounded ? rounded : Math.round(rounded)
  return new LiquidFloat(exact(rounded, Math.max(n, 0)))
}

function ceil (input: unknown) {
  return Math.ceil(toRubyNumber(input).value)
}

function floor (input: unknown) {
  return Math.floor(toRubyNumber(input).value)
}

function abs (input: unknown) {
  const a = toRubyNumber(input)
  return wrap(Math.abs(a.value), a.float)
}

/** `at_least` and `at_most`: the operand wins only when `prefersOperand` says so, and the winner keeps its own type. */
function pick (input: unknown, operand: unknown, prefersOperand: (a: number, b: number) => boolean) {
  const a = toRubyNumber(input)
  const b = toRubyNumber(operand)
  const winner = prefersOperand(a.value, b.value) ? b : a
  return wrap(winner.value, winner.float)
}

function atLeast (input: unknown, operand: unknown) {
  return pick(input, operand, (a, b) => b > a)
}

function atMost (input: unknown, operand: unknown) {
  return pick(input, operand, (a, b) => b < a)
}

/** Math filters under `numberSemantics: 'ruby'`, registered over the default ones by `Liquid`. */
export const rubyMathFilters: Record<string, FilterImplOptions> = {
  abs,
  at_least: atLeast,
  at_most: atMost,
  ceil,
  divided_by: dividedBy,
  floor,
  minus,
  modulo,
  plus,
  round,
  times
}
