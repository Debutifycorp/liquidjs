import { createShopifyLiquid, parseWrapper, renderLiquid } from '../../../src/shopify'
import { createState } from '../../../src/shopify/state'
import { contentForHeader, HEADER_MARKER, newHeaderMarker } from '../../../src/shopify/theme/header'
import { deepMerge, parseThemeJson } from '../../../src/shopify/theme/json'

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
    expect(parseWrapper('div[data-on=a][aria-label=b]')).toEqual(['<div data-on="a" aria-label="b">', '</div>'])
  })
  it('refuses an event-handler or style attribute unless the caller trusts the wrapper', () => {
    for (const spec of ['div[onmouseover=alert(1)]', 'div#a.b[ONCLICK=x]', 'main[onfocus=x][data-a=b]', 'section[style=position:fixed]', 'div[Style=x]']) {
      expect([spec, parseWrapper(spec)]).toEqual([spec, undefined])
      expect(parseWrapper(spec, true)).toEqual(expect.any(Array))
    }
    expect(parseWrapper('div[onmouseover=alert(1)]', true)).toEqual(['<div onmouseover="alert(1)">', '</div>'])
  })
  it('refuses other tags and malformed specs', () => {
    expect(parseWrapper('span.x')).toBeUndefined()
    expect(parseWrapper('div#a b')).toBeUndefined()
    expect(parseWrapper('div[onclick=x')).toBeUndefined()
    expect(parseWrapper('')).toBeUndefined()
  })
})

/** The header without the scripts Shopify adds for dynamic checkout, which have a test of their own. */
const withoutCheckout = (header: string) => header.replace(/<script data-source-attribution="shopify\.dynamic_checkout[\s\S]*?<\/script>\n/g, '')

describe('shopify/theme/header', () => {
  it('keeps stylesheet and javascript bodies from closing their element', () => {
    const state = createState()
    state.assets.stylesheets.set('a', 'a::after { content: "</style>" }')
    state.assets.javascripts.set('b', 'document.write("</script>")')
    const globals = { shop: { permanent_domain: '</script><b>', currency: 'USD' }, localization: { country: { iso_code: 'US' } }, request: { locale: { iso_code: 'en' } } }
    const header = withoutCheckout(contentForHeader(state, globals))
    expect(header).toContain('Shopify.shop = "\\u003c/script>\\u003cb>";')
    expect(header).toContain('<style data-shopify="stylesheet-tags">a::after { content: "<\\/style>" }</style>')
    expect(header).toContain('document.write("<\\/script>")')
    expect(header.match(/<\/script>/g)).toHaveLength(3)
    expect(header.match(/<\/style>/g)).toHaveLength(1)
  })
  it('writes no style or deferred script when the page has none', () => {
    const header = withoutCheckout(contentForHeader(createState(), { shop: { permanent_domain: 'a.example', currency: 'USD' }, localization: {}, request: {} }))
    expect(header).toContain('<script>var Shopify = Shopify || {};Shopify.shop = "a.example";Shopify.locale = null;Shopify.currency = {"active":"USD","rate":"1.0"};Shopify.country = null;Shopify.theme = {"name":"theme",')
    expect(header).toContain('Shopify.theme.handle = "null";Shopify.theme.style = {"id":null,"handle":null};Shopify.cdnHost = "a.example/cdn";Shopify.routes = Shopify.routes || {};Shopify.routes.root = "/";')
    expect(header).not.toContain('designMode')
    expect(header).not.toContain('<style')
    expect(header).not.toContain('DOMContentLoaded')
  })
  it('names the theme from its theme_info', () => {
    const state = createState()
    state.theme = { name: 'Dawn', version: '16.0.0' }
    const header = contentForHeader(state, { shop: { permanent_domain: 'a.example', currency: 'USD' }, localization: {}, request: {} })
    expect(header).toMatch(/Shopify\.theme = \{"name":"Dawn","id":\d{12},"schema_name":"Dawn","schema_version":"16\.0\.0","theme_store_id":null,"role":"main"\};/)
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
  it('adds the dynamic checkout scripts of Shopify\'s pages: the bootstrap on every page, the module and stylesheet on a page with a button', () => {
    const globals = { shop: { permanent_domain: 'a.example', currency: 'USD' }, localization: {}, request: { locale: { iso_code: 'fr' } } }
    const state = createState({ services: { shopifyCloudUrl: path => `/p/tok/cdn/shopifycloud/${path}` } })
    const plain = contentForHeader(state, globals)
    expect(plain).toContain('<script data-source-attribution="shopify.dynamic_checkout.dynamic.init">var Shopify=Shopify||{};Shopify.PaymentButton=Shopify.PaymentButton||{isStorefrontPortableWallets:!0,init:function(){')
    expect(plain).toContain('t.src="/p/tok/cdn/shopifycloud/portable-wallets/latest/portable-wallets.fr.js",t.type="module"')
    expect(plain).toContain('data-source-attribution="shopify.dynamic_checkout.buyer_consent"')
    expect(plain).toContain('data-source-attribution="shopify.dynamic_checkout.cart.bootstrap"')
    expect(plain).not.toContain('shopify-accelerated-checkout-styles')
    state.checkoutButton = true
    const withButton = contentForHeader(state, globals)
    expect(withButton).not.toContain('cart.bootstrap')
    expect(withButton).toContain('<script type="module" src="/p/tok/cdn/shopifycloud/portable-wallets/latest/portable-wallets.fr.js" onError="portableWalletsCleanup(this)" crossorigin="anonymous"></script>')
    expect(withButton).toContain('<script nomodule>')
    expect(withButton).toContain('<link id="shopify-accelerated-checkout-styles" rel="stylesheet" media="screen" href="/p/tok/cdn/shopifycloud/portable-wallets/latest/accelerated-checkout.css" crossorigin="anonymous">')
    expect(withButton).toContain('<style id="shopify-accelerated-checkout-cart">')
  })
})
