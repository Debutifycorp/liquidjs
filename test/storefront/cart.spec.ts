import { cartJson, findVariant, lineItemJson, lineKey, productJson, renderPage, renderSection, stockFor, storefrontSampleData as data } from '../../src/shopify'
import type { CartState, RequestInput, StoreData } from '../../src/shopify'
import { ReportCollector } from '../../src/shopify/report'
import { buildCartObject } from '../../src/shopify/store/cart'
import { buildStore } from '../../src/shopify/store/build'
import { buildGlobals } from '../../src/shopify/store/globals'
import { resolveView } from '../../src/shopify/store/view'
import { LiquidFloat } from '../../src'
import { loadFixture } from './fixtures'
import { probeTheme, renderProbe, renderProbeHtml } from './probe'

const state = (lines: CartState['lines'], extra: Partial<CartState> = {}): CartState => ({ token: '<token>', lines, note: null, attributes: {}, discountCodes: [], ...extra })
const line = (variantId: number, quantity: number, properties: Record<string, string> = {}, sellingPlanId: number | null = null) => ({ variantId, quantity, properties, sellingPlanId })

const HOODIE = 43695847538710
const HOODIE_GREEN_SMALL = 43695847538710
const SLIDES_SMALL = 43695710371862
const BLACK_SUNNIES = 43696940613654
const CA = { market: 'ca', language: 'en', prefix: '/en-ca' }

/** Changes every array and object of an answer in place: an item added to each array, a key to each object. */
function scribble (value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(scribble)
    value.push('INJECTED')
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach(scribble)
    ;(value as Record<string, unknown>).INJECTED = true
  }
}

// final review B, M1: `cartJson` is public API, and its `variant_options`, `quantity_rule` and selling plan fields were the cached store's own arrays and objects, so a caller that changed an answer changed every later answer, and `productJson`'s
describe('cart answers are private copies', () => {
  const cart = state([line(HOODIE, 1), line(SLIDES_SMALL, 1, {}, 71001)], { note: 'Gift wrap', attributes: { gift: 'yes' } })

  it('leaves the next cart answer and the product answers alone when a caller changes one', () => {
    const store = structuredClone(data)
    const before = { cart: structuredClone(cartJson(store, cart)), change: structuredClone(cartJson(store, cart, undefined, 'change')), product: productJson(store, 'hoodie'), slides: productJson(store, 'slides') }
    for (const form of ['cart', 'change'] as const) scribble(cartJson(store, cart, undefined, form))
    expect(cartJson(store, cart)).toEqual(before.cart)
    expect(cartJson(store, cart, undefined, 'change')).toEqual(before.change)
    expect(productJson(store, 'hoodie')).toEqual(before.product)
    expect(productJson(store, 'slides')).toEqual(before.slides)
  })

  it('does the same for a line of any form', () => {
    const store = structuredClone(data)
    const items = buildCartObject(buildStore(store, resolveView(store, {})), cart).items as any[]
    for (const form of ['cart', 'change', 'liquid'] as const) {
      const before = items.map(item => structuredClone(lineItemJson(item, form)))
      items.forEach(item => scribble(lineItemJson(item, form)))
      expect(items.map(item => lineItemJson(item, form))).toEqual(before)
    }
  })

  it('leaves the page alone too: a section that prints the cart as json after an answer was changed', async () => {
    const store = structuredClone(data)
    const render = async () => (await renderPage({ theme: { files: { ...probeTheme().files, 'templates/cart.liquid': '{{ cart | json }}|{{ all_products["hoodie"].variants[0].options | json }}|{{ all_products["hoodie"].variants[0].quantity_rule | json }}' } }, templateName: 'cart', data: store, cart })).html
    const before = await render()
    scribble(cartJson(store, cart))
    expect(await render()).toBe(before)
  })
})

