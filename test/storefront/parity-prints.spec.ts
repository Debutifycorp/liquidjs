import { cartJson, lineItemJson, renderPage, requestFromUrl, storefrontSampleData } from '../../src/shopify'
import type { CartState, StoreData } from '../../src/shopify'
import { buildCartObject } from '../../src/shopify/store/cart'
import { buildStore } from '../../src/shopify/store/build'
import { sanitizeHtml } from '../../src/shopify/util/sanitize'

const THEME = { 'config/settings_schema.json': '[]', 'config/settings_data.json': '{"current":{}}', 'layout/theme.liquid': '{{ content_for_layout }}' }

/** Renders `source` as the page of `url` over `data`, with an inline template: the storefront's own pipeline, on the public dataset. */
async function render (source: string, url = '/', data: StoreData = storefrontSampleData): Promise<string> {
  const page = requestFromUrl(url, data)
  const { html } = await renderPage({ theme: { files: { ...THEME, [`templates/${page.templateName}.liquid`]: source } }, templateName: page.templateName, data, request: page.request, locale: page.locale })
  return html
}

describe('a decimal in json (scenarios page-product, page-product-variant, page-product-subscription, page-product-requires-plan, page-product-en-eu)', () => {
  // the parity store prints a price in cents, made a decimal and printed through json, with its point (`90.0`), and one made by a whole division without
  it('keeps the point of a price made a decimal, and not of one that stayed whole', async () => {
    expect(await render('{% assign v = product.selected_or_first_available_variant %}{{ v.price | divided_by: 10.0 | json }}|{{ v.price | divided_by: 10 | json }}', '/products/hoodie')).toBe('900.0|900')
  })

  it('keeps the point of the aspect ratio of an image in the variants and media of product | json', async () => {
    const out = await render('{{ product.variants | json }}|{{ product.media | json }}|{{ product | json }}', '/products/hoodie')
    expect(out).toMatch(/"preview_image":\{"aspect_ratio":1\.0,"height":\d+,"width":\d+,/)
    expect(out).not.toMatch(/"aspect_ratio":1[,}]/)
  })

  it('writes an aspect ratio that is not whole as a plain decimal', async () => {
    const data = structuredClone(storefrontSampleData) as StoreData
    const hoodie = data.products!.find(product => product.handle === 'hoodie')!
    hoodie.images = hoodie.images!.map(image => ({ ...image, width: 3000, height: 2000 }))
    delete hoodie.media
    expect(await render('{{ product.featured_media | json }}', '/products/hoodie', data)).toMatch(/"aspect_ratio":1\.5,/)
  })
})

describe('richtext settings (scenarios page-product, page-product-variant, page-product-subscription, page-product-requires-plan, page-product-en-eu)', () => {
  // the parity store prints the `<br/>` the theme stores as `<br/>`, in every richtext block of the product page
  it('keeps a void tag as it was written: self-closing stays self-closing, and a plain one stays plain', () => {
    expect(sanitizeHtml('<p>a<br/>b<br>c<br />d</p><hr/><img src="/x.png" alt="y"/>')).toBe('<p>a<br/>b<br>c<br />d</p><hr/><img src="/x.png" alt="y"/>')
  })

  it('does not take a slash out of an attribute value for the self-closing mark', () => {
    expect(sanitizeHtml('<img src="/x/">')).toBe('<img src="/x/">')
    expect(sanitizeHtml('<img src=/x/>')).toBe('<img src="/x/">')
    expect(sanitizeHtml('<a href="/x/">y</a>')).toBe('<a href="/x/">y</a>')
  })

  it('prints a richtext setting with its stored void tags', async () => {
    const files = {
      'config/settings_schema.json': JSON.stringify([{ name: 'Test', settings: [{ type: 'richtext', id: 'body', label: 'Body' }] }]),
      'config/settings_data.json': JSON.stringify({ current: { body: '<p>Fast<br/>Free<br>Easy</p>' } }),
      'layout/theme.liquid': '{{ content_for_layout }}',
      'templates/index.liquid': '{{ settings.body }}'
    }
    const { html } = await renderPage({ theme: { files }, templateName: 'index', data: storefrontSampleData, request: requestFromUrl('/', storefrontSampleData).request, locale: 'en' })
    expect(html).toBe('<p>Fast<br/>Free<br>Easy</p>')
  })
})

