import { recommendationsJson, storefrontSampleData } from '../../src/shopify'
import type { StoreData } from '../../src/shopify'

// https://shopify.dev/docs/storefronts/themes/product-merchandising/recommendations/complementary-products: complementary products are set up by the merchant, the API serves them with intent=complementary, and "products that are out of stock or set to a price of 0" are left out.

const hoodie = storefrontSampleData.products?.find(product => product.handle === 'hoodie')
const handles = (answer: Record<string, unknown>) => (answer.products as Array<{ handle: string }>).map(product => product.handle)

describe('complementary recommendations', () => {
  it('are the products the merchant set up for the product, in that order', () => {
    const data: StoreData = { ...storefrontSampleData, products: (storefrontSampleData.products ?? []).map(product => product.handle === 'hoodie' ? { ...product, complementary_products: ['beanie', 'black-sunnies', 'hoodie', 'no-such-product'] } : product) }
    const answer = recommendationsJson(data, { productId: hoodie?.id ?? 0, intent: 'complementary' })
    expect(handles(answer)).toEqual(['beanie', 'black-sunnies'])
    expect(answer.intent).toBe('complementary')
  })

  it('are none for a product with none set up', () => {
    expect(handles(recommendationsJson(storefrontSampleData, { productId: hoodie?.id ?? 0, intent: 'complementary' }))).toEqual([])
  })
})
