import { createShopifyLiquid, ImageDrop, renderPage, requestFromUrl, storefrontSampleData } from '../../../src/shopify'
import type { CartState, ThemeInput } from '../../../src/shopify'
import { filterStatus } from '../../../src/shopify/filters'
import { renderWithState } from '../../../src/shopify/render-liquid'

// The filters Horizon, Dawn and Debutify's theme use that 1.2 left as stubs. Each expected string is the page's example on shopify.dev cited above its test, or the parity store's recording of Horizon or Dawn (private parity recordings, named in the filter's comment) with the sample data's ids and hosts in place of the parity store's.
const ORIGIN = 'https://shop.example'
const data = storefrontSampleData
const product = (handle: string) => data.products!.find(entry => entry.handle === handle)!

async function render (source: string, scope: Record<string, unknown> = {}, files: Record<string, string> = {}) {
  const liquid = createShopifyLiquid({ files, services: { assetUrl: (path: string) => `//shop.example/cdn/shop/t/5/assets/${path}?v=1` } })
  return renderWithState(liquid, source, scope)
}

/** A page of the sample store at `url`, rendered with `source` as its template and nothing around it. */
async function page (url: string, source: string, options: { cart?: CartState, theme?: ThemeInput, store?: typeof data } = {}) {
  const store = options.store ?? data
  const { templateName, request, locale } = requestFromUrl(url, store)
  const theme = options.theme ?? { files: { 'layout/theme.liquid': '{{ content_for_layout }}', [`templates/${templateName}.liquid`]: source } }
  return renderPage({ data: store, theme, templateName, request: { ...request, origin: ORIGIN }, locale, cart: options.cart })
}

const cartOf = (lines: Array<[number, number]>, discountCodes: string[] = []): CartState => ({ token: 'c1', lines: lines.map(([variantId, quantity]) => ({ variantId, quantity, properties: {}, sellingPlanId: null })), note: null, attributes: {}, discountCodes })

