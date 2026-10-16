import { readdirSync } from 'fs'
import { join } from 'path'
import { requestFromUrl, storefrontSampleData } from '../../src/shopify'
import type { FilterData, ProductData, StoreData } from '../../src/shopify'
import { HandleMap } from '../../src/shopify/objects/handle-map'
import { ReportCollector } from '../../src/shopify/report'
import { buildStore } from '../../src/shopify/store/build'
import { buildGlobals } from '../../src/shopify/store/globals'
import { probeMatches } from './expect-probe'
import { renderProbeHtml } from './probe'

const collectionFixtures = readdirSync(join(__dirname, 'fixtures')).map(f => f.replace(/\.json$/, '')).filter(n => n.startsWith('probe-collection-') && n !== 'probe-collection-suffix')

describe('collections per request', () => {
  it('has the recorded collection scenarios', () => {
    expect(collectionFixtures.length).toBeGreaterThanOrEqual(25)
  })
  for (const name of collectionFixtures) {
    it(`matches ${name}`, async () => {
      const { actual, expected } = await probeMatches(name, (b: any) => Object.fromEntries(Object.entries(b).filter(([key]) => key !== 'template' && key !== 'template_suffix')))
      expect(actual).toEqual(expected)
    })
  }
})

/** What the collection probe prints for `url`, rendered from `data`. */
async function probe (url: string, data: StoreData = storefrontSampleData): Promise<any> {
  const page = requestFromUrl(url, data)
  const templateName = `${page.templateName}.${page.request.view}`
  return JSON.parse(await renderProbeHtml(templateName, { request: page.request, data, templateName, locale: page.locale }))
}

const handles = (body: any) => body.products.map((p: any) => p.handle)

describe('collections beyond the recorded scenarios', () => {
  it('lists the products with a sales rank first, by rank, then the newest', async () => {
    const data = structuredClone(storefrontSampleData) as StoreData
    for (const [handle, rank] of [['frontpack', 1], ['slides', 2]] as const) data.products!.find(p => p.handle === handle)!.sales_rank = rank
    expect(handles(await probe('/collections/all?view=probe&sort_by=best-selling', data))).toEqual(['frontpack', 'slides', 'hoodie', 'beanie'])
  })

  it('reads a request that names no known sort as the collection\'s default', async () => {
    const body = await probe('/collections/all?view=probe&sort_by=bogus')
    expect(body.sort_by).toBe('')
    expect(handles(body)).toEqual(['beanie', 'black-sunnies', 'canvas-sneakers', 'clear-sunnies'])
  })

  it('finds a vendor or a type without regard to case, and nothing for a term no product has', async () => {
    const vendor = await probe('/collections/vendors?q=mock.SHOP&view=probe')
    expect([vendor.products_count, vendor.title, vendor.url]).toEqual([29, 'mock.SHOP', '/collections/vendors?q=mock.SHOP'])
    const type = await probe('/collections/types?q=t-SHIRTS&view=probe')
    expect(type.products_count).toBe(3)
    const none = await probe('/collections/vendors?q=Nobody&view=probe')
    expect([none.products_count, none.products, none.filters]).toEqual([0, [], []])
    expect((await probe('/collections/types?view=probe')).products_count).toBe(0)
  })

  it('combines a filter\'s selected values with the operator the store data gives it, OR when it gives none', async () => {
    const url = '/collections/all?view=probe&filter.p.tag=shoes&filter.p.tag=bottoms'
    expect((await probe(url)).products_count).toBe(0)
    const data = structuredClone(storefrontSampleData) as StoreData
    for (const filter of data.filters!) delete filter.operator
    const body = await probe(url, data)
    expect(body.products_count).toBe(9)
    expect(body.filters.find((f: any) => f.param_name === 'filter.p.tag').operator).toBe('OR')
  })

  it('has no price filter, and ignores its bounds, in a currency other than the shop\'s', async () => {
    const own = await probe('/collections/all?view=probe&filter.v.price.gte=20')
    expect(own.products_count).toBeLessThan(29)
    expect(own.filters.map((f: any) => f.param_name)).toContain('filter.v.price')
    const canadian = await probe('/en-ca/collections/all?view=probe&filter.v.price.gte=20')
    expect(canadian.products_count).toBe(29)
    expect(canadian.filters.map((f: any) => f.param_name)).not.toContain('filter.v.price')
  })

  it('keeps the whole query in the links of the filters and of the pages', async () => {
    const body = await probe('/collections/all?view=probe&sort_by=title-descending&filter.p.vendor=Mock.shop&page=2')
    const brand = body.filters.find((f: any) => f.param_name === 'filter.p.vendor')
    expect(brand.url_to_remove).toBe('/collections/all?sort_by=title-descending&view=probe')
    expect(brand.values[0].url_to_remove).toBe('/collections/all?sort_by=title-descending&view=probe')
    expect(body.paginate.previous).toBe('/collections/all?filter.p.vendor=Mock.shop&page=1&sort_by=title-descending&view=probe')
  })
})

