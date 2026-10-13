import { buildGlobals, buildLinklists, buildStore, ColorSchemeDrop, createShopifyLiquid, HandleMap, isSafeUrl, renderLiquid, ReportCollector, resolveServices, sampleStoreData, sanitizeHtml, SettingsDrop, Translator } from '../../src/shopify'
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
    expect(await render('{{ s.markup }}|{{ s.body }}', { s: new SettingsDrop(definitions, stored, env()) })).toBe('<p>Hi <a>x</a><a href="/pages/about" target="_blank" rel="noopener noreferrer">ok</a></p>|<p>Fine <strong>text</strong><img src="x"></p>')
    expect(await render('{{ s.markup }}', { s: new SettingsDrop(definitions, stored, env({ trust: { liquidSettings: false, htmlSettings: true } })) })).toBe(stored.markup)
  })
})

describe('shopify/settings safety', () => {
  const payload = '</script><img src=x onerror=alert(1)>'
  const liquidDefinitions: SettingDefinition[] = [{ type: 'liquid', id: 'code' }]
  const trusted = { liquidSettings: true, htmlSettings: true }
  const untrusted = { liquidSettings: false, htmlSettings: false }

  it('never prints a liquid setting raw through json or inspect', async () => {
    const s = new SettingsDrop(liquidDefinitions, { code: payload }, env())
    const html = await render('{{ s | json }}|{{ s | inspect }}|{{ s.code | json }}', { s })
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(JSON.parse(await render('{{ s | json }}', { s }))).toEqual({ code: '&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;' })
  })
  it('prints trusted liquid settings through json as strings, also after one has rendered', async () => {
    const s = new SettingsDrop(liquidDefinitions, { code: '{{ greeting }} <b>' }, env({ trust: { liquidSettings: true, htmlSettings: false } }))
    const html = await render('{{ s.code }}|{{ s | json }}|{{ s.code }}', { s, greeting: 'Hi' })
    expect(html).toBe('Hi <b>|{"code":"{{ greeting }} <b>"}|Hi <b>')
  })
  it('stops liquid settings that print settings recursively', async () => {
    const s = new SettingsDrop([{ type: 'liquid', id: 'self' }, { type: 'liquid', id: 'a' }, { type: 'liquid', id: 'b' }], { self: 'x{{ s.self }}', a: '[{{ s.b }}]', b: 'B' }, env({ trust: { liquidSettings: true, htmlSettings: false } }))
    const started = Date.now()
    const result = await renderLiquid(liquid, '{{ s.self }}', { s })
    expect(result.html).toBe('xxxxx')
    expect(result.report.errors).toEqual([{ message: 'Liquid error (line 1): liquid setting is nested more than 5 levels deep', line: 1 }])
    expect(Date.now() - started).toBeLessThan(500)
    expect(await render('{{ s.a }}|{{ s.a }}', { s })).toBe('[B]|[B]')
  })

  const text = (id: string, type = 'text', extra: object = {}): SettingDefinition => ({ type, id, ...extra })
  it('passes plain text through unchanged and sanitises text that contains markup', async () => {
    const definitions = [text('plain'), text('area', 'textarea'), text('pick', 'select'), text('markup'), text('lt'), text('fallback', 'text', { default: '<i onclick=x>d</i>' })]
    const stored = { plain: 'Fish & chips "x" > y', area: 'Line one\nLine two', pick: 'option-1', markup: '<img src=x onerror=alert(1)>Hi', lt: 'a < b', legacy: '<script>alert(1)</script>ok', nested: { list: ['<b onclick=x>t</b>', 3, null], clean: 'fine' } }
    const s = new SettingsDrop(definitions, stored, env())
    expect(await render('{{ s.plain }}|{{ s.area }}|{{ s.pick }}|{{ s.markup }}|{{ s.lt }}|{{ s.fallback }}|{{ s.legacy }}', { s })).toBe('Fish & chips "x" > y|Line one\nLine two|option-1|<img src="x">Hi|a &lt; b|<i>d</i>|ok')
    expect(JSON.parse(await render('{{ s.nested | json }}', { s }))).toEqual({ list: ['<b>t</b>', 3, null], clean: 'fine' })
    const trustedHtml = new SettingsDrop(definitions, stored, env({ trust: trusted }))
    expect(await render('{{ s.markup }}|{{ s.lt }}|{{ s.legacy }}', { s: trustedHtml })).toBe('<img src=x onerror=alert(1)>Hi|a < b|<script>alert(1)</script>ok')
  })
  it('drops url settings with an unsafe scheme and reports them', async () => {
    const definitions: SettingDefinition[] = [{ type: 'url', id: 'link' }, { type: 'video_url', id: 'video' }]
    for (const bad of ['javascript:alert(2)', ' JavaScript:alert(2)', 'jav&#x09;ascript:alert(2)', 'data:text/html,<b>x', 'vbscript:x', 'file:///etc/passwd']) {
      const e = env()
      expect(await render('[{{ s.link }}]', { s: new SettingsDrop(definitions, { link: bad }, e) })).toBe('[]')
      expect(e.report.toReport([], 0).unsupported).toEqual([{ feature: 'unsafe_url', detail: 'url setting link has a URL scheme other than http, https, mailto or tel and was dropped' }])
    }
    const e = env()
    expect(await render('[{{ s.video.type }}]', { s: new SettingsDrop(definitions, { video: 'javascript:alert(1)' }, e) })).toBe('[]')
    expect(e.report.toReport([], 0).unsupported).toHaveLength(1)
    for (const good of ['https://example.com/a?b=c', 'http://example.com', 'mailto:a@b.c', 'tel:+15551234567', '/pages/about', '#top', 'relative/path', '/collections']) {
      expect(await render('{{ s.link }}', { s: new SettingsDrop(definitions, { link: good }, env()) })).toBe(good)
    }
    expect(await render('{{ s.link }}|{{ s.l2 }}', { s: new SettingsDrop([{ type: 'url', id: 'link' }, { type: 'url', id: 'l2' }], { link: 'shopify://collections/apparel', l2: 'shopify://search' }, env()) })).toBe('/collections/apparel|/search')
    expect(await render('{{ s.link }}', { s: new SettingsDrop(definitions, { link: 'javascript:alert(2)' }, env({ trust: trusted })) })).toBe('javascript:alert(2)')
    expect(await render('{{ s.video.type }}', { s: new SettingsDrop(definitions, { video: 'https://vimeo.com/76979871' }, env()) })).toBe('vimeo')
  })
  it('reads missing, null and non-object settings as empty, so the schema defaults apply', async () => {
    const definitions: SettingDefinition[] = [{ type: 'text', id: 'heading', default: 'Hello' }, { type: 'range', id: 'columns', default: 3 }]
    for (const stored of [null, undefined, 'text', 4, [], [{ heading: 'x' }]]) {
      expect(await render('{{ s.heading }}|{{ s.columns }}', { s: new SettingsDrop(definitions, stored as never, env()) })).toBe('Hello|3')
    }
    expect(await render('{{ s.heading }}|{{ s.x }}', { s: new SettingsDrop(null, null, env()) })).toBe('|')
    expect(await render('{{ s.heading }}', { s: new SettingsDrop([null, 'x', { type: 'text', id: 'heading', default: 'Hi' }] as never, { heading: null }, env()) })).toBe('')
    expect(await render('{{ s.heading }}', { s: new SettingsDrop(definitions, { heading: null }, env()) })).toBe('')
  })
  it('reads data keys as own properties only', async () => {
    const e = env()
    const settings = new SettingsDrop([{ type: 'video', id: 'clip' }, { type: 'text', id: 'constructor' }, { type: 'text', id: 'toString', default: 'kept' }], { clip: 'shopify://files/videos/constructor' }, e)
    expect(SettingsDrop.value(settings, 'clip')).toBeNull()
    expect(SettingsDrop.value(settings, 'constructor')).toBeNull()
    expect(SettingsDrop.value(settings, 'toString')).toBe('kept')
    const report = new ReportCollector()
    for (const templateName of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'customers/constructor']) {
      const page = buildGlobals({ store, templateName, request: {}, locale: 'en', report })
      expect(page.request.path).toBe(templateName.startsWith('customers/') ? '/account/constructor' : `/${templateName}`)
      expect(await render('{{ request.page_type }}|{{ template.name }}', page.globals)).toBe(`${templateName}|${templateName.replace('customers/', '')}`)
    }
  })
  it('keeps the untrusted flags the default', () => {
    expect(env().trust).toEqual(untrusted)
  })
})