describe('the localization form\'s return_to (scenario page-collection-filtered)', () => {
  const form = '{% form \'localization\' %}{% endform %}'
  const returnTo = (html: string) => /name="return_to" value="([^"]*)"/.exec(html)?.[1]

  // the parity store prints the hidden input with the `&` of the address raw: `value="/collections/all?filter.v.availability=1&filter.p.product_type=Shoes&sort_by=price-ascending"`
  it('writes the address of the page with the & between its parameters as it is', async () => {
    expect(returnTo(await render(form, '/collections/all?filter.v.availability=1&filter.p.product_type=Shoes&sort_by=price-ascending'))).toBe('/collections/all?filter.v.availability=1&filter.p.product_type=Shoes&sort_by=price-ascending')
  })

  it('keeps a & inside a value, a quote and a tag out of the attribute', async () => {
    expect(returnTo(await render(form, '/collections/all?q=a%26b%22%3E%3Cscript%3E&x=%27'))).toBe('/collections/all?q=a%26b%22%3E%3Cscript%3E&x=\'')
  })

  it('keeps a quote of a path that was not encoded out of the attribute', async () => {
    const page = requestFromUrl('/pages/about', storefrontSampleData)
    const { html } = await renderPage({ theme: { files: { ...THEME, 'templates/page.liquid': form } }, templateName: 'page', data: storefrontSampleData, request: { ...page.request, path: '/pages/a"><b>x' }, locale: 'en' })
    expect(html).not.toContain('<b>')
    expect(returnTo(html)).toBe('/pages/a%22%3E%3Cb%3Ex')
  })

  it('still writes an explicit return_to escaped', async () => {
    expect(returnTo(await render('{% form \'localization\', return_to: \'/a?b=1&c="2"\' %}{% endform %}'))).toBe('/a?b=1&amp;c=&quot;2&quot;')
  })
})

describe('the collection list (scenario page-collections)', () => {
  // a collection card asks for 1500 pixels of an image that is 1024 pixels wide, and the parity store keeps `width=1500` in the address
  it('keeps the width the card asked for in the address of a smaller image', async () => {
    const out = await render('{% assign image = collections.men.image %}{{ image.width }}|{{ image | image_url: width: 1300 }}|{{ image | image_url }}')
    const [width, asked, plain] = out.split('|')
    expect(width).toBe('1024')
    expect(asked).toMatch(/\.png\?width=1300$/)
    expect(plain).toMatch(/\.png$/)
  })

  // the Storefront API writes an apostrophe in `descriptionHtml` as `&#39;`, which the snapshot took over; the parity store prints the stored `'`
  it('prints the apostrophe of a collection\'s description as the store stores it', async () => {
    const out = await render('{{ collections.men.description }}|{{ collections.women.description }}')
    expect(out).toContain('men\'s clothing')
    expect(out).toContain('women\'s clothing')
    expect(out).not.toContain('&#39;')
  })

  it('keeps no escaped apostrophe in any description of the sample data', () => {
    for (const item of [...storefrontSampleData.products ?? [], ...storefrontSampleData.collections ?? []]) expect(item.description ?? '').not.toContain('&#39;')
  })
})

