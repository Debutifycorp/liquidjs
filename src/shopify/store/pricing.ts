import type { ViewCurrency } from './markets'
import type { SellingPlanPriceAdjustmentData } from './types'

/**
 * Shopify's "Round up to the nearest {value}" per currency, in major units. https://help.shopify.com/en/manual/international/pricing/rounding names the setting and says "prices are automatically rounded to the most common denominator for each currency" and "You can't customize your rounding rules to anything different from these defaults", but lists no values, so these are the ones the parity store applies, as it renders them: the Canadian dollar rounds up to whole units (fixture `probe-product-en-ca`: the hoodie's 90.00 USD, 121.50 CAD at 1.35, is 122.00, and its compare-at 110.00 USD, 148.50 CAD, is 149.00) and the euro up to an amount ending in .95, whatever the amount (fixtures `probe-product-en-eu`, `probe-product-en-eu-workout-shirt`, `probe-product-en-eu-leggings`, `probe-product-en-eu-hoodie` and `probe-collection-en-eu-price`: 10.00 USD, 9.20 EUR at 0.92, is 9.95; 20.00 USD, 18.40 EUR, is 18.95; 25.00 USD, 23.00 EUR, is 23.95; 40.00, 50.00, 90.00 and 100.00 USD, 36.80, 46.00, 82.80 and 92.00 EUR, are 36.95, 46.95, 82.95 and 92.95). The docs' euro example is not what the parity store does: https://help.shopify.com/en/manual/international/pricing/exchange-rates rounds 8.81 EUR up to 8.85, a step of .05, while the store rounds 9.20 EUR up to 9.95, so the fixtures win. A currency not listed here rounds only when its market data gives a number (`MarketData.currency.rounding`).
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
 * An amount in the shop currency's minor unit, in the view currency's minor unit: times the market's rate, then its price adjustment, then rounded up when the market rounds. The order and the final rounding follow https://help.shopify.com/en/manual/international/pricing/exchange-rates (the price is multiplied by the conversion rate "and then applying the rounding rules for that currency if applicable") and its manual-rate examples (`20.00 x 1.3 x 1.2 = 32.00 CAD`: the rate, then the 20% adjustment). `rounding` is `true` for the currency's value in `ROUND_UP_TO`, or the value itself when a number (https://help.shopify.com/en/manual/international/pricing/rounding). The shop's own currency (`own`) has no rate, so a market in it with no price adjustment keeps the prices the merchant set (fixture `probe-product-default`: 90.00 USD stays 90.00), and with one gets the adjustment (the exchange-rates page's "20.00 x 1 x 1.5 = 30.00 CAD" example) and then the rounding; no fixture shows a rounding value on a market that does not convert, and the rounding page presents rounding as the cure for the "inconsistent price endings" an exchange conversion causes. A zero amount is not rounded: no fixture shows a zero price and the rounding page is silent, but a free product turning into a charge is the unlikelier reading.
 */
export function convert (amount: number, currency: ViewCurrency): number {
  if (amount <= 0 || (currency.own && !currency.adjustment)) return amount
  const raw = Math.round(amount * (currency.own ? 1 : currency.rate) * (1 + currency.adjustment / 100))
  const value = typeof currency.rounding === 'number'
    ? currency.rounding
    : currency.rounding && Object.prototype.hasOwnProperty.call(ROUND_UP_TO, currency.iso_code) ? ROUND_UP_TO[currency.iso_code] : undefined
  return value !== undefined && value > 0 ? roundUp(raw, value) : raw
}

/**
 * A fixed amount of a selling plan price adjustment in the view's currency: converted at the market's rate and price adjustment like any amount, but not rounded up to the market's rounding value. The parity store prints the $2.00 off plan as 1.84 EUR in the Europe market (200 x 0.92 = 184), where rounding up would give 1.95 (fixture `probe-product-en-eu`: the plan's `price_adjustments[].value` is 184 and the allocation prices 2156 and 2211 follow from 2395 and 184). The amount is the data's, in the shop currency's minor unit, when no currency is given.
 */
export function planAmount (value: number, currency?: ViewCurrency): number {
  return currency ? convert(value, { ...currency, rounding: false }) : value
}

/**
 * A variant price under one selling plan price adjustment, https://shopify.dev/docs/api/liquid/objects/selling_plan_price_adjustment: a percentage off, a fixed amount off (never below zero) or a fixed price, each in the minor unit. A fixed amount or price is in the shop's currency and converted by `planAmount`; the result is rounded to the minor unit, half up, as the parity store prints it (fixtures `probe-product-plans`: 2500 less 10% is 2250, and `probe-product-en-eu`: 2395 less 10% is 2155.5, printed 2156).
 */
export function planPrice (price: number, adjustment: SellingPlanPriceAdjustmentData, currency?: ViewCurrency): number {
  if (adjustment.value_type === 'percentage') return Math.max(0, Math.round(price * (100 - adjustment.value) / 100))
  if (adjustment.value_type === 'fixed_amount') return Math.max(0, price - planAmount(adjustment.value, currency))
  return planAmount(adjustment.value, currency)
}
