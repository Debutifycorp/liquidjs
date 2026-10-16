import { createShopifyLiquid, renderLiquid, Translator } from '../../../src/shopify'
import type { LocaleTree } from '../../../src/shopify'
import { createState, STATE } from '../../../src/shopify/state'
import { renderWithState } from '../../../src/shopify/render-liquid'

const en: LocaleTree = {
  layout: { header: { hello_user: 'Hello {{ name }}!', announcement_html: 'Spend $50 and get <strong>{{ what }}</strong>', rock: 'Rock & Roll', price: 'Cost {{ p }}', price_html: 'Cost <b>{{ p }}</b>' } },
  customers: { orders: { order_count: { one: "You've made {{ count }} order with us", other: "You've made {{ count }} orders with us" } } },
  cart: { items: { zero: 'Your cart is empty', one: '{{ count }} item', other: '{{ count }} items' } },
  date_formats: { month_day_year: '%B %d, %Y' }
}
const fr: LocaleTree = { layout: { header: { hello_user: 'Bonjour {{ name }} !' } }, cart: { items: { one: '{{ count }} article', other: '{{ count }} articles' } } }
const translator = (locale: string) => new Translator({ locale, defaultLocale: 'en', locales: { en, fr }, schemaLocales: { en: { sections: { header: { name: 'Header' } } } } })

