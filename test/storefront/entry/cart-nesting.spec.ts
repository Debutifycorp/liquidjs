import { cartJson, lineKey, previewSampleData } from '../../../src/shopify'
import type { StoreData } from '../../../src/shopify'
import { addToCart, changeCart, clearCart, updateCart } from '../../../src/storefront/cart'
import type { CartResult } from '../../../src/storefront/cart'
import { DEFAULT_LIMITS } from '../../../src/storefront/types'
import type { VisitorState } from '../../../src/storefront/types'
import { emptyVisitor } from '../../../src/storefront/visitor'
import { harness, harnessTheme } from './harness'

// https://shopify.dev/docs/apps/build/product-merchandising/nested-cart-lines/create-nested-cart-lines: a nested line names its parent by `parent_line_key` (a line already in the cart) or `parent_id` (a variant of the same request); nested lines are ordered after their parent and go with it
const data = previewSampleData as StoreData
const TV = 43695710371862 // slides, the parent
const WARRANTY = 43696940613654 // black sunnies, the add-on
const OTHER = 43696941367318 // canvas sneakers

const ok = (result: CartResult) => {
  if (!result.ok) throw new Error(`cart operation failed: ${JSON.stringify(result.error)}`)
  return result
}
const description = (result: CartResult) => result.ok ? undefined : result.error.body.description
const add = (state: VisitorState, items: unknown[]) => addToCart(state, { items } as never, data, DEFAULT_LIMITS)
const order = (state: VisitorState) => state.cart.lines.map(line => [line.variantId, line.parentKey === undefined ? null : 'nested'])

