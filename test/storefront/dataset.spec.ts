import { readdirSync } from 'fs'
import { join } from 'path'
import { storefrontSampleData } from '../../src/shopify'
import { renderProbeHtml, PROBE_DIR } from './probe'

describe('storefrontSampleData', () => {
  const data = storefrontSampleData
  it('holds every kind of record part P seeds', () => {
    expect(data.products?.length).toBe(29)
    expect(data.collections?.map(c => c.handle)).toEqual(['men', 'women', 'unisex', 'tops', 'bottoms', 'accessories', 'featured', 'shoes'])
    expect(data.discounts?.map(d => d.type).sort()).toEqual(['amount_off_order', 'amount_off_products', 'amount_off_products', 'buy_x_get_y', 'buy_x_get_y', 'free_shipping'])
    expect(data.markets?.map(m => m.handle)).toEqual(['us', 'ca', 'eu'])
    expect(data.shipping_zones?.length).toBe(3)
    expect(Object.keys(data.translations ?? {})).toEqual(['fr'])
    expect(data.filters?.map(f => f.attribute)).toEqual(['availability', 'price', 'vendor', 'product_type', 'tag', 'option', 'option', 'metafield'])
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
  it('is frozen all the way down', () => {
    const frozen = (value: unknown): boolean => !value || typeof value !== 'object' || (Object.isFrozen(value) && Object.values(value).every(frozen))
    expect(frozen(data)).toBe(true)
  })
  it('renders every probe with today\'s engine', async () => {
    const templates = readdirSync(join(PROBE_DIR, 'templates')).map(f => f.replace(/\.liquid$/, ''))
    expect(templates.sort()).toEqual(['cart.probe', 'collection.probe', 'page.probe', 'page.probe-form', 'product.probe', 'search.probe'])
    for (const t of templates) {
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
})
