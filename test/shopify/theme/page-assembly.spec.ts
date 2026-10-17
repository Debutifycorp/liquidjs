import { compileTheme, renderPage, renderSection, requestFromUrl, storefrontSampleData as data } from '../../../src/shopify'
import type { ThemeInput } from '../../../src/shopify'

// What Shopify adds to a page around the theme's own markup. Each case names the parity store's recording it follows; the recordings are private (they hold the themes' markup), so the themes here are minimal inline files over the public sample data.

const LAYOUT = '<!doctype html><html><head>{{ content_for_header }}</head><body>{{ content_for_layout }}</body></html>'

/** A theme whose home page renders the `sections/<name>.liquid` files given, in order. */
function homeTheme (sections: Record<string, string>, more: Record<string, string> = {}): ThemeInput {
  const names = Object.keys(sections)
  return {
    files: {
      'config/settings_schema.json': '[]',
      'config/settings_data.json': '{"current":{}}',
      'layout/theme.liquid': LAYOUT,
      'templates/index.json': JSON.stringify({ sections: Object.fromEntries(names.map(name => [name, { type: name }])), order: names }),
      'templates/product.json': '{"sections":{},"order":[]}',
      ...Object.fromEntries(Object.entries(sections).map(([name, source]) => [`sections/${name}.liquid`, source])),
      ...more
    }
  }
}

async function home (theme: ThemeInput, url = '/', origin = 'https://parity.myshopify.com'): Promise<string> {
  const page = requestFromUrl(url, data)
  return (await renderPage({ theme, templateName: page.templateName, data, locale: page.locale, request: { ...page.request, origin } })).html
}

describe('<shopify-store> before <shopify-account>', () => {
  // https://shopify.dev/docs/api/storefront-web-components/components/shopify-store: the store element "set[s] up your credentials and market configuration for a storefront", with `store-domain`, `country` and `language`. The parity store prints one, empty and followed by a line break, right before the theme's `<shopify-account` on every page of Horizon 4.3.0 and Dawn 16.0.0 (`store-domain="https://<store>" country="US" language="en"`); the theme's indentation stays before it
  const ACCOUNT = '<div>\n      <shopify-account\n        menu="customer-account-main-menu"\n      ></shopify-account></div>'

  it('prints the store element before the account element, with the address, country and language of the page', async () => {
    const html = await home(homeTheme({ account: ACCOUNT }))
    expect(html).toContain('<div>\n      <shopify-store store-domain="https://parity.myshopify.com" country="US" language="en"></shopify-store>\n<shopify-account\n        menu="customer-account-main-menu"\n      ></shopify-account></div>')
    expect(html.match(/<shopify-store /g)).toHaveLength(1)
  })

  it('follows the market and the language of the page', async () => {
    // recordings `page-home-fr-ca` (`country="CA" language="fr"`) and `page-product-en-eu` (`country="DE" language="en"`) of both themes
    expect(await home(homeTheme({ account: ACCOUNT }), '/fr-ca')).toContain('<shopify-store store-domain="https://parity.myshopify.com" country="CA" language="fr"></shopify-store>\n<shopify-account')
    expect(await home(homeTheme({ account: ACCOUNT }), '/en-eu')).toContain('<shopify-store store-domain="https://parity.myshopify.com" country="DE" language="en"></shopify-store>\n<shopify-account')
  })

  it('names the address the page is served at, and the store\'s own domain when it is given none', async () => {
    // kith.com, a live store, prints `store-domain="https://kith.com"` where its `Shopify.shop` is `kithnyc.myshopify.com`: the address the shopper is on, not the myshopify.com domain
    expect(await home(homeTheme({ account: ACCOUNT }), '/', 'https://shop.example')).toContain('<shopify-store store-domain="https://shop.example" ')
    const page = requestFromUrl('/', data)
    const { html } = await renderPage({ theme: homeTheme({ account: ACCOUNT }), templateName: page.templateName, data, request: page.request })
    expect(html).toContain(`<shopify-store store-domain="https://${data.shop.domain}" country="US" language="en"></shopify-store>\n<shopify-account`)
  })

  it('prints one before every account element, and none where the text is not an element', async () => {
    const html = await home(homeTheme({
      a: '<shopify-account></shopify-account><SHOPIFY-ACCOUNT menu="x"></SHOPIFY-ACCOUNT>',
      b: '<script>var s = "<shopify-account>";</script><style>/* <shopify-account> */</style><!-- <shopify-account> --><textarea><shopify-account></textarea><shopify-accounts></shopify-accounts>'
    }))
    expect(html.match(/<shopify-store /g)).toHaveLength(2)
    expect(html).toContain('<script>var s = "<shopify-account>";</script><style>/* <shopify-account> */</style><!-- <shopify-account> --><textarea><shopify-account></textarea><shopify-accounts></shopify-accounts>')
    expect(html).toContain('</shopify-store>\n<SHOPIFY-ACCOUNT menu="x">')
  })

  it('prints nothing on a page without an account element, nor in a section rendered alone', async () => {
    expect(await home(homeTheme({ text: '<p>shopify-account</p>' }))).not.toContain('shopify-store')
    const { html } = await renderSection({ theme: homeTheme({ account: ACCOUNT }), templateName: 'index', data, section: 'account' })
    expect(html).not.toContain('shopify-store')
  })

  it('escapes the attributes', async () => {
    expect(await home(homeTheme({ account: ACCOUNT }), '/', 'https://a"b.example')).toContain('store-domain="https://a&quot;b.example"')
  })
})