describe('nested cart lines', () => {
  it('nests an add-on under a parent of the same request, right after it', () => {
    const result = ok(add(emptyVisitor('t'), [{ id: TV, quantity: 1 }, { id: WARRANTY, quantity: 1, parent_id: TV }]))
    expect(order(result.state)).toEqual([[TV, null], [WARRANTY, 'nested']])
    expect(result.state.cart.lines[1].parentKey).toBe(lineKey(result.state.cart.lines[0]))
    expect(result.lines.map(line => line.variantId)).toEqual([TV, WARRANTY])
  })

  it('makes the parent first wherever it stands in the request', () => {
    const result = ok(add(emptyVisitor('t'), [{ id: WARRANTY, quantity: 1, parent_id: TV }, { id: TV, quantity: 1 }]))
    expect(order(result.state)).toEqual([[TV, null], [WARRANTY, 'nested']])
    expect(result.lines.map(line => line.variantId)).toEqual([WARRANTY, TV])
  })

  it('keeps a child directly after its parent when other lines come after (a community test: B, A, C under A)', () => {
    const first = ok(add(emptyVisitor('t'), [{ id: TV, quantity: 1 }])).state
    const second = ok(add(first, [{ id: OTHER, quantity: 1 }])).state
    const third = ok(add(second, [{ id: WARRANTY, quantity: 1, parent_line_key: lineKey(first.cart.lines[0]) }])).state
    expect(order(third)).toEqual([[OTHER, null], [TV, null], [WARRANTY, 'nested']])
  })

  it('refuses a parent_id that names no item of the request, with the text a merchant reports from the live API', () => {
    const failed = add(ok(add(emptyVisitor('t'), [{ id: TV, quantity: 1 }])).state, [{ id: WARRANTY, quantity: 1, parent_id: TV }])
    expect(failed.ok).toBe(false)
    expect(!failed.ok && failed.error).toEqual({ status: 422, body: { status: 422, message: 'Parent line does not match any existing or added lines', description: 'Parent line does not match any existing or added lines' } })
  })

  it('refuses a parent_line_key that names no line, a nested parent, itself and both ways of naming a parent', () => {
    const state = ok(add(emptyVisitor('t'), [{ id: TV, quantity: 1 }, { id: WARRANTY, quantity: 1, parent_id: TV }])).state
    expect(description(add(state, [{ id: OTHER, quantity: 1, parent_line_key: `${TV}:nothing` }]))).toBe('Parent line does not match any existing or added lines')
    expect(description(add(state, [{ id: OTHER, quantity: 1, parent_line_key: lineKey(state.cart.lines[1]) }]))).toBe('Parent line nesting is too deep or circular.')
    expect(description(add(state, [{ id: TV, quantity: 1, parent_line_key: lineKey(state.cart.lines[0]) }]))).toBe('Parent line nesting is too deep or circular.')
    expect(description(add(state, [{ id: OTHER, quantity: 1 }, { id: WARRANTY, quantity: 1, parent_id: OTHER, parent_line_key: lineKey(state.cart.lines[0]) }]))).toBe('A line names its parent by parent_id or by parent_line_key, not both.')
  })

  it('merges the same add-on under the same parent and splits it under another', () => {
    const state = ok(add(emptyVisitor('t'), [{ id: TV, quantity: 1 }, { id: WARRANTY, quantity: 1, parent_id: TV }])).state
    const more = ok(add(state, [{ id: WARRANTY, quantity: 1, parent_line_key: lineKey(state.cart.lines[0]) }])).state
    expect(more.cart.lines.map(line => line.quantity)).toEqual([1, 2])
    const other = ok(add(more, [{ id: OTHER, quantity: 1 }])).state
    const split = ok(add(other, [{ id: WARRANTY, quantity: 1, parent_line_key: lineKey(other.cart.lines.find(line => line.variantId === OTHER)!) }])).state
    expect(order(split)).toEqual([[OTHER, null], [WARRANTY, 'nested'], [TV, null], [WARRANTY, 'nested']])
    expect(new Set(split.cart.lines.map(lineKey)).size).toBe(4)
  })

  it('removes the nested lines with their parent, and only the child when the child goes', () => {
    const state = ok(add(emptyVisitor('t'), [{ id: TV, quantity: 1 }, { id: WARRANTY, quantity: 1, parent_id: TV }])).state
    expect(ok(changeCart(state, { line: 1, quantity: 0 }, data, DEFAULT_LIMITS)).state.cart.lines).toEqual([])
    expect(ok(updateCart(state, { updates: { [lineKey(state.cart.lines[0])]: 0 } }, data, DEFAULT_LIMITS)).state.cart.lines).toEqual([])
    expect(order(ok(changeCart(state, { line: 2, quantity: 0 }, data, DEFAULT_LIMITS)).state)).toEqual([[TV, null]])
    expect(ok(clearCart(state)).state.cart.lines).toEqual([])
  })

  it('follows a parent whose key changes', () => {
    const state = ok(add(emptyVisitor('t'), [{ id: TV, quantity: 1 }, { id: WARRANTY, quantity: 1, parent_id: TV }])).state
    const changed = ok(changeCart(state, { line: 1, quantity: 1, properties: { Colour: 'Red' } }, data, DEFAULT_LIMITS)).state
    expect(order(changed)).toEqual([[TV, null], [WARRANTY, 'nested']])
    expect(changed.cart.lines[1].parentKey).toBe(lineKey(changed.cart.lines[0]))
    expect(changed.cart.lines[1].parentKey).not.toBe(lineKey(state.cart.lines[0]))
  })

  it('prints parent_relationship in the Ajax answers and gives the Liquid line its parent', () => {
    const state = ok(add(emptyVisitor('t'), [{ id: TV, quantity: 1 }, { id: WARRANTY, quantity: 1, parent_id: TV }])).state
    const items = cartJson(data, state.cart).items as Array<Record<string, any>>
    expect(items[0]).not.toHaveProperty('parent_relationship')
    expect(items[1].parent_relationship).toEqual({ parent_key: items[0].key })
    expect(items[1].instructions).toEqual({ can_remove: true, can_update_quantity: true })
    expect(Object.keys(items[1]).indexOf('parent_relationship')).toBe(Object.keys(items[1]).indexOf('requires_shipping') + 1)
  })

  it('answers add.js with the nested line and renders it nested on the cart page', async () => {
    const files: Record<string, string> = { ...harnessTheme().files, 'templates/cart.liquid': '{% for item in cart.items %}[{{ item.product.handle }}:{{ item.parent_relationship.parent.product.handle | default: "-" }}:{{ item.parent_relationship.parent.key }}]{% endfor %}' }
    delete files['templates/cart.json']
    const { send } = harness({ data, theme: { files } })
    const answer = await send('POST', '/cart/add.js', { items: [{ id: TV, quantity: 1 }, { id: WARRANTY, quantity: 1, parent_id: TV }] })
    expect(answer.status).toBe(200)
    const items = (answer.json as any).items
    expect(items.map((item: any) => [item.variant_id, item.parent_relationship?.parent_key ? 'nested' : null])).toEqual([[TV, null], [WARRANTY, 'nested']])
    const cart = JSON.parse((await send('GET', '/cart.js')).text)
    expect(cart.items.map((item: any) => item.variant_id)).toEqual([TV, WARRANTY])
    const page = await send('GET', '/cart')
    expect(page.text).toContain(`[slides:-:][black-sunnies:slides:${items[0].key}]`)
  })
})
