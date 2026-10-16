import { Liquid, LiquidFloat } from '../../../src'

const ruby = new Liquid({ numberSemantics: 'ruby' })
const js = new Liquid()
const render = (src: string, scope: object = {}) => ruby.parseAndRender(src, scope)

describe('numberSemantics: ruby', () => {
  describe('literals and output', () => {
    it('prints a whole-valued decimal with its point', async () => expect(await render('{{ 2.0 }}')).toBe('2.0'))
    it('prints a whole number without one', async () => expect(await render('{{ 2 }}')).toBe('2'))
    it('uses Ruby exponent form for large decimals', async () => expect(await render('{{ 10000000000000000.0 }}')).toBe('1.0e+16'))
    it('uses Ruby exponent form for small decimals', async () => expect(await render('{{ 0.00001 }}')).toBe('1.0e-05'))
    it('keeps 0.0001 in fixed form', async () => expect(await render('{{ 0.0001 }}')).toBe('0.0001'))
    it('uses exponent form for a whole decimal from 1e15', async () => {
      expect(await render('{{ 1000000000000000.0 }}')).toBe('1.0e+15')
      expect(await render('{{ -3000000000000001.0 }}')).toBe('-3.000000000000001e+15')
    })
    it('keeps a whole decimal below 1e15 in fixed form', async () => expect(await render('{{ 100000000000000.0 }}')).toBe('100000000000000.0'))
    it('keeps a fractional decimal from 1e15 in fixed form', async () => expect(await render('{{ 3000000000000000.5 }}')).toBe('3000000000000000.5'))
    it('compares a decimal with a whole number', async () => expect(await render('{% if 2.0 == 2 %}yes{% endif %}')).toBe('yes'))
    it('appends a decimal as Ruby prints it', async () => expect(await render('{{ 2.0 | append: "x" }}')).toBe('2.0x'))
    it('serialises a decimal as a JSON number', async () => expect(await render('{{ 2.5 | json }}')).toBe('2.5'))
    // Shopify writes a Ruby Float in JSON as Float#to_s does: the point stays on a whole value (scenarios page-product and page-product-variant: a price in cents divided by 100.0 and printed through json is `90.0`)
    it('serialises a whole-valued decimal with its point', async () => {
      expect(await render('{{ 2.0 | json }}')).toBe('2.0')
      expect(await render('{{ 10 | divided_by: 5.0 | json }}')).toBe('2.0')
    })
    it('serialises a whole number without a point', async () => {
      expect(await render('{{ 2 | json }}')).toBe('2')
      expect(await render('{{ 10 | divided_by: 5 | json }}')).toBe('2')
      expect(await render('{{ x | json }}', { x: 3 })).toBe('3')
    })
    it('serialises a decimal inside an array or a hash with its point', async () => {
      expect(await render('{{ list | json }}', { list: [new LiquidFloat(1), 1, { ratio: new LiquidFloat(2) }] })).toBe('[1.0,1,{"ratio":2.0}]')
    })
    it('keeps the indent of json with a space', async () => {
      expect(await render('{{ list | json: 1 }}', { list: [new LiquidFloat(1)] })).toBe('[\n 1.0\n]')
    })
    // the text is the one `{{ x }}` prints, Ruby's `Float#to_s`; no recording pins how Shopify writes an exponent form in JSON
    it('serialises a decimal in exponent form as it prints', async () => {
      expect(await render('{{ 10000000000000000.0 | json }}')).toBe('1.0e+16')
      expect(await render('{{ 0.00001 | json }}')).toBe('1.0e-05')
      expect(await render('{{ list | json }}', { list: [new LiquidFloat(0.00001), new LiquidFloat(-1e21)] })).toBe('[1.0e-05,-1.0e+21]')
    })
    it('serialises a decimal that is not finite as null, as JSON.stringify does', async () => expect(await render('{{ 10.0 | divided_by: 0.0 | json }}')).toBe('null'))
    it('serialises a decimal in jsonify the same way', async () => expect(await render('{{ 2.0 | jsonify }}')).toBe('2.0'))
    it('leaves a decimal of the default number semantics a plain number', async () => expect(await js.parseAndRender('{{ 2.0 | json }}')).toBe('2'))
    it('keeps a string that looks like a decimal a string', async () => expect(await render('{{ "2.0" | json }}')).toBe('"2.0"'))
  })
  describe('divided_by', () => {
    it('rounds down whole-number division', async () => expect(await render('{{ 10 | divided_by: 4 }}')).toBe('2'))
    it('rounds toward negative infinity', async () => expect(await render('{{ -5 | divided_by: 3 }}')).toBe('-2'))
    it('gives a decimal for a decimal divisor', async () => expect(await render('{{ 20 | divided_by: 7.0 }}')).toBe('2.857142857142857'))
    it('keeps a whole-valued decimal result decimal', async () => expect(await render('{{ 10 | divided_by: 5.0 }}')).toBe('2.0'))
    it('treats integral data as whole numbers', async () => expect(await render('{{ x | divided_by: 2 }}', { x: 5 })).toBe('2'))
    it('treats fractional data as decimals', async () => expect(await render('{{ x | divided_by: 2 }}', { x: 5.5 })).toBe('2.75'))
    it('treats a decimal string as a decimal', async () => expect(await render('{{ "5.0" | divided_by: 2 }}')).toBe('2.5'))
    it('refuses division by zero', async () => expect(render('{{ 1 | divided_by: 0 }}')).rejects.toThrow(/divided by 0/))
    it('divides a decimal by a decimal zero to infinity, as Ruby does', async () => expect(await render('{{ 10.0 | divided_by: 0.0 }}')).toBe('Infinity'))
    it('divides a whole number by a decimal zero to infinity', async () => expect(await render('{{ 10 | divided_by: 0.0 }}')).toBe('Infinity'))
    it('divides a decimal by a whole zero to infinity', async () => expect(await render('{{ 10.0 | divided_by: 0 }}')).toBe('Infinity'))
    it('divides a negative decimal by zero to negative infinity', async () => expect(await render('{{ -10.0 | divided_by: 0.0 }}')).toBe('-Infinity'))
    it('divides a decimal zero by a decimal zero to NaN', async () => expect(await render('{{ 0.0 | divided_by: 0.0 }}')).toBe('NaN'))
    it('divides a decimal string by zero to infinity', async () => expect(await render('{{ "10.0" | divided_by: 0 }}')).toBe('Infinity'))
    it('divides a whole zero by a decimal zero to NaN', async () => expect(await render('{{ 0 | divided_by: 0.0 }}')).toBe('NaN'))
    it('divides by a negative decimal zero to negative infinity', async () => expect(await render('{{ 1 | divided_by: -0.0 }}')).toBe('-Infinity'))
    it('still refuses a decimal modulo zero', async () => expect(render('{{ 10.0 | modulo: 0.0 }}')).rejects.toThrow(/divided by 0/))
  })
  describe('plus, minus, times, modulo', () => {
    it('adds decimals exactly', async () => expect(await render('{{ 0.1 | plus: 0.2 }}')).toBe('0.3'))
    it('keeps whole numbers whole', async () => expect(await render('{{ 3 | times: 2 }}')).toBe('6'))
    it('makes a product decimal when one side is', async () => expect(await render('{{ 10 | times: 1.5 }}')).toBe('15.0'))
    it('subtracts decimals exactly', async () => expect(await render('{{ 1.1 | minus: 0.2 }}')).toBe('0.9'))
    it('takes a floored modulo', async () => expect(await render('{{ -7 | modulo: 3 }}')).toBe('2'))
    it('reads a whole-number string as a whole number', async () => expect(await render('{{ "3" | plus: 1 }}')).toBe('4'))
  })
  describe('exact decimal division and modulo', () => {
    it('divides decimals exactly', async () => expect(await render('{{ 0.3 | divided_by: 0.1 }}')).toBe('3.0'))
    it('takes an exact modulo of 1.2 by 0.4', async () => expect(await render('{{ 1.2 | modulo: 0.4 }}')).toBe('0.0'))
    it('takes an exact modulo of 0.3 by 0.1', async () => expect(await render('{{ 0.3 | modulo: 0.1 }}')).toBe('0.0'))
    it('follows the divisor sign for a negative decimal dividend', async () => expect(await render('{{ -1.3 | modulo: 0.4 }}')).toBe('0.3'))
    it('follows the divisor sign for a negative decimal divisor', async () => expect(await render('{{ 1.3 | modulo: -0.4 }}')).toBe('-0.3'))
    it('never prints a negative zero', async () => expect(await render('{{ 1.2 | modulo: -0.4 }}')).toBe('0.0'))
    it('falls back to float arithmetic for exponent-form operands', async () => {
      expect(await render('{{ 0.0000004 | divided_by: 0.0000002 }}')).toBe('2.0')
      expect(await render('{{ 0.0000008 | modulo: 0.0000004 }}')).toBe('0.0')
    })
    it('falls back to float arithmetic beyond the safe-integer range', async () => expect(await render('{{ 12345678901234.5678 | divided_by: 2.0 }}')).toBe('6172839450617.284'))
  })
  describe('round, ceil, floor, abs, at_least, at_most', () => {
    it('rounds half away from zero', async () => expect(await render('{{ 2.5 | round }}')).toBe('3'))
    it('rounds negative halves away from zero', async () => expect(await render('{{ -2.5 | round }}')).toBe('-3'))
    it('rounds to places as a decimal', async () => expect(await render('{{ 3.14159 | round: 2 }}')).toBe('3.14'))
    it('keeps a whole number whole when rounding', async () => expect(await render('{{ 4 | round: 2 }}')).toBe('4'))
    it('returns a whole number from ceil', async () => expect(await render('{{ 4.2 | ceil }}')).toBe('5'))
    it('returns a whole number from floor', async () => expect(await render('{{ 4.8 | floor }}')).toBe('4'))
    it('keeps a decimal decimal in abs', async () => expect(await render('{{ -2.0 | abs }}')).toBe('2.0'))
    it('returns the larger value with its own type', async () => expect(await render('{{ 4 | at_least: 5.0 }}')).toBe('5.0'))
    it('returns the smaller value with its own type', async () => expect(await render('{{ 4 | at_most: 5.0 }}')).toBe('4'))
  })
  describe('filters that pass a decimal through', () => {
    it('keeps the decimal in default', async () => expect(await render('{{ 1900 | divided_by: 100.0 | default: 0 }}')).toBe('19.0'))
    it('keeps a decimal literal in default', async () => expect(await render('{{ 2.0 | default: 1 }}')).toBe('2.0'))
    it('treats a zero decimal as present in default', async () => expect(await render('{{ 0.0 | default: 1 }}')).toBe('0.0'))
    it('slices a decimal as Ruby prints it', async () => expect(await render('{{ 2.0 | slice: 0, 3 }}')).toBe('2.0'))
    it.each(['join', 'compact', 'reverse', 'sort', 'sort_natural', 'uniq'])('keeps a lone decimal in %s', async (name) => expect(await render(`{% assign a = 0.0 %}{{ a | ${name} }}`)).toBe('0.0'))
    it('removes equal decimals in uniq', async () => expect(await render('{{ a | uniq | join: "," }}', { a: [new LiquidFloat(2), 1, new LiquidFloat(2)] })).toBe('2.0,1'))
    it('keeps a decimal apart from the equal whole number in uniq', async () => expect(await render('{{ a | uniq | join: "," }}', { a: [new LiquidFloat(2), 2, new LiquidFloat(2)] })).toBe('2.0,2'))
    it('treats 0.0 and -0.0 as one decimal in uniq', async () => expect(await render('{{ a | uniq | join: "," }}', { a: [new LiquidFloat(0), new LiquidFloat(-0)] })).toBe('0.0'))
  })
  describe('default semantics are unchanged', () => {
    it('still divides as JavaScript does', async () => expect(await js.parseAndRender('{{ 10 | divided_by: 4 }}')).toBe('2.5'))
    it('still prints 2.0 as 2', async () => expect(await js.parseAndRender('{{ 2.0 }}')).toBe('2'))
    it('still passes 2.0 through default as 2', async () => expect(await js.parseAndRender('{{ 2.0 | default: 1 }}')).toBe('2'))
    it('still slices 2.0 as 2', async () => expect(await js.parseAndRender('{{ 2.0 | slice: 0, 3 }}')).toBe('2'))
    it('still divides 0.3 by 0.1 as JavaScript does', async () => expect(await js.parseAndRender('{{ 0.3 | divided_by: 0.1 }}')).toBe('2.9999999999999996'))
  })
})

// `JSON.rawJSON` is Node 21+ and in current browsers; where it is missing a decimal keeps printing as a plain JSON number
describe('numberSemantics: ruby, in a runtime without JSON.rawJSON', () => {
  it('prints a whole decimal as a plain number and the rest as before', async () => {
    const original = (JSON as unknown as { rawJSON?: unknown }).rawJSON
    delete (JSON as unknown as { rawJSON?: unknown }).rawJSON
    try {
      await jest.isolateModulesAsync(async () => {
        const { Liquid: Isolated } = await import('../../../src')
        const engine = new Isolated({ numberSemantics: 'ruby' })
        expect(await engine.parseAndRender('{{ 2.0 | json }}|{{ 2.5 | json }}|{{ 2 | json }}|{{ 2.0 }}')).toBe('2|2.5|2|2.0')
      })
    } finally {
      (JSON as unknown as { rawJSON?: unknown }).rawJSON = original
    }
  })
})
