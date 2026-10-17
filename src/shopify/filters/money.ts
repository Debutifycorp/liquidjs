import type { FilterImpl } from '../../template/filter-impl-options'
import { isNil, toValue } from '../../util'
import { plainValue } from '../util/args'
import { shopifyState } from '../state'
import type { ShopifyFilterSet } from './types'

interface AmountStyle {
  decimals: number
  thousands: string
  decimal: string
}

/** The amount placeholders of a shop's money formats, https://help.shopify.com/manual/international/pricing/currency-formatting (a placeholder that is not in this table is left as written; which placeholders exist beyond those on that page is not pinned). */
const AMOUNT_STYLES: Record<string, AmountStyle> = {
  amount: { decimals: 2, thousands: ',', decimal: '.' },
  amount_no_decimals: { decimals: 0, thousands: ',', decimal: '.' },
  amount_with_comma_separator: { decimals: 2, thousands: '.', decimal: ',' },
  amount_no_decimals_with_comma_separator: { decimals: 0, thousands: '.', decimal: ',' },
  amount_with_apostrophe_separator: { decimals: 2, thousands: "'", decimal: '.' },
  amount_no_decimals_with_space_separator: { decimals: 0, thousands: ' ', decimal: ',' },
  amount_with_space_separator: { decimals: 2, thousands: ' ', decimal: ',' },
  amount_with_period_and_space_separator: { decimals: 2, thousands: ' ', decimal: '.' }
}

const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g

function formatAmount (cents: number, style: AmountStyle): string {
  const fixed = (Math.abs(Math.round(cents)) / 100).toFixed(style.decimals)
  const [whole, fraction] = fixed.split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, style.thousands)
  // no sign in front of an amount that prints as zero (`$-0.00`)
  return (cents < 0 && /[1-9]/.test(fixed) ? '-' : '') + grouped + (fraction ? style.decimal + fraction : '')
}

/** Formats an amount in cents through a money format such as `${{amount}}`; `trimZeros` drops `.00` the way `money_without_trailing_zeros` does. The money filters pass whole cents; a fraction of a cent given here rounds half away from zero. The `-` before a negative amount (`$-1.50`, as Ruby's `format` writes it) is not pinned by shopify.dev, and none is written for an amount that prints as zero. */
export function formatMoney (cents: number, format: string, trimZeros = false): string {
  return format.replace(PLACEHOLDER, (whole: string, name: string) => {
    const style = AMOUNT_STYLES[name]
    if (!style) return whole
    return formatAmount(cents, trimZeros && Math.round(cents) % 100 === 0 ? { ...style, decimals: 0 } : style)
  })
}

/** Ruby's `String#to_i`: the leading integer of the text (an optional sign and digits, `_` allowed between digits), 0 when there is none. */
function rubyToI (text: string): number {
  const match = /^\s*([+-]?\d+(?:_\d+)*)/.exec(text)
  return match ? Number(match[1].replace(/_/g, '')) : 0
}

/**
 * The amount in cents, or undefined when there is nothing to print. https://shopify.dev/docs/api/liquid/filters/money does not say what nil prints, how a fraction of a cent rounds, what a string or other non-number does, nor that the input is in cents (its example, `1000` printing `$10.00`, shows it). Where shopify.dev is silent this follows liquid-spec's reference theme filters (docs/implementers/shopify-theme-filters.md at the ref pinned in spec/liquid-spec/Gemfile): `money` there is `return "" if cents.nil?` then `format("$%.2f", cents.to_i / 100.0)`. So nil prints nothing, a fraction of a cent is dropped (`1999.9` prints `$19.99`, `-0.4` prints `$0.00`), and a string reads as Ruby's `to_i` (`"1000"` is 1000, `"abc"` and `""` are 0). The reference raises on a value without `to_i` (`true`, an array, a hash, a non-finite decimal); here that prints nothing and is reported as unsupported. That reference is a test-support module, not Shopify's code, so all of this is unpinned and goes on the "confirm on a development store" list.
 */
function cents (filter: FilterImpl, input: unknown): number | undefined {
  const value = plainValue(toValue(input))
  if (isNil(value)) return undefined
  if (typeof value === 'string') return rubyToI(value)
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  shopifyState(filter.context).report.unsupported('money_input', typeof value === 'object' ? (Array.isArray(value) ? 'array' : 'object') : String(value))
  return undefined
}

/** The price in the shop's "HTML without currency" format (`shop.money_format`), https://shopify.dev/docs/api/liquid/filters/money (`1000` prints `$10.00`). */
function money (this: FilterImpl, input: unknown) {
  const amount = cents(this, input)
  return amount === undefined ? '' : formatMoney(amount, shopifyState(this.context).money.format)
}

