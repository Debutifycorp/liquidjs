import { createShopifyLiquid, defaultServices, ImageDrop, renderLiquid, shopifyPaymentIcon } from '../../../src/shopify'
import { PAYMENT_ICONS } from '../../../src/shopify-library'
import type { ShopifyServices } from '../../../src/shopify'
import { attribute } from '../../../src/shopify/util/html'
import { renderWithState } from '../../../src/shopify/render-liquid'

// Every expected string below is copied from the shopify.dev page cited above its test, with the shop's CDN host as the image `src` the test passes in.
const HOST = '//polinas-potent-potions.myshopify.com/cdn/shop'
const BEAKERS = `${HOST}/files/science-beakers-blue-light-new.jpg?v=1683744744`
const product = { title: 'Health potion', featured_image: { src: BEAKERS, width: 3000, height: 2000, alt: 'Health potion' } }
const assetUrl = (path: string) => `${HOST}/t/4/assets/${path}?v=1`

async function renderWithReport (source: string, scope: Record<string, unknown> = { product }, init = {}, services: Partial<ShopifyServices> = {}) {
  const liquid = createShopifyLiquid({ services: { assetUrl, ...services } })
  return renderWithState(liquid, source, scope, init)
}

async function render (source: string, scope: Record<string, unknown> = { product }, init = {}, services: Partial<ShopifyServices> = {}) {
  return (await renderWithReport(source, scope, init, services)).html
}

const sectionAt = (index: number) => ({ frames: [{ kind: 'section' as const, section: { id: 's', type: 's', index }, container: {}, sectionObject: null }] })

