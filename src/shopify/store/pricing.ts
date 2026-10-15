import type { ViewCurrency } from './markets'

/**
 * Shopify's "Round up to the nearest {value}" per currency, in major units. https://help.shopify.com/en/manual/international/pricing/rounding names the setting and says "prices are automatically rounded to the most common denominator for each currency" and "You can't customize your rounding rules to anything different from these defaults", but lists no values, so these are the ones the parity store applies, as it renders them: the Canadian dollar rounds up to whole units (fixture `probe-product-en-ca`: the hoodie's 90.00 USD, 121.50 CAD at 1.35, is 122.00, and its compare-at 110.00 USD, 148.50 CAD, is 149.00) and the euro up to an amount ending in .95 (fixtures `probe-product-en-eu`, `probe-product-fr-eu` and `probe-collection-en-eu-price`: 25.00 USD, 23.00 EUR at 0.92, is 23.95, and 40.00, 50.00 and 100.00 USD, 36.80, 46.00 and 92.00 EUR, are 36.95, 46.95 and 92.95). The euro is where the fixtures and the docs disagree: the example on https://help.shopify.com/en/manual/international/pricing/exchange-rates rounds 8.81 EUR up to 8.85, a step of .05, and the fixture wins. A currency not listed here rounds only when its market data gives a number (`MarketData.currency.rounding`).
 */
export const ROUND_UP_TO: Readonly<Record<string, number>> = Object.freeze({
  CAD: 1,
  EUR: 0.95
})

/** Rounds `cents` up to the next amount that ends at `value` (major units): `1` gives whole units, `0.95` an amount ending in .95, `100` a multiple of 100 units; an amount already at such a value stays. */
function roundUp (cents: number, value: number): number {
  const step = Math.round(value * 100)
  if (value >= 1) return Math.ceil(cents / step) * step
  const candidate = Math.floor(cents / 100) * 100 + step
  return candidate >= cents ? candidate : candidate + 100
}

/**
 * An amount in the shop currency's minor unit, in the view currency's minor unit: times the market's rate, then its price adjustment, then rounded up when the market rounds. The order and the final rounding follow https://help.shopify.com/en/manual/international/pricing/exchange-rates (the price is multiplied by the conversion rate "and then applying the rounding rules for that currency if applicable") and its manual-rate examples (`20.00 x 1.3 x 1.2 = 32.00 CAD`: the rate, then the 20% adjustment). `rounding` is `true` for the currency's value in `ROUND_UP_TO`, or the value itself when a number (https://help.shopify.com/en/manual/international/pricing/rounding). A currency at rate 1 with no adjustment is the shop's own, which is not converted, so its prices stay as the merchant set them (fixture `probe-product-default`: 90.00 USD stays 90.00); no fixture shows a rounding value on a market that does not convert, and the rounding page presents rounding as the cure for the "inconsistent price endings" an exchange conversion causes.
 */
export function convert (amount: number, currency: ViewCurrency): number {
  if (currency.rate === 1 && !currency.adjustment) return amount
  const raw = Math.round(amount * currency.rate * (1 + currency.adjustment / 100))
  const value = typeof currency.rounding === 'number'
    ? currency.rounding
    : currency.rounding && Object.prototype.hasOwnProperty.call(ROUND_UP_TO, currency.iso_code) ? ROUND_UP_TO[currency.iso_code] : undefined
  return value !== undefined && value > 0 ? roundUp(raw, value) : raw
}