// fixture `ajax-cart-text`: the parity store keeps the visitor's note, attribute and property text raw (`/cart.js`, step 2), prints it HTML-escaped in Liquid (`cart.note`, `cart.attributes.<name>` and the values of `item.properties`, step 3, and the probe's `cart.note | json`, `cart.attributes | json` and `item.properties | json`, step 4) and raw again in `{{ cart | json }}` (the probe's `ajax`, step 4). A raw print let a cross-site `POST /cart/update` put script into a theme's `<textarea>{{ cart.note }}</textarea>` (final review B, C1 and the settled cart-note concern of lane FA). A name with markup in it (`<s>k</s>`, `<u>N</u>`) stays raw in the Ajax answers and prints with its tags stripped in Liquid (`k`, `N`, steps 3 and 4: the loop, `cart.attributes | json` and `item.properties | json`; lane FA2)
describe('visitor text in the cart', () => {
  const text = loadFixture('ajax-cart-text')
  const MARKUP = { note: '</textarea><b>A & "B"</b>', attribute: '<i>x & "y"</i>', property: '<b>A & "B"</b>' }
  const cart = state([line(HOODIE_GREEN_SMALL, 1, { Engraving: MARKUP.property, '<u>N</u>': 'v' })], { note: MARKUP.note, attributes: { gift: MARKUP.attribute, '<s>k</s>': 'w' } })

  it('answers /cart.js with the text as it was stored', () => {
    expect(normaliseKeys(cartJson(data, cart))).toEqual(normaliseKeys(text.steps[2].body))
    expect(normaliseKeys(cartJson(data, cart, undefined, 'change'))).toMatchObject({ note: MARKUP.note, attributes: { gift: MARKUP.attribute, '<s>k</s>': 'w' }, items: [{ properties: { Engraving: MARKUP.property, '<u>N</u>': 'v' } }] })
  })

  it('prints the note, the attribute and the properties HTML-escaped in Liquid', async () => {
    expect(await renderProbeHtml('cart.probe-text', { cart })).toBe((text.steps[3].body as { text: string }).text)
  })

  it('prints them escaped through json in Liquid and raw in the cart as a whole', async () => {
    const body = await renderProbe('cart.probe', { cart }) as any
    expect(normaliseKeys(body)).toEqual(normaliseKeys(text.steps[4].body))
  })

  it('holds the escaped strings as plain strings, so escape escapes them again as Shopify\'s would', async () => {
    const html = (await renderPage({ theme: { files: { ...probeTheme().files, 'templates/cart.liquid': '{{ cart.note | escape }}|{{ cart.attributes.gift | escape }}|{% for item in cart.items %}{{ item.properties.Engraving | escape }}{% endfor %}|{{ cart.note | size }}' } }, templateName: 'cart', data, cart })).html
    expect(html).toBe('&amp;lt;/textarea&amp;gt;&amp;lt;b&amp;gt;A &amp;amp; &amp;quot;B&amp;quot;&amp;lt;/b&amp;gt;|&amp;lt;i&amp;gt;x &amp;amp; &amp;quot;y&amp;quot;&amp;lt;/i&amp;gt;|&amp;lt;b&amp;gt;A &amp;amp; &amp;quot;B&amp;quot;&amp;lt;/b&amp;gt;|' + String(MARKUP.note.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').length))
  })

  // final review B, FA2: the names of the attributes and properties are the visitor's too. Fixture `ajax-cart-text` records the tags of a name stripped (`k`, `N`) in the loop (step 3) and as the keys `cart.attributes | json` and `item.properties | json` print (step 4, which the probe test below replays), so the stripped name is the key of the hash; the lookup by it (`cart.attributes.k`) is inferred from that. `&`, `<`, `>`, `"` and `'` left in a name are escaped as the values are (the recording holds no such name), so a theme that prints `{{ p.first }}` in an attribute cannot be broken out of
  it('reads an attribute and a property by the name with its tags stripped, and the raw name finds nothing', async () => {
    const html = (await renderPage({ theme: { files: { ...probeTheme().files, 'templates/cart.liquid': '[{{ cart.attributes.k }}][{{ cart.attributes["<s>k</s>"] | json }}]{% for item in cart.items %}[{{ item.properties.N }}][{{ item.properties["<u>N</u>"] | json }}]{% endfor %}' } }, templateName: 'cart', data, cart })).html
    expect(html).toBe('[w][null][v][null]')
  })

  it('escapes what stripping leaves in a name, so printing it in an attribute cannot break out, and leaves a plain name as it is', async () => {
    const names = ['a&b', 'x"y', 'it\'s', 'a<b', '</i><b onmouseover=1>"', 'Gift wrap']
    const attributes = Object.fromEntries(names.map(name => [name, 'v']))
    const properties = Object.fromEntries(names.map(name => [name, 'v']))
    const files = { ...probeTheme().files, 'templates/cart.liquid': '{% for a in cart.attributes %}<input name="{{ a.first }}" value="{{ a.last }}">{% endfor %}|{% for item in cart.items %}{% for p in item.properties %}<input name="{{ p.first }}">{% endfor %}{% endfor %}' }
    const html = (await renderPage({ theme: { files }, templateName: 'cart', data, cart: state([line(HOODIE_GREEN_SMALL, 1, properties)], { attributes }) })).html
    const [attributeHtml, propertyHtml] = html.split('|')
    // the tags of `</i><b onmouseover=1>"` go, and the quote they leave is escaped
    const expected = ['a&amp;b', 'x&quot;y', 'it&#39;s', 'a&lt;b', '&quot;', 'Gift wrap']
    expect(attributeHtml).toBe(expected.map(name => `<input name="${name}" value="v">`).join(''))
    expect(propertyHtml).toBe(expected.map(name => `<input name="${name}">`).join(''))
    expect(await renderPage({ theme: { files: { ...probeTheme().files, 'templates/cart.liquid': '{{ cart.attributes["Gift wrap"] }}{% for item in cart.items %}{{ item.properties["Gift wrap"] }}{% endfor %}' } }, templateName: 'cart', data, cart: state([line(HOODIE_GREEN_SMALL, 1, properties)], { attributes }) }).then(page => page.html)).toBe('vv')
  })

  it('keeps a missing note and attribute missing, and leaves plain text as it is', async () => {
    const html = (await renderPage({ theme: { files: { ...probeTheme().files, 'templates/cart.liquid': '[{{ cart.note | json }}][{{ cart.attributes.gift | json }}][{% if cart.note %}note{% endif %}]' } }, templateName: 'cart', data, cart: state([]) })).html
    expect(html).toBe('[null][null][]')
    const plain = (await renderPage({ theme: { files: { ...probeTheme().files, 'templates/cart.liquid': '[{{ cart.note }}]' } }, templateName: 'cart', data, cart: state([], { note: 'Gift wrap' }) })).html
    expect(plain).toBe('[Gift wrap]')
  })
})

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
    expect(normaliseKeys(body)).toEqual(normaliseKeys(probe.body))
  })

  describe('{{ cart | json }}', () => {
    const cart = state([line(BLACK_SUNNIES, 1), line(SLIDES_SMALL, 1, {}, 71001), line(HOODIE, 1, { Engraving: 'Hi' }), line(HOODIE, 1)], { note: 'Gift wrap', attributes: { gift: 'yes' } })
    it('prints the cart as the parity store does, key order included (fixture ajax-cart-session, the ajax of step 11)', async () => {
      const recorded = (loadFixture('ajax-cart-session').steps[10].body as any).ajax
      const { ajax } = await renderProbe('cart.probe', { cart }) as any
      expect(normaliseKeys(ajax)).toEqual(normaliseKeys(recorded))
      expect(Object.keys(ajax)).toEqual(Object.keys(recorded))
      for (const [i, item] of ajax.items.entries()) expect(Object.keys(item)).toEqual(Object.keys(recorded.items[i]))
      expect(Object.keys(ajax.items[1].selling_plan_allocation)).toEqual(Object.keys(recorded.items[1].selling_plan_allocation))
      expect(Object.keys(ajax.items[1].selling_plan_allocation.selling_plan)).toEqual(Object.keys(recorded.items[1].selling_plan_allocation.selling_plan))
    })
    it('prints a line\'s properties as an object, where the line\'s own properties print as pairs', async () => {
      const { ajax, items } = await renderProbe('cart.probe', { cart }) as any
      expect(ajax.items[2].properties).toEqual({ Engraving: 'Hi' })
      expect(items[2].properties).toEqual([['Engraving', 'Hi']])
    })
    it('prints the Canadian cart (fixture ajax-cart-en-ca)', async () => {
      const recorded = (loadFixture('ajax-cart-en-ca').steps[3].body as any).ajax
      const { ajax } = await renderProbe('cart.probe', { cart: state([line(HOODIE, 1)], { note: '' }), request: { market: 'ca', language: 'en', localePrefix: '/en-ca' } }) as any
      expect(normaliseKeys(ajax)).toEqual(normaliseKeys(recorded))
    })
    it('prints an empty cart, and leaves cartJson alone', async () => {
      const theme = { files: { ...probeTheme().files, 'templates/cart.liquid': '{{ cart | json }}' } }
      const printed = JSON.parse((await renderPage({ theme, templateName: 'cart', data, cart: state([]) })).html)
      expect(printed).toMatchObject({ note: null, attributes: {}, item_count: 0, items: [], requires_shipping: false, currency: 'USD', checkout_charge_amount: 0 })
      expect('token' in printed).toBe(false)
      expect('token' in cartJson(data, state([]))).toBe(true)
    })
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
      expect(normaliseKeys(body)).toEqual(normaliseKeys(probe.body))
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
    it('leaves out a line that holds less than one of its variant', () => {
      const cart = cartOf(state([line(HOODIE, 0), line(HOODIE, -1), line(HOODIE, Number.NaN), line(BLACK_SUNNIES, 2)]))
      expect([cart.item_count, cart.total_price, (cart.items as unknown[]).length]).toEqual([2, 10000, 1])
    })
    it('hides the private attributes, those named __…, from the cart, /cart.js and cart | json, and keeps them in the state', async () => {
      // https://shopify.dev/docs/api/ajax/reference/cart: "Private cart attributes are not available in the Liquid `cart.attributes` object or the Ajax API"
      const cart = state([line(HOODIE, 1)], { attributes: { gift: 'yes', __hidden: 'secret' } })
      const theme = { files: { ...probeTheme().files, 'templates/cart.liquid': '{{ cart.attributes | json }}|{{ cart.attributes.__hidden }}|{{ cart | json }}' } }
      const [attributes, direct, printed] = (await renderPage({ theme, templateName: 'cart', data, cart })).html.split('|')
      expect(JSON.parse(attributes)).toEqual({ gift: 'yes' })
      expect(direct).toBe('')
      expect(JSON.parse(printed).attributes).toEqual({ gift: 'yes' })
      expect(cartJson(data, cart).attributes).toEqual({ gift: 'yes' })
      expect(cart.attributes).toEqual({ gift: 'yes', __hidden: 'secret' })
    })
    it('gives the cart a copy of the attributes, so changing one leaves the state alone', () => {
      const cart = state([], { attributes: { gift: 'yes' } })
      ;(cartJson(data, cart).attributes as Record<string, string>).gift = 'changed'
      ;(cartOf(cart).attributes as Record<string, string>).other = 'added'
      expect(cart.attributes).toEqual({ gift: 'yes' })
    })
    it('keeps a private line property (_gift) in the line, its key and /cart.js, where a template can read it', async () => {
      const cart = state([line(HOODIE, 1, { _gift: 'yes' })])
      const item = (cartJson(data, cart).items as any[])[0]
      expect(item.properties).toEqual({ _gift: 'yes' })
      expect(item.key).toBe(lineKey(line(HOODIE, 1, { _gift: 'yes' })))
      expect(item.key).not.toBe(lineKey(line(HOODIE, 1)))
      const theme = { files: { ...probeTheme().files, 'templates/cart.liquid': '{{ cart.items[0].properties._gift }}' } }
      expect((await renderPage({ theme, templateName: 'cart', data, cart })).html).toBe('yes')
    })
    it('gives the currency the symbol and name of the localization\'s, and a line its weight and tax flag', async () => {
      const theme = { files: { ...probeTheme().files, 'templates/cart.liquid': '{{ cart.currency.iso_code }}|{{ cart.currency.symbol }}|{{ cart.currency.name }}|{{ localization.country.currency.iso_code }}|{{ localization.country.currency.symbol }}|{{ localization.country.currency.name }}|{{ cart.items[0].grams }}|{{ cart.items[0].taxable }}' } }
      const show = async (request?: RequestInput) => (await renderPage({ theme, templateName: 'cart', data, cart: state([line(HOODIE, 2)]), request })).html.split('|')
      const us = await show()
      expect(us.slice(0, 3)).toEqual(us.slice(3, 6))
      expect(us.slice(0, 2)).toEqual(['USD', '$'])
      expect(us.slice(6)).toEqual(['600', 'true'])
      const ca = await show({ market: 'ca', language: 'en', localePrefix: '/en-ca' })
      expect(ca.slice(0, 3)).toEqual(ca.slice(3, 6))
      expect(ca.slice(0, 2)).toEqual(['CAD', '$'])
    })
    it('prints a line item, and the list of them, as the lines of cart | json', async () => {
      const cart = state([line(HOODIE, 1, { Engraving: 'Hi' }), line(SLIDES_SMALL, 1, {}, 71001)])
      const theme = { files: { ...probeTheme().files, 'templates/cart.liquid': '{{ cart | json }}|{{ cart.items | json }}|{{ cart.items[1] | json }}' } }
      const [whole, items, second] = (await renderPage({ theme, templateName: 'cart', data, cart })).html.split('|')
      const lines = JSON.parse(whole).items
      expect(JSON.parse(items)).toEqual(lines)
      expect(JSON.parse(second)).toEqual(lines[1])
      expect(Object.keys(lines[0])).not.toContain('product')
      expect(items.length).toBeLessThan(6000)
    })
    it('shows the cart a section renders with', async () => {
      const files = { ...probeTheme().files, 'templates/index.json': JSON.stringify({ sections: { main: { type: 'cart-count' } }, order: ['main'] }), 'sections/cart-count.liquid': '{{ cart.item_count }}:{{ cart.items[0].title }}' }
      const { html } = await renderSection({ theme: { files }, templateName: 'index', section: 'main', data, cart: state([line(HOODIE, 3)]) })
      expect(html).toContain('3:Hoodie - Green / Small')
    })
    it('survives a round trip through JSON as a whole', () => {
      const cart = state([line(HOODIE, 1, { Engraving: 'Hi' }), line(SLIDES_SMALL, 2, {}, 71001)], { note: 'Gift wrap', attributes: { gift: 'yes', __hidden: 'x' }, discountCodes: ['WELCOME10'], currency: 'USD' })
      const copy = JSON.parse(JSON.stringify(cart)) as CartState
      expect(copy).toEqual(cart)
      expect(cartJson(data, copy)).toEqual(cartJson(data, cart))
    })
    it('counts the items, the weight and the total, and requires shipping while it has a line', () => {
      const cart = cartOf(state([line(HOODIE, 3), line(SLIDES_SMALL, 1, {}, 71001)]))
      expect(cart).toMatchObject({ item_count: 4, total_price: 9000 * 3 + 2250, items_subtotal_price: 9000 * 3 + 2250, original_total_price: 9000 * 3 + 2250, requires_shipping: true, total_discount: 0, 'empty?': false })
      // the weight is a Float, as Shopify's is: it prints `2100.0`
      expect(cart.total_weight).toBeInstanceOf(LiquidFloat)
      expect(Number(cart.total_weight)).toBe(600 * 3 + 300)
      expect(cartOf(state([]))).toMatchObject({ item_count: 0, total_price: 0, requires_shipping: false, 'empty?': true })
      expect(String(cartOf(state([])).total_weight)).toBe('0.0')
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
    it('reads nothing for a line\'s properties.size, so Dawn\'s `item.properties.size != 0` holds for a line with none (recording ajax-cart-sections of Dawn: `<dl></dl><p class="product-option"></p>` for black-sunnies)', async () => {
      const source = '{{ cart.items[0].properties.size | json }}|{% if cart.items[0].properties.size != 0 %}shown{% endif %}|{{ cart.items[1].properties.size | json }}|{{ cart.items[2].properties.size }}|{{ cart.items[1].properties.Engraving }}'
      const html = await renderPage({
        theme: { files: { ...probeTheme().files, 'templates/cart.liquid': source } },
        templateName: 'cart',
        data,
        cart: state([line(BLACK_SUNNIES, 1), line(HOODIE, 1, { Engraving: 'Hi' }), line(SLIDES_SMALL, 1, { size: 'XL' })])
      })
      expect(html.html).toBe('null|shown|null|XL|Hi')
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
    it('sells none of a variant the data marks unavailable, tracked or not', () => {
      const variant = { id: 1, title: 'x', price: 100, available: false }
      expect(stockFor(variant)).toBe(0)
      expect(stockFor({ ...variant, inventory_management: 'shopify', inventory_policy: 'continue' })).toBe(0)
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

/** Line-key hashes differ between Shopify and the engine; the fixture keeps `<hash>`. */
function normaliseKeys (value: unknown): unknown {
  return JSON.parse(JSON.stringify(value).replace(/(\d+):[0-9a-f]{32}/g, '$1:<hash>'))
}
