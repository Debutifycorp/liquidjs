import { readdirSync } from 'fs'
import { join } from 'path'
import { createShopifyLiquid, renderLiquid, sampleStoreData, storefrontSampleData } from '../../src/shopify'
import { buildLinklists, buildStore } from '../../src/shopify/store/build'
import { resourceExists } from '../../src/storefront/pages'
import { routeRequest } from '../../src/storefront/router'
import { renderProbeHtml, PROBE_DIR } from './probe'

describe('storefrontSampleData', () => {
  const data = storefrontSampleData
  it('holds every kind of record part P seeds', () => {
    expect(data.products?.length).toBe(34)
    expect(data.collections?.map(c => c.handle)).toEqual(['men', 'women', 'unisex', 'tops', 'bottoms', 'accessories', 'featured', 'shoes', 'frontpage'])
    expect(data.discounts?.map(d => d.type).sort()).toEqual(['amount_off_order', 'amount_off_products', 'amount_off_products', 'buy_x_get_y', 'buy_x_get_y', 'free_shipping'])
    expect(data.markets?.map(m => m.handle)).toEqual(['us', 'ca', 'eu'])
    expect(data.shipping_zones?.length).toBe(3)
    expect(Object.keys(data.translations ?? {})).toEqual(['fr'])
    expect(data.filters?.map(f => f.attribute)).toEqual(['availability', 'price', 'vendor', 'product_type', 'tag', 'option', 'option', 'metafield'])
  })
  it('holds the three menus every Shopify store has, in the sample store too', async () => {
    for (const lists of [data.linklists ?? [], sampleStoreData.linklists ?? []]) {
      expect(lists.map(l => l.handle)).toEqual(['main-menu', 'footer', 'customer-account-main-menu'])
      expect(lists[2]).toEqual({ handle: 'customer-account-main-menu', title: 'Customer account main menu', links: [{ title: 'Orders', url: '/account/orders' }, { title: 'Profile', url: '/account/profile' }] })
    }
    const linklists = buildLinklists(buildStore(data).linklists, '/')
    const source = "{% for l in linklists['customer-account-main-menu'].links %}{{ l.title }}:{{ l.type }}:{{ l.url }} {% endfor %}{{ linklists['customer-account-main-menu'] }}"
    expect((await renderLiquid(createShopifyLiquid(), source, { linklists })).html).toBe('Orders:customer_account_page_link:/account/orders Profile:customer_account_page_link:/account/profile customer-account-main-menu')
  })
  it('issues one gift card that the gift card route opens, in the sample store too', () => {
    for (const store of [data, sampleStoreData]) {
      const card = store.gift_card
      expect(card).toMatchObject({ enabled: true, expired: false, currency: 'USD' })
      expect(card?.code).toMatch(/^[A-Z0-9]{4}( [A-Z0-9]{4}){3}$/)
      expect(card?.initial_value).toBeGreaterThan(card?.balance ?? Infinity)
      expect(card?.balance).toBeGreaterThan(0)
      expect(card?.url).toMatch(/^\/gift_cards\/\d+\/[0-9a-f]{32}$/)
      const routed = routeRequest('GET', card?.url ?? '', store, { basePath: '' }).route
      expect(routed).toMatchObject({ kind: 'page', page: { templateName: 'gift_card' } })
      expect(routed.kind === 'page' && resourceExists(store, routed.page)).toBe(true)
      const built = buildStore(store).gift_card as Record<string, unknown>
      expect(built).toMatchObject({ code: card?.code, balance: card?.balance, url: card?.url, last_four_characters: card?.code.slice(-4) })
    }
  })
  it('uses unique ids and handles', () => {
    const products = data.products ?? []
    const ids = [...products.map(p => p.id), ...products.flatMap(p => p.variants.map(v => v.id))]
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(products.map(p => p.handle)).size).toBe(products.length)
  })
  it('titles every variant by its option values, as Shopify does', () => {
    for (const v of (data.products ?? []).flatMap(p => p.variants)) expect(v.title).toBe([v.option1, v.option2, v.option3].filter(value => value != null).join(' / '))
  })
  it('names only products the dataset has, in collections, discounts and translations', () => {
    const handles = new Set((data.products ?? []).map(p => p.handle))
    for (const c of data.collections ?? []) for (const h of c.products) expect(handles).toContain(h)
    for (const d of data.discounts ?? []) {
      const items = d.type === 'buy_x_get_y' ? [d.buys.items, d.gets.items] : 'items' in d ? [d.items] : []
      for (const i of items) if (!('all' in i)) for (const h of i.products ?? []) expect(handles).toContain(h)
    }
    for (const h of Object.keys(data.translations?.fr.products ?? {})) expect(handles).toContain(h)
  })
  it('holds a pickup mug whose Large size is sold past zero stock, so it can be bought and cannot be picked up', () => {
    const mug = data.products?.find(item => item.handle === 'pickup-mug')
    expect(mug?.unlisted).toBe(true)
    expect(mug?.variants.map(variant => [variant.title, variant.inventory_quantity, variant.inventory_policy ?? 'deny'])).toEqual([['Small', 5, 'deny'], ['Large', 0, 'continue']])
  })
  it('holds an olive oil with a unit price per 100 ml and a rating', async () => {
    const store = buildStore(data)
    const oil = store.products.liquidMethodMissing('olive-oil')
    const html = await renderLiquid(createShopifyLiquid(), '{% for v in p.variants %}{{ v.unit_price | money }} per {{ v.unit_price_measurement.reference_value }} {{ v.unit_price_measurement.reference_unit }};{% endfor %}{{ p.metafields.reviews.rating.value.rating | json }}/{{ p.metafields.reviews.rating.value.scale_max | json }}/{{ p.metafields.reviews.rating_count.value }}|{{ p.metafields.reviews.rating.value.rating | times: 2 }}', { p: oil })
    expect(html.html).toBe('$3.60 per 100 ml;$3.20 per 100 ml;$2.80 per 100 ml;"4.5"/"5.0"/37|9.0')
  })
  it('is frozen all the way down', () => {
    const frozen = (value: unknown): boolean => !value || typeof value !== 'object' || (Object.isFrozen(value) && Object.values(value).every(frozen))
    expect(frozen(data)).toBe(true)
  })
  it('renders every probe with today\'s engine', async () => {
    const templates = readdirSync(join(PROBE_DIR, 'templates')).filter(f => f.endsWith('.liquid')).map(f => f.replace(/\.liquid$/, ''))
    expect(templates.sort()).toEqual(['cart.probe', 'cart.probe-text', 'collection.probe', 'page.probe', 'page.probe-form', 'page.probe-payment', 'product.probe', 'product.probe-extras', 'product.probe-media', 'search.probe'])
    // `cart.probe-text` prints plain text (fixture `ajax-cart-text`), the others JSON
    for (const t of templates.filter(name => name !== 'cart.probe-text')) {
      const html = await renderProbeHtml(t)
      expect(() => JSON.parse(html)).not.toThrow()
    }
    const form = JSON.parse(await renderProbeHtml('page.probe-form'))
    expect(Object.keys(form)).toEqual(['contact', 'customer', 'contact_form', 'customer_form'])
    expect(form.contact.posted_successfully).toBe(false)
    for (const s of ['probe-predictive', 'probe-recommendations']) {
      const html = await renderProbeHtml(s, { section: true })
      expect(() => JSON.parse(html)).not.toThrow()
    }
  })
  it('renders the font probes, JSON templates of one section each, with today\'s engine', async () => {
    const templates = readdirSync(join(PROBE_DIR, 'templates')).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''))
    expect(templates.sort()).toEqual(['page.probe-fonts-library', 'page.probe-fonts-retired-1', 'page.probe-fonts-retired-2', 'page.probe-fonts-retired-3', 'page.probe-fonts-retired-4'])
    for (const t of templates) {
      const html = await renderProbeHtml(t)
      const fonts = JSON.parse(/^\s*<div[^>]*class="shopify-section[^"]*"[^>]*>([\s\S]*)<\/div>\s*$/.exec(html)![1]).fonts
      expect(fonts.length).toBeGreaterThan(0)
    }
  })
})
