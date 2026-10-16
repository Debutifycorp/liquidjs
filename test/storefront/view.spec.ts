import { runInNewContext } from 'vm'
import { renderPage, setViewCacheSize, storefrontSampleData as data, requestFromUrl, resolveView } from '../../src/shopify'
import { HandleMap } from '../../src/shopify/objects/handle-map'
import { buildLinklists, buildStore, DEFAULT_VIEW_CACHE_SIZE } from '../../src/shopify/store/build'
import { ReportCollector } from '../../src/shopify/report'
import { buildGlobals, buildRoutes, ROUTES } from '../../src/shopify/store/globals'
import { buildSearch } from '../../src/shopify/store/search'
import { withoutPrefix, withPrefix } from '../../src/shopify/store/view'
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
  it('keeps at most 16 views per data object by default, dropping the least recently used (final review B, I2)', () => {
    expect(DEFAULT_VIEW_CACHE_SIZE).toBe(16)
    const own = { ...data }
    const view = (n: number) => ({ market: 'us', language: 'en', prefix: `/v${n}` })
    const built = [buildStore(own, view(0)), buildStore(own, view(1)), buildStore(own, view(2))]
    for (let n = 3; n < 16; n++) buildStore(own, view(n))
    // 16 views are all kept; reading view 0 again makes it the most recently used, so view 1 is now the least recently used
    expect(buildStore(own, view(0))).toBe(built[0])
    expect(buildStore(own, view(1))).toBe(built[1])
    expect(buildStore(own, view(0))).toBe(built[0])
    // a 17th view drops the least recently used one (view 2), and only that one
    buildStore(own, view(16))
    expect(buildStore(own, view(0))).toBe(built[0])
    expect(buildStore(own, view(1))).toBe(built[1])
    expect(buildStore(own, view(2))).not.toBe(built[2])
  })
  it('keeps the number of views `setViewCacheSize` names, and drops the surplus at once', () => {
    const own = { ...data }
    const view = (n: number) => ({ market: 'us', language: 'en', prefix: `/s${n}` })
    setViewCacheSize(own, 40)
    const built = Array.from({ length: 40 }, (_, n) => buildStore(own, view(n)))
    expect(buildStore(own, view(0))).toBe(built[0])
    expect(buildStore(own, view(39))).toBe(built[39])
    // 0 and 39 were read last, so a smaller size drops the views before them
    setViewCacheSize(own, 2)
    expect(buildStore(own, view(0))).toBe(built[0])
    expect(buildStore(own, view(39))).toBe(built[39])
    expect(buildStore(own, view(38))).not.toBe(built[38])
    setViewCacheSize(own, 1)
    expect(buildStore(own, view(39))).not.toBe(built[39])
  })
  it('reads a size that is not a whole number of at least 1 as the nearest one, and none as the default', () => {
    const own = { ...data }
    const view = (n: number) => ({ market: 'us', language: 'en', prefix: `/n${n}` })
    /** How many of the newest views are still the ones built, after `size` is set and 20 views are built. */
    const kept = (size: number) => {
      setViewCacheSize(own, size)
      const built = Array.from({ length: 20 }, (_, n) => buildStore(own, view(n)))
      let count = 0
      for (let n = 19; n >= 0 && buildStore(own, view(n)) === built[n]; n--) count++
      return count
    }
    expect(kept(0)).toBe(1)
    expect(kept(-3)).toBe(1)
    expect(kept(2.9)).toBe(2)
    expect(kept(Number.NaN)).toBe(16)
    expect(kept(Infinity)).toBe(20)
  })
  it('takes the size from the render options, and leaves it alone when they name none', async () => {
    const own = { ...data }
    const page = (basePath: string, viewCacheSize?: number) => renderPage({ theme: headerTheme('{{ content_for_layout }}'), templateName: 'index', data: own, request: { basePath }, viewCacheSize })
    const view = (basePath: string) => resolveView(own, { basePath })
    await page('/p/a', 2)
    const a = buildStore(own, view('/p/a'))
    await page('/p/b')
    await page('/p/c')
    expect(buildStore(own, view('/p/a'))).not.toBe(a)
    const c = buildStore(own, view('/p/c'))
    await page('/p/d')
    expect(buildStore(own, view('/p/c'))).toBe(c)
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
  it('puts the root with a query or fragment on the bare prefix, and puts a prefix on once', () => {
    expect(withPrefix('/fr-ca', '/?x=1')).toBe('/fr-ca?x=1')
    expect(withPrefix('/fr-ca', '/#top')).toBe('/fr-ca#top')
    expect(withPrefix('', '/?x=1')).toBe('/?x=1')
    for (const path of ['/fr-ca', '/fr-ca/products/hoodie', '/fr-ca?x=1', '/fr-ca#top']) expect(withPrefix('/fr-ca', path)).toBe(path)
    expect(withPrefix('/p/tok/fr-ca', withPrefix('/p/tok/fr-ca', '/cart'))).toBe('/p/tok/fr-ca/cart')
    // a segment that only starts like the prefix is not under it
    expect(withPrefix('/fr', '/france/cart')).toBe('/fr/france/cart')
    expect(withoutPrefix('/fr-ca', '/fr-ca/products/hoodie?variant=1')).toBe('/products/hoodie?variant=1')
    expect(withoutPrefix('/fr-ca', '/fr-ca')).toBe('/')
    expect(withoutPrefix('/fr-ca', '/fr-ca?x=1')).toBe('/?x=1')
    expect(withoutPrefix('/fr', '/france/cart')).toBe('/france/cart')
    expect(withoutPrefix('', '/cart')).toBe('/cart')
  })
  it('normalises the base path and the locale prefix to whole segments', () => {
    const prefix = (basePath?: string, localePrefix?: string) => resolveView(data, { basePath, localePrefix }).prefix
    expect(prefix('//')).toBe('')
    expect(prefix('/')).toBe('')
    expect(prefix('p/tok')).toBe('/p/tok')
    expect(prefix('/p/tok/')).toBe('/p/tok')
    expect(prefix('/p//tok')).toBe('/p/tok')
    expect(prefix('/p/tok', '/fr-ca/')).toBe('/p/tok/fr-ca')
    expect(prefix('', 'fr-ca')).toBe('/fr-ca')
    expect(prefix(undefined, '//')).toBe('')
    expect(withPrefix(prefix('//'), '/cart')).toBe('/cart')
    expect(withPrefix(prefix('/p/tok/', '/fr-ca/'), '/cart')).toBe('/p/tok/fr-ca/cart')
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
    expect(state('/collections/tops', '')).toEqual([['/', 'frontpage_link', false, false, false], ['/collections', 'collections_link', false, false, true], ['/products/hoodie', 'product_link', false, false, false], ['https://example.com/x', 'http_link', false, false, false]])
    // the same page under a base path and a locale prefix: the same types and flags, and the home link is the bare prefix without being active on every page
    expect(state('/p/tok/fr-ca/collections/tops', '/p/tok/fr-ca')).toEqual([['/p/tok/fr-ca', 'frontpage_link', false, false, false], ['/p/tok/fr-ca/collections', 'collections_link', false, false, true], ['/p/tok/fr-ca/products/hoodie', 'product_link', false, false, false], ['https://example.com/x', 'http_link', false, false, false]])
    expect(state('/p/tok/fr-ca', '/p/tok/fr-ca')[0]).toEqual(['/p/tok/fr-ca', 'frontpage_link', true, true, false])
    expect(state('/p/tok/fr-ca/products/hoodie?variant=1', '/p/tok/fr-ca')[2]).toEqual(['/p/tok/fr-ca/products/hoodie', 'product_link', true, true, false])
  })
  it('puts the search filters\' URLs under the prefix', () => {
    const urls = (prefix: string) => (buildSearch(buildStore(data), 'shirt', {}, prefix).filters as any[]).flatMap(f => [f.url_to_remove, ...(f.values ?? []).map((v: any) => v.url_to_add)])
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
  it('puts the URLs of a customer\'s addresses and orders under the prefix', () => {
    const variant = data.products![0].variants[0]
    const customer = {
      id: 1,
      email: 'a@example.com',
      addresses: [{ id: 7, address1: '1 Main St', city: 'Montreal', country: 'Canada', country_code: 'CA', zip: 'H2X 1Y4' }],
      orders: [{ id: 99, order_number: 1001, created_at: '2026-01-01T00:00:00Z', line_items: [{ product_handle: data.products![0].handle, variant_id: variant.id, quantity: 1 }], billing_address: { id: 8, address1: '1 Main St', city: 'Montreal', country: 'Canada', country_code: 'CA', zip: 'H2X 1Y4' } }]
    }
    const withCustomer = { ...data, customer }
    const urls = (prefix: string) => {
      const built = buildStore(withCustomer, { market: 'us', language: 'en', prefix }).customer as Record<string, any>
      const order = built.orders[0]
      return [built.addresses[0].url, built.default_address.url, order.customer_url, order.line_items[0].url, order.billing_address.url]
    }
    expect(urls('')).toEqual(['/account/addresses/7', '/account/addresses/7', '/account/orders/99', `/products/${data.products![0].handle}?variant=${variant.id}`, null])
    expect(urls('/p/tok/fr-ca')).toEqual(['/p/tok/fr-ca/account/addresses/7', '/p/tok/fr-ca/account/addresses/7', '/p/tok/fr-ca/account/orders/99', `/p/tok/fr-ca/products/${data.products![0].handle}?variant=${variant.id}`, null])
  })
  it('puts paginate links under the prefix', async () => {
    const theme = headerTheme('{% paginate collections.men.products by 2 %}{{ paginate.next.url }}|{{ paginate.pages }}|{{ paginate | default_pagination }}{% endpaginate %}')
    const page = requestFromUrl('/p/tok/fr-ca/collections/men', data, { basePath: '/p/tok' })
    const { html } = await renderPage({ theme, templateName: 'index', data, request: page.request, locale: page.locale })
    expect(html.startsWith('/p/tok/fr-ca/collections/men?page=2|')).toBe(true)
    expect(html).toContain('href="/p/tok/fr-ca/collections/men?page=2"')
    expect(html).not.toMatch(/href="\/(?!p\/tok\/fr-ca)/)
    const plain = requestFromUrl('/collections/men', data)
    expect((await renderPage({ theme, templateName: 'index', data, request: plain.request, locale: plain.locale })).html.startsWith('/collections/men?page=2|')).toBe(true)
  })
  it('sets the blog of an article page under a base path and a locale prefix', async () => {
    const theme = { files: { ...headerTheme('{{ blog.handle }}|{{ article.handle }}|{{ blog.url }}|{{ article.url }}').files, 'templates/article.json': '{"sections":{},"order":[]}' } }
    const render = async (url: string, basePath?: string) => {
      const page = requestFromUrl(url, data, { basePath })
      expect(page.templateName).toBe('article')
      return (await renderPage({ theme, templateName: page.templateName, data, request: page.request, locale: page.locale })).html
    }
    expect(await render('/blogs/news/making-liquid')).toBe('news|making-liquid|/blogs/news|/blogs/news/making-liquid')
    expect(await render('/fr-ca/blogs/news/making-liquid')).toBe('news|making-liquid|/fr-ca/blogs/news|/fr-ca/blogs/news/making-liquid')
    expect(await render('/p/tok/fr-ca/blogs/news/making-liquid', '/p/tok')).toBe('news|making-liquid|/p/tok/fr-ca/blogs/news|/p/tok/fr-ca/blogs/news/making-liquid')
  })
  it('writes a product URL within a collection with the prefix once', async () => {
    const theme = headerTheme('{{ all_products.hoodie.url | within: collections.men }}|{{ \'/products/hoodie\' | within: collections.men }}')
    const render = async (url: string, basePath?: string) => {
      const page = requestFromUrl(url, data, { basePath })
      return (await renderPage({ theme, templateName: 'index', data, request: page.request, locale: page.locale })).html
    }
    expect(await render('/')).toBe('/collections/men/products/hoodie|/collections/men/products/hoodie')
    expect(await render('/fr-ca')).toBe('/fr-ca/collections/men/products/hoodie|/fr-ca/collections/men/products/hoodie')
    expect(await render('/p/tok/fr-ca', '/p/tok')).toBe('/p/tok/fr-ca/collections/men/products/hoodie|/p/tok/fr-ca/collections/men/products/hoodie')
  })
  it('keeps the engine\'s own login route under the prefix', () => {
    expect(buildRoutes('/fr-ca').account_login_url).toBe('/fr-ca/account/login')
  })
  it('prefixes form actions', async () => {
    // only the localization form is compared: Shopify prints nothing for `{% form 'product', all_products['hoodie'] %}` (the probes' `product_form` is `""`), which the engine reproduces (forms.spec.ts)
    const pick = (b: any) => b.localization_form.match(/action="[^"]*"/)?.[0]
    for (const name of PROBES) {
      const { actual, expected } = await probeMatches(name, pick)
      expect(actual).toEqual(expected)
    }
  })
  it('prefixes a product form with the cart route of the view', async () => {
    // the product is a variable: a quoted key in the tag is no product to Shopify, which then prints nothing (fixtures `probe-page-*`)
    const theme = headerTheme('{% assign hoodie = all_products[\'hoodie\'] %}{% form \'product\', hoodie %}{% endform %}{{ content_for_layout }}')
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
  // as the parity store renders it (scenario `page-home-fr-ca`): a `url` setting stored as `shopify://collections/all` prints the locale prefix
  it('puts the view prefix before the page a url setting names', async () => {
    const files = { ...headerTheme('{{ settings.link }}|{{ content_for_layout }}').files, 'config/settings_schema.json': '[{"name":"x","settings":[{"type":"url","id":"link"}]}]', 'config/settings_data.json': '{"current":{"link":"shopify://collections/all"}}' }
    const page = requestFromUrl('/p/tok/fr-ca', data, { basePath: '/p/tok' })
    expect((await renderPage({ theme: { files }, templateName: 'index', data, request: page.request, locale: page.locale })).html).toContain('/p/tok/fr-ca/collections/all|')
    const plain = requestFromUrl('/', data)
    expect((await renderPage({ theme: { files }, templateName: 'index', data, request: plain.request, locale: plain.locale })).html).toContain('/collections/all|')
  })
  it('sets Shopify.routes.root and defines Shopify.analytics in content_for_header', async () => {
    const theme = headerTheme('<head>{{ content_for_header }}</head>{{ content_for_layout }}')
    const page = requestFromUrl('/p/tok/fr-ca', data, { basePath: '/p/tok' })
    const { html } = await renderPage({ theme, templateName: 'index', data, request: page.request, locale: page.locale })
    expect(html).toContain('Shopify.routes.root = "/p/tok/fr-ca/"')
    expect(html).toContain('Shopify.analytics = Shopify.analytics || ')
    expect(html).toMatch(/publish: function \(name, data, customData\)/)
    expect(html).toMatch(/visitor: function \(data, options\)/)
  })
  it('defines Shopify.analytics as closures that work passed around, as the parity store\'s publish does', async () => {
    const theme = headerTheme('<head>{{ content_for_header }}</head>{{ content_for_layout }}')
    const { html } = await renderPage({ theme, templateName: 'index', data })
    const sandbox: Record<string, any> = {}
    runInNewContext(/<script>([\s\S]*?)<\/script>/.exec(html)![1], sandbox)
    // detached from `Shopify.analytics`, as a theme or app passes them to a timer or a callback
    const answers = runInNewContext('var publish = Shopify.analytics.publish, visitor = Shopify.analytics.visitor; JSON.stringify([publish("my_app:opened", { id: 1 }, { source: "test" }), publish("bare"), visitor({ email: "a@example.com" }, { appId: "1" }), visitor()])', sandbox)
    expect(JSON.parse(answers)).toEqual([true, true, true, false])
    expect(JSON.parse(runInNewContext('JSON.stringify(Shopify.analytics.events)', sandbox))).toEqual([{ name: 'my_app:opened', data: { id: 1 }, customData: { source: 'test' } }, { name: 'bare' }])
    // a second header script leaves the first one's API and events as they are
    runInNewContext(/<script>([\s\S]*?)<\/script>/.exec(html)![1], sandbox)
    expect(JSON.parse(runInNewContext('JSON.stringify(Shopify.analytics.events.length)', sandbox))).toBe(2)
  })
  it('writes Shopify.routes.root as the slash of an unprefixed store, as the recorded home page of the parity store does (recording `page-home`)', async () => {
    const theme = headerTheme('<head>{{ content_for_header }}</head>{{ content_for_layout }}')
    const { html } = await renderPage({ theme, templateName: 'index', data })
    expect(html).toContain('Shopify.routes.root = "/";')
  })
})
