import { Liquid } from '../../../src/liquid'
import { Drop } from '../../../src/drop'

class Box extends Drop {
  constructor (private readonly count: number) { super() }
  'empty?' () { return this.count === 0 }
}

class Full extends Drop {
  'empty?' () { return false }
}

describe('drop/empty-drop', function () {
  let liquid: Liquid
  beforeEach(() => (liquid = new Liquid()))

  it('render empty drop as empty string', async function () {
    const html = await liquid.parseAndRender('{{empty}}')
    expect(html).toBe('')
  })
  it('nil is not empty', async function () {
    const src = '{%if nil == empty %}nil == empty{%else%}nil != empty{% endif %}'
    const html = await liquid.parseAndRender(src)
    expect(html).toBe('nil != empty')
  })
  it('false is not empty', async function () {
    const src = '{%if false == empty %}false == empty{%else%}false != empty{% endif %}'
    const html = await liquid.parseAndRender(src)
    expect(html).toBe('false != empty')
  })
  it('"" is empty', async function () {
    const src = '{%if "" == empty %}"" == empty{%else%}"" != empty{% endif %}'
    const html = await liquid.parseAndRender(src)
    expect(html).toBe('"" == empty')
  })
  it('"  " is not empty', async function () {
    const src = '{%if "  " == empty %}"  " == empty{%else%}"  " != empty{% endif %}'
    const html = await liquid.parseAndRender(src)
    expect(html).toBe('"  " != empty')
  })
  it('{} is empty', async function () {
    const src = '{%if obj == empty %}{} == empty{%else%}{} != empty{% endif %}'
    const html = await liquid.parseAndRender(src, { obj: {} })
    expect(html).toBe('{} == empty')
  })
  it('{foo: 1} is not empty', async function () {
    const src = '{%if obj == empty %}{foo: 1} == empty{%else%}{foo: 1} != empty{% endif %}'
    const html = await liquid.parseAndRender(src, { obj: { foo: 1 } })
    expect(html).toBe('{foo: 1} != empty')
  })
  it('a drop is empty when its own empty? says so', async function () {
    const src = '{% if box == empty %}empty{% else %}not{% endif %}|{% if empty == box %}empty{% else %}not{% endif %}|{% if box != empty %}not{% endif %}'
    expect(await liquid.parseAndRender(src, { box: new Box(0) })).toBe('empty|empty|')
    expect(await liquid.parseAndRender(src, { box: new Box(2) })).toBe('not|not|not')
    expect(liquid.parseAndRenderSync(src, { box: new Box(0) })).toBe('empty|empty|')
    expect(await liquid.parseAndRender(src, { box: new Full() })).toBe('not|not|not')
  })
  it('an object is empty when its own empty? key says so', async function () {
    const src = '{% if obj == empty %}empty{% else %}not{% endif %}'
    expect(await liquid.parseAndRender(src, { obj: { items: [], 'empty?': true } })).toBe('empty')
    expect(await liquid.parseAndRender(src, { obj: { items: [], 'empty?': false } })).toBe('not')
  })
  it('[] is empty', async function () {
    const src = '{%if arr == empty %}[] == empty{%else%}[] != empty{% endif %}'
    const html = await liquid.parseAndRender(src, { arr: [] })
    expect(html).toBe('[] == empty')
  })
  it('[1] is not empty', async function () {
    const src = '{%if arr == empty %}[1] == empty{%else%}[1] != empty{% endif %}'
    const html = await liquid.parseAndRender(src, { arr: [1] })
    expect(html).toBe('[1] != empty')
  })
  it('1 < empty should be false', async function () {
    const src = '{%if 1 < empty %}true{%else%}false{% endif %}'
    const html = await liquid.parseAndRender(src)
    expect(html).toBe('false')
  })
  it('1 <= empty should be false', async function () {
    const src = '{%if 1 <= empty %}true{%else%}false{% endif %}'
    const html = await liquid.parseAndRender(src)
    expect(html).toBe('false')
  })
  it('1 > empty should be false', async function () {
    const src = '{%if 1 > empty %}true{%else%}false{% endif %}'
    const html = await liquid.parseAndRender(src)
    expect(html).toBe('false')
  })
  it('1 >= empty should be false', async function () {
    const src = '{%if 1 >= empty %}true{%else%}false{% endif %}'
    const html = await liquid.parseAndRender(src)
    expect(html).toBe('false')
  })
  it('1 == empty should be false', async function () {
    const src = '{%if 1 == empty %}true{%else%}false{% endif %}'
    const html = await liquid.parseAndRender(src)
    expect(html).toBe('false')
  })
  it('1 != empty should be true', async function () {
    const src = '{%if 1 != empty %}true{%else%}false{% endif %}'
    const html = await liquid.parseAndRender(src)
    expect(html).toBe('true')
  })
  it('empty != empty', async function () {
    const src = '{%if empty == empty %}true{%else%}false{% endif %}'
    const html = await liquid.parseAndRender(src)
    expect(html).toBe('false')
  })
  it('empty != nil', async function () {
    const src = '{%if empty == nil %}true{%else%}false{% endif %}'
    const html = await liquid.parseAndRender(src)
    expect(html).toBe('false')
  })
})
