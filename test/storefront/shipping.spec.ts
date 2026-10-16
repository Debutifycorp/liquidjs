import { resolveView, shippingRates, storefrontSampleData as data } from '../../src/shopify'
import type { CartState, StoreData } from '../../src/shopify'
import { loadFixture } from './fixtures'

const HOODIE = 43695847538710
const SNEAKERS = 43696961355798

const cart = (lines: Array<[number, number]>, codes: string[] = []): CartState => ({ token: '<token>', lines: lines.map(([variantId, quantity]) => ({ variantId, quantity, properties: {}, sellingPlanId: null })), note: null, attributes: {}, discountCodes: codes })
const withZones = (zones: NonNullable<StoreData['shipping_zones']>): StoreData => ({ ...data, shipping_zones: zones })
/** The rates' names and prices, to read a case at a glance. */
const summary = (answer: unknown) => ((answer as { shipping_rates: Array<{ name: string, price: string }> }).shipping_rates).map(rate => `${rate.name} ${rate.price}`)

describe('shipping rates', () => {
  const fixture = loadFixture('ajax-shipping-rates')
  const countries: Array<[number, string, string, string]> = [[2, 'United States', 'CA', '90210'], [4, 'Canada', 'ON', 'K1A 0B1'], [6, 'France', '', '75001']]
  for (const [at, country, province, zip] of countries) {
    it(`matches ${country}`, () => {
      expect(shippingRates(data, cart([[HOODIE, 1]]), { country, province, zip })).toEqual(fixture.steps[at].body)
    })
  }
  it('uses the weight-based world rate for a heavy cart, and answers an unknown country with an error', () => {
    expect(shippingRates(data, cart([[HOODIE, 1], [SNEAKERS, 1]]), { country: 'France', zip: '75001' })).toEqual(fixture.steps[8].body)
    expect(shippingRates(data, cart([[HOODIE, 1], [SNEAKERS, 1]]), { country: 'Atlantis' })).toEqual(fixture.steps[9].body)
  })
  it('prints the rates and the error in the key order of the recordings', () => {
    const rates = shippingRates(data, cart([[HOODIE, 1]]), { country: 'United States', province: 'CA', zip: '90210' })
    expect(JSON.stringify(rates)).toBe(JSON.stringify(fixture.steps[2].body))
    expect(JSON.stringify(shippingRates(data, cart([[HOODIE, 1]]), { country: 'Atlantis' }))).toBe(JSON.stringify(fixture.steps[9].body))
  })

  describe('the address', () => {
    it('reads a country by its code in any case, or by name in any case', () => {
      const expected = summary(shippingRates(data, cart([[HOODIE, 1]]), { country: 'Canada' }))
      expect(expected).toEqual(['Standard 10.00'])
      for (const country of ['CA', 'ca', 'canada', ' Canada ']) expect(summary(shippingRates(data, cart([[HOODIE, 1]]), { country }))).toEqual(expected)
    })
    it('gives a country no zone names the zone of the rest of the world, by its name or its code', () => {
      expect(summary(shippingRates(data, cart([[HOODIE, 1]]), { country: 'Japan', zip: '100-0001' }))).toEqual(['International 20.00'])
      expect(summary(shippingRates(data, cart([[HOODIE, 1]]), { country: 'JP', zip: '100-0001' }))).toEqual(['International 20.00'])
    })
    it('answers a missing country like an unknown one', () => {
      expect(shippingRates(data, cart([[HOODIE, 1]]), {})).toEqual({ country: ['Country/region not supported'], zip: ['Enter a postal code'] })
      expect(shippingRates(data, cart([[HOODIE, 1]]), { country: '', zip: '75001' })).toEqual({ country: ['Country/region not supported'] })
    })
    it('names the postal code in the error only when none was given', () => {
      expect(shippingRates(data, cart([[HOODIE, 1]]), { country: 'Atlantis', zip: '12345' })).toEqual({ country: ['Country/region not supported'] })
      expect(shippingRates(data, cart([[HOODIE, 1]]), { country: 'Atlantis', zip: '  ' })).toEqual({ country: ['Country/region not supported'], zip: ['Enter a postal code'] })
    })
    it('answers a country no zone covers with the error when the store has no zone for the rest of the world', () => {
      const only = withZones([{ name: 'Canada', countries: [{ code: 'CA' }], rates: [{ name: 'Standard', price: 1000 }] }])
      expect(shippingRates(only, cart([[HOODIE, 1]]), { country: 'France', zip: '75001' })).toEqual({ country: ['Country/region not supported'] })
      expect(shippingRates(only, cart([[HOODIE, 1]]), { country: 'Canada', zip: 'K1A 0B1' })).toHaveProperty('shipping_rates')
    })
    it('puts a province of a zone that lists provinces in that zone, and any other province in the next', () => {
      const zones = withZones([
        { name: 'West coast', countries: [{ code: 'US', provinces: ['CA', 'OR', 'WA'] }], rates: [{ name: 'Coast', price: 300 }] },
        { name: 'Rest of US', countries: [{ code: 'US' }], rates: [{ name: 'Inland', price: 900 }] },
        { name: 'Rest of world', countries: 'rest_of_world', rates: [{ name: 'International', price: 2000 }] }
      ])
      expect(summary(shippingRates(zones, cart([[HOODIE, 1]]), { country: 'United States', province: 'ca', zip: '90210' }))).toEqual(['Coast 3.00'])
      expect(summary(shippingRates(zones, cart([[HOODIE, 1]]), { country: 'United States', province: 'NY', zip: '10001' }))).toEqual(['Inland 9.00'])
      expect(summary(shippingRates(zones, cart([[HOODIE, 1]]), { country: 'United States', zip: '10001' }))).toEqual(['Inland 9.00'])
      const strict = withZones([{ name: 'West coast', countries: [{ code: 'US', provinces: ['CA'] }], rates: [{ name: 'Coast', price: 300 }] }, { name: 'Rest of world', countries: 'rest_of_world', rates: [{ name: 'International', price: 2000 }] }])
      expect(summary(shippingRates(strict, cart([[HOODIE, 1]]), { country: 'United States', province: 'NY', zip: '10001' }))).toEqual(['International 20.00'])
    })
  })

  describe('the ranges', () => {
    const subtotalZones = (...rates: Array<{ name: string, price: number, min_subtotal?: number, max_subtotal?: number, min_weight?: number, max_weight?: number }>) => withZones([{ name: 'Rest of world', countries: 'rest_of_world', rates }])
    const world = { country: 'France', zip: '75001' }

    it('holds a subtotal range inclusive at both ends', () => {
      // one hoodie is 9000
      const store = subtotalZones({ name: 'Up to', price: 100, max_subtotal: 9000 }, { name: 'From', price: 200, min_subtotal: 9000 }, { name: 'Below', price: 300, max_subtotal: 8999 }, { name: 'Above', price: 400, min_subtotal: 9001 })
      expect(summary(shippingRates(store, cart([[HOODIE, 1]]), world))).toEqual(['Up to 1.00', 'From 2.00'])
    })
    it('holds a weight range inclusive at both ends, in grams', () => {
      // a hoodie weighs 600 g
      const store = subtotalZones({ name: 'Light', price: 100, max_weight: 1200 }, { name: 'Heavy', price: 200, min_weight: 1200 }, { name: 'Heavier', price: 300, min_weight: 1201 })
      expect(summary(shippingRates(store, cart([[HOODIE, 2]]), world))).toEqual(['Light 1.00', 'Heavy 2.00'])
      expect(summary(shippingRates(store, cart([[HOODIE, 3]]), world))).toEqual(['Heavy 2.00', 'Heavier 3.00'])
    })
    it('needs a rate to be inside every range it gives', () => {
      const store = subtotalZones({ name: 'Both', price: 100, min_subtotal: 9000, max_weight: 600 })
      expect(summary(shippingRates(store, cart([[HOODIE, 1]]), world))).toEqual(['Both 1.00'])
      expect(summary(shippingRates(store, cart([[HOODIE, 2]]), world))).toEqual([])
    })
    it('answers a cart no rate of the zone suits with no rates', () => {
      const store = subtotalZones({ name: 'Small orders', price: 100, max_subtotal: 100 })
      expect(shippingRates(store, cart([[HOODIE, 1]]), world)).toEqual({ shipping_rates: [] })
    })
    it('answers an empty cart with no rates', () => {
      expect(shippingRates(data, cart([]), { country: 'United States', province: 'CA', zip: '90210' })).toEqual({ shipping_rates: [] })
    })
    it('compares the subtotal after the discounts, product and order discounts both', () => {
      // two hoodies are 18000; WELCOME10 takes 10% off the order
      const store = subtotalZones({ name: 'Big order', price: 100, min_subtotal: 17000 })
      expect(summary(shippingRates(store, cart([[HOODIE, 2]]), world))).toEqual(['Big order 1.00'])
      expect(summary(shippingRates(store, cart([[HOODIE, 2]], ['WELCOME10']), world))).toEqual([])
      const sale = { ...store, discounts: [{ id: 1, type: 'amount_off_products' as const, title: 'Hoodie sale', value: { percentage: 20 }, items: { products: ['hoodie'] } }] }
      expect(summary(shippingRates(sale, cart([[HOODIE, 2]]), world))).toEqual([])
    })
    it('counts only the lines that need shipping', () => {
      const download = { ...data, products: data.products?.map(product => product.handle === 'hoodie' ? { ...product, variants: product.variants.map(variant => ({ ...variant, requires_shipping: false })) } : product) }
      const store = { ...download, shipping_zones: [{ name: 'Rest of world', countries: 'rest_of_world' as const, rates: [{ name: 'Light', price: 100, max_weight: 100 }, { name: 'Everything', price: 200 }] }] }
      expect(summary(shippingRates(store, cart([[HOODIE, 1]]), world))).toEqual([])
      expect(summary(shippingRates(store, cart([[HOODIE, 1], [SNEAKERS, 1]]), world))).toEqual(['Everything 2.00'])
      const bySubtotal = { ...store, shipping_zones: [{ name: 'Rest of world', countries: 'rest_of_world' as const, rates: [{ name: 'Small', price: 100, max_subtotal: 100000 }, { name: 'Large', price: 200, min_subtotal: 100001 }] }] }
      expect(summary(shippingRates(bySubtotal, cart([[HOODIE, 1], [SNEAKERS, 1]]), world))).toEqual(['Small 1.00'])
    })
    it('takes the dataset\'s United States zone across its subtotal', () => {
      const us = { country: 'United States', province: 'CA', zip: '90210' }
      expect(summary(shippingRates(data, cart([[HOODIE, 1]]), us))).toEqual(['Standard 5.00', 'Express 15.00'])
      expect(summary(shippingRates(data, cart([[HOODIE, 2]]), us))).toEqual(['Free standard 0.00', 'Express 15.00'])
    })
  })

  describe('free shipping', () => {
    const us = { country: 'United States', province: 'CA', zip: '90210' }
    it('makes every rate free once FREESHIP is entered and the cart holds 10000', () => {
      expect(summary(shippingRates(data, cart([[HOODIE, 2]], ['FREESHIP']), us))).toEqual(['Free standard 0.00', 'Express 0.00'])
      expect(summary(shippingRates(data, cart([[HOODIE, 2]], ['freeship']), { country: 'Canada', zip: 'K1A 0B1' }))).toEqual(['Standard 0.00'])
    })
    it('leaves the rates alone under the code\'s minimum, or when another discount wins the code\'s place', () => {
      expect(summary(shippingRates(data, cart([[HOODIE, 1]], ['FREESHIP']), us))).toEqual(['Standard 5.00', 'Express 15.00'])
      // WELCOME10 does not combine with FREESHIP and saves more
      expect(summary(shippingRates(data, cart([[HOODIE, 2]], ['FREESHIP', 'WELCOME10']), us))).toEqual(['Free standard 0.00', 'Express 15.00'])
    })
    it('frees only the rates up to the discount\'s limit, in the shop\'s currency', () => {
      const limited = { ...data, discounts: [{ id: 9, type: 'free_shipping' as const, title: 'Cheap shipping free', max_shipping_price: 1000 }] }
      expect(summary(shippingRates(limited, cart([[HOODIE, 1]]), us))).toEqual(['Standard 0.00', 'Express 15.00'])
      const exact = { ...data, discounts: [{ id: 9, type: 'free_shipping' as const, title: 'Cheap shipping free', max_shipping_price: 500 }] }
      expect(summary(shippingRates(exact, cart([[HOODIE, 1]]), us))).toEqual(['Standard 0.00', 'Express 15.00'])
      const under = { ...data, discounts: [{ id: 9, type: 'free_shipping' as const, title: 'Cheap shipping free', max_shipping_price: 499 }] }
      expect(summary(shippingRates(under, cart([[HOODIE, 1]]), us))).toEqual(['Standard 5.00', 'Express 15.00'])
    })
    it('frees the rates of the countries the discount names', () => {
      const canada = { ...data, discounts: [{ id: 9, type: 'free_shipping' as const, title: 'Canada ships free', countries: ['CA'] }] }
      expect(summary(shippingRates(canada, cart([[HOODIE, 1]]), us))).toEqual(['Standard 5.00', 'Express 15.00'])
      expect(summary(shippingRates(canada, cart([[HOODIE, 1]]), { country: 'Canada', zip: 'K1A 0B1' }))).toEqual(['Standard 0.00'])
      expect(summary(shippingRates(canada, cart([[HOODIE, 1]]), { country: 'CA', zip: 'K1A 0B1' }))).toEqual(['Standard 0.00'])
    })
  })

  describe('the view\'s currency', () => {
    it('prints the currency of the market and converts the rates like prices, rounding up where the market does', () => {
      // 10.00 USD is 13.50 CAD, 14.00 rounded up to whole units
      const canada = shippingRates(data, cart([[HOODIE, 1]]), { country: 'Canada', zip: 'K1A 0B1' }, resolveView(data, { market: 'ca' }))
      expect(canada).toMatchObject({ shipping_rates: [{ name: 'Standard', price: '14.00', currency: 'CAD' }] })
      // 20.00 USD is 18.40 EUR, 18.95 rounded up to .95
      const europe = shippingRates(data, cart([[HOODIE, 1]]), { country: 'France', zip: '75001' }, resolveView(data, { market: 'eu' }))
      expect(europe).toMatchObject({ shipping_rates: [{ name: 'International', price: '18.95', currency: 'EUR' }] })
    })
    it('leaves a free rate free', () => {
      const answer = shippingRates(data, cart([[HOODIE, 2]], ['FREESHIP']), { country: 'Canada', zip: 'K1A 0B1' }, resolveView(data, { market: 'ca' }))
      expect(summary(answer)).toEqual(['Standard 0.00'])
    })
    it('sets the ranges in the shop\'s currency, whatever the view\'s', () => {
      // one hoodie is 90.00 USD but 122.00 CAD, so a range up to 9000 holds in both
      const store = withZones([{ name: 'United States', countries: [{ code: 'US' }], rates: [{ name: 'Up to 90', price: 500, max_subtotal: 9000 }, { name: 'Over 90', price: 900, min_subtotal: 9001 }] }])
      const us = { country: 'United States', province: 'CA', zip: '90210' }
      expect(summary(shippingRates(store, cart([[HOODIE, 1]]), us))).toEqual(['Up to 90 5.00'])
      expect(summary(shippingRates(store, cart([[HOODIE, 1]]), us, resolveView(store, { market: 'ca' })))).toEqual(['Up to 90 7.00'])
    })
    it('keeps the view\'s default when none is given', () => {
      const answer = shippingRates(data, cart([[HOODIE, 1]]), { country: 'Canada', zip: 'K1A 0B1' }) as { shipping_rates: Array<{ currency: string }> }
      expect(answer.shipping_rates[0].currency).toBe('USD')
    })
  })

  it('leaves the cart state alone', () => {
    const state = cart([[HOODIE, 2]], ['FREESHIP'])
    const before = JSON.stringify(state)
    shippingRates(data, state, { country: 'United States', province: 'CA', zip: '90210' })
    expect(JSON.stringify(state)).toBe(before)
  })
})
