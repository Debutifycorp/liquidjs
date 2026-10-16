import { renderPage, requestFromUrl, storefrontSampleData } from '../../src/shopify'
import type { StoreData } from '../../src/shopify'
import { buildStore } from '../../src/shopify/store/build'
import { buildSearch } from '../../src/shopify/store/search'
import { probeMatches } from './expect-probe'
import { renderProbeHtml } from './probe'

/** The fixtures whose results the parity store ranks in an order no rule of plain matching yields (accepted differences, see `buildSearch`): their results are compared as a set, and everything else exactly. */
const ACCEPTED_ORDER = new Set(['probe-search-shirt', 'probe-search-type-product'])

/** `body` with the handles inside each run of results of one kind sorted: the order of the kinds (products, then pages, then articles) is still compared, only the order within a kind is not. */
const unordered = (body: any) => {
  const runs: any[][] = []
  for (const result of body.results) {
    if (runs.length && runs[runs.length - 1][0].object_type === result.object_type) runs[runs.length - 1].push(result)
    else runs.push([result])
  }
  return { ...body, results: runs.flatMap(run => run.sort((a, b) => a.handle.localeCompare(b.handle))) }
}

describe('search per request', () => {
  for (const name of ['probe-search-shirt', 'probe-search-prefix', 'probe-search-type-product', 'probe-search-type-page', 'probe-search-filtered', 'probe-search-none']) {
    it(`matches ${name}`, async () => {
      const { actual, expected } = await probeMatches(name, ACCEPTED_ORDER.has(name) ? unordered : undefined)
      expect(actual).toEqual(expected)
    })
  }
})

/** What the search probe prints for `url`, rendered from `data`. */
async function probe (url: string, data: StoreData = storefrontSampleData): Promise<any> {
  const page = requestFromUrl(url, data)
  const templateName = `${page.templateName}.${page.request.view}`
  return JSON.parse(await renderProbeHtml(templateName, { request: page.request, data, templateName, locale: page.locale }))
}

/** What `{{ <expression> | json }}` prints on the search page of `url`, rendered from `data`: the parts of `search` the probe template leaves out. */
async function searchJson (url: string, expression: string, data: StoreData = storefrontSampleData): Promise<any> {
  const theme = { files: { 'config/settings_schema.json': '[]', 'config/settings_data.json': '{"current":{}}', 'layout/theme.liquid': '{{ content_for_layout }}', 'templates/search.liquid': `{%- layout none -%}{{ ${expression} | json }}` } }
  const page = requestFromUrl(url, data)
  return JSON.parse((await renderPage({ theme, templateName: 'search', data, request: page.request, locale: page.locale })).html)
}

/** What a search page template made of `template` prints for `url`. */
async function searchPage (url: string, template: string, data: StoreData = storefrontSampleData): Promise<string> {
  const theme = { files: { 'config/settings_schema.json': '[]', 'config/settings_data.json': '{"current":{}}', 'layout/theme.liquid': '{{ content_for_layout }}', 'templates/search.liquid': `{%- layout none -%}${template}` } }
  const page = requestFromUrl(url, data)
  return (await renderPage({ theme, templateName: 'search', data, request: page.request, locale: page.locale })).html
}

const handles = (body: any) => body.results.map((result: any) => result.handle)

/** The sample store with the named products sold out. */
function soldOut (...names: string[]): StoreData {
  const data = structuredClone(storefrontSampleData) as StoreData
  for (const product of data.products!.filter(p => names.includes(p.handle))) for (const variant of product.variants!) variant.available = false
  return data
}

