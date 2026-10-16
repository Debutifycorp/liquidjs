import { readdirSync } from 'fs'
import { join } from 'path'
import { requestFromUrl, storefrontSampleData } from '../../src/shopify'
import type { StoreData } from '../../src/shopify'
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
