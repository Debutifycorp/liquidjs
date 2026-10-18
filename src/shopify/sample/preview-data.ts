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
  },
  // https://shopify.dev/docs/api/liquid/objects/video and https://shopify.dev/docs/api/liquid/objects/external_video: a hosted video (a CC0 clip from MDN) and a YouTube one beside the product's image
  {
    id: 8100000000004,
    handle: 'video-tote',
    title: 'Tote with a video',
    description: '<p>A canvas tote bag, shown in a short clip.</p>',
    vendor: 'Debutify Parity',
    type: 'Bags',
    tags: ['video'],
    images: beanieImages.slice(3, 4),
    media: [
      { media_type: 'image', ...beanieImages[3] },
      { media_type: 'video', id: 8100000000041, alt: 'The tote in a short clip', preview_image: beanieImages[3], duration: 5000, sources: [{ url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', mime_type: 'video/mp4', format: 'mp4', width: 640, height: 360 }] },
      { media_type: 'external_video', id: 8100000000042, alt: 'The tote on YouTube', host: 'youtube', external_id: 'dQw4w9WgXcQ', preview_image: beanieImages[2] }
    ],
    variants: [{ id: 8100000000043, title: 'Default Title', option1: 'Default Title', price: 3600, available: true }]
  }
]

/**
 * `storefrontSampleData` for previewing a theme: the same store with three products added that the parity store does not hold, each for a feature a theme can have and the mock.shop catalogue cannot show: volume pricing with a quantity rule (`wholesale-tee`), product disclosures (`scented-candle`) and hosted and external video (`video-tote`). The parity store's unlisted products (here its `gift-card`) are listed, so a preview shows every feature in `/collections/all` and search. They sit in no collection, so `/collections/all`, search and their own pages list them; the parity scenarios compare `storefrontSampleData` with recordings of the parity store, which is why they are not in it. Frozen all the way down, like the data it extends.
 */
export const previewSampleData: StoreData = deepFreeze<StoreData>({
  ...storefrontSampleData,
  products: [...(storefrontSampleData.products ?? []).map(product => product.unlisted ? { ...product, unlisted: false } : product), ...extraProducts]
})
