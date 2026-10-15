import type { StoreData } from '../../src/shopify/store/types'

/** Freezes `value` and every object and array inside it. */
function deepFreeze<T> (value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const item of Object.values(value)) deepFreeze(item)
  }
  return value
}

/** The engine's sample store before it moved to the mock.shop catalogue: three hand-written products, two collections, two pages, a blog and two menus. The store tests pin their expectations to it, so it stays here as their fixture. */
export const legacySampleData: StoreData = deepFreeze<StoreData>({
  shop: { name: 'Sample Store', domain: 'sample-store.example', email: 'hello@sample-store.example', description: 'A sample store.', currency: 'USD', locale: 'en', enabled_payment_types: ['visa', 'master', 'american_express', 'paypal'] },
  products: [
    {
      id: 1001,
      handle: 'classic-tee',
      title: 'Classic Tee',
      description: '<p>A soft cotton tee.</p>',
      vendor: 'Sample Co',
      type: 'Shirts',
      tags: ['cotton', 'new'],
      images: [{ src: '/sample/images/classic-tee.jpg', width: 1200, height: 1200, alt: 'Classic Tee', id: 2001 }],
      options: ['Size', 'Color'],
      variants: [
        { id: 3001, title: 'S / Black', price: 2500, compare_at_price: 3000, available: true, option1: 'S', option2: 'Black' },
        { id: 3002, title: 'M / Black', price: 2500, compare_at_price: 3000, available: true, option1: 'M', option2: 'Black' },
        { id: 3003, title: 'L / White', price: 2700, available: false, option1: 'L', option2: 'White' }
      ]
    },
    {
      id: 1002,
      handle: 'canvas-bag',
      title: 'Canvas Bag',
      description: '<p>Carries everything.</p>',
      vendor: 'Sample Co',
      type: 'Bags',
      tags: ['canvas'],
      images: [{ src: '/sample/images/canvas-bag.jpg', width: 1000, height: 1250, alt: 'Canvas Bag', id: 2002 }],
      variants: [{ id: 3004, title: 'Default Title', price: 4500, available: true, option1: 'Default Title' }]
    },
    {
      id: 1003,
      handle: 'ceramic-mug',
      title: 'Ceramic Mug',
      description: '<p>Holds 350 ml.</p>',
      vendor: 'Kiln & Co',
      type: 'Home',
      tags: [],
      images: [{ src: '/sample/images/ceramic-mug.jpg', width: 800, height: 800, alt: '', id: 2003 }],
      variants: [{ id: 3005, title: 'Default Title', price: 1800, available: true, option1: 'Default Title' }]
    }
  ],
  collections: [
    { id: 4001, handle: 'frontpage', title: 'Home page', products: ['classic-tee', 'canvas-bag', 'ceramic-mug'] },
    { id: 4002, handle: 'apparel', title: 'Apparel', description: '<p>Things to wear.</p>', image: { src: '/sample/images/apparel.jpg', width: 1600, height: 900, alt: 'Apparel' }, products: ['classic-tee'] }
  ],
  pages: [
    { id: 5001, handle: 'about', title: 'About us', content: '<p>We make simple things.</p>' },
    { id: 5002, handle: 'contact', title: 'Contact', content: '<p>Write to us.</p>' }
  ],
  blogs: [
    {
      id: 6001,
      handle: 'news',
      title: 'News',
      articles: [
        { id: 7001, handle: 'hello-world', title: 'Hello world', content: '<p>Our first post.</p>', excerpt: '<p>Our first post.</p>', author: 'Sam Lee', published_at: '2026-01-15T10:00:00Z', tags: ['news'] },
        { id: 7002, handle: 'spring-collection', title: 'Spring collection', content: '<p>New colours are here.</p>', author: 'Sam Lee', published_at: '2026-03-01T10:00:00Z', image: { src: '/sample/images/spring.jpg', width: 1600, height: 1000, alt: 'Spring' } }
      ]
    }
  ],
  linklists: [
    { handle: 'main-menu', title: 'Main menu', links: [{ title: 'Home', url: '/' }, { title: 'Catalog', url: '/collections/all', links: [{ title: 'Apparel', url: '/collections/apparel' }] }, { title: 'Contact', url: '/pages/contact' }] },
    { handle: 'footer', title: 'Footer menu', links: [{ title: 'Search', url: '/search' }, { title: 'About us', url: '/pages/about' }] }
  ],
  images: { 'hero.jpg': { src: '/sample/images/hero.jpg', width: 2400, height: 1200, alt: '' } },
  cart: { items: [{ product_handle: 'classic-tee', variant_id: 3001, quantity: 2 }] },
  customer: null
})
