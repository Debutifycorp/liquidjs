import { cartJson, discountCodeStatus, findVariant, lineKey, storefrontSampleData as data } from '../../../src/shopify'
import type { StoreData } from '../../../src/shopify'
import { nestFields } from '../../../src/storefront/body'
import { addToCart, changeCart, clearCart, NEW_LINES_FIRST, updateCart } from '../../../src/storefront/cart'
import type { CartResult } from '../../../src/storefront/cart'
import { DEFAULT_LIMITS } from '../../../src/storefront/types'
import type { StorefrontLimits, VisitorState } from '../../../src/storefront/types'
import { emptyVisitor } from '../../../src/storefront/visitor'
import { loadFixture } from '../fixtures'
import { stepFields } from './steps'

const GREEN = 43695847538710 // Hoodie, Green / Small, 42 in stock
const RED_MEDIUM = 43695846653974 // Hoodie, Red / Medium, 50 in stock
const SOLD_OUT = 43695847145494 // Hoodie, Clay / Small, none left
const THREE_LEFT = 43696926949398 // Sweatpants, Small / Green, 3 in stock
const SLIDES = 43695710371862 // sold under the selling plans 71001 and 71002
const PLAN_ONLY = 43696935600150 // frontpack, sold only under the selling plan 71003
const CONTINUE = 43696963485718 // tracked, sells past zero stock
const OPEN = 43696940613654 // Black sunnies, Default Title, 45 in stock

// the hash of a line key, the token, and what the parity store makes anew for a discount application (its creation time and its key) are masked on both sides
const strip = (value: unknown) => JSON.parse(JSON.stringify(value).replace(/(\d+):[0-9a-f]{32}/g, '$1:<hash>').replace(/"token":"[^"]*"/g, '"token":"<token>"').replace(/"created_at":"[^"]*"/g, '"created_at":"<volatile>"').replace(/"key":"[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}"/g, '"key":"<uuid>"'))

type Op = typeof addToCart

function ok (result: CartResult): Extract<CartResult, { ok: true }> {
  if (!result.ok) throw new Error(`cart operation failed: ${JSON.stringify(result.error)}`)
  return result
}

function fails (result: CartResult): Extract<CartResult, { ok: false }>['error'] {
  if (result.ok) throw new Error('cart operation succeeded')
  return result.error
}

/** The state after the adds, each `[variant, quantity, extra fields]` in order. */
function cartOf (...adds: Array<[number, number, Record<string, unknown>?]>): VisitorState {
  let state = emptyVisitor('t')
  for (const [id, quantity, extra] of adds) state = ok(addToCart(state, { id, quantity, ...extra }, data, DEFAULT_LIMITS)).state
  return state
}

const ids = (state: VisitorState) => state.cart.lines.map(line => [line.variantId, line.quantity])

function deepFreeze<T> (value: T): T {
  if (value && typeof value === 'object') for (const inner of Object.values(value)) deepFreeze(inner)
  return Object.freeze(value)
}

