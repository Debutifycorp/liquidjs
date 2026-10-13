import { createShopifyLiquid, renderLiquid, Translator, createState, STATE } from '../../../src/shopify'
import type { LocaleTree } from '../../../src/shopify'

const en: LocaleTree = {
  layout: { header: { hello_user: 'Hello {{ name }}!', announcement_html: 'Spend $50 and get <strong>{{ what }}</strong>', rock: 'Rock & Roll' } },
  customers: { orders: { order_count: { one: "You've made {{ count }} order with us", other: "You've made {{ count }} orders with us" } } },
  cart: { items: { zero: 'Your cart is empty', one: '{{ count }} item', other: '{{ count }} items' } },
  date_formats: { month_day_year: '%B %d, %Y' }
}
const fr: LocaleTree = { layout: { header: { hello_user: 'Bonjour {{ name }} !' } }, cart: { items: { one: '{{ count }} article', other: '{{ count }} articles' } } }
const translator = (locale: string) => new Translator({ locale, defaultLocale: 'en', locales: { en, fr }, schemaLocales: { en: { sections: { header: { name: 'Header' } } } } })

const liquid = createShopifyLiquid({ moneyFormat: '${{amount}}', moneyWithCurrencyFormat: '${{amount}} CAD' }) // eslint-disable-line no-template-curly-in-string
const render = async (source: string, scope: object = {}, locale = 'en') => (await renderLiquid(liquid, source, scope, { translator: translator(locale), services: { currentTime: () => new Date('2026-10-09T12:00:00Z') } })).html

describe('t', () => {
  // https://shopify.dev/docs/storefronts/themes/architecture/locales/storefront-locale-files
  it('interpolates', async () => expect(await render("{{ 'layout.header.hello_user' | t: name: 'Jane' }}")).toBe('Hello Jane!'))
  it('pluralises with count and escapes the result', async () => {
    expect(await render("{{ 'customers.orders.order_count' | t: count: 1 }}")).toBe('You&#39;ve made 1 order with us')
    expect(await render("{{ 'customers.orders.order_count' | t: count: 12 }}")).toBe('You&#39;ve made 12 orders with us')
  })
  it('prefers an explicit zero key', async () => expect(await render("{{ 'cart.items' | t: count: 0 }}")).toBe('Your cart is empty'))
  it('uses the locale plural rules', async () => expect(await render("{{ 'cart.items' | t: count: 0 }}", {}, 'fr')).toBe('0 article'))
  it('falls back to the default locale', async () => expect(await render("{{ 'layout.header.rock' | t }}", {}, 'fr')).toBe('Rock &amp; Roll'))
  it('reads the requested locale first', async () => expect(await render("{{ 'layout.header.hello_user' | t: name: 'Jo' }}", {}, 'fr')).toBe('Bonjour Jo !'))
  it('leaves _html keys unescaped and escapes their values', async () => expect(await render("{{ 'layout.header.announcement_html' | t: what: '<b>FREE</b>' }}")).toBe('Spend $50 and get <strong>&lt;b&gt;FREE&lt;/b&gt;</strong>'))
  it('reports a missing key', async () => {
    const { html, report } = await renderLiquid(liquid, "{{ 'nope.key' | t }}", {}, { translator: translator('en') })
    expect(html).toBe('translation missing: en.nope.key')
    expect(report.missing).toEqual([{ kind: 'translation', name: 'nope.key' }])
  })
  it('reads section schema locales for sections.<type> keys', async () => {
    const state = createState({ translator: translator('fr') })
    state.frames.push({ kind: 'section', section: { id: 's', type: 'slideshow', index: 1, locales: { en: { title: 'Slideshow' }, fr: { title: 'Diaporama' } } }, container: {}, sectionObject: {} })
    const html = await liquid.parseAndRender("{{ 'sections.slideshow.title' | t }}", {}, { globals: { [STATE]: state } })
    expect(html).toBe('Diaporama')
  })
  it('resolves t: schema strings', () => expect(translator('en').schemaText('t:sections.header.name')).toBe('Header'))
})

describe('money', () => {
  // https://shopify.dev/docs/api/liquid/filters/money and its variants
  it('formats with the money format', async () => expect(await render('{{ 1000 | money }}')).toBe('$10.00'))
  it('formats with the money with currency format', async () => expect(await render('{{ 1000 | money_with_currency }}')).toBe('$10.00 CAD'))
  it('drops the currency symbol', async () => expect(await render('{{ 1000 | money_without_currency }}')).toBe('10.00'))
  it('drops trailing zeros', async () => expect(await render('{{ 1000 | money_without_trailing_zeros }}|{{ 1050 | money_without_trailing_zeros }}')).toBe('$10|$10.50'))
  it('renders nothing for nil', async () => expect(await render('[{{ nothing | money }}]')).toBe('[]'))
  // https://help.shopify.com/manual/international/pricing/currency-formatting
  it.each([
    ['{{amount}}', '1,134.65'],
    ['{{amount_no_decimals}}', '1,135'],
    ['{{amount_with_comma_separator}}', '1.134,65'],
    ['{{amount_no_decimals_with_comma_separator}}', '1.135'],
    ['{{amount_with_apostrophe_separator}}', "1'134.65"],
    ['{{amount_no_decimals_with_space_separator}}', '1 135'],
    ['{{amount_with_space_separator}}', '1 134,65'],
    ['{{amount_with_period_and_space_separator}}', '1 134.65']
  ])('formats %s', async (format, expected) => {
    const engine = createShopifyLiquid({ moneyFormat: format })
    expect((await renderLiquid(engine, '{{ 113465 | money }}')).html).toBe(expected)
  })
})