describe('collections: more guarantees', () => {
  it('shares one variant between the variant filters', async () => {
    const cheap = await probe('/collections/all?view=probe&filter.v.price.lte=20&filter.v.availability=1')
    expect([cheap.products_count, handles(cheap)]).toEqual([1, ['workout-shirt']])
    const soldOut = await probe('/collections/all?view=probe&filter.v.availability=0&filter.v.option.color=Green')
    expect([soldOut.products_count, handles(soldOut)]).toEqual([1, ['leggings']])
  })

  it('keeps the locale prefix in the links of the products, the filters and the pages', async () => {
    const body = await probe('/en-ca/collections/all/shoes?view=probe&filter.v.availability=1')
    expect(body.products.every((p: any) => p.url.startsWith('/en-ca/products/'))).toBe(true)
    expect(body.filters.find((f: any) => f.param_name === 'filter.v.availability').url_to_remove).toBe('/en-ca/collections/all/shoes?view=probe')
    expect(body.paginate.next).toBe('/en-ca/collections/all/shoes?filter.v.availability=1&page=2&view=probe')
  })

  it('does not change the built collections when it shows them', () => {
    const data = structuredClone(storefrontSampleData) as StoreData
    const store = buildStore(data)
    const snapshot = () => JSON.stringify(HandleMap.values(store.collections).concat(HandleMap.get(store.collections, 'all')!).map(c => [(c.products as any[]).map(p => [p.handle, p.url]), c.products_count, c.sort_by, c.default_sort_by, c.tags, c.filters]))
    const before = snapshot()
    for (const url of ['/collections/all?sort_by=price-descending', '/collections/all/shoes', '/collections/all?filter.v.availability=0&filter.v.option.color=Green', '/collections/vendors?q=Mock.shop', '/collections/tops?page=2&sort_by=best-selling']) {
      const page = requestFromUrl(url, data)
      buildGlobals({ store, data, templateName: page.templateName, request: page.request, locale: page.locale, report: new ReportCollector() })
    }
    expect(snapshot()).toBe(before)
  })

  it('reads only the metafields a product has, whatever the address names', async () => {
    const value = encodeURIComponent('function toString() { [native code] }')
    expect((await probe(`/collections/all?view=probe&filter.p.m.custom.toString=${value}`)).products_count).toBe(0)
    expect((await probe(`/collections/all?view=probe&filter.p.m.__proto__.constructor=${encodeURIComponent('function Object() { [native code] }')}`)).products_count).toBe(0)
  })

  it('reads an option filter named with capitals as the lower-cased one', async () => {
    const typed = await probe('/collections/all?view=probe&filter.v.option.Color=Green')
    const plain = await probe('/collections/all?view=probe&filter.v.option.color=Green')
    expect(typed.products_count).toBe(18)
    expect(typed.filters).toEqual(plain.filters)
    expect(typed.filters.find((f: any) => f.param_name === 'filter.v.option.color').active_values).toEqual(['Green'])
  })

  it('sorts by creation time whatever the UTC offset', async () => {
    const data = structuredClone(storefrontSampleData) as StoreData
    // 11:57:51 at -04:00 is 15:57:51Z, after the 15:57:50Z of the other, though its text sorts first
    data.products!.find(p => p.handle === 'slides')!.created_at = '2026-08-14T11:57:51-04:00'
    data.products!.find(p => p.handle === 'sweatpants')!.created_at = '2026-08-14T15:57:50Z'
    expect(handles(await probe('/collections/all?view=probe&sort_by=created-ascending', data))).toEqual(['sweatpants', 'slides', 'men-t-shirt', 'hoodie-old'])
  })

  it('keeps the work of the filters linear in the products: counting the values of a filter is one pass', () => {
    const base = storefrontSampleData.products!.find(p => p.handle === 'hoodie')!
    const count = 2000
    const products: ProductData[] = Array.from({ length: count }, (_, i) => ({ ...base, id: 9_000_000 + i, handle: `generated-${i}`, title: `Generated ${i}`, tags: [`tag-${i % 400}`, `tag-${(i * 7) % 400}`], variants: base.variants.map(v => ({ ...v, id: v.id + i * 1000 })) }))
    const data: StoreData = { shop: storefrontSampleData.shop, products, filters: storefrontSampleData.filters }
    const store = buildStore(data)
    let reads = 0
    for (const product of HandleMap.values(store.products)) {
      const tags = product.tags
      Object.defineProperty(product, 'tags', { get () { reads++; return tags }, enumerable: true, configurable: true })
    }
    const page = requestFromUrl('/collections/all?filter.p.tag=tag-1&filter.v.availability=1', data)
    const { globals } = buildGlobals({ store, data, templateName: page.templateName, request: page.request, locale: page.locale, report: new ReportCollector() })
    expect((globals.collection as any).filters.length).toBeGreaterThan(0)
    // 400 tag values over 2000 products read the tags 800,000 times when each value runs the filter chain; one pass reads them a few times per product
    expect(reads).toBeLessThan(count * 20)
  })

  it('builds a collection\'s filters when they are first read, and once', () => {
    let reads = 0
    const filter = { get attribute () { reads++; return 'vendor' as const } } as unknown as FilterData
    const store = buildStore({ ...storefrontSampleData, filters: [filter] })
    expect(reads).toBe(0)
    const all = HandleMap.get(store.collections, 'all')!
    expect((all.filters as any[]).length).toBe(1)
    const first = reads
    expect(first).toBeGreaterThan(0)
    expect(all.filters).toBe(all.filters)
    expect(reads).toBe(first)
  })
})
