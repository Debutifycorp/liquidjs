import { renderPage, renderSection, requestFromUrl, storefrontSampleData as data } from '../../../src/shopify'
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
