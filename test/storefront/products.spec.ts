import { productJson, sampleStoreData, storefrontSampleData as data } from '../../src/shopify'
import { ReportCollector } from '../../src/shopify/report'
import { buildStore } from '../../src/shopify/store/build'
import { buildGlobals } from '../../src/shopify/store/globals'
import type { RequestInput } from '../../src/shopify'
import { loadFixture } from './fixtures'
import { maskVolatile, probeMatches } from './expect-probe'

const pick = (b: any) => ({ selected_variant: b.selected_variant, selected_or_first_available_variant: b.selected_or_first_available_variant, first_available_variant: b.first_available_variant, options_with_values: b.options_with_values, variants: b.variants.map((v: any) => ({ id: v.id, selected: v.selected, available: v.available, inventory_policy: v.inventory_policy, inventory_management: v.inventory_management, inventory_quantity: v.inventory_quantity, weight: v.weight, url: v.url })) })

describe('products per request', () => {
  for (const name of ['probe-product-default', 'probe-product-variant', 'probe-product-sold-out-variant', 'probe-product-unknown-variant', 'probe-product-in-collection', 'probe-product-en-eu-hoodie', 'probe-product-en-eu-leggings', 'probe-product-en-eu-workout-shirt']) {
    it(`matches ${name}`, async () => {
      const { actual, expected } = await probeMatches(name, pick)
      expect(actual).toEqual(expected)
    })
  }
  it('prints the product JSON the parity store answers at /products/<handle>.js', () => {
    const fixture = loadFixture('ajax-product-js')
    expect(maskVolatile(productJson(data, 'hoodie'))).toEqual(maskVolatile(fixture.steps[0].body))
    expect(productJson(data, 'nope')).toBeNull()
    expect(maskVolatile(productJson(data, 'hoodie', { market: 'eu', language: 'en', prefix: '/en-eu' }))).toEqual(maskVolatile(fixture.steps[3].body))
  })
  it('keeps the keys of the answer in the order the parity store prints them', () => {
    const fixture = loadFixture('ajax-product-js')
    const answer = productJson(data, 'hoodie') as any
    const recorded = fixture.steps[0].body as any
    expect(Object.keys(answer)).toEqual(Object.keys(recorded))
    expect(Object.keys(answer.variants[0])).toEqual(Object.keys(recorded.variants[0]))
    expect(Object.keys(answer.variants[0].featured_image)).toEqual(Object.keys(recorded.variants[0].featured_image))
    expect(Object.keys(answer.variants[0].featured_media)).toEqual(Object.keys(recorded.variants[0].featured_media))
    expect(Object.keys(answer.media[0])).toEqual(Object.keys(recorded.media[0]))
  })
  it('answers with objects of its own: changing one leaves the store and the next answer alone', () => {
    const first = productJson(data, 'hoodie') as any
    first.tags.push('changed')
    first.variants[0].options.push('changed')
    first.variants[0].quantity_rule.min = 9
    first.options[0].values.pop()
    const second = productJson(data, 'hoodie') as any
    expect(second.tags).toEqual([])
    expect(second.variants[0].options).toEqual(['Red', 'Small'])
    expect(second.variants[0].quantity_rule.min).toBe(1)
    expect(second.options[0].values).toEqual(['Red', 'Clay', 'Ocean', 'Purple', 'Green'])
    const built = (buildStore(data).products as any as { liquidMethodMissing: (key: string) => any }).liquidMethodMissing('hoodie')
    expect(built.tags).toEqual([])
    expect(built.variants[0].options).toEqual(['Red', 'Small'])
  })
  it('prints the product JSON of a product with selling plans', () => {
    expect(maskVolatile(productJson(data, 'slides'))).toEqual(maskVolatile(loadFixture('ajax-product-js').steps[1].body))
  })
  // the parity store prints `product | json` in a shape of its own, not the `.js` answer: option names, no `url`, `content` last (fixture `probe-product-default`)
  it('prints the product through the json filter as the parity store does', async () => {
    const { actual, expected } = await probeMatches('probe-product-default', (b: any) => b.ajax)
    expect(actual).toEqual(expected)
    // plain masked data, so the text compares the key order at every depth
    expect(JSON.stringify(actual)).toBe(JSON.stringify(expected))
  })
  // as the parity store prints them: `product | json` without a protocol (scenario `page-product`: `"src":"\/\/host\/cdn\/shop\/files\/…"`); `/products/<handle>.js` without one for `featured_image` and `images`, and with one for the `src` of the media and of a variant's image (scenario `ajax-product-js`)
  it('prints image addresses without a protocol through the json filter, and as the parity store does in the Ajax answer', async () => {
    const { actual } = await probeMatches('probe-product-default', (b: any) => b.ajax)
    const liquid = actual as any
    const addresses = (product: any) => [product.featured_image, ...product.images, product.variants[0].featured_image.src, product.variants[0].featured_media.preview_image.src, product.media[0].src, product.media[0].preview_image.src]
    expect(addresses(liquid)).toHaveLength(13)
    for (const address of addresses(liquid)) expect(address).toMatch(/^\/\/cdn\.shopify\.com\//)
    const ajax = productJson(data, 'hoodie') as any
    for (const address of [ajax.featured_image, ...ajax.images]) expect(address).toMatch(/^\/\/cdn\.shopify\.com\//)
    for (const address of [ajax.variants[0].featured_image.src, ajax.variants[0].featured_media.preview_image.src, ajax.media[0].src, ajax.media[0].preview_image.src]) expect(address).toMatch(/^https:\/\/cdn\.shopify\.com\//)
  })
  for (const name of ['probe-product-variant', 'probe-product-sold-out-variant', 'probe-product-in-collection']) {
    it(`prints a product with a selected variant through the json filter as well (${name})`, async () => {
      const { actual, expected } = await probeMatches(name, (b: any) => b.ajax)
      expect(actual).toEqual(expected)
    })
  }
  for (const name of ['probe-product-en-ca', 'probe-product-en-eu-hoodie']) {
    it(`prints the product through the json filter in the market of ${name}`, async () => {
      const { actual, expected } = await probeMatches(name, (b: any) => b.ajax)
      expect(actual).toEqual(expected)
    })
  }

  describe('a selected variant', () => {
    const product = (request: RequestInput, report = new ReportCollector()) => buildGlobals({ store: buildStore(data), data, templateName: 'product', request: { resource: 'hoodie', ...request }, locale: 'en', report })
    const hoodie = (request: RequestInput) => product(request).globals.product as any

    it('is a copy: the product every other request shares keeps selecting nothing', () => {
      const store = buildStore(data)
      const shared = (store.products as any as { liquidMethodMissing: (key: string) => any }).liquidMethodMissing('hoodie')
      const chosen = buildGlobals({ store, data, templateName: 'product', request: { resource: 'hoodie', variant: 43695846653974 }, locale: 'en', report: new ReportCollector() }).globals.product as any
      expect(chosen).not.toBe(shared)
      expect(chosen.selected_variant.id).toBe(43695846653974)
      expect(shared.selected_variant).toBeNull()
      expect(shared.variants.some((v: any) => v.selected)).toBe(false)
      expect(shared.options_with_values.map((o: any) => o.selected_value)).toEqual(['Red', 'Small'])
      // and a request without a variant, or with one the product lacks, gets the shared product itself
      expect(buildGlobals({ store, data, templateName: 'product', request: { resource: 'hoodie' }, locale: 'en', report: new ReportCollector() }).globals.product).toBe(shared)
      expect(buildGlobals({ store, data, templateName: 'product', request: { resource: 'hoodie', variant: 1 }, locale: 'en', report: new ReportCollector() }).globals.product).toBe(shared)
    })
    it('leaves no trace of one selection in the next', () => {
      const store = buildStore(data)
      const shared = (store.products as any as { liquidMethodMissing: (key: string) => any }).liquidMethodMissing('hoodie')
      const select = (variant?: number) => buildGlobals({ store, data, templateName: 'product', request: { resource: 'hoodie', variant }, locale: 'en', report: new ReportCollector() }).globals.product as any
      const before = JSON.stringify(shared)
      const first = select(43695846653974)
      const second = select(43695847145494)
      expect(first.variants.filter((v: any) => v.selected).map((v: any) => v.id)).toEqual([43695846653974])
      expect(second.variants.filter((v: any) => v.selected).map((v: any) => v.id)).toEqual([43695847145494])
      expect(first.selected_variant.id).toBe(43695846653974)
      expect(second.selected_variant.id).toBe(43695847145494)
      expect(first.options_with_values.map((o: any) => o.selected_value)).toEqual(['Red', 'Medium'])
      expect(second.options_with_values.map((o: any) => o.selected_value)).toEqual(['Clay', 'Small'])
      expect(second.selected_variant.available).toBe(false)
      expect(JSON.stringify(shared)).toBe(before)
      expect(select()).toBe(shared)
    })
    it('keeps every property of the product and of its variants, the hidden ones too', () => {
      const store = buildStore(data)
      const shared = (store.products as any as { liquidMethodMissing: (key: string) => any }).liquidMethodMissing('hoodie')
      const chosen = buildGlobals({ store, data, templateName: 'product', request: { resource: 'hoodie', variant: 43695846653974 }, locale: 'en', report: new ReportCollector() }).globals.product as any
      expect(Reflect.ownKeys(chosen).sort()).toEqual(Reflect.ownKeys(shared).sort())
      expect(Object.keys(chosen)).toEqual(Object.keys(shared))
      expect(Reflect.ownKeys(chosen.variants[0]).sort()).toEqual(Reflect.ownKeys(shared.variants[0]).sort())
      expect(Object.keys(chosen.variants[0])).toEqual(Object.keys(shared.variants[0]))
      expect(chosen.__product).toBe(true)
    })
    it('is the one object everywhere the copy points at it', () => {
      const chosen = hoodie({ variant: 43695846653974 })
      expect(chosen.variants.filter((v: any) => v.selected).map((v: any) => v.id)).toEqual([43695846653974])
      expect(chosen.selected_variant).toBe(chosen.variants.find((v: any) => v.id === 43695846653974))
      expect(chosen.selected_or_first_available_variant).toBe(chosen.selected_variant)
      expect(chosen.first_available_variant).toBe(chosen.variants[0])
      expect(chosen.selected_variant.product).toBe(chosen)
      expect(chosen.options_by_name.size.selected_value).toBe('Medium')
      expect(chosen.options_by_name.size).toBe(chosen.options_with_values[1])
      expect(String(chosen)).toBe('hoodie')
    })
  })

  describe('a product with every variant sold out', () => {
    const leggings = () => (buildStore(data).products as any as { liquidMethodMissing: (key: string) => any }).liquidMethodMissing('leggings')
    it('has no first available variant, and falls back to the first variant where the page says so', () => {
      const product = leggings()
      expect(product.variants.every((v: any) => !v.available)).toBe(true)
      expect(product.available).toBe(false)
      expect(product.first_available_variant).toBeNull()
      expect(product.selected_or_first_available_variant).toBe(product.variants[0])
      expect(product.options_with_values.map((o: any) => o.selected_value)).toEqual(product.variants[0].options)
    })
    it('still has none once a variant is selected', () => {
      const chosen = buildGlobals({ store: buildStore(data), data, templateName: 'product', request: { resource: 'leggings', variant: leggings().variants[1].id }, locale: 'en', report: new ReportCollector() }).globals.product as any
      expect(chosen.first_available_variant).toBeNull()
      expect(chosen.selected_variant.id).toBe(leggings().variants[1].id)
    })
  })

  describe('the collection a product is reached through', () => {
    it('is the collection global of the product page', () => {
      const { globals } = buildGlobals({ store: buildStore(data), data, templateName: 'product', request: { resource: 'men-t-shirt', collection: 'tops' }, locale: 'en', report: new ReportCollector() })
      expect((globals.collection as any).handle).toBe('tops')
      expect((globals.product as any).url).toBe('/products/men-t-shirt')
    })
    it('is nil, and reported, when the store has no such collection', () => {
      const report = new ReportCollector()
      const { globals } = buildGlobals({ store: buildStore(data), data, templateName: 'product', request: { resource: 'men-t-shirt', collection: 'nope' }, locale: 'en', report })
      expect(globals.collection).toBeUndefined()
      expect(report.toReport([], 0).missing).toContainEqual({ kind: 'resource', name: 'collection nope' })
    })
    it('is absent when the address names none', () => {
      expect(buildGlobals({ store: buildStore(data), data, templateName: 'product', request: { resource: 'men-t-shirt' }, locale: 'en', report: new ReportCollector() }).globals.collection).toBeUndefined()
    })
  })

  describe('stock and weight', () => {
    it('come from the data', () => {
      const variant = (buildStore(data).products as any).liquidMethodMissing('high-top-sneakers').variants.find((v: any) => v.id === 43696963485718)
      expect(variant).toMatchObject({ inventory_policy: 'continue', inventory_management: 'shopify', available: true, requires_shipping: true })
      const heavy = (buildStore(data).products as any).liquidMethodMissing('gray-leather-sneakers').variants[0]
      expect(heavy.weight).toBe(3000)
    })
    it('default to untracked, deny, shipped and weightless for data that says nothing', () => {
      const variants = (buildStore(sampleStoreData).products as any).liquidMethodMissing(sampleStoreData.products?.[0].handle).variants
      for (const variant of variants) expect(variant).toMatchObject({ inventory_management: null, inventory_policy: 'deny', requires_shipping: true, weight: 0, selected: false })
    })
    it('are the data\'s when it says otherwise', () => {
      const custom = { ...sampleStoreData, products: [{ ...sampleStoreData.products![0], variants: [{ id: 1, title: 'Default Title', price: 100, available: true, inventory_quantity: 7, inventory_policy: 'continue' as const, inventory_management: 'shopify' as const, weight: 250, requires_shipping: false }] }] }
      const [variant] = (buildStore(custom).products as any).liquidMethodMissing(custom.products[0].handle).variants
      expect(variant).toMatchObject({ inventory_quantity: 7, inventory_policy: 'continue', inventory_management: 'shopify', weight: 250, requires_shipping: false })
    })
  })
})
