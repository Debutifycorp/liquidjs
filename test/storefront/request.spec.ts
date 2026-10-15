import { readdirSync } from 'fs'
import { join } from 'path'
import { requestFromUrl, localePrefixes, storefrontSampleData as data } from '../../src/shopify'
import { loadFixture } from './fixtures'

describe('requestFromUrl', () => {
  it('maps every storefront page path to its template and resource', () => {
    const cases: Array<[string, string, string | undefined]> = [
      ['/', 'index', undefined],
      ['/products/hoodie', 'product', 'hoodie'],
      ['/collections', 'list-collections', undefined],
      ['/collections/tops', 'collection', 'tops'],
      ['/collections/tops/products/men-t-shirt', 'product', 'men-t-shirt'],
      ['/collections/vendors?q=Mock.shop', 'collection', 'vendors'],
      ['/collections/types?q=Hoodies', 'collection', 'types'],
      ['/pages/about', 'page', 'about'],
      ['/blogs/news', 'blog', 'news'],
      ['/blogs/news/tagged/collections', 'blog', 'news'],
      ['/blogs/news/making-liquid', 'article', 'news/making-liquid'],
      ['/search?q=shirt', 'search', undefined],
      ['/cart', 'cart', undefined],
      ['/recommendations/products?product_id=10489561382934&limit=4&intent=related', 'index', undefined],
      ['/password', 'password', undefined],
      ['/policies/refund-policy', '404', undefined],
      ['/nope', '404', undefined]
    ]
    for (const [url, templateName, resource] of cases) {
      const page = requestFromUrl(url, data)
      expect([url, page.templateName, page.request.resource]).toEqual([url, templateName, resource])
    }
  })
  it('reads the query: variant, selling plan, view, sort, filters, tags, page, search options', () => {
    const page = requestFromUrl('/collections/all/men+shoes?view=probe&sort_by=price-ascending&filter.v.availability=1&filter.p.vendor=A&filter.p.vendor=B%20C&page=2', data)
    expect(page.request).toMatchObject({ resource: 'all', view: 'probe', sortBy: 'price-ascending', page: 2, tags: ['men', 'shoes'], filters: [['filter.v.availability', '1'], ['filter.p.vendor', 'A'], ['filter.p.vendor', 'B C']] })
    expect(requestFromUrl('/products/slides?variant=43695710404630&selling_plan=71001', data).request).toMatchObject({ variant: 43695710404630, sellingPlan: 71001 })
    expect(requestFromUrl('/search?q=sneakers&type=product,page&options%5Bprefix%5D=none&options%5Bunavailable_products%5D=hide', data).request).toMatchObject({ searchTerms: 'sneakers', search: { types: ['product', 'page'], prefix: 'none', unavailable: 'hide' } })
  })
  it('keeps every query pair in order, and reads a product opened from a collection', () => {
    expect(requestFromUrl('/search?q=a&q=b&x=%20y', data).request.query).toEqual([['q', 'a'], ['q', 'b'], ['x', ' y']])
    expect(requestFromUrl('/collections/tops/products/men-t-shirt', data).request.collection).toBe('tops')
  })
  it('names no page for /variants/<id>, which Shopify answers with a redirect (part S routes it)', () => {
    // fixture `flow-variant-route`: a 302 to /products/hoodie?variant=43695846653974, so there is no template to render
    expect(requestFromUrl('/variants/43695846653974', data).templateName).toBe('404')
  })
  it('does not throw on an address with a malformed escape', () => {
    expect(requestFromUrl('/products/%E0%A4%A', data).templateName).toBe('product')
  })
  it('reads predictive search parameters with Shopify\'s defaults', () => {
    const page = requestFromUrl('/search/suggest?q=ca&resources%5Btype%5D=product,collection&resources%5Blimit%5D=4', data)
    expect(page.templateName).toBe('search')
    expect(page.request.predictive).toEqual({ q: 'ca', types: ['product', 'collection'], limit: 4, limitScope: 'all', fields: ['title', 'product_type', 'variants.title', 'vendor'], unavailable: 'last' })
    // no `resources[type]`: no articles (fixture `ajax-suggest-json`, step 2)
    expect(requestFromUrl('/search/suggest?q=zzz', data).request.predictive?.types).toEqual(['collection', 'page', 'product', 'query'])
  })
  it('clamps the predictive limit to 1 to 10, reads an empty one as 10, and reads scope, fields and unavailable products', () => {
    const read = (query: string) => requestFromUrl(`/search/suggest?q=ca&${query}`, data).request.predictive
    expect(read('resources%5Blimit%5D=99')?.limit).toBe(10)
    expect(read('resources%5Blimit%5D=0')?.limit).toBe(1)
    expect(read('resources%5Blimit%5D=')?.limit).toBe(10)
    expect(read('resources%5Blimit%5D=x')?.limit).toBe(10)
    expect(read('resources%5Blimit_scope%5D=each')?.limitScope).toBe('each')
    expect(read('resources%5Blimit_scope%5D=other')?.limitScope).toBe('all')
    expect(read('resources%5Boptions%5D%5Bfields%5D=title,vendor')?.fields).toEqual(['title', 'vendor'])
    expect(read('resources%5Boptions%5D%5Bunavailable_products%5D=hide')?.unavailable).toBe('hide')
    expect(read('resources%5Boptions%5D%5Bunavailable_products%5D=other')?.unavailable).toBe('last')
  })
  it('strips the base path and the locale prefix, and picks the market and language', () => {
    expect(localePrefixes(data).map(p => p.prefix)).toEqual(['/en-ca', '/fr-ca', '/en-eu', '/fr-eu'])
    const page = requestFromUrl('/p/tok/fr-ca/products/hoodie', data, { basePath: '/p/tok' })
    expect(page).toMatchObject({ templateName: 'product', locale: 'fr', request: { resource: 'hoodie', basePath: '/p/tok', localePrefix: '/fr-ca', market: 'ca', language: 'fr', path: '/p/tok/fr-ca/products/hoodie' } })
    expect(requestFromUrl('/products/hoodie', data)).toMatchObject({ locale: 'en', request: { market: 'us', language: 'en', localePrefix: '' } })
  })
  it('reads a successful form from Shopify\'s redirect query', () => {
    expect(requestFromUrl('/pages/about?contact_posted=true', data).request.form).toEqual({ type: 'contact', posted: true })
    expect(requestFromUrl('/?customer_posted=true', data).request.form).toEqual({ type: 'customer', posted: true })
    expect(requestFromUrl('/pages/about', data).request.form).toBeUndefined()
  })
  it('keeps a visitor\'s chosen country inside the primary market', () => {
    expect(requestFromUrl('/', data, { country: 'US' }).request.country).toBe('US')
    expect(requestFromUrl('/en-ca', data, { country: 'US' }).request.country).toBe('CA')
  })
  it('reads the rest of the search page, the vendor and type lists, blog tags and the recommendations request', () => {
    expect(requestFromUrl('/search?q=shi&options%5Bprefix%5D=last', data).request.search).toEqual({ types: undefined, prefix: 'last', unavailable: undefined })
    expect(requestFromUrl('/collections/vendors?q=Mock.shop', data).request.searchTerms).toBe('Mock.shop')
    expect(requestFromUrl('/blogs/news/tagged/collections', data).request.tags).toEqual(['collections'])
    expect(requestFromUrl('/blogs/news/tagged/news+breaking', data).request.tags).toEqual(['news', 'breaking'])
    expect(requestFromUrl('/recommendations/products?product_id=10489561382934&limit=4&intent=related', data).request.recommendations).toEqual({ productId: '10489561382934', limit: '4', intent: 'related' })
    expect(requestFromUrl('/collections/all', data).request.filters).toEqual([])
    expect(requestFromUrl('/collections/all', data).request.tags).toBeUndefined()
  })
  it('reads only an address of the exact length as a page', () => {
    for (const url of ['/collections/a/products/b/extra', '/blogs/news/tagged/x/extra', '/blogs/news/making-liquid/extra', '/collections/all/a/b', '/products/x/extra', '/pages/about/extra', '/search/suggest/extra']) {
      expect([url, requestFromUrl(url, data).templateName]).toEqual([url, '404'])
    }
  })
  it('counts pages from 1', () => {
    expect(requestFromUrl('/collections/all?page=0', data).request.page).toBeUndefined()
    expect(requestFromUrl('/collections/all?page=-1', data).request.page).toBeUndefined()
    expect(requestFromUrl('/collections/all?page=1', data).request.page).toBe(1)
  })
  it('splits the path before decoding it, and keeps the encoded path for links', () => {
    const encoded = requestFromUrl('/products/a%2Fb', data)
    expect(encoded).toMatchObject({ templateName: 'product', request: { resource: 'a/b', path: '/products/a%2Fb' } })
    expect(requestFromUrl('/collections/all/men%2Bshoes', data).request.tags).toEqual(['men+shoes'])
    expect(requestFromUrl('/collections/all/men+shoes', data).request.tags).toEqual(['men', 'shoes'])
    expect(requestFromUrl('/pages/a%20b', data)).toMatchObject({ templateName: 'page', request: { resource: 'a b', path: '/pages/a%20b' } })
  })
  it('reads an address that opens with // as a path, not a host', () => {
    expect(requestFromUrl('//products/hoodie', data)).toMatchObject({ templateName: 'product', request: { resource: 'hoodie', path: '/products/hoodie' } })
  })
  it('takes a base path without its leading slash as the one with it', () => {
    const page = requestFromUrl('/p/tok/products/hoodie', data, { basePath: 'p/tok/' })
    expect(page).toMatchObject({ templateName: 'product', request: { resource: 'hoodie', basePath: '/p/tok', path: '/p/tok/products/hoodie' } })
    expect(requestFromUrl('/p/tok', data, { basePath: '/p/tok' })).toMatchObject({ templateName: 'index', request: { basePath: '/p/tok', path: '/p/tok' } })
  })
  it('lets the form the caller names win over the query', () => {
    const form = { type: 'contact', posted: false, errors: { email: ['is invalid'] } }
    expect(requestFromUrl('/pages/about?contact_posted=true', data, { form }).request.form).toEqual(form)
  })
  it('gives the market\'s first country when the visitor chose none', () => {
    expect(requestFromUrl('/', data).request.country).toBe('US')
    expect(requestFromUrl('/en-eu', data).request.country).toBe('FR')
  })
  it('reads every recorded probe address without throwing, to the page its recorded body names', () => {
    const templates = new Set(['index', 'product', 'collection', 'list-collections', 'page', 'blog', 'article', 'search', 'cart', 'password', '404'])
    // a probe body names the page it rendered: `request.page_type` (the page probe) or `template` (a name, or `{ name, suffix }`)
    const named = (body: any): string | undefined => {
      const name = body?.request?.page_type ?? (typeof body?.template === 'string' ? body.template : body?.template?.name)
      return typeof name === 'string' ? name.split('.')[0] : undefined
    }
    let checked = 0
    for (const file of readdirSync(join(__dirname, 'fixtures'))) {
      for (const step of loadFixture(file.replace(/\.json$/, '')).steps) {
        if (step.method !== 'GET' || /\.js(on)?(\?|$)/.test(step.url)) continue
        const { templateName } = requestFromUrl(step.url, data)
        expect(templates).toContain(templateName)
        const recorded = named(step.body)
        if (recorded) {
          expect([step.url, templateName]).toEqual([step.url, recorded])
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(40)
  })
})