const liquid = createShopifyLiquid({ moneyFormat: '${{amount}}', moneyWithCurrencyFormat: '${{amount}} CAD' }) // eslint-disable-line no-template-curly-in-string
const render = async (source: string, scope: object = {}, locale = 'en') => (await renderWithState(liquid, source, scope, { translator: translator(locale), services: { currentTime: () => new Date('2026-10-09T12:00:00Z') } })).html

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
  it('leaves the whole output of an _html key unescaped, its values included', async () => {
    expect(await render("{{ 'layout.header.announcement_html' | t: what: '<b>FREE</b>' }}")).toBe('Spend $50 and get <strong><b>FREE</b></strong>')
    expect(await render("{% capture link %}<a href=\"/x\">X</a>{% endcapture %}{{ 'layout.header.announcement_html' | t: what: link }}")).toBe('Spend $50 and get <strong><a href="/x">X</a></strong>')
  })
  it('escapes the whole output of any other key, its values included', async () => expect(await render("{{ 'layout.header.hello_user' | t: name: '<b>Jo</b>' }}")).toBe('Hello &lt;b&gt;Jo&lt;/b&gt;!'))
  it('reports a missing key', async () => {
    const { html, report } = await renderWithState(liquid, "{{ 'nope.key' | t }}", {}, { translator: translator('en') })
    expect(html).toBe('translation missing: en.nope.key')
    expect(report.missing).toEqual([{ kind: 'translation', name: 'nope.key' }])
  })
  it('reads section schema locales for sections.<type> keys', async () => {
    const state = createState({ translator: translator('fr') })
    state.frames.push({ kind: 'section', section: { id: 's', type: 'slideshow', index: 1, locales: { en: { title: 'Slideshow' }, fr: { title: 'Diaporama' } } }, container: {}, sectionObject: {} })
    const html = await liquid.parseAndRender("{{ 'sections.slideshow.title' | t }}", {}, { globals: { [STATE]: state } })
    expect(html).toBe('Diaporama')
  })
  it('escapes the text for a missing key, which can come from data', async () => {
    const { html, report } = await renderWithState(liquid, '{{ title | t }}', { title: '<b>x</b>' }, { translator: translator('en') })
    expect(html).toBe('translation missing: en.&lt;b&gt;x&lt;/b&gt;')
    expect(report.missing).toEqual([{ kind: 'translation', name: 'bx/b' }])
  })
  it('prints a Ruby decimal as Ruby does', async () => {
    expect(await render("{{ 'layout.header.price' | t: p: 10.0 }}|{{ 'layout.header.price' | t: p: 10 }}|{{ 'layout.header.price_html' | t: p: 2.50 }}")).toBe('Cost 10.0|Cost 10|Cost <b>2.5</b>')
  })
  it('pluralises with a Ruby decimal count', async () => {
    expect(await render("{{ 'cart.items' | t: count: 1.0 }}|{{ 'cart.items' | t: count: 2.0 }}|{{ 'cart.items' | t: count: 0.0 }}")).toBe('1.0 item|2.0 items|Your cart is empty')
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
  // where shopify.dev is silent: liquid-spec's reference money filter (`cents.to_i / 100.0`)
  it('drops a fraction of a cent and prints no sign for zero', async () => {
    expect(await render('{{ 1999.9 | money }}|{{ -0.4 | money }}|{{ -0.4 | money_without_trailing_zeros }}|{{ -40 | money_without_trailing_zeros }}|{{ 0 | money }}')).toBe('$19.99|$0.00|$0|$-0.40|$0.00')
    expect(await render('{{ -150 | money }}|{{ -1000 | money_without_trailing_zeros }}')).toBe('$-1.50|$-10')
  })
  it('reads Ruby decimals', async () => {
    expect(await render('{{ 1000.0 | money }}|{{ 1999 | times: 0.9 | money }}|{{ 1000 | divided_by: 3.0 | money }}|{{ 1999.9 | money_without_trailing_zeros }}')).toBe('$10.00|$17.99|$3.33|$19.99')
  })
  it('reads a string as Ruby to_i does', async () => expect(await render("{{ '1000' | money }}|{{ ' 1050abc' | money }}|{{ 'abc' | money }}|{{ '' | money }}|{{ '12.9' | money }}")).toBe('$10.00|$10.50|$0.00|$0.00|$0.12'))
  it('prints nothing for what has no to_i, and reports it', async () => {
    const { html, report } = await renderWithState(liquid, '[{{ flag | money }}][{{ list | money_with_currency }}][{{ shape | money }}]', { flag: true, list: [5], shape: { a: 1 } }, { translator: translator('en') })
    expect(html).toBe('[][][]')
    expect(report.unsupported).toEqual([{ feature: 'money_input', detail: 'true' }, { feature: 'money_input', detail: 'array' }, { feature: 'money_input', detail: 'object' }])
  })
  it('drops the decimal separator of comma formats with the zeros', async () => {
    const engine = createShopifyLiquid({ moneyFormat: '{{amount_with_comma_separator}} EUR' })
    expect((await renderLiquid(engine, '{{ 100000 | money_without_trailing_zeros }}|{{ 100010 | money_without_trailing_zeros }}|{{ 100010 | money }}')).html).toBe('1.000 EUR|1.000,10 EUR|1.000,10 EUR')
  })
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
  // as the parity store renders it (scenario `page-home`, the shop name linked to `routes.root_url`): a link to a page of the shop carries no `rel`, where the page's external examples above carry `rel="nofollow"`
  it('links to a page of the shop without rel nofollow', async () => {
    expect(await render("{{ 'Debutify Parity' | link_to: routes.root_url }}", { routes: { root_url: '/' } })).toBe('<a href="/" title="">Debutify Parity</a>')
    expect(await render("{{ 'Hoodie' | link_to: '/fr-ca/products/hoodie', class: 'link-class' }}")).toBe('<a class="link-class" href="/fr-ca/products/hoodie">Hoodie</a>')
    expect(await render("{{ 'Hoodie' | link_to: '/products/hoodie', 'My title' }}")).toBe('<a href="/products/hoodie" title="My title">Hoodie</a>')
    expect(await render("{{ 'Top' | link_to: '#top' }}")).toBe('<a href="#top" title="">Top</a>')
    expect(await render("{{ 'Shopify' | link_to: '//www.shopify.com' }}")).toBe('<a href="//www.shopify.com" title="" rel="nofollow">Shopify</a>')
  })
  it('escapes once the page input with a bare ampersand', async () => expect(await render(`{{ "&lt;p&gt;Text to be escaped.&lt;/p&gt; & some additional text" | escape_once }}`)).toBe('&lt;p&gt;Text to be escaped.&lt;/p&gt; &amp; some additional text'))
  it('links with a title and with a Ruby decimal attribute', async () => {
    expect(await render("{{ 'Shopify' | link_to: 'https://www.shopify.com', 'My title' }}")).toBe('<a href="https://www.shopify.com" title="My title" rel="nofollow">Shopify</a>')
    expect(await render("{{ 'Shopify' | link_to: 'https://www.shopify.com', width: 10.0, height: 10 }}")).toBe('<a width="10.0" height="10" href="https://www.shopify.com" rel="nofollow">Shopify</a>')
  })
  it('pluralizes by the count as an integer', async () => expect(await render("{{ 1.0 | pluralize: 'item', 'items' }} {{ 2.0 | pluralize: 'item', 'items' }} {{ 0 | pluralize: 'item', 'items' }} {{ 1999 | divided_by: 1999.0 | pluralize: 'item', 'items' }}")).toBe('item items items item'))
  it('reads a fractional count as Ruby to_i does', async () => expect(await render("{{ 1.5 | pluralize: 'item', 'items' }} {{ 2.5 | pluralize: 'item', 'items' }} {{ -1 | pluralize: 'item', 'items' }}")).toBe('item items items'))
  it('groups a code that is not a multiple of four', async () => expect(await render("{{ 'abcdef' | format_code }}|{{ 'ab' | format_code }}|{{ 'abcd' | format_code }}")).toBe('abcd ef|ab|abcd'))
  // https://shopify.dev/docs/api/liquid/objects/address: name is a combination of the first and last names
  it('formats an address by its name, or by first and last name', async () => {
    expect(await render('{{ a | format_address }}', { a: { name: 'Jane Doe', address1: '1 Main', city: 'Ottawa', country: 'Canada' } })).toBe('<p>Jane Doe<br>1 Main<br>Ottawa<br>Canada</p>')
    expect(await render('{{ a | format_address }}', { a: { first_name: 'Jane', last_name: 'Doe', address1: '1 Main' } })).toBe('<p>Jane Doe<br>1 Main</p>')
    expect(await render('{{ a | format_address }}', { a: { name: 'Jane Doe', first_name: 'J', last_name: 'D' } })).toBe('<p>Jane Doe</p>')
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
  // as the parity store renders it (scenarios `page-blog`, `page-article`: `February 7, 2023`, with `format: 'date'`): the day is not padded. The shopify.dev examples above print `14` and cannot tell
  it('does not pad the day of the built-in formats', async () => {
    const scope = { article: { created_at: '2023-02-07 16:28:25 +0000' } }
    expect(await render("{{ article.created_at | time_tag: format: 'date' }}", scope)).toBe('<time datetime="2023-02-07T16:28:25Z">February 7, 2023</time>')
    expect(await render('{{ article.created_at | time_tag }}', scope)).toBe('<time datetime="2023-02-07T16:28:25Z">February 7, 2023</time>')
    expect(await render("{{ article.created_at | date: format: 'date' }}|{{ article.created_at | date: format: 'abbreviated_date' }}|{{ article.created_at | date: format: 'on_date' }}", scope)).toBe('February 7, 2023|Feb 7, 2023|on Feb 7, 2023')
    expect(await render("{{ article.created_at | date: format: 'date_at_time' }}|{{ article.created_at | date: format: 'default' }}", scope)).toBe('February 7, 2023 at 4:28 pm|Tue, Feb 7, 2023, 4:28 pm +0000')
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
  // https://shopify.dev/docs/storefronts/themes/architecture/locales/storefront-locale-files: a custom format missing from the locale file renders a Liquid error
  it('renders a Liquid error for a format name it does not know, and reports it', async () => {
    const message = "invalid date format 'no_such_format': it is not a built-in format and the locale file has no date_formats.no_such_format"
    for (const source of ["{{ '2022-04-14 16:56:02 -0400' | date: format: 'no_such_format' }}", "{{ '2022-04-14 16:56:02 -0400' | time_tag: format: 'no_such_format' }}"]) {
      const { html, report } = await renderWithState(liquid, source, {}, { translator: translator('en') })
      expect(html).toBe(`Liquid error (line 1): ${message}`)
      expect(report.errors).toEqual([{ message: `Liquid error (line 1): ${message}`, file: undefined, line: 1 }])
      expect(report.unsupported).toEqual([{ feature: 'date_format', detail: 'no_such_format' }])
    }
  })
  it('spaces the built-in formats with a time once', async () => {
    const scope = { article: { created_at: '2022-04-14 16:56:02 -0400' } }
    expect(await render("{{ article.created_at | date: format: 'date_at_time' }}", scope)).toBe('April 14, 2022 at 8:56 pm')
    expect(await render("{{ article.created_at | date: format: 'default' }}", scope)).toBe('Thu, Apr 14, 2022, 8:56 pm +0000')
    expect(await render("{{ '2022-04-14 03:04:05 -0000' | date: format: 'date_at_time' }}", scope)).toBe('April 14, 2022 at 3:04 am')
  })
  // zone-less strings in a configured zone with daylight saving time: the instant is the one the wall-clock time names in that zone, whatever the machine's zone. Only the instant (`%s`) is asserted: the wall-clock time the engine prints for a named zone comes from LiquidDate, which reads the zone through the machine's zone and so is itself off by an hour near a transition when the machine is in a daylight saving zone
  describe('a configured zone with daylight saving time', () => {
    const newYork = createShopifyLiquid({ engine: { timezoneOffset: 'America/New_York' } })
    it.each([
      ['just before spring forward', '2024-03-10 01:30:00', '2024-03-10T06:30:00Z'],
      ['inside the skipped hour, read after the gap', '2024-03-10 02:30:00', '2024-03-10T07:30:00Z'],
      ['just after spring forward', '2024-03-10 03:30:00', '2024-03-10T07:30:00Z'],
      ['hours after spring forward', '2024-03-10 06:30:00', '2024-03-10T10:30:00Z'],
      ['in the repeated hour, read as the first', '2024-11-03 01:30:00', '2024-11-03T05:30:00Z'],
      ['hours after fall back', '2024-11-03 05:30:00', '2024-11-03T10:30:00Z'],
      ['in winter', '2024-01-02T03:04:00', '2024-01-02T08:04:00Z'],
      ['in summer', 'Jul 2 2024 03:04:00', '2024-07-02T07:04:00Z']
    ])('reads a time %s', async (_name, input, utc) => expect((await renderLiquid(newYork, `{{ '${input}' | date: '%s' }}`)).html).toBe(String(Date.parse(utc) / 1000)))
    it('reads a time with an offset or a timestamp as it is', async () => {
      expect((await renderLiquid(newYork, "{{ '2024-03-10 06:30:00 -0400' | date: '%s' }}|{{ 1710066600 | date: '%s' }}")).html).toBe('1710066600|1710066600')
    })
  })
  it('reads a zone-less time_tag in UTC', async () => expect(await render("{{ '2024-01-02 03:04:05' | time_tag: '%H:%M' }}")).toBe('<time datetime="2024-01-02T03:04:05Z">03:04</time>'))
})