describe('shopify/filters/assets', () => {
  // https://shopify.dev/docs/api/liquid/filters/stylesheet_tag
  it('stylesheet_tag', async () => {
    expect(await render("{{ 'base.css' | asset_url | stylesheet_tag }}")).toBe(`<link href="${assetUrl('base.css')}" rel="stylesheet" type="text/css" media="all" />`)
    expect(await render("{{ 'base.css' | asset_url | stylesheet_tag: fetchpriority: 'high' }}")).toBe(`<link href="${assetUrl('base.css')}" rel="stylesheet" type="text/css" media="all" fetchpriority="high" />`)
  })
  // https://shopify.dev/docs/api/liquid/filters/script_tag
  it('script_tag', async () => {
    expect(await render("{{ 'cart.js' | asset_url | script_tag }}")).toBe(`<script src="${assetUrl('cart.js')}" type="text/javascript"></script>`)
    expect(await render("{{ 'cart.js' | asset_url | script_tag: type: 'module', defer: true, async: false }}")).toBe(`<script src="${assetUrl('cart.js')}" type="module" defer="defer"></script>`)
  })
  it('placeholder_svg_tag and payment_type_svg_tag use the injected artwork', async () => {
    const liquid = createShopifyLiquid({ services: { placeholderSvg: name => `<svg data-name="${name}"></svg>`, paymentTypeSvg: type => `<svg data-type="${type}"></svg>` } })
    const { html } = await renderLiquid(liquid, "{{ 'product-1' | placeholder_svg_tag: 'ph' }}|{{ 'visa' | payment_type_svg_tag: class: 'icon' }}")
    expect(html).toBe('<svg class="ph" data-name="product-1"></svg>|<svg class="icon" data-type="visa"></svg>')
  })
  // Shopify prints the files of activemerchant/payment_icons (scenarios page-home, ajax-cart-sections and probe-payment-icons); the probe fixture itself is compared key by key by test/storefront/all-probes.spec.ts
  describe("payment_type_svg_tag with Shopify's icons", () => {
    it('holds every file of the pinned commit, the one outside db/payment_icons.yml (bogus) included, as Shopify prints it', () => {
      expect(Object.keys(PAYMENT_ICONS)).toHaveLength(905)
      expect(Object.keys(PAYMENT_ICONS)).toEqual(expect.arrayContaining(['visa', 'master', 'american_express', 'paypal', 'diners_club', 'discover', 'generic', 'paidy', 'mcb', 'bogus']))
    })
    it('prints the file as the repository holds it, its closing line break included', () => {
      expect(shopifyPaymentIcon('visa').startsWith('<svg xmlns="http://www.w3.org/2000/svg" role="img" viewBox="0 0 38 24" width="38" height="24" fill="none" aria-labelledby="pi-visa"><title id="pi-visa">Visa</title>')).toBe(true)
      expect(shopifyPaymentIcon('visa').endsWith('</svg>\n')).toBe(true)
      expect(shopifyPaymentIcon('paypal').endsWith('</svg>')).toBe(true)
      expect(shopifyPaymentIcon('master')).toContain('<title id="pi-master">Mastercard</title>')
    })
    it('never reads a type from the prototype, and never writes the type it was given: Shopify prints the generic icon for any other type', () => {
      expect(shopifyPaymentIcon('constructor')).toBe(PAYMENT_ICONS.generic)
      expect(shopifyPaymentIcon('"><b>')).toBe(PAYMENT_ICONS.generic)
      expect(shopifyPaymentIcon('')).toBe(PAYMENT_ICONS.generic)
    })
    it('puts the class on the <svg> even after an XML prolog, and reads a $ in it literally', async () => {
      expect(await render("{{ 'paidy' | payment_type_svg_tag: class: 'icon' }}")).toMatch(/^<\?xml version="1\.0"\?><svg class="icon" xmlns=/)
      expect(await render("{{ 'visa' | payment_type_svg_tag: class: 'a$&b' }}")).toMatch(/^<svg class="a\$&amp;b" xmlns=/)
    })
    it('is the default service', () => {
      expect(defaultServices.paymentTypeSvg).toBe(shopifyPaymentIcon)
    })
  })
  // https://shopify.dev/docs/api/liquid/filters/placeholder_svg_tag
  it('placeholder_svg_tag draws line art for every name the page lists, in the markup the page shows', async () => {
    const names = ['product-1', 'product-2', 'product-3', 'product-4', 'product-5', 'product-6', 'collection-1', 'collection-2', 'collection-3', 'collection-4', 'collection-5', 'collection-6', 'lifestyle-1', 'lifestyle-2', 'image', 'product-apparel-1', 'product-apparel-2', 'product-apparel-3', 'product-apparel-4', 'collection-apparel-1', 'collection-apparel-2', 'collection-apparel-3', 'collection-apparel-4', 'hero-apparel-1', 'hero-apparel-2', 'hero-apparel-3', 'blog-apparel-1', 'blog-apparel-2', 'blog-apparel-3', 'detailed-apparel-1']
    const drawings = new Set<string>()
    for (const name of names) {
      const svg = await render(`{{ '${name}' | placeholder_svg_tag }}`)
      expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 525\.5 525\.5">(<path d="[^"]+"\/>)+<\/svg>$/)
      drawings.add(svg)
    }
    expect(drawings.size).toBe(names.length)
    const image = await render("{{ 'image' | placeholder_svg_tag }}")
    expect(await render("{{ 'collection-1' | placeholder_svg_tag: 'placeholder-svg' }}")).toBe((await render("{{ 'collection-1' | placeholder_svg_tag }}")).replace('<svg ', '<svg class="placeholder-svg" '))
    expect(await render("{{ 'not-a-name' | placeholder_svg_tag }}")).toBe(image)
  })
  it('shopify_asset_url uses its own service, not asset_url', async () => {
    expect(await render("{{ 'option_selection.js' | shopify_asset_url }}|{{ 'a.js' | asset_url }}", {}, {}, { shopifyAssetUrl: path => `//shopify.test/${path}` })).toBe(`//shopify.test/option_selection.js|${assetUrl('a.js')}`)
  })
  // https://shopify.dev/docs/api/liquid/filters/payment_button
  it('payment_button writes the container the page names', async () => {
    expect(await render('{{ form | payment_button }}', {})).toBe('<div data-shopify="payment-button" class="shopify-payment-button"><button type="button" class="shopify-payment-button__button shopify-payment-button__button--unbranded" disabled="disabled">Buy it now</button></div>')
  })
  // https://shopify.dev/docs/api/liquid/filters/payment_terms shows no output, and https://shopify.dev/docs/storefronts/themes/pricing-payments/installments says the banner "appears only if Shop Pay Installments is enabled in the merchant's store". Shopify's own output is recorded in liquid-spec (84bf25e, specs/shopify_theme_dawn/products-synergistic-wooden-car-main-product): Dawn puts `{{ form | payment_terms }}` in a product form, and in that store, whose `shop.enabled_payment_types` has no Shop Pay, it prints nothing.
  it('payment_terms prints nothing in a product form, as Shopify does for a store without Shop Pay Installments', async () => {
    const { html, report } = await renderWithReport("{% form 'product', product %}[{{ form | payment_terms }}]{% endform %}", { product: { id: 1 } })
    expect(html).toContain('<input type="hidden" name="utf8" value="✓" />[]')
    expect(report.stubbedFilters).toEqual([])
  })
  it('attribute() writes only valid attribute names', () => {
    expect(attribute('data-x.y_z:w', 'v')).toBe(' data-x.y_z:w="v"')
    expect(attribute('x" onerror="y', 'v')).toBe('')
    expect(attribute('1x', 'v')).toBe('')
    expect(attribute('', 'v')).toBe('')
  })
  it('drops attribute names that are not valid and reports them, so an array cannot inject markup', async () => {
    const pair = '{% assign pair = \'x" onerror="alert(1),v\' | split: \',\' %}'
    const css = await renderWithReport(`${pair}{{ 'base.css' | asset_url | stylesheet_tag: pair }}`, {})
    expect(css.html).toBe(`<link href="${assetUrl('base.css')}" rel="stylesheet" type="text/css" media="all" />`)
    expect(css.report.unsupported).toEqual([{ feature: 'stylesheet_tag', detail: 'attribute name "x\\" onerror=\\"alert(1)" is not valid and was dropped' }])
    expect((await render(`${pair}{{ 'cart.js' | asset_url | script_tag: pair }}`, {}))).toBe(`<script src="${assetUrl('cart.js')}" type="text/javascript"></script>`)
  })
  it('the default asset_url has no host', async () => {
    const { html } = await renderLiquid(createShopifyLiquid(), "{{ 'base.css' | asset_url }}")
    expect(html).toBe('/assets/base.css')
  })
})

