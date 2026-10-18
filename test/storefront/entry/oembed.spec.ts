import { harness } from './harness'

describe('the oEmbed addresses content_for_header links', () => {
  it('answers a product with one offer for each variant, in Rails JSON and its prices as floats (ajax-endpoint-links)', async () => {
    const { send } = harness()
    const answer = await send('GET', '/products/hoodie.oembed')
    expect(answer.status).toBe(200)
    expect(answer.headers.get('content-type')).toBe('application/json+oembed; charset=utf-8')
    const json = JSON.parse(answer.text)
    expect(Object.keys(json)).toEqual(['product_id', 'title', 'description', 'brand', 'offers', 'thumbnail_url', 'url', 'provider', 'version', 'type'])
    expect(json).toMatchObject({ product_id: 'hoodie', brand: 'Mock.shop', url: expect.stringMatching(/^https:\/\/[^/]+\/products\/hoodie$/), version: '1.0', type: 'link' })
    expect(Object.keys(json.offers[0])).toEqual(['title', 'offer_id', 'sku', 'price', 'currency_code', 'in_stock'])
    expect(answer.text).toContain('"price":90.0,')
    expect(answer.text).toContain('\\u003cp\\u003e')
    expect(answer.text).toContain('\\/\\/cdn.shopify.com\\/')
    expect(answer.text).not.toContain('<')
  })

  it('prices the offers in the market of the page', async () => {
    const { send } = harness()
    const text = (await send('GET', '/en-eu/products/hoodie.oembed')).text
    expect(text).toContain('"price":82.95,"currency_code":"EUR"')
    expect(JSON.parse(text).url).toMatch(/\/en-eu\/products\/hoodie$/)
  })

  it('answers a collection with its products oldest first and its own .oembed address', async () => {
    const { send } = harness()
    const json = JSON.parse((await send('GET', '/collections/tops.oembed')).text)
    expect(Object.keys(json)).toEqual(['title', 'description', 'products', 'thumbnail_url', 'url', 'provider', 'version', 'type'])
    expect(json.url).toMatch(/\/collections\/tops\.oembed$/)
    expect(json.products).toHaveLength(15)
    expect(json.products[0].product_id).toBe('men-t-shirt')
    expect(Object.keys(json.products[0])).toEqual(['product_id', 'title', 'description', 'brand', 'offers', 'thumbnail_url'])
  })

  it('answers 404 with an empty body for a handle the store lacks', async () => {
    const { send } = harness()
    const answer = await send('GET', '/products/nope.oembed')
    expect([answer.status, answer.text, answer.headers.get('content-type')]).toEqual([404, '', 'application/json+oembed; charset=utf-8'])
  })
})