describe('adding to the cart', () => {
  it('puts new lines first, as the parity store does, and says so', () => {
    const session = loadFixture('ajax-cart-session').steps
    const added = session[4].json as { items: Array<{ id: number }> }
    const listed = (session[5].body as { items: Array<{ id: number }> }).items
    expect(listed[0].id).toBe(added.items[0].id)
    expect(NEW_LINES_FIRST).toBe(true)
    const state = cartOf([GREEN, 1], [RED_MEDIUM, 1])
    expect(ids(state)).toEqual([[RED_MEDIUM, 1], [GREEN, 1]])
  })

  it('lists the items of one call in reverse, and answers them in the order of the request', () => {
    // `ajax-discount-codes`, step 0: four items; step 8, `cart.js`: the same four in reverse
    const result = ok(addToCart(emptyVisitor('t'), { items: [{ id: GREEN, quantity: 2 }, { id: RED_MEDIUM }, { id: OPEN }] }, data, DEFAULT_LIMITS))
    expect(ids(result.state)).toEqual([[OPEN, 1], [RED_MEDIUM, 1], [GREEN, 2]])
    expect(result.lines.map(line => line.variantId)).toEqual([GREEN, RED_MEDIUM, OPEN])
  })

  it('merges a line with the same variant, properties and selling plan, and splits any other', () => {
    // `ajax-cart-session`, steps 1 to 4
    let state = cartOf([GREEN, 1], [GREEN, 2])
    expect(ids(state)).toEqual([[GREEN, 3]])
    state = ok(addToCart(state, { id: GREEN, quantity: 1, properties: { Engraving: 'Hi' } }, data, DEFAULT_LIMITS)).state
    state = ok(addToCart(state, { id: SLIDES, selling_plan: 71001 }, data, DEFAULT_LIMITS)).state
    expect(state.cart.lines.map(line => [line.variantId, line.quantity, line.properties, line.sellingPlanId])).toEqual([
      [SLIDES, 1, {}, 71001],
      [GREEN, 1, { Engraving: 'Hi' }, null],
      [GREEN, 3, {}, null]
    ])
    // the same properties in another order are the same line
    const a = ok(addToCart(emptyVisitor('t'), { id: GREEN, properties: { a: '1', b: '2' } }, data, DEFAULT_LIMITS)).state
    const b = ok(addToCart(a, { id: GREEN, properties: { b: '2', a: '1' } }, data, DEFAULT_LIMITS))
    expect(ids(b.state)).toEqual([[GREEN, 2]])
    expect(b.lines).toHaveLength(1)
    expect(b.lines[0].quantity).toBe(2)
  })

  it('answers the merged line, not the quantity added', () => {
    // `ajax-cart-session`, step 2: one more of a line of one, the answer holds a quantity of 3
    const state = cartOf([GREEN, 1])
    const result = ok(addToCart(state, { id: GREEN, quantity: 2 }, data, DEFAULT_LIMITS))
    expect(result.lines).toEqual([expect.objectContaining({ variantId: GREEN, quantity: 3 })])
  })

  it('reads a form, whose fields are all strings', () => {
    // `ajax-cart-form-add`, step 0
    const fields = nestFields(Object.entries(loadFixture('ajax-cart-form-add').steps[0].form ?? {}))
    const result = ok(addToCart(emptyVisitor('t'), fields, data, DEFAULT_LIMITS))
    expect(ids(result.state)).toEqual([[OPEN, 1]])
    const nested = nestFields([['items[0][id]', String(GREEN)], ['items[0][quantity]', '2'], ['items[0][properties][Engraving]', 'Hi'], ['items[0][selling_plan]', '']])
    expect(ok(addToCart(emptyVisitor('t'), nested, data, DEFAULT_LIMITS)).state.cart.lines).toEqual([{ variantId: GREEN, quantity: 2, properties: { Engraving: 'Hi' }, sellingPlanId: null }])
  })

  it('adds one of the item when the quantity is absent or blank', () => {
    expect(ids(ok(addToCart(emptyVisitor('t'), { id: GREEN }, data, DEFAULT_LIMITS)).state)).toEqual([[GREEN, 1]])
    expect(ids(ok(addToCart(emptyVisitor('t'), { id: GREEN, quantity: '' }, data, DEFAULT_LIMITS)).state)).toEqual([[GREEN, 1]])
  })

  it('answers "Cannot find variant" for an item it cannot read as a variant of the store', () => {
    const body = { status: 422, message: 'Cart Error', description: 'Cannot find variant' }
    for (const fields of [{}, { id: 'abc' }, { id: 1.5 }, { id: null }, { id: 7 }, { items: [] }, { items: [null] }, { items: ['x'] }, { items: [[GREEN]] }, { items: {} }]) {
      expect(fails(addToCart(emptyVisitor('t'), fields, data, DEFAULT_LIMITS))).toEqual({ status: 422, body })
    }
  })

  it('rejects a quantity that is not a whole number from 1 to the limit', () => {
    for (const quantity of [0, -1, 'abc', 1.5, '2.5', DEFAULT_LIMITS.quantity + 1, {}, [1]]) {
      expect(fails(addToCart(emptyVisitor('t'), { id: CONTINUE, quantity }, data, DEFAULT_LIMITS)).status).toBe(422)
    }
    expect(ids(ok(addToCart(emptyVisitor('t'), { id: CONTINUE, quantity: DEFAULT_LIMITS.quantity }, data, DEFAULT_LIMITS)).state)).toEqual([[CONTINUE, 9999]])
    // a line cannot grow past the limit by merging either
    const full = cartOf([CONTINUE, 9999])
    expect(fails(addToCart(full, { id: CONTINUE, quantity: 1 }, data, DEFAULT_LIMITS)).body.description).toBe('A line can hold at most 9999 items.')
  })

  it('adds all the items or none', () => {
    const before = cartOf([GREEN, 1])
    const frozen = deepFreeze(structuredClone(before))
    const error = fails(addToCart(frozen, { items: [{ id: RED_MEDIUM }, { id: SOLD_OUT }] }, data, DEFAULT_LIMITS))
    expect(error.body.description).toBe("The product 'Hoodie - Clay / Small' is already sold out.")
    expect(frozen).toEqual(before)
  })

  describe('stock', () => {
    const name = (id: number) => { const found = findVariant(data, id); return `${found?.product.title} - ${found?.variant.title}` }

    it('answers a sold out variant and one asked for past its stock, as recorded', () => {
      // `ajax-cart-errors`, steps 0 and 1
      expect(fails(addToCart(emptyVisitor('t'), { id: SOLD_OUT }, data, DEFAULT_LIMITS)).body).toEqual({ status: 422, message: "The product 'Hoodie - Clay / Small' is already sold out.", description: "The product 'Hoodie - Clay / Small' is already sold out." })
      expect(fails(addToCart(emptyVisitor('t'), { id: THREE_LEFT, quantity: 9 }, data, DEFAULT_LIMITS)).body).toEqual({ status: 422, message: 'Only 3 items were added to your cart due to availability.', description: 'Only 3 items were added to your cart due to availability.' })
      expect(ids(ok(addToCart(emptyVisitor('t'), { id: THREE_LEFT, quantity: 3 }, data, DEFAULT_LIMITS)).state)).toEqual([[THREE_LEFT, 3]])
    })

    it('counts the stock across every line of the variant, and what is left', () => {
      const state = cartOf([THREE_LEFT, 1], [THREE_LEFT, 1, { properties: { a: 'b' } }])
      expect(fails(addToCart(state, { id: THREE_LEFT, quantity: 2 }, data, DEFAULT_LIMITS)).body.description).toBe('Only 1 item was added to your cart due to availability.')
      expect(fails(addToCart(state, { items: [{ id: THREE_LEFT }, { id: THREE_LEFT, properties: { c: 'd' } }] }, data, DEFAULT_LIMITS)).body.description).toBe(`You can't add more ${name(THREE_LEFT)} to the cart.`)
    })

    it('answers shopify.dev\'s text when the cart holds all the stock', () => {
      // https://shopify.dev/docs/api/ajax/reference/cart#post-locale-cart-add-js: "You can't add more #{item.name} to the cart." with the message `Cart Error`
      const state = cartOf([THREE_LEFT, 3])
      expect(fails(addToCart(state, { id: THREE_LEFT }, data, DEFAULT_LIMITS))).toEqual({ status: 422, body: { status: 422, message: 'Cart Error', description: `You can't add more ${name(THREE_LEFT)} to the cart.` } })
    })

    it('does not limit a variant that sells past zero stock or is not tracked', () => {
      expect(ids(ok(addToCart(emptyVisitor('t'), { id: CONTINUE, quantity: 500 }, data, DEFAULT_LIMITS)).state)).toEqual([[CONTINUE, 500]])
    })
  })

  describe('selling plans', () => {
    it('adds a variant under a plan it is sold under, as a line of its own', () => {
      const result = ok(addToCart(cartOf([SLIDES, 1]), { id: SLIDES, selling_plan: '71002' }, data, DEFAULT_LIMITS))
      expect(result.state.cart.lines.map(line => [line.quantity, line.sellingPlanId])).toEqual([[1, 71002], [1, null]])
      expect(ids(ok(addToCart(emptyVisitor('t'), { id: PLAN_ONLY, selling_plan: 71003 }, data, DEFAULT_LIMITS)).state)).toEqual([[PLAN_ONLY, 1]])
      expect(ok(addToCart(emptyVisitor('t'), { id: SLIDES, selling_plan: '' }, data, DEFAULT_LIMITS)).state.cart.lines[0].sellingPlanId).toBeNull()
    })

    it('refuses a plan the variant is not sold under, or one that is not a plan', () => {
      const body = { status: 422, message: 'Cart Error', description: 'Cannot apply selling plan to variant' }
      for (const plan of [71003, 1, 'abc', 1.5, {}]) expect(fails(addToCart(emptyVisitor('t'), { id: SLIDES, selling_plan: plan }, data, DEFAULT_LIMITS))).toEqual({ status: 422, body })
      expect(fails(addToCart(emptyVisitor('t'), { id: GREEN, selling_plan: 71001 }, data, DEFAULT_LIMITS)).body).toEqual(body)
    })

    it('refuses a plan whose group lists other variants', () => {
      const hoodie = data.products?.find(product => product.variants.some(variant => variant.id === GREEN))
      if (!hoodie) throw new Error('no hoodie')
      const plan = { id: 9001, name: 'Monthly', options: ['Monthly'], recurring_deliveries: true, price_adjustments: [] }
      const custom: StoreData = { ...data, products: [{ ...hoodie, selling_plan_groups: [{ id: 'g', name: 'Delivery', options: [{ name: 'Every', values: ['Monthly'] }], selling_plans: [plan], variant_ids: [RED_MEDIUM] }] }] }
      expect(ids(ok(addToCart(emptyVisitor('t'), { id: RED_MEDIUM, selling_plan: 9001 }, custom, DEFAULT_LIMITS)).state)).toEqual([[RED_MEDIUM, 1]])
      expect(fails(addToCart(emptyVisitor('t'), { id: GREEN, selling_plan: 9001 }, custom, DEFAULT_LIMITS)).body.description).toBe('Cannot apply selling plan to variant')
    })

    it('needs a plan for a product that requires one', () => {
      expect(fails(addToCart(emptyVisitor('t'), { id: PLAN_ONLY }, data, DEFAULT_LIMITS)).body.description).toBe('Variant can only be purchased with a selling plan.')
      expect(fails(addToCart(emptyVisitor('t'), { id: PLAN_ONLY, selling_plan: '' }, data, DEFAULT_LIMITS)).body.description).toBe('Variant can only be purchased with a selling plan.')
    })
  })

  describe('limits', () => {
    it('holds the lines, and still merges into a line at the limit', () => {
      const limits: StorefrontLimits = { ...DEFAULT_LIMITS, lines: 2 }
      let state = ok(addToCart(emptyVisitor('t'), { items: [{ id: GREEN }, { id: RED_MEDIUM }] }, data, limits)).state
      expect(fails(addToCart(state, { id: OPEN }, data, limits)).body.description).toBe('The cart can hold at most 2 lines.')
      expect(fails(addToCart(state, { id: GREEN, properties: { a: 'b' } }, data, limits)).status).toBe(422)
      state = ok(addToCart(state, { id: GREEN }, data, limits)).state
      expect(ids(state)).toEqual([[RED_MEDIUM, 1], [GREEN, 2]])
      expect(fails(addToCart(emptyVisitor('t'), { items: [{ id: GREEN }, { id: GREEN }, { id: GREEN }] }, data, limits)).status).toBe(422)
    })

    it('holds the properties: their number, their length, and what they can be', () => {
      const limits: StorefrontLimits = { ...DEFAULT_LIMITS, properties: 2, propertyLength: 4 }
      expect(fails(addToCart(emptyVisitor('t'), { id: GREEN, properties: { a: '1', b: '2', c: '3' } }, data, limits)).status).toBe(422)
      expect(fails(addToCart(emptyVisitor('t'), { id: GREEN, properties: { toolong: '1' } }, data, limits)).status).toBe(422)
      expect(fails(addToCart(emptyVisitor('t'), { id: GREEN, properties: { a: '12345' } }, data, limits)).status).toBe(422)
      // exactly at the limits is fine; numbers and booleans are written out, objects and lists dropped
      const state = ok(addToCart(emptyVisitor('t'), { id: GREEN, properties: { abcd: '1234', n: 7, flag: true, nested: { a: '1' }, list: ['1'] } }, data, { ...limits, properties: 5 })).state
      expect(state.cart.lines[0].properties).toEqual({ abcd: '1234', n: '7', flag: 'true' })
    })

    it('reads properties given as something else as none', () => {
      for (const properties of ['x', 3, null, ['a']]) expect(ok(addToCart(emptyVisitor('t'), { id: GREEN, properties }, data, DEFAULT_LIMITS)).state.cart.lines[0].properties).toEqual({})
    })

    it('holds no more items in a request than the cart has lines', () => {
      const limits: StorefrontLimits = { ...DEFAULT_LIMITS, lines: 3 }
      expect(fails(addToCart(emptyVisitor('t'), { items: Array.from({ length: 4 }, () => ({ id: GREEN })) }, data, limits)).status).toBe(422)
      expect(ids(ok(addToCart(emptyVisitor('t'), { items: Array.from({ length: 3 }, () => ({ id: GREEN })) }, data, limits)).state)).toEqual([[GREEN, 3]])
    })
  })

  it('reads named fields only, whatever else a form names', () => {
    // a field named `toString` becomes an own string property of the fields
    const fields = nestFields([['id', String(GREEN)], ['toString', 'x'], ['valueOf', 'y'], ['hasOwnProperty', 'z'], ['quantity', '2']])
    expect(ids(ok(addToCart(emptyVisitor('t'), fields, data, DEFAULT_LIMITS)).state)).toEqual([[GREEN, 2]])
  })

  it('leaves a property named __proto__ out and the prototypes alone', () => {
    const properties = JSON.parse('{"__proto__": "x", "a": "1"}')
    const state = ok(addToCart(emptyVisitor('t'), { id: GREEN, properties }, data, DEFAULT_LIMITS)).state
    expect(state.cart.lines[0].properties).toEqual({ a: '1' })
    expect(Object.getPrototypeOf(state.cart.lines[0].properties)).toBe(Object.prototype)
  })
})

