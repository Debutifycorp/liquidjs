import { contentForHeader, createShopifyLiquid, createState, deepMerge, HEADER_MARKER, newHeaderMarker, parseThemeJson, parseWrapper, renderLiquid } from '../../../src/shopify'

describe('shopify/theme/json', () => {
  it('parses a theme JSON file with or without the editor notice', () => {
    expect(parseThemeJson('/*\n * IMPORTANT\n */\n{ "a": 1 }', 'templates/index.json')).toEqual({ a: 1 })
    expect(parseThemeJson('{ "a": 1 }', 'x.json')).toEqual({ a: 1 })
  })
  it('names the file in a JSON error', () => {
    expect(() => parseThemeJson('{ nope', 'sections/header-group.json')).toThrow(/^sections\/header-group\.json: /)
  })
  it('merges objects key by key and replaces everything else', () => {
    const base = { sections: { a: { settings: { text: 'x', size: 1 }, blocks: ['one'] }, b: { type: 'b' } }, order: ['a', 'b'] }
    const merged = deepMerge(base, { sections: { a: { settings: { text: 'y' }, blocks: ['two'] } }, order: undefined })
    expect(merged).toEqual({ sections: { a: { settings: { text: 'y', size: 1 }, blocks: ['two'] }, b: { type: 'b' } }, order: ['a', 'b'] })
    expect(base.sections.a.settings.text).toBe('x')
    expect(deepMerge({ order: ['a', 'b'] }, { order: ['b'] })).toEqual({ order: ['b'] })
    expect(deepMerge({ a: 1 }, null)).toBeNull()
  })
  it('keeps a __proto__ key out of the result\'s prototype', () => {
    const merged = deepMerge({ a: 1 }, JSON.parse('{ "__proto__": { "evil": true }, "b": { "__proto__": { "worse": true } } }')) as Record<string, any>
    expect(merged.evil).toBeUndefined()
    expect(merged.b.worse).toBeUndefined()
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype)
    expect(Object.keys(merged)).toEqual(['a', '__proto__', 'b'])
    expect(({} as Record<string, any>).evil).toBeUndefined()
  })
})

describe('shopify/theme/json parseWrapper', () => {
  it('builds the opening and closing tags from an id, classes and attributes', () => {
    expect(parseWrapper('div#div_id.div_class[attribute-one=value]')).toEqual(['<div id="div_id" class="div_class" attribute-one="value">', '</div>'])
    expect(parseWrapper('main')).toEqual(['<main>', '</main>'])
    expect(parseWrapper(' section.a.b ')).toEqual(['<section class="a b">', '</section>'])
  })
  it('escapes attribute values', () => {
    expect(parseWrapper('div[data-x=a"b&c]')).toEqual(['<div data-x="a&quot;b&amp;c">', '</div>'])
  })
  it('refuses other tags and malformed specs', () => {
    expect(parseWrapper('span.x')).toBeUndefined()
    expect(parseWrapper('div#a b')).toBeUndefined()
    expect(parseWrapper('div[onclick=x')).toBeUndefined()
    expect(parseWrapper('')).toBeUndefined()
  })
})

describe('shopify/theme/header', () => {
  it('keeps stylesheet and javascript bodies from closing their element', () => {
    const state = createState()
    state.assets.stylesheets.set('a', 'a::after { content: "</style>" }')
    state.assets.javascripts.set('b', 'document.write("</script>")')
    const globals = { shop: { permanent_domain: '</script><b>', currency: 'USD' }, localization: { country: { iso_code: 'US' } }, request: { locale: { iso_code: 'en' } } }
    const header = contentForHeader(state, globals)
    expect(header).toContain('Shopify.shop = "\\u003c/script>\\u003cb>";')
    expect(header).toContain('<style data-shopify="stylesheet-tags">a::after { content: "<\\/style>" }</style>')
    expect(header).toContain('document.write("<\\/script>")')
    expect(header.match(/<\/script>/g)).toHaveLength(2)
    expect(header.match(/<\/style>/g)).toHaveLength(1)
  })
  it('writes no style or deferred script when the page has none', () => {
    const header = contentForHeader(createState(), { shop: { permanent_domain: 'a.example', currency: 'USD' }, localization: {}, request: {} })
    expect(header).toBe('<script>var Shopify = Shopify || {};Shopify.shop = "a.example";Shopify.locale = null;Shopify.currency = {"active":"USD","rate":"1.0"};Shopify.country = null;Shopify.designMode = false;Shopify.routes = Shopify.routes || {};Shopify.routes.root = "/";</script>')
  })
})

describe('shopify/theme/header marker', () => {
  it('is new for each render and made from the plain marker', () => {
    const first = newHeaderMarker()
    expect(first).not.toBe(newHeaderMarker())
    expect(first).not.toBe(HEADER_MARKER)
    expect(first.startsWith('\u0000content_for_header:')).toBe(true)
    expect(first.endsWith('\u0000')).toBe(true)
  })
})

describe('shopify/tags/section outside renderPage', () => {
  const liquid = createShopifyLiquid()
  it('renders nothing and says why', async () => {
    const { html, report } = await renderLiquid(liquid, "a{% section 'footer' %}b{% sections 'header-group' %}c")
    expect(html).toBe('abc')
    expect(report.unsupported).toEqual([
      { feature: 'section', detail: "{% section 'footer' %} outside renderPage" },
      { feature: 'sections', detail: "{% sections 'header-group' %} outside renderPage" }
    ])
  })
  it('needs a name', () => {
    expect(() => liquid.parse('{% section %}')).toThrow('section needs a section name')
    expect(() => liquid.parse('{% sections %}')).toThrow('sections needs a section group name')
  })
})
