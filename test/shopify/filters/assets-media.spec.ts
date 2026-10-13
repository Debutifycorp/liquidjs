import { createShopifyLiquid, ImageDrop, renderLiquid } from '../../../src/shopify'

// Every expected string below is copied from the shopify.dev page cited above its test, with the shop's CDN host as the image `src` the test passes in.
const HOST = '//polinas-potent-potions.myshopify.com/cdn/shop'
const BEAKERS = `${HOST}/files/science-beakers-blue-light-new.jpg?v=1683744744`
const product = { title: 'Health potion', featured_image: { src: BEAKERS, width: 3000, height: 2000, alt: 'Health potion' } }
const assetUrl = (path: string) => `${HOST}/t/4/assets/${path}?v=1`

async function render (source: string, scope: Record<string, unknown> = { product }, init = {}) {
  const liquid = createShopifyLiquid({ services: { assetUrl } })
  const { html } = await renderLiquid(liquid, source, scope, init)
  return html
}

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
  it('writes no attribute whose name is not valid, so an array cannot inject markup', async () => {
    const pair = '{% assign pair = \'x" onerror="alert(1),v\' | split: \',\' %}'
    expect(await render(`${pair}{{ 'base.css' | asset_url | stylesheet_tag: pair }}`, {})).toBe(`<link href="${assetUrl('base.css')}" rel="stylesheet" type="text/css" media="all" />`)
    expect(await render(`${pair}{{ 'cart.js' | asset_url | script_tag: pair }}`, {})).toBe(`<script src="${assetUrl('cart.js')}" type="text/javascript"></script>`)
    expect(await render(`${pair}{{ product | image_url: width: 200 | image_tag: pair }}`)).not.toContain('onerror')
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
  it('image_url without a size still renders a URL', async () => {
    expect(await render('{{ product | image_url }}')).toBe(BEAKERS)
    expect(await render('{{ nothing | image_url }}', {})).toBe('')
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
  it('image_tag writes the focal point as object-position', async () => {
    const header = { src: `${HOST}/files/potions-header.png?v=1650325393`, width: 1300, height: 750, focal_point: { x: 1.923076923, y: 9.791666667 } }
    expect(await render('{{ header | image_url: width: 300 | image_tag }}', { header })).toBe(`<img src="${HOST}/files/potions-header.png?v=1650325393&amp;width=300" alt="" srcset="${HOST}/files/potions-header.png?v=1650325393&amp;width=300 300w" width="300" height="173" style="object-position:1.9231% 9.7917%;">`)
  })
  it('image_tag lazy-loads below the third section unless told otherwise', async () => {
    const liquid = createShopifyLiquid()
    const { html } = await renderLiquid(liquid, '{{ product | image_url: width: 200 | image_tag }}', { product }, { frames: [{ kind: 'section', section: { id: 's', type: 's', index: 4 }, container: {}, sectionObject: null }] })
    expect(html).toContain('height="133" loading="lazy">')
  })
  // https://shopify.dev/docs/api/liquid/filters/img_url
  it('img_url sizes through the imageUrl service', async () => {
    expect(await render('{{ product | img_url }}')).toBe(`${HOST}/files/science-beakers-blue-light-new.jpg?height=100&v=1683744744&width=100`)
    expect(await render("{{ product | img_url: '480x' }}")).toBe(`${BEAKERS}&width=480`)
    expect(await render("{{ product | img_url: '200x', scale: 2 }}")).toBe(`${BEAKERS}&width=400`)
    expect(await render("{{ product | img_url: 'large' }}")).toBe(`${HOST}/files/science-beakers-blue-light-new.jpg?height=480&v=1683744744&width=480`)
    expect(await render("{{ product | img_url: 'master' }}")).toBe(`${HOST}/files/science-beakers-blue-light-new.jpg?height=1024&v=1683744744&width=1024`)
    expect(await render("{{ product | img_url: 'x480' }}")).toBe(`${HOST}/files/science-beakers-blue-light-new.jpg?height=480&v=1683744744`)
  })
  const poster = `${HOST}/products/thumb.jpg?v=1655255324`
  const video = { media_type: 'video', alt: 'Potion beats', preview_image: { src: poster, width: 1920, height: 1080 }, sources: [{ url: `${HOST}/videos/beats.mp4?v=0`, mime_type: 'video/mp4', format: 'mp4' }, { url: `${HOST}/videos/beats.m3u8?v=0`, mime_type: 'application/x-mpegURL', format: 'm3u8' }] }
  const external = { media_type: 'external_video', alt: 'Potion beats', host: 'youtube', external_id: 'vj01PAffOac' }
  const origin = { request: { origin: 'https://polinas-potent-potions.myshopify.com' } }
  // https://shopify.dev/docs/api/liquid/filters/video_tag
  it('video_tag', async () => {
    const small = `${HOST}/products/thumb.jpg?height=100&amp;v=1655255324&amp;width=100`
    const sources = `<source src="${HOST}/videos/beats.mp4?v=0" type="video/mp4"><source src="${HOST}/videos/beats.m3u8?v=0" type="application/x-mpegURL">`
    expect(await render('{{ video | video_tag }}', { video })).toBe(`<video playsinline="playsinline" preload="metadata" aria-label="Potion beats" poster="${small}">${sources}<img src="${small}"></video>`)
    expect(await render('{{ video | video_tag: autoplay: true, loop: true, muted: true, controls: true }}', { video })).toBe(`<video playsinline="playsinline" autoplay="autoplay" loop="loop" muted="muted" controls="controls" preload="metadata" aria-label="Potion beats" poster="${small}"><source src="${HOST}/videos/beats.mp4?v=0" type="video/mp4"><img src="${small}"></video>`)
  })
  // https://shopify.dev/docs/api/liquid/filters/external_video_url and https://shopify.dev/docs/api/liquid/filters/external_video_tag
  it('external_video_url and external_video_tag', async () => {
    const src = 'https://www.youtube.com/embed/vj01PAffOac?color=white&amp;controls=1&amp;enablejsapi=1&amp;modestbranding=1&amp;origin=https%3A%2F%2Fpolinas-potent-potions.myshopify.com&amp;playsinline=1&amp;rel=0'
    expect(await render("{{ media | external_video_url: color: 'white' | external_video_tag }}", { media: external }, origin)).toBe(`<iframe frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen="allowfullscreen" src="${src}" title="Potion beats"></iframe>`)
    expect(await render("{{ media | external_video_url: color: 'white' | external_video_tag: class: 'youtube-video' }}", { media: external }, origin)).toBe(`<iframe frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen="allowfullscreen" class="youtube-video" src="${src}" title="Potion beats"></iframe>`)
    expect(await render('{{ media | external_video_url: autoplay: 1 }}', { media: { ...external, host: 'vimeo', external_id: '1234' } })).toBe('https://player.vimeo.com/video/1234?autoplay=1')
  })
  // https://shopify.dev/docs/api/liquid/filters/media_tag
  it('media_tag', async () => {
    const iframe = '<iframe frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen="allowfullscreen" image_size="400x" src="https://www.youtube.com/embed/vj01PAffOac?controls=1&amp;enablejsapi=1&amp;modestbranding=1&amp;origin=https%3A%2F%2Fpolinas-potent-potions.myshopify.com&amp;playsinline=1&amp;rel=0" title="Potion beats"></iframe>'
    expect(await render("{{ media | media_tag: image_size: '400x' }}", { media: external }, origin)).toBe(iframe)
    expect(await render('{{ media | media_tag }}', { media: video })).toMatch(/^<video playsinline="playsinline" controls="controls" preload="metadata" aria-label="Potion beats" poster="/)
    expect(await render('{{ media | media_tag }}', { media: { media_type: 'image', alt: 'Bottle', src: BEAKERS, width: 800, height: 400 } })).toBe(`<img src="${BEAKERS}&amp;width=800" alt="Bottle" srcset="${BEAKERS}&amp;width=352 352w" width="800" height="400">`)
  })
})

describe('shopify/objects/image', () => {
  const data = { src: BEAKERS, width: 3000, height: 2000, alt: 'Health potion', focal_point: { x: 50, y: 25 } }
  const run = async (source: string, scope: Record<string, unknown>) => (await renderLiquid(createShopifyLiquid(), source, scope)).html
  // https://shopify.dev/docs/api/liquid/objects/image
  it('ImageDrop prints as its src and exposes the image properties', async () => {
    const scope = { image: new ImageDrop(data) }
    expect(await run('{{ image }}', scope)).toBe(BEAKERS)
    expect(await run('{{ image.width }}x{{ image.height }} {{ image.alt }} {{ image.aspect_ratio }} {{ image.media_type }}', scope)).toBe('3000x2000 Health potion 1.5 image')
    expect(await run('{{ 3 | divided_by: image.aspect_ratio }}', scope)).toBe('2.0')
    expect(await run('{{ image.focal_point }}', scope)).toBe('50% 25%')
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
