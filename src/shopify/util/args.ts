import { EmptyDrop, NullDrop } from '../../drop'
import { LiquidFloat } from '../../util/liquid-float'

export interface FilterArgs {
  positional: unknown[]
  named: Record<string, unknown>
  /** Named argument names in the order the template wrote them, each once. */
  order: string[]
}

/** Turns `nil`, `empty`, `blank` and Ruby decimals into plain JavaScript values; other values, Drops included, stay as they are. */
export function plainValue (value: unknown): unknown {
  if (value instanceof NullDrop) return null
  if (value instanceof EmptyDrop) return ''
  if (value instanceof LiquidFloat) return value.value
  return value
}

/** LiquidJS passes keyword arguments (`image_tag: width: 300`) as `[name, value]` pairs after the positional ones, so a positional array of two items that starts with a string looks the same as one (a limit of the engine's filter protocol). Filters that write argument names as HTML attributes check them with `namedAttributes`, which drops names that are not valid attribute names. */
export function splitArgs (args: unknown[]): FilterArgs {
  const positional: unknown[] = []
  const named: Record<string, unknown> = Object.create(null)
  const order: string[] = []
  for (const arg of args) {
    if (Array.isArray(arg) && arg.length === 2 && typeof arg[0] === 'string') {
      // a name written twice keeps its first place and its last value, as Shopify writes it: Horizon's `product-media` passes `ref:` twice to `image_tag`, and the parity store prints one `ref` attribute where the first one stood (private parity recordings of Horizon)
      if (!order.includes(arg[0])) order.push(arg[0])
      named[arg[0]] = plainValue(arg[1])
    } else {
      positional.push(plainValue(arg))
    }
  }
  return { positional, named, order }
}

/** The named arguments for printing: as `splitArgs(args).named`, except that a Ruby decimal stays a `LiquidFloat`, which prints `10.0` where the plain number prints `10`. */
export function namedForDisplay (args: unknown[]): Record<string, unknown> {
  const display: Record<string, unknown> = Object.create(null)
  for (const arg of args) {
    if (Array.isArray(arg) && arg.length === 2 && typeof arg[0] === 'string') display[arg[0]] = arg[1] instanceof LiquidFloat ? arg[1] : plainValue(arg[1])
  }
  return display
}
