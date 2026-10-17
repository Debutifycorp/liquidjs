import { Drop, Liquid } from '../../../src'
import { createShopifyLiquid, renderLiquid } from '../../../src/shopify'

class Colour extends Drop {
  public red = 51
  public valueOf () { return '#334fb4' }
}
class Blank extends Drop {
  public valueOf () { return '' }
}
class Empty extends Drop {
  public 'empty?' () { return true }
}
class Items extends Drop {
  public constructor (private readonly items: unknown[]) { super() }
  public * [Symbol.iterator] () { yield * this.items }
}

const render = async (source: string, scope: object = {}) => (await renderLiquid(createShopifyLiquid(), source, scope)).html

/**
 * Ruby Liquid's `default` is `false_check || (input.respond_to?(:empty?) && input.empty?) ? default_value : input`, and its `first` is `array.first if array.respond_to?(:first)` (Shopify/liquid, `lib/liquid/standardfilters.rb`): the input itself comes back, and any enumerable gives its first item, nil when it has none. https://shopify.dev/docs/api/liquid/filters/default and https://shopify.dev/docs/api/liquid/filters/first. The Shopify layer follows Ruby there; the root entry keeps upstream LiquidJS's `default` and `first`.
 */
describe('shopify/filters default and first', () => {
  it('default returns a drop as itself, so its properties stay readable', async () => {
    expect(await render('{% assign c = colour | default: "a" %}{{ c }}|{{ c.red }}', { colour: new Colour() })).toBe('#334fb4|51')
  })
  it('default takes the default for a drop whose empty? is true, an empty hash, and a drop that prints nothing', async () => {
    expect(await render('{{ e | default: "D" }}|{{ h | default: "D" }}|{{ b | default: "D" }}|{{ f | default: "D" }}|{{ f | default: "D", allow_false: true }}', { e: new Empty(), h: {}, b: new Blank(), f: false })).toBe('D|D|D|D|false')
  })
  it('first gives the first item of a drop that iterates, and nil for one with none', async () => {
    expect(await render('{{ items | first }}|{% assign n = none | first %}{% if n == nil %}nil{% endif %}|{{ list | first }}', { items: new Items(['zebra', 'tiger']), none: new Items([]), list: ['x', 'y'] })).toBe('zebra|nil|x')
  })
  it('leaves the root entry as upstream LiquidJS has it', async () => {
    const liquid = new Liquid()
    expect(await liquid.parseAndRender('{% assign c = colour | default: "a" %}[{{ c.red }}]|[{{ items | first }}]', { colour: new Colour(), items: new Items(['zebra']) })).toBe('[]|[]')
  })
})
