import { renderPage, requestFromUrl, resolveView, sampleStoreData, storefrontSampleData as data } from '../../src/shopify'
import type { StoreData } from '../../src/shopify'
import { buildStore } from '../../src/shopify/store/build'
import { ReportCollector } from '../../src/shopify/report'
import { buildGlobals } from '../../src/shopify/store/globals'
import { buildLocalization, currencyOf, marketOf } from '../../src/shopify/store/markets'
import type { StoreView } from '../../src/shopify/store/view'
import { probeMatches } from './expect-probe'

const pick = (b: any) => ({
  localization: b.localization,
  shop: { name: b.shop.name, description: b.shop.description, currency: b.shop.currency, enabled_currencies: b.shop.enabled_currencies, published_locales: b.shop.published_locales },
  cart_currency: b.cart_currency,
  money: b.money,
  money_with_currency: b.money_with_currency,
  request_locale: b.request.locale
})

const EMPTY = '{"sections":{},"order":[]}'

/** A theme of empty templates around a layout, to read what the layout prints. */
const layoutTheme = (layout: string) => ({ files: { 'config/settings_schema.json': '[]', 'config/settings_data.json': '{"current":{}}', 'layout/theme.liquid': layout, 'templates/index.json': EMPTY, 'templates/404.json': EMPTY, 'templates/search.json': EMPTY, 'templates/product.json': EMPTY, 'templates/collection.json': EMPTY } })

async function renderUrl (url: string, layout: string, store: StoreData = data, options: { basePath?: string, country?: string } = {}): Promise<string> {
  const page = requestFromUrl(url, store, options)
  return (await renderPage({ theme: layoutTheme(layout), templateName: page.templateName, data: store, request: page.request, locale: page.locale })).html
}

const HEADER = '{{ content_for_header }}'

const ORIGIN = `https://${data.shop.domain}`

/** The `hreflang` links of a header as `[hreflang, path]` pairs (the origin taken off), in the order printed. */
const hreflangs = (html: string) => [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]*)">/g)].map(m => [m[1], m[2].startsWith(ORIGIN) ? m[2].slice(ORIGIN.length) : m[2]])

// The hreflang links of the parity store's home pages (its recordings `page-home` and `page-home-fr-ca`, which are not among the fork's fixtures: both print these 14 links, hreflang and path). The primary market has one tag per language, every other market one per country and language, countries in ISO order.
const HOME_LINKS = [
  ['x-default', '/'], ['en', '/'], ['en-CA', '/en-ca'], ['fr-CA', '/fr-ca'],
  ['en-DE', '/en-eu'], ['fr-DE', '/fr-eu'], ['en-ES', '/en-eu'], ['fr-ES', '/fr-eu'], ['en-FR', '/en-eu'], ['fr-FR', '/fr-eu'], ['en-IT', '/en-eu'], ['fr-IT', '/fr-eu'], ['en-NL', '/en-eu'], ['fr-NL', '/fr-eu']
]

/** A store that is not the sample one: a pound shop with two markets and two languages. */
const other: StoreData = {
  shop: { name: 'Other', domain: 'other.example', currency: 'GBP', locale: 'en', money_format: '£{{amount}}', money_with_currency_format: '£{{amount}} GBP' },
  markets: [
    { handle: 'uk', name: 'United Kingdom', primary: true, countries: [{ iso_code: 'GB', name: 'United Kingdom' }], currency: { iso_code: 'GBP', symbol: '£', rate: 1 }, languages: ['en'] },
    { handle: 'de', name: 'Germany', countries: [{ iso_code: 'DE', name: 'Germany' }, { iso_code: 'AT', name: 'Austria' }], currency: { iso_code: 'EUR', symbol: '€', rate: 1.17 }, languages: ['de', 'en'], subfolder: 'de' }
  ],
  languages: [{ iso_code: 'en', name: 'English', endonym_name: 'English' }, { iso_code: 'de', name: 'German', endonym_name: 'Deutsch' }]
}

