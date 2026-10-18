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
  it('prints a rating as its rating, a measurement as its value and unit, and rich text as its HTML', async () => {
    const typed = (type: string, value: string) => ({ type, value })
    const product = {
      id: 3,
      handle: 'lamp',
      title: 'Lamp',
      metafields: {
        reviews: { rating: typed('rating', '{"value":"4.5","scale_min":"1.0","scale_max":"5.0"}') },
        custom: {
          weight: typed('weight', '{"value":"1.5","unit":"KILOGRAMS"}'),
          volume: typed('volume', '{"value":500,"unit":"mL"}'),
          dimension: typed('dimension', '{"value":"30.0","unit":"cm"}'),
          story: typed('rich_text_field', JSON.stringify({ type: 'root', children: [{ type: 'heading', level: 2, children: [{ type: 'text', value: 'Made <well>' }] }, { type: 'paragraph', children: [{ type: 'text', value: 'Warm ' }, { type: 'text', value: 'light', bold: true, italic: true }, { type: 'text', value: ', see ' }, { type: 'link', url: '/pages/about', title: 'About', children: [{ type: 'text', value: 'us' }] }, { type: 'link', url: 'javascript:alert(1)', children: [{ type: 'text', value: 'x' }] }] }, { type: 'list', listType: 'ordered', children: [{ type: 'list-item', children: [{ type: 'text', value: 'one' }] }] }, { type: 'list', listType: 'unordered', children: [{ type: 'list-item', children: [{ type: 'text', value: 'two' }] }] }] }))
        }
      },
      variants: [{ id: 31, title: 'Default Title', price: 1000, available: true, option1: 'Default Title' }]
    }
    const store = buildStore({ shop: data.shop, products: [product] })
    const p = store.products.liquidMethodMissing('lamp')
    // the rating block of our theme prints `{{ rating.value }} / {{ rating.value.scale_max }}`
    expect(await render('{{ p.metafields.reviews.rating.value }} / {{ p.metafields.reviews.rating.value.scale_max }}|{{ p.metafields.reviews.rating.value.rating | round }}|{% if p.metafields.reviews.rating.value > 4 %}high{% endif %}|{{ p.metafields.reviews.rating.value | json }}', { p }))
      .toBe('4.5 / 5.0|5|high|{"error":"json not allowed for this object"}')
    expect(await render('{{ m.weight.value }}|{{ m.weight.value.value | plus: 1 }}|{{ m.weight.value.unit }}|{{ m.weight.value.type }}|{{ m.volume.value }}|{{ m.dimension.value }}|{{ m.volume.value | json }}', { m: (p as { metafields: { custom: object } }).metafields.custom }))
      .toBe('1.5 KILOGRAMS|2.5|KILOGRAMS|weight|500.0 mL|30.0 cm|{"type":"volume","unit":"mL","value":"500.0"}')
    expect(await render('{{ m.story.value }}|{{ m.story.value.type }}|{{ m.story.value.children.size }}', { m: (p as { metafields: { custom: object } }).metafields.custom }))
      .toBe('<h2>Made &lt;well&gt;</h2><p>Warm <strong><em>light</em></strong>, see <a href="/pages/about" title="About">us</a><a>x</a></p><ol><li>one</li></ol><ul><li>two</li></ul>|root|4')
  })
  // scenarios `probe-product-extras-unit-price`, `probe-product-extras-gift-card` and `probe-product-extras-pickup`: Shopify's json refuses the metafields object, a rating and the metafield that holds one, and prints a rating's own numbers and an integer metafield
  it('refuses to print the metafields object and a rating in json, as the parity store does', async () => {
    const store = buildStore({ shop: data.shop, products: [{ id: 5, handle: 'mug', title: 'Mug', metafields: { reviews: { rating: { type: 'rating', value: '{"value":"4.5","scale_min":"1.0","scale_max":"5.0"}' }, rating_count: { type: 'number_integer', value: '37' } } }, variants: [{ id: 51, title: 'Default Title', price: 1, available: true, option1: 'Default Title' }] }, { id: 6, handle: 'bare', title: 'Bare', variants: [{ id: 61, title: 'Default Title', price: 1, available: true, option1: 'Default Title' }] }] })
    const mug = store.products.liquidMethodMissing('mug')
    const bare = store.products.liquidMethodMissing('bare')
    const refused = '{"error":"json not allowed for this object"}'
    expect(await render('{{ p.metafields | json }}|{{ q.metafields | json }}', { p: mug, q: bare })).toBe(`${refused}|${refused}`)
    expect(await render('{{ p.metafields.reviews.rating | json }}|{{ p.metafields.reviews.rating.value | json }}|{{ p.metafields.reviews.rating.value.rating | json }}|{{ p.metafields.reviews.rating_count | json }}|{{ p.metafields.reviews.rating_count.value | json }}', { p: mug }))
      .toBe(`${refused}|${refused}|"4.5"|37|37`)
    expect(await render('{{ p.metafields.reviews.rating.value.scale_max }}', { p: mug })).toBe('5.0')
    expect(Object.keys((mug as { metafields: object }).metafields)).toEqual(['reviews'])
  })
  it('gives nil for a number that is not one, and leaves out an empty metafield', async () => {
    const store = buildStore({ shop: data.shop, products: [{ id: 4, handle: 'cup', title: 'Cup', metafields: { custom: { count: { type: 'number_integer', value: 'abc' }, ratio: { type: 'number_decimal', value: '' }, blank: '', typedBlank: { type: 'single_line_text_field', value: '' }, kept: 'x' } }, variants: [{ id: 41, title: 'Default Title', price: 1, available: true, option1: 'Default Title' }] }] })
    const p = store.products.liquidMethodMissing('cup')
    expect(await render('[{{ m.count.value }}|{{ m.count.value | json }}|{{ m.ratio.value | json }}|{% if m.blank %}blank{% endif %}{% if m.typedBlank %}typed{% endif %}|{{ m.kept }}]', { m: (p as { metafields: { custom: object } }).metafields.custom }))
      .toBe('[|null|null||x]')
  })
  it('builds metafields on the shop, collections, pages and variants, and keeps the storefront filters working', async () => {
    const store = buildStore(data)
    expect(await render('{{ shop.metafields.custom.tagline.value }}|{{ collections.tops.metafields.custom.banner.type }}|{{ pages.about.metafields.custom.intro.value }}|{{ all_products.tee.variants.first.metafields.custom.code.value }}|{{ all_products.tee.metafields.custom.nope.value }}', { shop: store.shop, collections: store.collections, pages: store.pages, all_products: store.products }))
      .toBe('Made well|single_line_text_field|Hi|T-1|')
    const filtered = buildStore(storefrontSampleData).collections.liquidMethodMissing('all') as { filters: Array<{ label: string, values: Array<{ value: string }> }> }
    expect(filtered.filters.find(f => f.label === 'Material')?.values.map(v => v.value)).toEqual(['Canvas', 'Cotton', 'Leather', 'Nylon', 'Wool'])
  })
})
