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
  return (cents < 0 ? '-' : '') + grouped + (fraction ? style.decimal + fraction : '')
}

/** Formats an amount in cents through a money format such as `${{amount}}`; `trimZeros` drops `.00` the way `money_without_trailing_zeros` does. Rounding a fraction of a cent half away from zero, and the `-` before a negative amount, are not pinned by shopify.dev. */
export function formatMoney (cents: number, format: string, trimZeros = false): string {
  return format.replace(PLACEHOLDER, (whole: string, name: string) => {
    const style = AMOUNT_STYLES[name]
    if (!style) return whole
    return formatAmount(cents, trimZeros && Math.round(cents) % 100 === 0 ? { ...style, decimals: 0 } : style)
  })
}

/** The amount in cents, or undefined for nil and the empty string (they print nothing). https://shopify.dev/docs/api/liquid/filters/money does not say what nil prints nor what a non-numeric value does; here nil prints nothing and a non-numeric value is 0, which is not pinned. The page does not state that the input is in cents either, though its example (1000 prints `$10.00`) shows it. */
function cents (input: unknown): number | undefined {
  const value = plainValue(toValue(input))
  if (isNil(value) || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** The price in the shop's "HTML without currency" format (`shop.money_format`), https://shopify.dev/docs/api/liquid/filters/money (`1000` prints `$10.00`). */
function money (this: FilterImpl, input: unknown) {
  const amount = cents(input)
  return amount === undefined ? '' : formatMoney(amount, shopifyState(this.context).money.format)
}

/** The price in the shop's "HTML with currency" format (`shop.money_with_currency_format`), https://shopify.dev/docs/api/liquid/filters/money_with_currency. Any space between amount and currency code comes from the format string; whether Shopify writes a space or a no-break space there is not pinned by shopify.dev. */
function moneyWithCurrency (this: FilterImpl, input: unknown) {
  const amount = cents(input)
  return amount === undefined ? '' : formatMoney(amount, shopifyState(this.context).money.withCurrencyFormat)
}

/** The shop's money format without its currency symbol: only its amount placeholder. https://shopify.dev/docs/api/liquid/filters/money_without_currency; for a format with more than the amount (a prefix, a suffix, several placeholders) what Shopify keeps is not pinned by shopify.dev, so the first placeholder is used. */
function moneyWithoutCurrency (this: FilterImpl, input: unknown) {
  const amount = cents(input)
  if (amount === undefined) return ''
  const placeholder = /\{\{\s*\w+\s*\}\}/.exec(shopifyState(this.context).money.format)
  return formatMoney(amount, placeholder ? placeholder[0] : '{{amount}}')
}

/** https://shopify.dev/docs/api/liquid/filters/money_without_trailing_zeros: the money format without the decimal separator (`.` or `,`) and trailing zeros (`1000` prints `$10`); with a non-zero decimal value the output is the same as `money`. */
function moneyWithoutTrailingZeros (this: FilterImpl, input: unknown) {
  const amount = cents(input)
  return amount === undefined ? '' : formatMoney(amount, shopifyState(this.context).money.format, true)
}

export const moneyFilters: ShopifyFilterSet = {
  money: { status: 'approx', handler: money },
  money_with_currency: { status: 'approx', handler: moneyWithCurrency },
  money_without_currency: { status: 'approx', handler: moneyWithoutCurrency },
  money_without_trailing_zeros: { status: 'approx', handler: moneyWithoutTrailingZeros }
}
