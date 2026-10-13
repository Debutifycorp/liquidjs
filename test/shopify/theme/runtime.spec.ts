import { join } from 'path'
import { compileTheme, renderPage, renderSection } from '../../../src/shopify'
import { loadTheme } from './load-fixture'

const theme = loadTheme(join(__dirname, '../fixtures/theme'))

describe('shopify/theme/runtime', () => {
  it('renders the index page through the layout', async () => {
    const { html, report } = await renderPage({ theme, templateName: 'index' })
    expect(html.startsWith('<!doctype html>\n<html lang="en">')).toBe(true)
    expect(html).toContain('<title>Sample Store</title>')
    expect(html).toContain('<body class="template-index">')
    expect(html).toContain(':root { --accent: 51 79 180; }')
    expect(html).toContain('<!-- BEGIN sections: header-group --><div id="shopify-section-sections--header-group__announcement" class="shopify-section shopify-section-group-header-group announcement-bar-section"><p class="announcement">Free shipping|header|1</p><span>Hello</span><span>Hi</span>')
    expect(html).toContain('<header-wrapper id="shopify-section-sections--header-group__header" class="shopify-section shopify-section-group-header-group"><header><a href="/" aria-current="page">Home</a><a href="/collections/all">Catalog</a><a href="/pages/contact">Contact</a><span class="cart-count">2</span></header>')
    expect(html).toContain('<div id="shopify-section-template--index__hero" class="shopify-section hero-section"><h1>Hello {{ shop.name }}</h1><p>Hello, Sample Store!</p><p>Made with care</p><p>Schema subheading</p>')
    expect(html).toContain('<svg class="icon icon-star" data-section="template--index__hero"></svg>')
    expect(html).toContain('<div id="shopify-section-template--index__featured" class="shopify-section"><h2>Home page</h2><a href="/products/classic-tee">Classic Tee $25.00</a><a href="/products/canvas-bag">Canvas Bag $45.00</a><i>2/1</i>')
    expect(html).toContain('<div id="shopify-section-footer" class="shopify-section"><footer>© Fixture|footer||static</footer>')
    expect(html).not.toContain('content_for_header')
    expect(report.sections.map(s => `${s.id}:${s.status}`)).toEqual([
      'template--index__hero:rendered',
      'template--index__featured:rendered',
      'template--index__gone:missing',
      'sections--header-group__announcement:rendered',
      'sections--header-group__header:rendered',
      'footer:rendered'
    ])
    expect(report.missing).toEqual([{ kind: 'section', name: 'does-not-exist' }])
    expect(report.errors).toEqual([])
  })
  it('writes stylesheet and javascript bodies into content_for_header', async () => {
    const { html } = await renderPage({ theme, templateName: 'index' })
    const head = html.slice(html.indexOf('<title>'), html.indexOf('</head>'))
    expect(head).toContain('<script>var Shopify = Shopify || {};Shopify.shop = "sample-store.example";Shopify.locale = "en";Shopify.currency = {"active":"USD","rate":"1.0"};Shopify.country = "US";Shopify.designMode = false;')
    expect(head).toContain('<style data-shopify="stylesheet-tags">.hero { color: red; }\nheader { display: flex; }</style>')
    expect(head).toContain("<script>document.addEventListener('DOMContentLoaded', function () {\n(function () {\nconsole.log('hero')<\\/script>\n})();\n});</script>")
    expect(head).toContain('@font-face {\n  font-family: Assistant;')
  })
  it('chooses the contextual section group file for the request', async () => {
    const { html } = await renderPage({ theme, templateName: 'index', request: { context: { market: 'ca' } } })
    expect(html).toContain('<p class="announcement">Free shipping for Canada|header|1</p>')
  })
  it('translates with the requested locale and falls back to the default', async () => {
    const { html } = await renderPage({ theme, templateName: 'index', locale: 'fr' })
    expect(html).toContain('<p>Bonjour, Sample Store !</p><p>Fait avec soin</p>')
    expect(html).toContain('<html lang="fr">')
  })
  it('wraps JSON template sections in the template wrapper', async () => {
    const { html } = await renderPage({ theme, templateName: 'product', request: { resource: 'canvas-bag' } })
    expect(html).toContain('<main id="MainContent"><div id="product-wrapper" class="page-width" data-template="product"><div id="shopify-section-template--product__main" class="shopify-section"><h1>Canvas Bag</h1>$45.00 USD<form method="post" action="/cart/add" id="product_form_1002"')
    expect(html).toContain('<button>Add to cart</button>')
  })
  it('renders without a layout when the template says so', async () => {
    const { html } = await renderPage({ theme, templateName: 'page.contact', request: { resource: 'contact' } })
    expect(html).toBe('<div id="shopify-section-template--page-contact__form" class="shopify-section"><form method="post" action="/contact#contact_form" id="contact_form" accept-charset="UTF-8" class="contact-form"><input type="hidden" name="form_type" value="contact" /><input type="hidden" name="utf8" value="✓" /><input name="contact[email]"></form></div>')
    const gift = await renderPage({ theme, templateName: 'gift_card' })
    expect(gift.html).toBe('<p>Gift card for Sample Store</p>\n')
  })
  it('reports a missing template by rejecting', async () => {
    await expect(renderPage({ theme, templateName: 'nope' })).rejects.toThrow('template not found: templates/nope.json or templates/nope.liquid')
  })
  it('renders one section on its own', async () => {
    const { html } = await renderSection({ theme, templateName: 'index', section: 'featured' })
    expect(html).toBe('<div id="shopify-section-template--index__featured" class="shopify-section"><h2>Home page</h2><a href="/products/classic-tee">Classic Tee $25.00</a><a href="/products/canvas-bag">Canvas Bag $45.00</a><i>2/1</i>\n\n</div>')
    const footer = await renderSection({ theme, templateName: 'index', section: 'footer' })
    expect(footer.html).toBe('<div id="shopify-section-footer" class="shopify-section"><footer>© Fixture|footer||static</footer>\n\n</div>')
  })
  it('keeps a section with a syntax error inside its wrapper', async () => {
    const broken = { files: { ...theme.files, 'templates/index.json': '{ "sections": { "b": { "type": "broken" }, "f": { "type": "footer" } }, "order": ["b", "f"] }' } }
    const { html, report } = await renderPage({ theme: broken, templateName: 'index' })
    const message = 'Liquid syntax error (sections/broken line 1): invalid value expression: &quot;&quot;'
    expect(html).toContain(`<div id="shopify-section-template--index__b" class="shopify-section">${message}</div><div id="shopify-section-template--index__f" class="shopify-section"><footer>Default copyright|template--index__f|2|template</footer>`)
    expect(report.sections[0]).toMatchObject({ id: 'template--index__b', status: 'failed' })
    expect(report.errors.map(e => e.message)).toEqual(['Liquid syntax error (sections/broken line 1): invalid value expression: ""'])
  })
  it('parses a theme once and re-reads only changed files', async () => {
    const copy = { files: { ...theme.files } }
    const first = compileTheme(copy)
    expect(compileTheme(copy)).toBe(first)
    await renderPage({ theme: copy, templateName: 'gift_card' })
    copy.files['templates/gift_card.liquid'] = '{% layout none %}changed'
    expect((await renderPage({ theme: copy, templateName: 'gift_card' })).html).toBe('changed')
  })
  it('gives every render its own state and report', async () => {
    const [index, french, gift] = await Promise.all([
      renderPage({ theme, templateName: 'index' }),
      renderPage({ theme, templateName: 'index', locale: 'fr' }),
      renderPage({ theme, templateName: 'gift_card' })
    ])
    expect(index.report.sections).toHaveLength(6)
    expect(french.report.sections).toHaveLength(6)
    expect(gift.report.sections).toEqual([])
    expect(index.html).toContain('Hello, Sample Store!')
    expect(french.html).toContain('Bonjour, Sample Store !')
    const product = await renderPage({ theme, templateName: 'product' })
    expect(product.html).not.toContain('.hero { color: red; }')
    expect(product.html).toContain('header { display: flex; }')
    expect(product.report.sections.map(s => s.id)).toEqual(['template--product__main', 'sections--header-group__announcement', 'sections--header-group__header', 'footer'])
  })
  it('renders against the store data it is given', async () => {
    const data = { shop: { name: 'Other Shop', domain: 'other.example', currency: 'EUR' } }
    const { html } = await renderPage({ theme, templateName: 'index', data })
    expect(html).toContain('<title>Other Shop</title>')
    expect(html).toContain('Shopify.shop = "other.example";')
    expect(html).toContain('Shopify.currency = {"active":"EUR","rate":"1.0"};')
    expect(html).toContain('<p>Hello, Other Shop!</p>')
  })
  it('keeps the parent section group when no contextual file matches', async () => {
    const { html } = await renderPage({ theme, templateName: 'index', request: { context: { market: 'us' } } })
    expect(html).toContain('<p class="announcement">Free shipping|header|1</p>')
  })
  it('reads a settings_data.json whose current is a preset name', async () => {
    const files = { ...theme.files, 'config/settings_data.json': '{ "current": "Default", "presets": { "Default": { "accent": "#ff0000" } } }' }
    const { html } = await renderPage({ theme: { files }, templateName: 'index' })
    expect(html).toContain(':root { --accent: 255 0 0; }')
    expect(html).toContain('<footer>Default copyright|footer||static</footer>')
  })
  it('marks a section failed when its render raised an error and prints the error in its place', async () => {
    const files = {
      ...theme.files,
      'sections/leaky.liquid': "<p>{% render 'missing-snippet' %}</p>",
      'templates/leaky.json': '{ "sections": { "a": { "type": "leaky" } }, "order": ["a"] }'
    }
    const { html, report } = await renderPage({ theme: { files }, templateName: 'leaky' })
    expect(html).toContain('<div id="shopify-section-template--leaky__a" class="shopify-section"><p>Liquid error (sections/leaky line 1): Could not find asset snippets/missing-snippet.liquid</p></div>')
    expect(report.sections[0]).toMatchObject({ id: 'template--leaky__a', status: 'failed', reason: 'Liquid error (sections/leaky line 1): Could not find asset snippets/missing-snippet.liquid' })
    expect(report.errors).toHaveLength(1)
    expect(report.missing).toContainEqual({ kind: 'snippet', name: 'snippets/missing-snippet.liquid' })
  })
  it('prints a Liquid template that does not parse inside the layout', async () => {
    const files = { ...theme.files, 'templates/oops.liquid': '<p>{% if %}</p>' }
    const { html, report } = await renderPage({ theme: { files }, templateName: 'oops' })
    expect(html).toContain('<main id="MainContent">Liquid syntax error (templates/oops line 1): invalid value expression: &quot;&quot;</main>')
    expect(report.errors).toHaveLength(1)
  })
  it('renders a Liquid template through the layout it names', async () => {
    const files = { ...theme.files, 'layout/bare.liquid': '[{{ content_for_layout }}]{% assign name = "footer" %}{% section name %}', 'templates/note.liquid': '{% layout "bare" %}note' }
    const { html } = await renderPage({ theme: { files }, templateName: 'note' })
    expect(html).toBe('[note]<div id="shopify-section-footer" class="shopify-section"><footer>© Fixture|footer||static</footer>\n\n</div>')
  })
  it('reports a missing layout, section group and section file instead of failing', async () => {
    const files = {
      ...theme.files,
      'layout/bare.liquid': '{% sections "nope" %}{{ content_for_layout }}',
      'templates/a.json': '{ "layout": "bare", "sections": { "x": { "type": "footer" } }, "order": ["x"] }',
      'templates/b.json': '{ "layout": "absent", "sections": { "x": { "type": "footer" } }, "order": ["x"] }'
    }
    const a = await renderPage({ theme: { files }, templateName: 'a' })
    expect(a.html).toBe('<div id="shopify-section-template--a__x" class="shopify-section"><footer>Default copyright|template--a__x|1|template</footer>\n\n</div>')
    expect(a.report.missing).toEqual([{ kind: 'section-group', name: 'nope' }])
    const b = await renderPage({ theme: { files }, templateName: 'b' })
    expect(b.html).toBe('<div id="shopify-section-template--b__x" class="shopify-section"><footer>Default copyright|template--b__x|1|template</footer>\n\n</div>')
    expect(b.report.missing).toEqual([{ kind: 'layout', name: 'absent' }])
    const none = await renderSection({ theme, templateName: 'index', section: 'absent-section' })
    expect(none.html).toBe('')
    expect(none.report.missing).toEqual([{ kind: 'section', name: 'absent-section' }])
  })
  it('reports a schema that is not valid JSON and a wrapper that does not parse', async () => {
    const files = {
      ...theme.files,
      'sections/badschema.liquid': '<p>{{ section.settings.x }}</p>{% schema %}{ nope {% endschema %}',
      'templates/odd.json': '{ "wrapper": "span.x", "sections": { "s": { "type": "badschema" } }, "order": ["s"] }'
    }
    const { html, report } = await renderPage({ theme: { files }, templateName: 'odd' })
    expect(html).toContain('<main id="MainContent"><div id="shopify-section-template--odd__s" class="shopify-section"><p></p></div></main>')
    expect(report.unsupported.map(u => u.feature)).toEqual(['schema', 'wrapper'])
  })
  it('rejects when the page runs past its limits instead of printing the limit in a section', async () => {
    await expect(renderPage({ theme, templateName: 'index', renderLimit: 0 })).rejects.toThrow('template render limit exceeded')
    const files = { ...theme.files, 'sections/hog.liquid': '{% for i in (1..1000) %}{% endfor %}', 'templates/hog.json': '{ "sections": { "h": { "type": "hog" } }, "order": ["h"] }' }
    await expect(renderPage({ theme: { files }, templateName: 'hog', memoryLimit: 100 })).rejects.toThrow('memory alloc limit exceeded')
  })
  it('compiles a theme again when its files map is replaced', async () => {
    const copy = { files: { ...theme.files } }
    const first = compileTheme(copy)
    copy.files = { ...theme.files, 'templates/gift_card.liquid': '{% layout none %}replaced' }
    expect(compileTheme(copy)).not.toBe(first)
    expect((await renderPage({ theme: copy, templateName: 'gift_card' })).html).toBe('replaced')
  })
  it('does not fail on a section entry that has no type', async () => {
    const files = { ...theme.files, 'templates/index.json': '{ "sections": { "a": { "settings": {} }, "b": "oops" }, "order": ["a", "b"] }' }
    const { html, report } = await renderPage({ theme: { files }, templateName: 'index' })
    expect(html).toContain('<main id="MainContent"></main>')
    expect(report.sections.map(s => s.status)).toEqual(['missing', 'missing', 'rendered', 'rendered', 'rendered'])
  })
})