/** The price in the shop's "HTML with currency" format (`shop.money_with_currency_format`), https://shopify.dev/docs/api/liquid/filters/money_with_currency. The space between amount and currency code comes from the format string, a plain space, as the parity store prints it (fixtures `probe-page-*`: `$19.99 USD`, `$19.99 CAD`, `€19,99 EUR`), where shopify.dev does not say whether it is a space or a no-break space. */
function moneyWithCurrency (this: FilterImpl, input: unknown) {
  const amount = cents(this, input)
  return amount === undefined ? '' : formatMoney(amount, shopifyState(this.context).money.withCurrencyFormat)
}

/** The shop's money format without its currency symbol: only its amount placeholder. https://shopify.dev/docs/api/liquid/filters/money_without_currency; for a format with more than the amount (a prefix, a suffix, several placeholders) what Shopify keeps is not pinned by shopify.dev, so the first placeholder is used. */
function moneyWithoutCurrency (this: FilterImpl, input: unknown) {
  const amount = cents(this, input)
  if (amount === undefined) return ''
  const placeholder = /\{\{\s*\w+\s*\}\}/.exec(shopifyState(this.context).money.format)
  return formatMoney(amount, placeholder ? placeholder[0] : '{{amount}}')
}

/** https://shopify.dev/docs/api/liquid/filters/money_without_trailing_zeros: the money format without the decimal separator (`.` or `,`) and trailing zeros (`1000` prints `$10`); with a non-zero decimal value the output is the same as `money`. */
function moneyWithoutTrailingZeros (this: FilterImpl, input: unknown) {
  const amount = cents(this, input)
  return amount === undefined ? '' : formatMoney(amount, shopifyState(this.context).money.format, true)
}

/** An amount in cents as a plain decimal in currency units, as Ruby prints a float: at least one digit after the point, no thousands separator, no symbol (`1000` is `10.0`, `8295` is `82.95`). */
export function decimalAmount (cents: number): string {
  const units = cents / 100
  return Number.isInteger(units) ? units.toFixed(1) : String(units)
}

/** The price as a plain decimal, https://shopify.dev/docs/api/liquid/filters/money_amount ("a plain decimal string, without currency symbols, thousand separators, or locale formatting"; `1000` prints `10.0`). The parity store prints Dawn's `data-selected-price-amount="{{ … price | default: 0 | money_amount | escape }}"` as `90.0`, `25.0`, `200.0` and, on the Europe market, `82.95` (private parity recordings of Dawn: `page-product-variant`, `page-product-subscription`, `page-product-requires-plan` and `page-product-en-eu`). Nil and other inputs are read as `money` reads them (`cents`). */
function moneyAmount (this: FilterImpl, input: unknown) {
  const amount = cents(this, input)
  return amount === undefined ? '' : decimalAmount(amount)
}

/**
 * The unit price with its measurement, https://shopify.dev/docs/api/liquid/filters/unit_price_with_measurement: a number is formatted with the shop's "HTML without currency" format, as `money` formats it, a string (a price a money filter already formatted) is kept as it is, and `/` and the measurement's `reference_unit` follow (`5000` with a measurement of `kg` prints `$50.00/kg`, and `5000 | money_with_currency` prints `$50.00 CAD/kg`). A `reference_value` other than 1 is written before the unit (`$5.00/100g`), as Shopify's themes printed it before the filter existed (Dawn's `unit-price` snippet: `reference_value` when it is not 1, then `reference_unit`); the page's examples have a value of 1, so that form is not pinned. Without a measurement the price prints alone, and nil prints nothing, which is not pinned either. The store data has no unit prices (`variant.unit_price_measurement` is nil).
 */
function unitPriceWithMeasurement (this: FilterImpl, input: unknown, measurement: unknown) {
  const value = plainValue(toValue(input))
  const price = typeof value === 'string' ? value : money.call(this, value)
  const unit = toValue(measurement) as Record<string, unknown> | null | undefined
  const name = unit && typeof unit === 'object' ? plainValue(toValue(unit.reference_unit)) : undefined
  if (price === '' || isNil(name) || name === '') return price
  const reference = Number(plainValue(toValue(unit!.reference_value)))
  return `${price}/${Number.isFinite(reference) && reference !== 1 ? reference : ''}${String(name)}`
}

export const moneyFilters: ShopifyFilterSet = {
  money: { status: 'approx', handler: money },
  money_with_currency: { status: 'approx', handler: moneyWithCurrency },
  money_without_currency: { status: 'approx', handler: moneyWithoutCurrency },
  money_without_trailing_zeros: { status: 'approx', handler: moneyWithoutTrailingZeros },
  money_amount: { status: 'exact', handler: moneyAmount },
  unit_price_with_measurement: { status: 'approx', handler: unitPriceWithMeasurement }
}
