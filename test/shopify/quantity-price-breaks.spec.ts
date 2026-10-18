import { createShopifyLiquid, renderLiquid } from '../../src/shopify'
import type { StoreData } from '../../src/shopify'
import { buildStore } from '../../src/shopify/store/build'

const liquid = createShopifyLiquid()
const render = async (source: string, scope: object) => (await renderLiquid(liquid, source, scope)).html

// https://shopify.dev/docs/api/liquid/objects/variant: `quantity_price_breaks_configured?` is "true if the variant has any quantity price breaks available in the current customer context", `quantity_price_breaks` its quantity_price_break objects (https://shopify.dev/docs/api/liquid/objects/quantity_price_break: `minimum_quantity` and `price`) and `quantity_rule` its quantity_rule (https://shopify.dev/docs/api/liquid/objects/quantity_rule: `min` and `increment` 1 and no `max` when no rule exists).
const data: StoreData = {
  shop: { name: 'S', domain: 's.example', currency: 'USD' },
  products: [{
    id: 1,
    handle: 'tee',
    title: 'Tee',
    options: ['Size'],
    variants: [
      { id: 11, title: 'S', option1: 'S', price: 3000, available: true, quantity_price_breaks: [{ minimum_quantity: 5, price: 2700 }, { minimum_quantity: 10, price: 2500 }], quantity_rule: { min: 5, max: 100, increment: 5 } },
      { id: 12, title: 'M', option1: 'M', price: 3000, available: true }
    ]
  }]
}

describe('variant volume pricing', () => {
  const product = () => buildStore(data).products.liquidMethodMissing('tee')

  it('says whether the variant has quantity price breaks, and the product whether any variant has', async () => {
    expect(await render('{% for v in p.variants %}{{ v["quantity_price_breaks_configured?"] }},{% endfor %}{{ p["quantity_price_breaks_configured?"] }}', { p: product() })).toBe('true,false,true')
  })

  it('lists the quantity price breaks with their minimum quantity and price', async () => {
    expect(await render('{% for b in p.variants.first.quantity_price_breaks %}{{ b.minimum_quantity }}@{{ b.price }},{% endfor %}', { p: product() })).toBe('5@2700,10@2500,')
  })

  it('gives the quantity rule of the data, and the default rule to a variant with none', async () => {
    expect(await render('{% for v in p.variants %}{{ v.quantity_rule.min }}/{{ v.quantity_rule.max | json }}/{{ v.quantity_rule.increment }},{% endfor %}', { p: product() })).toBe('5/100/5,1/null/1,')
  })
})