describe('changing the cart', () => {
  it('changes the line a position names', () => {
    const state = cartOf([GREEN, 1], [RED_MEDIUM, 1])
    expect(ids(ok(changeCart(state, { line: 2, quantity: 5 }, data, DEFAULT_LIMITS)).state)).toEqual([[RED_MEDIUM, 1], [GREEN, 5]])
    expect(ids(ok(changeCart(state, { line: '1', quantity: '4' }, data, DEFAULT_LIMITS)).state)).toEqual([[RED_MEDIUM, 4], [GREEN, 1]])
  })

  it('changes the one line a key names, and every line of a variant a variant id names', () => {
    // `ajax-cart-session`, step 7: both lines of the hoodie went to 4
    const state = cartOf([GREEN, 1, { properties: { Engraving: 'Hi' } }], [GREEN, 3], [SLIDES, 1])
    const plain = state.cart.lines.find(line => Object.keys(line.properties).length === 0 && line.variantId === GREEN)
    if (!plain) throw new Error('no plain line')
    expect(ids(ok(changeCart(state, { id: lineKey(plain), quantity: 7 }, data, DEFAULT_LIMITS)).state)).toEqual([[SLIDES, 1], [GREEN, 7], [GREEN, 1]])
    expect(ids(ok(changeCart(state, { id: String(GREEN), quantity: 4 }, data, DEFAULT_LIMITS)).state)).toEqual([[SLIDES, 1], [GREEN, 4], [GREEN, 4]])
  })

  it('answers the recorded bad requests, and shopify.dev\'s for a line that is not in the cart', () => {
    const state = cartOf([GREEN, 1])
    // `ajax-cart-errors`, steps 4 and 8
    expect(fails(changeCart(state, { line: 9, quantity: 1 }, data, DEFAULT_LIMITS))).toEqual({ status: 422, body: { status: 'unprocessable_entity', message: 'line parameter is invalid.', description: 'line parameter is invalid.' } })
    const badId = fails(changeCart(state, { id: GREEN, quantity: 4 }, data, DEFAULT_LIMITS))
    expect(badId.status).toBe(400)
    expect(badId.body.status).toBe('bad_request')
    // https://shopify.dev/docs/api/ajax/reference/cart#post-locale-cart-change-js: a 400 with "no valid id or line parameter" where the item is not in the cart
    const noLine = { status: 400, body: { status: 'bad_request', message: 'no valid id or line parameter', description: 'no valid id or line parameter' } }
    expect(fails(changeCart(state, { id: String(RED_MEDIUM), quantity: 1 }, data, DEFAULT_LIMITS))).toEqual(noLine)
    expect(fails(changeCart(state, { id: `${RED_MEDIUM}:${'a'.repeat(32)}`, quantity: 1 }, data, DEFAULT_LIMITS))).toEqual(noLine)
    expect(fails(changeCart(state, { quantity: 1 }, data, DEFAULT_LIMITS))).toEqual(noLine)
    expect(fails(changeCart(state, { id: '', quantity: 1 }, data, DEFAULT_LIMITS))).toEqual(noLine)
    for (const line of [0, -1, 'x', 1.5, 2]) expect(fails(changeCart(state, { line, quantity: 1 }, data, DEFAULT_LIMITS)).body.status).toBe('unprocessable_entity')
    for (const id of ['abc', '12 34', `${GREEN}:short`, [GREEN], {}, true]) expect(fails(changeCart(state, { id, quantity: 1 }, data, DEFAULT_LIMITS)).body).toEqual(badId.body)
  })

  it('takes the line over the id when both are named', () => {
    const state = cartOf([GREEN, 1], [RED_MEDIUM, 1])
    expect(ids(ok(changeCart(state, { line: 1, id: String(GREEN), quantity: 9 }, data, DEFAULT_LIMITS)).state)).toEqual([[RED_MEDIUM, 9], [GREEN, 1]])
  })

  it('removes a line at quantity 0, keeps the quantity when none is given, and refuses one that is not a whole number', () => {
    const state = cartOf([GREEN, 2], [RED_MEDIUM, 3])
    expect(ids(ok(changeCart(state, { line: 1, quantity: 0 }, data, DEFAULT_LIMITS)).state)).toEqual([[GREEN, 2]])
    expect(ids(ok(changeCart(state, { line: 1 }, data, DEFAULT_LIMITS)).state)).toEqual([[RED_MEDIUM, 3], [GREEN, 2]])
    expect(ids(ok(changeCart(state, { line: 1, quantity: '' }, data, DEFAULT_LIMITS)).state)).toEqual([[RED_MEDIUM, 3], [GREEN, 2]])
    for (const quantity of [-1, 'abc', 1.5, DEFAULT_LIMITS.quantity + 1]) expect(fails(changeCart(state, { line: 1, quantity }, data, DEFAULT_LIMITS)).status).toBe(422)
    expect(ok(changeCart(cartOf([GREEN, 1]), { line: 1, quantity: 0 }, data, DEFAULT_LIMITS)).state.cart.lines).toEqual([])
  })

  it('holds the stock of the variant across all the lines it sets', () => {
    const state = cartOf([GREEN, 1], [GREEN, 1, { properties: { a: 'b' } }])
    // 42 in stock: two lines of 21 fit, two of 22 do not
    expect(ids(ok(changeCart(state, { id: String(GREEN), quantity: 21 }, data, DEFAULT_LIMITS)).state)).toEqual([[GREEN, 21], [GREEN, 21]])
    expect(fails(changeCart(state, { id: String(GREEN), quantity: 22 }, data, DEFAULT_LIMITS)).status).toBe(422)
    // and what another line holds counts too
    expect(fails(changeCart(state, { line: 1, quantity: 42 }, data, DEFAULT_LIMITS)).body.description).toBe('Only 41 items were added to your cart due to availability.')
    expect(ids(ok(changeCart(state, { line: 1, quantity: 41 }, data, DEFAULT_LIMITS)).state)).toEqual([[GREEN, 41], [GREEN, 1]])
  })

  it('overwrites the properties, but leaves them when the object is empty', () => {
    // https://shopify.dev/docs/api/ajax/reference/cart#post-locale-cart-change-js: "it overwrites the entire properties object", and an empty one cannot clear them
    const state = cartOf([GREEN, 1, { properties: { a: '1', b: '2' } }])
    expect(ok(changeCart(state, { line: 1, quantity: 1, properties: { c: '3' } }, data, DEFAULT_LIMITS)).state.cart.lines[0].properties).toEqual({ c: '3' })
    expect(ok(changeCart(state, { line: 1, quantity: 1, properties: {} }, data, DEFAULT_LIMITS)).state.cart.lines[0].properties).toEqual({ a: '1', b: '2' })
    expect(fails(changeCart(state, { line: 1, quantity: 1, properties: { a: 'x'.repeat(256) } }, data, DEFAULT_LIMITS)).status).toBe(422)
  })

  it('merges a line that a change makes the same as another', () => {
    const state = cartOf([GREEN, 2, { properties: { x: '1' } }], [GREEN, 1, { properties: { a: 'b' } }])
    const merged = ok(changeCart(state, { line: 1, quantity: 3, properties: { x: '1' } }, data, DEFAULT_LIMITS))
    expect(merged.state.cart.lines).toEqual([{ variantId: GREEN, quantity: 5, properties: { x: '1' }, sellingPlanId: null }])
    const planned = cartOf([SLIDES, 2], [SLIDES, 1, { selling_plan: 71001 }])
    expect(ids(ok(changeCart(planned, { line: 1, quantity: 1, selling_plan: '' }, data, DEFAULT_LIMITS)).state)).toEqual([[SLIDES, 3]])
    const apart = ok(changeCart(state, { line: 1, quantity: 5, properties: { y: '1' } }, data, DEFAULT_LIMITS))
    expect(ids(apart.state)).toEqual([[GREEN, 5], [GREEN, 2]])
    expect(fails(changeCart(cartOf([CONTINUE, 9999, { properties: { x: '1' } }], [CONTINUE, 1]), { line: 1, quantity: 1, properties: { x: '1' } }, data, DEFAULT_LIMITS)).status).toBe(422)
  })

  it('sets and removes the selling plan, and takes the quantity as 1 when a plan is set without one', () => {
    // https://shopify.dev/docs/api/ajax/reference/cart#post-locale-cart-change-js: "null or an empty string: To remove any selling plan", "If the quantity isn't specified, then it's assumed to be 1"
    const state = cartOf([SLIDES, 3])
    const planned = ok(changeCart(state, { line: 1, selling_plan: 71001 }, data, DEFAULT_LIMITS)).state
    expect(planned.cart.lines).toEqual([{ variantId: SLIDES, quantity: 1, properties: {}, sellingPlanId: 71001 }])
    const kept = ok(changeCart(state, { line: 1, quantity: 3, selling_plan: '71002' }, data, DEFAULT_LIMITS)).state
    expect(kept.cart.lines[0]).toMatchObject({ quantity: 3, sellingPlanId: 71002 })
    expect(ok(changeCart(kept, { line: 1, quantity: 3, selling_plan: null }, data, DEFAULT_LIMITS)).state.cart.lines[0].sellingPlanId).toBeNull()
    expect(ok(changeCart(kept, { line: 1, quantity: 3, selling_plan: '' }, data, DEFAULT_LIMITS)).state.cart.lines[0].sellingPlanId).toBeNull()
    expect(fails(changeCart(state, { line: 1, quantity: 3, selling_plan: 71003 }, data, DEFAULT_LIMITS)).body.description).toBe('Cannot apply selling plan to variant')
    const required = cartOf([PLAN_ONLY, 1, { selling_plan: 71003 }])
    expect(fails(changeCart(required, { line: 1, quantity: 1, selling_plan: '' }, data, DEFAULT_LIMITS)).body.description).toBe('Variant can only be purchased with a selling plan.')
  })

  it('changes nothing when it fails', () => {
    const state = deepFreeze(cartOf([GREEN, 1], [RED_MEDIUM, 1]))
    const copy = structuredClone(state)
    fails(changeCart(state, { id: String(GREEN), quantity: 99 }, data, DEFAULT_LIMITS))
    expect(state).toEqual(copy)
    expect(ok(changeCart(state, { line: 1, quantity: 2 }, data, DEFAULT_LIMITS)).state).not.toBe(state)
    expect(state).toEqual(copy)
  })

  it('lets a line whose variant the store no longer sells be removed, but not changed', () => {
    const stale: VisitorState = { cart: { ...emptyVisitor('t').cart, lines: [{ variantId: 1, quantity: 2, properties: {}, sellingPlanId: null }] } }
    expect(fails(changeCart(stale, { line: 1, quantity: 3 }, data, DEFAULT_LIMITS)).body.description).toBe('Cannot find variant')
    expect(ok(changeCart(stale, { line: 1, quantity: 0 }, data, DEFAULT_LIMITS)).state.cart.lines).toEqual([])
  })
})