describe('markets and localization', () => {
  for (const name of ['probe-page-home', 'probe-page-en-ca', 'probe-page-fr-ca', 'probe-page-fr-eu']) {
    it(`matches ${name}`, async () => {
      const { actual, expected } = await probeMatches(name, pick)
      expect(actual).toEqual(expected)
    })
  }

  it('puts the view\'s base path before every language root', () => {
    const roots = (view: StoreView) => (buildLocalization(data, view) as any).available_languages.map((l: any) => l.root_url)
    expect(roots({ market: 'ca', language: 'fr', prefix: '/p/tok/fr-ca' })).toEqual(['/p/tok/en-ca', '/p/tok/fr-ca'])
    expect(roots({ market: 'ca', language: 'fr', prefix: '/fr-ca' })).toEqual(['/en-ca', '/fr-ca'])
    expect(roots({ market: 'us', language: 'en', prefix: '/p/tok' })).toEqual(['/p/tok'])
    expect(roots({ market: 'us', language: 'en', prefix: '' })).toEqual(['/'])
  })

  it('names the countries and languages in the language of the view', () => {
    const fr = buildLocalization(data, { market: 'eu', language: 'fr', prefix: '/fr-eu' }) as any
    expect(fr.available_countries.map((c: any) => c.name)).toEqual(['Allemagne', 'Canada', 'Espagne', 'États-Unis', 'France', 'Italie', 'Pays-Bas'])
    expect(fr.language).toMatchObject({ iso_code: 'fr', name: 'français', endonym_name: 'français', primary: false, root_url: '/fr-eu' })
    expect(fr.available_languages.map((l: any) => [l.iso_code, l.name, l.endonym_name, l.primary])).toEqual([['en', 'anglais', 'English', true], ['fr', 'français', 'français', false]])
    const en = buildLocalization(data, { market: 'eu', language: 'en', prefix: '/en-eu' }) as any
    expect(en.available_countries.map((c: any) => c.name)).toEqual(['Canada', 'France', 'Germany', 'Italy', 'Netherlands', 'Spain', 'United States'])
    expect(en.available_languages.map((l: any) => [l.iso_code, l.name])).toEqual([['en', 'English'], ['fr', 'French']])
  })

  it('gives each country its own market and currency, and the shopper\'s country when it is in the market', () => {
    const view = { market: 'eu', language: 'en', prefix: '/en-eu' }
    const byCode = (l: any) => Object.fromEntries(l.available_countries.map((c: any) => [c.iso_code, [c.currency.iso_code, c.currency.symbol, c.market.handle]]))
    expect(byCode(buildLocalization(data, view))).toEqual({ CA: ['CAD', '$', 'ca'], DE: ['EUR', '€', 'eu'], ES: ['EUR', '€', 'eu'], FR: ['EUR', '€', 'eu'], IT: ['EUR', '€', 'eu'], NL: ['EUR', '€', 'eu'], US: ['USD', '$', 'us'] })
    expect((buildLocalization(data, view) as any).country.iso_code).toBe('DE')
    expect((buildLocalization(data, view, 'IT') as any).country.iso_code).toBe('IT')
    // a country of another market is not the shopper's in this one
    expect((buildLocalization(data, view, 'US') as any).country.iso_code).toBe('DE')
    expect((buildLocalization(data, view) as any).market).toMatchObject({ handle: 'eu' })
  })

  it('takes the money formats of a market\'s currency', () => {
    const format = (market: string) => { const c = currencyOf(data, { market, language: 'en', prefix: '' }); return [c.iso_code, c.symbol, c.rate, c.money_format, c.money_with_currency_format] }
    expect(format('us')).toEqual(['USD', '$', 1, '${{amount}}', '${{amount}} USD']) // eslint-disable-line no-template-curly-in-string
    expect(format('ca')).toEqual(['CAD', '$', 1.35, '${{amount}}', '${{amount}} CAD']) // eslint-disable-line no-template-curly-in-string
    expect(format('eu')).toEqual(['EUR', '€', 0.92, '€{{amount_with_comma_separator}}', '€{{amount_with_comma_separator}} EUR'])
    expect(currencyOf(data, { market: 'ca', language: 'en', prefix: '' })).toMatchObject({ rounding: true, adjustment: 0 })
    // the formats a market gives win
    const own = { ...data, markets: [{ ...data.markets![0], currency: { ...data.markets![0].currency, money_format: 'US${{amount}}', money_with_currency_format: 'US${{amount}} USD' } }] } // eslint-disable-line no-template-curly-in-string
    expect(currencyOf(own, { market: 'us', language: 'en', prefix: '' })).toMatchObject({ money_format: 'US${{amount}}', money_with_currency_format: 'US${{amount}} USD' }) // eslint-disable-line no-template-curly-in-string
    expect(marketOf(data, 'ca')?.handle).toBe('ca')
    expect(marketOf(data, 'nowhere')?.handle).toBe('us')
  })

  it('lists the market\'s languages as the shop\'s published locales and each distinct currency once, by code', async () => {
    const html = await renderUrl('/en-ca', '{{ shop.published_locales | map: "iso_code" | join: "," }}|{{ shop.published_locales | map: "root_url" | join: "," }}|{{ shop.enabled_currencies | map: "iso_code" | join: "," }}|{{ shop.enabled_currencies[0].symbol }}')
    expect(html).toBe('en,fr|/en-ca,/fr-ca|CAD,EUR,USD|$')
  })

  it('prints the shopper\'s currency, country and language in the header, as the parity store does', async () => {
    // recordings `page-home`, `page-home-fr-ca` and `page-product-en-eu`: the currency's rate is a string
    const globals = (html: string) => html.match(/Shopify\.locale = .*?Shopify\.country = "[A-Z]+";/)![0]
    expect(globals(await renderUrl('/', HEADER))).toBe('Shopify.locale = "en";Shopify.currency = {"active":"USD","rate":"1.0"};Shopify.country = "US";')
    expect(globals(await renderUrl('/fr-ca', HEADER))).toBe('Shopify.locale = "fr";Shopify.currency = {"active":"CAD","rate":"1.35"};Shopify.country = "CA";')
    expect(globals(await renderUrl('/en-eu/products/hoodie', HEADER))).toBe('Shopify.locale = "en";Shopify.currency = {"active":"EUR","rate":"0.92"};Shopify.country = "DE";')
    expect(globals(await renderUrl('/en-eu/products/hoodie', HEADER, data, { country: 'IT' }))).toContain('Shopify.country = "IT";')
  })

  it('does not keep a shopper\'s country for the next page of the market', async () => {
    const layout = '{{ localization.country.iso_code }}|{{ localization.country.name }}'
    expect(await renderUrl('/en-eu', layout)).toBe('DE|Germany')
    expect(await renderUrl('/en-eu', layout, data, { country: 'IT' })).toBe('IT|Italy')
    expect(await renderUrl('/en-eu', layout)).toBe('DE|Germany')
    // a country of another market is not the shopper's in this one, and leaves the default
    expect(await renderUrl('/en-eu', layout, data, { country: 'US' })).toBe('DE|Germany')
    expect(await renderUrl('/en-eu', layout, data, { country: 'IT' })).toBe('IT|Italy')
    expect(buildStore(data, { market: 'eu', language: 'en', prefix: '/en-eu' }).localization).toMatchObject({ country: { iso_code: 'DE' } })
  })

  it('prints the market formats through the money filters', async () => {
    const layout = '{{ 123456 | money }}|{{ 123456 | money_with_currency }}|{{ 123456 | money_without_currency }}|{{ shop.money_format }}|{{ cart.currency.iso_code }}'
    expect(await renderUrl('/', layout)).toBe('$1,234.56|$1,234.56 USD|1,234.56|${{amount}}|USD') // eslint-disable-line no-template-curly-in-string
    // `shop.money_format` is the market currency's too (recording `page-product-en-eu`: `€{{amount_with_comma_separator}}`); this test pinned the shop's `${{amount}}` before that recording was compared
    expect(await renderUrl('/fr-eu', layout)).toBe('€1.234,56|€1.234,56 EUR|1.234,56|€{{amount_with_comma_separator}}|EUR')
  })

  describe('hreflang links', () => {
    it('lists every market and language, as the parity store\'s home pages do', async () => {
      expect(hreflangs(await renderUrl('/', HEADER))).toEqual(HOME_LINKS)
      expect(hreflangs(await renderUrl('/fr-ca', HEADER))).toEqual(HOME_LINKS)
      const html = await renderUrl('/', HEADER)
      expect(html).toContain(`<link rel="alternate" hreflang="x-default" href="${ORIGIN}/">\n<link rel="alternate" hreflang="en" href="${ORIGIN}/">\n<link rel="alternate" hreflang="en-CA" href="${ORIGIN}/en-ca">\n`)
      expect(html.indexOf('hreflang="x-default"')).toBeLessThan(html.indexOf('<script>var Shopify'))
    })

    it('points each link at the same page in that market and language, without the query but a search\'s', async () => {
      // recordings `page-product-en-eu`, `page-product-variant`, `page-collection-filtered` and `page-search`: a variant, a filter or a sort is not in the link, the search term is (they follow the page's canonical URL)
      const at = (path: string) => HOME_LINKS.map(([lang, root]) => [lang, `${root === '/' ? '' : root}${path}`])
      expect(hreflangs(await renderUrl('/en-eu/products/hoodie', HEADER))).toEqual(at('/products/hoodie'))
      expect(hreflangs(await renderUrl('/products/hoodie?variant=67774841192747', HEADER))).toEqual(at('/products/hoodie'))
      expect(hreflangs(await renderUrl('/fr-ca/collections/all?filter.v.availability=1&sort_by=price-ascending', HEADER))).toEqual(at('/collections/all'))
      expect(hreflangs(await renderUrl('/search?q=shirt', HEADER))).toEqual(at('/search?q=shirt'))
    })

    it('puts the base path before every link', async () => {
      const links = hreflangs(await renderUrl('/p/tok/fr-ca/products/hoodie', HEADER, data, { basePath: '/p/tok' }))
      expect(links.slice(0, 4)).toEqual([['x-default', '/p/tok/products/hoodie'], ['en', '/p/tok/products/hoodie'], ['en-CA', '/p/tok/en-ca/products/hoodie'], ['fr-CA', '/p/tok/fr-ca/products/hoodie']])
      expect(hreflangs(await renderUrl('/p/tok', HEADER, data, { basePath: '/p/tok' }))[0]).toEqual(['x-default', '/p/tok'])
    })

    it('prints none on the 404 page, and none for a store of one market and one language', async () => {
      expect(hreflangs(await renderUrl('/nowhere', HEADER))).toEqual([])
      expect(await renderUrl('/', HEADER, sampleStoreData)).not.toContain('hreflang')
      expect(await renderUrl('/', HEADER, { shop: { name: 'One', domain: 'one.example', currency: 'USD' } })).not.toContain('hreflang')
    })

    it('escapes the search term', async () => {
      const html = await renderUrl('/search?q=a"b%3Cc\'d+e', HEADER)
      expect(html).toContain('hreflang="x-default" href="' + ORIGIN + '/search?q=a%22b%3Cc%27d+e">')
    })
  })

  describe('names the runtime cannot give', () => {
    const view = { market: 'eu', language: 'fr', prefix: '/fr-eu' }
    const names = (store: StoreData, v: StoreView) => ((buildLocalization(store, v) as any).available_countries as any[]).map(c => c.name)

    it('keeps the dataset\'s name for a malformed country code instead of failing the render', async () => {
      const typo: StoreData = { ...data, markets: data.markets!.map(m => m.handle === 'eu' ? { ...m, countries: [...m.countries, { iso_code: 'DEU', name: 'Germany (typo)' }] } : m) }
      expect(names(typo, view)).toContain('Germany (typo)')
      expect(names(typo, view)).toContain('Allemagne')
      expect(await renderUrl('/fr-eu', '{{ localization.available_countries.size }}', typo)).toBe('8')
    })

    it('names a language it cannot by the dataset\'s name, or by its code when the dataset has none', () => {
      const odd: StoreData = { ...data, markets: data.markets!.map(m => m.handle === 'eu' ? { ...m, languages: ['en', 'fr', 'xx', 'not a code!', ''] } : m) }
      const languages = ((buildLocalization(odd, view) as any).available_languages as any[]).map(l => [l.iso_code, l.name])
      // `xx` is well formed and unknown: `Intl` hands the code back; the others are not codes at all, and `of` throws on them
      expect(languages).toEqual([['en', 'anglais'], ['fr', 'français'], ['xx', 'xx'], ['not a code!', 'not a code!'], ['', '']])
    })

    it('keeps the dataset\'s names, and its order, in a language the runtime has no names for', () => {
      const store: StoreData = {
        shop: { name: 'Zz', domain: 'zz.example', currency: 'EUR', locale: 'de' },
        markets: [{ handle: 'x', name: 'X', primary: true, countries: [{ iso_code: 'DE', name: 'Deutschland' }, { iso_code: 'AT', name: 'Österreich' }, { iso_code: 'CH', name: 'Schweiz' }], currency: { iso_code: 'EUR', symbol: '€', rate: 1 }, languages: ['de', 'zz'] }],
        languages: [{ iso_code: 'de', name: 'Deutsch', endonym_name: 'Deutsch' }, { iso_code: 'zz', name: 'Zzish', endonym_name: 'Zzish' }]
      }
      const zz = buildLocalization(store, { market: 'x', language: 'zz', prefix: '/zz' }) as any
      // `Intl.DisplayNames` and `Intl.Collator` settle on English for `zz`; the dataset's German names stand, in the order of their characters
      expect(zz.available_countries.map((c: any) => c.name)).toEqual(['Deutschland', 'Schweiz', 'Österreich'])
      expect(zz.available_languages.map((l: any) => [l.iso_code, l.name, l.root_url])).toEqual([['de', 'Deutsch', '/'], ['zz', 'Zzish', '/zz']])
      expect(zz.language).toMatchObject({ iso_code: 'zz', name: 'Zzish', primary: false })
    })

    it('renders when the view\'s language is not a locale at all', async () => {
      const store: StoreData = { ...data, languages: [...data.languages!, { iso_code: 'fr_CA', name: 'Canadian French', endonym_name: 'français canadien' }], markets: data.markets!.map(m => m.handle === 'ca' ? { ...m, languages: ['en', 'fr_CA'] } : m) }
      const html = await renderUrl('/fr_CA-ca', '{{ localization.available_countries | map: "name" | join: "," }}', store)
      expect(html).toContain('Canada')
    })
  })

  describe('the language of the page', () => {
    const request = { market: 'ca', language: 'fr', localePrefix: '/fr-ca' }
    const printed = '{{ request.locale.iso_code }}|{{ request.locale.name }}|{{ request.locale.primary }}|{{ request.locale.root_url }}|{{ localization.language.iso_code }}'
    const render = async (layout: string, options: { locale?: string, request?: any }) => (await renderPage({ theme: layoutTheme(layout), templateName: 'index', data, ...options })).html

    it('follows the language the request names, whatever the locale option says', async () => {
      expect(await render(printed, { request })).toBe('fr|français|false|/fr-ca|fr')
      expect(await render(printed, { request, locale: 'en' })).toBe('fr|français|false|/fr-ca|fr')
      expect(await render(`${HEADER}`, { request, locale: 'en' })).toContain('Shopify.locale = "fr";')
      expect(await render(`${HEADER}`, { request })).toContain('Shopify.locale = "fr";')
    })

    it('follows the locale option when the request names no language', async () => {
      expect(await render(printed, { locale: 'fr' })).toBe('fr|French|false|/|en')
      expect(await render(printed, {})).toBe('en|English|true|/|en')
      expect(await render(HEADER, { locale: 'fr' })).toContain('Shopify.locale = "fr";')
    })

    it('needs the store data to resolve the market or language a request names', () => {
      const globals = (request: any, withData = false) => buildGlobals({ store: buildStore(data), ...(withData ? { data } : {}), templateName: 'index', request, locale: 'en', report: new ReportCollector() })
      expect(() => globals({ market: 'ca' })).toThrow('pass the `data` the store was built from')
      expect(() => globals({ language: 'fr' })).toThrow('pass the `data` the store was built from')
      expect(() => globals({ market: 'ca', language: 'fr' }, true)).not.toThrow()
      expect(() => globals({})).not.toThrow()
    })
  })

  describe('a store of its own', () => {
    it('resolves the localization of the store being rendered, not the sample store\'s', async () => {
      const layout = '{{ localization.market.handle }}|{{ localization.country.iso_code }}|{{ localization.country.name }}|{{ localization.language.iso_code }}|{{ localization.language.name }}|{{ localization.language.root_url }}|{{ localization.available_languages | map: "root_url" | join: "," }}|{{ localization.available_countries | map: "iso_code" | join: "," }}|{{ 1999 | money_with_currency }}|{{ cart.currency.iso_code }}|{{ request.locale.iso_code }}|{{ request.locale.name }}|{{ request.locale.primary }}'
      expect(await renderUrl('/', layout, other)).toBe('uk|GB|United Kingdom|en|English|/|/|AT,DE,GB|£19.99 GBP|GBP|en|English|true')
      expect(await renderUrl('/de-de', layout, other)).toBe('de|AT|Österreich|de|Deutsch|/de-de|/de-de,/en-de|DE,AT,GB|€19,99 EUR|EUR|de|Deutsch|false')
      expect(await renderUrl('/en-de', layout, other)).toBe('de|AT|Austria|en|English|/en-de|/de-de,/en-de|AT,DE,GB|€19,99 EUR|EUR|en|English|true')
      const header = await renderUrl('/de-de', HEADER, other)
      expect(header).toContain('Shopify.locale = "de";Shopify.currency = {"active":"EUR","rate":"1.17"};Shopify.country = "AT";')
    })

    it('reads the data it is given where the page globals are built', () => {
      const request = requestFromUrl('/de-de/pages/about', other).request
      const view = resolveView(other, request)
      const { globals } = buildGlobals({ store: buildStore(other, view), data: other, templateName: 'page', request, locale: 'de', report: new ReportCollector() })
      expect((globals.localization as any).market).toMatchObject({ handle: 'de' })
      expect((globals.localization as any).country.iso_code).toBe('AT')
      expect((globals.cart as any).currency.iso_code).toBe('EUR')
    })

    it('keeps the sample store as it was', async () => {
      const layout = '{{ localization.market.handle }}|{{ localization.country.iso_code }}|{{ localization.country.name }}|{{ localization.country.unit_system }}|{{ localization.country.currency.iso_code }}|{{ localization.language.iso_code }}|{{ localization.language.root_url }}|{{ localization.language.primary }}|{{ localization.available_countries.size }}|{{ localization.available_languages.size }}|{{ 1999 | money_with_currency }}|{{ cart.currency.iso_code }}'
      expect(await renderUrl('/', layout, sampleStoreData)).toBe('default|US|United States|metric|USD|en|/|true|1|1|$19.99 USD|USD')
    })

    it('renders the legacy localization of a store without markets as it did before markets', async () => {
      // the shop is a dollar shop in English; the data says the country is France, the currency euros and the language French. The country, its currency and the language come from that data, the money, the cart and the header's currency stay the shop's, and the page's locale stays the shop's, named after the data's language
      const legacy: StoreData = { ...sampleStoreData, localization: { country: { iso_code: 'FR', name: 'France', currency: { iso_code: 'EUR', symbol: '€' } }, language: { iso_code: 'fr', name: 'Français' } } }
      const layout = '{{ localization.language.iso_code }}|{{ localization.language.name }}|{{ localization.language.endonym_name }}|{{ localization.language.primary }}|{{ localization.language.root_url }}|{{ localization.country.iso_code }}|{{ localization.country.name }}|{{ localization.country.currency.iso_code }}|{{ localization.country.currency.symbol }}|{{ localization.available_countries.size }}|{{ localization.market.handle }}|{{ request.locale.iso_code }}|{{ request.locale.name }}|{{ request.locale.primary }}|{{ cart.currency.iso_code }}|{{ 1999 | money_with_currency }}|{{ shop.currency }}'
      expect(await renderUrl('/', layout, legacy)).toBe('fr|Français|Français|true|/|FR|France|EUR|€|1|default|en|Français|false|USD|$19.99 USD|USD')
      expect(await renderUrl('/', HEADER, legacy)).toContain('Shopify.locale = "en";Shopify.currency = {"active":"USD","rate":"1.0"};Shopify.country = "FR";')
      expect(await renderUrl('/', '{{ localization.available_countries[0].name }}|{{ localization.available_languages[0].name }}', { ...legacy, shop: { ...legacy.shop, locale: 'fr' } })).toBe('France|Français')
    })
  })

  describe('an order in a market\'s view (final review B, M6)', () => {
    // an order's lines are priced by the view, and so are its shipping, tax, refund and payments, converted like the rest of the view's amounts: the shipping like a rate (rounded up where the market rounds), the others at the market's rate
    const hoodie = data.products!.find(product => product.handle === 'hoodie')!
    const order = {
      id: 5,
      order_number: 1005,
      created_at: '2026-01-01T00:00:00Z',
      line_items: [{ product_handle: 'hoodie', variant_id: hoodie.variants[0].id, quantity: 1 }],
      shipping_methods: [{ title: 'Standard', price: 1000 }],
      tax_lines: [{ title: 'Sales tax', rate: 0.1, price: 900 }],
      total_refunded_amount: 1000,
      transactions: [{ id: 1, amount: 10900, kind: 'sale', status: 'success', gateway: 'bogus', created_at: '2026-01-01T00:00:00Z' }]
    }
    const withOrder: StoreData = { ...data, customer: { id: 1, email: 'a@example.com', orders: [order] } }
    const totals = (market: string) => {
      const built = buildStore(withOrder, resolveView(withOrder, { market })).customer as any
      const placed = built.orders[0]
      return [placed.line_items[0].price, placed.shipping_price, placed.tax_price, placed.total_price, placed.total_refunded_amount, placed.total_net_amount, placed.transactions[0].amount, built.total_spent]
    }
    it('keeps the shop\'s amounts in the primary view', () => {
      expect(totals('us')).toEqual([9000, 1000, 900, 10900, 1000, 9900, 10900, 9900])
    })
    it('converts them all into the currency of the view, so that the total adds the same currency: 90.00 USD is 122.00 CAD, 10.00 of shipping 14.00, 9.00 of tax 12.15', () => {
      // 12200 + 1400 + 1215 = 14815; 1000 refunded is 1350
      expect(totals('ca')).toEqual([12200, 1400, 1215, 14815, 1350, 13465, 14715, 13465])
    })
  })
})
