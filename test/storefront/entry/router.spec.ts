import { storefrontSampleData as data } from '../../../src/shopify'
import { routeRequest } from '../../../src/storefront/router'

const kind = (method: string, url: string, basePath = '') => routeRequest(method, url, data, { basePath }).route

describe('routeRequest', () => {
  it('routes pages through the engine\'s reading of the address', () => {
    expect(kind('GET', '/products/hoodie')).toMatchObject({ kind: 'page', page: { templateName: 'product', request: { resource: 'hoodie' } } })
    expect(kind('HEAD', '/collections/tops?sort_by=price-ascending')).toMatchObject({ kind: 'page', page: { templateName: 'collection', request: { sortBy: 'price-ascending' } } })
    expect(kind('GET', '/products/hoodie?section_id=main')).toMatchObject({ kind: 'page', sectionId: 'main' })
    expect(kind('GET', '/?sections=a,b')).toMatchObject({ kind: 'page', sections: ['a', 'b'] })
    expect(kind('GET', '/search/suggest?q=ca&section_id=predictive-search')).toMatchObject({ kind: 'page', sectionId: 'predictive-search', page: { request: { predictive: { q: 'ca' } } } })
    expect(kind('GET', '/nope')).toMatchObject({ kind: 'not-found' })
    expect(kind('POST', '/products/hoodie')).toMatchObject({ kind: 'not-found' })
  })
  it('routes the Ajax and form endpoints', () => {
    expect(kind('GET', '/cart.js')).toEqual({ kind: 'cart-json' })
    expect(kind('GET', '/cart.json')).toEqual({ kind: 'cart-json' })
    for (const action of ['add', 'change', 'update', 'clear'] as const) {
      expect(kind('POST', `/cart/${action}.js`)).toEqual({ kind: 'cart', action, format: 'js' })
      expect(kind('POST', `/cart/${action}`)).toEqual({ kind: 'cart', action, format: 'form' })
    }
    expect(kind('POST', '/cart')).toEqual({ kind: 'cart', action: 'update', format: 'form' })
    expect(kind('GET', '/cart/change?line=1&quantity=0')).toEqual({ kind: 'cart', action: 'change', format: 'form' })
    expect(kind('GET', '/discount/WELCOME10?redirect=/cart.js')).toEqual({ kind: 'discount', code: 'WELCOME10', redirect: '/cart.js' })
    // Shopify answers /variants/<id> with a 302 to its product page and drops the rest of the query (fixture `flow-variant-route`), so it is a redirect and not a page; an unknown variant is a 404 like any unknown address (no recording)
    expect(kind('GET', '/variants/43695846653974?view=probe')).toEqual({ kind: 'variant', handle: 'hoodie', variant: 43695846653974 })
    expect(kind('GET', '/variants/1')).toMatchObject({ kind: 'not-found' })
    expect(kind('POST', '/cart/prepare_shipping_rates.json')).toEqual({ kind: 'shipping', action: 'prepare' })
    expect(kind('GET', '/cart/async_shipping_rates.json')).toEqual({ kind: 'shipping', action: 'async' })
    expect(kind('GET', '/cart/shipping_rates.json')).toEqual({ kind: 'shipping', action: 'rates' })
    expect(kind('GET', '/products/hoodie.js')).toEqual({ kind: 'product-json', handle: 'hoodie' })
    expect(kind('GET', '/search/suggest.json?q=ca')).toMatchObject({ kind: 'suggest-json' })
    expect(kind('GET', '/recommendations/products.json?product_id=10489561382934')).toMatchObject({ kind: 'recommendations-json' })
    expect(kind('POST', '/contact')).toEqual({ kind: 'contact' })
    expect(kind('POST', '/localization')).toEqual({ kind: 'localization' })
    expect(kind('POST', '/password')).toEqual({ kind: 'password' })
    for (const url of ['/checkout', '/checkouts/cn/abc', '/account', '/account/login', '/account/addresses/1']) {
      expect(kind('GET', url)).toEqual({ kind: 'notice', notice: url.startsWith('/account') ? 'account' : 'checkout' })
    }
    expect(kind('POST', '/account/login')).toEqual({ kind: 'notice', notice: 'account' })
  })
  it('strips the base path and the locale prefix first', () => {
    const routed = routeRequest('POST', '/p/tok/fr-ca/cart/add.js', data, { basePath: '/p/tok' })
    expect(routed).toMatchObject({ route: { kind: 'cart', action: 'add', format: 'js' }, localePrefix: '/fr-ca', market: 'ca', language: 'fr' })
    expect(routeRequest('GET', '/p/tok', data, { basePath: '/p/tok' }).route).toMatchObject({ kind: 'page', page: { templateName: 'index' } })
    expect(routeRequest('GET', '/elsewhere', data, { basePath: '/p/tok' }).route).toMatchObject({ kind: 'not-found' })
  })
  it('reads the address as the engine does: trailing slashes, a base path in any spelling, a host-less `//` address', () => {
    expect(kind('POST', '/cart/add.js/')).toEqual({ kind: 'cart', action: 'add', format: 'js' })
    expect(kind('GET', '/checkout/')).toEqual({ kind: 'notice', notice: 'checkout' })
    expect(kind('GET', 'https://store.example/products/hoodie.js?x=1')).toEqual({ kind: 'product-json', handle: 'hoodie' })
    // an address that opens with `//` is a path, not a host
    expect(kind('GET', '//cart.js')).toEqual({ kind: 'cart-json' })
    // a `Request.url` is absolute, and empty segments are dropped there as the engine drops them for pages
    expect(kind('GET', 'http://x//cart.js')).toEqual({ kind: 'cart-json' })
    expect(kind('GET', 'http://x//products//hoodie.js')).toEqual({ kind: 'product-json', handle: 'hoodie' })
    expect(kind('GET', 'http://x//products/hoodie')).toMatchObject({ kind: 'page', page: { templateName: 'product' } })
    expect(kind('POST', 'http://x/p/tok//cart//add.js', '/p/tok')).toEqual({ kind: 'cart', action: 'add', format: 'js' })
    expect(kind('GET', 'http://x//checkout')).toEqual({ kind: 'notice', notice: 'checkout' })
    expect(routeRequest('GET', 'http://x/p/tok/fr-ca//cart.js', data, { basePath: '/p//tok/' })).toMatchObject({ route: { kind: 'cart-json' }, localePrefix: '/fr-ca', language: 'fr' })
    // the engine finds a locale prefix only as the first segment after the base path, so one behind an empty segment is no prefix, for a page and a route alike
    expect(kind('GET', 'http://x/p/tok//fr-ca/cart.js', '/p/tok')).toMatchObject({ kind: 'not-found' })
    expect(kind('GET', 'http://x/p/tok//fr-ca/products/hoodie', '/p/tok')).toMatchObject({ kind: 'not-found' })
    for (const basePath of ['p/tok', '/p/tok/', '/p/tok']) {
      expect(kind('GET', '/p/tok/products/hoodie.js', basePath)).toEqual({ kind: 'product-json', handle: 'hoodie' })
    }
    expect(kind('GET', '/p/%74ok/cart.js', '/p/tok')).toEqual({ kind: 'cart-json' })
    // a base path is matched by whole segments, and a locale prefix outside it is not the store's
    expect(kind('GET', '/p/token/cart.js', '/p/tok')).toMatchObject({ kind: 'not-found' })
    expect(kind('GET', '/fr-ca/cart.js', '/p/tok')).toMatchObject({ kind: 'not-found' })
    expect(kind('POST', '/cart/add.js', '/p/tok')).toMatchObject({ kind: 'not-found' })
  })
  it('answers an address outside the base path with the store\'s own 404 page, whatever that address says', () => {
    const outside = routeRequest('GET', '/fr-ca/cart.js', data, { basePath: '/p/tok' })
    expect(outside).toMatchObject({ route: { kind: 'not-found', page: { templateName: '404', locale: 'en', request: { path: '/p/tok', basePath: '/p/tok', localePrefix: '', market: 'us', language: 'en' } } }, localePrefix: '', market: 'us', language: 'en' })
    expect(routeRequest('GET', '/p/TOK/cart.js', data, { basePath: '/p/tok' }).route).toMatchObject({ kind: 'not-found', page: { request: { path: '/p/tok' } } })
  })
  it('keeps the locale prefix off every route, and the market and language it names', () => {
    expect(routeRequest('GET', '/en-ca/cart.js', data, { basePath: '' })).toMatchObject({ route: { kind: 'cart-json' }, localePrefix: '/en-ca', market: 'ca', language: 'en' })
    expect(routeRequest('GET', '/fr-eu/products/hoodie.js', data, { basePath: '' })).toMatchObject({ route: { kind: 'product-json', handle: 'hoodie' }, localePrefix: '/fr-eu', market: 'eu', language: 'fr' })
    expect(routeRequest('GET', '/en-ca/search/suggest.json?q=ca', data, { basePath: '' })).toMatchObject({ route: { kind: 'suggest-json', page: { templateName: 'search', locale: 'en', request: { localePrefix: '/en-ca', market: 'ca' } } } })
    expect(routeRequest('GET', '/products/hoodie', data, { basePath: '' })).toMatchObject({ localePrefix: '', market: 'us', language: 'en' })
    expect(routeRequest('GET', '/en-ca/cart/change?id=1:abc&quantity=0', data, { basePath: '' }).query.get('quantity')).toBe('0')
    expect(routeRequest('GET', '/?sections=a', data, { basePath: '' }).query.get('sections')).toBe('a')
  })
  it('turns a malformed address into a 404 and an empty code into nothing, never a throw', () => {
    expect(kind('GET', '/products/%E0%A4%A.js')).toMatchObject({ kind: 'product-json', handle: '%E0%A4%A' })
    expect(kind('GET', '/discount/%E0%A4%A')).toMatchObject({ kind: 'discount', code: '%E0%A4%A' })
    expect(kind('GET', '/discount/%57ELCOME10')).toMatchObject({ kind: 'discount', code: 'WELCOME10', redirect: null })
    expect(kind('GET', '/discount/')).toMatchObject({ kind: 'not-found' })
    expect(kind('GET', '/p/%E0%A4%A/cart.js', '/p/tok')).toMatchObject({ kind: 'not-found' })
    expect(kind('GET', '/variants/abc')).toMatchObject({ kind: 'not-found' })
  })
  it('reads a long run of slashes in linear time, whatever follows it', () => {
    routeRequest('GET', 'http://x/cart', data, { basePath: '' })
    for (const tail of ['x', '', '/']) {
      for (const [method, url] of [['GET', `http://x/cart${'/'.repeat(64000)}${tail}`], ['POST', `http://x/cart/add.js${'/'.repeat(64000)}${tail}`], ['GET', `http://x/p/tok${'/'.repeat(64000)}${tail}`]]) {
        const start = performance.now()
        const routed = routeRequest(method, url, data, { basePath: '/p/tok' })
        const elapsed = performance.now() - start
        expect([url.slice(0, 24), tail, routed.route.kind, elapsed < 50]).toEqual([url.slice(0, 24), tail, expect.any(String), true])
      }
    }
    const start = performance.now()
    const routed = routeRequest('GET', `http://x/cart${'/'.repeat(64000)}x`, data, { basePath: '' })
    expect(routed.route).toMatchObject({ kind: 'not-found' })
    expect(performance.now() - start).toBeLessThan(50)
  })
  it('answers the methods an endpoint does not take with a 404, whatever the endpoint', () => {
    expect(kind('GET', '/cart/add.js')).toMatchObject({ kind: 'not-found' })
    expect(kind('POST', '/cart.js')).toMatchObject({ kind: 'not-found' })
    expect(kind('GET', '/contact')).toMatchObject({ kind: 'not-found' })
    expect(kind('GET', '/localization')).toMatchObject({ kind: 'not-found' })
    expect(kind('POST', '/cart/prepare_shipping_rates.json')).toEqual({ kind: 'shipping', action: 'prepare' })
    expect(kind('GET', '/cart/prepare_shipping_rates.json')).toMatchObject({ kind: 'not-found' })
    expect(kind('post', '/cart/add.js')).toEqual({ kind: 'cart', action: 'add', format: 'js' })
  })
})