describe('updating the cart', () => {
  it('sets lines by position, from the last, and leaves the lines an array does not reach', () => {
    // `ajax-cart-session`, step 9
    const state = cartOf([GREEN, 4], [RED_MEDIUM, 3], [OPEN, 2])
    expect(ids(ok(updateCart(state, { updates: [1, 2, 3] }, data, DEFAULT_LIMITS)).state)).toEqual([[OPEN, 1], [RED_MEDIUM, 2], [GREEN, 3]])
    expect(ids(ok(updateCart(state, { updates: [0, 5] }, data, DEFAULT_LIMITS)).state)).toEqual([[RED_MEDIUM, 5], [GREEN, 4]])
    expect(ids(ok(updateCart(state, { updates: ['1', ''] }, data, DEFAULT_LIMITS)).state)).toEqual([[OPEN, 1], [RED_MEDIUM, 3], [GREEN, 4]])
    expect(fails(updateCart(state, { updates: [1, 1, 1, 1] }, data, DEFAULT_LIMITS)).body.status).toBe('unprocessable_entity')
    expect(fails(updateCart(state, { updates: [1, 'x'] }, data, DEFAULT_LIMITS)).status).toBe(422)
    expect(fails(updateCart(state, { updates: [-1] }, data, DEFAULT_LIMITS)).status).toBe(422)
  })

  it('updates the first line of a variant by variant id and a line by its key', () => {
    // https://shopify.dev/docs/api/ajax/reference/cart#post-locale-cart-update-js: "if the variant_id matches multiple line items, then the first matching line item is updated"
    const state = cartOf([GREEN, 1, { properties: { a: 'b' } }], [GREEN, 3], [RED_MEDIUM, 1])
    expect(ids(ok(updateCart(state, { updates: { [GREEN]: 6 } }, data, DEFAULT_LIMITS)).state)).toEqual([[RED_MEDIUM, 1], [GREEN, 6], [GREEN, 1]])
    const second = state.cart.lines[2]
    expect(ids(ok(updateCart(state, { updates: { [lineKey(second)]: 6, [RED_MEDIUM]: 0 } }, data, DEFAULT_LIMITS)).state)).toEqual([[GREEN, 3], [GREEN, 6]])
  })

  it('adds a variant that is not in the cart as the first line, and ignores a quantity of 0 for one', () => {
    // `ajax-cart-session`, step 8
    const state = cartOf([GREEN, 1])
    const result = ok(updateCart(state, { updates: { [OPEN]: 2, [RED_MEDIUM]: 0 }, note: 'Gift wrap', attributes: { gift: 'yes' } }, data, DEFAULT_LIMITS))
    expect(ids(result.state)).toEqual([[OPEN, 2], [GREEN, 1]])
    expect(result.state.cart).toMatchObject({ note: 'Gift wrap', attributes: { gift: 'yes' } })
    expect(ids(ok(updateCart(state, { updates: { 123: 0 } }, data, DEFAULT_LIMITS)).state)).toEqual([[GREEN, 1]])
  })

  it('answers "Cannot find variant" for a variant the store lacks, even at the same time as other updates', () => {
    // `ajax-cart-errors`, step 5
    const state = cartOf([GREEN, 1])
    expect(fails(updateCart(state, { updates: { 1: 1 } }, data, DEFAULT_LIMITS))).toEqual({ status: 422, body: { status: 422, message: 'Cart Error', description: 'Cannot find variant' } })
    expect(fails(updateCart(state, { updates: { [GREEN]: 2, [`${RED_MEDIUM}:${'a'.repeat(32)}`]: 1 }, note: 'x' }, data, DEFAULT_LIMITS)).body.description).toBe('Cannot find variant')
    expect(fails(updateCart(state, { updates: { [GREEN]: 'x' } }, data, DEFAULT_LIMITS)).status).toBe(422)
    expect(fails(updateCart(state, { updates: { [GREEN]: -1 } }, data, DEFAULT_LIMITS)).status).toBe(422)
  })

  it('does not check the stock of a variant already in the cart, but checks one it adds', () => {
    // https://shopify.dev/docs/api/ajax/reference/cart#post-locale-cart-update-js: "The update.js endpoint doesn't validate the quantity on variants that are already in the cart"
    const state = cartOf([THREE_LEFT, 1])
    expect(ids(ok(updateCart(state, { updates: [8] }, data, DEFAULT_LIMITS)).state)).toEqual([[THREE_LEFT, 8]])
    expect(ids(ok(updateCart(state, { updates: { [THREE_LEFT]: 8 } }, data, DEFAULT_LIMITS)).state)).toEqual([[THREE_LEFT, 8]])
    expect(fails(updateCart(state, { updates: { [RED_MEDIUM]: 51 } }, data, DEFAULT_LIMITS)).body.description).toBe('Only 50 items were added to your cart due to availability.')
    expect(fails(updateCart(state, { updates: [DEFAULT_LIMITS.quantity + 1] }, data, DEFAULT_LIMITS)).status).toBe(422)
  })

  it('sets the note and the attributes, and removes an attribute set to nothing', () => {
    const state = ok(updateCart(emptyVisitor('t'), { note: 'Hi', attributes: { gift: 'yes', size: 3, wrap: true, nested: { a: 1 } } }, data, DEFAULT_LIMITS)).state
    expect(state.cart).toMatchObject({ note: 'Hi', attributes: { gift: 'yes', size: '3', wrap: 'true' } })
    expect(state.cart.attributes).not.toHaveProperty('nested')
    const next = ok(updateCart(state, { attributes: { gift: '', size: null, color: 'red' } }, data, DEFAULT_LIMITS)).state
    expect(next.cart.attributes).toEqual({ wrap: 'true', color: 'red' })
    expect(ok(updateCart(next, {}, data, DEFAULT_LIMITS)).state.cart).toMatchObject({ note: 'Hi', attributes: { wrap: 'true', color: 'red' } })
    expect(ok(updateCart(next, { note: '' }, data, DEFAULT_LIMITS)).state.cart.note).toBe('')
    expect(ok(updateCart(emptyVisitor('t'), { note: null }, data, DEFAULT_LIMITS)).state.cart.note).toBe('')
    expect(ok(updateCart(next, { note: { a: 1 } }, data, DEFAULT_LIMITS)).state.cart.note).toBe('Hi')
  })

  it('bounds the attributes and the discount codes', () => {
    const limits: StorefrontLimits = { ...DEFAULT_LIMITS, properties: 2, propertyLength: 4 }
    const state = ok(updateCart(emptyVisitor('t'), { attributes: { a: '1', b: '2' } }, data, limits)).state
    expect(fails(updateCart(state, { attributes: { c: '3' } }, data, limits)).status).toBe(422)
    expect(ok(updateCart(state, { attributes: { c: '3', a: '' } }, data, limits)).state.cart.attributes).toEqual({ b: '2', c: '3' })
    expect(fails(updateCart(state, { attributes: { toolong: '3', a: '' } }, data, limits)).status).toBe(422)
    expect(ok(updateCart(emptyVisitor('t'), { discount: 'A,B' }, data, limits)).state.cart.discountCodes).toEqual(['A', 'B'])
    expect(fails(updateCart(emptyVisitor('t'), { discount: 'A,B,C' }, data, limits)).status).toBe(422)
    expect(fails(updateCart(emptyVisitor('t'), { discount: 'TOOLONG' }, data, limits)).status).toBe(422)
    // a name that could reach a prototype does not
    const polluted = ok(updateCart(emptyVisitor('t'), { attributes: JSON.parse('{"__proto__": "x", "a": "1"}') }, data, DEFAULT_LIMITS)).state
    expect(polluted.cart.attributes).toEqual({ a: '1' })
    expect(Object.getPrototypeOf(polluted.cart.attributes)).toBe(Object.prototype)
  })

  it('replaces the discount codes, trims them and empties them on an empty string', () => {
    // `ajax-discount-codes`, steps 1, 7 and 11
    let state = ok(updateCart(emptyVisitor('t'), { discount: 'FREESHIP, WELCOME10,,' }, data, DEFAULT_LIMITS)).state
    expect(state.cart.discountCodes).toEqual(['FREESHIP', 'WELCOME10'])
    state = ok(updateCart(state, { note: 'x' }, data, DEFAULT_LIMITS)).state
    expect(state.cart.discountCodes).toEqual(['FREESHIP', 'WELCOME10'])
    state = ok(updateCart(state, { discount: 'NOPE' }, data, DEFAULT_LIMITS)).state
    expect(state.cart.discountCodes).toEqual(['NOPE'])
    expect(ok(updateCart(state, { discount: '' }, data, DEFAULT_LIMITS)).state.cart.discountCodes).toEqual([])
    expect(ok(updateCart(state, { discount: null }, data, DEFAULT_LIMITS)).state.cart.discountCodes).toEqual([])
    expect(ok(updateCart(state, { discount: { a: 1 } }, data, DEFAULT_LIMITS)).state.cart.discountCodes).toEqual(['NOPE'])
  })

  it('changes nothing when one part of it fails', () => {
    const state = deepFreeze(cartOf([GREEN, 1]))
    const copy = structuredClone(state)
    expect(fails(updateCart(state, { updates: { [OPEN]: 1, 1: 1 }, note: 'x', discount: 'A' }, data, DEFAULT_LIMITS)).status).toBe(422)
    expect(fails(updateCart(state, { updates: { [OPEN]: 1 }, attributes: { toolongname: 'x' } }, data, { ...DEFAULT_LIMITS, propertyLength: 5 })).status).toBe(422)
    expect(state).toEqual(copy)
  })

  it('holds the number of keys an update names', () => {
    const limits: StorefrontLimits = { ...DEFAULT_LIMITS, lines: 2 }
    expect(fails(updateCart(emptyVisitor('t'), { updates: { [GREEN]: 1, [RED_MEDIUM]: 1, [OPEN]: 1 } }, data, limits)).status).toBe(422)
    expect(ids(ok(updateCart(emptyVisitor('t'), { updates: { [GREEN]: 1, [RED_MEDIUM]: 1 } }, data, limits)).state)).toEqual([[RED_MEDIUM, 1], [GREEN, 1]])
  })

  it('replays the discount codes as the parity store answers them', () => {
    // `ajax-discount-codes`, steps 0 to 12: the codes of every update answer, and the `cart.js` steps
    let state = emptyVisitor('<token>')
    let compared = 0
    for (const step of loadFixture('ajax-discount-codes').steps.slice(0, 13)) {
      const op = /\/cart\/(add|update)\.js/.exec(step.url)?.[1]
      if (step.url === '/cart.js') {
        expect(strip(cartJson(data, state.cart))).toEqual(strip(step.body))
        compared++
      } else if (op) {
        const result = ok((op === 'add' ? addToCart : updateCart)(state, stepFields(step), data, DEFAULT_LIMITS))
        state = result.state
        if (op === 'update') {
          expect(discountCodeStatus(data, state.cart)).toEqual((step.body as { discount_codes: unknown }).discount_codes)
          compared++
        }
      }
    }
    expect(compared).toBeGreaterThanOrEqual(8)
  })

  it('replays the form add, the update array and the change by line of a form', () => {
    // `ajax-cart-form-add`: `POST /cart/add`, `POST /cart` with `updates[]=3`, `GET /cart/change?line=1&quantity=0`, then `cart.js`
    const steps = loadFixture('ajax-cart-form-add').steps
    let state = ok(addToCart(emptyVisitor('<token>'), nestFields(Object.entries(steps[0].form ?? {})), data, DEFAULT_LIMITS)).state
    state = ok(updateCart(state, nestFields(Object.entries(steps[1].form ?? {})), data, DEFAULT_LIMITS)).state
    expect(ids(state)).toEqual([[OPEN, 3]])
    state = ok(changeCart(state, nestFields([...new URLSearchParams(steps[2].url.split('?')[1])]), data, DEFAULT_LIMITS)).state
    expect(strip(cartJson(data, state.cart))).toEqual(strip(steps[3].body))
  })
})

