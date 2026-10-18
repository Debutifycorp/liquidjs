import { cartJson, previewSampleData as data } from '../../../src/shopify'
import type { StoreData } from '../../../src/shopify'
import { addToCart, changeCart, updateCart } from '../../../src/storefront/cart'
import type { CartResult } from '../../../src/storefront/cart'
import { DEFAULT_LIMITS } from '../../../src/storefront/types'
import type { VisitorState } from '../../../src/storefront/types'
import { emptyVisitor } from '../../../src/storefront/visitor'

// the wholesale tee: a quantity rule of at least 5, at most 200, in steps of 5, and price breaks from 10 (2100), 25 (1800) and 50 (1500) units against a base price of 2400
const TEE_S = 8100000000021
const TEE_M = 8100000000022
const CANDLE = 8100000000031

const ok = (result: CartResult) => {
  if (!result.ok) throw new Error(`cart operation failed: ${JSON.stringify(result.error)}`)
  return result.state
}
const description = (result: CartResult) => result.ok ? undefined : result.error.body.description
const start = (...adds: Array<[number, number]>): VisitorState => adds.reduce((state, [id, quantity]) => ok(addToCart(state, { id, quantity }, data as StoreData, DEFAULT_LIMITS)), emptyVisitor('t'))
const add = (state: VisitorState, id: number, quantity: number) => addToCart(state, { id, quantity }, data as StoreData, DEFAULT_LIMITS)

describe('quantity rules in the cart', () => {
  it('refuses an add under the minimum, over the maximum and off the increment, each with a 422', () => {
    const under = add(emptyVisitor('t'), TEE_S, 1)
    expect(under.ok).toBe(false)
    expect(!under.ok && under.error.status).toBe(422)
    expect(description(under)).toBe('The quantity must be above the specified minimum for the item.')
    expect(description(add(emptyVisitor('t'), TEE_S, 7))).toBe('The quantity must be a multiple of the specified increment.')
    expect(description(add(emptyVisitor('t'), TEE_S, 205))).toBe('The quantity must be below the specified maximum for the item.')
  })

  it('takes a quantity that meets the rule, and holds the next add to the total the cart would have', () => {
    const state = start([TEE_S, 5])
    expect(state.cart.lines.map(line => line.quantity)).toEqual([5])
    expect(add(state, TEE_S, 3).ok).toBe(false)
    expect(ok(add(state, TEE_S, 5)).cart.lines[0].quantity).toBe(10)
    expect(description(add(start([TEE_S, 200]), TEE_S, 5))).toBe('The quantity must be below the specified maximum for the item.')
  })

  it('counts every line of a variant against its rule', () => {
    const state = ok(addToCart(emptyVisitor('t'), { id: TEE_S, quantity: 5, properties: { Gift: 'yes' } }, data as StoreData, DEFAULT_LIMITS))
    const two = ok(addToCart(state, { id: TEE_S, quantity: 5 }, data as StoreData, DEFAULT_LIMITS))
    expect(two.cart.lines.map(line => line.quantity)).toEqual([5, 5])
    expect(description(addToCart(two, { id: TEE_S, quantity: 3 }, data as StoreData, DEFAULT_LIMITS))).toBe('The quantity must be a multiple of the specified increment.')
  })

  it('leaves a variant with no rule alone', () => {
    expect(start([CANDLE, 1]).cart.lines[0].quantity).toBe(1)
  })

  it('holds change.js to the rule when it changes the quantity, and update.js to it only for a new line', () => {
    const state = start([TEE_S, 10])
    const key = 1
    expect(description(changeCart(state, { line: key, quantity: 3 }, data as StoreData, DEFAULT_LIMITS))).toBe('The quantity must be above the specified minimum for the item.')
    expect(description(changeCart(state, { line: key, quantity: 12 }, data as StoreData, DEFAULT_LIMITS))).toBe('The quantity must be a multiple of the specified increment.')
    expect(ok(changeCart(state, { line: key, quantity: 15 }, data as StoreData, DEFAULT_LIMITS)).cart.lines[0].quantity).toBe(15)
    expect(ok(changeCart(state, { line: key, quantity: 0 }, data as StoreData, DEFAULT_LIMITS)).cart.lines).toEqual([])
    // "update.js doesn't validate the quantity on variants that are already in the cart"
    expect(ok(updateCart(state, { updates: { [TEE_S]: 7 } }, data as StoreData, DEFAULT_LIMITS)).cart.lines[0].quantity).toBe(7)
    expect(description(updateCart(state, { updates: { [TEE_M]: 2 } }, data as StoreData, DEFAULT_LIMITS))).toBe('The quantity must be above the specified minimum for the item.')
  })
})

describe('volume pricing in the cart', () => {
  const priceOf = (state: VisitorState) => (cartJson(data as StoreData, state.cart).items as Array<Record<string, number>>).map(item => [item.quantity, item.price, item.final_price, item.final_line_price, item.original_line_price])

  it('prices a line at the price break its quantity reaches', () => {
    expect(priceOf(start([TEE_S, 5]))).toEqual([[5, 2400, 2400, 12000, 12000]])
    expect(priceOf(start([TEE_S, 10]))).toEqual([[10, 2100, 2100, 21000, 21000]])
    expect(priceOf(start([TEE_S, 25]))).toEqual([[25, 1800, 1800, 45000, 45000]])
    expect(priceOf(start([TEE_S, 50]))).toEqual([[50, 1500, 1500, 75000, 75000]])
  })

  it('adds up the lines of one variant, and keeps other variants and totals consistent', () => {
    const state = ok(addToCart(start([TEE_S, 5]), { id: TEE_S, quantity: 5, properties: { Gift: 'yes' } }, data as StoreData, DEFAULT_LIMITS))
    expect(priceOf(state).map(row => row[1])).toEqual([2100, 2100])
    const cart = cartJson(data as StoreData, state.cart)
    expect(cart.total_price).toBe(21000)
  })

  it('is the Ajax answer and the Liquid cart both', () => {
    const state = start([TEE_S, 10])
    const items = cartJson(data as StoreData, state.cart, undefined, 'change').items as Array<Record<string, unknown>>
    expect(items[0]).toMatchObject({ price: 2100, final_line_price: 21000 })
  })
})
