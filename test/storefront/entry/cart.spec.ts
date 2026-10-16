import { cartJson, storefrontSampleData as data } from '../../../src/shopify'
import { addToCart, changeCart, clearCart, updateCart } from '../../../src/storefront/cart'
import { DEFAULT_LIMITS } from '../../../src/storefront/types'
import { emptyVisitor } from '../../../src/storefront/visitor'
import type { VisitorState } from '../../../src/storefront/types'
import { loadFixture } from '../fixtures'
import { stepFields } from './steps'

const keys = (v: unknown) => JSON.parse(JSON.stringify(v).replace(/(\d+):[0-9a-f]{32}/g, '$1:<hash>').replace(/"token":"[^"]*"/g, '"token":"<token>"'))
const ops = { add: addToCart, change: changeCart, update: updateCart }

/** Replays the cart steps of a recorded session and checks each answer: cart errors by status and body, `cart.js` by its JSON. */
function replay (name: string): void {
  let state: VisitorState = emptyVisitor('<token>')
  for (const step of loadFixture(name).steps) {
    const op = /\/cart\/(add|change|update|clear)\.js/.exec(step.url)?.[1]
    if (step.url === '/cart.js') {
      expect([step.url, keys(cartJson(data, state.cart))]).toEqual([step.url, keys(step.body)])
      continue
    }
    // bundled sections are the Ajax unit's (Task 5); a step that asks for them is checked there
    if (!op || (step.json as { sections?: unknown } | undefined)?.sections !== undefined) continue
    const result = op === 'clear' ? clearCart(state) : ops[op as keyof typeof ops](state, stepFields(step), data, DEFAULT_LIMITS)
    if (step.status >= 400) {
      expect(result.ok).toBe(false)
      if (!result.ok) expect([step.url, result.error.status, result.error.body]).toEqual([step.url, step.status, step.body])
      continue
    }
    expect([step.url, result.ok]).toEqual([step.url, true])
    if (result.ok) state = result.state
  }
}

describe('cart operations', () => {
  it('replays the recorded session', () => replay('ajax-cart-session'))
  it('answers the recorded errors', () => replay('ajax-cart-errors'))
  it('keeps the note, attributes and codes on clear, as the recordings show', () => {
    // `ajax-cart-session`, steps 12 and 13: the note `Gift wrap` and the attribute `gift` stay; `ajax-discount-codes`, step 15: the code stays
    const start = updateCart(emptyVisitor('<token>'), { note: 'Hi', attributes: { gift: 'yes' }, discount: 'WELCOME10' }, data, DEFAULT_LIMITS)
    if (!start.ok) throw new Error('update failed')
    const cleared = clearCart(start.state)
    if (!cleared.ok) throw new Error('clear failed')
    expect(cleared.state.cart.lines).toEqual([])
    expect(cleared.state.cart).toMatchObject({ note: 'Hi', attributes: { gift: 'yes' }, discountCodes: ['WELCOME10'] })
  })
  it('sets the note to an empty string on the first change, where an untouched cart has none', () => {
    // `ajax-cart-session`: `note: null` at step 1, `""` from the first add on
    expect(emptyVisitor('t').cart.note).toBeNull()
    const added = addToCart(emptyVisitor('t'), { id: 43695847538710, quantity: 1 }, data, DEFAULT_LIMITS)
    if (!added.ok) throw new Error('add failed')
    expect(added.state.cart.note).toBe('')
  })
  it('holds the storefront\'s own limits', () => {
    const limits = { ...DEFAULT_LIMITS, lines: 1, quantity: 5, properties: 1, propertyLength: 3 }
    expect(addToCart(emptyVisitor('t'), { id: 43695847538710, quantity: 6 }, data, limits)).toMatchObject({ ok: false, error: { status: 422 } })
    const one = addToCart(emptyVisitor('t'), { id: 43695847538710, quantity: 1 }, data, limits)
    if (!one.ok) throw new Error('add failed')
    expect(addToCart(one.state, { id: 43695846653974, quantity: 1 }, data, limits)).toMatchObject({ ok: false, error: { status: 422 } })
    expect(addToCart(emptyVisitor('t'), { id: 43695847538710, properties: { a: '1', b: '2' } }, data, limits)).toMatchObject({ ok: false, error: { status: 422 } })
    expect(addToCart(emptyVisitor('t'), { id: 43695847538710, properties: { a: 'long' } }, data, limits)).toMatchObject({ ok: false, error: { status: 422 } })
  })
})
