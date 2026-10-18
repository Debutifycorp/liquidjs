import type { ProductData, StoreData } from '../store/types'
import { storefrontSampleData } from './storefront-data'

function deepFreeze<T> (value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const item of Object.values(value)) deepFreeze(item)
  }
  return value
}

const beanieImages = storefrontSampleData.products?.find(product => product.handle === 'beanie')?.images ?? []
const extraProducts: ProductData[] = [
  // https://shopify.dev/docs/api/liquid/objects/variant#variant-quantity_price_breaks and https://shopify.dev/docs/api/liquid/objects/quantity_rule: volume prices (B2B catalogues) with an order step of 5
  {
    id: 8100000000002,
    handle: 'wholesale-tee',
    title: 'Wholesale tee',
    description: '<p>A plain tee sold in packs of five, cheaper by the dozen.</p>',
    vendor: 'Debutify Parity',
    type: 'T-shirts',
    tags: ['wholesale'],
    images: beanieImages.slice(1, 2),
    options: ['Size'],
    variants: ['S', 'M', 'L'].map((size, i) => ({
      id: 8100000000021 + i,
      title: size,
      option1: size,
      price: 2400,
      available: true,
      inventory_management: 'shopify' as const,
      inventory_quantity: 500,
      quantity_price_breaks: [{ minimum_quantity: 10, price: 2100 }, { minimum_quantity: 25, price: 1800 }, { minimum_quantity: 50, price: 1500 }],
      quantity_rule: { min: 5, max: 200, increment: 5 }
    }))
  },
  // https://shopify.dev/docs/apps/build/product-merchandising/product-disclosures: the standard product metafield `shopify.disclosure`, a list of disclosure metaobjects with `title`, `content`, `symbol`, `jurisdictions` and `display_preferences` (the surfaces they show on), which Dawn's and Horizon's disclosures block reads
  {
    id: 8100000000003,
    handle: 'scented-candle',
    title: 'Scented candle',
    description: '<p>A hand-poured soy candle with a cotton wick.</p>',
    vendor: 'Debutify Parity',
    type: 'Candles',
    tags: ['home'],
    images: beanieImages.slice(2, 3),
    variants: [{ id: 8100000000031, title: 'Default Title', option1: 'Default Title', price: 2800, available: true }],
    metafields: {
      shopify: {
        disclosure: {
          type: 'list.metaobject_reference',
          value: [
            {
              title: { type: 'single_line_text_field', value: 'Warning: contains lead' },
              content: { type: 'rich_text_field', value: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', value: 'This product can expose you to chemicals known to the State of California to cause cancer. For more information go to www.P65Warnings.ca.gov.' }] }] } },
              jurisdictions: { type: 'list.single_line_text_field', value: ['US-CA'] },
              display_preferences: { type: 'json', value: { surfaces: ['product_page', 'cart'] } }
            },
            {
              title: { type: 'single_line_text_field', value: 'Keep away from children' },
              content: { type: 'rich_text_field', value: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', value: 'Never leave a burning candle unattended.' }] }] } },
              display_preferences: { type: 'json', value: { surfaces: ['product_page'] } }
            }
          ]
        }
      }
    }
  }
]

/**
 * `storefrontSampleData` for previewing a theme: the same store with two products added that the parity store does not hold, each for a feature a theme can have and the mock.shop catalogue cannot show: volume pricing with a quantity rule (`wholesale-tee`) and product disclosures (`scented-candle`). The parity store's unlisted products (`gift-card`, `video-tote`, `display-cube`, `olive-oil` and `pickup-mug`, which Shopify lists nowhere) are listed here, so a preview shows every feature in `/collections/all` and search; the products sit in no collection, so `/collections/all`, search and their own pages list them. Frozen all the way down, like the data it extends.
 */
export const previewSampleData: StoreData = deepFreeze<StoreData>({
  ...storefrontSampleData,
  products: [...(storefrontSampleData.products ?? []).map(product => product.unlisted ? { ...product, unlisted: false } : product), ...extraProducts]
})
