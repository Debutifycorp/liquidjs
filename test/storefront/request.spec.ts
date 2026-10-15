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
  it('reads every recorded probe address without throwing, to a known template', () => {
    const templates = new Set(['index', 'product', 'collection', 'list-collections', 'page', 'blog', 'article', 'search', 'cart', 'password', '404'])
    for (const file of readdirSync(join(__dirname, 'fixtures'))) {
      for (const step of loadFixture(file.replace(/\.json$/, '')).steps) {
        if (step.method !== 'GET' || /\.js(on)?(\?|$)/.test(step.url)) continue
        expect(templates).toContain(requestFromUrl(step.url, data).templateName)
      }
    }
  })
})
