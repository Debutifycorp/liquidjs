import { createShopifyLiquid, previewSampleData, renderLiquid, storefrontSampleData } from '../../src/shopify'
import { buildStore } from '../../src/shopify/store/build'

const liquid = createShopifyLiquid()
const render = async (source: string, scope: object) => (await renderLiquid(liquid, source, scope)).html
const store = buildStore(previewSampleData)
const product = (handle: string) => store.products.liquidMethodMissing(handle)

describe('previewSampleData', () => {
  it('is the parity store with three more products, and leaves the parity data as it was', () => {
    const handles = (previewSampleData.products ?? []).map(item => item.handle)
    expect(handles.slice(-3)).toEqual(['wholesale-tee', 'scented-candle', 'video-tote'])
    expect(handles).toHaveLength((storefrontSampleData.products ?? []).length + 3)
    expect(Object.isFrozen(previewSampleData)).toBe(true)
  })

  it('lists the products the parity store leaves unlisted, which its own lists and search do not show', async () => {
    const unlisted = ['gift-card', 'display-cube']
    expect((storefrontSampleData.products ?? []).filter(item => item.unlisted).map(item => item.handle).sort()).toEqual([...unlisted].sort())
    expect((previewSampleData.products ?? []).some(item => item.unlisted)).toBe(false)
    const listing = '{% for p in products %}{{ p.handle }},{% endfor %}'
    const parity = await render(listing, { products: buildStore(storefrontSampleData).products })
    const preview = await render(listing, { products: store.products })
    for (const handle of unlisted) {
      expect(parity).not.toContain(`${handle},`)
      expect(preview).toContain(`${handle},`)
    }
  })

  it('has a gift card that needs no shipping', async () => {
    expect(await render('{{ p["gift_card?"] }}/{% for v in p.variants %}{{ v.requires_shipping }}:{{ v.price }},{% endfor %}', { p: product('gift-card') })).toBe('true/false:2500,false:5000,false:10000,')
  })

  it('has a product with quantity price breaks and a quantity rule', async () => {
    expect(await render('{{ p["quantity_price_breaks_configured?"] }}/{% for b in p.variants.first.quantity_price_breaks %}{{ b.minimum_quantity }}@{{ b.price }},{% endfor %}/{{ p.variants.first.quantity_rule.min }}+{{ p.variants.first.quantity_rule.increment }}', { p: product('wholesale-tee') })).toBe('true/10@2100,25@1800,50@1500,/5+5')
  })

  it('has product disclosures a theme lists by surface, with their rich text content', async () => {
    const source = "{% assign disclosures = p.metafields.shopify.disclosure.value %}{% for d in disclosures %}{% if d.display_preferences.value.surfaces contains 'cart' %}{{ d.title.value }}: {{ d.content | metafield_tag }}{% endif %}{% endfor %}|{{ disclosures.size }}"
    const html = await render(source, { p: product('scented-candle') })
    expect(html).toContain('Warning: contains lead: ')
    expect(html).toContain('P65Warnings.ca.gov')
    expect(html).toContain('|2')
  })

  it('has video and external video media beside the image', async () => {
    expect(await render('{% for m in p.media %}{{ m.media_type }}{% if m.media_type == "video" %}:{{ m.sources.last.format }}{% endif %},{% endfor %}', { p: product('video-tote') })).toBe('image,video:mp4,external_video,')
  })
})
