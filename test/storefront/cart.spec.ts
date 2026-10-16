import { cartJson, findVariant, lineItemJson, lineKey, renderPage, stockFor, storefrontSampleData as data } from '../../src/shopify'
import type { CartState, StoreData } from '../../src/shopify'
import { ReportCollector } from '../../src/shopify/report'
import { buildCartObject } from '../../src/shopify/store/cart'
import { buildStore } from '../../src/shopify/store/build'
import { buildGlobals } from '../../src/shopify/store/globals'
import { loadFixture } from './fixtures'
import { probeTheme, renderProbe } from './probe'

const state = (lines: CartState['lines'], extra: Partial<CartState> = {}): CartState => ({ token: '<token>', lines, note: null, attributes: {}, discountCodes: [], ...extra })
const line = (variantId: number, quantity: number, properties: Record<string, string> = {}, sellingPlanId: number | null = null) => ({ variantId, quantity, properties, sellingPlanId })

const HOODIE = 43695847538710
const SLIDES_SMALL = 43695710371862
const BLACK_SUNNIES = 43696940613654
const CA = { market: 'ca', language: 'en', prefix: '/en-ca' }

describe('cart', () => {
  it('gives the same line the same key, and different properties or plans a different key', () => {
    expect(lineKey(line(43695847538710, 1))).toBe(lineKey(line(43695847538710, 5)))
    expect(lineKey(line(43695847538710, 1))).not.toBe(lineKey(line(43695847538710, 1, { Engraving: 'Hi' })))
    expect(lineKey(line(43695710371862, 1))).not.toBe(lineKey(line(43695710371862, 1, {}, 71001)))
    expect(lineKey(line(43695847538710, 1))).toMatch(/^43695847538710:[0-9a-f]{32}$/)
  })
  it('gives properties the same key whatever order they were set in', () => {
    expect(lineKey(line(HOODIE, 1, { a: '1', b: '2' }))).toBe(lineKey(line(HOODIE, 1, { b: '2', a: '1' })))
  })
  it('answers /cart.js as the parity store does after the session\'s adds', () => {
    const fixture = loadFixture('ajax-cart-session')
    const afterAdds = fixture.steps[5]
    // newest line first, as `cart.js` lists them (step 6); a cart that has had an add holds the note `""`, where a cart nobody touched holds `null` (step 1)
    const cart = state([line(43695710371862, 1, {}, 71001), line(43695847538710, 1, { Engraving: 'Hi' }), line(43695847538710, 3)], { note: '' })
    expect(normaliseKeys(cartJson(data, cart))).toEqual(normaliseKeys(afterAdds.body))
  })
  it('renders the cart probe for the session\'s cart', async () => {
    const fixture = loadFixture('ajax-cart-session')
    const probe = fixture.steps[10]
    const cart = state([line(43696940613654, 1), line(43695710371862, 1, {}, 71001), line(43695847538710, 1, { Engraving: 'Hi' }), line(43695847538710, 1)], { note: 'Gift wrap', attributes: { gift: 'yes' } })
    const body = await renderProbe('cart.probe', { cart }) as any
    expect(normaliseKeys(withoutAjax(body))).toEqual(normaliseKeys(withoutAjax(probe.body)))
  })

  describe('/cart.js', () => {
    const session = loadFixture('ajax-cart-session')
    it('answers a cart nobody touched, and one that was cleared', () => {
      expect(normaliseKeys(cartJson(data, state([])))).toEqual(normaliseKeys(session.steps[0].body))
      // `clear.js` empties the lines and keeps the note and attributes (step 12)
      expect(normaliseKeys(cartJson(data, state([], { note: 'Gift wrap', attributes: { gift: 'yes' } })))).toEqual(normaliseKeys(session.steps[12].body))
    })
    it('keeps the keys in the order the parity store prints them, a line\'s too', () => {
      const answer = cartJson(data, state([line(SLIDES_SMALL, 1, {}, 71001), line(HOODIE, 3)], { note: '' })) as any
      const recorded = session.steps[5].body as any
      expect(Object.keys(answer)).toEqual(Object.keys(recorded))
      expect(Object.keys(answer.items[0])).toEqual(Object.keys(recorded.items[0]))
      expect(Object.keys(answer.items[1])).toEqual(Object.keys(recorded.items[1]))
      expect(Object.keys(answer.items[0].selling_plan_allocation)).toEqual(Object.keys(recorded.items[0].selling_plan_allocation))
      expect(Object.keys(answer.items[0].selling_plan_allocation.selling_plan)).toEqual(Object.keys(recorded.items[0].selling_plan_allocation.selling_plan))
    })
    it('prints a selling plan line\'s allocation, and only on that line', () => {
      const answer = cartJson(data, state([line(SLIDES_SMALL, 1, {}, 71001), line(HOODIE, 1)])) as any
      expect(answer.items[0].selling_plan_allocation.selling_plan.id).toBe(71001)
      expect(answer.items[0].price).toBe(2250)
      expect('selling_plan_allocation' in answer.items[1]).toBe(false)
    })
    it('prices a line in the view\'s currency, under the view\'s prefix (fixture ajax-cart-en-ca)', () => {
      const fixture = loadFixture('ajax-cart-en-ca')
      expect(normaliseKeys(cartJson(data, state([line(HOODIE, 1)], { note: '' }), CA))).toEqual(normaliseKeys(fixture.steps[2].body))
      expect(normaliseKeys(cartJson(data, state([]), CA))).toEqual(normaliseKeys(fixture.steps[0].body))
      expect(normaliseKeys(cartJson(data, state([], { note: '' }), CA))).toEqual(normaliseKeys(fixture.steps[4].body))
    })
    it('renders the Canadian cart probe', async () => {
      const probe = loadFixture('ajax-cart-en-ca').steps[3]
      const body = await renderProbe('cart.probe', { cart: state([line(HOODIE, 1)], { note: '' }), request: { market: 'ca', language: 'en', localePrefix: '/en-ca' } }) as any
      expect(normaliseKeys(withoutAjax(body))).toEqual(normaliseKeys(withoutAjax(probe.body)))
    })
  })

  describe('the answers of add.js, change.js and update.js', () => {
    it('print a line with the untranslated titles in place of the quantity rule', () => {
      const session = loadFixture('ajax-cart-session')
      const cart = state([line(BLACK_SUNNIES, 1), line(SLIDES_SMALL, 1, {}, 71001), line(HOODIE, 1, { Engraving: 'Hi' }), line(HOODIE, 1)], { note: 'Gift wrap', attributes: { gift: 'yes' } })
      const recorded = { ...(session.steps[9].body as any) }
      // the changelog is the storefront's to add
      delete recorded.items_changelog
      const answer = cartJson(data, cart, undefined, 'change') as any
      expect(normaliseKeys(answer)).toEqual(normaliseKeys(recorded))
      for (const [i, item] of answer.items.entries()) expect(Object.keys(item)).toEqual(Object.keys(recorded.items[i]))
      expect(Object.keys(answer.items[1].selling_plan_allocation.selling_plan)).toEqual(Object.keys(recorded.items[1].selling_plan_allocation.selling_plan))
    })
    it('print the added line as add.js does: a default-title variant has a null variant title (fixture ajax-cart-sections)', () => {
      const added = (loadFixture('ajax-cart-sections').steps[0].body as any).items[0]
      const item = (cartJson(data, state([line(BLACK_SUNNIES, 1)]), undefined, 'change') as any).items[0]
      expect(normaliseKeys(item)).toEqual(normaliseKeys(added))
      expect(Object.keys(item)).toEqual(Object.keys(added))
    })
    it('print the line of a selling plan as add.js does (fixture ajax-cart-session, step 5)', () => {
      const added = (loadFixture('ajax-cart-session').steps[4].body as any).items[0]
      const item = (cartJson(data, state([line(SLIDES_SMALL, 1, {}, 71001)]), undefined, 'change') as any).items[0]
      expect(normaliseKeys(item)).toEqual(normaliseKeys(added))
    })
    it('print the translated titles beside the store\'s own', () => {
      const [item] = (cartJson(data, state([line(HOODIE, 1)]), { market: 'ca', language: 'fr', prefix: '/fr-ca' }, 'change') as any).items
      expect([item.title, item.product_title, item.untranslated_product_title, item.untranslated_variant_title, item.variant_title]).toEqual(['Sweat à capuche - Green / Small', 'Sweat à capuche', 'Hoodie', 'Green / Small', 'Green / Small'])
      expect(item.url).toBe('/fr-ca/products/hoodie?variant=43695847538710')
    })
    it('are the lines of the cart object, one at a time', () => {
      const cart = buildCartObject(buildStore(data), state([line(HOODIE, 2, { Engraving: 'Hi' })]))
      const [item] = cart.items as Array<Record<string, unknown>>
      expect(lineItemJson(item)).toEqual((cartJson(data, state([line(HOODIE, 2, { Engraving: 'Hi' })])).items as unknown[])[0])
      expect(lineItemJson(item, 'change')).toEqual((cartJson(data, state([line(HOODIE, 2, { Engraving: 'Hi' })]), undefined, 'change').items as unknown[])[0])
    })
  })

  describe('the cart object', () => {
    const cartOf = (cart: CartState, source: StoreData = data) => buildCartObject(buildStore(source), cart)
    it('numbers the lines from 0 and leaves out a line whose variant the store does not have', () => {
      const items = cartOf(state([line(HOODIE, 1), line(1, 4), line(BLACK_SUNNIES, 2)])).items as Array<Record<string, unknown>>
      expect(items.map(item => [item.index, item.variant_id, item.quantity])).toEqual([[0, HOODIE, 1], [1, BLACK_SUNNIES, 2]])
    })
    it('prices a line under a selling plan the variant does not have, or that does not exist, as a plain line', () => {
      const [item] = cartOf(state([line(HOODIE, 1, {}, 71001)])).items as Array<Record<string, unknown>>
      expect([item.price, item.selling_plan_allocation, item.url]).toEqual([9000, null, '/products/hoodie?variant=43695847538710'])
      expect(item.key).toBe(lineKey(line(HOODIE, 1, {}, 71001)))
    })
    it('counts the items, the weight and the total, and requires shipping while it has a line', () => {
      const cart = cartOf(state([line(HOODIE, 3), line(SLIDES_SMALL, 1, {}, 71001)]))
      expect(cart).toMatchObject({ item_count: 4, total_price: 9000 * 3 + 2250, items_subtotal_price: 9000 * 3 + 2250, original_total_price: 9000 * 3 + 2250, total_weight: 600 * 3 + 300, requires_shipping: true, total_discount: 0, 'empty?': false })
      expect(cartOf(state([]))).toMatchObject({ item_count: 0, total_price: 0, total_weight: 0, requires_shipping: false, 'empty?': true })
    })
    it('lets a template read a line\'s properties by name, walk them as pairs and print them as pairs', async () => {
      const html = await renderPage({
        theme: { files: { ...probeTheme().files, 'templates/cart.liquid': '{% for p in cart.items[0].properties %}{{ p.first }}={{ p.last }};{% endfor %}|{{ cart.items[0].properties.Engraving }}|{{ cart.items[0].properties | json }}|{{ cart.items[1].properties | json }}|{{ cart.attributes | json }}' } },
        templateName: 'cart',
        data,
        cart: state([line(HOODIE, 1, { Engraving: 'Hi' }), line(HOODIE, 1)])
      })
      expect(html.html).toBe('Engraving=Hi;|Hi|[["Engraving","Hi"]]|[]|{}')
    })
    it('shows a cart handed to the render over the store data\'s, and the data\'s when none is handed', async () => {
      const theme = { files: { ...probeTheme().files, 'templates/cart.liquid': '{{ cart.item_count }}:{{ cart.items[0].title }}' } }
      expect((await renderPage({ theme, templateName: 'cart', data, cart: state([line(HOODIE, 2)]) })).html).toBe('2:Hoodie - Green / Small')
      expect((await renderPage({ theme, templateName: 'cart', data, cart: state([]) })).html).toBe('0:')
      expect((await renderPage({ theme, templateName: 'cart', data: { ...data, cart: { items: [{ product_handle: 'hoodie', variant_id: HOODIE, quantity: 5 }], note: 'n' } } })).html).toBe('5:Hoodie - Green / Small')
      expect((await renderPage({ theme, templateName: 'cart', data: { ...data, cart: { items: [{ product_handle: 'hoodie', variant_id: HOODIE, quantity: 5 }] } }, cart: state([line(HOODIE, 1)]) })).html).toBe('1:Hoodie - Green / Small')
    })
    it('takes a cart state as the store data\'s cart', async () => {
      const own = { ...data, cart: state([line(HOODIE, 2, { Engraving: 'Hi' })], { note: 'Gift' }) }
      expect(buildStore(own).cart).toMatchObject({ item_count: 2, note: 'Gift' })
      expect((cartJson(own, own.cart as CartState).items as unknown[]).length).toBe(1)
    })
    it('leaves a product in the page\'s cart out of its recommendations', () => {
      const request = { recommendations: { productId: 10489561382934, limit: 25 } }
      const store = buildStore(data)
      const handles = (cart?: CartState) => ((buildGlobals({ store, data, templateName: 'product', request, locale: 'en', report: new ReportCollector(), cart }).globals.recommendations as any).products as Array<{ handle: string }>).map(product => product.handle)
      const all = handles()
      expect(all.length).toBeGreaterThan(0)
      const first = all[0]
      const variant = (data.products ?? []).find(product => product.handle === first)!.variants[0].id
      expect(handles(state([line(variant, 1)]))).not.toContain(first)
      expect(handles()).toContain(first)
    })
  })

  describe('findVariant and stockFor', () => {
    it('finds a variant with its product, and nothing for an id the store does not have', () => {
      const found = findVariant(data, HOODIE)
      expect([found?.product.handle, found?.variant.id]).toEqual(['hoodie', HOODIE])
      expect(findVariant(data, 1)).toBeNull()
      expect(findVariant({ shop: data.shop }, HOODIE)).toBeNull()
    })
    it('counts the stock of a tracked variant, and sells nothing of a sold out one (fixture ajax-cart-errors)', () => {
      expect(stockFor(findVariant(data, 43696926949398)!.variant)).toBe(3)
      expect(stockFor(findVariant(data, 43695847145494)!.variant)).toBe(0)
    })
    it('has no limit for a variant that is not tracked or that sells past zero', () => {
      const variant = { id: 1, title: 'x', price: 100, available: true, inventory_quantity: 0 }
      expect(stockFor(variant)).toBeNull()
      expect(stockFor({ ...variant, inventory_management: 'shopify', inventory_policy: 'continue' })).toBeNull()
      expect(stockFor({ ...variant, inventory_management: 'shopify' })).toBe(0)
      expect(stockFor({ ...variant, inventory_management: 'shopify', inventory_quantity: -2 })).toBe(0)
    })
  })
})

/** The probe without `ajax` (`cart | json`): the filter prints a cart as the engine's cart object, and `cartJson` is compared in the test above, so the whole-body comparison leaves it out (Task 14 does the same). */
function withoutAjax (body: any): unknown {
  const rest = { ...body }
  delete rest.ajax
  return rest
}

/** Line-key hashes differ between Shopify and the engine; the fixture keeps `<hash>`. */
function normaliseKeys (value: unknown): unknown {
  return JSON.parse(JSON.stringify(value).replace(/(\d+):[0-9a-f]{32}/g, '$1:<hash>'))
}
