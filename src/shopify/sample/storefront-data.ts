import type { ImageData } from '../types'
import type { PageData, ProductData, StoreData, VariantData } from '../store/types'
import { COUNTRY_OPTIONS } from './country-options'
import { customerAccountMainMenu } from './default-menus'
import { sampleGiftCard } from './gift-card'
import { mockShopCatalog } from './mock-shop'

/** Deep-freezes the dataset, like `sampleStoreData`. */
function freeze<T> (value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}

const catalog = structuredClone(mockShopCatalog)

function product (handle: string): ProductData {
  const found = catalog.products.find(p => p.handle === handle)
  if (!found) throw new Error(`the mock.shop catalogue has no product ${handle}`)
  return found
}

function variant (handle: string, id: number): VariantData {
  const found = product(handle).variants.find(v => v.id === id)
  if (!found) throw new Error(`${handle} has no variant ${id}`)
  return found
}

// What the catalogue does not hold, added for the parity scenarios. mock.shop leaves product types empty and has no weights, metafields, compare-at prices, selling plans or best-selling order; Shopify tracks every variant's stock.
const TYPES: Record<string, string> = {
  slides: 'Sandals', sweatpants: 'Pants', leggings: 'Pants', shorts: 'Shorts', 'men-t-shirt': 'T-shirts', 'women-t-shirt': 'T-shirts', 'workout-shirt': 'T-shirts', 'hoodie-old': 'Hoodies', hoodie: 'Hoodies', 'men-crewneck': 'Sweaters', 'women-crewneck': 'Sweaters', 'half-zip': 'Sweaters', 'light-puffer': 'Jackets', puffer: 'Jackets', 'puffer-jacket': 'Jackets', 'canvas-sneakers': 'Shoes', 'white-leather-sneakers': 'Shoes', 'gray-leather-sneakers': 'Shoes', 'gray-runners': 'Shoes', 'high-top-sneakers': 'Shoes', frontpack: 'Bags', 'black-sunnies': 'Sunglasses', 'clear-sunnies': 'Sunglasses', beanie: 'Hats'
}
const WEIGHTS: Record<string, number> = { Shoes: 900, Jackets: 700, Hoodies: 600, Sweaters: 500, Bags: 800, Sunglasses: 50 }
const MATERIALS: Record<string, string> = { 'T-shirts': 'Cotton', Hoodies: 'Cotton', Sweaters: 'Cotton', Jackets: 'Nylon', Hats: 'Wool' }
for (const p of catalog.products) {
  p.type = p.handle.startsWith('soft-cotton-hoodie-in-') ? 'Hoodies' : TYPES[p.handle] ?? ''
  for (const v of p.variants) Object.assign(v, { inventory_management: 'shopify', weight: WEIGHTS[p.type] ?? 300 })
  if (MATERIALS[p.type]) p.metafields = { custom: { material: MATERIALS[p.type] } }
}
// Shopify titles a variant by its option values joined with ' / ', and the Admin API cannot set a title, so the parity store titles mock.shop's size-only hoodie variants (a combined-listing artefact) "Green / Small" and the like.
for (const v of catalog.products.flatMap(p => p.variants)) v.title = [v.option1, v.option2, v.option3].filter(value => value != null).join(' / ')
product('canvas-sneakers').metafields = { custom: { material: 'Canvas' } }
for (const handle of ['white-leather-sneakers', 'gray-leather-sneakers']) product(handle).metafields = { custom: { material: 'Leather' } }

