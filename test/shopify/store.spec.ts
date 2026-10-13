import { buildGlobals, buildLinklists, buildStore, createShopifyLiquid, isSafeUrl, renderLiquid, ReportCollector, resolveServices, sampleStoreData, sanitizeHtml, SettingsDrop, Translator } from '../../src/shopify'
import type { SettingDefinition, SettingsEnv } from '../../src/shopify'

const store = buildStore(sampleStoreData)
const liquid = createShopifyLiquid()
const render = async (source: string, scope: object) => (await renderLiquid(liquid, source, scope)).html

function env (overrides: Partial<SettingsEnv> = {}): SettingsEnv {
  const translator = new Translator({ locale: 'en', defaultLocale: 'en', locales: {}, schemaLocales: { en: { settings: { heading: 'Welcome' } } } })
  return { store, linklists: buildLinklists(store.linklists, '/'), services: resolveServices(), translator, report: new ReportCollector(), trust: { liquidSettings: false, htmlSettings: false }, ...overrides }
}

describe('shopify/store', () => {
  // Amounts print in cents: the `money` filters are a later task's, so the store derivations are pinned without them.
  it('derives product fields', async () => {
    const product = store.products.liquidMethodMissing('classic-tee')
    expect(await render("{{ p.url }}|{{ p.price }}|{{ p.price_varies }}|{{ p.compare_at_price }}|{{ p.first_available_variant.id }}|{{ p.options_with_values[0].values | join: ',' }}|{{ p.selected_or_first_available_variant.url }}|{{ p.featured_image.width }}|{{ p.has_only_default_variant }}|{{ p.featured_image.aspect_ratio }}|{{ p.featured_image.preview_image }}|{{ p.media[0].preview_image.width }}|{{ 1 | divided_by: p.featured_media.preview_image.aspect_ratio }}", { p: product }))
      .toBe('/products/classic-tee|2500|true|3000|3001|S,M,L|/products/classic-tee?variant=3001|1200|false|1.0||1200|1.0')
  })
  it('gives variants a hidden back reference to their product', async () => {
    const product = store.products.liquidMethodMissing('canvas-bag')
    expect(await render('{{ p.variants[0].product.title }}|{{ p.variants[0] | json }}', { p: product })).toBe('Canvas Bag|' + JSON.stringify((product as any).variants[0]))
  })
  it('iterates and looks up handle maps, with an implicit collections.all', async () => {
    expect(await render("{% for c in collections %}{{ c.handle }} {% endfor %}{{ collections.size }} {{ collections.all.products_count }} {{ collections['apparel'].title }} {{ all_products['ceramic-mug'].vendor }}", { collections: store.collections, all_products: store.products }))
      .toBe('frontpage apparel 2 3 Apparel Kiln & Co')
  })
  it('marks menu links active for the request path', async () => {
    const linklists = buildLinklists(store.linklists, '/collections/apparel')
    expect(await render("{% for l in linklists['main-menu'].links %}{{ l.title }}:{{ l.active }}:{{ l.child_active }}:{{ l.levels }} {% endfor %}", { linklists }))
      .toBe('Home:false:false:0 Catalog:false:true:1 Contact:false:false:0 ')
  })
  it('builds the cart', async () => {
    expect(await render('{{ cart.item_count }}|{{ cart.total_price }}|{{ cart.items[0].title }}|{{ cart.items[0].final_line_price }}', { cart: store.cart }))
      .toBe('2|5000|Classic Tee - S / Black|5000')
  })
  it('builds the page globals for a template', async () => {
    const report = new ReportCollector()
    const page = buildGlobals({ store, templateName: 'page.contact', request: { resource: 'contact' }, locale: 'en', report })
    expect(await render("{{ template }}|{{ template.name }}|{{ template.suffix }}|{{ request.page_type }}|{{ request.path }}|{{ page.title }}|{{ canonical_url }}|{{ routes.cart_url }}|{{ page_title }}|{{ linklists['main-menu'].links[2].current }}", page.globals))
      .toBe('page.contact|page|contact|page|/pages/contact|Contact|https://sample-store.example/pages/contact|/cart|Contact|true')
    const article = buildGlobals({ store, templateName: 'article', request: {}, locale: 'en', report })
    expect(await render('{{ article.url }}|{{ blog.title }}|{{ request.path }}', article.globals)).toBe('/blogs/news/hello-world|News|/blogs/news/hello-world')
    const login = buildGlobals({ store, templateName: 'customers/login', request: {}, locale: 'en', report })
    expect(await render('{{ request.page_type }}|{{ request.path }}|{{ template.directory }}', login.globals)).toBe('customers/login|/account/login|customers')
    buildGlobals({ store, templateName: 'product', request: { resource: 'nope' }, locale: 'en', report })
    expect(report.toReport([], 0).missing).toEqual([{ kind: 'resource', name: 'product nope' }])
  })
})

