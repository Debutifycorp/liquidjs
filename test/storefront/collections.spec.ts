import { readdirSync } from 'fs'
import { join } from 'path'
import { requestFromUrl, storefrontSampleData } from '../../src/shopify'
import type { FilterData, ProductData, StoreData } from '../../src/shopify'
import { HandleMap } from '../../src/shopify/objects/handle-map'
import { ReportCollector } from '../../src/shopify/report'
import { buildStore, isBuiltProduct } from '../../src/shopify/store/build'
import { requestQuery } from '../../src/shopify/store/filters'
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

  it('gives a collection of the store the tags of all its products, on any page and under any filter, and the catalogue the tags of its page', async () => {
    const all = ['accessories', 'men', 'shoes', 'tops', 'unisex', 'women']
    // the three recorded requests of `featured` (fixtures `probe-collection-suffix`, `-page-3`, `-filtered`)
    for (const name of ['probe-collection-suffix', 'probe-collection-suffix-page-3', 'probe-collection-suffix-filtered']) {
      const { actual, expected } = await probeMatches(name, (b: any) => b.tags)
      expect([actual, expected]).toEqual([all, all])
    }
    // not recorded: a tag path and a sort take the same rule
    expect((await probe('/collections/featured/women?view=probe')).tags).toEqual(all)
    expect((await probe('/collections/featured?view=probe&sort_by=price-descending&filter.p.product_type=Shoes')).tags).toEqual(all)
    expect((await probe('/collections/all?view=probe')).tags).toEqual(['accessories', 'men', 'shoes', 'unisex'])
    expect((await probe('/collections/vendors?q=Mock.shop&view=probe')).tags).toEqual(['accessories', 'men', 'shoes', 'unisex'])
    const store = buildStore(storefrontSampleData)
    expect(HandleMap.get(store.collections, 'featured')!.tags).toEqual(all)
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

describe('collections: the work a request causes (final review B, I1)', () => {
  const collectionOf = (url: string, data: StoreData, store = buildStore(data)): any => {
    const page = requestFromUrl(url, data)
    return buildGlobals({ store, data, templateName: page.templateName, request: page.request, locale: page.locale, report: new ReportCollector() }).globals.collection
  }
  /** Counts the reads of `key` on every built product of `store`. */
  const countReads = (store: ReturnType<typeof buildStore>, key: string) => {
    const counter = { reads: 0 }
    for (const product of HandleMap.values(store.products)) {
      const value = product[key]
      Object.defineProperty(product, key, { get () { counter.reads++; return value }, enumerable: true, configurable: true })
    }
    return counter
  }

  it('builds the filters when a template reads them, once, and not when it reads only the count', () => {
    const data = structuredClone(storefrontSampleData) as StoreData
    const store = buildStore(data)
    // only the filters read a product's `options`: nothing else a collection page does here (no option filter is active) reaches it
    const options = countReads(store, 'options')
    for (const url of ['/collections/all', '/collections/all?sort_by=price-descending&filter.v.availability=1', '/collections/tops?filter.p.vendor=Mock.shop']) {
      const collection = collectionOf(url, data, store)
      expect(collection.products_count).toBeGreaterThan(0)
      expect(options.reads).toBe(0)
      expect(collection.filters.length).toBeGreaterThan(0)
      const first = options.reads
      expect(first).toBeGreaterThan(0)
      expect(collection.filters).toBe(collection.filters)
      expect(options.reads).toBe(first)
      options.reads = 0
    }
  })

  it('answers a request with no query and no tag path with the filters the store already built for that collection', () => {
    const data = structuredClone(storefrontSampleData) as StoreData
    const store = buildStore(data)
    const built = HandleMap.get(store.collections, 'tops')!
    expect(collectionOf('/collections/tops', data, store).filters).toBe(built.filters)
    expect(collectionOf('/collections/tops?sort_by=price-descending', data, store).filters).not.toBe(built.filters)
    expect(collectionOf('/collections/tops/men', data, store).filters).not.toBe(built.filters)
  })

  it('copies the products a variant filter narrows only when they are read, and only the ones read', () => {
    const data = structuredClone(storefrontSampleData) as StoreData
    const store = buildStore(data)
    const copied = jest.spyOn(Object, 'getOwnPropertyDescriptors')
    const copies = () => copied.mock.calls.filter(([object]) => isBuiltProduct(object)).length
    try {
      const collection = collectionOf('/collections/all?filter.v.availability=1&sort_by=title-ascending', data, store)
      expect(collection.products_count).toBe(26)
      expect(copies()).toBe(0)
      const products = collection.products as Array<{ url: string }>
      expect(products).toHaveLength(26)
      expect(copies()).toBe(0)
      const first = products.slice(0, 4).map(product => product.url)
      expect(copies()).toBeLessThanOrEqual(4)
      expect(products.slice(0, 4).map(product => product.url)).toEqual(first)
      expect(products[1]).toBe(products[1])
      const narrowed = products.filter(product => product.url.includes('?variant=')).length
      expect(narrowed).toBeGreaterThan(0)
      expect(copies()).toBe(narrowed)
    } finally {
      copied.mockRestore()
    }
  })

  it('reads at most 25 filter parameters, 50 values of each and 100 pairs of a query', () => {
    const junk = Array.from({ length: 300 }, (_, i) => [`z${i}`, '1'] as [string, string])
    expect(requestQuery({ query: junk }).query).toEqual(junk.slice(0, 100))
    const tags = Array.from({ length: 60 }, (_, i) => ['filter.p.tag', `t${i}`] as [string, string])
    const read = requestQuery({ query: [...tags, ['filter.p.vendor', 'a']] })
    expect(read.active.filter(([name]) => name === 'filter.p.tag')).toEqual(tags.slice(0, 50))
    expect(read.active).toContainEqual(['filter.p.vendor', 'a'])
    expect(read.query).toEqual(read.active)
    const names = Array.from({ length: 40 }, (_, i) => [`filter.p.m.custom.k${i}`, 'x'] as [string, string])
    expect(requestQuery({ filters: names }).active).toEqual(names.slice(0, 25))
    const url = `/collections/all?${junk.map(([name, value]) => `${name}=${value}`).join('&')}`
    expect(requestFromUrl(url, storefrontSampleData).request.query).toHaveLength(100)
  })

  it('ignores the filter values past the 50th, so a long list cannot make a request expensive', () => {
    const data = structuredClone(storefrontSampleData) as StoreData
    // the vendor filter combines its values with OR, so one value that matches shows the products
    const others = Array.from({ length: 50 }, (_, i) => `filter.p.vendor=other-${i}`)
    expect(collectionOf(`/collections/all?${others.join('&')}&filter.p.vendor=Mock.shop`, data).products_count).toBe(0)
    expect(collectionOf(`/collections/all?${others.slice(1).join('&')}&filter.p.vendor=Mock.shop`, data).products_count).toBe(29)
  })

  it('computes the links of a filter value when they are read', () => {
    const data = structuredClone(storefrontSampleData) as StoreData
    const value = collectionOf('/collections/all?view=probe', data).filters[0].values[0]
    for (const link of ['url_to_add', 'url_to_remove']) expect(typeof Object.getOwnPropertyDescriptor(value, link)?.get).toBe('function')
    expect(value.url_to_add).toMatch(/^\/collections\/all\?/)
    expect(JSON.parse(JSON.stringify(value)).url_to_add).toBe(value.url_to_add)
  })
})