describe('search beyond the recorded scenarios', () => {
  it('searches the kinds the type parameter names, and every kind for none it knows', async () => {
    const some = await probe('/search?q=about&type=product,page&view=probe')
    expect([some.types, handles(some)]).toEqual([['page', 'product'], ['about']])
    const unknown = await probe('/search?q=about&type=nothing&view=probe')
    expect([unknown.types, handles(unknown)]).toEqual([['article', 'page', 'product'], handles(await probe('/search?q=about&view=probe'))])
    expect(handles(unknown)).toContain('about')
    const articles = await probe('/search?q=liquid&type=article&view=probe')
    expect([articles.types, handles(articles)]).toEqual([['article'], ['news/making-liquid', 'news/new-line-of-tennis-products', 'news/liquidpeak-450']])
  })

  it('reports the types of a search with no terms', async () => {
    const body = await probe('/search?type=page&view=probe')
    expect([body.performed, body.terms, body.types, body.results_count, body.filters]).toEqual([false, null, ['page'], 0, []])
  })

  it('matches the last term as a whole word when the prefix option is none', async () => {
    expect((await probe('/search?q=shi&options%5Bprefix%5D=none&view=probe')).results_count).toBe(0)
    expect(handles(await probe('/search?q=shirt&options%5Bprefix%5D=none&view=probe'))).toEqual(['men-t-shirt', 'women-t-shirt', 'workout-shirt'])
    expect((await probe('/search?q=shi&options%5Bprefix%5D=last&view=probe')).results_count).toBe(5)
  })

  it('treats only the last term as a partial word', async () => {
    expect(handles(await probe('/search?q=leather%20sneak&view=probe'))).toEqual(['white-leather-sneakers', 'gray-leather-sneakers'])
    expect((await probe('/search?q=leather%20sneak&options%5Bprefix%5D=none&view=probe')).results_count).toBe(0)
    // the first term stays a whole word
    expect((await probe('/search?q=leath%20sneakers&view=probe')).results_count).toBe(0)
  })

  it('puts unavailable products last, in place or nowhere, as the option says', async () => {
    const data = soldOut('canvas-sneakers')
    const search = (option: string) => probe(`/search?q=sneakers${option}&view=probe`, data)
    expect(handles(await search(''))).toEqual(['white-leather-sneakers', 'gray-leather-sneakers', 'high-top-sneakers', 'canvas-sneakers'])
    expect(handles(await search('&options%5Bunavailable_products%5D=last'))).toEqual(['white-leather-sneakers', 'gray-leather-sneakers', 'high-top-sneakers', 'canvas-sneakers'])
    expect(handles(await search('&options%5Bunavailable_products%5D=show'))).toEqual(['canvas-sneakers', 'white-leather-sneakers', 'gray-leather-sneakers', 'high-top-sneakers'])
    const hidden = await search('&options%5Bunavailable_products%5D=hide')
    expect([handles(hidden), hidden.results_count]).toEqual([['white-leather-sneakers', 'gray-leather-sneakers', 'high-top-sneakers'], 3])
    const stock = hidden.filters.find((f: any) => f.param_name === 'filter.v.availability')
    expect(stock.values.map((value: any) => [value.value, value.count])).toEqual([['1', 3], ['0', 1]])
  })

  it('sorts by price, the non-products after the products and the unavailable products last among them', async () => {
    const ascending = await probe('/search?q=shirt&sort_by=price-ascending&view=probe')
    expect([ascending.sort_by, handles(ascending)]).toEqual(['price-ascending', ['workout-shirt', 'men-t-shirt', 'women-t-shirt', 'news/new-line-of-tennis-products', 'news/liquidpeak-450']])
    // descending is the exact reverse of ascending, ties included
    expect(handles(await probe('/search?q=shirt&sort_by=price-descending&view=probe'))).toEqual(['women-t-shirt', 'men-t-shirt', 'workout-shirt', 'news/new-line-of-tennis-products', 'news/liquidpeak-450'])
    const mixed = await probe('/search?q=shirt&sort_by=price-ascending&view=probe', soldOut('workout-shirt'))
    expect(handles(mixed)).toEqual(['men-t-shirt', 'women-t-shirt', 'workout-shirt', 'news/new-line-of-tennis-products', 'news/liquidpeak-450'])
    const shown = await probe('/search?q=shirt&sort_by=price-descending&options%5Bunavailable_products%5D=show&view=probe', soldOut('men-t-shirt'))
    expect(handles(shown)).toEqual(['women-t-shirt', 'men-t-shirt', 'workout-shirt', 'news/new-line-of-tennis-products', 'news/liquidpeak-450'])
  })

  it('reads a sort the search does not offer as relevance', async () => {
    const body = await probe('/search?q=shirt&sort_by=title-ascending&view=probe')
    expect([body.sort_by, handles(body).slice(0, 3)]).toEqual(['relevance', ['men-t-shirt', 'women-t-shirt', 'workout-shirt']])
  })

  it('narrows the products by the filters and counts every filter\'s values over the unfiltered matches', async () => {
    const body = await probe('/search?q=sneakers&filter.v.option.size=12&filter.p.tag=accessories&view=probe')
    expect(handles(body)).toEqual(['canvas-sneakers', 'gray-leather-sneakers'])
    const filters = (param: string) => body.filters.find((f: any) => f.param_name === param)
    expect(filters('filter.p.tag').active_values).toEqual(['accessories'])
    // the size filter's other values count the products that also pass the tag filter
    expect(filters('filter.v.option.size').values.map((value: any) => [value.value, value.count])).toContainEqual(['4', 3])
    expect(filters('filter.v.option.size').active_values).toEqual(['12'])
  })

  it('keeps the whole query in the filters\' links, under the locale prefix', async () => {
    const filters = await searchJson('/fr-ca/search?q=shirt&sort_by=price-ascending&filter.p.vendor=Mock.shop&view=probe', 'search.filters')
    const brand = filters.find((f: any) => f.param_name === 'filter.p.vendor')
    expect(brand.url_to_remove).toBe('/fr-ca/search?q=shirt&sort_by=price-ascending&view=probe')
    expect(brand.values[0].url_to_remove).toBe('/fr-ca/search?q=shirt&sort_by=price-ascending&view=probe')
    expect(filters.find((f: any) => f.param_name === 'filter.p.product_type').values[0].url_to_add).toBe('/fr-ca/search?filter.p.product_type=T-shirts&filter.p.vendor=Mock.shop&q=shirt&sort_by=price-ascending&view=probe')
  })

  it('has no price filter, and ignores its bounds, in a currency other than the shop\'s', async () => {
    const own = await probe('/search?q=sneakers&filter.v.price.lte=50&view=probe')
    expect(own.results_count).toBeLessThan(4)
    expect(own.filters.map((f: any) => f.param_name)).toContain('filter.v.price')
    const canadian = await probe('/en-ca/search?q=sneakers&filter.v.price.lte=50&view=probe')
    expect(canadian.results_count).toBe(4)
    expect(canadian.filters.map((f: any) => f.param_name)).not.toContain('filter.v.price')
  })

  it('links a product the variant filters narrow to its first matching variant', async () => {
    // read as a template reads it: a product result prints through `json` as a built product does (final review B, M2), which has no `url`
    const urls = (url: string) => searchPage(url, '{% for r in search.results %}{{ r.handle }}={{ r.url }};{% endfor %}')
    expect((await urls('/search?q=sneakers&filter.v.option.size=12')).replace(/\d+(?=;)/g, '<id>')).toBe('canvas-sneakers=/products/canvas-sneakers?variant=<id>;gray-leather-sneakers=/products/gray-leather-sneakers?variant=<id>;')
    // a product whose every variant passes keeps its own address
    expect(await urls('/search?q=sneakers&filter.v.availability=1')).toContain('canvas-sneakers=/products/canvas-sneakers;')
  })

  it('extends the links of a request built by hand, with no query, in place', () => {
    const store = buildStore(storefrontSampleData)
    const search = buildSearch(store, 'shirt', { sortBy: 'price-ascending', filters: [['filter.p.vendor', 'Mock.shop']] }) as any
    const brand = search.filters.find((f: any) => f.param_name === 'filter.p.vendor')
    expect(brand.url_to_remove).toBe('/search?q=shirt&sort_by=price-ascending')
    expect(search.filters.find((f: any) => f.param_name === 'filter.p.product_type').values[0].url_to_add).toBe('/search?q=shirt&filter.p.product_type=T-shirts&filter.p.vendor=Mock.shop&sort_by=price-ascending')
    expect(search.results.map((result: any) => result.handle)).toEqual(['workout-shirt', 'men-t-shirt', 'women-t-shirt', 'news/new-line-of-tennis-products', 'news/liquidpeak-450'])
  })

  it('keeps the terms in the links of a request built by hand with a query that has none', () => {
    const search = buildSearch(buildStore(storefrontSampleData), 'shirt', { query: [['view', 'probe']] }) as any
    expect(search.filters.find((f: any) => f.param_name === 'filter.p.product_type').values[0].url_to_add).toBe('/search?filter.p.product_type=T-shirts&q=shirt&view=probe')
  })

  it('gives each search its own types', () => {
    const store = buildStore(storefrontSampleData)
    const first = buildSearch(store, 'shirt') as any
    first.types.push('other')
    expect((buildSearch(store, 'shirt') as any).types).toEqual(['article', 'page', 'product'])
  })

  it('paginates the results, the links keeping the query', async () => {
    const url = '/search?q=sneakers&type=product&sort_by=price-descending&filter.p.vendor=Mock.shop&options%5Bunavailable_products%5D=show'
    const html = await searchPage(`${url}&page=1`, '{% paginate search.results by 2 %}{{ paginate.items }}|{{ paginate.pages }}|{{ paginate.next.url }}{% for r in search.results %}|{{ r.handle }}{% endfor %}{% endpaginate %}')
    expect(html).toBe('4|2|/search?filter.p.vendor=Mock.shop&options%5Bunavailable_products%5D=show&page=2&q=sneakers&sort_by=price-descending&type=product|gray-leather-sneakers|high-top-sneakers')
  })
})