describe('shopify filters the three themes use', () => {
  // https://shopify.dev/docs/api/liquid/filters/md5
  describe('md5', () => {
    it("hashes the string as the page's example and Horizon's recorded product card do", async () => {
      expect((await render("{{ '' | md5 }}|{{ nil | md5 }}")).html).toBe('d41d8cd98f00b204e9800998ecf8427e|d41d8cd98f00b204e9800998ecf8427e')
      expect((await render("{{ 'product-card-link-block-1__product-card-42' | md5 }}")).html).toBe('4f3451826fe48eccf3d58fec5b27eeb1')
      expect(filterStatus('md5')).toBe('exact')
    })
  })

  // https://shopify.dev/docs/api/liquid/filters/preload_tag
  describe('preload_tag', () => {
    it('prints href, as, the other attributes and rel, with no closing slash', async () => {
      const url = '//shop.example/cdn/shop/t/5/assets/overflow-list.css?v=1'
      expect((await render("{{ 'overflow-list.css' | asset_url | preload_tag: as: 'style' }}")).html).toBe(`<link href="${url}" as="style" rel="preload">`)
      expect((await render("{{ 'cart.js' | asset_url | preload_tag: as: 'script', type: 'text/javascript' }}")).html).toBe('<link href="//shop.example/cdn/shop/t/5/assets/cart.js?v=1" as="script" type="text/javascript" rel="preload">')
    })
    it('keeps href and rel its own and reports a call without as', async () => {
      const { html, report } = await render("{{ 'a.js' | asset_url | preload_tag: rel: 'x', href: 'y' }}")
      expect(html).toBe('<link href="//shop.example/cdn/shop/t/5/assets/a.js?v=1" rel="preload">')
      expect(report.unsupported).toEqual([{ feature: 'preload_tag', detail: 'the as argument is required' }])
      expect(report.stubbedFilters).toEqual([])
    })
  })

  // https://shopify.dev/docs/api/liquid/filters/inline_asset_content
  describe('inline_asset_content', () => {
    const svg = '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="m12.5 12.5 3.25 3.25"/></svg>\n'
    const files = { 'assets/icon-search.svg': svg, 'assets/a.css': 'a{}', 'assets/a.js': 'x()', 'assets/theme.json': '{}', 'assets/big.svg': `<svg>${'x'.repeat(15 * 1024)}</svg>` }

    it("prints an SVG, CSS or JS asset of the theme's files byte for byte", async () => {
      const { html, report } = await render("<span>{{ 'icon-search.svg' | inline_asset_content }}</span>{{ 'a.css' | inline_asset_content }}{{ 'a.js' | inline_asset_content }}", {}, files)
      expect(html).toBe(`<span>${svg}</span>a{}x()`)
      expect(report.stubbedFilters).toEqual([])
    })
    it("prints Shopify's comment for a missing asset (recording page-product-model of Dawn: 'icon-3d-model' has no .svg), nothing for another type or one of 15 KB or more, and reports each", async () => {
      const { html, report } = await render("[{{ 'nope.svg' | inline_asset_content }}{{ 'theme.json' | inline_asset_content }}{{ 'big.svg' | inline_asset_content }}{{ 'icon-error' | inline_asset_content }}]", {}, files)
      expect(html).toBe('[<!-- inline_asset_content: Asset not found. --><!-- inline_asset_content: Asset not found. -->]')
      expect(report.missing).toEqual([{ kind: 'resource', name: 'assets/nope.svg' }, { kind: 'resource', name: 'assets/icon-error' }])
      expect(report.unsupported.map(entry => entry.detail)).toEqual(['theme.json is not an SVG, JS or CSS asset', 'assets/big.svg is 15 KB or larger'])
    })
    it("reads a page's theme, and its base's asset where the theme lays over one", async () => {
      const base: ThemeInput = { files: { 'layout/theme.liquid': '{{ content_for_layout }}', 'assets/icon-search.svg': svg, 'templates/index.liquid': "{{ 'icon-search.svg' | inline_asset_content }}" } }
      const overlay: ThemeInput = { base, files: { 'templates/index.liquid': "<i>{{ 'icon-search.svg' | inline_asset_content }}</i>" } }
      expect((await page('/', '', { theme: overlay })).html).toBe(`<i>${svg}</i>`)
    })
    it('reads only a file under assets/, so a path out of it or an address prints nothing and is reported missing', async () => {
      const outside = { ...files, 'snippets/s.css': 's{}', 'x.svg': '<svg/>' }
      const { html, report } = await render("[{{ '../snippets/s.css' | inline_asset_content }}{{ 'https://example.com/x.svg' | inline_asset_content }}{{ '/x.svg' | inline_asset_content }}]", {}, outside)
      expect(html).toBe('[<!-- inline_asset_content: Asset not found. --><!-- inline_asset_content: Asset not found. --><!-- inline_asset_content: Asset not found. -->]')
      expect(report.missing).toEqual([{ kind: 'resource', name: 'assets/../snippets/s.css' }, { kind: 'resource', name: 'assets/https://example.com/x.svg' }, { kind: 'resource', name: 'assets//x.svg' }])
    })
  })

  // the JSON both filters print sits in a <script> or an attribute, so a hostile text must not close it
  describe('structured_data and standard_event_data escaping', () => {
    it('writes </script> in a product title as <\\/script>', async () => {
      const hostile = '</script><script>x</script>'
      const store = { ...data, products: data.products!.map(entry => entry.handle === 'hoodie' ? { ...entry, title: hostile } : entry) }
      const { html } = await page('/products/hoodie', "{{ product | structured_data }}|{{ product | standard_event_data: 'view' }}", { store })
      expect(html).not.toContain('</script>')
      expect(html).not.toContain('<script>')
      expect(html.split('|').map(part => JSON.parse(part).name ?? JSON.parse(part).product.title)).toEqual([hostile, hostile])
      expect(html).toContain('\\u003c\\/script\\u003e\\u003cscript\\u003ex\\u003c\\/script\\u003e')
    })
  })

  // https://shopify.dev/docs/api/liquid/filters/standard_event_data
  describe('standard_event_data', () => {
    const hoodie = product('hoodie')
    const ocean = hoodie.variants.find(variant => variant.title === 'Ocean / Small')!

    it("prints a product's payload, with the selected variant when the request selects one", async () => {
      const source = "{{ product | standard_event_data: 'view', context: 'page' }}|{{ product | standard_event_data: 'view' }}"
      const selected = `{"id":${ocean.id},"title":"Ocean \\/ Small","availableForSale":true,"price":{"amount":"90.0","currencyCode":"USD"},"selectedOptions":[{"name":"Color","value":"Ocean"},{"name":"Size","value":"Small"}]}`
      const options = '[{"name":"Color","value":"Ocean"},{"name":"Size","value":"Small"}]'
      expect((await page(`/products/hoodie?variant=${ocean.id}`, source)).html).toBe(`{"product":{"id":${hoodie.id},"title":"Hoodie","handle":"hoodie","selectedVariant":${selected}},"context":"page","selectedOptions":${options}}|{"product":{"id":${hoodie.id},"title":"Hoodie","handle":"hoodie","selectedVariant":${selected}},"context":null,"selectedOptions":${options}}`)
      expect((await page('/products/hoodie', "{{ product | standard_event_data: 'view', context: 'search' }}")).html).toBe(`{"product":{"id":${hoodie.id},"title":"Hoodie","handle":"hoodie","selectedVariant":null},"context":"search","selectedOptions":[]}`)
    })
    it("prints a collection's id, handle and count, the catalogue's id as null, and ignores the context", async () => {
      const tops = data.collections!.find(collection => collection.handle === 'tops')!
      expect((await page('/collections/tops', "{{ collection | standard_event_data: 'view', context: 'page' }}")).html).toBe(`{"collection":{"id":${tops.id},"handle":"tops","productsCount":15}}`)
      expect((await page('/collections/all', "{{ collection | standard_event_data: 'view' }}")).html).toBe(`{"collection":{"id":null,"handle":"all","productsCount":${data.products!.filter(product => !product.unlisted).length}}}`)
    })
    it('prints a cart that was never created as null, and a cart with lines in the shape the parity store prints', async () => {
      expect((await page('/cart', "{{ cart | standard_event_data: 'view', context: 'page' }}")).html).toBe('{"context":"page","cart":null}')
      const html = (await page('/cart', "{{ cart | standard_event_data: 'view', context: 'dialog' }}", { cart: cartOf([[ocean.id, 2]]) })).html
      const json = JSON.parse(html)
      expect(Object.keys(json)).toEqual(['context', 'cart'])
      expect(json.context).toBe('dialog')
      expect(json.cart).toEqual({ totalQuantity: 2, cost: { totalAmount: { amount: '180.0', currencyCode: 'USD' } }, lines: [{ id: expect.stringMatching(new RegExp(`^${ocean.id}:[0-9a-f]{32}$`)), quantity: 2, cost: { totalAmount: { amount: '180.0', currencyCode: 'USD' } } }], discountCodes: [] })
      expect(Object.keys(json.cart)).toEqual(['totalQuantity', 'cost', 'lines', 'discountCodes'])
    })
    it('lists the codes of the cart with whether they apply', async () => {
      const html = (await page('/cart', "{{ cart | standard_event_data: 'view' }}", { cart: cartOf([[ocean.id, 1]], ['NOPE']) })).html
      expect(JSON.parse(html).cart.discountCodes).toEqual([{ applicable: false, code: 'NOPE' }])
      expect(html).toContain('"discountCodes":[{"applicable":false,"code":"NOPE"}]')
    })
    it('prints a cart that was emptied, which is created, with its zero totals (recording ajax-checkout-redirects of Horizon)', async () => {
      const emptied: CartState = { ...cartOf([]), note: '' }
      const html = (await page('/cart', "{{ cart | standard_event_data: 'view', context: 'dialog' }}", { cart: emptied })).html
      expect(JSON.parse(html).cart).toEqual({ totalQuantity: 0, cost: { totalAmount: { amount: '0.0', currencyCode: 'USD' } }, lines: [], discountCodes: [] })
    })
    it('prints nothing for another event type or object, and reports it', async () => {
      const { html, report } = await page('/products/hoodie', "[{{ product | standard_event_data: 'click' }}{{ product.variants.first | standard_event_data: 'view' }}]")
      expect(html).toBe('[]')
      expect(report.unsupported.filter(entry => entry.feature === 'standard_event_data')).toHaveLength(2)
      expect(report.stubbedFilters).toEqual([])
    })
    it('prints nothing for nil, and does not report it', async () => {
      const { html, report } = await page('/collections/tops', "[{{ nil | standard_event_data: 'view' }}]")
      expect(html).toBe('[]')
      expect(report.unsupported.filter(entry => entry.feature === 'standard_event_data')).toEqual([])
    })
  })

  // https://shopify.dev/docs/api/liquid/filters/image_tag, and the parity store's resource cards and product media of Horizon
  describe('image_tag', () => {
    const cap = (focal?: { x: number, y: number }) => new ImageDrop({ src: '//shop.example/cdn/shop/files/cap.jpg?v=1', width: 1024, height: 1024, alt: 'Cap', focal_point: focal })
    const url = (width: number) => `//shop.example/cdn/shop/files/cap.jpg?v=1&amp;width=${width}`
    it('prints loading after the size, then the named attributes as written, and stops the srcset at the URL width', async () => {
      const source = "{{ image | image_url: width: 500 | image_tag: loading: 'lazy', class: 'card', widths: '240, 352, 832, 1200', sizes: 'auto', ref: '', style: 'object-position: 50.0% 50.0%;' }}"
      expect((await render(source, { image: cap() })).html).toBe(`<img src="${url(500)}" alt="Cap" srcset="${url(240)} 240w, ${url(352)} 352w" width="500" height="500" loading="lazy" class="card" sizes="auto" ref="" style="object-position: 50.0% 50.0%;">`)
    })
    it('prints loading before a sizes written first, and a name written twice once, where it was first written, with its last value', async () => {
      const source = "{{ image | image_url: width: 500 | image_tag: sizes: '50vw', loading: 'lazy', ref: 'a', class: 'x', ref: 'b' }}|{{ image | image_url: width: 500 | image_tag: ref: 'a', class: 'x', ref: nil }}"
      const [first, second] = (await render(source, { image: cap() })).html.split('|')
      expect(first).toBe(`<img src="${url(500)}" alt="Cap" srcset="${url(352)} 352w" width="500" height="500" loading="lazy" sizes="50vw" ref="b" class="x">`)
      expect(second).toBe(`<img src="${url(500)}" alt="Cap" srcset="${url(352)} 352w" width="500" height="500" class="x">`)
    })
    it('gives a media preview image no id, so a card passing it as data-media-id prints none', async () => {
      const media = new ImageDrop({ src: '//shop.example/cdn/shop/files/cap.jpg?v=1', width: 1024, height: 1024, id: 7 }, true)
      const source = '{% assign card = media.preview_image | default: media %}[{{ card.id }}]|{{ media.id }}|{{ card | image_url: width: 500 | image_tag: srcset: nil, data-media-id: card.id }}'
      expect((await render(source, { media })).html).toBe(`[]|7|<img src="${url(500)}" alt="" width="500" height="500">`)
    })
    it('writes the focal point as Ruby decimals, as the focal_point object prints', async () => {
      const source = '{{ image | image_url: width: 300 | image_tag }}|{{ image.presentation.focal_point }}'
      expect((await render(source, { image: cap({ x: 50, y: 50 }) })).html).toBe(`<img src="${url(300)}" alt="Cap" srcset="${url(300)} 300w" width="300" height="300" style="object-position:50.0% 50.0%;">|50.0% 50.0%`)
    })
  })

  // a variant filter shows the matching variant's media as the product's featured_media: its own alt text, its id kept, while its preview_image has none
  describe('featured_media under a variant filter', () => {
    it('keeps the media id on a filtered collection and search', async () => {
      const source = (list: string) => `{% for p in ${list} %}{% if p.handle == 'beanie' or p.handle == 'hoodie-old' %}{{ p.handle }}:{{ p.featured_media.id }}:[{{ p.featured_media.preview_image.id }}];{% endif %}{% endfor %}`
      expect((await page('/collections/all?filter.v.option.color=Red', source('collection.products'))).html).toBe('beanie:39774611767318:[];hoodie-old:39774600364054:[];')
      expect((await page('/search?q=hoodie&type=product&filter.v.option.color=Red', source('search.results'))).html).toBe('hoodie-old:39774600364054:[];')
    })

    // scenario `page-collection-filtered` of Horizon 4.3.0: the card passes `alt: media.alt` to image_tag, and Shopify prints no alt attribute for a product shown through its variant, where the unfiltered card prints the product's title
    it('has no alt text of its own, so image_tag with that alt prints none, where the unfiltered media reads the product title', async () => {
      const source = "{% for p in collection.products %}{% if p.handle == 'beanie' %}{% if p.featured_media.alt == nil %}nil{% else %}{{ p.featured_media.alt }}{% endif %}|{{ p.featured_media.preview_image | image_url: width: 100 | image_tag: alt: p.featured_media.alt, class: 'm' }}{% endif %}{% endfor %}"
      const filtered = (await page('/collections/all?filter.v.option.color=Red', source)).html
      expect(filtered).toMatch(/^nil\|<img src="[^"]+" srcset="[^"]+" width="100" height="100" class="m">$/)
      expect(filtered).not.toContain('alt=')
      const unfiltered = (await page('/collections/all', source)).html
      expect(unfiltered).toMatch(/^Beanie\|<img src="[^"]+" alt="Beanie" /)
    })
  })

  // https://shopify.dev/docs/api/liquid/filters/default: Ruby's filter returns its input itself
  describe('default', () => {
    it('keeps an image, so image_url and image_tag still know its size', async () => {
      const image = new ImageDrop({ src: '//shop.example/cdn/shop/files/cap.jpg?v=1', width: 1000, height: 500 })
      const source = "{% assign card = missing | default: image %}{{ card | image_url: width: 200 | image_tag: srcset: nil }}|{{ image | default: 'none' }}|{{ nil | default: 'none' }}"
      expect((await render(source, { image })).html).toBe('<img src="//shop.example/cdn/shop/files/cap.jpg?v=1&amp;width=200" alt="" width="200" height="100">|//shop.example/cdn/shop/files/cap.jpg?v=1|none')
    })
  })

  // https://shopify.dev/docs/api/liquid/filters/structured_data
  describe('structured_data', () => {
    const slides = product('slides')
    const image = 'https:\\/\\/cdn.shopify.com\\/mock-shop-production-media\\/_seeds\\/demostore\\/2b6e548b7deeed36367218be099c91d2366145fdac845fa32455c6ee502cdaea.jpg?width=1920'
    const variant = (id: number, size: string) => `{"@id":"\\/products\\/slides?variant=${id}#variant","@type":"Product","image":"${image}","name":"Slides - ${size}","offers":{"@id":"\\/products\\/slides?variant=${id}#offer","@type":"Offer","availability":"http:\\/\\/schema.org\\/InStock","price":"25.00","priceCurrency":"USD","url":"https:\\/\\/shop.example\\/products\\/slides?variant=${id}"}}`

    it('prints a product with variants as the ProductGroup the parity store prints for Horizon and Dawn', async () => {
      const [small, medium, large] = slides.variants
      const expected = '{"@context":"http:\\/\\/schema.org\\/","@id":"\\/products\\/slides#product","@type":"ProductGroup","brand":{"@type":"Brand","name":"Mock.shop"},"category":"Sandals","description":"Simple, minimal and comfortable, these slides feature a classic design in the perfect shade of iron. Whether you\'re just lounging around the house or running errands, these slides will offer all-day comfort.",' +
        `"hasVariant":[${variant(small.id, 'Small')},${variant(medium.id, 'Medium')},${variant(large.id, 'Large')}],"name":"Slides","productGroupID":"${slides.id}","url":"https:\\/\\/shop.example\\/products\\/slides"}`
      expect((await page('/products/slides', '{{ product | structured_data }}')).html).toBe(expected)
    })
    it("prices the offers in the market's currency and puts the view's prefix on the addresses", async () => {
      const json = JSON.parse((await page('/en-eu/products/hoodie', '{{ product | structured_data }}')).html)
      expect(json['@id']).toBe('/en-eu/products/hoodie#product')
      expect(json.hasVariant[0].offers).toMatchObject({ price: '82.95', priceCurrency: 'EUR', url: `${ORIGIN}/en-eu/products/hoodie?variant=${product('hoodie').variants[0].id}` })
      expect(json.hasVariant[1].offers.availability).toBe('http://schema.org/OutOfStock')
      expect(json.hasVariant[0].name).toBe('Hoodie - Red / Small')
    })
    it("prints a product with only its default variant as the page's Product", async () => {
      const sunnies = product('black-sunnies')
      const json = JSON.parse((await page('/products/black-sunnies', '{{ product | structured_data }}')).html)
      expect(Object.keys(json)).toEqual(['@context', '@id', '@type', 'brand', 'category', 'description', 'image', 'name', 'offers', 'url'])
      expect(json['@type']).toBe('Product')
      expect(json.offers).toEqual({ '@id': `/products/black-sunnies?variant=${sunnies.variants[0].id}#offer`, '@type': 'Offer', availability: `http://schema.org/${sunnies.variants[0].available ? 'InStock' : 'OutOfStock'}`, price: (sunnies.variants[0].price / 100).toFixed(2), priceCurrency: 'USD', url: `${ORIGIN}/products/black-sunnies?variant=${sunnies.variants[0].id}` })
    })
    it('prints an article as the Article the parity store prints', async () => {
      const article = data.blogs![0].articles.find(entry => entry.handle === 'making-liquid')!
      const html = (await page('/blogs/news/making-liquid', '{{ article | structured_data }}')).html
      const json = JSON.parse(html)
      expect(Object.keys(json)).toEqual(['@context', '@id', '@type', 'mainEntityOfPage', 'articleBody', 'headline', 'description', 'datePublished', 'dateModified', 'author', 'publisher'])
      expect(json).toEqual({
        '@context': 'http://schema.org/',
        '@id': '/blogs/news/making-liquid#article',
        '@type': 'Article',
        mainEntityOfPage: { '@type': 'WebPage', '@id': `${ORIGIN}/blogs/news/making-liquid` },
        articleBody: expect.stringMatching(/^At Liquid, we are committed .* sustainable\. Our mission .* products\.\nOrganic Cotton: The Heart of Our Manufacturing Process\nOrganic cotton is/),
        headline: 'Making Liquid',
        description: 'High-quality streetwear that is both stylish and sustainable',
        datePublished: article.published_at,
        dateModified: article.published_at,
        author: { '@type': 'Person', name: 'Teddy Hwang' },
        publisher: { '@type': 'Organization', name: 'Debutify Parity' }
      })
      expect(html).toContain('"@id":"https:\\/\\/shop.example\\/blogs\\/news\\/making-liquid"')
    })
    it('prints nothing for another object, and reports it', async () => {
      const { html, report } = await page('/collections/tops', '[{{ collection | structured_data }}]')
      expect(html).toBe('[]')
      expect(report.unsupported).toContainEqual({ feature: 'structured_data', detail: 'only a product or an article has structured data' })
    })
    it('prints nothing for nil, and does not report it', async () => {
      const { html, report } = await page('/collections/tops', '[{{ nil | structured_data }}{{ missing | structured_data }}]')
      expect(html).toBe('[]')
      expect(report.unsupported.filter(entry => entry.feature === 'structured_data')).toEqual([])
    })
  })

  // https://shopify.dev/docs/api/liquid/filters/money_amount
  describe('money_amount', () => {
    it('prints the amount as a plain decimal', async () => {
      expect((await render('{{ 1000 | money_amount }}|{{ 8295 | money_amount }}|{{ 123456789 | money_amount }}|{{ nil | money_amount }}|{{ 0 | money_amount }}')).html).toBe('10.0|82.95|1234567.89||0.0')
      expect((await page('/en-eu/products/hoodie', '{{ product.selected_or_first_available_variant.price | default: 0 | money_amount }}')).html).toBe('82.95')
    })
  })

  // https://shopify.dev/docs/api/liquid/filters/unit_price_with_measurement
  describe('unit_price_with_measurement', () => {
    it('formats a number with the money format and appends the measurement', async () => {
      const kg = { reference_unit: 'kg', reference_value: 1 }
      const grams = { reference_unit: 'g', reference_value: 100 }
      expect((await render('{{ 5000 | unit_price_with_measurement: kg }}|{{ 5000 | money_with_currency | unit_price_with_measurement: kg }}|{{ 500 | unit_price_with_measurement: grams }}|{{ 500 | unit_price_with_measurement: nil }}|{{ nil | unit_price_with_measurement: kg }}', { kg, grams })).html)
        .toBe('$50.00/kg|$50.00 USD/kg|$5.00/100g|$5.00|')
    })
  })

  // https://shopify.dev/docs/api/liquid/filters/line_items_for
  describe('line_items_for', () => {
    it("returns the cart's lines of a product or of a variant", async () => {
      const [red, clay] = product('hoodie').variants
      const source = "{% assign product = all_products['hoodie'] %}{{ cart | line_items_for: product | sum: 'quantity' }}|{{ cart | line_items_for: product.variants.first | sum: 'quantity' }}|{{ cart | line_items_for: all_products['slides'] | size }}|{{ cart | line_items_for: 'x' | size }}"
      expect((await page('/cart', source, { cart: cartOf([[red.id, 2], [clay.id, 3]]) })).html).toBe('5|2|0|0')
    })
  })

  // https://shopify.dev/docs/api/liquid/filters/applicable_disclosures
  describe('applicable_disclosures', () => {
    const disclosures = [
      { title: { value: 'Prop 65' }, jurisdictions: { value: ['US-CA'] } },
      { title: { value: 'Choking hazard' }, jurisdictions: { value: '["US"]' } },
      { title: { value: 'France only' }, jurisdictions: { value: ['FR'] } },
      { title: { value: 'Everywhere' } }
    ]
    const titles = '{% assign shown = list | applicable_disclosures %}{% for d in shown %}{{ d.title.value }};{% endfor %}'

    it('returns the empty list for nil, as when the product has no disclosures', async () => {
      expect((await render('{{ nil | applicable_disclosures | json }}|{{ product.metafields.shopify.disclosure.value | applicable_disclosures | size }}')).html).toBe('[]|0')
    })
    it("keeps the disclosures of the buyer's country and its subdivisions, and those without a jurisdiction", async () => {
      expect((await render(titles, { list: disclosures, localization: { country: { iso_code: 'US' } } })).html).toBe('Prop 65;Choking hazard;Everywhere;')
      expect((await render(titles, { list: disclosures, localization: { country: { iso_code: 'FR' } } })).html).toBe('France only;Everywhere;')
    })
    it("keeps every disclosure when the buyer's country is not known", async () => {
      expect((await render(titles, { list: disclosures })).html).toBe('Prop 65;Choking hazard;France only;Everywhere;')
    })
  })

  // https://shopify.dev/docs/api/liquid/filters/metafield_tag
  describe('metafield_tag', () => {
    const fields = {
      boolean: { type: 'boolean', value: false },
      color: { type: 'color', value: '#ff0000' },
      date: { type: 'date', value: '2040-01-01' },
      date_time: { type: 'date_time', value: '2022-06-22T13:00:00Z' },
      json: { type: 'json', value: { temperature: '700', unit: 'degrees', scale: 'Fahrenheit' } },
      money: { type: 'money', value: { amount: '0.10', currency_code: 'USD' } },
      multi: { type: 'multi_line_text_field', value: 'All made to order.\n\nThanks for your patience!' },
      decimal: { type: 'number_decimal', value: 8.4 },
      integer: { type: 'number_integer', value: 3 },
      page: { type: 'page_reference', value: { url: '/pages/potion-dosages', title: 'Potion dosages' } },
      rating: { type: 'rating', value: { value: 4.5, scale_min: 1, scale_max: 5 } },
      text: { type: 'single_line_text_field', value: 'Take with a meal.' },
      url: { type: 'url', value: 'https://www.canada.ca/en/health-canada.html' },
      rich: { type: 'rich_text_field', value: { type: 'root', children: [{ type: 'heading', level: 3, children: [{ type: 'text', value: "Are you low on health? Well we've got the potion just for you!" }] }, { type: 'paragraph', children: [{ type: 'text', value: 'WARNING:', bold: true }, { type: 'text', value: ' Cancer' }] }] } },
      width: { type: 'dimension', value: { value: 3, unit: 'cm' } },
      volume: { type: 'volume', value: { value: 500, unit: 'mL' } },
      weight: { type: 'weight', value: { value: 50.004, unit: 'g' } },
      list: { type: 'list.single_line_text_field', value: ['Ottawa', 'Toronto'] },
      ingredients: { type: 'list.metaobject_reference', value: [{ name: { type: 'single_line_text_field', value: 'Spinach' } }, { name: { value: 'Kale' } }] }
    }
    const tag = (name: string, args = '') => `{{ f.${name} | metafield_tag${args} }}`

    it("prints each basic type in the page's element and class", async () => {
      const names = ['boolean', 'color', 'date', 'date_time', 'json', 'money', 'multi', 'decimal', 'integer', 'page', 'rating', 'text', 'url']
      const { html } = await render(names.map(name => tag(name)).join('\n'), { f: fields })
      expect(html.split('\n<br />\n').join('|BR|').split('\n')).toEqual([
        '<span class="metafield-boolean">false</span>',
        '<span class="metafield-color">#ff0000</span>',
        '<time datetime="2040-01-01" class="metafield-date">January 1, 2040</time>',
        '<time datetime="2022-06-22T13:00:00Z" class="metafield-date_time">Jun 22, 2022, 1:00 pm</time>',
        '<script type="application/json" class="metafield-json">{"temperature":"700","unit":"degrees","scale":"Fahrenheit"}</script>',
        '<span class="metafield-money">$0.10 USD</span>',
        '<span class="metafield-multi_line_text_field">All made to order.<br />|BR|Thanks for your patience!</span>',
        '<span class="metafield-number_decimal">8.4</span>',
        '<span class="metafield-number_integer">3</span>',
        '<a href="/pages/potion-dosages" class="metafield-page_reference">Potion dosages</a>',
        '<span class="metafield-rating">4.5</span>',
        '<span class="metafield-single_line_text_field">Take with a meal.</span>',
        '<a href="https://www.canada.ca/en/health-canada.html" class="metafield-url">www.canada.ca/en/health-canada.html</a>'
      ])
    })
    it('prints rich text, measurements and lists as the page nests them', async () => {
      const { html } = await render([tag('rich'), tag('width'), tag('volume'), tag('weight'), tag('list'), tag('list', ": list_format: 'ordered'"), tag('ingredients', ": field: 'name'")].join('\n'), { f: fields })
      expect(html.split('\n')).toEqual([
        '<div class="metafield-rich_text_field"><h3>Are you low on health? Well we&#39;ve got the potion just for you!</h3><p><strong>WARNING:</strong> Cancer</p></div>',
        '<span class="metafield-dimension"><span class="metafield-dimension_value">3 </span><span class="metafield-dimension_unit">cm</span></span>',
        '<span class="metafield-volume"><span class="metafield-volume_value">500 </span><span class="metafield-volume_unit">mL</span></span>',
        '<span class="metafield-weight"><span class="metafield-weight_value">50 </span><span class="metafield-weight_unit">g</span></span>',
        '<ul class="metafield-single_line_text_field-array"><li class="metafield-single_line_text_field">Ottawa</li><li class="metafield-single_line_text_field">Toronto</li></ul>',
        '<ol class="metafield-single_line_text_field-array"><li class="metafield-single_line_text_field">Ottawa</li><li class="metafield-single_line_text_field">Toronto</li></ol>',
        '<ul class="metafield-single_line_text_field-array"><li class="metafield-single_line_text_field">Spinach</li><li class="metafield-single_line_text_field">Kale</li></ul>'
      ])
    })
    it('escapes text, and prints nothing for a plain value or an unknown type, reporting it', async () => {
      const { html, report } = await render("{{ f | metafield_tag }}[{{ 'plain' | metafield_tag }}{{ nil | metafield_tag }}{{ odd | metafield_tag }}]", { f: { type: 'single_line_text_field', value: '<b>&</b>' }, odd: { type: 'mystery', value: 1 } })
      expect(html).toBe('<span class="metafield-single_line_text_field">&lt;b&gt;&amp;&lt;/b&gt;</span>[]')
      expect(report.unsupported.map(entry => entry.detail)).toEqual(['the value is not a metafield with a type', 'the type mystery is not printed'])
    })
  })

  // https://shopify.dev/docs/api/liquid/filters/login_button
  describe('login_button', () => {
    it('prints nothing, as a store without Shop accounts shows, and is no longer a stub', async () => {
      const { html, report } = await render("[{{ shop | login_button: action: 'follow' }}]", { shop: { name: 'x' } })
      expect(html).toBe('[]')
      expect(report.stubbedFilters).toEqual([])
      expect(filterStatus('login_button')).toBe('approx')
    })
  })

  // https://shopify.dev/docs/api/liquid/filters/model_viewer_tag
  describe('model_viewer_tag', () => {
    const model = {
      media_type: 'model',
      alt: 'Potion bottle',
      sources: [{ format: 'usdz', url: '//shop.example/cdn/shop/3d/models/o/eb93/WaterBottle.usdz?v=0' }, { format: 'glb', url: '//shop.example/cdn/shop/3d/models/o/eb93/WaterBottle.glb?v=0' }],
      preview_image: { src: '//shop.example/cdn/shop/products/WaterBottle.jpg?v=1655189057', width: 1000, height: 1000 }
    }
    const tail = 'camera-controls="true" style="--poster-color: transparent;" data-shopify-feature="1.12" alt="Potion bottle"'

    it("prints the page's model viewer, with other attributes first and the poster's size", async () => {
      const { html } = await render("{{ m | model_viewer_tag }}\n{{ m | model_viewer_tag: interaction-policy: 'allow-when-focused' }}\n{{ m | model_viewer_tag: image_size: '400x' }}", { m: model })
      expect(html.split('\n')).toEqual([
        `<model-viewer src="//shop.example/cdn/shop/3d/models/o/eb93/WaterBottle.glb?v=0" ${tail} poster="//shop.example/cdn/shop/products/WaterBottle_small.jpg?v=1655189057"></model-viewer>`,
        `<model-viewer interaction-policy="allow-when-focused" src="//shop.example/cdn/shop/3d/models/o/eb93/WaterBottle.glb?v=0" ${tail} poster="//shop.example/cdn/shop/products/WaterBottle_small.jpg?v=1655189057"></model-viewer>`,
        `<model-viewer src="//shop.example/cdn/shop/3d/models/o/eb93/WaterBottle.glb?v=0" ${tail} poster="//shop.example/cdn/shop/products/WaterBottle_400x.jpg?v=1655189057"></model-viewer>`
      ])
    })
    // scenarios `probe-product-model-media` and `page-product-model`: the parity store moves an argument that names a default attribute to the front with the others, writes a boolean as text, and keeps the media's alt text for `alt`; `media_tag` of a model is the same viewer
    it('moves a named default attribute to the front, writes booleans as text, and is what media_tag prints for a model', async () => {
      const src = '//shop.example/cdn/shop/3d/models/o/eb93/WaterBottle.glb?v=0'
      const poster = 'poster="//shop.example/cdn/shop/products/WaterBottle_small.jpg?v=1655189057"'
      const { html } = await render("{{ m | model_viewer_tag: class: 'cube', alt: 'A cube' }}\n{{ m | model_viewer_tag: interaction-policy: 'allow-when-focused', camera-controls: false }}\n{{ m | model_viewer_tag: reveal: 'interaction', toggleable: true }}\n{{ m | media_tag: image_size: '400x', toggleable: true }}", { m: model })
      expect(html.split('\n')).toEqual([
        `<model-viewer class="cube" alt="Potion bottle" src="${src}" camera-controls="true" style="--poster-color: transparent;" data-shopify-feature="1.12" ${poster}></model-viewer>`,
        `<model-viewer interaction-policy="allow-when-focused" camera-controls="false" src="${src}" style="--poster-color: transparent;" data-shopify-feature="1.12" alt="Potion bottle" ${poster}></model-viewer>`,
        `<model-viewer reveal="interaction" toggleable="true" src="${src}" ${tail} ${poster}></model-viewer>`,
        `<model-viewer toggleable="true" src="${src}" ${tail} poster="//shop.example/cdn/shop/products/WaterBottle_400x.jpg?v=1655189057"></model-viewer>`
      ])
    })
    it('prints nothing for media that is not a model, and reports it', async () => {
      const { html, report } = await render('[{{ m | model_viewer_tag }}]', { m: { media_type: 'image', src: '//x/a.jpg' } })
      expect(html).toBe('[]')
      expect(report.unsupported).toEqual([{ feature: 'model_viewer_tag', detail: 'only a 3D model media has a model viewer' }])
    })
  })

  // https://shopify.dev/docs/api/liquid/objects/powered_by_link
  describe('powered_by_link', () => {
    const link = (words: string) => `<a target="_blank" rel="nofollow" href="https://www.shopify.com?utm_campaign=poweredby&amp;utm_medium=shopify&amp;utm_source=onlinestore">${words}</a>`
    it("prints Shopify's link in the page's language", async () => {
      expect((await page('/', '{{ powered_by_link }}')).html).toBe(link('Powered by Shopify'))
      expect((await page('/fr-ca', '{{ powered_by_link }}')).html).toBe(link('Commerce électronique propulsé par Shopify'))
    })
  })
})
