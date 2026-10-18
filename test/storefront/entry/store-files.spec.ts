import { harness, harnessTheme, VISITOR } from './harness'

/** A product page that prints each source of its first model and video, the way a theme's `{% for source in media.sources %}` does. */
const theme = () => {
  const files = { ...harnessTheme().files } as Record<string, string>
  delete files['templates/product.json']
  return { files: { ...files, 'templates/product.liquid': '{% for media in product.media %}{% for source in media.sources %}[{{ source.url }}]{% endfor %}{% endfor %}' } }
}

describe('the files Shopify hosts for the store (videos and 3D models)', () => {
  it('print under the store\'s domain from the store\'s own address, as Shopify does', async () => {
    const { send } = harness({ theme: theme() }, { visitor: VISITOR })
    const page = await send('GET', '/products/display-cube')
    expect(page.text).toContain('[//debutify-sample.myshopify.com/cdn/shop/3d/models/o/1cccb72ac9dba814/box.glb?v=0]')
  })
  it('keep their address on Shopify\'s CDN in a sandboxed preview, whose address is not the store\'s domain and answers no /cdn/shop/ path', async () => {
    const { send } = harness({ theme: theme() }, { visitor: 'preview-token-0000000001', basePath: '/p/tok', sandbox: true })
    const page = await send('GET', '/p/tok/products/display-cube')
    expect(page.text).toContain('[https://cdn.shopify.com/3d/models/o/1cccb72ac9dba814/box.glb][https://cdn.shopify.com/3d/models/o/4c3494cd5a06e43f/box.usdz]')
    expect(page.text).not.toContain('/cdn/shop/3d/')
    const video = await send('GET', '/p/tok/products/video-tote')
    expect(video.text).toContain('[https://cdn.shopify.com/videos/c/vp/1bf9909c8b1b4c34ba3ff79a8fb486f4/1bf9909c8b1b4c34ba3ff79a8fb486f4.m3u8]')
  })
})
