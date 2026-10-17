import { createShopifyLiquid, renderLiquid, storefrontSampleData } from '../../src/shopify'
import type { StoreData } from '../../src/shopify'
import { buildStore } from '../../src/shopify/store/build'

const liquid = createShopifyLiquid()
const render = async (source: string, scope: object) => (await renderLiquid(liquid, source, scope)).html

const data: StoreData = {
  shop: { name: 'S', domain: 's.example', currency: 'USD', metafields: { custom: { tagline: 'Made well' } } },
  products: [
    {
      id: 1,
      handle: 'tee',
      title: 'Tee',
      metafields: {
        custom: {
          material: 'Cotton',
          care: 'Wash cold\nDry flat',
          weight: 180,
          ratio: 0.5,
          organic: true,
          sizes: ['S', 'M'],
          rating: { type: 'rating', value: '{"value":"4.5","scale_min":"1.0","scale_max":"5.0"}' },
          colour: { type: 'color', value: '#336699' },
          similar: { type: 'list.product_reference', value: '["bag","nope"]' },
          bag: { type: 'product_reference', value: 'bag' },
          specs: { type: 'json', value: '{"fit":"slim","sizes":[1,2]}' },
          size: 'L'
        }
      },
      variants: [{ id: 11, title: 'Default Title', price: 1000, available: true, option1: 'Default Title', metafields: { custom: { code: 'T-1' } } }]
    },
    { id: 2, handle: 'bag', title: 'Bag', variants: [{ id: 21, title: 'Default Title', price: 2000, available: true, option1: 'Default Title' }] }
  ],
  collections: [{ id: 5, handle: 'tops', title: 'Tops', products: ['tee'], metafields: { custom: { banner: 'Spring' } } }],
  pages: [{ id: 6, handle: 'about', title: 'About', content: '', metafields: { custom: { intro: 'Hi' } } }]
}

describe('metafield objects', () => {
  it('prints a metafield as it is stored and reads it as an object', async () => {
    const store = buildStore(data)
    const p = store.products.liquidMethodMissing('tee')
    expect(await render('{{ m.material }}|{{ m.material.value }}|{{ m.material.type }}|{{ m.material["list?"] }}|{{ m.care.type }}|{{ m.weight.value | plus: 1 }}|{{ m.weight.type }}|{{ m.ratio.value }}|{{ m.ratio.type }}|{{ m.organic.value }}|{{ m.sizes.type }}|{{ m.sizes["list?"] }}|{{ m.sizes.value | join: "+" }}|{{ m["size"].value }}', { m: (p as { metafields: { custom: object } }).metafields.custom }))
      .toBe('Cotton|Cotton|single_line_text_field|false|multi_line_text_field|181|number_integer|0.5|number_decimal|true|list.single_line_text_field|true|S+M|L')
  })
  it('types a metafield by its type: a rating, a colour, references, JSON', async () => {
    const store = buildStore(data)
    const m = (store.products.liquidMethodMissing('tee') as { metafields: { custom: object } }).metafields.custom
    expect(await render('{{ m.rating.value.rating }}/{{ m.rating.value.scale_max }}|{{ m.colour.value.rgb }}|{{ m.colour }}|{{ m.bag.value.title }}|{{ m.bag }}|{% for p in m.similar.value %}{{ p.title }}{% endfor %}|{{ m.similar.value.count }}|{{ m.specs.value.fit }}|{{ m.specs.value.sizes | join: "," }}|{{ m.specs | json }}', { m }))
      .toBe('4.5/5.0|51 102 153|#336699|Bag|gid://shopify/Product/2|Bag|1|slim|1,2|{"fit":"slim","sizes":[1,2]}')
  })
  it('builds metafields on the shop, collections, pages and variants, and keeps the storefront filters working', async () => {
    const store = buildStore(data)
    expect(await render('{{ shop.metafields.custom.tagline.value }}|{{ collections.tops.metafields.custom.banner.type }}|{{ pages.about.metafields.custom.intro.value }}|{{ all_products.tee.variants.first.metafields.custom.code.value }}|{{ all_products.tee.metafields.custom.nope.value }}', { shop: store.shop, collections: store.collections, pages: store.pages, all_products: store.products }))
      .toBe('Made well|single_line_text_field|Hi|T-1|')
    const filtered = buildStore(storefrontSampleData).collections.liquidMethodMissing('all') as { filters: Array<{ label: string, values: Array<{ value: string }> }> }
    expect(filtered.filters.find(f => f.label === 'Material')?.values.map(v => v.value)).toEqual(['Canvas', 'Cotton', 'Leather', 'Nylon', 'Wool'])
  })
})