// No `sales_rank` is set: the parity store has had no sales, so Shopify lists its products newest first for `best-selling` (fixture `probe-collection-sort-best-selling`), and no Admin API sets a sales rank.
// A product on sale (every variant), and the one product a template suffix picks (`templates/product.probe.liquid`).
for (const v of product('white-leather-sneakers').variants) v.compare_at_price = 11000
product('white-leather-sneakers').template_suffix = 'probe'
// One variant on sale, and two with low stock.
variant('hoodie', 43695847538710).compare_at_price = 11000
Object.assign(variant('sweatpants', 43696926949398), { inventory_quantity: 3 })
// A sold-out size that keeps selling: Shopify then counts it available.
Object.assign(variant('high-top-sneakers', 43696963485718), { inventory_policy: 'continue', available: true })
// The heaviest product, past the rest-of-world rate's 2 kg limit.
for (const v of product('gray-leather-sneakers').variants) v.weight = 3000
// Optional subscriptions on the slides; the frontpack is sold only with its plan.
product('slides').selling_plan_groups = [{
  id: 'gid-70001',
  name: 'Subscribe and save',
  options: [{ name: 'Delivery every', values: ['2 weeks', 'Month'] }],
  selling_plans: [
    { id: 71001, name: 'Every 2 weeks, 10% off', options: ['2 weeks'], recurring_deliveries: true, price_adjustments: [{ value_type: 'percentage', value: 10 }] },
    { id: 71002, name: 'Every month, $2.00 off', options: ['Month'], recurring_deliveries: true, price_adjustments: [{ value_type: 'fixed_amount', value: 200 }] }
  ]
}]
Object.assign(product('frontpack'), {
  requires_selling_plan: true,
  selling_plan_groups: [{
    id: 'gid-70002',
    name: 'Frontpack rental',
    options: [{ name: 'Plan', values: ['Monthly rental'] }],
    selling_plans: [{ id: 71003, name: 'Monthly rental', options: ['Monthly rental'], recurring_deliveries: true, price_adjustments: [{ value_type: 'price', value: 2500 }] }]
  }]
})

// The accessories collection sorts by best sellers; the featured collection is the one a template suffix picks (`templates/collection.probe.liquid`).
Object.assign(catalog.collections.find(c => c.handle === 'accessories') ?? {}, { sort_order: 'best-selling' })
Object.assign(catalog.collections.find(c => c.handle === 'featured') ?? {}, { template_suffix: 'probe' })
// The parity store has Shopify's "Home page" collection (handle `frontpage`), which a new store comes with and mock.shop's dataset does not hold: empty, as in a store whose merchant has put nothing on the home page (scenario `page-collections` lists it, between Featured and Men). The engine does not invent it, because a store may delete it; this dataset holds it because the parity store has it.
catalog.collections.push({ id: 50101, handle: 'frontpage', title: 'Home page', products: [] })

// The contact page uses the theme's contact template; the pages the theme's FAQ and order-tracking templates show, and an about page, are added.
Object.assign(catalog.pages.find(p => p.handle === 'contact') ?? {}, { template_suffix: 'contact' })
const pages: PageData[] = [
  ...catalog.pages,
  { id: 50002, handle: 'faq', title: 'FAQ', content: '<p>Answers to common questions.</p>', template_suffix: 'faq' },
  { id: 50003, handle: 'about', title: 'About', content: '<p>We make everyday clothing.</p>' },
  { id: 50004, handle: 'track-order', title: 'Track your order', content: '<p>Where is it?</p>', template_suffix: 'track-order' }
]

function picture (handle: string, n: number): ImageData {
  const found = product(handle).images?.[n]
  if (!found) throw new Error(`${handle} has no image ${n}`)
  return { ...found }
}

// The unlisted products. Shopify's status Unlisted keeps a product out of every collection, search, recommendation and list, while its page opens at its address, so these products hold the features the mock.shop catalogue cannot show (a gift card, video, a 3D model, unit prices, ratings, local pickup) and change none of the recordings of the products, collections and searches the parity store already had. Their pictures are the catalogue's, which Shopify fetches from their URLs; the files of the hosted video and of the model, and the pictures Shopify made of them, are the store's own (`tools/shopify-parity/seed/unlisted.mjs` puts them there and reads their addresses back).
/** Where the parity store's own files are on Shopify's CDN: the pictures of a video, a YouTube video and a 3D model are made by the store from the media it was given. */
const STORE_FILES = 'https://cdn.shopify.com/s/files/1/0956/7315/5883/files/'

