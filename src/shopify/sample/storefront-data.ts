import type { PageData, ProductData, StoreData, VariantData } from '../store/types'
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

// Best sellers, for the `best-selling` sort.
Object.entries({ hoodie: 1, frontpack: 2, sweatpants: 3, 'men-t-shirt': 4 }).forEach(([handle, rank]) => { product(handle).sales_rank = rank })
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

// The contact page uses the theme's contact template; the pages the theme's FAQ and order-tracking templates show, and an about page, are added.
Object.assign(catalog.pages.find(p => p.handle === 'contact') ?? {}, { template_suffix: 'contact' })
const pages: PageData[] = [
  ...catalog.pages,
  { id: 50002, handle: 'faq', title: 'FAQ', content: '<p>Answers to common questions.</p>', template_suffix: 'faq' },
  { id: 50003, handle: 'about', title: 'About', content: '<p>We make everyday clothing.</p>' },
  { id: 50004, handle: 'track-order', title: 'Track your order', content: '<p>Where is it?</p>', template_suffix: 'track-order' }
]

/** The dataset the parity store is seeded from (item 22, `tools/shopify-parity/` in the Debutify repository): Shopify's mock.shop `demostore` catalogue (`mock-shop.ts`) with what the parity scenarios need on top, in a USD shop of its own: product types, weights, material metafields, compare-at prices, best-seller ranks, selling plans, template suffixes, three pages, storefront filters, discounts, shipping zones, three markets, and French as a second language with its translations. Prices are USD cents. */
export const storefrontSampleData: StoreData = freeze({
  shop: { name: 'Debutify Parity', domain: 'medzreferralai2.myshopify.com', email: 'store@example.com', description: 'Everyday clothing, made well.', currency: 'USD', locale: 'en', money_format: '${{amount}}', money_with_currency_format: '${{amount}} USD' }, // eslint-disable-line no-template-curly-in-string
  products: catalog.products,
  collections: catalog.collections,
  pages,
  blogs: catalog.blogs,
  linklists: catalog.linklists,
  filters: [
    { attribute: 'availability' },
    { attribute: 'price' },
    { attribute: 'vendor' },
    { attribute: 'product_type' },
    { attribute: 'tag' },
    { attribute: 'option', option: 'Color', presentation: 'swatch' },
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
      shop: { name: 'Debutify Parité', description: 'Des vêtements du quotidien, bien faits.' },
      products: { hoodie: { title: 'Sweat à capuche', description: '<p>Un sweat à capuche doux pour tous les jours.</p>' }, 'men-t-shirt': { title: 'T-shirt pour homme' } },
      collections: { tops: { title: 'Hauts', description: '<p>À porter en haut.</p>' } },
      pages: { about: { title: 'À propos', content: '<p>Nous fabriquons des vêtements du quotidien.</p>' } },
      menus: { 'main-menu': ['Hommes', 'Femmes', 'Unisexe', 'Collections', 'Actualités'] }
    }
  },
  country_option_tags: [{ name: 'United States' }, { name: 'Canada' }, { name: 'France' }, { name: 'Germany' }]
})
