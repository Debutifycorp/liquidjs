import { cartJson, requestFromUrl, resolveView, shippingRates, storefrontSampleData as data } from '../../src/shopify'
import type { CartState, StoreData } from '../../src/shopify'
import { maskVolatile } from './expect-probe'
import { loadFixture } from './fixtures'

const HOODIE = 43695847538710
const SNEAKERS = 43696961355798
const BEANIE = 43696949592086

const cart = (lines: Array<[number, number]>, codes: string[] = []): CartState => ({ token: '<token>', lines: lines.map(([variantId, quantity]) => ({ variantId, quantity, properties: {}, sellingPlanId: null })), note: null, attributes: {}, discountCodes: codes })
const withZones = (zones: NonNullable<StoreData['shipping_zones']>): StoreData => ({ ...data, shipping_zones: zones })
/** A store whose only market is the United States, so that no market names the other countries. */
const inUsMarketOnly = (zones: NonNullable<StoreData['shipping_zones']>): StoreData => ({ ...data, markets: data.markets?.filter(market => market.handle === 'us'), shipping_zones: zones })
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

  // the other markets' recordings: a rate's `markup` is volatile (`VOLATILE`), the rest of the answer, key order included, is compared
  for (const name of ['ajax-shipping-rates-en-ca', 'ajax-shipping-rates-en-eu']) {
    describe(`fixture ${name}`, () => {
      const recorded = loadFixture(name)
      const rated = recorded.steps.filter(step => step.method === 'GET' && step.url.includes('/cart/shipping_rates.json'))
      it('records the rate steps', () => {
        expect(rated.length).toBeGreaterThanOrEqual(3)
      })
      rated.forEach((step, n) => {
        const query = new URL(step.url, 'https://x.invalid').searchParams
        const address = { country: query.get('shipping_address[country]') ?? undefined, province: query.get('shipping_address[province]') ?? undefined, zip: query.get('shipping_address[zip]') ?? undefined }
        it(`matches the answer for ${address.country} (rate step ${n + 1})`, () => {
          const view = resolveView(data, requestFromUrl(step.url, data).request)
          const answer = shippingRates(data, cart([[HOODIE, 1]]), address, view)
          expect(maskVolatile(answer)).toEqual(maskVolatile(step.body))
          expect(JSON.stringify(maskVolatile(answer))).toBe(JSON.stringify(maskVolatile(step.body)))
        })
      })
    })
  }
  it('prints markup as 0.00 in every currency, where Shopify prints its live exchange rate\'s difference', () => {
    const canada = shippingRates(data, cart([[HOODIE, 1]]), { country: 'Canada', province: 'ON', zip: 'K1A 0B1' }, resolveView(data, { market: 'ca', language: 'en', localePrefix: '/en-ca' })) as { shipping_rates: Array<{ markup: string }> }
    expect(canada.shipping_rates.map(rate => rate.markup)).toEqual(['0.00'])
    expect((loadFixture('ajax-shipping-rates-en-ca').steps[1].body as typeof canada).shipping_rates[0].markup).toBe('-0.17')
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
    it('reads the name of a country with a deprecated or special code of the same name as the real country', () => {
      // a store whose markets do not list these countries, so only `Intl.DisplayNames` can name them (`United Kingdom` is also `UK`, `France` `FX`, `Russia` `SU`, `Serbia` `YU` and `CS`, `Congo - Kinshasa` `ZR`)
      const store = inUsMarketOnly([
        { name: 'UK', countries: [{ code: 'GB' }], rates: [{ name: 'GB rate', price: 100 }] },
        { name: 'France', countries: [{ code: 'FR' }], rates: [{ name: 'FR rate', price: 200 }] },
        { name: 'Russia', countries: [{ code: 'RU' }], rates: [{ name: 'RU rate', price: 300 }] },
        { name: 'Serbia', countries: [{ code: 'RS' }], rates: [{ name: 'RS rate', price: 400 }] },
        { name: 'Congo', countries: [{ code: 'CD' }], rates: [{ name: 'CD rate', price: 500 }] },
        { name: 'Rest of world', countries: 'rest_of_world', rates: [{ name: 'World', price: 900 }] }
      ])
      const rated = (country: string) => summary(shippingRates(store, cart([[HOODIE, 1]]), { country, zip: '12345' }))
      expect(rated('United Kingdom')).toEqual(['GB rate 1.00'])
      expect(rated('France')).toEqual(['FR rate 2.00'])
      expect(rated('Russia')).toEqual(['RU rate 3.00'])
      expect(rated('Serbia')).toEqual(['RS rate 4.00'])
      expect(rated('Congo - Kinshasa')).toEqual(['CD rate 5.00'])
      for (const code of ['GB', 'FR', 'RU', 'RS', 'CD']) expect(rated(code)).toEqual(rated(code.toLowerCase()))
      expect(rated('GB')).toEqual(['GB rate 1.00'])
      expect(rated('Japan')).toEqual(['World 9.00'])
    })
    it('reads a two-letter code only when it is a country\'s, and UK as GB', () => {
      const store = inUsMarketOnly([
        { name: 'UK', countries: [{ code: 'GB' }], rates: [{ name: 'GB rate', price: 100 }] },
        { name: 'Rest of world', countries: 'rest_of_world', rates: [{ name: 'World', price: 900 }] }
      ])
      const answer = (country: string) => shippingRates(store, cart([[HOODIE, 1]]), { country, zip: '12345' })
      expect(summary(answer('UK'))).toEqual(['GB rate 1.00'])
      expect(summary(answer('uk'))).toEqual(['GB rate 1.00'])
      expect(summary(answer('JP'))).toEqual(['World 9.00'])
      // XX, ZZ, EU, ZR and SU are no country
      for (const code of ['XX', 'ZZ', 'EU', 'ZR', 'SU', 'AN']) expect(answer(code)).toEqual({ country: ['Country/region not supported'] })
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
      // the zone that lists a province wins for it, whatever order the zones are in
      const reversed = withZones([zones.shipping_zones![1], zones.shipping_zones![0], zones.shipping_zones![2]])
      expect(summary(shippingRates(reversed, cart([[HOODIE, 1]]), { country: 'United States', province: 'OR', zip: '97201' }))).toEqual(['Coast 3.00'])
      expect(summary(shippingRates(reversed, cart([[HOODIE, 1]]), { country: 'United States', province: 'NY', zip: '10001' }))).toEqual(['Inland 9.00'])
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
    it('holds the dataset\'s own bounds: 9999 against 10000 in the United States, 2000 g against 2001 g elsewhere, and FREESHIP at 10000', () => {
      // the hoodie's price and weight varied in a copy of the data
      const tweak = (price: number, weight: number): StoreData => ({ ...data, products: data.products?.map(product => ({ ...product, variants: product.variants.map(variant => variant.id === HOODIE ? { ...variant, price, weight } : variant) })) })
      const us = { country: 'United States', province: 'CA', zip: '90210' }
      expect(summary(shippingRates(tweak(9999, 600), cart([[HOODIE, 1]]), us))).toEqual(['Standard 5.00', 'Express 15.00'])
      expect(summary(shippingRates(tweak(10000, 600), cart([[HOODIE, 1]]), us))).toEqual(['Free standard 0.00', 'Express 15.00'])
      expect(summary(shippingRates(tweak(10001, 600), cart([[HOODIE, 1]]), us))).toEqual(['Free standard 0.00', 'Express 15.00'])
      expect(summary(shippingRates(tweak(9999, 600), cart([[HOODIE, 1]], ['FREESHIP']), us))).toEqual(['Standard 5.00', 'Express 15.00'])
      expect(summary(shippingRates(tweak(10000, 600), cart([[HOODIE, 1]], ['FREESHIP']), us))).toEqual(['Free standard 0.00', 'Express 0.00'])
      expect(summary(shippingRates(tweak(9000, 1999), cart([[HOODIE, 1]]), world))).toEqual(['International 20.00'])
      expect(summary(shippingRates(tweak(9000, 2000), cart([[HOODIE, 1]]), world))).toEqual(['International 20.00'])
      expect(summary(shippingRates(tweak(9000, 2001), cart([[HOODIE, 1]]), world))).toEqual(['International heavy 40.00'])
      expect(summary(shippingRates(tweak(9000, 2002), cart([[HOODIE, 1]]), world))).toEqual(['International heavy 40.00'])
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

  describe('free shipping and the view\'s currency (final review B, I3)', () => {
    // the help centre: "If you set a minimum purchase amount for a free shipping discount, then that amount is in your store's default currency", which "is converted into the shopper's currency", who "needs to reach the equivalent of $75.00 USD in their local currency" (https://help.shopify.com/en/manual/markets/discounts-and-gift-cards): the minimum is compared with the cart in the currency the shopper sees, in the cart and in the estimate alike
    const beanieAt = (price: number): StoreData => ({
      ...data,
      discounts: data.discounts?.filter(discount => discount.code === 'FREESHIP'),
      products: data.products?.map(product => ({ ...product, variants: product.variants.map(variant => variant.id === BEANIE ? { ...variant, price } : variant) }))
    })
    const state = cart([[BEANIE, 1]], ['FREESHIP'])
    const canada = { country: 'Canada', zip: 'K1A 0B1' }
    const france = { country: 'France', zip: '75001' }
    it('makes the rates free when the cart meets the converted minimum, as the cart says: 99.90 USD is 135.00 CAD, the minimum of 100.00 USD', () => {
      const store = beanieAt(9990)
      const view = resolveView(store, { market: 'ca' })
      const answer = cartJson(store, state, view) as any
      expect([answer.items_subtotal_price, answer.discount_codes]).toEqual([13500, [{ code: 'FREESHIP', applicable: true }]])
      expect(summary(shippingRates(store, state, canada, view))).toEqual(['Standard 0.00'])
      // the United States view has the cart at 99.90, under the minimum, in the cart and in the estimate
      expect((cartJson(store, state) as any).discount_codes).toEqual([{ code: 'FREESHIP', applicable: false }])
      expect(summary(shippingRates(store, state, { country: 'United States', province: 'CA', zip: '90210' }))).toEqual(['Standard 5.00', 'Express 15.00'])
    })
    it('leaves the rates alone when the cart is under the converted minimum, as the cart says', () => {
      const store = beanieAt(9900)
      const view = resolveView(store, { market: 'ca' })
      expect((cartJson(store, state, view) as any).discount_codes).toEqual([{ code: 'FREESHIP', applicable: false }])
      expect(summary(shippingRates(store, state, canada, view))).toEqual(['Standard 14.00'])
    })
    it('agrees with the cart at every price around the minimum, in the Canadian and the European view', () => {
      for (let price = 9900; price <= 10100; price += 5) {
        const store = beanieAt(price)
        for (const [market, address] of [['ca', canada], ['eu', france]] as const) {
          const view = resolveView(store, { market })
          const applicable = (cartJson(store, state, view) as any).discount_codes[0].applicable
          const free = summary(shippingRates(store, state, address, view)).every(rate => rate.endsWith(' 0.00'))
          expect({ price, market, free }).toEqual({ price, market, free: applicable })
        }
      }
    })
    it('compares the discount\'s price limit with the rates in the shop\'s currency, so that 10.00 USD stays free under a limit of 10.00 USD in the Canadian view', () => {
      const limited = { ...data, discounts: [{ id: 9, type: 'free_shipping' as const, title: 'Cheap shipping free', max_shipping_price: 1000 }] }
      const view = resolveView(limited, { market: 'ca' })
      expect(summary(shippingRates(limited, cart([[HOODIE, 1]]), canada, view))).toEqual(['Standard 0.00'])
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