describe('text filters', () => {
  it('escapes as Ruby does', async () => expect(await render(`{{ '<a href="x">Tom\\'s</a>' | escape }}`)).toBe('&lt;a href=&quot;x&quot;&gt;Tom&#39;s&lt;/a&gt;'))
  it('escapes once', async () => expect(await render("{{ '&amp; < &' | escape_once }}")).toBe('&amp; &lt; &amp;'))
  // https://shopify.dev/docs/api/liquid/filters/handleize
  it('handleizes', async () => expect(await render("{{ 'Health potion' | handleize }} {{ \"It's a (Test)\" | handle }}")).toBe('health-potion its-a-test'))
  // https://shopify.dev/docs/api/liquid/filters/pluralize
  it('pluralizes', async () => expect(await render("{{ 2 | pluralize: 'item', 'items' }} {{ 1 | pluralize: 'item', 'items' }}")).toBe('items item'))
  // https://shopify.dev/docs/api/liquid/filters/link_to
  it('links', async () => {
    expect(await render("{{ 'Shopify' | link_to: 'https://www.shopify.com' }}")).toBe('<a href="https://www.shopify.com" title="" rel="nofollow">Shopify</a>')
    expect(await render("{{ 'Shopify' | link_to: 'https://www.shopify.com', class: 'link-class' }}")).toBe('<a class="link-class" href="https://www.shopify.com" rel="nofollow">Shopify</a>')
  })
  // https://shopify.dev/docs/api/liquid/filters/within
  it('puts a product url within a collection', async () => expect(await render('{{ product.url | within: collection }}', { product: { url: '/products/draught-of-immortality' }, collection: { url: '/collections/sale-potions' } })).toBe('/collections/sale-potions/products/draught-of-immortality'))
  // https://shopify.dev/docs/api/liquid/filters/time_tag
  it('renders time tags', async () => {
    const scope = { article: { created_at: '2022-04-14 16:56:02 -0400' } }
    expect(await render("{{ article.created_at | time_tag: '%B %d, %Y' }}", scope)).toBe('<time datetime="2022-04-14T20:56:02Z">April 14, 2022</time>')
    expect(await render("{{ article.created_at | time_tag: format: 'abbreviated_date' }}", scope)).toBe('<time datetime="2022-04-14T20:56:02Z">Apr 14, 2022</time>')
    expect(await render("{{ article.created_at | time_tag: '%B %d, %Y', datetime: '%Y-%m-%d' }}", scope)).toBe('<time datetime="2022-04-14">April 14, 2022</time>')
    expect(await render("{{ article.created_at | time_tag: format: 'month_day_year' }}", scope)).toBe('<time datetime="2022-04-14T20:56:02Z">April 14, 2022</time>')
  })
  // https://shopify.dev/docs/api/liquid/filters/date: 'now' and 'today' output the current timestamp
  it('reads now from the clock service', async () => {
    const clocked = createShopifyLiquid({ services: { currentTime: () => new Date(Date.UTC(2001, 1, 3)) } })
    expect((await renderLiquid(clocked, "{{ 'now' | date: '%Y-%m-%d' }}")).html).toBe('2001-02-03')
    expect((await renderLiquid(clocked, "{{ 'today' | date: '%Y-%m-%d' }}")).html).toBe('2001-02-03')
  })
  // https://shopify.dev/docs/api/liquid/filters/format_address
  it('formats an address', async () => expect(await render('{{ shop.address | format_address }}', { shop: { address: { company: "Polina's Potions, LLC", address1: '150 Elgin Street', address2: '8th floor', city: 'Ottawa', province_code: 'ON', zip: 'K2P 1L4', country: 'Canada' } } })).toBe('<p>Polina&#39;s Potions, LLC<br>150 Elgin Street<br>8th floor<br>Ottawa ON K2P 1L4<br>Canada</p>'))
  // https://shopify.dev/docs/api/liquid/filters/item_count_for_variant
  it('counts a variant in the cart', async () => expect(await render('{{ cart | item_count_for_variant: 39888235757633 }}', { cart: { items: [{ variant_id: 39888235757633, quantity: 1 }, { variant_id: 2, quantity: 5 }] } })).toBe('1'))
  it('has no default errors to show', async () => expect(await render('[{{ form.errors | default_errors }}]')).toBe('[]'))
  it('groups gift card codes', async () => expect(await render("{{ 'ABCDEFGHIJKLMNOP' | format_code }}")).toBe('ABCD EFGH IJKL MNOP'))
})

