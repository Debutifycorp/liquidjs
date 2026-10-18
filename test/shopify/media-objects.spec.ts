import { createShopifyLiquid, renderLiquid, storefrontSampleData } from '../../src/shopify'
import { buildProduct, buildStore } from '../../src/shopify/store/build'
import { productJson } from '../../src/shopify/store/product-json'

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
  it('gives a 3D model its files under the store and no aspect ratio, and prints its viewer', async () => {
    const p = buildProduct({
      id: 1,
      handle: 'cube',
      title: 'Cube',
      media: [
        { media_type: 'model', id: 7, alt: 'The cube in 3D', preview_image: { src: 'https://shop.example/cdn/shop/files/preview_images/box.jpg', width: 1024, height: 1024 }, sources: [{ url: 'https://cdn.shopify.com/3d/models/o/abc/box.glb', mime_type: 'model/gltf-binary', format: 'glb' }, { url: 'https://cdn.shopify.com/3d/models/o/def/box.usdz', mime_type: 'model/vnd.usdz+zip', format: 'usdz' }] }
      ],
      variants: [{ id: 9, title: 'Default Title', price: 1, available: true, option1: 'Default Title' }]
    }, '', undefined, undefined, 'shop.example')
    expect(await render('{% for m in p.media %}{{ m.media_type }}|{{ m.position }}|{{ m.alt }}|{{ m.aspect_ratio | json }}|{% for s in m.sources %}{{ s.url }}={{ s.format }},{% endfor %}{% endfor %}', { p }))
      .toBe('model|1|The cube in 3D|null|//shop.example/cdn/shop/3d/models/o/abc/box.glb?v=0=glb,//shop.example/cdn/shop/3d/models/o/def/box.usdz?v=0=usdz,')
    expect(await render('{{ p.media[0] | model_viewer_tag }}|{{ p.media[0] | media_tag }}', { p })).toContain('<model-viewer src="//shop.example/cdn/shop/3d/models/o/abc/box.glb?v=0" camera-controls="true"')
  })
  it('gives the preview picture of a video the video\'s alt text, as the parity store prints it', async () => {
    const p = buildProduct({
      id: 1,
      handle: 'clip',
      title: 'Clip',
      media: [{ media_type: 'video', id: 2, alt: 'The tote in a short clip', preview_image: { src: '/p.jpg', width: 960, height: 540 }, sources: [{ url: '/a.mp4', mime_type: 'video/mp4', format: 'mp4' }] }],
      variants: [{ id: 9, title: 'Default Title', price: 1, available: true, option1: 'Default Title' }]
    })
    expect(await render('{{ p.media[0].preview_image.alt }}|{{ p.media[0].preview_image | image_url: width: 300 | image_tag }}', { p })).toContain('The tote in a short clip|<img src="/p.jpg?width=300" alt="The tote in a short clip"')
  })
  it('prints a video, an external video and a 3D model in product.media | json as the parity store does', async () => {
    const store = buildStore({ ...storefrontSampleData, products: (storefrontSampleData.products ?? []).filter(item => ['video-tote', 'display-cube'].includes(item.handle)) })
    const cube = store.products.liquidMethodMissing('display-cube')
    const models = JSON.parse(await render("{{ p.media | where: 'media_type', 'model' | json }}", { p: cube }).then(html => html.replace(/\\\//g, '/')))
    expect(models).toEqual([{
      alt: 'The cube in 3D',
      id: 8100000000052,
      position: 2,
      preview_image: { aspect_ratio: 1, height: 1024, width: 1024, src: expect.stringMatching(/\/preview_images\/box\.jpg$/) },
      media_type: 'model',
      sources: [{ format: 'glb', mime_type: 'model/gltf-binary', url: expect.stringMatching(/\/cdn\/shop\/3d\/models\/o\/1cccb72ac9dba814\/box\.glb\?v=0$/) }, { format: 'usdz', mime_type: 'model/vnd.usdz+zip', url: expect.stringMatching(/\.usdz\?v=0$/) }]
    }])
    const tote = store.products.liquidMethodMissing('video-tote')
    const kinds = JSON.parse(await render('{{ p.media | json }}', { p: tote })).map((media: { media_type: string }) => media.media_type)
    expect(kinds).toEqual(['image', 'video', 'external_video'])
  })
  it('lists the HLS playlist of a video first in Liquid and last in the Ajax answer, as the parity store does', async () => {
    const data = { ...storefrontSampleData, products: (storefrontSampleData.products ?? []).filter(item => item.handle === 'video-tote') }
    const p = buildStore(data).products.liquidMethodMissing('video-tote')
    expect(await render('{% for s in p.media[1].sources %}{{ s.format }},{% endfor %}', { p })).toBe('m3u8,mp4,')
    const media = productJson(data, 'video-tote')?.media as Array<{ sources?: Array<{ format: string }> }>
    expect(media[1].sources?.map(source => source.format)).toEqual(['mp4', 'm3u8'])
  })
  it('rounds the aspect ratio of a media preview to three places in json only, as the parity store does', async () => {
    const data = { ...storefrontSampleData, products: (storefrontSampleData.products ?? []).filter(item => item.handle === 'video-tote') }
    const p = buildStore(data).products.liquidMethodMissing('video-tote')
    const ratios = await render('{% for m in p.media %}{% if m.media_type != "image" %}{{ m | json }};{% endif %}{% endfor %}', { p })
    expect(ratios).toContain('"preview_image":{"aspect_ratio":1.778,')
    expect(ratios).toContain('"preview_image":{"aspect_ratio":1.333,')
    expect(await render('{{ p.media[1].preview_image.aspect_ratio }}', { p })).toBe('1.7777777777777777')
  })
  it('lists the files of a video in json with the playlist last and the keys format, height, mime_type, url, width', async () => {
    const data = { ...storefrontSampleData, products: (storefrontSampleData.products ?? []).filter(item => item.handle === 'video-tote') }
    const p = buildStore(data).products.liquidMethodMissing('video-tote')
    const video = JSON.parse(await render('{{ p.media[1] | json }}', { p }))
    expect(video.sources.map((source: { format: string }) => source.format)).toEqual(['mp4', 'm3u8'])
    expect(Object.keys(video.sources[0])).toEqual(['format', 'height', 'mime_type', 'url', 'width'])
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