describe('shopify/settings colour schemes', () => {
  const group: SettingDefinition = {
    type: 'color_scheme_group',
    id: 'color_schemes',
    definition: [
      { type: 'header', content: 'Colors' },
      { type: 'color', id: 'background', label: 'Background', default: '#ffffff' },
      { type: 'color_background', id: 'background_gradient', label: 'Gradient' },
      { type: 'color', id: 'text', label: 'Text', default: '#121212' },
      { type: 'range', id: 'shadow', label: 'Shadow', default: 4 }
    ],
    role: { text: 'text', background: { solid: 'background', gradient: 'background_gradient' } }
  }
  const schemes = {
    'scheme-1': { settings: { background: '#336699', text: '#ffffff', background_gradient: 'linear-gradient(#000, #fff)', extra: 'kept' } },
    'scheme-2': { settings: { background: '#f4f4f4' } },
    'scheme-3': null
  }
  const global = [group, { type: 'color_scheme', id: 'scheme', default: 'scheme-2' }]

  it('resolves colour scheme groups to scheme objects with colour settings and schema defaults', async () => {
    const s = new SettingsDrop(global, { color_schemes: schemes, scheme: 'scheme-1' }, env())
    const loop = '{% for scheme in s.color_schemes %}[{{ scheme.id }}:{{ scheme.settings.background }}:{{ scheme.settings.background.red }}:{{ scheme.settings.text }}:{{ scheme.settings.shadow | plus: 1 }}:{{ scheme.settings.background_gradient }}:{{ scheme.settings.extra }}]{% endfor %}'
    expect(await render(loop, { s })).toBe('[scheme-1:#336699:51:#ffffff:5:linear-gradient(#000, #fff):kept][scheme-2:#f4f4f4:244:#121212:5::][scheme-3:#ffffff:255:#121212:5::]')
    expect(await render("{{ s.color_schemes.size }}|{{ s.color_schemes['scheme-2'].settings.background.green }}|{{ s.scheme }}|{{ s.scheme.id }}|{{ s.scheme.settings.background.blue }}|{{ s.scheme.settings.text.alpha }}", { s })).toBe('3|244|scheme-1|scheme-1|153|1.0')
    expect(SettingsDrop.colorSchemes(s)).toBe(SettingsDrop.value(s, 'color_schemes'))
    expect(HandleMap.get(SettingsDrop.colorSchemes(s) as HandleMap<ColorSchemeDrop>, 'scheme-1')).toBeInstanceOf(ColorSchemeDrop)
  })
  it('picks the stored scheme, else the default, else the first, else nil', async () => {
    const pick = async (stored: unknown, def: unknown) => render('{{ s.scheme }}|{{ s.scheme.settings.background }}', { s: new SettingsDrop([group, { type: 'color_scheme', id: 'scheme', default: def }], { color_schemes: schemes, scheme: stored }, env()) })
    expect(await pick('scheme-2', 'scheme-1')).toBe('scheme-2|#f4f4f4')
    expect(await pick('nope', 'scheme-2')).toBe('scheme-2|#f4f4f4')
    expect(await pick(undefined, 'scheme-2')).toBe('scheme-2|#f4f4f4')
    expect(await pick('nope', 'also-nope')).toBe('scheme-1|#336699')
    expect(await pick(undefined, undefined)).toBe('scheme-1|#336699')
    expect(await pick(['scheme-2'], 7)).toBe('scheme-1|#336699')
  })
  it('gives sections the global schemes, and nil without a group', async () => {
    const globalSettings = new SettingsDrop(global, { color_schemes: schemes }, env())
    const section = new SettingsDrop([{ type: 'color_scheme', id: 'scheme', default: 'scheme-1' }], { scheme: 'scheme-2' }, env({ colorSchemes: SettingsDrop.colorSchemes(globalSettings) }))
    expect(await render('{{ s.scheme }}|{{ s.scheme.settings.text }}', { s: section })).toBe('scheme-2|#121212')
    const e = env()
    const lonely = new SettingsDrop([{ type: 'color_scheme', id: 'scheme', default: 'scheme-1' }], { scheme: 'scheme-2' }, e)
    expect(await render('[{{ s.scheme }}]', { s: lonely })).toBe('[]')
    expect(e.report.toReport([], 0).unsupported).toEqual([{ feature: 'color_scheme', detail: 'scheme has no color_scheme_group data' }])
    const empty = new SettingsDrop([group, { type: 'color_scheme', id: 'scheme' }], {}, env())
    expect(await render('{{ s.color_schemes.size }}|[{{ s.scheme }}]|{{ s.color_schemes.size }}', { s: empty })).toBe('0|[]|0')
    expect(SettingsDrop.colorSchemes(new SettingsDrop([], {}, env()))).toBeUndefined()
  })
  it('keeps scheme ids and setting names that are also object members as plain data', async () => {
    const s = new SettingsDrop([{ type: 'color_scheme_group', id: 'color_schemes', definition: [{ type: 'color', id: 'constructor', default: '#000000' }] }], { color_schemes: { constructor: { settings: { constructor: '#ff0000', __proto__: '#00ff00' } } } }, env())
    const group = SettingsDrop.colorSchemes(s) as HandleMap<ColorSchemeDrop>
    const scheme = HandleMap.get(group, 'constructor') as ColorSchemeDrop
    expect(scheme.id).toBe('constructor')
    expect(Object.prototype.hasOwnProperty.call(scheme.settings, 'constructor')).toBe(true)
    expect(Object.getPrototypeOf(scheme.settings)).toBe(Object.prototype)
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
    ['<br/><IMG SRC=x onerror=y />', '<br><img src="x">'],
    // attribute breakout, and the references a browser decodes before it reads a scheme
    ['<a title=\'x" onmouseover="y\'>t</a>', '<a title="x&quot; onmouseover=&quot;y">t</a>'],
    ['<a href="java&Tab;script:alert(1)">x</a>', '<a>x</a>'],
    ['<a href="java&NewLine;script:alert(1)">x</a>', '<a>x</a>'],
    ['<a href="&#106;avascript:alert(1)">x</a>', '<a>x</a>'],
    ['<a href="&#x6A;avascript:alert(1)">x</a>', '<a>x</a>'],
    // foreign content and other elements dropped together with what is inside them
    ['<svg><desc>hello</desc></svg>tail', 'tail'],
    ['<math><mi>x</mi></math>tail', 'tail'],
    ['<textarea><b>x</b></textarea>tail', 'tail'],
    // a browser uses the first of two attributes with one name; attributes belong to their element
    ['<a href="/a" href="javascript:x">x</a>', '<a href="/a">x</a>'],
    ['<a src="/y" href="/x" width="3">x</a><p href="/x">y</p>', '<a href="/x">x</a><p>y</p>'],
    // links: target and rel
    ['<a href="/x" target="_top">x</a>', '<a href="/x">x</a>'],
    ['<a href="/x" target="_BLANK" rel="opener nofollow">x</a>', '<a href="/x" target="_blank" rel="nofollow noopener noreferrer">x</a>'],
    ['<a href="/x" rel="opener">x</a>', '<a href="/x">x</a>'],
    ['<a href="/x" rel="NoFollow noreferrer">x</a>', '<a href="/x" rel="nofollow noreferrer">x</a>'],
    // balanced output: close what is left open, drop closers that close nothing
    ['<p>Great <a href="https://phish.example/login">shop</p>', '<p>Great <a href="https://phish.example/login">shop</a></p>'],
    ['</div></section></main><p>moved</p>', '<p>moved</p>'],
    ['<b><i>x</b>y', '<b><i>x</i></b>y'],
    // the closing the HTML parser would do by itself is written out, so a closing tag never reaches the page around the value
    ['<ul><li>a<li>b', '<ul><li>a</li><li>b</li></ul>'],
    ['<li><br><p><div><li></p>', '<li><br><p></p><div></div></li><li></li>'],
    ['<h1>a<h2>b</h2>', '<h1>a</h1><h2>b</h2>'],
    ['<a href=/x>1<a href=/y>2</a>', '<a href="/x">1</a><a href="/y">2</a>'],
    ['<p>a<ul><li>b</ul>', '<p>a</p><ul><li>b</li></ul>'],
    ['<ul><li><ul><li>x</ul></ul>', '<ul><li><ul><li>x</li></ul></li></ul>'],
    ['x</br></p>', 'x'],
    ['<p>a</p></p><span>b', '<p>a</p><span>b</span>']
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
  it('caps nesting and matches closing tags in constant time', () => {
    const deep = sanitizeHtml('<b>'.repeat(500) + 'x')
    expect(deep.split('<b>').length - 1).toBe(100)
    expect(deep.split('</b>').length - 1).toBe(100)
    const started = Date.now()
    const mismatched = sanitizeHtml('<b>'.repeat(100000) + '</i>'.repeat(100000))
    expect(mismatched.split('</b>').length - 1).toBe(100)
    expect(Date.now() - started).toBeLessThan(2000)
  })
})
