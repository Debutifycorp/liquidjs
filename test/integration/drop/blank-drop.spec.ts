import { Liquid } from '../../../src/liquid'
import { Drop } from '../../../src/drop'

class Box extends Drop {
  constructor (private readonly count: number) { super() }
  'empty?' () { return this.count === 0 }
}

describe('drop/blank-drop', function () {
  let liquid: Liquid
  beforeEach(() => (liquid = new Liquid()))

  it('render blank drop as blank string', async function () {
    const html = await liquid.parseAndRender('{{blank}}')
    expect(html).toBe('')
  })
  it('blank equals nil', async function () {
    const src = '{%if blank == nil %}blank == nil{%else%}blank != nil{% endif %}'
    const html = await liquid.parseAndRender(src)
    expect(html).toBe('blank == nil')
  })
  it('false is blank', async function () {
    const src = '{%if false == blank %}false == blank{%else%}false != blank{% endif %}'
    const html = await liquid.parseAndRender(src)
    expect(html).toBe('false == blank')
  })
  it('"" is blank', async function () {
    const src = '{%if "" == blank %}"" == blank{%else%}"" != blank{% endif %}'
    const html = await liquid.parseAndRender(src)
    expect(html).toBe('"" == blank')
  })
  it('"  " is blank', async function () {
    const src = '{%if "  " == blank %}"  " == blank{%else%}"  " != blank{% endif %}'
    const html = await liquid.parseAndRender(src)
    expect(html).toBe('"  " == blank')
  })
  it('{} is blank', async function () {
    const src = '{%if obj == blank %}{} == blank{%else%}{} != blank{% endif %}'
    const html = await liquid.parseAndRender(src, { obj: {} })
    expect(html).toBe('{} == blank')
  })
  it('{foo: 1} is not blank', async function () {
    const src = '{%if obj == blank %}{foo: 1} == blank{%else%}{foo: 1} != blank{% endif %}'
    const html = await liquid.parseAndRender(src, { obj: { foo: 1 } })
    expect(html).toBe('{foo: 1} != blank')
  })
  it('a drop is blank when its own empty? says it is empty', async function () {
    const src = '{% if box == blank %}blank{% else %}not{% endif %}|{% if blank != box %}not{% endif %}'
    expect(await liquid.parseAndRender(src, { box: new Box(0) })).toBe('blank|')
    expect(await liquid.parseAndRender(src, { box: new Box(1) })).toBe('not|not')
    expect(await liquid.parseAndRender('{% if obj == blank %}blank{% else %}not{% endif %}', { obj: { items: [], 'empty?': true } })).toBe('blank')
  })
  it('a value assigned blank is blank, unlike empty == empty', async function () {
    const src = '{% assign x = blank %}{% if x == blank %}is{% else %}is not{% endif %} blank|{% if x != blank %}differs{% else %}same{% endif %}|{% assign y = empty %}{% if y == empty %}is{% else %}is not{% endif %} empty'
    expect(await liquid.parseAndRender(src)).toBe('is blank|same|is not empty')
  })
  it('[] is blank', async function () {
    const src = '{%if arr == blank %}[] == blank{%else%}[] != blank{% endif %}'
    const html = await liquid.parseAndRender(src, { arr: [] })
    expect(html).toBe('[] == blank')
  })
  it('[1] is not blank', async function () {
    const src = '{%if arr == blank %}[1] == blank{%else%}[1] != blank{% endif %}'
    const html = await liquid.parseAndRender(src, { arr: [1] })
    expect(html).toBe('[1] != blank')
  })
})