describe('clearing the cart', () => {
  it('empties the lines and keeps the rest, and gives an untouched cart its empty note', () => {
    const state = ok(updateCart(cartOf([GREEN, 1]), { note: 'Hi', attributes: { gift: 'yes' }, discount: 'A' }, data, DEFAULT_LIMITS)).state
    const cleared = ok(clearCart(state))
    expect(cleared.lines).toEqual([])
    expect(cleared.state.cart).toEqual({ ...state.cart, lines: [] })
    expect(ok(clearCart(emptyVisitor('t'))).state.cart.note).toBe('')
  })
})

describe('every operation', () => {
  it('leaves its input alone and keeps what else the visitor holds', () => {
    const start: VisitorState = { ...cartOf([GREEN, 2], [RED_MEDIUM, 1]), country: 'CA', language: 'fr', unlocked: true }
    start.cart.currency = 'CAD'
    const state = deepFreeze(start)
    const fieldsFor: Array<[Op, Record<string, unknown>]> = [
      [addToCart, { id: GREEN }],
      [changeCart, { line: 1, quantity: 3 }],
      [updateCart, { updates: [1, 1], note: 'x', attributes: { a: 'b' }, discount: 'A' }]
    ]
    for (const [op, fields] of fieldsFor) {
      const result = ok(op(state, deepFreeze(fields), data, DEFAULT_LIMITS))
      expect(result.state).toMatchObject({ country: 'CA', language: 'fr', unlocked: true })
      expect(result.state.cart).toMatchObject({ token: 't', currency: 'CAD' })
    }
    expect(ok(clearCart(state)).state).toMatchObject({ country: 'CA', language: 'fr', unlocked: true })
  })

  it('keeps the line keys of a cart unique and well formed', () => {
    let state = cartOf([GREEN, 1], [GREEN, 1, { properties: { a: '1' } }], [SLIDES, 1, { selling_plan: 71001 }], [SLIDES, 1])
    state = ok(changeCart(state, { line: 2, properties: { a: '1' } }, data, DEFAULT_LIMITS)).state
    const keys = state.cart.lines.map(lineKey)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of keys) expect(key).toMatch(/^\d+:[0-9a-f]{32}$/)
  })
})
