import { join } from 'path'
import { compileTheme, renderPage, renderSection } from '../../../src/shopify'
import { legacySampleData } from '../legacy-sample'
import { loadTheme } from './load-fixture'

const theme = loadTheme(join(__dirname, '../fixtures/theme'))

describe('shopify/theme/runtime', () => {
  it('renders the index page through the layout', async () => {
    const { html, report } = await renderPage({ data: legacySampleData, theme, templateName: 'index' })
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
    const { html } = await renderPage({ data: legacySampleData, theme, templateName: 'index' })
    const head = html.slice(html.indexOf('<title>'), html.indexOf('</head>'))
    expect(head).toContain('<script>var Shopify = Shopify || {};Shopify.shop = "sample-store.example";Shopify.locale = "en";Shopify.currency = {"active":"USD","rate":"1.0"};Shopify.country = "US";Shopify.designMode = false;')
    expect(head).toContain('<style data-shopify="stylesheet-tags">.hero { color: red; }\nheader { display: flex; }</style>')
    expect(head).toContain("<script>document.addEventListener('DOMContentLoaded', function () {\n(function () {\ntry {\nconsole.log('hero')<\\/script>\n} catch (e) { console.error(e); }\n})();\n});</script>")
    expect(head).toContain('@font-face {\n  font-family: Assistant;')
  })
  it('chooses the contextual section group file for the request', async () => {
    const { html } = await renderPage({ data: legacySampleData, theme, templateName: 'index', request: { context: { market: 'ca' } } })
    expect(html).toContain('<p class="announcement">Free shipping for Canada|header|1</p>')
  })
  it('translates with the requested locale and falls back to the default', async () => {
    const { html } = await renderPage({ data: legacySampleData, theme, templateName: 'index', locale: 'fr' })
    expect(html).toContain('<p>Bonjour, Sample Store !</p><p>Fait avec soin</p>')
    expect(html).toContain('<html lang="fr">')
  })
  it('wraps JSON template sections in the template wrapper', async () => {
    const { html } = await renderPage({ data: legacySampleData, theme, templateName: 'product', request: { resource: 'canvas-bag' } })
    // main-product.liquid prints the price, a newline and `{%- form`: the storefront's bug-compatible trimming keeps that newline
    expect(html).toContain('<main id="MainContent"><div id="product-wrapper" class="page-width" data-template="product"><div id="shopify-section-template--product__main" class="shopify-section"><h1>Canvas Bag</h1>$45.00 USD\n<form method="post" action="/cart/add" id="product_form_1002"')
    expect(html).toContain('<button>Add to cart</button>')
  })
  it('renders without a layout when the template says so', async () => {
    const { html } = await renderPage({ data: legacySampleData, theme, templateName: 'page.contact', request: { resource: 'contact' } })
    expect(html).toBe('<div id="shopify-section-template--page-contact__form" class="shopify-section"><form method="post" action="/contact#contact_form" id="contact_form" accept-charset="UTF-8" class="contact-form"><input type="hidden" name="form_type" value="contact" /><input type="hidden" name="utf8" value="✓" /><input name="contact[email]"></form></div>')
    const gift = await renderPage({ data: legacySampleData, theme, templateName: 'gift_card' })
    expect(gift.html).toBe('<p>Gift card for Sample Store</p>\n')
  })
  it('reports a missing template by rejecting', async () => {
    await expect(renderPage({ data: legacySampleData, theme, templateName: 'nope' })).rejects.toThrow('template not found: templates/nope.json or templates/nope.liquid')
  })
  it('renders one section on its own', async () => {
    const { html } = await renderSection({ data: legacySampleData, theme, templateName: 'index', section: 'featured' })
    expect(html).toBe('<div id="shopify-section-template--index__featured" class="shopify-section"><h2>Home page</h2><a href="/products/classic-tee">Classic Tee $25.00</a><a href="/products/canvas-bag">Canvas Bag $45.00</a><i>2/1</i>\n\n</div>')
    const footer = await renderSection({ data: legacySampleData, theme, templateName: 'index', section: 'footer' })
    expect(footer.html).toBe('<div id="shopify-section-footer" class="shopify-section"><footer>© Fixture|footer||static</footer>\n\n</div>')
  })
  it('keeps a section with a syntax error inside its wrapper', async () => {
    const broken = { files: { ...theme.files, 'templates/index.json': '{ "sections": { "b": { "type": "broken" }, "f": { "type": "footer" } }, "order": ["b", "f"] }' } }
    const { html, report } = await renderPage({ data: legacySampleData, theme: broken, templateName: 'index' })
    const message = 'Liquid syntax error (sections/broken line 1): invalid value expression: &quot;&quot;'
    expect(html).toContain(`<div id="shopify-section-template--index__b" class="shopify-section">${message}</div><div id="shopify-section-template--index__f" class="shopify-section"><footer>Default copyright|template--index__f|2|template</footer>`)
    expect(report.sections[0]).toMatchObject({ id: 'template--index__b', status: 'failed' })
    expect(report.errors.map(e => e.message)).toEqual(['Liquid syntax error (sections/broken line 1): invalid value expression: ""'])
  })
  it('parses a theme once and re-reads only changed files', async () => {
    const copy = { files: { ...theme.files } }
    const first = compileTheme(copy)
    expect(compileTheme(copy)).toBe(first)
    await renderPage({ data: legacySampleData, theme: copy, templateName: 'gift_card' })
    copy.files['templates/gift_card.liquid'] = '{% layout none %}changed'
    expect((await renderPage({ data: legacySampleData, theme: copy, templateName: 'gift_card' })).html).toBe('changed')
  })
  it('gives every render its own state and report', async () => {
    const [index, french, gift] = await Promise.all([
      renderPage({ data: legacySampleData, theme, templateName: 'index' }),
      renderPage({ data: legacySampleData, theme, templateName: 'index', locale: 'fr' }),
      renderPage({ data: legacySampleData, theme, templateName: 'gift_card' })
    ])
    expect(index.report.sections).toHaveLength(6)
    expect(french.report.sections).toHaveLength(6)
    expect(gift.report.sections).toEqual([])
    expect(index.html).toContain('Hello, Sample Store!')
    expect(french.html).toContain('Bonjour, Sample Store !')
    const product = await renderPage({ data: legacySampleData, theme, templateName: 'product' })
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
    const { html } = await renderPage({ data: legacySampleData, theme, templateName: 'index', request: { context: { market: 'us' } } })
    expect(html).toContain('<p class="announcement">Free shipping|header|1</p>')
  })
  it('reads a settings_data.json whose current is a preset name', async () => {
    const files = { ...theme.files, 'config/settings_data.json': '{ "current": "Default", "presets": { "Default": { "accent": "#ff0000" } } }' }
    const { html } = await renderPage({ data: legacySampleData, theme: { files }, templateName: 'index' })
    expect(html).toContain(':root { --accent: 255 0 0; }')
    expect(html).toContain('<footer>Default copyright|footer||static</footer>')
  })
  it('marks a section failed when its render raised an error and prints the error in its place', async () => {
    const files = {
      ...theme.files,
      'sections/leaky.liquid': "<p>{% render 'missing-snippet' %}</p>",
      'templates/leaky.json': '{ "sections": { "a": { "type": "leaky" } }, "order": ["a"] }'
    }
    const { html, report } = await renderPage({ data: legacySampleData, theme: { files }, templateName: 'leaky' })
    expect(html).toContain('<div id="shopify-section-template--leaky__a" class="shopify-section"><p>Liquid error (sections/leaky line 1): Could not find asset snippets/missing-snippet.liquid</p></div>')
    expect(report.sections[0]).toMatchObject({ id: 'template--leaky__a', status: 'failed', reason: 'Liquid error (sections/leaky line 1): Could not find asset snippets/missing-snippet.liquid' })
    expect(report.errors).toHaveLength(1)
    expect(report.missing).toContainEqual({ kind: 'snippet', name: 'snippets/missing-snippet.liquid' })
  })
  it('prints a Liquid template that does not parse inside the layout', async () => {
    const files = { ...theme.files, 'templates/oops.liquid': '<p>{% if %}</p>' }
    const { html, report } = await renderPage({ data: legacySampleData, theme: { files }, templateName: 'oops' })
    expect(html).toContain('<main id="MainContent">Liquid syntax error (templates/oops line 1): invalid value expression: &quot;&quot;</main>')
    expect(report.errors).toHaveLength(1)
  })
  it('renders a Liquid template through the layout it names', async () => {
    const files = { ...theme.files, 'layout/bare.liquid': '[{{ content_for_layout }}]{% assign name = "footer" %}{% section name %}', 'templates/note.liquid': '{% layout "bare" %}note' }
    const { html } = await renderPage({ data: legacySampleData, theme: { files }, templateName: 'note' })
    expect(html).toBe('[note]<div id="shopify-section-footer" class="shopify-section"><footer>© Fixture|footer||static</footer>\n\n</div>')
  })
  it('reports a missing layout, section group and section file instead of failing', async () => {
    const files = {
      ...theme.files,
      'layout/bare.liquid': '{% sections "nope" %}{{ content_for_layout }}',
      'templates/a.json': '{ "layout": "bare", "sections": { "x": { "type": "footer" } }, "order": ["x"] }',
      'templates/b.json': '{ "layout": "absent", "sections": { "x": { "type": "footer" } }, "order": ["x"] }'
    }
    const a = await renderPage({ data: legacySampleData, theme: { files }, templateName: 'a' })
    expect(a.html).toBe('<div id="shopify-section-template--a__x" class="shopify-section"><footer>Default copyright|template--a__x|1|template</footer>\n\n</div>')
    expect(a.report.missing).toEqual([{ kind: 'section_group', name: 'nope' }])
    const b = await renderPage({ data: legacySampleData, theme: { files }, templateName: 'b' })
    expect(b.html).toBe('<div id="shopify-section-template--b__x" class="shopify-section"><footer>Default copyright|template--b__x|1|template</footer>\n\n</div>')
    expect(b.report.missing).toEqual([{ kind: 'layout', name: 'absent' }])
    const none = await renderSection({ data: legacySampleData, theme, templateName: 'index', section: 'absent-section' })
    expect(none.html).toBe('')
    expect(none.report.missing).toEqual([{ kind: 'section', name: 'absent-section' }])
  })
  it('reports a schema that is not valid JSON and a wrapper that does not parse', async () => {
    const files = {
      ...theme.files,
      'sections/badschema.liquid': '<p>{{ section.settings.x }}</p>{% schema %}{ nope {% endschema %}',
      'templates/odd.json': '{ "wrapper": "span.x", "sections": { "s": { "type": "badschema" } }, "order": ["s"] }'
    }
    const { html, report } = await renderPage({ data: legacySampleData, theme: { files }, templateName: 'odd' })
    expect(html).toContain('<main id="MainContent"><div id="shopify-section-template--odd__s" class="shopify-section"><p></p></div></main>')
    expect(report.unsupported.map(u => u.feature)).toEqual(['schema', 'wrapper'])
  })
  it('rejects when the page runs past its limits instead of printing the limit in a section', async () => {
    await expect(renderPage({ data: legacySampleData, theme, templateName: 'index', renderLimit: 0 })).rejects.toThrow('template render limit exceeded')
    const files = { ...theme.files, 'sections/hog.liquid': '{% for i in (1..1000) %}{% endfor %}', 'templates/hog.json': '{ "sections": { "h": { "type": "hog" } }, "order": ["h"] }' }
    await expect(renderPage({ data: legacySampleData, theme: { files }, templateName: 'hog', memoryLimit: 100 })).rejects.toThrow('memory alloc limit exceeded')
  })
  it('takes parseLimit and unknownTags, and compiles a theme once for each combination', async () => {
    const files = { 'templates/t.json': '{ "sections": { "s": { "type": "s" } }, "order": ["s"] }', 'sections/s.liquid': 'a{% frobnicate %}b' }
    const one = { files }
    const lax = await renderPage({ data: legacySampleData, theme: one, templateName: 't' })
    expect(lax.html).toBe('<div id="shopify-section-template--t__s" class="shopify-section">ab</div>')
    expect(lax.report.unknownTags.map(entry => entry.name)).toEqual(['frobnicate'])
    const strict = await renderPage({ data: legacySampleData, theme: one, templateName: 't', unknownTags: 'error' })
    expect(strict.report.sections).toMatchObject([{ status: 'failed', reason: "Liquid syntax error (sections/s line 1): Unknown tag 'frobnicate'" }])
    expect((await renderSection({ data: legacySampleData, theme: one, templateName: 't', section: 's', unknownTags: 'error' })).report.sections).toMatchObject([{ status: 'failed' }])
    await expect(renderPage({ data: legacySampleData, theme: one, templateName: 't', parseLimit: 5 })).rejects.toThrow('parse length limit exceeded')
    expect((await renderPage({ data: legacySampleData, theme: one, templateName: 't' })).html).toBe(lax.html)
    expect(compileTheme(one)).toBe(compileTheme(one, { unknownTags: 'report' }))
    expect(compileTheme(one, { unknownTags: 'error' })).not.toBe(compileTheme(one))
    expect(compileTheme(one, { parseLimit: 5 })).not.toBe(compileTheme(one))
  })
  it('compiles a theme again when its files map is replaced', async () => {
    const copy = { files: { ...theme.files } }
    const first = compileTheme(copy)
    copy.files = { ...theme.files, 'templates/gift_card.liquid': '{% layout none %}replaced' }
    expect(compileTheme(copy)).not.toBe(first)
    expect((await renderPage({ data: legacySampleData, theme: copy, templateName: 'gift_card' })).html).toBe('replaced')
  })
  it('does not fail on a section entry that has no type', async () => {
    const files = { ...theme.files, 'templates/index.json': '{ "sections": { "a": { "settings": {} }, "b": "oops" }, "order": ["a", "b"] }' }
    const { html, report } = await renderPage({ data: legacySampleData, theme: { files }, templateName: 'index' })
    expect(html).toContain('<main id="MainContent"></main>')
    expect(report.sections.map(s => s.status)).toEqual(['missing', 'missing', 'rendered', 'rendered', 'rendered'])
  })
  describe('renderSection ids', () => {
    for (const [label, request] of [['without a context', undefined], ['with the ca market', { context: { market: 'ca' } }]] as const) {
      it(`renders every section a page reports by its id, ${label}`, async () => {
        const options = { data: legacySampleData, theme, templateName: 'index', request }
        const page = await renderPage(options)
        const rendered = page.report.sections.filter(entry => entry.status === 'rendered')
        expect(rendered.map(entry => entry.id)).toEqual(['template--index__hero', 'template--index__featured', 'sections--header-group__announcement', 'sections--header-group__header', 'footer'])
        for (const entry of rendered) {
          const one = await renderSection({ ...options, section: entry.id })
          expect(one.html).toContain(`<${entry.id === 'sections--header-group__header' ? 'header-wrapper' : 'div'} id="shopify-section-${entry.id}"`)
          expect(page.html).toContain(one.html)
          expect(one.report.sections.map(section => `${section.id}:${section.status}`)).toEqual([`${entry.id}:rendered`])
        }
        const announcement = await renderSection({ ...options, section: 'sections--header-group__announcement' })
        expect(announcement.html).toContain(request ? 'Free shipping for Canada|header|1' : 'Free shipping|header|1')
      })
    }
    it('still takes a bare key of the template and gives the same section as its id', async () => {
      const byKey = await renderSection({ data: legacySampleData, theme, templateName: 'index', section: 'featured' })
      const byId = await renderSection({ data: legacySampleData, theme, templateName: 'index', section: 'template--index__featured' })
      expect(byKey.html).toBe(byId.html)
      expect(byKey.html).toContain('<i>2/1</i>')
    })
    it('renders a static section by its name for a Liquid template too', async () => {
      const { html } = await renderSection({ data: legacySampleData, theme, templateName: 'gift_card', section: 'footer' })
      expect(html).toBe('<div id="shopify-section-footer" class="shopify-section"><footer>© Fixture|footer||static</footer>\n\n</div>')
    })
    it('renders nothing for a disabled section and never a static section of the same name', async () => {
      const files = { ...theme.files, 'sections/off.liquid': '<i>static</i>' }
      for (const section of ['off', 'template--index__off']) {
        const { html, report } = await renderSection({ data: legacySampleData, theme: { files }, templateName: 'index', section })
        expect(html).toBe('')
        expect(report.unsupported).toEqual([{ feature: 'disabled_section', detail: 'template--index__off is disabled: nothing rendered' }])
        expect(report.sections).toEqual([])
      }
    })
    it('renders nothing for a disabled section of a group', async () => {
      const group = { type: 'header', sections: { a: { type: 'footer', disabled: true }, b: { type: 'footer' } }, order: ['a', 'b'] }
      const files = { ...theme.files, 'sections/header-group.json': JSON.stringify(group) }
      const off = await renderSection({ data: legacySampleData, theme: { files }, templateName: 'index', section: 'sections--header-group__a' })
      expect(off.html).toBe('')
      expect(off.report.unsupported).toEqual([{ feature: 'disabled_section', detail: 'sections--header-group__a is disabled: nothing rendered' }])
      const on = await renderSection({ data: legacySampleData, theme: { files }, templateName: 'index', section: 'sections--header-group__b' })
      expect(on.html).toBe('<div id="shopify-section-sections--header-group__b" class="shopify-section shopify-section-group-header-group"><footer>Default copyright|sections--header-group__b|1|header</footer>\n\n</div>')
    })
    it('reports a section the template or group does not have', async () => {
      for (const [section, missing] of [['template--index__nope', { kind: 'section', name: 'template--index__nope' }], ['sections--header-group__nope', { kind: 'section', name: 'sections--header-group__nope' }], ['sections--nope__x', { kind: 'section_group', name: 'nope' }], ['nothing', { kind: 'section', name: 'nothing' }]] as const) {
        const { html, report } = await renderSection({ data: legacySampleData, theme, templateName: 'index', section })
        expect(html).toBe('')
        expect(report.missing).toEqual([missing])
      }
    })
    it('rejects for a template that does not exist, as renderPage does', async () => {
      await expect(renderSection({ data: legacySampleData, theme, templateName: 'nope', section: 'footer' })).rejects.toThrow('template not found: templates/nope.json or templates/nope.liquid')
    })
  })
  it('returns the stylesheet and javascript bodies a section rendered, and keeps them out of its html', async () => {
    const hero = await renderSection({ data: legacySampleData, theme, templateName: 'index', section: 'hero' })
    expect(hero.assets).toEqual({ stylesheets: ['.hero { color: red; }'], javascripts: ["console.log('hero')</script>"] })
    expect(hero.html).not.toContain('color: red')
    const header = await renderSection({ data: legacySampleData, theme, templateName: 'index', section: 'sections--header-group__header' })
    expect(header.assets).toEqual({ stylesheets: ['header { display: flex; }'], javascripts: [] })
    const footer = await renderSection({ data: legacySampleData, theme, templateName: 'index', section: 'footer' })
    expect(footer.assets).toEqual({ stylesheets: [], javascripts: [] })
  })
  it('takes the schema default of a static section with no saved entry', async () => {
    const trio = '<b>{{ section.settings.title }}</b>{% for block in section.blocks %}[{{ block.type }}:{{ block.id }}:{{ block.settings.label }}]{% endfor %}' +
      '{% schema %}{ "name": "Trio", "settings": [{ "type": "text", "id": "title", "default": "Schema default" }], "blocks": [{ "type": "item", "name": "Item", "settings": [{ "type": "text", "id": "label", "default": "Plain" }] }], "default": { "settings": { "title": "Preset title" }, "blocks": [{ "type": "item", "settings": { "label": "A" } }, { "type": "item" }] } }{% endschema %}'
    const files = { ...theme.files, 'sections/trio.liquid': trio }
    const unsaved = await renderSection({ data: legacySampleData, theme: { files }, templateName: 'index', section: 'trio' })
    expect(unsaved.html).toBe('<div id="shopify-section-trio" class="shopify-section"><b>Preset title</b>[item:block-1:A][item:block-2:Plain]</div>')
    const data = '{ "current": { "sections": { "trio": { "type": "trio", "settings": { "title": "Saved" } } } } }'
    const saved = await renderSection({ theme: { files: { ...files, 'config/settings_data.json': data } }, templateName: 'index', section: 'trio' })
    expect(saved.html).toBe('<div id="shopify-section-trio" class="shopify-section"><b>Saved</b></div>')
    const layout = await renderPage({ data: legacySampleData, theme: { files: { ...files, 'layout/bare.liquid': "{% section 'trio' %}", 'templates/bare.json': '{ "layout": "bare", "sections": {}, "order": [] }' } }, templateName: 'bare' })
    expect(layout.html).toBe(unsaved.html)
  })
  it('does not mark a section failed for an error the engine records without printing', async () => {
    const files = { ...theme.files, 'sections/quiet.liquid': '<p>ok</p>{% assign x = 1 | divided_by: 0 %}', 'templates/quiet.json': '{ "sections": { "q": { "type": "quiet" } }, "order": ["q"] }' }
    const { html, report } = await renderPage({ data: legacySampleData, theme: { files }, templateName: 'quiet' })
    expect(html).toContain('<div id="shopify-section-template--quiet__q" class="shopify-section"><p>ok</p></div>')
    expect(report.sections[0]).toMatchObject({ id: 'template--quiet__q', status: 'rendered' })
    expect(report.errors).toHaveLength(1)
  })
  it('leaves the section frame once the section is done', async () => {
    const files = { ...theme.files, 'layout/probe.liquid': "{{ content_for_layout }}[{{ 'sections.hero.tagline' | t }}]", 'templates/probe.json': '{ "layout": "probe", "sections": { "h": { "type": "hero" } }, "order": ["h"] }' }
    const { html } = await renderPage({ data: legacySampleData, theme: { files }, templateName: 'probe' })
    expect(html).toContain('<p>Made with care</p>')
    expect(html.endsWith('[translation missing: en.sections.hero.tagline]')).toBe(true)
  })
  it('prints store data that holds the plain header marker as data', async () => {
    const name = 'A\u0000content_for_header\u0000B'
    const { html } = await renderPage({ theme, templateName: 'index', data: { shop: { name, domain: 'other.example', currency: 'USD' } } })
    expect(html).toContain(`<title>${name}</title>`)
    expect(html.match(/var Shopify = /g)).toHaveLength(1)
  })
  it('reads an undefined size in a section as nothing, not the number of keys in the page globals', async () => {
    const files = {
      'templates/x.json': JSON.stringify({ layout: false, sections: { main: { type: 'sec' } } }),
      'sections/sec.liquid': "[{{ size }}][{{ size | default: 'M' }}][{% render 'sized' %}][{% render 'sized', size: 'L' %}]",
      'snippets/sized.liquid': '{{ size }}'
    }
    const { html } = await renderPage({ data: legacySampleData, theme: { files }, templateName: 'x' })
    expect(html).toBe('<div id="shopify-section-template--x__main" class="shopify-section">[][M][][L]</div>')
  })
  describe('renderSection ids of unusual keys', () => {
    const footer = (type = 'footer') => ({ type })
    const hg = { type: 'header', sections: { top__bar: footer(), _lead: footer(), __proto__x: footer(), trail_: footer(), constructor: footer(), plain: footer() }, order: ['top__bar', '_lead', '__proto__x', 'trail_', 'constructor', 'plain'] }
    const mine = { type: 'footer', sections: { a: footer(), b__c: footer() }, order: ['a', 'b__c'] }
    const files = {
      ...theme.files,
      'sections/hg.json': JSON.stringify(hg),
      'sections/hg.context.ca.json': '{ "context": { "market": "ca" }, "sections": { "__proto__": { "type": "footer" }, "plain": { "type": "footer", "settings": { "copyright": "Canada" } } }, "order": ["top__bar", "_lead", "__proto__x", "trail_", "constructor", "plain", "__proto__"] }',
      'sections/my__group.json': JSON.stringify(mine),
      'layout/groups.liquid': "{% sections 'hg' %}{% sections 'my__group' %}{{ content_for_layout }}",
      'templates/g.json': '{ "layout": "groups", "sections": { "m__n": { "type": "footer" }, "_u": { "type": "footer" } }, "order": ["m__n", "_u"] }'
    }
    for (const [label, request] of [['without a context', undefined], ['with the ca market', { context: { market: 'ca' } }]] as const) {
      it(`renders every section whose key holds __ or starts with _ by its reported id, ${label}`, async () => {
        const options = { theme: { files }, templateName: 'g', request }
        const page = await renderPage(options)
        const ids = page.report.sections.map(entry => entry.id)
        expect(ids).toEqual(expect.arrayContaining(['sections--hg__top__bar', 'sections--hg___lead', 'sections--hg____proto__x', 'sections--my__group__a', 'sections--my__group__b__c', 'template--g__m__n', 'template--g___u']))
        if (request) expect(ids).toContain('sections--hg____proto__')
        expect(page.report.sections.filter(entry => entry.status !== 'rendered')).toEqual([])
        for (const id of ids) {
          const one = await renderSection({ data: legacySampleData, ...options, section: id })
          expect(one.html).toContain(`id="shopify-section-${id}"`)
          expect(page.html).toContain(one.html)
          expect(one.report.sections.map(entry => `${entry.id}:${entry.status}`)).toEqual([`${id}:rendered`])
          expect(one.report.missing).toEqual([])
        }
        if (request) expect((await renderSection({ data: legacySampleData, ...options, section: 'sections--hg__plain' })).html).toContain('Canada')
      })
    }
    it('reports a missing group by its last split and a missing section of an existing group by its id', async () => {
      const none = await renderSection({ data: legacySampleData, theme: { files }, templateName: 'g', section: 'sections--no__such__key' })
      expect(none.html).toBe('')
      expect(none.report.missing).toEqual([{ kind: 'section_group', name: 'no__such' }])
      const gone = await renderSection({ data: legacySampleData, theme: { files }, templateName: 'g', section: 'sections--my__group__zzz' })
      expect(gone.html).toBe('')
      expect(gone.report.missing).toEqual([{ kind: 'section', name: 'sections--my__group__zzz' }])
    })
  })
  it('reaches a template key before a static section of the same name', async () => {
    const files = { ...theme.files, 'templates/s.json': '{ "sections": { "footer": { "type": "hero" } }, "order": ["footer"] }' }
    const { html } = await renderSection({ data: legacySampleData, theme: { files }, templateName: 's', section: 'footer' })
    expect(html).toContain('id="shopify-section-template--s__footer"')
    expect(html).toContain('<h1>Default heading</h1>')
  })
  it('keeps the static blocks of a static section\'s schema default static', async () => {
    const section = "{% content_for 'blocks' %}|{% content_for 'block', type: 'cell', id: 'hero-cell' %}|{{ section.blocks.size }}" +
      '{% schema %}{ "name": "S", "default": { "blocks": [{ "type": "cell", "settings": { "width": 3 } }, { "type": "cell", "id": "hero-cell", "static": true, "settings": { "width": 9 } }, { "type": "cell", "static": true }] } }{% endschema %}'
    const cell = '{{ block.id }}={{ block.settings.width }};{% schema %}{ "tag": null, "settings": [{ "type": "number", "id": "width", "default": 1 }] }{% endschema %}'
    const files = { ...theme.files, 'sections/dflt.liquid': section, 'blocks/cell.liquid': cell }
    const { html } = await renderSection({ data: legacySampleData, theme: { files }, templateName: 'index', section: 'dflt' })
    expect(html).toBe('<div id="shopify-section-dflt" class="shopify-section">block-1=3;block-3=1;|hero-cell=9;|2</div>')
  })
})
