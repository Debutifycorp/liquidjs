import { createShopifyLiquid, renderLiquid } from '../../src/shopify'
import type { StoreData } from '../../src/shopify'
import { buildStore, selectProduct } from '../../src/shopify/store/build'
import { buildCartObject } from '../../src/shopify/store/cart'

const liquid = createShopifyLiquid()
const render = async (source: string, scope: object) => (await renderLiquid(liquid, source, scope)).html

const location = { id: 9, name: 'Shop on Main', address: { address1: '1 Main St', city: 'Ottawa', country: 'Canada', country_code: 'CA', zip: 'K1A 0A1' }, latitude: 45.4 }
const data: StoreData = {
  shop: { name: 'S', domain: 's.example', currency: 'USD' },
  products: [{
    id: 1,
    handle: 'oil',
    title: 'Oil',
    options: ['Size'],
    variants: [
      { id: 11, title: 'Small', option1: 'Small', price: 1000, available: false, barcode: '0123456789012', unit_price_measurement: { measured_type: 'volume', quantity_value: 250, quantity_unit: 'ml', reference_value: 100, reference_unit: 'ml' }, store_availabilities: [{ available: false, location }] },
      { id: 12, title: 'Large', option1: 'Large', price: 3000, available: true, unit_price_measurement: { measured_type: 'volume', quantity_value: 1, quantity_unit: 'L', reference_value: 100, reference_unit: 'ml' }, quantity_price_breaks: [{ minimum_quantity: 5, price: 2700 }, { minimum_quantity: 10, price: 2500 }], store_availabilities: [{ available: true, pick_up_time: 'Usually ready in 2 hours', location }] },
      { id: 13, title: 'Bulk', option1: 'Bulk', price: 9000, available: true, unit_price_measurement: { measured_type: 'volume', quantity_value: 5, quantity_unit: 'furlong', reference_value: 1, reference_unit: 'l' } }
    ]
  }]
}

describe('variant properties', () => {
  it('has a barcode, a unit price and its measurement, and volume prices', async () => {
    const p = buildStore(data).products.liquidMethodMissing('oil')
    expect(await render('{% for v in p.variants %}{{ v.barcode | json }} {{ v.unit_price | json }} {{ v.unit_price_measurement.reference_value }}{{ v.unit_price_measurement.reference_unit }} {% for b in v.quantity_price_breaks %}{{ b.minimum_quantity }}@{{ b.price }},{% endfor %}|{% endfor %}{{ p["quantity_price_breaks_configured?"] }}', { p }))
      .toBe('"0123456789012" 400 100ml |null 300 100ml 5@2700,10@2500,|null null 1l |true')
  })
  // scenario `probe-product-extras-unit-price`: Shopify's json refuses a variant's unit price measurement, while its fields print and `product | json` writes them itself
  it('refuses to print a unit price measurement in json and keeps its fields', async () => {
    const p = buildStore(data).products.liquidMethodMissing('oil')
    expect(await render('{{ p.variants[0].unit_price_measurement | json }}|{{ p.variants[0].unit_price_measurement.quantity_unit | json }}', { p }))
      .toBe('{"error":"json not allowed for this object"}|"ml"')
    expect(JSON.parse(await render('{{ p | json }}', { p })).variants[0].unit_price_measurement).toMatchObject({ measured_type: 'volume', reference_unit: 'ml' })
  })
  it('lists the store availabilities of the first available variant and the selected one only', async () => {
    const p = buildStore(data).products.liquidMethodMissing('oil') as Record<string, unknown>
    const source = '{% for v in p.variants %}{{ v.id }}:{% for a in v.store_availabilities %}{{ a.location.name }}/{{ a.available }}/{{ a.pick_up_enabled }}/{{ a.physical_storefront }}/{{ a.pick_up_time }}/{{ a.location.address.city }}/{{ a.location.latitude }}{% endfor %}{% if v.store_availabilities == nil %}nil{% endif %};{% endfor %}'
    expect(await render(source, { p })).toBe('11:nil;12:Shop on Main/true/true/true/Usually ready in 2 hours/Ottawa/45.4;13:nil;')
    expect(await render(source, { p: selectProduct(p, 11) })).toBe('11:Shop on Main/false/true/true//Ottawa/45.4;12:Shop on Main/true/true/true/Usually ready in 2 hours/Ottawa/45.4;13:nil;')
  })
})

describe('cart line properties', () => {
  it('can be removed and changed, has no components or parent, and has the unit price of its final price', async () => {
    const store = buildStore(data)
    const cart = buildCartObject(store, { token: '', lines: [{ variantId: 12, quantity: 2, properties: {}, sellingPlanId: null }], note: null, attributes: {}, discountCodes: [] })
    expect(await render('{% for item in cart.items %}{{ item.instructions.can_remove }}/{{ item.instructions.can_update_quantity }}/{{ item.item_components.size }}/{{ item.parent_relationship | json }}/{{ item.unit_price }}/{{ item.unit_price_measurement.quantity_unit }}/{{ item.fulfillment | json }}{% endfor %}', { cart }))
      .toBe('true/true/0/null/300/L/null')
  })
})
