import type { StoreData } from '../store/types'
import { customerAccountMainMenu } from './default-menus'
import { sampleGiftCard } from './gift-card'
import { mockShopCatalog } from './mock-shop'

/** Freezes `value` and every object and array inside it. */
function deepFreeze<T> (value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const item of Object.values(value)) deepFreeze(item)
  }
  return value
}

/**
 * The public sample store for tests, demos and previews without data: Shopify's mock.shop `demostore` catalogue (`mock-shop.ts`: 29 apparel products, 8 collections, 2 pages, a blog with 3 articles, the main and footer menus, and the customer account menu every store has) in a shop of Debutify's own (`sample-store.example` is a reserved domain), with one line in the cart, one issued gift card (`sampleGiftCard`) and no customer. Product images are on Shopify's CDN; `hero.jpg` is a relative placeholder that the caller's `imageUrl` service maps to a real file. Its fields follow https://shopify.dev/docs/api/liquid/objects.
 *
 * It is frozen all the way down, because every render without `data` reads this one object: to change it, copy it (`structuredClone(sampleStoreData)`) and pass the copy as `data`.
 */
export const sampleStoreData: StoreData = deepFreeze<StoreData>({
  shop: { name: 'Sample Store', domain: 'sample-store.example', email: 'hello@sample-store.example', description: 'A sample store.', currency: 'USD', locale: 'en', enabled_payment_types: ['visa', 'master', 'american_express', 'paypal'] },
  ...structuredClone(mockShopCatalog),
  linklists: [...structuredClone(mockShopCatalog.linklists), structuredClone(customerAccountMainMenu)],
  gift_card: structuredClone(sampleGiftCard),
  images: { 'hero.jpg': { src: '/sample/images/hero.jpg', width: 2400, height: 1200, alt: '' } },
  cart: { items: [{ product_handle: 'sweatpants', variant_id: 43696926949398, quantity: 2 }] },
  customer: null
})