describe('date', () => {
  // https://shopify.dev/docs/api/liquid/filters/date: strftime formats; the page's example input carries a zone ("2022-04-14 16:56:02 -0400") and says nothing about how a string without one is read, so it is read in the preset's zone (UTC) and the output does not depend on the machine's time zone
  it.each([
    ['2024-01-02 03:04:05'],
    ['2024-01-02T03:04:05'],
    ['2024-01-02T03:04:05.000'],
    ['2024/01/02 03:04:05'],
    ['Jan 2 2024 03:04:05'],
    ['Tue, 02 Jan 2024 03:04:05']
  ])('reads the zone-less string %s in UTC', async (input) => {
    expect(await render(`{{ '${input}' | date: '%Y-%m-%d %H:%M:%S %Z' }}`)).toBe('2024-01-02 03:04:05 UTC')
  })
  it('reads a zone-less string in the configured zone, and in one given as the second argument', async () => {
    const newYork = createShopifyLiquid({ engine: { timezoneOffset: 'America/New_York' } })
    expect((await renderLiquid(newYork, "{{ '2024-01-02 03:04:05' | date: '%H:%M' }}|{{ '2024-07-02 03:04:05' | date: '%H:%M' }}")).html).toBe('03:04|03:04')
    expect((await renderLiquid(newYork, "{{ '2024-01-02T03:04:05Z' | date: '%H:%M' }}")).html).toBe('22:04')
    expect(await render("{{ '2024-07-02 03:04:05' | date: '%H:%M', 'America/New_York' }}")).toBe('03:04')
  })
  it('reads a date-only string as midnight UTC', async () => expect(await render("{{ '2024-01-02' | date: '%Y-%m-%d %H:%M' }}")).toBe('2024-01-02 00:00'))
  it('keeps the zone a string carries', async () => {
    expect(await render("{{ '2022-04-14 16:56:02 -0400' | date: '%Y-%m-%d %H:%M:%S' }}")).toBe('2022-04-14 20:56:02')
    expect(await render("{{ '2022-04-14T16:56:02Z' | date: '%H:%M:%S' }}")).toBe('16:56:02')
    expect(await render("{{ '2022-04-14T16:56:02+05:30' | date: '%H:%M:%S' }}")).toBe('11:26:02')
    expect(await render("{{ '2022-04-14 16:56:02 UTC' | date: '%H:%M:%S' }}")).toBe('16:56:02')
    expect(await render("{{ '2022-04-14 16:56:02 EST' | date: '%H:%M:%S' }}")).toBe('21:56:02')
  })
  it('formats a timestamp in seconds', async () => {
    expect(await render("{{ 1700000000 | date: '%Y-%m-%d %H:%M:%S' }}")).toBe('2023-11-14 22:13:20')
    expect(await render("{{ '1700000000' | date: '%Y-%m-%d %H:%M:%S' }}")).toBe('2023-11-14 22:13:20')
  })
  it('prints what is not a date as it is', async () => expect(await render("{{ 'not a date' | date: '%Y' }}")).toBe('not a date'))
  it('renders nil as nothing', async () => expect(await render("[{{ nothing | date: '%Y' }}]")).toBe('[]'))
  it('leaves the root entry alone', async () => {
    const { Liquid } = await import('../../../src')
    expect(new Liquid().filters.date).not.toBe(liquid.filters.date)
    expect(new Liquid().filters.escape).not.toBe(liquid.filters.escape)
  })
  // https://shopify.dev/docs/api/liquid/filters/date: format: 'abbreviated_date' prints "Apr 14, 2022" for the page's article; a theme's date_formats win
  it('formats by name', async () => {
    const scope = { article: { created_at: '2022-04-14 16:56:02 -0400' } }
    expect(await render("{{ article.created_at | date: format: 'abbreviated_date' }}", scope)).toBe('Apr 14, 2022')
    expect(await render("{{ article.created_at | date: format: 'month_day_year' }}", scope)).toBe('April 14, 2022')
    expect(await render("{{ article.created_at | date: '%B %d, %Y' }}", scope)).toBe('April 14, 2022')
  })
  it('reports a format name it does not know', async () => {
    const { html, report } = await renderLiquid(liquid, "{{ '2022-04-14 16:56:02 -0400' | date: format: 'no_such_format' }}", {}, { translator: translator('en') })
    expect(html).toBe('April 14, 2022')
    expect(report.unsupported).toEqual([{ feature: 'date format', detail: 'no_such_format' }])
  })
  it('reads a zone-less time_tag in UTC', async () => expect(await render("{{ '2024-01-02 03:04:05' | time_tag: '%H:%M' }}")).toBe('<time datetime="2024-01-02T03:04:05Z">03:04</time>'))
})