describe('shopify/settings', () => {
  const definitions: SettingDefinition[] = [
    { type: 'color', id: 'accent', default: '#334fb4' },
    { type: 'image_picker', id: 'hero' },
    { type: 'image_picker', id: 'gone' },
    { type: 'url', id: 'link' },
    { type: 'product', id: 'featured' },
    { type: 'collection_list', id: 'lists' },
    { type: 'link_list', id: 'menu', default: 'main-menu' },
    { type: 'text', id: 'heading', default: 't:settings.heading' },
    { type: 'checkbox', id: 'show', default: true },
    { type: 'range', id: 'columns', default: 3 },
    { type: 'font_picker', id: 'font', default: 'assistant_n4' },
    { type: 'video_url', id: 'video' },
    { type: 'liquid', id: 'custom' },
    { type: 'html', id: 'markup' },
    { type: 'richtext', id: 'body' },
    { type: 'header', content: 'Not a setting' }
  ]
  const stored = {
    hero: 'shopify://shop_images/hero.jpg',
    gone: 'shopify://shop_images/missing.png',
    link: 'shopify://collections/apparel',
    featured: 'canvas-bag',
    lists: ['apparel', 'nope'],
    video: 'https://www.youtube.com/watch?v=vj01PAffOac',
    custom: '{{ greeting }} <b>{{ shop.name }}</b>',
    markup: '<p onclick="steal()">Hi <script>alert(1)</script><a href="javascript:alert(1)">x</a><a href="/pages/about" target="_blank">ok</a></p>',
    body: '<p>Fine <strong>text</strong><img src=x onerror=alert(1)></p>',
    legacy: 'kept'
  }
  it('resolves every setting type and fills defaults', async () => {
    const e = env()
    const settings = new SettingsDrop(definitions, stored, e)
    const source = '{{ s.accent }}|{{ s.accent.red }}|{{ s.hero.width }}|{{ s.gone }}|{{ s.link }}|{{ s.featured.title }}|{{ s.lists.size }}|{{ s.menu.links.size }}|{{ s.heading }}|{{ s.show }}|{{ s.columns | plus: 1 }}|{{ s.font.family }}|{{ s.video.id }} {{ s.video.type }}|{{ s.legacy }}|{{ s.unset }}'
    expect(await render(source, { s: settings })).toBe('#334fb4|51|2400||/collections/apparel|Canvas Bag|1|3|Welcome|true|4|Assistant|vj01PAffOac youtube|kept|')
    expect(e.report.toReport([], 0).missing).toEqual([{ kind: 'resource', name: 'image missing.png' }, { kind: 'resource', name: 'collection nope' }])
  })
  it('escapes liquid settings unless the theme is trusted', async () => {
    const scope = { greeting: 'Hello', shop: { name: 'Shop' } }
    expect(await render('{{ s.custom }}', { ...scope, s: new SettingsDrop(definitions, stored, env()) })).toBe('{{ greeting }} &lt;b&gt;{{ shop.name }}&lt;/b&gt;')
    expect(await render('{{ s.custom }}', { ...scope, s: new SettingsDrop(definitions, stored, env({ trust: { liquidSettings: true, htmlSettings: false } })) })).toBe('Hello <b>Shop</b>')
  })
  it('sanitises html and rich text settings unless html is trusted', async () => {
    expect(await render('{{ s.markup }}|{{ s.body }}', { s: new SettingsDrop(definitions, stored, env()) })).toBe('<p>Hi <a>x</a><a href="/pages/about" target="_blank">ok</a></p>|<p>Fine <strong>text</strong><img src="x"></p>')
    expect(await render('{{ s.markup }}', { s: new SettingsDrop(definitions, stored, env({ trust: { liquidSettings: false, htmlSettings: true } })) })).toBe(stored.markup)
  })
})

describe('shopify/util/sanitize', () => {
  it.each([
    ['<p>ok</p>', '<p>ok</p>'],
    ['<a href="https://example.com" title="t">x</a>', '<a href="https://example.com" title="t">x</a>'],
    ['<a href="java&#x09;script:alert(1)">x</a>', '<a>x</a>'],
    ['<a href=" JAVASCRIPT:alert(1)">x</a>', '<a>x</a>'],
    ['<img src="data:image/svg+xml,<svg onload=alert(1)>">', '<img>'],
    ['<style>body{}</style><iframe src="https://x"></iframe>after', 'after'],
    ['<div style="position:fixed" class="c">x</div>', '<div class="c">x</div>'],
    ['<!-- note -->a < b', 'a &lt; b'],
    ['<svg><script>alert(1)</script></svg>tail', 'tail'],
    ['<p title="a&quot;b">x</p>', '<p title="a&quot;b">x</p>'],
    ['ok<img src="x', 'ok'],
    ['<p>a</p><!-- open', '<p>a</p>'],
    ['<br/><IMG SRC=x onerror=y />', '<br><img src="x">']
  ])('%s', (input, expected) => {
    expect(sanitizeHtml(input)).toBe(expected)
  })
  it('judges URLs as a browser reads them', () => {
    expect(isSafeUrl('/a?b=c:d')).toBe(true)
    expect(isSafeUrl('mailto:x@y.z')).toBe(true)
    expect(isSafeUrl('javascript&colon;alert(1)')).toBe(false)
    expect(isSafeUrl('vbscript:x')).toBe(false)
  })
  it('survives numeric references outside Unicode and hostile input sizes', () => {
    expect(sanitizeHtml('<a href="&#x110000;x">a</a><a href="&#99999999999999999999;">b</a>')).toBe('<a href="&#x110000;x">a</a><a href="&#99999999999999999999;">b</a>')
    expect(isSafeUrl('&#x110000;javascript:x')).toBe(true)
    const started = Date.now()
    expect(sanitizeHtml('<a "'.repeat(20000))).toBe('')
    expect(sanitizeHtml('<p title="'.repeat(20000))).toBe('')
    expect(sanitizeHtml('<!x'.repeat(20000) + '<?'.repeat(20000))).toBe('')
    expect(sanitizeHtml('<'.repeat(20000))).toBe('&lt;'.repeat(20000))
    expect(Date.now() - started).toBeLessThan(2000)
  })
})
