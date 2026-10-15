import { renderPage, storefrontSampleData as data, requestFromUrl, resolveView } from '../../src/shopify'
import { HandleMap } from '../../src/shopify/objects/handle-map'
import { buildLinklists, buildStore } from '../../src/shopify/store/build'
import { ReportCollector } from '../../src/shopify/report'
import { buildGlobals, buildRoutes, ROUTES } from '../../src/shopify/store/globals'
import { buildSearch } from '../../src/shopify/store/search'
import { withPrefix } from '../../src/shopify/store/view'
import { loadFixture } from './fixtures'
import { probeMatches } from './expect-probe'
import { probeTheme } from './probe'

const PROBES = ['probe-page-home', 'probe-page-en-ca', 'probe-page-fr-ca', 'probe-page-fr-eu']

const headerTheme = (layout: string) => ({ files: { ...probeTheme().files, 'layout/theme.liquid': layout, 'templates/index.json': '{"sections":{},"order":[]}' } })

describe('views and the URL prefix', () => {
  it('builds once per view and prefixes every resource URL', () => {
    const plain = buildStore(data)
    const view = { market: 'ca', language: 'fr', prefix: '/p/tok/fr-ca' }
    const prefixed = buildStore(data, view)
    expect(buildStore(data, { ...view })).toBe(prefixed)
    expect(prefixed).not.toBe(plain)
    const hoodie = prefixed.products.liquidMethodMissing('hoodie') as Record<string, any>
    expect(hoodie.url).toBe('/p/tok/fr-ca/products/hoodie')
    expect(hoodie.variants[0].url).toBe('/p/tok/fr-ca/products/hoodie?variant=43695846621206')
    expect((plain.products.liquidMethodMissing('hoodie') as Record<string, any>).url).toBe('/products/hoodie')
  })
  it('builds the unprefixed store when no view is given, as it always has', () => {
    expect(buildStore(data)).toBe(buildStore(data, resolveView(data, {})))
    expect(resolveView(data, {})).toEqual({ market: 'us', language: 'en', prefix: '' })
  })
  it('prefixes the URLs of collections, pages, blogs and articles', () => {
    const store = buildStore(data, { market: 'ca', language: 'fr', prefix: '/fr-ca' })
    const url = (map: typeof store.pages, handle: string) => (map.liquidMethodMissing(handle) as Record<string, any>).url
    expect(url(store.collections, 'tops')).toBe('/fr-ca/collections/tops')
    expect(url(store.pages, 'about')).toBe('/fr-ca/pages/about')
    expect(url(store.blogs, 'news')).toBe('/fr-ca/blogs/news')
    const article = (store.blogs.liquidMethodMissing('news') as Record<string, any>).articles[0]
    expect(article.url).toMatch(/^\/fr-ca\/blogs\/news\/[^/]+$/)
  })
  it('keeps at most 64 views per data object, dropping the least recently used', () => {
    const own = { ...data }
    const view = (n: number) => ({ market: 'us', language: 'en', prefix: `/v${n}` })
    const built = [buildStore(own, view(0)), buildStore(own, view(1)), buildStore(own, view(2))]
    for (let n = 3; n < 64; n++) buildStore(own, view(n))
    // 64 views are all kept; reading view 0 again makes it the most recently used, so view 1 is now the least recently used
    expect(buildStore(own, view(0))).toBe(built[0])
    expect(buildStore(own, view(1))).toBe(built[1])
    expect(buildStore(own, view(0))).toBe(built[0])
    // a 65th view drops the least recently used one (view 2), and only that one
    buildStore(own, view(64))
    expect(buildStore(own, view(0))).toBe(built[0])
    expect(buildStore(own, view(1))).toBe(built[1])
    expect(buildStore(own, view(2))).not.toBe(built[2])
  })
  it('puts a prefix before a root-relative path and leaves other URLs alone', () => {
    expect(withPrefix('/fr-ca', '/products/hoodie')).toBe('/fr-ca/products/hoodie')
    expect(withPrefix('/fr-ca', '/')).toBe('/fr-ca')
    expect(withPrefix('', '/')).toBe('/')
    expect(withPrefix('', '/cart')).toBe('/cart')
    expect(withPrefix('/fr-ca', 'https://example.com/a')).toBe('https://example.com/a')
    expect(withPrefix('/fr-ca', '//cdn.example.com/a')).toBe('//cdn.example.com/a')
    expect(withPrefix('/fr-ca', '#top')).toBe('#top')
    expect(withPrefix('/fr-ca', 'mailto:a@b.c')).toBe('mailto:a@b.c')
  })
  it('writes the routes under the prefix, with the bare prefix as the root', () => {
    expect(buildRoutes('/p/tok/fr-ca').cart_add_url).toBe('/p/tok/fr-ca/cart/add')
    expect(buildRoutes('/p/tok/fr-ca').root_url).toBe('/p/tok/fr-ca')
    expect(buildRoutes('').root_url).toBe('/')
    expect(ROUTES).toEqual(buildRoutes(''))
    expect(Object.isFrozen(buildRoutes('/fr-ca'))).toBe(true)
  })
  it('matches the parity store\'s routes, request and menu URLs under a locale prefix', async () => {
    // `account_login_url` is left out: the parity store has new customer accounts, so it prints a `customer_authentication/redirect` address on the store's own domain, and customer accounts are out of scope for item 22 (the engine keeps `<prefix>/account/login`)
    const pick = (b: any) => ({
      routes: Object.fromEntries(Object.entries(b.routes).filter(([name]) => name !== 'account_login_url')),
      request: { path: b.request.path, locale_root_url: b.request.locale_root_url },
      product: b.product.url,
      collection: b.collection.url,
      menu: b.menu.map((l: any) => l.url)
    })
    for (const name of PROBES) {
      const { actual, expected } = await probeMatches(name, pick)
      expect(actual).toEqual(expected)
    }
  })
  it('puts menu links under the prefix and reads the request path under it', () => {
    const links = [
      { title: 'Home', url: '/' },
      { title: 'Shop', url: '/collections', links: [{ title: 'Tops', url: '/collections/tops' }] },
      { title: 'Hoodie', url: '/products/hoodie' },
      { title: 'Outside', url: 'https://example.com/x' }
    ]
    const lists = [{ handle: 'm', title: 'M', links }]
    const state = (path: string, prefix: string) => (HandleMap.get(buildLinklists(lists, path, prefix), 'm')!.links as any[]).map(l => [l.url, l.type, l.current, l.active, l.child_current])
    expect(state('/collections/tops', '')).toEqual([['/', 'frontpage_link', false, false, false], ['/collections', 'collections_link', false, true, true], ['/products/hoodie', 'product_link', false, false, false], ['https://example.com/x', 'http_link', false, false, false]])
    // the same page under a base path and a locale prefix: the same types and flags, and the home link is the bare prefix without being active on every page
    expect(state('/p/tok/fr-ca/collections/tops', '/p/tok/fr-ca')).toEqual([['/p/tok/fr-ca', 'frontpage_link', false, false, false], ['/p/tok/fr-ca/collections', 'collections_link', false, true, true], ['/p/tok/fr-ca/products/hoodie', 'product_link', false, false, false], ['https://example.com/x', 'http_link', false, false, false]])
    expect(state('/p/tok/fr-ca', '/p/tok/fr-ca')[0]).toEqual(['/p/tok/fr-ca', 'frontpage_link', true, true, false])
    expect(state('/p/tok/fr-ca/products/hoodie?variant=1', '/p/tok/fr-ca')[2]).toEqual(['/p/tok/fr-ca/products/hoodie', 'product_link', true, true, false])
  })
  it('puts the search filters\' URLs under the prefix', () => {
    const urls = (prefix: string) => (buildSearch(buildStore(data), 'shirt', prefix).filters as any[]).flatMap(f => [f.url_to_remove, ...(f.values ?? []).map((v: any) => v.url_to_add)])
    expect(urls('').length).toBeGreaterThan(0)
    expect(urls('').every(url => url.startsWith('/search?q=shirt'))).toBe(true)
    expect(urls('/p/tok/fr-ca').every(url => url.startsWith('/p/tok/fr-ca/search?q=shirt'))).toBe(true)
  })
  it('renders the routes, the locale root and the resource URLs of the view in a page', async () => {
    const theme = headerTheme('{{ routes.cart_url }}|{{ routes.root_url }}|{{ request.locale.root_url }}|{{ all_products.hoodie.url }}|{{ request.path }}')
    const prefixed = requestFromUrl('/p/tok/fr-ca', data, { basePath: '/p/tok' })
    expect((await renderPage({ theme, templateName: 'index', data, request: prefixed.request, locale: prefixed.locale })).html).toBe('/p/tok/fr-ca/cart|/p/tok/fr-ca|/p/tok/fr-ca|/p/tok/fr-ca/products/hoodie|/p/tok/fr-ca')
    const plain = requestFromUrl('/', data)
    expect((await renderPage({ theme, templateName: 'index', data, request: plain.request, locale: plain.locale })).html).toBe('/cart|/|/|/products/hoodie|/')
  })
  it('defaults the request path under the prefix when the caller gives none', () => {
    const request = { market: 'ca', language: 'fr', localePrefix: '/fr-ca' }
    const globals = (templateName: string, input = request) => buildGlobals({ store: buildStore(data, resolveView(data, input)), data, templateName, request: input, locale: 'fr', report: new ReportCollector() })
    const path = (templateName: string, input = request) => (globals(templateName, input).globals.request as any).path
    expect(path('index')).toBe('/fr-ca')
    expect(path('cart')).toBe('/fr-ca/cart')
    expect(path('customers/login')).toBe('/fr-ca/account/login')
    expect(path('product')).toBe(`/fr-ca/products/${data.products![0].handle}`)
    expect(path('cart', {} as typeof request)).toBe('/cart')
    expect(globals('cart').request.prefix).toBe('/fr-ca')
    expect(globals('cart', {} as typeof request).request.prefix).toBe('')
  })
  it('keeps the engine\'s own login route under the prefix', () => {
    expect(buildRoutes('/fr-ca').account_login_url).toBe('/fr-ca/account/login')
  })
  it('prefixes form actions', async () => {
    // only the localization form is compared: Shopify prints nothing for `{% form 'product', all_products['hoodie'] %}` on a page template (the probes' `product_form` is `""`), a difference carried to a later task
    const pick = (b: any) => b.localization_form.match(/action="[^"]*"/)?.[0]
    for (const name of PROBES) {
      const { actual, expected } = await probeMatches(name, pick)
      expect(actual).toEqual(expected)
    }
  })
  it('prefixes a product form with the cart route of the view', async () => {
    const theme = headerTheme('{% form \'product\', all_products[\'hoodie\'] %}{% endform %}{{ content_for_layout }}')
    const page = requestFromUrl('/fr-ca', data)
    const { html } = await renderPage({ theme, templateName: 'index', data, request: page.request, locale: page.locale })
    const step = loadFixture('probe-page-fr-ca').steps[0]
    const action = (step.body as any).routes.cart_add_url
    expect(action).toBe('/fr-ca/cart/add')
    expect(html).toContain(`<form method="post" action="${action}"`)
  })
  it('prefixes form actions under a base path, and a comment form\'s article URL only once', async () => {
    const blog = data.blogs![0]
    const article = `${blog.handle}/${blog.articles[0].handle}`
    const theme = headerTheme(`{% form 'contact' %}{% endform %}{% form 'new_comment', articles['${article}'] %}{% endform %}{{ content_for_layout }}`)
    const page = requestFromUrl('/p/tok/fr-ca', data, { basePath: '/p/tok' })
    const { html } = await renderPage({ theme, templateName: 'index', data, request: page.request, locale: page.locale })
    expect(html).toContain('action="/p/tok/fr-ca/contact#contact_form"')
    expect(html).toContain(`action="/p/tok/fr-ca/blogs/${article}/comments#comment_form"`)
  })
  it('sets Shopify.routes.root and defines Shopify.analytics in content_for_header', async () => {
    const theme = headerTheme('<head>{{ content_for_header }}</head>{{ content_for_layout }}')
    const page = requestFromUrl('/p/tok/fr-ca', data, { basePath: '/p/tok' })
    const { html } = await renderPage({ theme, templateName: 'index', data, request: page.request, locale: page.locale })
    expect(html).toContain('Shopify.routes.root = "/p/tok/fr-ca/"')
    expect(html).toContain('Shopify.analytics = Shopify.analytics || {')
    expect(html).toMatch(/publish: function \(name, data\)/)
    expect(html).toMatch(/visitor: function \(data, options\)/)
  })
  it('writes Shopify.routes.root as the slash of an unprefixed store, as the recorded home page of the parity store does (recording `page-home`)', async () => {
    const theme = headerTheme('<head>{{ content_for_header }}</head>{{ content_for_layout }}')
    const { html } = await renderPage({ theme, templateName: 'index', data })
    expect(html).toContain('Shopify.routes.root = "/";')
  })
})
