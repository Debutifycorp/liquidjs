import { createShopifyLiquid, renderLiquid } from '../../src/shopify'
import { buildProduct } from '../../src/shopify/store/build'

const liquid = createShopifyLiquid()
const render = async (source: string, scope: object) => (await renderLiquid(liquid, source, scope)).html

describe('media objects', () => {
  it('gives a video its aspect ratio and duration', async () => {
    const p = buildProduct({
      id: 1,
      handle: 'clip',
      title: 'Clip',
      media: [
        { media_type: 'video', id: 2, preview_image: { src: '/p.jpg', width: 400, height: 400 }, sources: [{ url: '/a.m3u8', mime_type: 'application/x-mpegURL', format: 'm3u8' }, { url: '/a.mp4', mime_type: 'video/mp4', format: 'mp4', width: 1920, height: 1080 }], duration: 12500 },
        { media_type: 'video', id: 3, preview_image: { src: '/q.jpg', width: 300, height: 400 }, sources: [], aspect_ratio: 0.5 },
        { media_type: 'video', id: 4, preview_image: { src: '/r.jpg', width: 300, height: 600 }, sources: [] },
        { media_type: 'external_video', id: 5, host: 'youtube', external_id: 'abc', preview_image: { src: '/v.jpg', width: 1280, height: 720 } }
      ],
      variants: [{ id: 9, title: 'Default Title', price: 1, available: true, option1: 'Default Title' }]
    })
    expect(await render('{% for m in p.media %}{{ m.aspect_ratio | round: 3 }}/{{ m.duration | json }};{% endfor %}{{ 1 | divided_by: p.media[2].aspect_ratio }}', { p })).toBe('1.778/12500;0.5/null;0.5/null;1.778/null;2.0')
  })
  it('marks the product images a variant shows, and lists those variants', async () => {
    const p = buildProduct({
      id: 1,
      handle: 'tee',
      title: 'Tee',
      options: ['Color'],
      images: [{ src: '/front.jpg', id: 1 }, { src: '/red.jpg', id: 2 }, { src: '/blue.jpg', id: 3 }],
      variants: [
        { id: 10, title: 'Red', option1: 'Red', price: 1, available: true, image: { src: '/red.jpg', id: 2 } },
        { id: 11, title: 'Blue', option1: 'Blue', price: 1, available: true, image: { src: '/blue.jpg', id: 3 } },
        { id: 12, title: 'Navy', option1: 'Navy', price: 1, available: true, image: { src: '/blue.jpg', id: 3 } }
      ]
    })
    expect(await render("{{ p.images | where: 'attached_to_variant?', true | map: 'src' | join: ',' }}|{% for i in p.images %}{{ i.variants | map: 'id' | join: '+' }};{% endfor %}|{{ p.featured_image['attached_to_variant?'] }}|{{ p.images[1].product_id }}|{{ p.media[1]['attached_to_variant?'] | json }}", { p }))
      .toBe('/red.jpg,/blue.jpg|;10;11+12;|false|1|null')
  })
})
