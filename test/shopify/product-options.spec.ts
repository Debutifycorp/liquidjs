import { createShopifyLiquid, productJson, renderLiquid, requestFromUrl, storefrontSampleData } from '../../src/shopify'
import type { ProductData, StoreData } from '../../src/shopify'
import { buildProduct, buildStore, selectProduct } from '../../src/shopify/store/build'
import { buildGlobals } from '../../src/shopify/store/globals'
import { ReportCollector } from '../../src/shopify/report'

const liquid = createShopifyLiquid()
const render = async (source: string, scope: object) => (await renderLiquid(liquid, source, scope)).html

const tee: ProductData = {
  id: 501,
  handle: 'tee',
  title: 'Tee',
  options: ['Color', 'Size'],
  variants: [
    { id: 1, title: 'Red / S', price: 1000, available: true, option1: 'Red', option2: 'S' },
    { id: 2, title: 'Red / M', price: 1000, available: true, option1: 'Red', option2: 'M' },
    { id: 3, title: 'Clay / S', price: 1000, available: false, option1: 'Clay', option2: 'S' },
    { id: 4, title: 'Clay / M', price: 1000, available: false, option1: 'Clay', option2: 'M' },
    { id: 5, title: 'Blue / S', price: 1000, available: false, option1: 'Blue', option2: 'S' },
    { id: 6, title: 'Blue / M', price: 1000, available: true, option1: 'Blue', option2: 'M' }
  ]
}

// one line per value: name, selected (*), unavailable (x) and the variant's id
const PICKER = '{% for option in p.options_with_values %}{{ option.name }}:{% for value in option.values %}{{ value }}{% if value.selected %}*{% endif %}{% unless value.available %}(x){% endunless %}={{ value.variant.id }} {% endfor %}|{% endfor %}{{ p.selected_or_first_available_variant.id }}'

const idsOf = async (product: object) => (await render('{% for option in p.options_with_values %}{% for value in option.values %}{{ value.id }},{% endfor %}{% endfor %}', { p: product })).split(',').filter(Boolean).map(Number)