const unlisted: ProductData[] = [
  // https://shopify.dev/docs/api/liquid/objects/product#product-gift_card?: a gift card product has `gift_card?` true; its variants need no shipping and keep no stock
  {
    id: 8100000000001,
    handle: 'gift-card',
    created_at: '2026-10-18T07:47:33-04:00',
    published_at: '2026-10-18T07:47:35-04:00',
    title: 'Gift card',
    description: '<p>A digital gift card, sent by email, to spend on anything in the store.</p>',
    vendor: 'Debutify Parity',
    type: 'Gift Cards',
    tags: ['gift-card'],
    gift_card: true,
    unlisted: true,
    images: [picture('beanie', 0)],
    options: ['Denominations'],
    variants: [2500, 5000, 10000].map((price, i) => ({ id: 8100000000011 + i, title: `$${price / 100}`, option1: `$${price / 100}`, price, available: true, requires_shipping: false, taxable: false, inventory_management: null }))
  },
  // https://shopify.dev/docs/api/liquid/objects/video and https://shopify.dev/docs/api/liquid/objects/external_video: a hosted video (a CC0 clip from MDN) and a YouTube one beside the product's image
  {
    id: 8100000000004,
    handle: 'video-tote',
    created_at: '2026-10-18T07:45:32-04:00',
    published_at: '2026-10-18T07:45:45-04:00',
    title: 'Tote with a video',
    description: '<p>A canvas tote bag, shown in a short clip.</p>',
    vendor: 'Debutify Parity',
    type: 'Bags',
    tags: ['video'],
    unlisted: true,
    images: [picture('beanie', 3)],
    media: [
      { media_type: 'image', ...picture('beanie', 3) },
      {
        media_type: 'video',
        id: 8100000000041,
        alt: 'The tote in a short clip',
        preview_image: { src: `${STORE_FILES}preview_images/1bf9909c8b1b4c34ba3ff79a8fb486f4.thumbnail.0000000000.jpg`, width: 960, height: 540 },
        duration: 5050,
        sources: [
          { url: 'https://cdn.shopify.com/videos/c/vp/1bf9909c8b1b4c34ba3ff79a8fb486f4/1bf9909c8b1b4c34ba3ff79a8fb486f4.SD-480p-1.2Mbps-98029235.mp4', mime_type: 'video/mp4', format: 'mp4', width: 852, height: 480 },
          { url: 'https://cdn.shopify.com/videos/c/vp/1bf9909c8b1b4c34ba3ff79a8fb486f4/1bf9909c8b1b4c34ba3ff79a8fb486f4.m3u8', mime_type: 'application/x-mpegURL', format: 'm3u8', width: 852, height: 480 }
        ]
      },
      { media_type: 'external_video', id: 8100000000042, alt: 'The tote on YouTube', host: 'youtube', external_id: 'jNQXAC9IVRw', preview_image: { src: `${STORE_FILES}preview_images/hqdefault.jpg`, width: 480, height: 360 } }
    ],
    variants: [{ id: 8100000000043, title: 'Default Title', option1: 'Default Title', price: 3600, available: true, inventory_management: 'shopify', inventory_quantity: 20 }]
  },
  // https://shopify.dev/docs/api/liquid/objects/model: a 3D model (Box by Cesium, CC BY 4.0, from the Khronos glTF sample assets) beside the product's image
  {
    id: 8100000000005,
    handle: 'display-cube',
    created_at: '2026-10-18T07:45:48-04:00',
    published_at: '2026-10-18T07:45:59-04:00',
    title: 'Display cube',
    description: '<p>A small cube to turn around in 3D.</p>',
    vendor: 'Debutify Parity',
    type: 'Decor',
    tags: ['3d'],
    unlisted: true,
    images: [picture('beanie', 1)],
    media: [
      { media_type: 'image', ...picture('beanie', 1) },
      {
        media_type: 'model',
        id: 8100000000052,
        alt: 'The cube in 3D',
        preview_image: { src: `${STORE_FILES}preview_images/box.jpg`, width: 1024, height: 1024 },
        sources: [
          { url: 'https://cdn.shopify.com/3d/models/o/1cccb72ac9dba814/box.glb', mime_type: 'model/gltf-binary', format: 'glb' },
          { url: 'https://cdn.shopify.com/3d/models/o/4c3494cd5a06e43f/box.usdz', mime_type: 'model/vnd.usdz+zip', format: 'usdz' }
        ]
      }
    ],
    variants: [{ id: 8100000000051, title: 'Default Title', option1: 'Default Title', price: 1800, available: true, inventory_management: 'shopify', inventory_quantity: 20 }]
  },
  // https://shopify.dev/docs/api/liquid/objects/unit_price_measurement and https://shopify.dev/docs/api/liquid/objects/metafield (the `rating` type): a unit price per 100 ml and the rating the review apps write to `reviews.rating` and `reviews.rating_count`
  {
    id: 8100000000006,
    handle: 'olive-oil',
    created_at: '2026-10-18T07:46:01-04:00',
    published_at: '2026-10-18T07:46:04-04:00',
    title: 'Olive oil',
    description: '<p>Cold-pressed olive oil in glass.</p>',
    vendor: 'Debutify Parity',
    type: 'Pantry',
    tags: ['pantry'],
    unlisted: true,
    images: [picture('beanie', 2)],
    options: ['Size'],
    metafields: { reviews: { rating: { type: 'rating', value: { scale_min: '1.0', scale_max: '5.0', value: '4.5' } }, rating_count: { type: 'number_integer', value: 37 } } },
    variants: [
      { id: 8100000000061, title: '250 ml', option1: '250 ml', price: 900, available: true, inventory_management: 'shopify', inventory_quantity: 40, weight: 400, unit_price_measurement: { measured_type: 'volume', quantity_value: 250, quantity_unit: 'ml', reference_value: 100, reference_unit: 'ml' } },
      { id: 8100000000062, title: '500 ml', option1: '500 ml', price: 1600, available: true, inventory_management: 'shopify', inventory_quantity: 40, weight: 700, unit_price_measurement: { measured_type: 'volume', quantity_value: 500, quantity_unit: 'ml', reference_value: 100, reference_unit: 'ml' } },
      { id: 8100000000063, title: '1 L', option1: '1 L', price: 2800, available: true, inventory_management: 'shopify', inventory_quantity: 40, weight: 1300, unit_price_measurement: { measured_type: 'volume', quantity_value: 1, quantity_unit: 'l', reference_value: 100, reference_unit: 'ml' } }
    ]
  },
  // https://shopify.dev/docs/api/liquid/objects/store_availability: stock at the one store location, which the recording of these pages has local pickup switched on for (`tools/shopify-parity/record.mjs` switches it on for a scenario that says `pickup` and off again); the Large size is sold past zero stock, so it can be bought and cannot be picked up
  {
    id: 8100000000007,
    handle: 'pickup-mug',
    created_at: '2026-10-18T07:46:05-04:00',
    published_at: '2026-10-18T07:46:09-04:00',
    title: 'Pickup mug',
    description: '<p>A stoneware mug you can collect from the shop.</p>',
    vendor: 'Debutify Parity',
    type: 'Kitchen',
    tags: ['pickup'],
    unlisted: true,
    // Horizon shows local pickup only through a template of its own that the parity store adds (`tools/shopify-parity/lib/derived.mjs`); a theme without that template shows the product with its default one
    template_suffix: 'parity-pickup',
    images: [picture('beanie', 4)],
    options: ['Size'],
    variants: [
      { id: 8100000000071, title: 'Small', option1: 'Small', price: 1400, available: true, inventory_management: 'shopify', inventory_quantity: 5, weight: 300 },
      { id: 8100000000072, title: 'Large', option1: 'Large', price: 1800, available: true, inventory_management: 'shopify', inventory_policy: 'continue', inventory_quantity: 0, weight: 400 }
    ]
  }
]

