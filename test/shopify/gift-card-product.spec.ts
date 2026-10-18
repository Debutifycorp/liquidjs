import { createShopifyLiquid, renderLiquid } from '../../src/shopify'
import type { StoreData } from '../../src/shopify'
import { buildStore } from '../../src/shopify/store/build'
import { buildCartObject } from '../../src/shopify/store/cart'

const liquid = createShopifyLiquid()
const render = async (source: string, scope: object) => (await renderLiquid(liquid, source, scope)).html

// https://shopify.dev/docs/api/liquid/objects/product#product-gift_card?: "Returns true if the product is a gift card. Returns false if not."
const data: StoreData = {
  shop: { name: 'S', domain: 's.example', currency: 'USD' },
  products: [
    { id: 1, handle: 'card', title: 'Gift card', gift_card: true, variants: [{ id: 11, title: '$25', price: 2500, available: true, requires_shipping: false }] },
    { id: 2, handle: 'mug', title: 'Mug', variants: [{ id: 21, title: 'Default Title', price: 1500, available: true }] }
  ]
}

describe('product.gift_card?', () => {
  it('is true for a product the data marks as a gift card and false for any other', async () => {
    const products = buildStore(data).products
    expect(await render('{{ p["gift_card?"] }}/{{ q["gift_card?"] }}', { p: products.liquidMethodMissing('card'), q: products.liquidMethodMissing('mug') })).toBe('true/false')
  })

  it('marks the cart line of a gift card as a gift card', async () => {
    const cart = buildCartObject(buildStore(data), { token: '', lines: [{ variantId: 11, quantity: 1, properties: {}, sellingPlanId: null }, { variantId: 21, quantity: 1, properties: {}, sellingPlanId: null }], note: null, attributes: {}, discountCodes: [] })
    expect(await render('{% for item in cart.items %}{{ item.gift_card }},{% endfor %}', { cart })).toBe('true,false,')
  })
})