describe('the compiled {% stylesheet %} and {% javascript %} files', () => {
  // https://shopify.dev/docs/storefronts/themes/best-practices/javascript-and-stylesheet-tags: Shopify collects the `{% stylesheet %}` bodies of the sections, blocks and snippets into one `styles.css`, linked from `content_for_header`, and the `{% javascript %}` bodies of the sections into `scripts.js`, loaded with `defer`, each body in a self-executing function. The parity store links `compiled_assets/styles.css?v=<version>` with the same version on all 19 recorded pages of Horizon 4.3.0, and the file holds every stylesheet of the theme, rendered on the page or not (its source map: `/* START_SECTION:password (INDEX:27) */` on the home page's file)
  const STYLED = {
    'sections/hero.liquid': '<h1>Hero</h1>{% stylesheet %}\n  .hero { color: red; }\n{% endstylesheet %}{% javascript %}\n  console.log("hero")\n{% endjavascript %}{% content_for "block", type: "badge", id: "b" %}{% render "price" %}',
    'sections/unused.liquid': '{% stylesheet %}.unused { display: none; }{% endstylesheet %}{% javascript %}unused(){% endjavascript %}',
    'sections/plain.liquid': '<p>plain</p>',
    'blocks/badge.liquid': '<i>badge</i>{% stylesheet %}.badge { color: blue; }{% endstylesheet %}{% javascript %}badge(){% endjavascript %}{% schema %}{"name":"Badge"}{% endschema %}',
    'snippets/price.liquid': '<b>price</b>{% if false %}{% stylesheet %}\n.price { font-weight: bold; }\n{% endstylesheet %}{% endif %}',
    'snippets/empty.liquid': '{% stylesheet %}  {% endstylesheet %}'
  }
  const styledTheme = (more: Record<string, string> = {}) => homeTheme({}, {
    ...STYLED,
    'templates/index.json': '{"sections":{"hero":{"type":"hero"},"plain":{"type":"plain"}},"order":["hero","plain"]}',
    ...more
  })

  async function linked (theme: ThemeInput, url = '/'): Promise<string> {
    const page = requestFromUrl(url, data)
    return (await renderPage({ theme, templateName: page.templateName, data, locale: page.locale, request: page.request, compiledAssetsUrl: '/p/tok/compiled_assets/' })).html
  }

  it('holds every stylesheet of the theme\'s sections, blocks and snippets, in Shopify\'s form', () => {
    const { styles } = compileTheme(styledTheme()).compiledAssets()
    // the parity store's file, from its source map: a version line, then the sections, the blocks and the snippets, each group under its heading and in file name order, each body trimmed between START and END markers that name the file and its place among the `.liquid` files of the three folders (sections, then blocks, then snippets, each in name order)
    expect(styles?.body).toBe([
      '/* SHOPIFY_STYLESHEETS_VERSION: 1.0 */',
      '',
      '',
      '/* CSS from section stylesheet tags */',
      '/* START_SECTION:hero (INDEX:0) */',
      '.hero { color: red; }',
      '/* END_SECTION:hero */',
      '',
      '/* START_SECTION:unused (INDEX:2) */',
      '.unused { display: none; }',
      '/* END_SECTION:unused */',
      '',
      '/* CSS from block stylesheet tags */',
      '/* START_BLOCK:badge (INDEX:3) */',
      '.badge { color: blue; }',
      '/* END_BLOCK:badge */',
      '',
      '/* CSS from snippet stylesheet tags */',
      '/* START_SNIPPET:price (INDEX:5) */',
      '.price { font-weight: bold; }',
      '/* END_SNIPPET:price */'
    ].join('\n'))
    expect(styles?.version).toMatch(/^[0-9a-f]{20}$/)
  })

  it('holds every section\'s javascript, each run only when the page names the section, in Shopify\'s form', () => {
    const { scripts } = compileTheme(styledTheme()).compiledAssets()
    // the parity store's `scripts.js` for Horizon 4.3.0 (its source map), where `main-collection` is the one section with a `{% javascript %}`
    expect(scripts?.body).toBe("(function() {\n  var __sections__ = {};\n  (function() {\n    for(var i = 0, s = document.getElementById('sections-script').getAttribute('data-sections').split(','); i < s.length; i++)\n      __sections__[s[i]] = true;\n    })();\n    " +
      '(function() {\n  if (!__sections__["hero"]) return;\n  try {\n    \n  console.log("hero")\n\n  } catch(e) { console.error(e); }\n})();\n' +
      '(function() {\n  if (!__sections__["unused"]) return;\n  try {\n    unused()\n  } catch(e) { console.error(e); }\n})();\n' +
      '})();\n')
  })

  it('links the files from content_for_header when the page is told where they are served, and inlines nothing of theirs', async () => {
    const theme = styledTheme()
    const { styles, scripts } = compileTheme(theme).compiledAssets()
    const html = await linked(theme)
    // the parity store's tags (recordings of Horizon 4.3.0 and Dawn 16.0.0): `<link rel="stylesheet" media="screen" href="…/compiled_assets/styles.css?v=…">`, then `<script id="sections-script" data-sections="header" defer="defer" src="…/compiled_assets/scripts.js?v=…"></script>` naming the page's sections that have a `{% javascript %}`
    expect(html).toContain(`<link rel="stylesheet" media="screen" href="/p/tok/compiled_assets/styles.css?v=${styles!.version}"><script id="sections-script" data-sections="hero" defer="defer" src="/p/tok/compiled_assets/scripts.js?v=${scripts!.version}"></script>`)
    expect(html).not.toContain('<style data-shopify')
    expect(html).not.toContain('.hero { color: red; }')
    expect(html).not.toContain('console.log("hero")')
    // a block's and a snippet's javascript have files of their own on Shopify (`block-scripts.js`, `snippet-scripts.js`) that no recording shows, so they stay inline
    expect(html).toContain("<script>document.addEventListener('DOMContentLoaded', function () {\n(function () {\nbadge()\n})();\n});</script>")
  })

  it('prints no link when the theme has no stylesheet, and no script tag when the page renders no section javascript', async () => {
    const html = await linked(homeTheme({ plain: '<p>plain</p>' }))
    expect(html).not.toContain('compiled_assets')
    const noScript = await linked(styledTheme({ 'templates/index.json': '{"sections":{"plain":{"type":"plain"}},"order":["plain"]}' }))
    expect(noScript).toContain('/p/tok/compiled_assets/styles.css?v=')
    expect(noScript).not.toContain('sections-script')
  })

  it('still inlines a stylesheet from a file outside the three folders', async () => {
    const html = await linked(styledTheme({ 'layout/theme.liquid': `${LAYOUT}{% stylesheet %}.layout { margin: 0; }{% endstylesheet %}` }))
    expect(html).toContain('<style data-shopify="stylesheet-tags">.layout { margin: 0; }</style>')
  })

  it('gives the files a new version when a body changes, and keeps it while none does', () => {
    const theme = styledTheme()
    const first = compileTheme(theme).compiledAssets()
    expect(compileTheme(theme).compiledAssets()).toBe(first)
    theme.files['sections/plain.liquid'] = '<p>still plain</p>'
    const same = compileTheme(theme).compiledAssets()
    expect(same.styles?.version).toBe(first.styles?.version)
    theme.files['blocks/badge.liquid'] = '{% stylesheet %}.badge { color: green; }{% endstylesheet %}'
    const changed = compileTheme(theme).compiledAssets()
    expect(changed.styles?.version).not.toBe(first.styles?.version)
    expect(changed.styles?.body).toContain('.badge { color: green; }')
    expect(changed.scripts?.version).toBe(first.scripts?.version)
  })

  it('inlines the bodies the page rendered when it is not told where the files are served', async () => {
    // a page rendered with no server behind it (the engine alone, a design tool) has nowhere to load the files from
    const page = requestFromUrl('/', data)
    const { html } = await renderPage({ theme: styledTheme(), templateName: page.templateName, data, request: page.request })
    expect(html).toContain('<style data-shopify="stylesheet-tags">\n  .hero { color: red; }\n\n.badge { color: blue; }</style>')
    expect(html).not.toContain('compiled_assets')
  })
})