describe('product_option_value', () => {
  it('gives each option value its name, id, availability, selection and variant', async () => {
    const product = buildProduct(tee)
    expect(await render(PICKER, { p: product })).toBe('Color:Red*=1 Clay(x)=3 Blue=5 |Size:S*=1 M=2 |1')
    const ids = await idsOf(product)
    expect(ids).toHaveLength(5)
    expect(new Set(ids).size).toBe(5)
    expect(ids.every(id => Number.isSafeInteger(id) && id > 0)).toBe(true)
    // the same data gives the same ids
    expect(await idsOf(buildProduct(tee))).toEqual(ids)
  })
  it('prints and compares as its name, as the values did when they were strings', async () => {
    const product = buildProduct(tee)
    expect(await render("{% assign option = p.options_with_values.first %}{% for value in option.values %}{% if option.selected_value == value %}[{{ value | escape }}]{% endif %}{% endfor %}|{{ option.values | join: ',' }}|{% if option.values contains 'Clay' %}clay{% endif %}|{{ option.values | map: 'name' | join: ',' }}|{{ option.values.first.name }}", { p: product }))
      .toBe('[Red]|Red,Clay,Blue|clay|Red,Clay,Blue|Red')
    expect((productJson(storefrontSampleData, 'hoodie') as { options: Array<{ values: unknown[] }> }).options[0].values).toEqual(['Red', 'Clay', 'Ocean', 'Purple', 'Green'])
  })
  it('finds an option by name in any case through options_by_name', async () => {
    const product = buildProduct(tee)
    expect(await render("{{ p.options_by_name['color'].values | join: ',' }}|{{ p.options_by_name['Size'].selected_value }}|{{ p.options_by_name.COLOR.position }}|{{ p.options_by_name['nope'].name }}", { p: product })).toBe('Red,Clay,Blue|S|1|')
  })
  it('selects the variant of ?option_values= ids: availability follows the selected values of earlier options', async () => {
    const product = buildProduct(tee)
    const id = async (option: number, value: number) => (await idsOf(product))[option === 0 ? value : 3 + value]
    const blue = await id(0, 2)
    const clay = await id(0, 1)
    const small = await id(1, 0)
    expect(await render(PICKER, { p: selectProduct(product, undefined, [blue]) })).toBe('Color:Red=2 Clay(x)=4 Blue*=6 |Size:S(x)=5 M*=6 |6')
    expect(await render(PICKER, { p: selectProduct(product, undefined, [clay, small]) })).toBe('Color:Red=1 Clay*(x)=3 Blue=5 |Size:S*(x)=3 M(x)=4 |3')
    expect(await render('{{ p.selected_variant.id }}|{{ p.selected_variant.selected }}', { p: selectProduct(product, undefined, [clay, small]) })).toBe('3|true')
    // unknown ids select nothing
    expect(selectProduct(product, undefined, [9, 10])).toBe(product)
    // `?variant=` wins
    expect(await render('{{ p.selected_variant.id }}', { p: selectProduct(product, 2, [clay, small]) })).toBe('2')
  })
  it('selects no variant for a combination no variant has', async () => {
    const product = buildProduct({ ...tee, variants: tee.variants.filter(variant => variant.id !== 4) })
    const ids = await idsOf(product)
    const chosen = selectProduct(product, undefined, [ids[1], ids[4]])
    expect(await render('[{{ p.selected_variant }}|{{ p.selected_or_first_available_variant }}]{% for o in p.options_with_values %}{{ o.selected_value }}{% endfor %}', { p: chosen })).toBe('[|]ClayM')
  })
  it('reads ?option_values= from the address and selects through the page globals', async () => {
    const data: StoreData = { shop: { name: 'S', domain: 's.example', currency: 'USD' }, products: [tee] }
    const ids = await idsOf(buildStore(data).products.liquidMethodMissing('tee') as object)
    const page = requestFromUrl(`/products/tee?section_id=main&option_values=${ids[2]},${ids[3]}`, data)
    expect(page.request.optionValues).toEqual([ids[2], ids[3]])
    const { globals } = buildGlobals({ store: buildStore(data), data, templateName: page.templateName, request: page.request, locale: 'en', report: new ReportCollector() })
    expect(await render('{{ product.selected_variant.title }}|{{ product.selected_or_first_available_variant.id }}', globals)).toBe('Blue / S|5')
    expect(requestFromUrl('/products/tee?option_values=a,,b', data).request.optionValues).toBeUndefined()
  })
  it('takes ids, swatches and product URLs from the data', async () => {
    const product = buildProduct({ ...tee, option_values: { Color: { Red: { id: 111, swatch: { color: '#ff0000' } }, Clay: { swatch: { image: { src: '/clay.png', width: 10, height: 10 } } }, Blue: { product_handle: 'blue-tee', swatch: { color: 'not a colour' } } } } }, '/fr')
    expect(await render("{% assign values = p.options_with_values.first.values %}{{ values[0].id }}|{{ values[0].swatch.color }}|{{ values[0].swatch.color.rgb }}|{{ values[0].product_url | json }}|{{ values[1].swatch.image.src }}|{{ values[1].swatch.color | json }}|{{ values[2].product_url }}|{% if values[2].swatch == nil %}none{% endif %}|{{ values | map: 'swatch' | compact | size }}|{{ p.options_with_values.last.values.first.swatch | json }}", { p: product }))
      .toBe('111|#ff0000|255 0 0|null|/clay.png|null|/fr/products/blue-tee|none|2|null')
  })
  it('gives a swatch filter its values\' swatches', async () => {
    const data: StoreData = { shop: { name: 'S', domain: 's.example', currency: 'USD' }, products: [{ ...tee, option_values: { Color: { Red: { swatch: { color: '#ff0000' } } } } }], filters: [{ attribute: 'option', option: 'Color', presentation: 'swatch' }, { attribute: 'option', option: 'Size' }] }
    const collection = buildStore(data).collections.liquidMethodMissing('all')
    expect(await render('{% for f in c.filters %}{{ f.label }}:{% for v in f.values %}{{ v.value }}={{ v.swatch.color }},{% endfor %}|{% endfor %}', { c: collection })).toBe('Color:Blue=,Clay=,Red=#ff0000,|Size:S=,M=,|')
  })
  it('counts the variants', async () => {
    expect(await render('{{ p.variants_count }}|{{ one.variants_count }}', { p: buildProduct(tee), one: buildProduct({ id: 2, handle: 'one', title: 'One', variants: [{ id: 9, title: 'Default Title', price: 1, available: true, option1: 'Default Title' }] }) })).toBe('6|1')
  })
})
