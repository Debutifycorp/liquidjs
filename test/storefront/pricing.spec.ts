import { storefrontSampleData } from '../../src/shopify'
import { buildStore } from '../../src/shopify/store/build'
import { convert, ROUND_UP_TO } from '../../src/shopify/store/pricing'
import { probeMatches } from './expect-probe'

const cad = { iso_code: 'CAD', symbol: '$', name: 'CAD', rate: 1.35, rounding: true, adjustment: 0, own: false, hide_compare_at_prices: false, money_format: '${{amount}}', money_with_currency_format: '${{amount}} CAD' } // eslint-disable-line no-template-curly-in-string

describe('convert', () => {
  it('multiplies by the rate and the adjustment, then rounds up to the currency\'s value', () => {
    expect(convert(9000, { ...cad, rounding: false })).toBe(12150)
    expect(convert(9000, { ...cad, rounding: false, adjustment: 10 })).toBe(13365)
    expect(convert(9000, { ...cad, rounding: 1 })).toBe(12200)
    expect(convert(9000, { ...cad, rounding: 0.95 })).toBe(12195)
    // 36.27 USD is 48.96 CAD, already past .95, so it rounds up to the next unit's .95
    expect(convert(3627, { ...cad, rounding: 0.95 })).toBe(4995)
    expect(convert(9000, { ...cad, rate: 1, iso_code: 'USD', rounding: false })).toBe(9000)
  })
  it('leaves an amount already at the rounding value, and rounds only the currencies it knows a value for', () => {
    expect(convert(10000, { ...cad, rate: 0.92, iso_code: 'EUR', rounding: 0.95 })).toBe(9295)
    expect(convert(2000, { ...cad, rate: 2.4975, rounding: 0.95 })).toBe(4995)
    // the shop's own currency is not converted, so not rounded; a foreign currency at rate 1 is converted (by 1) and rounded
    expect(convert(5100, { ...cad, rate: 1, own: true, rounding: 0.95 })).toBe(5100)
    expect(convert(5100, { ...cad, rate: 1, rounding: 0.95 })).toBe(5195)
    // a market in the shop's currency with a price adjustment gets the adjustment, then the rounding
    expect(convert(5000, { ...cad, rate: 1, own: true, adjustment: 10, rounding: false })).toBe(5500)
    expect(convert(5000, { ...cad, rate: 1, own: true, adjustment: 10, rounding: 0.95 })).toBe(5595)
    expect(convert(5000, { ...cad, rate: 1.1, iso_code: 'EUR', rounding: true })).toBe(5595)
    expect(convert(9000, { ...cad, iso_code: 'JPY', rounding: true })).toBe(12150)
    expect(convert(9000, { ...cad, iso_code: 'constructor', rounding: true })).toBe(12150)
  })
  it('does not round a zero amount', () => {
    expect(convert(0, { ...cad, iso_code: 'EUR', rounding: true })).toBe(0)
    expect(convert(0, { ...cad, rounding: 0.95 })).toBe(0)
  })
  it('knows the rounding value of every currency the parity store uses', () => {
    expect(Object.keys(ROUND_UP_TO).sort()).toEqual(expect.arrayContaining(['CAD', 'EUR']))
  })
})

describe('product prices per market', () => {
  const pick = (b: any) => ({ price: b.price, price_min: b.price_min, price_max: b.price_max, compare_at_price: b.compare_at_price, money: b.money, money_with_currency: b.money_with_currency, variants: b.variants.map((v: any) => [v.id, v.price, v.compare_at_price]) })
  for (const name of ['probe-product-default', 'probe-product-en-ca', 'probe-product-fr-ca', 'probe-product-en-eu', 'probe-product-fr-eu', 'probe-product-en-eu-hoodie', 'probe-product-en-eu-workout-shirt', 'probe-product-en-eu-leggings']) {
    it(`matches ${name}`, async () => {
      const { actual, expected } = await probeMatches(name, pick)
      expect(actual).toEqual(expected)
    })
  }
})

describe('compare-at prices per market', () => {
  // Green / Small: the hoodie's one variant on sale
  const onSale = (market: string, language = 'en') => {
    const product = buildStore(storefrontSampleData, { market, language, prefix: market === 'us' ? '' : `/${language}-${market}` }).products.liquidMethodMissing('hoodie') as any
    return { variant: product.variants.find((v: any) => v.id === 43695847538710), product }
  }
  it('converts it where the market shows it and drops it where the market hides it', () => {
    expect(onSale('us').variant.compare_at_price).toBe(11000)
    expect(onSale('ca').variant.compare_at_price).toBe(14900)
    const eu = onSale('eu')
    expect(eu.variant.compare_at_price).toBeNull()
    expect(eu.variant.price).toBe(8295)
    expect([eu.product.compare_at_price, eu.product.compare_at_price_min, eu.product.compare_at_price_max]).toEqual([null, 0, 0])
  })
  it('shows it in a market that does not hide it', () => {
    const shown = { ...storefrontSampleData, markets: storefrontSampleData.markets?.map(m => m.handle === 'eu' ? { ...m, hide_compare_at_prices: false } : m) }
    const product = buildStore(shown, { market: 'eu', language: 'en', prefix: '/en-eu' }).products.liquidMethodMissing('hoodie') as any
    expect(product.variants.find((v: any) => v.id === 43695847538710).compare_at_price).toBe(10195)
  })
})
