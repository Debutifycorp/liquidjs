import { cartJson, discountCodeStatus, renderPage, storefrontSampleData as data } from '../../src/shopify'
import type { CartState, StoreData } from '../../src/shopify'
import { buildStore } from '../../src/shopify/store/build'
import { buildCartObject } from '../../src/shopify/store/cart'
import { applyDiscounts } from '../../src/shopify/store/discounts'
import { loadFixture } from './fixtures'
import { probeTheme, renderProbe } from './probe'

const BEANIE = 43696949592086
const SNEAKERS = 43696963485718
const SUNNIES = 43696940613654
const TSHIRT = 43696932126742
const SLIDES = 43695710371862
const HOODIE = 43695847538710

const line = (variantId: number, quantity: number, sellingPlanId: number | null = null) => ({ variantId, quantity, properties: {}, sellingPlanId })
const state = (lines: CartState['lines'], codes: string[] = [], extra: Partial<CartState> = {}): CartState => ({ token: '<token>', lines, note: '', attributes: {}, discountCodes: codes, ...extra })
// the scenario adds the T-shirts, the sneakers, the sunnies and the beanie in one call, and `cart.js` lists them newest first (steps 0 and 8)
const scenario = [line(BEANIE, 1), line(SUNNIES, 1), line(SNEAKERS, 1), line(TSHIRT, 2)]
const cart = (codes: string[], extra: Partial<CartState> = {}) => state(scenario, codes, extra)
// line-key hashes, and the UUID `key` and ISO `created_at` of a discount application, differ on every run
const keys = (v: unknown) => JSON.parse(JSON.stringify(v).replace(/(\d+):[0-9a-f]{32}/g, '$1:<hash>').replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<uuid>').replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, '<date>'))
/** The answer of an update, add or change without the changelog the storefront adds. */
const withoutChangelog = (body: unknown) => { const rest = { ...(body as Record<string, unknown>) }; delete rest.items_changelog; return rest }
/** The built cart object, to read its discount lists and line allocations. */
const built = (cartState: CartState, source: StoreData = data) => buildCartObject(buildStore(source), cartState) as any
const withDiscounts = (...discounts: NonNullable<StoreData['discounts']>): StoreData => ({ ...data, discounts })

describe('discounts', () => {
  const fixture = loadFixture('ajax-discount-codes')
  // the probe steps after WELCOME10, SHOES5, BUNDLE and '' (the scenario's steps 3, 5, 7 and 13, counted from 1)
  const probes: Array<[number, string[]]> = [[2, ['WELCOME10']], [4, ['SHOES5']], [6, ['BUNDLE']], [12, []]]
  for (const [at, codes] of probes) {
    it(`matches the cart probe with ${codes.join(',') || 'no code'}, its ajax included`, async () => {
      const body = await renderProbe('cart.probe', { cart: cart(codes) }) as any
      expect(keys(body)).toEqual(keys(fixture.steps[at].body))
      // the key order of the cart, a line and a discount application of `{{ cart | json }}` is the recorded one
      const recorded = (fixture.steps[at].body as any).ajax
      expect(Object.keys(body.ajax)).toEqual(Object.keys(recorded))
      for (const [i, item] of body.ajax.items.entries()) expect(Object.keys(item)).toEqual(Object.keys(recorded.items[i]))
      for (const [i, application] of body.ajax.cart_level_discount_applications.entries()) expect(Object.keys(application)).toEqual(Object.keys(recorded.cart_level_discount_applications[i]))
    })
  }
  it('answers cart.js with two codes and with an unknown code', () => {
    expect(keys(cartJson(data, cart(['FREESHIP', 'WELCOME10'])))).toEqual(keys(fixture.steps[8].body))
    expect(keys(cartJson(data, cart(['NOPE'])))).toEqual(keys(fixture.steps[10].body))
  })
  it('answers cart.js after /discount/WELCOME10, and after clear.js, which keeps the codes', () => {
    expect(keys(cartJson(data, cart(['WELCOME10'])))).toEqual(keys(fixture.steps[13].body))
    expect(keys(cartJson(data, state([], ['WELCOME10'])))).toEqual(keys(fixture.steps[14].body))
  })
  it('answers update.js in the form of the change answers: applications wrapped in their amount, the type automatic', () => {
    for (const [codes, at] of [[['WELCOME10'], 1], [['FREESHIP', 'WELCOME10'], 7], [['NOPE'], 9], [[], 11]] as Array<[string[], number]>) {
      const answer = cartJson(data, cart(codes), undefined, 'change') as any
      const recorded = withoutChangelog(fixture.steps[at].body) as any
      expect(keys(answer)).toEqual(keys(recorded))
      expect(Object.keys(answer)).toEqual(Object.keys(recorded))
      for (const [i, item] of answer.items.entries()) expect(Object.keys(item)).toEqual(Object.keys(recorded.items[i]))
      for (const [i, allocation] of answer.cart_level_discount_applications.entries()) expect(Object.keys(allocation.discount_application)).toEqual(Object.keys(recorded.cart_level_discount_applications[i].discount_application))
    }
  })
  it('prints the beanie line as add.js does, with the application sorted by name', () => {
    const recorded = (fixture.steps[0].body as any).items[3]
    const item = (cartJson(data, cart([]), undefined, 'change') as any).items[0]
    expect(keys(item)).toEqual(keys(recorded))
    expect(Object.keys(item.line_level_discount_allocations[0].discount_application)).toEqual(Object.keys(recorded.line_level_discount_allocations[0].discount_application))
  })

  describe('automatic Buy X Get Y', () => {
    const auto = loadFixture('ajax-discount-automatic-bxgy')
    const slides = state([line(SLIDES, 2)])
    it('splits the line of two pairs of slides in two, the second half off', async () => {
      const body = await renderProbe('cart.probe', { cart: slides }) as any
      expect(keys(body)).toEqual(keys(auto.steps[1].body))
      expect(Object.keys(body.ajax.items[1].line_level_discount_allocations[0].discount_application)).toEqual(Object.keys((auto.steps[1].body as any).ajax.items[1].line_level_discount_allocations[0].discount_application))
    })
    it('answers cart.js with both halves under one key', () => {
      const answer = cartJson(data, slides) as any
      expect(keys(answer)).toEqual(keys(auto.steps[2].body))
      expect(answer.items[0].key).toBe(answer.items[1].key)
      expect(answer.item_count).toBe(2)
    })
    it('prints the discounted half as add.js does', () => {
      const recorded = (auto.steps[0].body as any).items[0]
      const item = (cartJson(data, slides, undefined, 'change') as any).items[1]
      expect(keys(item)).toEqual(keys(recorded))
    })
    it('answers clear.js with the empty cart', () => {
      expect(keys(cartJson(data, state([]), undefined, 'cart'))).toEqual(keys(auto.steps[3].body))
    })
    it('discounts one pair in two, three or four, and none in one', () => {
      const split = (quantity: number) => (built(state([line(SLIDES, quantity)])).items as any[]).map(item => [item.quantity, item.final_line_price])
      expect(split(1)).toEqual([[1, 2500]])
      expect(split(3)).toEqual([[2, 5000], [1, 1250]])
      // the discount gives one pair per order (`uses_per_order`)
      expect(split(4)).toEqual([[3, 7500], [1, 1250]])
    })
    it('numbers the lines after the split', () => {
      const cartObject = built(state([line(SLIDES, 3), line(HOODIE, 1)]))
      expect((cartObject.items as any[]).map(item => item.index)).toEqual([0, 1, 2])
      expect(cartObject.item_count).toBe(4)
    })
  })

  describe('a cart answered twice', () => {
    it('is the same both times, the application keys and dates included', () => {
      expect(cartJson(data, cart(['WELCOME10']))).toEqual(cartJson(data, cart(['WELCOME10'])))
      const key = (cartJson(data, cart(['WELCOME10'])).cart_level_discount_applications as any[])[0].key
      expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    })
    it('prints the lines of a split cart through cart.items | json as cart | json does', async () => {
      const theme = { files: { ...probeTheme().files, 'templates/cart.liquid': '{{ cart | json }}|{{ cart.items | json }}' } }
      const [whole, items] = (await renderPage({ theme, templateName: 'cart', data, cart: state([line(SLIDES, 2)]) })).html.split('|')
      expect(JSON.parse(items)).toEqual(JSON.parse(whole).items)
      expect(JSON.parse(items)).toHaveLength(2)
    })
  })

  describe('the cart object', () => {
    it('lists the applications, the cart-level ones apart, and the totals in the order the page defines them', () => {
      const cartObject = built(cart(['WELCOME10']))
      expect(cartObject.discount_applications.map((a: any) => [a.title, a.type, a.target_type, a.total_allocated_amount])).toEqual([['WELCOME10', 'discount_code', 'line_item', 4100]])
      expect(cartObject.cart_level_discount_applications).toEqual(cartObject.discount_applications)
      expect([cartObject.original_total_price, cartObject.items_subtotal_price, cartObject.total_price, cartObject.total_discount, cartObject.checkout_charge_amount]).toEqual([41000, 41000, 36900, 4100, 36900])
    })
    it('takes line-level discounts off the subtotal and cart-level ones off the total', () => {
      const cartObject = built(cart([]))
      expect([cartObject.original_total_price, cartObject.items_subtotal_price, cartObject.total_price, cartObject.total_discount]).toEqual([41000, 39000, 39000, 2000])
      const [beanie] = cartObject.items
      expect([beanie.original_line_price, beanie.final_line_price, beanie.final_price, beanie.line_level_total_discount]).toEqual([10000, 8000, 8000, 2000])
      expect(beanie.discount_allocations.map((a: any) => a.amount)).toEqual([2000])
      expect(beanie.line_level_discount_allocations.map((a: any) => a.amount)).toEqual([2000])
    })
    it('prints the type of an automatic discount as the parity store does, an empty string, and gives the application a key and a date', () => {
      const [application] = built(cart([])).discount_applications
      expect(application.type).toBe('')
      expect(application.title).toBe('Beanie week')
      expect([application.key, application.created_at]).toEqual([expect.stringMatching(/^[0-9a-f-]{36}$/), expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)])
      // the same application object sits in the list and in the allocation
      expect(built(cart([])).items[0].line_level_discount_allocations[0].discount_application.title).toBe('Beanie week')
    })
    it('leaves a cart with no discount in the data as it was', () => {
      const cartObject = built(cart(['WELCOME10']), { ...data, discounts: undefined })
      expect([cartObject.total_price, cartObject.total_discount, cartObject.discount_applications, cartObject.items[0].discount_allocations]).toEqual([41000, 0, [], []])
    })
  })

  describe('which discounts apply', () => {
    it('lists the codes that apply first, then the others, whatever the order they were entered in', () => {
      expect(discountCodeStatus(data, cart(['FREESHIP', 'WELCOME10']))).toEqual([{ code: 'WELCOME10', applicable: true }, { code: 'FREESHIP', applicable: false }])
      expect(discountCodeStatus(data, cart(['NOPE', 'WELCOME10', 'SHOES5']))).toEqual([{ code: 'WELCOME10', applicable: true }, { code: 'NOPE', applicable: false }, { code: 'SHOES5', applicable: false }])
    })
    it('rejects every code once the cart is empty', () => {
      expect(discountCodeStatus(data, state([], ['WELCOME10']))).toEqual([{ code: 'WELCOME10', applicable: false }])
    })
    it('reads a code in any case, and a code entered twice once', () => {
      expect(discountCodeStatus(data, cart(['welcome10', 'WELCOME10']))).toEqual([{ code: 'welcome10', applicable: true }])
      expect(built(cart(['welcome10'])).discount_applications[0].title).toBe('WELCOME10')
    })
    it('keeps the better of two discounts that cannot combine (the help centre: "the best discount for the customer\'s cart is always applied")', () => {
      // Beanie week (2000) against SHOES5 (500) on a cart with both: the automatic discount wins and the code is rejected
      const both = state([line(BEANIE, 1), line(SNEAKERS, 1)], ['SHOES5'])
      expect(built(both).discount_applications.map((a: any) => a.title)).toEqual(['Beanie week'])
      expect(discountCodeStatus(data, both)).toEqual([{ code: 'SHOES5', applicable: false }])
      // without the beanie, the code applies
      expect(built(state([line(SNEAKERS, 1)], ['SHOES5'])).total_discount).toBe(500)
    })
    it('prefers the code on equal value', () => {
      const tie = withDiscounts(
        { id: 1, type: 'amount_off_order', title: 'Ten off', value: { amount: 1000 } },
        { id: 2, type: 'amount_off_order', title: 'Ten off code', code: 'TEN', value: { amount: 1000 } }
      )
      expect(built(state([line(HOODIE, 1)], ['TEN']), tie).discount_applications.map((a: any) => a.title)).toEqual(['TEN'])
    })
    it('applies discounts that allow each other, product discounts first and order discounts on what is left', () => {
      const stack = withDiscounts(
        { id: 1, type: 'amount_off_products', title: 'Hoodies', value: { percentage: 50 }, items: { products: ['hoodie'] }, combines_with: { order: true } },
        { id: 2, type: 'amount_off_order', title: 'Ten off', code: 'TEN', value: { percentage: 10 }, combines_with: { product: true } }
      )
      const cartObject = built(state([line(HOODIE, 1)], ['TEN']), stack)
      // 9000, 50% off is 4500, and 10% of the remaining 4500 is 450
      expect(cartObject.discount_applications.map((a: any) => [a.title, a.total_allocated_amount])).toEqual([['Hoodies', 4500], ['TEN', 450]])
      expect([cartObject.items_subtotal_price, cartObject.total_price, cartObject.total_discount]).toEqual([4500, 4050, 4950])
      const [hoodie] = cartObject.items
      expect(hoodie.line_level_discount_allocations.map((a: any) => a.amount)).toEqual([4500])
      expect(hoodie.discount_allocations.map((a: any) => a.amount)).toEqual([4500, 450])
    })
    it('does not stack discounts when only one side allows it', () => {
      const oneWay = withDiscounts(
        { id: 1, type: 'amount_off_products', title: 'Hoodies', value: { percentage: 50 }, items: { products: ['hoodie'] } },
        { id: 2, type: 'amount_off_order', title: 'Ten off', code: 'TEN', value: { percentage: 10 }, combines_with: { product: true } }
      )
      expect(built(state([line(HOODIE, 1)], ['TEN']), oneWay).discount_applications.map((a: any) => a.title)).toEqual(['Hoodies'])
    })
    it('calculates percentage order discounts on the same subtotal and takes fixed ones after them', () => {
      const orders = withDiscounts(
        { id: 1, type: 'amount_off_order', title: 'Five', code: 'FIVE', value: { amount: 500 }, combines_with: { order: true } },
        { id: 2, type: 'amount_off_order', title: 'Ten', code: 'TEN', value: { percentage: 10 }, combines_with: { order: true } },
        { id: 3, type: 'amount_off_order', title: 'Twenty', code: 'TWENTY', value: { percentage: 20 }, combines_with: { order: true } }
      )
      const cartObject = built(state([line(HOODIE, 1)], ['FIVE', 'TEN', 'TWENTY']), orders)
      // 9000: 20% is 1800 and 10% is 900, both of 9000 (the better one first), then the fixed 500
      expect(cartObject.discount_applications.map((a: any) => [a.title, a.total_allocated_amount])).toEqual([['TWENTY', 1800], ['TEN', 900], ['FIVE', 500]])
      expect(cartObject.total_price).toBe(5800)
    })
    it('never takes an order discount below zero', () => {
      const big = withDiscounts({ id: 1, type: 'amount_off_order', title: 'Huge', code: 'HUGE', value: { amount: 99999 } })
      const cartObject = built(state([line(HOODIE, 1)], ['HUGE']), big)
      expect([cartObject.total_price, cartObject.total_discount]).toEqual([0, 9000])
    })
  })

  describe('amounts and spreading', () => {
    it('spreads an order amount over the lines in proportion to their price, the remainder on the last', () => {
      const order = withDiscounts({ id: 1, type: 'amount_off_order', title: 'Odd', code: 'ODD', value: { amount: 1000 } })
      const cartObject = built(state([line(BEANIE, 1), line(SUNNIES, 1), line(SNEAKERS, 1)], ['ODD']), order)
      const shares = (cartObject.items as any[]).map(item => item.discount_allocations[0].amount)
      expect(shares.reduce((sum: number, share: number) => sum + share, 0)).toBe(1000)
      // 10000, 5000 and 18000 of 33000
      expect(shares.slice(0, 2)).toEqual([303, 151])
      expect(cartObject.total_price).toBe(32000)
    })
    it('takes a fixed amount off a product discount once across the items, or off each item', () => {
      const across = withDiscounts({ id: 1, type: 'amount_off_products', title: 'Shoes', code: 'SHOES', value: { amount: 500 }, items: { collections: ['shoes'] } })
      const each = withDiscounts({ id: 1, type: 'amount_off_products', title: 'Shoes', code: 'SHOES', value: { amount: 500, each: true }, items: { collections: ['shoes'] } })
      const lines = [line(SNEAKERS, 1), line(SLIDES, 2)]
      expect(built(state(lines, ['SHOES']), across).total_discount).toBe(500)
      expect(built(state(lines, ['SHOES']), each).total_discount).toBe(1500)
      expect(built(state(lines, ['SHOES']), each).discount_applications[0].allocation_method).toBeNull()
    })
    it('converts a fixed amount like a price, without rounding it up (Canadian dollars, rate 1.35)', () => {
      const answer = cartJson(data, state([line(SNEAKERS, 1)], ['SHOES5']), { market: 'ca', language: 'en', prefix: '/en-ca' }) as any
      // 5.00 USD is 6.75 CAD; the price 180.00 USD is 243.00 CAD
      expect(answer.total_discount).toBe(675)
      expect(answer.total_price).toBe(24300 - 675)
      expect(answer.cart_level_discount_applications).toEqual([])
      expect(answer.items[0].line_level_discount_allocations[0].discount_application.value).toBe('6.75')
    })
    it('prints a fixed amount as major units and a percentage with a decimal, as strings', () => {
      const answer = cartJson(data, state([line(SNEAKERS, 1)], ['SHOES5'])) as any
      expect(answer.items[0].line_level_discount_allocations[0].discount_application).toMatchObject({ value: '5.0', value_type: 'fixed_amount', allocation_method: 'across', type: 'discount_code', title: 'SHOES5' })
      const percent = cartJson(data, state([line(BEANIE, 1)])) as any
      expect(percent.items[0].line_level_discount_allocations[0].discount_application).toMatchObject({ value: '20.0', value_type: 'percentage', allocation_method: 'each', type: '' })
    })
    it('counts the quantity minimum of a product discount on the items it applies to', () => {
      const minimum = withDiscounts({ id: 1, type: 'amount_off_products', title: 'Three tops', code: 'TOPS', value: { percentage: 10 }, items: { products: ['men-t-shirt'] }, minimum: { quantity: 3 } })
      expect(built(state([line(TSHIRT, 2), line(SNEAKERS, 5)], ['TOPS']), minimum).total_discount).toBe(0)
      expect(built(state([line(TSHIRT, 3)], ['TOPS']), minimum).total_discount).toBe(1200)
    })
    it('leaves subscriptions out of a product discount that says it does not apply to them', () => {
      const oneTime = withDiscounts({ id: 1, type: 'amount_off_products', title: 'Slides', value: { percentage: 10 }, items: { products: ['slides'] }, applies_on_subscription: false })
      expect(built(state([line(SLIDES, 1, 71001)]), oneTime).total_discount).toBe(0)
      expect(built(state([line(SLIDES, 1)]), oneTime).total_discount).toBe(250)
    })
  })

  describe('free shipping', () => {
    const result = (lines: CartState['lines'], codes: string[], source: StoreData = data, shippingCountry?: string) => {
      const store = buildStore(source)
      const items = (buildCartObject(store, state(lines, codes)) as any).items
      const collections = new Map((source.collections ?? []).map(collection => [collection.handle, new Set(collection.products)]))
      return applyDiscounts(items, source.discounts ?? [], codes, { collections, currency: store.currency, shippingCountry })
    }
    it('applies from the minimum subtotal, as its own application, and not before', () => {
      const enough = result([line(HOODIE, 2)], ['FREESHIP'])
      expect(enough.freeShipping.applies).toBe(true)
      expect(enough.freeShipping.discount).toMatchObject({ title: 'FREESHIP', type: 'discount_code', target_type: 'shipping_line', target_selection: 'all' })
      expect(enough.rejectedCodes).toEqual([])
      const short = result([line(SLIDES, 1)], ['FREESHIP'])
      expect(short.freeShipping).toEqual({ applies: false, discount: null })
      expect(short.rejectedCodes).toEqual(['FREESHIP'])
    })
    it('gives way to a product discount that does not combine with it (the help centre: product and order discounts take priority over shipping discounts)', () => {
      expect(result([line(HOODIE, 1), line(BEANIE, 1)], ['FREESHIP']).freeShipping.applies).toBe(false)
    })
    it('combines with a discount that allows shipping discounts, and is not counted in the cart', () => {
      const both = withDiscounts(
        { id: 1, type: 'amount_off_order', title: 'Ten', code: 'TEN', value: { percentage: 10 }, combines_with: { shipping: true } },
        { id: 2, type: 'free_shipping', title: 'Free', code: 'FREE', combines_with: { order: true } }
      )
      const outcome = result([line(HOODIE, 1)], ['TEN', 'FREE'], both)
      expect(outcome.freeShipping.applies).toBe(true)
      expect(outcome.applications.map(a => a.title)).toEqual(['TEN'])
      expect(built(state([line(HOODIE, 1)], ['TEN', 'FREE']), both).discount_applications.map((a: any) => a.title)).toEqual(['TEN'])
    })
    it('keeps to the countries it names, and gives its price limit in the view currency', () => {
      const limited = withDiscounts({ id: 1, type: 'free_shipping', title: 'Canada only', code: 'CA', countries: ['CA'], max_shipping_price: 1000 })
      expect(result([line(HOODIE, 1)], ['CA'], limited, 'US').freeShipping.applies).toBe(false)
      const canada = result([line(HOODIE, 1)], ['CA'], limited, 'CA')
      expect(canada.freeShipping.applies).toBe(true)
      expect(canada.freeShipping.maxPrice).toBe(1000)
      // no country yet: the cart cannot say
      expect(result([line(HOODIE, 1)], ['CA'], limited).freeShipping.applies).toBe(true)
    })
  })

  describe('Buy X Get Y', () => {
    it('gives the free sunnies of BUNDLE as one pair at 100% off, and an allocation of 0 to the tops that were bought', () => {
      const cartObject = built(cart(['BUNDLE']))
      const [beanie, sunnies, sneakers, tshirts] = cartObject.items
      expect(sunnies.line_level_discount_allocations.map((a: any) => a.amount)).toEqual([5000])
      expect(tshirts.line_level_discount_allocations.map((a: any) => a.amount)).toEqual([0])
      expect(beanie.discount_allocations).toEqual([])
      expect(sneakers.discount_allocations).toEqual([])
      expect([sunnies.final_line_price, cartObject.total_price, cartObject.total_discount]).toEqual([0, 36000, 5000])
    })
    it('needs the tops it counts: one T-shirt does not earn the sunnies', () => {
      const one = state([line(SUNNIES, 1), line(TSHIRT, 1)], ['BUNDLE'])
      expect(built(one).total_discount).toBe(0)
      expect(discountCodeStatus(data, one)).toEqual([{ code: 'BUNDLE', applicable: false }])
    })
    it('discounts one pair only, though it is given once per order (uses_per_order), splitting a line of two pairs of sunnies', () => {
      const cartObject = built(state([line(SUNNIES, 2), line(TSHIRT, 4)], ['BUNDLE']))
      expect((cartObject.items as any[]).map(item => [item.variant_id, item.quantity, item.final_line_price, item.line_level_total_discount])).toEqual([
        [SUNNIES, 1, 5000, 0],
        [SUNNIES, 1, 0, 5000],
        [TSHIRT, 4, 16000, 0]
      ])
      // the undiscounted pair was not part of what was bought, so it has no allocation
      expect(cartObject.items[0].discount_allocations).toEqual([])
    })
    it('repeats for every set of the purchase when there is no limit', () => {
      const repeat = withDiscounts({ id: 1, type: 'buy_x_get_y', title: 'Buy 2 tops, get sunnies', code: 'EVERY', buys: { items: { collections: ['tops'] }, quantity: 2 }, gets: { items: { products: ['black-sunnies'] }, quantity: 1, value: { percentage: 100 } } })
      const cartObject = built(state([line(SUNNIES, 3), line(TSHIRT, 4)], ['EVERY']), repeat)
      expect(cartObject.total_discount).toBe(10000)
      expect(cartObject.discount_applications[0].total_allocated_amount).toBe(10000)
    })
    it('discounts the cheapest eligible units first, and a fixed amount off each', () => {
      const cheapest = withDiscounts({ id: 1, type: 'buy_x_get_y', title: 'Buy a hoodie, get $10 off a pair of slides or sunnies', code: 'CHEAP', buys: { items: { products: ['hoodie'] }, quantity: 1 }, gets: { items: { products: ['slides', 'black-sunnies'] }, quantity: 1, value: { amount: 1000 } } })
      const cartObject = built(state([line(HOODIE, 1), line(SUNNIES, 1), line(SLIDES, 1)], ['CHEAP']), cheapest)
      // the slides cost 2500, the sunnies 5000
      expect((cartObject.items as any[]).map(item => item.line_level_total_discount)).toEqual([0, 0, 1000])
      expect(cartObject.discount_applications[0]).toMatchObject({ value: 1000, value_type: 'fixed_amount', target_selection: 'entitled' })
    })
    it('counts a spend, at full price, and not the items another discount already took from', () => {
      const spend = withDiscounts({ id: 1, type: 'buy_x_get_y', title: 'Spend 100, get sunnies', code: 'SPEND', buys: { items: { products: ['hoodie'] }, amount: 10000 }, gets: { items: { products: ['black-sunnies'] }, quantity: 1, value: { percentage: 100 } } })
      expect(built(state([line(HOODIE, 1), line(SUNNIES, 1)], ['SPEND']), spend).total_discount).toBe(0)
      expect(built(state([line(HOODIE, 2), line(SUNNIES, 1)], ['SPEND']), spend).total_discount).toBe(5000)
    })
    it('splits the allocations an earlier discount made when it splits the line', () => {
      const both = withDiscounts(
        { id: 1, type: 'amount_off_products', title: 'Slides sale', value: { percentage: 50 }, items: { products: ['slides'] }, combines_with: { product: true } },
        { id: 2, type: 'buy_x_get_y', title: 'Second pair 10% off', buys: { items: { products: ['slides'] }, quantity: 1 }, gets: { items: { products: ['slides'] }, quantity: 1, value: { percentage: 10 } }, uses_per_order: 1, combines_with: { product: true } }
      )
      const cartObject = built(state([line(SLIDES, 2)]), both)
      const [first, second] = cartObject.items
      // 5000: half off is 2500, 1250 on each pair; the second pair then loses 10% of its remaining 1250
      expect(first.line_level_discount_allocations.map((a: any) => a.amount)).toEqual([1250, 0])
      expect(second.line_level_discount_allocations.map((a: any) => a.amount)).toEqual([1250, 125])
      expect([first.final_line_price, second.final_line_price]).toEqual([1250, 1125])
      expect(cartObject.total_discount).toBe(2500 + 125)
      expect(cartObject.discount_applications.map((a: any) => a.total_allocated_amount)).toEqual([2500, 125])
    })
  })

  describe('applyDiscounts', () => {
    it('rejects every code and applies nothing to an empty cart', () => {
      const store = buildStore(data)
      const outcome = applyDiscounts([], data.discounts ?? [], ['WELCOME10', 'NOPE'], { collections: new Map(), currency: store.currency })
      expect(outcome).toMatchObject({ applications: [], cartLevel: [], lines: [], rejectedCodes: ['WELCOME10', 'NOPE'], freeShipping: { applies: false, discount: null } })
    })
  })
})