describe('shopify/filters/media', () => {
  // https://shopify.dev/docs/api/liquid/filters/image_url
  it('image_url sorts parameters as Shopify does', async () => {
    expect(await render('{{ product | image_url: width: 450 }}')).toBe(`${BEAKERS}&width=450`)
    expect(await render('{{ product | image_url: height: 450 }}')).toBe(`${HOST}/files/science-beakers-blue-light-new.jpg?height=450&v=1683744744`)
    expect(await render("{{ product | image_url: width: 400, height: 400, crop: 'bottom' }}")).toBe(`${HOST}/files/science-beakers-blue-light-new.jpg?crop=bottom&height=400&v=1683744744&width=400`)
    expect(await render("{{ product | image_url: width: 450, format: 'pjpg' }}")).toBe(`${HOST}/files/science-beakers-blue-light-new.jpg?format=pjpg&v=1683744744&width=450`)
    expect(await render("{{ product | image_url: width: 400, height: 400, pad_color: '000' }}")).toBe(`${HOST}/files/science-beakers-blue-light-new.jpg?height=400&pad_color=000&v=1683744744&width=400`)
    expect(await render('{{ product | image_url: width: 450, quality: 80 }}')).toBe(`${HOST}/files/science-beakers-blue-light-new.jpg?quality=80&v=1683744744&width=450`)
  })
  // as the parity store renders it (scenario `page-product`): `image_url` is protocol-relative (`//host/cdn/shop/files/…`) and the theme adds `https:` itself (`| image_url | prepend: "https:"` prints `"https:\/\/host\/cdn\/shop\/files\/…"` in the JSON-LD), so an image on an absolute address loses its protocol and a theme's `prepend` does not double it
  it('image_url, img_url and the srcset print an image on an absolute address without its protocol', async () => {
    const hosted = { title: 'Hoodie', featured_image: { src: 'https://cdn.test/files/a.jpg?v=1', width: 3000, height: 2000, alt: 'Hoodie' } }
    expect(await render('{{ product | image_url: width: 450 }}', { product: hosted })).toBe('//cdn.test/files/a.jpg?v=1&width=450')
    expect(await render("{{ product | image_url: width: 450 | prepend: 'https:' }}", { product: hosted })).toBe('https://cdn.test/files/a.jpg?v=1&width=450')
    expect(await render("{{ 'http://cdn.test/files/a.jpg' | image_url: width: 450 }}", {})).toBe('//cdn.test/files/a.jpg?width=450')
    expect(await render("{{ product | img_url: '480x' }}", { product: hosted })).toBe('//cdn.test/files/a_480x.jpg?v=1')
    const tag = await render('{{ product | image_url: width: 450 | image_tag }}', { product: hosted })
    expect(tag).toContain('src="//cdn.test/files/a.jpg?v=1&amp;width=450"')
    expect(tag).toContain('srcset="//cdn.test/files/a.jpg?v=1&amp;width=352 352w"')
    expect(tag).not.toContain('https:')
  })
  // as the parity store renders it (scenario `page-product`: `product | json` prints `"src":"\/\/host\/cdn\/shop\/files\/…"`): an image object's `src` has no protocol either; an address that is not `http(s)://` stays as it is, and the data keeps its own address
  it('prints the src of an image object without its protocol', async () => {
    const data = { src: 'https://cdn.test/files/a.jpg?v=1', width: 3000, height: 2000, alt: 'Hoodie' }
    const image = new ImageDrop(data)
    expect(await render('{{ image.src }}|{{ image }}', { image })).toBe('//cdn.test/files/a.jpg?v=1|//cdn.test/files/a.jpg?v=1')
    expect(await render('{{ image.src }}', { image: new ImageDrop({ ...data, src: 'http://cdn.test/a.jpg' }) })).toBe('//cdn.test/a.jpg')
    expect(await render('{{ image.src }}|{{ other.src }}', { image: new ImageDrop({ ...data, src: '/hero.jpg' }), other: new ImageDrop({ ...data, src: '//cdn.test/b.jpg' }) })).toBe('/hero.jpg|//cdn.test/b.jpg')
    expect(image.data.src).toBe('https://cdn.test/files/a.jpg?v=1')
  })
  it('image_url on nothing renders nothing', async () => {
    expect(await render('{{ nothing | image_url }}', {})).toBe('')
  })
  // https://shopify.dev/docs/api/liquid/filters/image_url says that without a width or height "an error is returned", yet Shopify's reference theme (recorded in liquid-spec's Dawn template) prints the sizeless form as the last srcset candidate; this package reads the Caution as "no resize happens". Not pinned by shopify.dev, so these expectations are Debutify's, not copied from the page.
  it('image_url with neither width nor height is the original-size URL, without an error', async () => {
    const { html, report } = await renderWithReport('{{ product | image_url }}')
    expect(html).toBe(BEAKERS)
    expect(report.errors).toHaveLength(0)
    expect(await render("{{ product | image_url: crop: 'center' }}")).toBe(`${HOST}/files/science-beakers-blue-light-new.jpg?crop=center&v=1683744744`)
  })
  it('image_url as the last srcset candidate and as a plain src', async () => {
    const source = '<img srcset="{% if product.featured_image.width >= 360 %}{{ product.featured_image | image_url: width: 360 }} 360w,{% endif %}{{ product.featured_image | image_url }} {{ product.featured_image.width }}w" src="{{ product.featured_image | image_url }}">'
    const { html, report } = await renderWithReport(source)
    expect(html).toBe(`<img srcset="${BEAKERS}&width=360 360w,${BEAKERS} 3000w" src="${BEAKERS}">`)
    expect(report.errors).toHaveLength(0)
    expect(await render('{{ product | image_url | image_tag }}')).toContain(`src="${BEAKERS}" alt="Health potion"`)
  })
  it('an empty width or height variable counts as omitted', async () => {
    expect(await render('{{ product | image_url: width: nothing }}')).toBe(BEAKERS)
    expect(await render("{{ product | image_url: width: '', height: nothing }}")).toBe(BEAKERS)
    expect(await render('{{ product | image_url: width: nothing, height: 450 }}')).toBe(`${HOST}/files/science-beakers-blue-light-new.jpg?height=450&v=1683744744`)
  })
  it('image_url crop region', async () => {
    expect(await render("{{ product | image_url: crop: 'region', crop_left: 32, crop_top: 32, crop_width: 512, crop_height: 512 }}")).toBe(`${HOST}/files/science-beakers-blue-light-new.jpg?crop=region&crop_height=512&crop_left=32&crop_top=32&crop_width=512&v=1683744744`)
    expect(await render("{{ product | image_url: crop: 'region', width: 100, height: 100, crop_left: 32, crop_top: 32, crop_width: 512, crop_height: 512 }}")).toBe(`${HOST}/files/science-beakers-blue-light-new.jpg?crop=region&crop_height=512&crop_left=32&crop_top=32&crop_width=512&height=100&v=1683744744&width=100`)
  })
  // scenario `page-collections`: a collection card asks for 1500 pixels of an image that is 1024 pixels wide, and the parity store keeps `width=1500` in the address, so the URL names the width that was asked for and the CDN serves nothing larger than the original (shopify.dev's Note on image_url: "an image can never be resized to be larger than its original dimensions"); only the 5760 maximum the page gives is applied here
  it('image_url keeps the size that was asked for past the original, stops at 5760, and keeps quality within 10 to 90', async () => {
    expect(await render('{{ product | image_url: width: 5000 }}')).toBe(`${BEAKERS}&width=5000`)
    expect(await render('{{ product | image_url: height: 9999 }}')).toBe(`${HOST}/files/science-beakers-blue-light-new.jpg?height=5760&v=1683744744`)
    expect(await render('{{ product | image_url: width: 9999 }}')).toBe(`${BEAKERS}&width=5760`)
    expect(await render("{{ 'https://cdn.test/a.jpg' | image_url: width: 9999 }}", {})).toBe('//cdn.test/a.jpg?width=5760')
    expect(await render("{{ 'https://cdn.test/a.jpg' | image_url: height: 9999 }}", {})).toBe('//cdn.test/a.jpg?height=5760')
    expect(await render('{{ product | image_url: width: 450, quality: 5 }}')).toBe(`${HOST}/files/science-beakers-blue-light-new.jpg?quality=10&v=1683744744&width=450`)
    expect(await render('{{ product | image_url: width: 450, quality: 200 }}')).toBe(`${HOST}/files/science-beakers-blue-light-new.jpg?quality=90&v=1683744744&width=450`)
  })
  it('image_url scales a request over 5760 proportionally, so a square stays a square', async () => {
    const url = (query: string) => `${HOST}/files/science-beakers-blue-light-new.jpg?${query}`
    expect(await render('{{ product | image_url: width: 6000, height: 6000 }}')).toBe(url('height=5760&v=1683744744&width=5760'))
    expect(await render('{{ product | image_url: width: 7200, height: 3600 }}')).toBe(url('height=2880&v=1683744744&width=5760'))
    expect(await render('{{ product | image_url: width: 800, height: 800 }}')).toBe(url('height=800&v=1683744744&width=800'))
  })
  // the size image_tag writes and the sizes of its srcset stay within the image, though the URL it was given asks for more (not pinned by a recording)
  it('image_tag keeps its width, height and srcset within the original, whatever the URL asks for', async () => {
    const small = { title: 'Small', featured_image: { src: BEAKERS, width: 1000, height: 600, alt: 'Small' } }
    const url = (query: string) => `${HOST}/files/science-beakers-blue-light-new.jpg?${query}`
    const tag = await render("{{ product | image_url: width: 1500, height: 1500, crop: 'center' | image_tag }}", { product: small })
    expect(tag).toContain(`src="${url('crop=center&amp;height=1500&amp;v=1683744744&amp;width=1500')}"`)
    expect(tag).toContain('width="600" height="600"')
    expect(tag).toContain(`${url('crop=center&amp;height=352&amp;v=1683744744&amp;width=352')} 352w`)
    expect(await render('{{ product | image_url: width: 1500 | image_tag }}', { product: small })).toContain('width="1000" height="600"')
  })
  it('the image_url result is a string to filters that read strings', async () => {
    expect(await render('{{ product | image_url: width: 450 | size }}')).toBe(String(`${BEAKERS}&width=450`.length))
    // `json` escapes `/` as Shopify does, and `&` as a safety choice (see jsonFilters)
    expect(await render('{{ product | image_url: width: 450 | json }}')).toBe(JSON.stringify(`${BEAKERS}&width=450`).replace(/\//g, '\\/').replace('&', '\\u0026'))
  })
  // https://shopify.dev/docs/api/liquid/filters/image_tag
  it('image_tag', async () => {
    expect(await render('{{ product | image_url: width: 200 | image_tag }}')).toBe(`<img src="${BEAKERS}&amp;width=200" alt="Health potion" srcset="${BEAKERS}&amp;width=200 200w" width="200" height="133">`)
    expect(await render('{{ product | image_url: width: 400 | image_tag: width: 300 }}')).toBe(`<img src="${BEAKERS}&amp;width=400" alt="Health potion" srcset="${BEAKERS}&amp;width=300 300w, ${BEAKERS}&amp;width=352 352w" width="300">`)
    expect(await render('{{ product | image_url: width: 400 | image_tag: width: nil }}')).toBe(`<img src="${BEAKERS}&amp;width=400" alt="Health potion" srcset="${BEAKERS}&amp;width=352 352w">`)
    expect(await render('{{ product | image_url: width: 400 | image_tag: height: 300 }}')).toBe(`<img src="${BEAKERS}&amp;width=400" alt="Health potion" srcset="${BEAKERS}&amp;width=352 352w" height="300">`)
    expect(await render("{{ product | image_url: width: 600 | image_tag: widths: '200, 300, 400' }}")).toBe(`<img src="${BEAKERS}&amp;width=600" alt="Health potion" srcset="${BEAKERS}&amp;width=200 200w, ${BEAKERS}&amp;width=300 300w, ${BEAKERS}&amp;width=400 400w" width="600" height="400">`)
    expect(await render('{{ product | image_url: width: 200 | image_tag: srcset: nil }}')).toBe(`<img src="${BEAKERS}&amp;width=200" alt="Health potion" width="200" height="133">`)
    expect(await render('{{ product | image_url: width: 200 | image_tag: alt: "My image\'s alt text" }}')).toBe(`<img src="${BEAKERS}&amp;width=200" alt="My image&#39;s alt text" srcset="${BEAKERS}&amp;width=200 200w" width="200" height="133">`)
    expect(await render("{{ product | image_url: width: 200 | image_tag: class: 'custom-class', loading: 'lazy' }}")).toBe(`<img src="${BEAKERS}&amp;width=200" alt="Health potion" srcset="${BEAKERS}&amp;width=200 200w" width="200" height="133" loading="lazy" class="custom-class">`)
    expect(await render("{{ product | image_url: width: 200 | image_tag: sizes: '100vw' }}")).toBe(`<img src="${BEAKERS}&amp;width=200" alt="Health potion" srcset="${BEAKERS}&amp;width=200 200w" width="200" height="133" sizes="100vw">`)
  })
  // Shopify does not escape image_tag's output. Dawn 15.1.0 snippets/product-media-gallery.liquid (lines 241–250) pipes `image_url | image_tag: …` into `| escape`, and Shopify's Origin demo store (Dawn-based, 15.1.0, https://theme-origin-demo.myshopify.com/products/2unfold-bag-copy, fetched 2026-10-14) prints that thumbnail as a plain `<img src="…&amp;width=416" alt="2Unfold Bag" srcset="…" …>`. liquid-spec (84bf25e) shopify_production_recordings records why: `escape` leaves an HTML-safe string as it is (`RecordedTest#ScratchpadTest#test_do_not_double_escape_replaced_last_html_safe_string_when_no_replacement_is_needed`), while `strip` makes one plain again (`RecordedTest#test_strip_on_html_safe_string_…`).
  it('escape leaves image_tag output as it is, and a filter that rewrites it makes it plain text again', async () => {
    const tag = await render("{{ product | image_url: width: 200 | image_tag: alt: 'Health potion' }}")
    expect(tag.startsWith('<img src=')).toBe(true)
    expect(await render("{{ product | image_url: width: 200 | image_tag: alt: 'Health potion' | escape }}")).toBe(tag)
    expect(await render('{% assign thumb = product | image_url: width: 200 | image_tag %}{{ thumb | escape }}')).toBe(await render('{{ product | image_url: width: 200 | image_tag }}'))
    expect(await render('{{ product | image_url: width: 200 | image_tag | strip | escape }}')).toMatch(/^&lt;img src=/)
    const plain = await render('{{ product | image_url: width: 200 | image_tag }}')
    expect(await render('{% assign thumb = product | image_url: width: 200 | image_tag %}{{ thumb.size }} {{ thumb | size }}')).toBe(`${plain.length} ${plain.length}`)
  })
  it('image_tag writes the focal point as object-position', async () => {
    const header = { src: `${HOST}/files/potions-header.png?v=1650325393`, width: 1300, height: 750, focal_point: { x: 1.923076923, y: 9.791666667 } }
    expect(await render('{{ header | image_url: width: 300 | image_tag }}', { header })).toBe(`<img src="${HOST}/files/potions-header.png?v=1650325393&amp;width=300" alt="" srcset="${HOST}/files/potions-header.png?v=1650325393&amp;width=300 300w" width="300" height="173" style="object-position:1.9231% 9.7917%;">`)
  })
  it('image_tag lazy-loads below the third section unless told otherwise', async () => {
    const tag = '{{ product | image_url: width: 200 | image_tag }}'
    expect(await render(tag, { product }, sectionAt(4))).toContain('height="133" loading="lazy">')
    expect(await render(tag, { product }, sectionAt(3))).toContain('height="133">')
    expect(await render('{{ product | image_url: width: 200 | image_tag: preload: true }}', { product }, sectionAt(4))).toContain('height="133">')
    expect(await render("{{ product | image_url: width: 200 | image_tag: loading: 'eager' }}", { product }, sectionAt(4))).toContain('height="133" loading="eager">')
  })
  it('image_tag rescales the srcset heights with the widths', async () => {
    expect(await render('{{ product | image_url: height: 450 | image_tag }}')).toBe(`<img src="${HOST}/files/science-beakers-blue-light-new.jpg?height=450&amp;v=1683744744" alt="Health potion" srcset="${BEAKERS}&amp;width=352 352w" width="675" height="450">`)
    expect(await render('{{ product | image_url: width: 400, height: 200 | image_tag }}')).toBe(`<img src="${HOST}/files/science-beakers-blue-light-new.jpg?height=200&amp;v=1683744744&amp;width=400" alt="Health potion" srcset="${HOST}/files/science-beakers-blue-light-new.jpg?height=176&amp;v=1683744744&amp;width=352 352w" width="400" height="200">`)
  })
  it('image_tag drops invalid attribute names and reports them', async () => {
    const { html, report } = await renderWithReport('{% assign pair = \'x" onerror="alert(1),v\' | split: \',\' %}{{ product | image_url: width: 200 | image_tag: pair, class: \'ok\' }}')
    expect(html).toBe(`<img src="${BEAKERS}&amp;width=200" alt="Health potion" srcset="${BEAKERS}&amp;width=200 200w" width="200" height="133" class="ok">`)
    expect(report.unsupported).toHaveLength(1)
  })
  // https://shopify.dev/docs/api/liquid/filters/img_url
  it('img_url writes the legacy size into the file name', async () => {
    const file = (size: string) => `${HOST}/files/science-beakers-blue-light-new_${size}.jpg?v=1683744744`
    expect(await render('{{ product | img_url }}')).toBe(file('small'))
    expect(await render("{{ product | img_url: '480x' }}")).toBe(file('480x'))
    expect(await render("{{ product | img_url: 'x480' }}")).toBe(file('x480'))
    expect(await render("{{ product | img_url: '480x480' }}")).toBe(file('480x480'))
    expect(await render("{{ product | img_url: 'large' }}")).toBe(file('large'))
    expect(await render("{{ product | img_url: 'master' }}")).toBe(file('master'))
    // the crop, format and scale examples on the page print the same URL as the plain one
    expect(await render("{{ product | img_url: crop: 'bottom' }}")).toBe(file('small'))
    expect(await render("{{ product | img_url: format: 'pjpg' }}")).toBe(file('small'))
    expect(await render('{{ product | img_url: scale: 2 }}')).toBe(file('small'))
    expect(await render("{{ product | img_url: '9999x' }}")).toBe(file('5760x'))
    expect(await render("{{ product | img_url: '0x0' }}")).toBe(file('small'))
    expect(await render("{{ product | img_url: 'nonsense' }}")).toBe(file('small'))
  })
  it('img_url hands services the size name and its pixels', async () => {
    const seen: unknown[] = []
    await render("{{ product | img_url: '200x', scale: 2, crop: 'top' }}|{{ product | img_url: 'master' }}", { product }, {}, { imageUrl: (image, params) => { seen.push(params); return image.src } })
    expect(seen).toEqual([{ size: '200x', width: 400, crop: 'top' }, { size: 'master', width: 1024, height: 1024 }])
  })
  const poster = `${HOST}/products/thumb.jpg?v=1655255324`
  const video = { media_type: 'video', alt: 'Potion beats', preview_image: { src: poster, width: 1920, height: 1080 }, sources: [{ url: `${HOST}/videos/beats.mp4?v=0`, mime_type: 'video/mp4', format: 'mp4' }, { url: `${HOST}/videos/beats.m3u8?v=0`, mime_type: 'application/x-mpegURL', format: 'm3u8' }] }
  const external = { media_type: 'external_video', alt: 'Potion beats', host: 'youtube', external_id: 'vj01PAffOac' }
  const origin = { request: { origin: 'https://polinas-potent-potions.myshopify.com' } }
  // https://shopify.dev/docs/api/liquid/filters/video_tag
  it('video_tag', async () => {
    const small = `${HOST}/products/thumb_small.jpg?v=1655255324`
    const sources = `<source src="${HOST}/videos/beats.mp4?v=0" type="video/mp4"><source src="${HOST}/videos/beats.m3u8?v=0" type="application/x-mpegURL">`
    expect(await render('{{ video | video_tag }}', { video })).toBe(`<video playsinline="playsinline" preload="metadata" aria-label="Potion beats" poster="${small}">${sources}<img src="${small}"></video>`)
    expect(await render("{{ video | video_tag: image_size: '400x' }}", { video })).toContain(`poster="${HOST}/products/thumb_400x.jpg?v=1655255324"><source`)
    expect(await render('{{ video | video_tag: autoplay: true, loop: true, muted: true, controls: true }}', { video })).toBe(`<video playsinline="playsinline" autoplay="autoplay" loop="loop" muted="muted" controls="controls" preload="metadata" aria-label="Potion beats" poster="${small}"><source src="${HOST}/videos/beats.mp4?v=0" type="video/mp4"><img src="${small}"></video>`)
  })
  it('video_tag escapes the source URLs and lazy-loads like image_tag', async () => {
    const tricky = { ...video, sources: [{ url: `${HOST}/v.mp4?a=1&b="2"`, mime_type: 'video/mp4' }] }
    expect(await render('{{ video | video_tag }}', { video: tricky })).toContain(`<source src="${HOST}/v.mp4?a=1&amp;b=&quot;2&quot;" type="video/mp4">`)
    expect(await render('{{ video | video_tag }}', { video }, sectionAt(4))).toContain('poster="')
    expect(await render('{{ video | video_tag }}', { video }, sectionAt(4))).toMatch(/loading="lazy">/)
    expect(await render('{{ video | video_tag }}', { video }, sectionAt(3))).not.toContain('loading=')
  })
  it('video_tag and external_video_tag fall back to the product title without alt text', async () => {
    const { alt, ...unnamed } = video
    expect(alt).toBe('Potion beats')
    expect(await render('{{ video | video_tag }}', { video: unnamed, product })).toContain('aria-label="Health potion"')
    expect(await render('{{ video | video_tag }}', { video: unnamed })).toContain('aria-label=""')
    const { alt: externalAlt, ...unnamedExternal } = external
    expect(externalAlt).toBe('Potion beats')
    expect(await render('{{ media | external_video_tag }}', { media: unnamedExternal, product })).toContain('title="Health potion"></iframe>')
  })
  // https://shopify.dev/docs/api/liquid/filters/external_video_url and https://shopify.dev/docs/api/liquid/filters/external_video_tag
  it('external_video_url and external_video_tag', async () => {
    const src = 'https://www.youtube.com/embed/vj01PAffOac?color=white&amp;controls=1&amp;enablejsapi=1&amp;modestbranding=1&amp;origin=https%3A%2F%2Fpolinas-potent-potions.myshopify.com&amp;playsinline=1&amp;rel=0'
    expect(await render("{{ media | external_video_url: color: 'white' | external_video_tag }}", { media: external }, origin)).toBe(`<iframe frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen="allowfullscreen" src="${src}" title="Potion beats"></iframe>`)
    expect(await render("{{ media | external_video_url: color: 'white' | external_video_tag: class: 'youtube-video' }}", { media: external }, origin)).toBe(`<iframe frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen="allowfullscreen" class="youtube-video" src="${src}" title="Potion beats"></iframe>`)
    expect(await render('{{ media | external_video_url: autoplay: 1 }}', { media: { ...external, host: 'vimeo', external_id: '1234' } })).toBe('https://player.vimeo.com/video/1234?autoplay=1')
    expect(await render('{{ media | external_video_url: autoplay: 1 | external_video_tag }}', { media: { ...external, host: 'vimeo', external_id: '1234' } })).toBe('<iframe frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen="allowfullscreen" src="https://player.vimeo.com/video/1234?autoplay=1" title="Potion beats"></iframe>')
  })
  it('the external_video_url result is a string to filters that read strings', async () => {
    const url = 'https://player.vimeo.com/video/1234?autoplay=1'
    const media = { ...external, host: 'vimeo', external_id: '1234' }
    expect(await render('{{ media | external_video_url: autoplay: 1 | size }}', { media })).toBe(String(url.length))
    expect(await render('{{ media | external_video_url: autoplay: 1 | json }}', { media })).toBe('"https:\\/\\/player.vimeo.com\\/video\\/1234?autoplay=1"')
  })
  it('external_video_url ignores hosts it does not embed, prototype names included', async () => {
    for (const host of ['dailymotion', 'constructor', '__proto__', 'toString']) expect(await render('[{{ media | external_video_url }}]', { media: { ...external, host } })).toBe('[]')
  })
  // https://shopify.dev/docs/api/liquid/filters/media_tag
  it('media_tag', async () => {
    const iframe = '<iframe frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen="allowfullscreen" image_size="400x" src="https://www.youtube.com/embed/vj01PAffOac?controls=1&amp;enablejsapi=1&amp;modestbranding=1&amp;origin=https%3A%2F%2Fpolinas-potent-potions.myshopify.com&amp;playsinline=1&amp;rel=0" title="Potion beats"></iframe>'
    expect(await render("{{ media | media_tag: image_size: '400x' }}", { media: external }, origin)).toBe(iframe)
    expect(await render('{{ media | media_tag }}', { media: video })).toMatch(/^<video playsinline="playsinline" controls="controls" preload="metadata" aria-label="Potion beats" poster="/)
    expect(await render('{{ media | media_tag }}', { media: { media_type: 'image', alt: 'Bottle', src: BEAKERS, width: 800, height: 400 } })).toBe(`<img src="${BEAKERS}&amp;width=800" alt="Bottle" srcset="${BEAKERS}&amp;width=352 352w" width="800" height="400">`)
  })
  it('media_tag renders an ImageDrop from product.media, which is how Task 7 builds image media', async () => {
    const media = [new ImageDrop({ src: BEAKERS, width: 800, height: 400, alt: 'Bottle' }, true), video, external]
    expect(await render('{% for m in media %}{{ m | media_tag }}|{% endfor %}', { media }, origin)).toMatch(/^<img src="[^"]+&amp;width=800" alt="Bottle" srcset="[^"]+&amp;width=352 352w" width="800" height="400">\|<video [^|]*<\/video>\|<iframe [^|]*<\/iframe>\|$/)
    expect(await render('{{ m | media_tag: class: "hero" }}', { m: new ImageDrop({ src: BEAKERS, width: 800, height: 400, alt: 'Bottle' }) })).toContain('height="400" class="hero">')
  })
  it('media_tag writes controls once, whether or not the template names them', async () => {
    expect(await render('{{ media | media_tag: controls: true }}', { media: video })).toMatch(/^<video playsinline="playsinline" controls="controls" preload=/)
    expect(await render('{{ media | media_tag: autoplay: true }}', { media: video })).toMatch(/^<video playsinline="playsinline" controls="controls" autoplay="autoplay" preload=/)
    expect(await render('{{ media | media_tag: controls: false }}', { media: video })).toMatch(/^<video playsinline="playsinline" preload=/)
  })
})

describe('shopify/objects/image', () => {
  const data = { src: BEAKERS, width: 3000, height: 2000, alt: 'Health potion', focal_point: { x: 50, y: 25 } }
  const run = async (source: string, scope: Record<string, unknown>) => (await renderLiquid(createShopifyLiquid(), source, scope)).html
  // https://shopify.dev/docs/api/liquid/objects/image
  it('ImageDrop prints as its src and exposes the image properties', async () => {
    const scope = { image: new ImageDrop(data) }
    expect(await run('{{ image }}', scope)).toBe(BEAKERS)
    expect(await run('{{ image.width }}x{{ image.height }} {{ image.alt }} {{ image.aspect_ratio }}', scope)).toBe('3000x2000 Health potion 1.5')
    expect(await run('{{ 3 | divided_by: image.aspect_ratio }}', scope)).toBe('2.0')
  })
  // https://shopify.dev/docs/api/liquid/objects/image_presentation and https://shopify.dev/docs/api/liquid/objects/focal_point
  it('ImageDrop presentation.focal_point is an object with x and y that prints as X% Y%', async () => {
    const header = new ImageDrop({ src: BEAKERS, focal_point: { x: 1.923076923, y: 9.791666667 } })
    expect(await run('{{ i.presentation.focal_point }}', { i: header })).toBe('1.9231% 9.7917%')
    expect(await run('{{ i.presentation.focal_point.x }} {{ i.presentation.focal_point.y }}', { i: header })).toBe('1.923076923 9.791666667')
    expect(await run('{{ i.presentation.focal_point }}|{{ i.presentation.focal_point.x }}', { i: new ImageDrop({ src: BEAKERS }) })).toBe('50% 50%|50')
    expect(await run('{{ image.presentation.focal_point }}', { image: new ImageDrop(data) })).toBe('50% 25%')
  })
  // https://shopify.dev/docs/api/liquid/objects/image#image-media_type
  it('ImageDrop media_type is image for product media and nil elsewhere', async () => {
    expect(await run('[{{ i.media_type }}]', { i: new ImageDrop(data) })).toBe('[]')
    expect(await run('[{{ i.media_type }}]', { i: new ImageDrop(data, true) })).toBe('[image]')
    expect(await run("{{ list | where: 'media_type', 'image' | size }}", { list: [new ImageDrop(data), new ImageDrop(data, true)] })).toBe('1')
  })
  it('ImageDrop gives preview_image only for product media', async () => {
    expect(await run('[{{ image.preview_image }}]', { image: new ImageDrop(data) })).toBe('[]')
    expect(await run('[{{ image.preview_image }}]', { image: new ImageDrop(data, true) })).toBe(`[${BEAKERS}]`)
  })
  it('image_url and image_tag accept an ImageDrop', async () => {
    expect(await run('{{ image | image_url: width: 450 }}', { image: new ImageDrop(data) })).toBe(`${BEAKERS}&width=450`)
    expect(await run('{{ image | image_url: width: 200 | image_tag }}', { image: new ImageDrop(data) })).toContain('alt="Health potion"')
  })
})
