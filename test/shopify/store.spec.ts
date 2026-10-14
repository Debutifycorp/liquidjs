import { ColorSchemeDrop, createShopifyLiquid, renderLiquid, sampleStoreData, SettingsDrop, Translator } from '../../src/shopify'
import type { SettingDefinition } from '../../src/shopify'
import { filterStatus } from '../../src/shopify/filters'
import { HandleMap } from '../../src/shopify/objects/handle-map'
import { ReportCollector } from '../../src/shopify/report'
import { resolveServices } from '../../src/shopify/services'
import type { SettingsEnv } from '../../src/shopify/settings'
import { buildLinklists, buildProduct, buildStore } from '../../src/shopify/store/build'
import { buildGlobals } from '../../src/shopify/store/globals'
import { isSafeUrl, sanitizeHtml } from '../../src/shopify/util/sanitize'

const store = buildStore(sampleStoreData)
const liquid = createShopifyLiquid()
const render = async (source: string, scope: object) => (await renderLiquid(liquid, source, scope)).html

function env (overrides: Partial<SettingsEnv> = {}): SettingsEnv {
  const translator = new Translator({ locale: 'en', defaultLocale: 'en', locales: {}, schemaLocales: { en: { settings: { heading: 'Welcome' } } } })
  return { store, linklists: buildLinklists(store.linklists, '/'), services: resolveServices(), translator, report: new ReportCollector(), trust: { liquidSettings: false, htmlSettings: false }, ...overrides }
}

