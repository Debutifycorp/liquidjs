import { EmptyDrop, NullDrop } from '../../drop'
import { LiquidFloat } from '../../util/liquid-float'

export interface FilterArgs {
  positional: unknown[]
  named: Record<string, unknown>
  /** Named argument names in the order the template wrote them. */
  order: string[]
}

/** Turns `nil`, `empty`, `blank` and Ruby decimals into plain JavaScript values; other values, Drops included, stay as they are. */
export function plainValue (value: unknown): unknown {
  if (value instanceof NullDrop) return null
  if (value instanceof EmptyDrop) return ''
  if (value instanceof LiquidFloat) return value.value
  return value
}

/** LiquidJS passes keyword arguments (`image_tag: width: 300`) as `[name, value]` pairs after the positional ones. */
export function splitArgs (args: unknown[]): FilterArgs {
  const positional: unknown[] = []
  const named: Record<string, unknown> = Object.create(null)
  const order: string[] = []
  for (const arg of args) {
    if (Array.isArray(arg) && arg.length === 2 && typeof arg[0] === 'string') {
      named[arg[0]] = plainValue(arg[1])
      order.push(arg[0])
    } else {
      positional.push(plainValue(arg))
    }
  }
  return { positional, named, order }
}

export function has (named: Record<string, unknown>, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(named, name)
}