/** The dataset the parity store is seeded from (item 22, `tools/shopify-parity/` in the Debutify repository): Shopify's mock.shop `demostore` catalogue (`mock-shop.ts`) with what the parity scenarios need on top, in a USD shop of its own: product types, weights, material metafields, compare-at prices, best-seller ranks, selling plans, template suffixes, three pages, the Home page collection, one issued gift card (`sampleGiftCard`, served at its `url`; the parity store holds none), the six card types the store accepts, a privacy policy, storefront filters, discounts, shipping zones, three markets, and French as a second language with its translations. Prices are USD cents. */
export const storefrontSampleData: StoreData = freeze({
  shop: {
    name: 'Debutify Parity',
    domain: 'debutify-sample.myshopify.com',
    email: 'store@example.com',
    description: 'Everyday clothing, made well.',
    currency: 'USD',
    locale: 'en',
    money_format: '${{amount}}', // eslint-disable-line no-template-curly-in-string
    money_with_currency_format: '${{amount}} USD', // eslint-disable-line no-template-curly-in-string
    enabled_payment_types: ['visa', 'master', 'american_express', 'paypal', 'diners_club', 'discover'],
    // the parity store has the privacy policy Shopify writes for a new store and no other (its footers list that one, `/policies/privacy-policy`, and the other policies answer 404); this one is a short stand-in for Shopify's text
    policies: [{ type: 'privacy_policy', body: '<p>Debutify Parity collects only what it needs to take and deliver your orders: your name, your email and shipping addresses, and what you buy. We never sell it. To see, correct or delete what we hold about you, write to store@example.com.</p>' }]
  },
  products: [...catalog.products, ...unlisted],
  collections: catalog.collections,
  pages,
  blogs: catalog.blogs,
  linklists: [...catalog.linklists, structuredClone(customerAccountMainMenu)],
  gift_card: structuredClone(sampleGiftCard),
  filters: [
    { attribute: 'availability' },
    { attribute: 'price' },
    { attribute: 'vendor', label: 'Brand' },
    { attribute: 'product_type' },
    { attribute: 'tag', label: 'More filters', operator: 'AND' },
    { attribute: 'option', option: 'Color' },
    { attribute: 'option', option: 'Size' },
    { attribute: 'metafield', metafield: { namespace: 'custom', key: 'material' }, label: 'Material' }
  ],
  discounts: [
    { id: 80001, type: 'amount_off_order', title: 'Welcome 10%', code: 'WELCOME10', value: { percentage: 10 }, combines_with: { product: true } },
    { id: 80002, type: 'amount_off_products', title: 'Shoes $5 off', code: 'SHOES5', value: { amount: 500 }, items: { collections: ['shoes'] } },
    { id: 80003, type: 'free_shipping', title: 'Free shipping over $100', code: 'FREESHIP', minimum: { subtotal: 10000 } },
    { id: 80004, type: 'amount_off_products', title: 'Beanie week', value: { percentage: 20 }, items: { products: ['beanie'] } },
    { id: 80005, type: 'buy_x_get_y', title: 'Buy 2 tops, get sunnies', code: 'BUNDLE', buys: { items: { collections: ['tops'] }, quantity: 2 }, gets: { items: { products: ['black-sunnies'] }, quantity: 1, value: { percentage: 100 } }, uses_per_order: 1 },
    { id: 80006, type: 'buy_x_get_y', title: 'Second pair of slides half off', buys: { items: { products: ['slides'] }, quantity: 1 }, gets: { items: { products: ['slides'] }, quantity: 1, value: { percentage: 50 } }, uses_per_order: 1 }
  ],
  shipping_zones: [
    { name: 'United States', countries: [{ code: 'US' }], rates: [{ name: 'Standard', price: 500, max_subtotal: 9999 }, { name: 'Free standard', price: 0, min_subtotal: 10000 }, { name: 'Express', price: 1500 }] },
    { name: 'Canada', countries: [{ code: 'CA' }], rates: [{ name: 'Standard', price: 1000 }] },
    { name: 'Rest of world', countries: 'rest_of_world', rates: [{ name: 'International', price: 2000, max_weight: 2000 }, { name: 'International heavy', price: 4000, min_weight: 2001 }] }
  ],
  markets: [
    { handle: 'us', name: 'United States', primary: true, countries: [{ iso_code: 'US', name: 'United States' }], currency: { iso_code: 'USD', symbol: '$', rate: 1 }, languages: ['en'] },
    { handle: 'ca', name: 'Canada', countries: [{ iso_code: 'CA', name: 'Canada' }], currency: { iso_code: 'CAD', symbol: '$', rate: 1.35, rounding: true }, languages: ['en', 'fr'], subfolder: 'ca' },
    // Shopify's market setting "Hide compare-at" for a market with an EEA country, which hides compare-at prices from EEA customers when the primary market is outside the EEA (https://help.shopify.com/en/manual/compliance/legal/pricing-indication-directive; the page gives both defaults, on and off). The parity store has it on for this market: no compare-at price in Liquid or Ajax (fixtures `probe-product-en-eu-hoodie` and `ajax-product-js`). A display setting only: the parity seed (`tools/shopify-parity/seed/markets.mjs`) reads a market's handle, name, countries, languages, subfolder and currency, not this.
    { handle: 'eu', name: 'Europe', hide_compare_at_prices: true, countries: [{ iso_code: 'FR', name: 'France' }, { iso_code: 'DE', name: 'Germany' }, { iso_code: 'IT', name: 'Italy' }, { iso_code: 'ES', name: 'Spain' }, { iso_code: 'NL', name: 'Netherlands' }], currency: { iso_code: 'EUR', symbol: '€', rate: 0.92, rounding: true }, languages: ['en', 'fr'], subfolder: 'eu' }
  ],
  languages: [{ iso_code: 'en', name: 'English', endonym_name: 'English' }, { iso_code: 'fr', name: 'French', endonym_name: 'français' }],
  translations: {
    fr: {
      // the shop has no translatable name on Shopify (`TranslatableResourceType` SHOP translates the meta title and description), so only its description is French (fixtures `probe-page-fr-ca` and `probe-page-fr-eu`)
      shop: { description: 'Des vêtements du quotidien, bien faits.' },
      products: { hoodie: { title: 'Sweat à capuche', description: '<p>Un sweat à capuche doux pour tous les jours.</p>' }, 'men-t-shirt': { title: 'T-shirt pour homme' } },
      collections: { tops: { title: 'Hauts', description: '<p>À porter en haut.</p>' } },
      pages: { about: { title: 'À propos', content: '<p>Nous fabriquons des vêtements du quotidien.</p>' } },
      menus: { 'main-menu': ['Hommes', 'Femmes', 'Unisexe', 'Collections', 'Actualités'] },
      // the parity store prints its privacy policy in French on its French pages (`Politique de confidentialité`)
      policies: { privacy_policy: { title: 'Politique de confidentialité', content: '<p>Debutify Parity ne collecte que ce dont elle a besoin pour prendre et livrer vos commandes : votre nom, vos adresses e-mail et de livraison, et vos achats. Nous ne les vendons jamais. Pour consulter, corriger ou supprimer vos données, écrivez à store@example.com.</p>' } }
    }
  },
  country_option_tags: COUNTRY_OPTIONS
})
