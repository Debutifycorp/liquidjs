import { createShopifyLiquid, ImageDrop, renderLiquid } from '../../../src/shopify'

const render = async (source: string, scope: object = {}) => (await renderLiquid(createShopifyLiquid(), source, scope)).html

/**
 * Ruby Liquid's `find`, `find_index` and `has` read each item as `item[property]` (Shopify/liquid, `lib/liquid/standardfilters.rb`, `filter_array`), and with no target value they take the first item whose `item[property]` is truthy. For a string item, Ruby's `String#[]` with a string returns that string when the item contains it and nil otherwise, so `'056'['56']` is `'56'`. Horizon's type scale relies on it: `settings.type_size_h1` is 56 and the theme pads the sizes to `056`, `048` and so on, then asks `font_sizes | find_index: '56'` for the place of 56 (snippets/theme-styles-variables.liquid). Shopify prints `--font-size--h1: clamp(3.0rem, 5.6vw, 3.5rem)` for it (the parity store's recording of Horizon's home page); the engine's `find_index` read `56` as a number literal and found nothing. The Shopify layer follows Ruby; the root entry keeps upstream LiquidJS's filters.
 */
describe('shopify/filters find, find_index and has on strings', () => {
  const sizes = { sizes: ['012', '014', '024', '032', '048', '056'] }
  it('find_index finds the string that contains the property', async () => {
    expect(await render("{{ sizes | find_index: '56' }}|{{ sizes | find_index: '48' }}|{{ sizes | find_index: '12' }}", sizes)).toBe('5|4|0')
  })
  it('reads the property as text, so the first string that contains it wins', async () => {
    expect(await render("{{ sizes | find_index: '4' }}|{{ sizes | find_index: '0' }}", sizes)).toBe('1|0')
  })
  it('gives nil when no string contains the property', async () => {
    expect(await render("{% assign i = sizes | find_index: '99' %}{% if i == nil %}nil{% endif %}", sizes)).toBe('nil')
  })
  it('find and has read strings the same way', async () => {
    expect(await render("{{ sizes | find: '56' }}|{{ sizes | has: '56' }}|{{ sizes | has: '99' }}", sizes)).toBe('056|true|false')
  })
  it('with a target value, the item must contain the property and the result of item[property] must equal it', async () => {
    expect(await render("{{ sizes | find_index: '56', '56' }}|{% assign i = sizes | find_index: '56', 'x' %}[{{ i }}]", sizes)).toBe('5|[]')
  })
  it('keeps reading hashes and drops by property, with or without a target value', async () => {
    const members = { members: [{ name: 'a', age: 0 }, { name: 'b', age: 3 }, { name: 'c' }] }
    expect(await render("{{ members | find_index: 'name', 'b' }}|{{ members | find: 'name', 'c' | json }}|{{ members | has: 'name', 'z' }}", members)).toBe('1|{"name":"c"}|false')
  })
})

/**
 * Ruby Liquid's `concat` wraps its input in an `InputIterator`, which makes a one-element list of any object that is not an array, a hash or enumerable (`Array(input)`), so a media object stays a media object (Shopify/liquid, `lib/liquid/standardfilters.rb`). Horizon's product card does `assign media_list_to_show = product.featured_media | concat: other_media`, and the parity store's recording prints that first slide as a `product-media-container--image` with the media's id as `slide-id`. The engine turned a drop into the text it prints, so the first slide of every card had no media. The Shopify layer follows Ruby; the root entry keeps upstream LiquidJS's `concat`.
 */
describe('shopify/filters concat on a single object', () => {
  const media = new ImageDrop({ src: '//shop.example/cdn/shop/files/cap.jpg?v=1', width: 10, height: 10, id: 7 }, true)
  it('keeps a drop as one item of the list', async () => {
    expect(await render('{% assign list = media | concat: others %}{{ list.size }}:{% for m in list %}{{ m.id }},{% endfor %}', { media, others: [{ id: 8 }, { id: 9 }] })).toBe('3:7,8,9,')
  })
  it('keeps a hash as one item of the list', async () => {
    expect(await render('{% assign list = one | concat: others %}{% for m in list %}{{ m.id }},{% endfor %}', { one: { id: 1 }, others: [{ id: 2 }] })).toBe('1,2,')
  })
  it('joins two arrays, and an empty or nil input gives the other list', async () => {
    expect(await render('{{ a | concat: b | join: "," }}|{{ nothing | concat: b | join: "," }}', { a: [1, 2], b: [3], nothing: null })).toBe('1,2,3|3')
  })
})