describe('the addresses of an image in a cart (scenarios ajax-cart-session, ajax-discount-codes, ajax-discount-automatic-bxgy and ajax-cart-en-ca)', () => {
  const HOODIE = 43695847538710
  const cart: CartState = { token: '<token>', lines: [{ variantId: HOODIE, quantity: 1, properties: {}, sellingPlanId: null }], note: null, attributes: {}, discountCodes: [] }
  const protocolRelative = /^\/\/cdn\.shopify\.com\/mock-shop-production-media\//
  const absolute = /^https:\/\/cdn\.shopify\.com\/mock-shop-production-media\//

  // the cart page prints `cart | json` with the line's image as `//cdn…`, where the Ajax answers print `https://cdn…`
  it('prints the image of a line as cart | json does, without a protocol and with the decimal aspect ratio', async () => {
    const theme = { files: { ...THEME, 'templates/cart.liquid': '{{ cart | json }}|{{ cart.items[0] | json }}' } }
    const { html } = await renderPage({ theme, templateName: 'cart', data: storefrontSampleData, cart })
    const [page, line] = html.split('|')
    const items = [(JSON.parse(page) as { items: unknown[] }).items[0], JSON.parse(line)] as Array<{ image: string, featured_image: { url: string } }>
    for (const item of items) {
      expect(item.image).toMatch(protocolRelative)
      expect(item.featured_image.url).toMatch(protocolRelative)
    }
    for (const text of [page, line]) expect(text).toMatch(/"aspect_ratio":1\.0,"height":/)
  })

  it('keeps the full address in the Ajax answers of the cart', () => {
    const answer = cartJson(storefrontSampleData, cart) as { items: Array<{ image: string, featured_image: { url: string, aspect_ratio: unknown } }> }
    expect(answer.items[0].image).toMatch(absolute)
    expect(answer.items[0].featured_image.url).toMatch(absolute)
    expect(answer.items[0].featured_image.aspect_ratio).toBe(1)
    const line = buildCartObject(buildStore(storefrontSampleData), cart).items as Array<Record<string, any>>
    for (const form of ['cart', 'change'] as const) expect(lineItemJson(line[0], form)).toMatchObject({ image: expect.stringMatching(absolute), featured_image: { url: expect.stringMatching(absolute) } })
  })
})

describe('the decimals of a cart, compared as printed text (scenarios ajax-cart-session, ajax-discount-codes, ajax-discount-automatic-bxgy and ajax-cart-en-ca)', () => {
  const HOODIE = 43695847538710
  const line = (quantity: number) => ({ variantId: HOODIE, quantity, properties: {}, sellingPlanId: null })
  const cartOf = (lines: CartState['lines'], discountCodes: string[] = []): CartState => ({ token: '<token>', lines, note: null, attributes: {}, discountCodes })
  const page = async (source: string, cart: CartState) => (await renderPage({ theme: { files: { ...THEME, 'templates/cart.liquid': source } }, templateName: 'cart', data: storefrontSampleData, cart })).html

  // the parity store prints the weight of a cart, and of an empty one, as a Float: `1550.0`, `0.0`
  it('prints the weight of the cart with its point, in the cart object and in cart | json', async () => {
    const text = await page('{{ cart.total_weight }}|{{ cart.total_weight | json }}|{{ cart | json }}', cartOf([line(2)]))
    const [plain, alone, whole] = text.split('|')
    expect(plain).toBe('1200.0')
    expect(alone).toBe('1200.0')
    expect(whole).toContain('"total_weight":1200.0,')
    expect((await page('{{ cart.total_weight }}|{{ cart | json }}', cartOf([]))).split('|')).toEqual(['0.0', expect.stringContaining('"total_weight":0.0,')])
  })

  it('keeps the weight a plain number in the Ajax answer', () => {
    expect(JSON.stringify(cartJson(storefrontSampleData, cartOf([line(2)])))).toContain('"total_weight":1200,')
  })

  it('lets a template divide the weight as Shopify does, as a decimal', async () => {
    expect(await page('{{ cart.total_weight | divided_by: 1000 }}|{{ cart.total_weight | times: 1 }}', cartOf([line(1)]))).toBe('0.6|600.0')
  })

  // the probe prints the value of a 10 percent code as `10.0`
  it('prints the value of a percentage discount application with its point, and a fixed amount without one', async () => {
    const percentage = await page('{{ cart.discount_applications[0].value | json }}|{{ cart.discount_applications[0].value_type }}', cartOf([line(1)], ['WELCOME10']))
    expect(percentage).toBe('10.0|percentage')
    const ajax = cartJson(storefrontSampleData, cartOf([line(1)], ['WELCOME10'])) as { cart_level_discount_applications: Array<{ value: unknown }> }
    expect(ajax.cart_level_discount_applications[0].value).toBe('10.0')
  })
})
