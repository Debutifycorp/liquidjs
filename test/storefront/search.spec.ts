import { readdirSync } from 'fs'
import { join } from 'path'
import { renderPage, requestFromUrl, storefrontSampleData } from '../../src/shopify'
import type { StoreData } from '../../src/shopify'
import { buildStore } from '../../src/shopify/store/build'
import { HandleMap } from '../../src/shopify/objects/handle-map'
import { buildSearch } from '../../src/shopify/store/search'
import { parseQuery } from '../../src/shopify/store/search-query'
import { encodeQueryComponent } from '../../src/shopify/util/query'
import { loadFixture } from './fixtures'
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

// the query syntax: fixtures `probe-search-q-*` record what the parity store finds for each query (see `buildSearch`). Its search index lacks the product `men-crewneck`, which no query finds (every query that finds the store's other 28 products finds 28), so it is taken out of the data; how it ranks what it finds is its own and the probe prints only the first ten, so the count and the filters (whose counts walk every match) are compared exactly, the recorded results must be among ours, and a query with ten results or fewer must find exactly those.
describe('search queries with syntax', () => {
  const names = readdirSync(join(__dirname, 'fixtures')).filter(file => file.startsWith('probe-search-q-')).map(file => file.replace(/\.json$/, ''))
  const indexed = (): StoreData => {
    const data = structuredClone(storefrontSampleData) as StoreData
    data.products = data.products!.filter(product => product.handle !== 'men-crewneck')
    return data
  }
  it('has the recorded queries', () => {
    expect(names.length).toBeGreaterThanOrEqual(34)
  })
  for (const name of names) {
    it(`finds what the parity store finds for ${name}`, async () => {
      const recorded = loadFixture(name).steps[0]
      const expected = recorded.body as any
      const data = indexed()
      const actual = await probe(recorded.url, data)
      const found = await searchJson(recorded.url, 'search.results | map: "handle"', data) as string[]
      expect(actual.terms).toBe(expected.terms)
      // the store matches `and` in the text of white-leather-sneakers too, which has no description here: one more product than the dataset's texts hold
      if (name === 'probe-search-q-and-word') {
        expect(actual.results_count).toBe(expected.results_count - 1)
        return
      }
      expect(actual.results_count).toBe(expected.results_count)
      expect(actual.filters).toEqual(expected.filters)
      const recordedHandles = expected.results.map((result: any) => result.handle)
      expect(found).toEqual(expect.arrayContaining(recordedHandles))
      if (expected.results_count <= 10) expect([...found].sort()).toEqual([...recordedHandles].sort())
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

  it('treats only the last term as a partial word, and finds what holds either term, what holds both first', async () => {
    expect(handles(await probe('/search?q=leather%20sneak&view=probe'))).toEqual(['white-leather-sneakers', 'gray-leather-sneakers', 'canvas-sneakers', 'high-top-sneakers'])
    expect(handles(await probe('/search?q=leather%20sneak&options%5Bprefix%5D=none&view=probe'))).toEqual(['white-leather-sneakers', 'gray-leather-sneakers'])
    // the first term stays a whole word
    expect(handles(await probe('/search?q=leath%20sneakers&view=probe'))).toEqual(['canvas-sneakers', 'white-leather-sneakers', 'gray-leather-sneakers', 'high-top-sneakers'])
    expect((await probe('/search?q=leath%20sneak&view=probe')).results_count).toBe(4)
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

describe('search: the work a request causes (final review B, I1 and M3)', () => {
  /** Counts the reads of `key` on every built product of `store`. */
  const countReads = (store: ReturnType<typeof buildStore>, key: string) => {
    const counter = { reads: 0 }
    for (const product of HandleMap.values(store.products)) {
      const value = product[key]
      Object.defineProperty(product, key, { get () { counter.reads++; return value }, enumerable: true, configurable: true })
    }
    return counter
  }

  it('builds the filters when a template reads them, once, and not when it reads the count', () => {
    const store = buildStore(structuredClone(storefrontSampleData) as StoreData)
    // only the filters read a product's `options`: the matching and the sorting do not (a result's copy would, so the results are not read before)
    const options = countReads(store, 'options')
    const search = buildSearch(store, 'shirt', { query: [['q', 'shirt'], ['sort_by', 'price-ascending']] }) as any
    expect(search.results_count).toBeGreaterThan(0)
    expect(options.reads).toBe(0)
    expect(search.filters.length).toBeGreaterThan(0)
    const first = options.reads
    expect(first).toBeGreaterThan(0)
    expect(search.filters).toBe(search.filters)
    expect(options.reads).toBe(first)
    // the results are made when read, and kept
    expect(search.results).toHaveLength(search.results_count)
    expect(search.results).toBe(search.results)
  })

  it('tokenises a product once per built store, not on every search', () => {
    const store = buildStore(structuredClone(storefrontSampleData) as StoreData)
    // a term no word starts with finds nothing, so only the tokenising reads the description
    const description = countReads(store, 'description')
    buildSearch(store, 'zzzz')
    const first = description.reads
    expect(first).toBe(HandleMap.values(store.products).length)
    buildSearch(store, 'zzzz')
    buildSearch(store, 'qqqq')
    expect(description.reads).toBe(first)
  })

  it('finds the same products on a second search, by whole word or by the start of the last word', () => {
    const store = buildStore(storefrontSampleData)
    const handles = (terms: string, request = {}) => (buildSearch(store, terms, request) as any).results.map((result: any) => result.handle)
    for (let round = 0; round < 2; round++) {
      expect(handles('sneak')).toEqual(expect.arrayContaining(['canvas-sneakers', 'high-top-sneakers']))
      expect(handles('sneak', { search: { prefix: 'none' } })).toEqual([])
      expect(handles('sneakers')).toEqual(expect.arrayContaining(['canvas-sneakers']))
    }
  })
})

describe('the syntax of a query', () => {
  it('reads a query with no syntax as its words, an uppercase AND or OR among them', () => {
    expect(parseQuery('gray sneakers')).toEqual({ words: ['gray', 'sneakers'] })
    expect(parseQuery('gray AND sneakers or boots')).toEqual({ words: ['gray', 'AND', 'sneakers', 'or', 'boots'] })
    expect(parseQuery('title: hoodie')).toEqual({ words: ['hoodie'] })
  })

  it('reads fields, phrases, negations, groups and the precedence of OR', () => {
    expect(parseQuery('tag:women AND (title:shirt OR title:leggings)').tree).toEqual({
      type: 'and',
      items: [{ type: 'field', field: 'tag', value: 'women' }, { type: 'or', items: [{ type: 'field', field: 'title', value: 'shirt' }, { type: 'field', field: 'title', value: 'leggings' }] }]
    })
    expect(parseQuery('a OR b tag:c').tree).toEqual({ type: 'and', items: [{ type: 'or', items: [{ type: 'word', word: 'a' }, { type: 'word', word: 'b' }] }, { type: 'field', field: 'tag', value: 'c' }] })
    expect(parseQuery('sneakers -leather NOT gray').tree).toEqual({ type: 'and', items: [{ type: 'word', word: 'sneakers' }, { type: 'not', item: { type: 'word', word: 'leather' } }, { type: 'not', item: { type: 'word', word: 'gray' } }] })
    expect(parseQuery('title:"gray leather" \'blue sky\'').tree).toEqual({ type: 'and', items: [{ type: 'field', field: 'title', value: 'gray leather' }, { type: 'phrase', phrase: 'blue sky' }] })
  })

  it('keeps a hyphen inside a word and ignores wildcards and comparisons', () => {
    expect(parseQuery('t-shirt')).toEqual({ words: ['t-shirt'] })
    expect(parseQuery('hood*').tree).toEqual({ type: 'neutral' })
    expect(parseQuery('id:<5').tree).toEqual({ type: 'neutral' })
  })

  it('survives a query that is broken', () => {
    for (const text of ['(', ')', '((a)', 'a OR', 'OR a', '-', 'NOT', '"unterminated', 'tag:', 'AND AND']) expect(() => parseQuery(text)).not.toThrow()
  })

  it('writes a query component as Shopify\'s links do', () => {
    expect(encodeQueryComponent('a b+c(d)*\'!-._~é')).toBe('a+b%2Bc%28d%29%2A%27%21-._~%C3%A9')
  })
})