describe('shopify/store', () => {
  it('derives product fields', async () => {
    const product = store.products.liquidMethodMissing('classic-tee')
    expect(await render("{{ p.url }}|{{ p.price | money }}|{{ p.price_varies }}|{{ p.compare_at_price | money }}|{{ p.first_available_variant.id }}|{{ p.options_with_values[0].values | join: ',' }}|{{ p.selected_or_first_available_variant.url }}|{{ p.featured_image.width }}|{{ p.has_only_default_variant }}|{{ p.featured_image.aspect_ratio }}|{{ p.featured_image.preview_image }}|{{ p.media[0].preview_image.width }}|{{ 1 | divided_by: p.featured_media.preview_image.aspect_ratio }}", { p: product }))
      .toBe('/products/classic-tee|$25.00|true|$30.00|3001|S,M,L|/products/classic-tee?variant=3001|1200|false|1.0||1200|1.0')
  })
  it('numbers product images and media from 1, and leaves other images without a position', async () => {
    const product = buildProduct({
      id: 9001,
      handle: 'gallery',
      title: 'Gallery',
      images: [{ src: '/a.jpg', width: 100, height: 100 }, { src: '/b.jpg', width: 100, height: 100 }],
      media: [
        { media_type: 'image', src: '/a.jpg', width: 100, height: 100 },
        { media_type: 'external_video', id: 5, host: 'youtube', external_id: 'abc', preview_image: { src: '/v.jpg' } },
        { media_type: 'image', src: '/b.jpg', width: 100, height: 100 }
      ],
      variants: [{ id: 9101, title: 'Default Title', price: 100, available: true, option1: 'Default Title' }]
    })
    expect(await render('{{ p.images[0].position }}|{{ p.images[1].position }}|{{ p.featured_image.position }}|{% for m in p.media %}{{ m.position }}{% endfor %}|{{ p.featured_media.position }}|{{ p.media[1].preview_image.position }}|{{ image.position }}', { p: product, image: store.images.liquidMethodMissing('hero.jpg') }))
      .toBe('1|2|1|123|1||')
  })
  it('gives a variant image the position of the same image in the product images and media', async () => {
    const product = buildProduct({
      id: 9002,
      handle: 'gallery',
      title: 'Gallery',
      images: [{ src: '/a.jpg', width: 100, height: 100 }, { src: '/b.jpg', width: 100, height: 100 }, { src: '/c.jpg', id: 33, width: 100, height: 100 }],
      media: [
        { media_type: 'image', src: '/a.jpg', width: 100, height: 100 },
        { media_type: 'external_video', id: 5, host: 'youtube', external_id: 'abc', preview_image: { src: '/v.jpg' } },
        { media_type: 'image', src: '/b.jpg', width: 100, height: 100 },
        { media_type: 'image', src: '/c.jpg', id: 33, width: 100, height: 100 }
      ],
      variants: [
        { id: 1, title: 'A', price: 100, available: true, option1: 'A', image: { src: '/a.jpg', width: 100, height: 100 } },
        { id: 2, title: 'B', price: 100, available: true, option1: 'B', image: { src: '/b.jpg', width: 100, height: 100 } },
        { id: 3, title: 'C', price: 100, available: true, option1: 'C', image: { src: '/renamed.jpg', id: 33, width: 100, height: 100 } },
        { id: 4, title: 'D', price: 100, available: true, option1: 'D', image: { src: '/elsewhere.jpg', width: 100, height: 100 } },
        { id: 5, title: 'E', price: 100, available: true, option1: 'E' }
      ]
    })
    expect(await render('{% for v in p.variants %}{{ v.featured_image.position }}/{{ v.featured_media.position }}/{{ v.image.position }} {% endfor %}', { p: product }))
      .toBe('1/1/1 2/3/2 3/4/3 // // ')
    expect(await render('{{ p.variants[1].featured_image.position }}={{ p.images[1].position }} {{ p.variants[1].featured_media.position }}={{ p.media[2].position }}', { p: product }))
      .toBe('2=2 3=3')
  })
  it('gives variants a hidden back reference to their product', async () => {
    const product = store.products.liquidMethodMissing('canvas-bag')
    const [title, json] = (await render('{{ p.variants[0].product.title }}|{{ p.variants[0] | json }}', { p: product })).split('|')
    expect(title).toBe('Canvas Bag')
    expect(JSON.parse(json)).toEqual(JSON.parse(JSON.stringify((product as any).variants[0])))
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
  it('takes price, compare-at price and the first available variant from all the variants', async () => {
    const odd = buildStore({
      shop: { name: 'Odd', domain: 'odd.example', currency: 'USD' },
      products: [{
        id: 1,
        handle: 'odd',
        title: 'Odd',
        options: ['Size'],
        variants: [
          { id: 11, title: 'XL', price: 9000, compare_at_price: 12000, available: false, option1: 'XL' },
          { id: 12, title: 'S', price: 4000, compare_at_price: 5000, available: true, option1: 'S' },
          { id: 13, title: 'M', price: 6000, compare_at_price: 8000, available: true, option1: 'M' }
        ]
      }]
    })
    const p = odd.products.liquidMethodMissing('odd')
    expect(await render('{{ p.price | money }}|{{ p.price_min | money }}|{{ p.price_max | money }}|{{ p.compare_at_price | money }}|{{ p.compare_at_price_min | money }}|{{ p.compare_at_price_max | money }}|{{ p.compare_at_price_varies }}|{{ p.first_available_variant.id }}|{{ p.selected_or_first_available_variant.id }}|{{ p.available }}|{{ p.options_with_values[0].selected_value }}', { p }))
      .toBe('$40.00|$40.00|$90.00|$50.00|$50.00|$120.00|true|12|12|true|S')
  })
  it('builds the cart', async () => {
    expect(await render('{{ cart.item_count }}|{{ cart.total_price | money }}|{{ cart.items[0].title }}|{{ cart.items[0].final_line_price | money }}', { cart: store.cart }))
      .toBe('2|$50.00|Classic Tee - S / Black|$50.00')
  })
  it('ignores query strings when matching links, and types them by where they point', async () => {
    const lists = [{
      handle: 'm',
      title: 'M',
      links: [
        { title: 'Catalog', url: '/collections/all?sort_by=price' },
        { title: 'Collections', url: '/collections' },
        { title: 'Tee', url: '/products/classic-tee' },
        { title: 'Blog', url: '/blogs/news' },
        { title: 'Group', url: '/pages/group', links: [{ title: 'Deep', url: '/pages/group/deep#x' }] }
      ]
    }]
    const show = (path: string) => render('{% for l in linklists.m.links %}{{ l.title }}:{{ l.current }}:{{ l.active }}:{{ l.child_current }}:{{ l.child_active }} {% endfor %}', { linklists: buildLinklists(lists, path) })
    expect(await show('/collections/all')).toBe('Catalog:true:true:false:false Collections:false:true:false:false Tee:false:false:false:false Blog:false:false:false:false Group:false:false:false:false ')
    expect(await show('/collections/apparel/products/classic-tee')).toBe('Catalog:false:false:false:false Collections:false:true:false:false Tee:true:true:false:false Blog:false:false:false:false Group:false:false:false:false ')
    expect(await show('/blogs/news/hello-world')).toBe('Catalog:false:false:false:false Collections:false:false:false:false Tee:false:false:false:false Blog:false:true:false:false Group:false:false:false:false ')
    expect(await show('/pages/group/deep?page=2')).toBe('Catalog:false:false:false:false Collections:false:false:false:false Tee:false:false:false:false Blog:false:false:false:false Group:false:true:true:true ')
    const types: Array<[string, string]> = [
      ['/', 'frontpage_link'], ['/collections', 'collections_link'], ['/collections/all', 'catalog_link'], ['/collections/apparel', 'collection_link'],
      ['/collections/vendors?q=Acme', 'http_link'], ['/collections/types?q=Shirt', 'http_link'], ['/products/classic-tee', 'product_link'], ['/pages/about', 'page_link'],
      ['/blogs/news', 'blog_link'], ['/blogs/news/hello-world', 'article_link'], ['/search', 'search_link'], ['/policies/refund-policy', 'policy_link'],
      ['/account/login', 'customer_account_page_link'], ['https://example.com/x', 'http_link']
    ]
    const typed = buildLinklists([{ handle: 't', title: 'T', links: types.map(([url]) => ({ title: url, url })) }], '/')
    expect(await render('{% for l in linklists.t.links %}{{ l.type }},{% endfor %}{{ linklists.t.links[0].object }}', { linklists: typed })).toBe(types.map(([, type]) => type).join(',') + ',')
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
  it('gives a blog moderated? and comments_enabled?, both false', async () => {
    expect(await render('{% if blog.moderated? == false %}open{% endif %}|{% if blog.comments_enabled? == false %}off{% endif %}', { blog: store.blogs.liquidMethodMissing('news') })).toBe('open|off')
  })
  it('builds a collection\'s storefront filters from the filters the store data sets up, and none without them', async () => {
    const show = '{% for f in c.filters %}[{{ f.label }}|{{ f.type }}|{{ f.param_name }}|{{ f.operator }}|{{ f.presentation }}|{{ f.url_to_remove }}|{{ f.active_values.size }}/{{ f.inactive_values.size }}|{{ f.range_max }}|{{ f.min_value.param_name }}:{{ f.min_value.value }}|{{ f.max_value.param_name }}:{{ f.max_value.value }}|{% for v in f.values %}{{ v.label }}={{ v.value }}:{{ v.count }}:{{ v.active }}:{{ v.param_name }}:{{ v.url_to_add }}:{{ v.url_to_remove }}:{{ v.swatch }};{% endfor %}]{% endfor %}'
    expect(await render('{{ c.filters.size }}', { c: store.collections.liquidMethodMissing('frontpage') })).toBe('0')
    const filters = [{ attribute: 'availability' as const }, { attribute: 'price' as const }, { attribute: 'product_type' as const }, { attribute: 'vendor' as const, label: 'Brand' }, { attribute: 'tag' as const }, { attribute: 'option' as const, option: 'Color', presentation: 'swatch' as const }, { attribute: 'option' as const, option: 'Material' }]
    const filtered = buildStore({ ...sampleStoreData, filters })
    expect(await render(show, { c: filtered.collections.liquidMethodMissing('frontpage') })).toBe([
      '[Availability|list|filter.v.availability|OR|text|/collections/frontpage|0/2||:|:|In stock=1:3:false:filter.v.availability:/collections/frontpage?filter.v.availability=1:/collections/frontpage:;Out of stock=0:1:false:filter.v.availability:/collections/frontpage?filter.v.availability=0:/collections/frontpage:;]',
      '[Price|price_range|filter.v.price|||/collections/frontpage|0/0|4500|filter.v.price.gte:|filter.v.price.lte:|]',
      '[Product type|list|filter.p.product_type|OR|text|/collections/frontpage|0/3||:|:|Bags=Bags:1:false:filter.p.product_type:/collections/frontpage?filter.p.product_type=Bags:/collections/frontpage:;Home=Home:1:false:filter.p.product_type:/collections/frontpage?filter.p.product_type=Home:/collections/frontpage:;Shirts=Shirts:1:false:filter.p.product_type:/collections/frontpage?filter.p.product_type=Shirts:/collections/frontpage:;]',
      '[Brand|list|filter.p.vendor|OR|text|/collections/frontpage|0/2||:|:|Kiln & Co=Kiln & Co:1:false:filter.p.vendor:/collections/frontpage?filter.p.vendor=Kiln%20%26%20Co:/collections/frontpage:;Sample Co=Sample Co:2:false:filter.p.vendor:/collections/frontpage?filter.p.vendor=Sample%20Co:/collections/frontpage:;]',
      '[Tags|list|filter.p.tag|OR|text|/collections/frontpage|0/3||:|:|canvas=canvas:1:false:filter.p.tag:/collections/frontpage?filter.p.tag=canvas:/collections/frontpage:;cotton=cotton:1:false:filter.p.tag:/collections/frontpage?filter.p.tag=cotton:/collections/frontpage:;new=new:1:false:filter.p.tag:/collections/frontpage?filter.p.tag=new:/collections/frontpage:;]',
      '[Color|list|filter.v.option.color|OR|swatch|/collections/frontpage|0/2||:|:|Black=Black:1:false:filter.v.option.color:/collections/frontpage?filter.v.option.color=Black:/collections/frontpage:;White=White:1:false:filter.v.option.color:/collections/frontpage?filter.v.option.color=White:/collections/frontpage:;]'
    ].join(''))
    expect(await render('{% for f in c.filters %}{{ f.label }}:{% for v in f.values %}{{ v.label }}={{ v.count }},{% endfor %}{{ f.range_max }};{% endfor %}', { c: filtered.collections.liquidMethodMissing('apparel') }))
      .toBe('Availability:In stock=1,Out of stock=1,;Price:2700;Product type:Shirts=1,;Brand:Sample Co=1,;Tags:cotton=1,new=1,;Color:Black=1,White=1,;')
  })
  it('gives the gift_card template the gift card the store data issues, and none without one', async () => {
    const fields = '{{ gift_card.balance | money }}|{{ gift_card.initial_value | money }}|{{ gift_card.code }}|{{ gift_card.last_four_characters }}|{{ gift_card.currency }}|{{ gift_card.enabled }}|{{ gift_card.expired }}|{{ gift_card.expires_on }}|{{ gift_card.qr_identifier }}|{{ gift_card.pass_url }}|{{ gift_card.product.title }}|{{ gift_card.variant.id }}|{{ gift_card.customer.first_name }}|{{ gift_card.properties.Note }}|{{ gift_card.template_suffix }}|{{ gift_card.message }}|{{ gift_card.recipient }}|{{ gift_card.send_on }}|{{ gift_card.url }}'
    const none = buildGlobals({ store, templateName: 'gift_card', request: {}, locale: 'en', report: new ReportCollector() })
    expect(await render('{% if gift_card == nil %}none{% endif %}', none.globals)).toBe('none')
    const data = { ...sampleStoreData, gift_card: { balance: 2500, initial_value: 5000, code: 'WCGX 7X97 K9HJ DFR8', expires_on: '2027-01-01', qr_identifier: 'sample-qr-identifier', pass_url: 'https://example.com/passes/1', product_handle: 'canvas-bag', variant_id: 3004, customer: { first_name: 'Ana' }, properties: { Note: 'Happy birthday' }, url: 'https://example.com/gift_cards/1' } }
    const issued = buildStore(data)
    const page = buildGlobals({ store: issued, templateName: 'gift_card', request: {}, locale: 'en', report: new ReportCollector() })
    expect(await render(fields, page.globals)).toBe('$25.00|$50.00|WCGX 7X97 K9HJ DFR8|DFR8|USD|true|false|2027-01-01|sample-qr-identifier|https://example.com/passes/1|Canvas Bag|3004|Ana|Happy birthday|||||https://example.com/gift_cards/1')
    const product = buildGlobals({ store: issued, templateName: 'product', request: {}, locale: 'en', report: new ReportCollector() })
    expect(await render('{% if gift_card == nil %}none{% endif %}', product.globals)).toBe('none')
  })
  it('prints country_option_tags and all_country_option_tags as option tags: a --- option, then each country with its subregions in data-provinces', async () => {
    const canada = { name: 'Canada', provinces: [['Alberta', 'Alberta'], ['British Columbia', 'British Columbia']] as Array<[string, string]> }
    const data = { ...sampleStoreData, country_option_tags: [canada, { name: 'Afghanistan' }], all_country_option_tags: [{ name: 'Afghanistan' }, canada, { name: "Côte d'Ivoire" }] }
    const page = buildGlobals({ store: buildStore(data), templateName: 'customers/addresses', request: {}, locale: 'en', report: new ReportCollector() })
    const none = '<option value="---" data-provinces="[]">---</option>'
    const canadaTag = '<option value="Canada" data-provinces="[[&quot;Alberta&quot;,&quot;Alberta&quot;],[&quot;British Columbia&quot;,&quot;British Columbia&quot;]]">Canada</option>'
    const afghanistan = '<option value="Afghanistan" data-provinces="[]">Afghanistan</option>'
    expect(await render('{{ country_option_tags }}', page.globals)).toBe([none, canadaTag, afghanistan].join('\n'))
    expect(await render('{{ all_country_option_tags }}', page.globals)).toBe([none, afghanistan, canadaTag, '<option value="Côte d&#39;Ivoire" data-provinces="[]">Côte d&#39;Ivoire</option>'].join('\n'))
  })
  it('lists the store country in country_option_tags when the data names none, and those countries in all_country_option_tags', async () => {
    const page = buildGlobals({ store, templateName: 'customers/addresses', request: {}, locale: 'en', report: new ReportCollector() })
    const tags = '<option value="---" data-provinces="[]">---</option>\n<option value="United States" data-provinces="[]">United States</option>'
    expect(await render('{{ country_option_tags }}|{{ all_country_option_tags }}', page.globals)).toBe(`${tags}|${tags}`)
  })
  it('answers recommendations.performed as well as recommendations.performed?', async () => {
    const page = buildGlobals({ store, templateName: 'product', request: {}, locale: 'en', report: new ReportCollector() })
    expect(await render('{% if recommendations.performed == false %}false{% endif %}|{% if recommendations.performed? == false %}false?{% endif %}|{% if recommendations.performed %}yes{% else %}no{% endif %}', page.globals)).toBe('false|false?|no')
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
    expect(e.report.toReport([], 0).missing).toEqual([{ kind: 'resource', name: 'image of setting gone' }, { kind: 'resource', name: 'collection of setting lists' }])
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
    expect(html).not.toMatch(/[<>]/)
    expect(JSON.parse(await render('{{ s | json }}', { s }))).toEqual({ code: '&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;' })
    expect(JSON.parse(await render('{{ s | inspect }}', { s }))).toEqual({ code: '&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;' })
  })
  it('prints trusted liquid settings through json as strings, also after one has rendered', async () => {
    const s = new SettingsDrop(liquidDefinitions, { code: '{{ greeting }} <b>' }, env({ trust: { liquidSettings: true, htmlSettings: false } }))
    const html = await render('{{ s.code }}|{{ s | json }}|{{ s.code }}', { s, greeting: 'Hi' })
    const [first, json, second] = html.split('|')
    expect([first, second]).toEqual(['Hi <b>', 'Hi <b>'])
    expect(JSON.parse(json)).toEqual({ code: '{{ greeting }} <b>' })
    // the parse cache is not a field of the setting, so nothing that walks the setting reaches it
    expect(Object.keys(SettingsDrop.value(s, 'code') as object)).toEqual(['source'])
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
    const definitions = [text('plain'), text('area', 'textarea'), text('pick', 'select', { options: [{ value: 'option-1', label: 'One' }, { value: 'option-2', label: 'Two' }] }), text('markup'), text('lt'), text('fallback', 'text', { default: '<i onclick=x>d</i>' })]
    const stored = { plain: 'Fish & chips "x" > y', area: 'Line one\nLine two', pick: 'option-1', markup: '<img src=x onerror=alert(1)>Hi', lt: 'a < b', legacy: '<script>alert(1)</script>ok', nested: { list: ['<b onclick=x>t</b>', 3, null], clean: 'fine' } }
    const s = new SettingsDrop(definitions, stored, env())
    expect(await render('{{ s.plain }}|{{ s.area }}|{{ s.pick }}|{{ s.markup }}|{{ s.lt }}|{{ s.fallback }}|{{ s.legacy }}', { s })).toBe('Fish & chips "x" > y|Line one\nLine two|option-1|<img src="x">Hi|a &lt; b|<i>d</i>|ok')
    expect(JSON.parse(await render('{{ s.nested | json }}', { s }))).toEqual({ list: ['<b>t</b>', 3, null], clean: 'fine' })
    const trustedHtml = new SettingsDrop(definitions, stored, env({ trust: trusted }))
    expect(await render('{{ s.markup }}|{{ s.lt }}|{{ s.legacy }}', { s: trustedHtml })).toBe('<img src=x onerror=alert(1)>Hi|a < b|<script>alert(1)</script>ok')
  })
  it('makes image and colour values safe when they are data rather than a file reference', async () => {
    const definitions: SettingDefinition[] = [{ type: 'image_picker', id: 'bad' }, { type: 'image_picker', id: 'good' }, { type: 'color', id: 'color' }]
    const stored = { bad: { src: 'javascript:alert(1)', alt: 'x' }, good: { src: '/img.png', width: 3, height: 2, alt: '<img src=x onerror=y>t' }, color: '<img src=x onerror=1>' }
    const s = new SettingsDrop(definitions, stored, env())
    expect(await render('[{{ s.bad }}]|{{ s.good }}|{{ s.good.alt }}|[{{ s.color }}]', { s })).toBe('[]|/img.png||[]')
    expect(await render('{{ s.good.alt }}|{{ s.color }}', { s: new SettingsDrop(definitions, stored, env({ trust: trusted })) })).toBe('<img src=x onerror=y>t|<img src=x onerror=1>')
  })
  it('drops url settings with an unsafe scheme and reports them', async () => {
    const definitions: SettingDefinition[] = [{ type: 'url', id: 'link' }, { type: 'video_url', id: 'video' }]
    for (const bad of ['javascript:alert(2)', 'JavaScript:alert(2)', 'vbscript:x', 'file:///etc/passwd']) {
      const e = env()
      expect(await render('[{{ s.link }}]', { s: new SettingsDrop(definitions, { link: bad }, e) })).toBe('[]')
      expect(e.report.toReport([], 0).unsupported).toEqual([{ feature: 'unsafe_url', detail: 'url setting link has a URL scheme other than http, https, mailto or tel and was dropped' }])
    }
    for (const bad of ['jav&#x09;ascript:alert(2)', 'https://x.example/&#39;);alert(1);//', 'https://x.example/&#x27;', 'https://x.example/&#34;', 'https://x.example/&quot;', 'https://x.example/&QUOT', 'https://x.example/&apos;', '/a&#', ' JavaScript:alert(2)', 'data:text/html,<b>x', 'https://x.example/"><script>alert(4)</script>', "/a' onfocus='x", '/a b', '/a\tb', '/a"b', "/a'b", '/a<b', '/a>b', '/a`b', '/a\u0001b', '/a\u007fb', '/a\u0085b', '/a\u00a0b', '/a\u2028b', 'https://x.example/`', 'shopify://products/<img src=x onerror=alert(3)>']) {
      const e = env()
      expect(await render('[{{ s.link }}]', { s: new SettingsDrop(definitions, { link: bad }, e) })).toBe('[]')
      expect(e.report.toReport([], 0).unsupported).toEqual([{ feature: 'unsafe_url', detail: 'url setting link has a URL with a quote, angle bracket, backtick, space, control character or character reference and was dropped' }])
    }
    const e = env()
    expect(await render('[{{ s.video.type }}]', { s: new SettingsDrop(definitions, { video: 'javascript:alert(1)' }, e) })).toBe('[]')
    expect(e.report.toReport([], 0).unsupported).toHaveLength(1)
    for (const good of ['https://example.com/a?b=c&d=e', 'https://example.com/a?b=c&amp;d=e', 'http://example.com', 'mailto:a@b.c', 'tel:+15551234567', '/pages/about', '#top', 'relative/path', '/collections']) {
      expect(await render('{{ s.link }}', { s: new SettingsDrop(definitions, { link: good }, env()) })).toBe(good)
    }
    expect(await render('{{ s.link }}|{{ s.l2 }}|{{ s.l3 }}', { s: new SettingsDrop([{ type: 'url', id: 'link' }, { type: 'url', id: 'l2' }, { type: 'url', id: 'l3' }], { link: 'shopify://collections/apparel', l2: 'shopify://search', l3: 'shopify://metaobjects/team/ada' }, env()) })).toBe('/collections/apparel|/search|shopify://metaobjects/team/ada')
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
    expect(SettingsDrop.value(settings, 'constructor')).toBe('')
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

describe('shopify/settings forms', () => {
  const trusted = { liquidSettings: true, htmlSettings: true }
  const options = [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]
  const one = (definition: SettingDefinition, stored: unknown, overrides: Partial<SettingsEnv> = {}) => {
    const e = env(overrides)
    const settings = new SettingsDrop([definition], stored === undefined ? {} : { [definition.id as string]: stored }, e)
    return { value: SettingsDrop.value(settings, definition.id as string), unsupported: e.report.toReport([], 0).unsupported }
  }
  const text = (value: unknown) => (value as { valueOf: () => unknown }).valueOf()
  const invalid = (type: string, id: string, reason: string) => ({ feature: 'invalid_setting', detail: `${type} setting ${id} ${reason}` })

  it.each([
    ['select', 'right', 'right', []],
    ['select', 'x" autofocus onfocus="y', 'left', ['has a value that is not one of its options and was replaced by its default']],
    ['select', 7, 'left', ['has a value that is not one of its options and was replaced by its default']],
    ['select', undefined, 'left', []],
    ['radio', 'nope', 'left', ['has a value that is not one of its options and was replaced by its default']]
  ] as Array<[string, unknown, unknown, string[]]>)('holds a %s to its options: %p gives %p', (type, stored, expected, reasons) => {
    const result = one({ type, id: 'layout', options, default: 'left' }, stored)
    expect(result.value).toBe(expected)
    expect(result.unsupported).toEqual(reasons.map(reason => invalid(type, 'layout', reason)))
  })
  it('gives a select nothing when neither its value nor its default is an option, and trusts nothing it must not print', () => {
    expect(one({ type: 'select', id: 'layout', options, default: 'up' }, 'down').value).toBeNull()
    expect(one({ type: 'select', id: 'layout', default: 'left' }, 'left').value).toBeNull()
    expect(one({ type: 'select', id: 'layout', options: [{ value: 'a"b', label: 'A' }, { value: 'ok', label: 'O' }], default: 'a"b' }, 'a"b').value).toBeNull()
    expect(one({ type: 'text_alignment', id: 'align', default: 'center' }, 'justify" x').value).toBe('center')
    expect(one({ type: 'text_alignment', id: 'align' }, 'right').value).toBe('right')
    expect(one({ type: 'text_alignment', id: 'align', default: 'left' }, 'justify').value).toBe('left')
  })
  it.each([
    [5, 5, []],
    ['7', 7, []],
    [' 7.5 ', 7.5, []],
    [-3, 0, ['has a value outside its min and max and was clamped']],
    [500, 100, ['has a value outside its min and max and was clamped']],
    ['1" onmouseover="alert(2)', 36, ['has a value that is not a number and was replaced by its default']],
    [NaN, 36, ['has a value that is not a number and was replaced by its default']],
    [Infinity, 36, ['has a value that is not a number and was replaced by its default']],
    [['5'], 36, ['has a value that is not a number and was replaced by its default']],
    [undefined, 36, []]
  ] as Array<[unknown, number, string[]]>)('holds a range to a number in its bounds: %p gives %p', (stored, expected, reasons) => {
    const result = one({ type: 'range', id: 'pad', min: 0, max: 100, step: 4, default: 36 }, stored)
    expect(result.value).toBe(expected)
    expect(result.unsupported).toEqual(reasons.map(reason => invalid('range', 'pad', reason)))
  })
  it('holds a number to a finite number, and leaves a range without bounds unclamped', () => {
    expect(one({ type: 'number', id: 'count', default: 2 }, 'x').value).toBe(2)
    expect(one({ type: 'number', id: 'count' }, 'x').value).toBeNull()
    expect(one({ type: 'number', id: 'count' }, 1e6).value).toBe(1e6)
    expect(one({ type: 'number', id: 'count', min: 0, max: 5 }, 9).value).toBe(9)
    for (const odd of ['0x10', '1e3', '', ' ', '1,5', '--1', 'Infinity']) expect([odd, one({ type: 'range', id: 'pad', default: 3 }, odd).value]).toEqual([odd, 3])
    expect(one({ type: 'range', id: 'pad', default: 1 }, 1e6).value).toBe(1e6)
    expect(one({ type: 'range', id: 'pad', min: 10, default: 12 }, 1).value).toBe(10)
    expect(one({ type: 'range', id: 'pad', max: 'x', default: 12 }, 20).value).toBe(20)
  })
  it.each([
    [true, true, []],
    [false, false, []],
    ['true', false, ['has a value that is not a boolean and was replaced by its default']],
    ['" autofocus onfocus="x', false, ['has a value that is not a boolean and was replaced by its default']],
    [1, false, ['has a value that is not a boolean and was replaced by its default']],
    [undefined, false, []]
  ] as Array<[unknown, unknown, string[]]>)('holds a checkbox to a boolean: %p gives %p', (stored, expected, reasons) => {
    const result = one({ type: 'checkbox', id: 'flag' }, stored)
    expect(result.value).toBe(expected)
    expect(result.unsupported).toEqual(reasons.map(reason => invalid('checkbox', 'flag', reason)))
    expect(one({ type: 'checkbox', id: 'flag', default: true }, 'yes').value).toBe(true)
    // https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings: "If `default` is unspecified, then the value is `false` by default"
    expect(one({ type: 'checkbox', id: 'flag' }, undefined, { trust: trusted }).value).toBe(false)
    expect(one({ type: 'checkbox', id: 'flag', default: true }, undefined).value).toBe(true)
  })
  it('holds a colour to a colour, and a background to a colour or a gradient', async () => {
    expect(text(one({ type: 'color', id: 'c', default: '#112233' }, '#abcdef').value)).toBe('#abcdef')
    expect(text(one({ type: 'color', id: 'c', default: '#112233' }, 'rgb(1, 2, 3)').value)).toBe('rgb(1, 2, 3)')
    expect(text(one({ type: 'color', id: 'c', default: '#112233' }, 'red" autofocus onfocus="x').value)).toBe('#112233')
    expect(one({ type: 'color', id: 'c' }, 'red;}</style>').value).toBeNull()
    expect(one({ type: 'color', id: 'c', default: 'not a colour' }, 'bad"').value).toBeNull()
    expect(one({ type: 'color', id: 'c', default: '#112233' }, '').value).toBe('')
    expect(one({ type: 'color', id: 'c' }, 4).value).toBeNull()
    expect(one({ type: 'color', id: 'c' }, 'red" x', { trust: trusted }).value).toBe('red" x')
    expect(one({ type: 'color', id: 'c', default: '#112233' }, 'red" autofocus').unsupported).toEqual([invalid('color', 'c', 'has a value that is not a colour and was replaced by its default')])
    const gradient = 'linear-gradient(90deg, rgba(0, 0, 0, 0.5) 0%, #fff 100%)'
    expect(one({ type: 'color_background', id: 'b' }, gradient).value).toBe(gradient)
    expect(one({ type: 'color_background', id: 'b' }, '#fff').value).toBe('#fff')
    expect(one({ type: 'color_background', id: 'b' }, '').value).toBe('')
    for (const bad of ['red;}</style>', 'url("x")', 'url(//evil.example/beacon)', 'URL(//evil.example/b)', 'url (//evil.example/b)', 'linear-gradient(red, url(//evil.example/b))', 'image-set(red)', 'expression(alert)', 'var(--x)', 'a" b', 'a\\b', 'a:b', 'a;b', 'a{b}', "x'y", 'a`b', 'x'.repeat(2001)]) {
      expect([bad.slice(0, 20), one({ type: 'color_background', id: 'b', default: gradient }, bad).value]).toEqual([bad.slice(0, 20), gradient])
      expect(one({ type: 'color_background', id: 'b' }, bad).value).toBeNull()
    }
    for (const good of ['radial-gradient(circle, #fff 0%, #000 100%)', 'conic-gradient(from 0deg, red, blue)', 'repeating-linear-gradient(45deg, #fff, #000 10px)', 'LINEAR-GRADIENT(red, blue)', 'linear-gradient(0deg, hsl(10, 20%, 30%) 0%, rgb(1 2 3 / 50%) 100%)']) expect([good, one({ type: 'color_background', id: 'b' }, good).value]).toEqual([good, good])
    expect(one({ type: 'color_background', id: 'b' }, 'red";x', { trust: trusted }).value).toBe('red";x')
    expect(one({ type: 'color_background', id: 'b' }, 'url(//x.example/b)', { trust: trusted }).value).toBe('url(//x.example/b)')
  })
  it('keeps what it must of an image given as data, and drops the rest', async () => {
    const image = (value: unknown, overrides: Partial<SettingsEnv> = {}) => one({ type: 'image_picker', id: 'pic' }, value, overrides)
    const ok = image({ src: '/a.png', width: 10, height: 5, id: 3, alt: 'A red bag, front & back', focal_point: { x: 10, y: '20' } }).value as any
    expect([ok.src, ok.width, ok.height, ok.id, ok.alt, text(ok.presentation.focal_point)]).toEqual(['/a.png', 10, 5, 3, 'A red bag, front & back', '10% 20%'])
    const odd = image({ src: 'https://c.example/a.png', width: '10" onload="x', height: NaN, id: '3', alt: 7, focal_point: { x: 'a', y: 1 }, extra: '<img>' }).value as any
    expect([odd.src, odd.width, odd.height, odd.id, odd.alt, text(odd.presentation.focal_point)]).toEqual(['https://c.example/a.png', null, null, null, '', '50% 50%'])
    for (const src of ['javascript:alert(1)', 'https://c.example/a.png" onerror="x', 'https://c.example/a b.png', '/a<b', '', 7, null]) {
      expect(image({ src }).value).toBeNull()
    }
    expect(image({ src: 'https://c.example/a.png" onerror="x' }).unsupported).toEqual([{ feature: 'unsafe_url', detail: 'image_picker setting pic has an image whose src is not a safe URL and was dropped' }])
    // an alt is printed in an attribute: one with a double quote, angle bracket, backtick or control character is dropped (the image stays) and reported without the alt
    // an apostrophe becomes a typographic one, so a single-quoted attribute cannot end early and the text reads the same
    expect((image({ src: '/a.png', alt: "Women's dress" }).value as any).alt).toBe('Women\u2019s dress')
    expect((image({ src: '/a.png', alt: "a' onerror='x" }).value as any).alt).toBe('a\u2019 onerror=\u2019x')
    for (const alt of ['a" onerror="alert(12)', 'a<b>b</b>', 'a>b', 'a`b', 'a\u0001b', 'a\u2028b', 'a\u007fb']) {
      const result = image({ src: '/a.png', alt })
      expect([alt, (result.value as any).src, (result.value as any).alt]).toEqual([alt, '/a.png', ''])
      expect(result.unsupported).toEqual([{ feature: 'invalid_setting', detail: 'image_picker setting pic has an image alt with a quote, angle bracket, backtick or control character and the alt was dropped' }])
    }
    for (const src of ['https://c.example/a.png?x=&#34;onerror=&#34;', '/a.png?x=&quot;', '/a.png?x=&apos;']) expect(image({ src }).value).toBeNull()
    expect((image({ src: '/a.png?x=1&y=2&amp;z=3' }).value as any).src).toBe('/a.png?x=1&y=2&amp;z=3')
    const kept = image({ src: 'x" y', width: '3', alt: '<b>' }, { trust: trusted }).value as any
    expect([kept.src, kept.width, kept.alt]).toEqual(['x" y', '3', '<b>'])
  })
  it('drops colour-scheme ids and keys with unsafe characters, and says so', async () => {
    const e = env()
    const definition = { type: 'color_scheme_group', id: 'color_schemes', definition: [{ type: 'color', id: 'background', default: '#ffffff' }] }
    const settings = new SettingsDrop([definition, { type: 'color_scheme', id: 'scheme', default: 'scheme-1' }], {
      color_schemes: {
        'scheme-1': { settings: { 'ok-key': 'fine', 'bad"key': 'x', '</script>': 'y' } },
        'Background_2-b': {},
        'x"><img src=x onerror=1>': {},
        'a b': {},
        'a</style>': {},
        '': {}
      },
      scheme: 'x"><img src=x onerror=1>',
      'bad key"': 'k',
      nested: { 'fine': 1, '<b>': 2, deep: { '"': 3, ok: 4 } },
      okay_key: 'v'
    }, e)
    const group = SettingsDrop.colorSchemes(settings) as HandleMap<ColorSchemeDrop>
    expect(HandleMap.values(group).map(scheme => scheme.id)).toEqual(['scheme-1', 'Background_2-b'])
    expect(Object.keys((HandleMap.get(group, 'scheme-1') as ColorSchemeDrop).settings)).toEqual(['background', 'ok-key'])
    expect(await render('{{ s.scheme }}', { s: settings })).toBe('scheme-1')
    expect(JSON.parse(await render('{{ s.nested | json }}|', { s: settings }).then(text => text.slice(0, -1)))).toEqual({ fine: 1, deep: { ok: 4 } })
    expect(Object.keys(JSON.parse(await render('{{ s | json }}', { s: settings })))).toEqual(['color_schemes', 'scheme', 'nested', 'okay_key'])
    const report = e.report.toReport([], 0).unsupported
    expect(report).toEqual(expect.arrayContaining([
      { feature: 'color_scheme', detail: 'color_scheme_group setting color_schemes has a color scheme whose id has characters other than letters, digits, - and _ and was dropped' },
      { feature: 'unsafe_key', detail: 'a stored settings key with a quote, angle bracket, backtick or control character was dropped' }
    ]))
    expect(JSON.stringify(report)).not.toContain('onerror')
    const trustedSettings = new SettingsDrop([definition], { color_schemes: { 'x"y': {} }, 'k"': 1 }, env({ trust: trusted }))
    expect(HandleMap.values(SettingsDrop.colorSchemes(trustedSettings) as HandleMap<ColorSchemeDrop>).map(scheme => scheme.id)).toEqual(['x"y'])
    expect(SettingsDrop.value(trustedSettings, 'k"')).toBe(1)
  })
  it('keeps out-of-form values for a theme trusted with html, as Shopify prints them', () => {
    const t = { trust: trusted }
    expect(one({ type: 'select', id: 'a', options, default: 'left' }, 'weird', t).value).toBe('weird')
    expect(one({ type: 'select', id: 'a', options, default: 'left' }, undefined, t).value).toBe('left')
    expect(one({ type: 'range', id: 'a', max: 5 }, '9" x', t).value).toBe('9" x')
    expect(one({ type: 'checkbox', id: 'a' }, 'yes', t).value).toBe('yes')
    expect(one({ type: 'url', id: 'a' }, 'javascript:alert(1)', t).value).toBe('javascript:alert(1)')
    expect(one({ type: 'url', id: 'a' }, '/a b"c', t).value).toBe('/a b"c')
    expect(one({ type: 'video_url', id: 'a' }, 'https://x.example/"y', t).unsupported).toEqual([])
  })
})

/**
 * Fidelity to https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings (select and radio: "If `default` is unspecified, then the first option is selected by default"; text_alignment: "If no default is set, `left` applies"; html: "The following HTML tags will be automatically removed" (`<html>`, `<head>`, `<body>`); text, textarea, html, richtext, inline_richtext and liquid: "An `empty` object, if nothing has been entered"; product, collection, page, blog and article: "outputting the setting directly will return the object's handle"), https://shopify.dev/docs/api/liquid/objects/recommendations (`intent`: "If `performed?` is `false`, then `nil` is returned") and the cart's line items (`index` is not on shopify.dev; Dawn's cart reads it).
 */
describe('shopify/settings fidelity', () => {
  const trusted = { liquidSettings: true, htmlSettings: true }
  const options = [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]
  const read = (definition: SettingDefinition, stored: unknown, overrides: Partial<SettingsEnv> = {}) => {
    const settings = new SettingsDrop([definition], stored === undefined ? {} : { x: stored }, env(overrides))
    return SettingsDrop.value(settings, 'x')
  }

  it.each([['select', undefined], ['radio', undefined], ['select', 'nope'], ['radio', 'nope']])('reads a %s with no default as its first option (saved: %p)', (type, saved) => {
    expect(read({ type, id: 'x', options }, saved)).toBe('left')
    // the first option of a theme trusted with html is the first option as written
    expect(read({ type, id: 'x', options: [{ value: 'a"b' }, { value: 'c' }] }, undefined, { trust: trusted })).toBe('a"b')
    expect(read({ type, id: 'x', options: [{ value: 'a"b' }, { value: 'c' }] }, undefined)).toBe('c')
  })
  it('keeps a default that is given, and a saved option', () => {
    expect(read({ type: 'select', id: 'x', options, default: 'right' }, undefined)).toBe('right')
    expect(read({ type: 'select', id: 'x', options, default: 'right' }, undefined, { trust: trusted })).toBe('right')
    expect(read({ type: 'select', id: 'x', options }, 'right')).toBe('right')
    expect(read({ type: 'select', id: 'x', options, default: 'up' }, 'nope')).toBeNull()
    expect(read({ type: 'select', id: 'x' }, undefined)).toBeNull()
    expect(read({ type: 'select', id: 'x', options: [] }, undefined, { trust: trusted })).toBeNull()
    expect(read({ type: 'select', id: 'x', options }, 'other', { trust: trusted })).toBe('other')
  })
  it('reads a text_alignment with no default as left', () => {
    expect(read({ type: 'text_alignment', id: 'x' }, undefined)).toBe('left')
    expect(read({ type: 'text_alignment', id: 'x' }, undefined, { trust: trusted })).toBe('left')
    expect(read({ type: 'text_alignment', id: 'x', default: 'center' }, undefined)).toBe('center')
    expect(read({ type: 'text_alignment', id: 'x' }, 'diagonal')).toBe('left')
  })

  it('removes the document tags from a trusted html setting and keeps what is between them', async () => {
    const definition: SettingDefinition = { type: 'html', id: 'x' }
    const html = '<!doctype html><HTML lang="en"><head><title>T</title></head><body class=\'a>b\' onload="x>y"><p onclick="z()">B</p></BODY></html>'
    expect(read(definition, html, { trust: trusted })).toBe('<!doctype html><title>T</title><p onclick="z()">B</p>')
    expect(read(definition, '<htmlx>a</htmlx><header>b</header><bodyguard>c', { trust: trusted })).toBe('<htmlx>a</htmlx><header>b</header><bodyguard>c')
    expect(read(definition, 'a<body', { trust: trusted })).toBe('a<body')
    expect(read(definition, 'a<body class="x', { trust: trusted })).toBe('a<body class="x')
    expect(read(definition, '<p>a < b</p>', { trust: trusted })).toBe('<p>a < b</p>')
    // untrusted themes get the sanitiser, which drops them as well
    expect(read(definition, html)).toBe('<p>B</p>')
    const started = Date.now()
    expect(read(definition, '<body '.repeat(100000), { trust: trusted })).toBe('<body '.repeat(100000))
    expect(read(definition, '<body>'.repeat(200000) + 'x', { trust: trusted })).toBe('x')
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it.each(['text', 'textarea', 'html', 'richtext', 'inline_richtext', 'liquid'])('reads an unset %s as empty', async type => {
    for (const trust of [undefined, trusted]) {
      for (const saved of [undefined, null, '']) {
        const settings = new SettingsDrop([{ type, id: 'x' }], saved === undefined ? {} : { x: saved }, env(trust ? { trust } : {}))
        expect(await render('{% if s.x == empty %}empty{% endif %}|{% if s.x == blank %}blank{% endif %}|{% if s.x == nil %}nil{% endif %}|{% if s.x %}set{% endif %}|{{ s.x | default: "fallback" }}|{{ s.x.size }}|[{{ s.x }}]', { s: settings })).toBe('empty|blank||set|fallback|0|[]')
        expect(await render('{{ s | json }}', { s: settings })).toBe('{"x":""}')
      }
    }
    const given = new SettingsDrop([{ type, id: 'x' }], { x: 'Hi' }, env())
    expect(await render('{% if s.x == empty %}empty{% else %}text{% endif %}|{{ s.x }}', { s: given })).toBe('text|Hi')
    // a default is something that was entered
    expect(await render('{{ s.x }}', { s: new SettingsDrop([{ type, id: 'x', default: 'Dflt' }], {}, env()) })).toBe('Dflt')
  })

  it.each([['product', 'canvas-bag', 'products'], ['collection', 'apparel', 'collections'], ['page', 'about', 'pages'], ['blog', 'news', 'blogs'], ['article', 'news/hello-world', 'articles']])('prints a %s setting as its handle, and keeps it an object otherwise', async (type, handle, key) => {
    const settings = new SettingsDrop([{ type, id: 'x' }, { type: 'text', id: 'other' }], { x: handle }, env())
    const object = HandleMap.get((store as any)[key] as HandleMap<Record<string, unknown>>, handle) as Record<string, unknown>
    expect(await render('[{{ s.x }}]|{{ s.x.title }}|{{ s.x.url }}|{{ s.x.handle }}|{% if s.x %}set{% endif %}|{% if s.x == blank %}blank{% endif %}', { s: settings })).toBe(`[${object.handle}]|${object.title}|${object.url}|${object.handle}|set|`)
    expect(JSON.parse(await render('{{ s.x | json }}', { s: settings }))).toEqual(JSON.parse(JSON.stringify(object)))
    // the setting returns the object the store holds, not a copy, so it is equal to it and found in the lists that hold it; the handle print is a non-enumerable `toString` of that object
    expect(SettingsDrop.value(settings, 'x')).toBe(object)
    expect(Object.getOwnPropertyDescriptor(object, 'toString')?.enumerable).toBe(false)
    expect(Object.keys(object)).not.toContain('toString')
    expect(await render('{{ s.x }}', { s: new SettingsDrop([{ type, id: 'x' }], {}, env()) })).toBe('')
  })
  it('compares a resource setting with the store object it is, and finds it in a list', async () => {
    const settings = new SettingsDrop([{ type: 'product', id: 'p' }, { type: 'collection', id: 'c' }, { type: 'product_list', id: 'list' }], { p: 'classic-tee', c: 'apparel', list: ['classic-tee', 'canvas-bag'] }, env())
    const scope = { s: settings, all_products: store.products, collections: store.collections }
    expect(await render("{% if s.p == all_products['classic-tee'] %}same{% endif %}|{% if collections.apparel.products contains s.p %}contains{% endif %}|{% if s.p != all_products['canvas-bag'] %}differs{% endif %}|{% if s.c == collections['apparel'] %}same{% endif %}", scope)).toBe('same|contains|differs|same')
    // the elements of a list are the store's objects too and print as their handle (unpinned by shopify.dev)
    expect(await render('{% for p in s.list %}{{ p }},{% endfor %}{{ s.list.first.title }}', scope)).toBe('classic-tee,canvas-bag,Classic Tee')
  })
  it('keeps resource handles out of the report, which may be shown as HTML', async () => {
    const e = env()
    const hostile = '"><img src=x onerror=alert(1)>'
    const settings = new SettingsDrop([{ type: 'product', id: 'p' }, { type: 'link_list', id: 'menu' }, { type: 'image_picker', id: 'pic' }, { type: 'font_picker', id: 'font' }, { type: 'collection_list', id: 'cols' }], { p: hostile, menu: hostile, pic: `shopify://shop_images/${hostile}`, font: hostile, cols: [hostile] }, e)
    for (const id of ['p', 'menu', 'pic', 'font', 'cols']) SettingsDrop.value(settings, id)
    const report = e.report.toReport([], 0)
    expect(report.missing).toEqual([{ kind: 'resource', name: 'product of setting p' }, { kind: 'resource', name: 'menu of setting menu' }, { kind: 'resource', name: 'image of setting pic' }, { kind: 'resource', name: 'collection of setting cols' }])
    expect(report.unsupported).toEqual([{ feature: 'font_picker', detail: 'font_picker setting font has a font that is not known' }])
    expect(JSON.stringify(report)).not.toContain('onerror')
  })
  it('keeps a metaobject setting that is a string to the text rule', async () => {
    const definitions: SettingDefinition[] = [{ type: 'metaobject', id: 'mo' }, { type: 'metaobject_list', id: 'mos' }]
    const stored = { mo: 'a <img src=x onerror=1> b', mos: ['<script>x</script>ok', 'plain'] }
    expect(await render('{{ s.mo }}|{{ s.mos | join: "," }}', { s: new SettingsDrop(definitions, stored, env()) })).toBe('a <img src="x"> b|ok,plain')
    expect(await render('{{ s.mo }}', { s: new SettingsDrop(definitions, stored, env({ trust: { liquidSettings: false, htmlSettings: true } })) })).toBe('a <img src=x onerror=1> b')
  })
  it('lets filters take a resource setting as the object', async () => {
    const settings = new SettingsDrop([{ type: 'product', id: 'p' }, { type: 'collection', id: 'c' }], { p: 'classic-tee', c: 'apparel' }, env())
    expect(await render('{{ s.p.url | within: s.c }}|{{ s.p | image_url: width: 100 }}|{{ s.c.products.first.title }}|{{ s.p.variants[0].product.title }}', { s: settings })).toBe('/collections/apparel/products/classic-tee|/sample/images/classic-tee.jpg?width=100|Classic Tee|Classic Tee')
  })
  it('leaves menus and lists as they are', async () => {
    const settings = new SettingsDrop([{ type: 'link_list', id: 'menu' }, { type: 'collection_list', id: 'cols' }], { menu: 'main-menu', cols: ['apparel'] }, env())
    expect(await render('{{ s.menu.title }}|{{ s.cols.size }}|{{ s.cols[0].title }}|{{ s.cols[0].handle }}', { s: settings })).toBe('Main menu|1|Apparel|apparel')
    expect(String(SettingsDrop.value(settings, 'menu'))).toBe('[object Object]')
    // the elements of a list are the store's objects, which print as their handle (unpinned by shopify.dev)
    expect(String((SettingsDrop.value(settings, 'cols') as unknown[])[0])).toBe('apparel')
  })

  it('gives recommendations a nil intent while nothing is recommended', async () => {
    const page = buildGlobals({ store, templateName: 'product', request: {}, locale: 'en', report: new ReportCollector() })
    expect(await render('[{{ recommendations.intent }}]|{% if recommendations.intent == nil %}nil{% endif %}|{{ recommendations.performed? }}|{{ recommendations.products_count }}|{% if recommendations.products == empty %}empty{% endif %}', page.globals)).toBe('[]|nil|false|0|empty')
  })
  it('numbers cart lines from 0, skipping lines the store cannot fill', async () => {
    const data = {
      shop: { name: 'Odd', domain: 'odd.example', currency: 'USD' },
      products: [{ id: 1, handle: 'a', title: 'A', variants: [{ id: 11, title: 'Default Title', price: 100, available: true, option1: 'Default Title' }] }, { id: 2, handle: 'b', title: 'B', variants: [{ id: 22, title: 'Default Title', price: 200, available: true, option1: 'Default Title' }] }],
      cart: { items: [{ product_handle: 'a', variant_id: 11, quantity: 1 }, { product_handle: 'gone', variant_id: 99, quantity: 1 }, { product_handle: 'b', variant_id: 22, quantity: 3 }] }
    }
    const cart = buildStore(data).cart
    expect(await render('{% for item in cart.items %}{{ forloop.index0 }}:{{ item.index }}:{{ item.index | plus: 1 }}:{{ item.key }} {% endfor %}', { cart })).toBe('0:0:1:11:1 1:1:2:22:2 ')
  })
})

describe('shopify/filters/json', () => {
  const value = { path: 'https://a.example/b?c=1&d=2', tag: '</script><img src=x onerror=1>', sep: 'a\u2028b\u2029c', quote: 'say "hi"', slash: '\\/', n: 1.5, list: [true, null] }
  it.each(['json', 'jsonify', 'inspect'])('escapes the characters that can leave a script block in %s, and reads back as the same JSON', async filter => {
    const out = await render(`{{ v | ${filter} }}`, { v: value })
    expect(out).not.toMatch(/[<>&\u2028\u2029]/)
    expect(out).not.toContain('</')
    expect(JSON.parse(out)).toEqual(value)
    expect(out).toContain('"https:\\/\\/a.example\\/b?c=1\\u0026d=2"')
    expect(out).toContain('\\u003c\\/script\\u003e\\u003cimg src=x onerror=1\\u003e')
    expect(out).toContain('a\\u2028b\\u2029c')
  })
  it('passes the space argument and plain values through', async () => {
    expect(await render('{{ v | json: 2 }}', { v: { a: '<' } })).toBe('{\n  "a": "\\u003c"\n}')
    expect(await render('{{ 5 | json }}|{{ true | json }}|{{ "x" | json }}|{{ nothing | json }}', {})).toBe('5|true|"x"|')
    expect(await render('{{ v | inspect }}', { v: { a: 1 } })).toBe('{"a":1}')
  })
  it('charges the longer, escaped output to the memory limit', async () => {
    const source = '{{ v | json }}'
    const v = '<'.repeat(1000)
    await expect(renderLiquid(createShopifyLiquid({ memoryLimit: 3000 }), source, { v })).rejects.toThrow(/memory alloc limit exceeded/)
    expect((await renderLiquid(createShopifyLiquid({ memoryLimit: 8000 }), source, { v })).html).toHaveLength(2 + 6 * 1000)
  })
  it('is an approximation of Shopify, and says so in the registry', () => {
    for (const name of ['json', 'jsonify', 'inspect']) expect(filterStatus(name)).toBe('approx')
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
    ['<a href="/a" href="/b">x</a>', '<a href="/a">x</a>'],
    ['<a href="javascript:x" href="/b">x</a>', '<a>x</a>'],
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
