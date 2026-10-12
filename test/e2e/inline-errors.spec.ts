// the browser bundles are compiled to ES5, where `instanceof` fails on the error classes (`extends Error` loses its prototype chain, see src/util/error.ts), so inline mode must not rely on it
const bundles: [string, string][] = [
  ['liquid.browser.umd.js', require('../../dist/liquid.browser.umd.js').Liquid],
  ['liquid.browser.min.js', require('../../dist/liquid.browser.min.js').Liquid]
] as any

describe.each(bundles)('inlineErrors in %s', (_name, Liquid: any) => {
  it('stops the render on a limit instead of printing it', async () => {
    const engine = new Liquid({ inlineErrors: true, memoryLimit: 10 })
    await expect(engine.parseAndRender('{{ "aaaaaaaaaaaa" | append: "b" }}')).rejects.toThrow(/memory alloc limit exceeded/)
    await expect(engine.parseAndRender('{% if true %}{% assign a = "aaaaaaaaaaaa" | append: "b" %}{% endif %}x')).rejects.toThrow(/memory alloc limit exceeded/)
  })
  it('stops the render on a limit inside a partial', async () => {
    const engine = new Liquid({ inlineErrors: true, memoryLimit: 10, extname: '.liquid', templates: { 'snippets/big.liquid': '{{ "aaaaaaaaaaaa" | append: "b" }}' } })
    await expect(engine.parseAndRender("{% render 'snippets/big' %}x")).rejects.toThrow(/memory alloc limit exceeded/)
  })
  it('records an undefined variable without printing it', async () => {
    const engine = new Liquid({ inlineErrors: true, strictVariables: true })
    const errors: Error[] = []
    expect(await engine.parseAndRender('a{{ nope }}b', {}, { errors })).toBe('ab')
    expect(errors).toHaveLength(1)
    expect(errors[0].name).toBe('UndefinedVariableError')
  })
  it('calls a syntax error in a partial a syntax error', async () => {
    const engine = new Liquid({ inlineErrors: true, extname: '.liquid', templates: { 'snippets/bad.liquid': '{% nope %}' } })
    expect(await engine.parseAndRender("a{% render 'snippets/bad' %}b")).toBe('aLiquid syntax error (snippets/bad line 1): tag "nope" not foundb')
  })
  it('prints an error and records one in a tag that prints nothing', async () => {
    const engine = new Liquid({ inlineErrors: true, numberSemantics: 'ruby' })
    const errors: Error[] = []
    expect(await engine.parseAndRender('a{{ 1 | divided_by: 0 }}{% assign x = 1 | divided_by: 0 %}b', {}, { errors })).toBe('aLiquid error (line 1): divided by 0b')
    expect(errors).toHaveLength(2)
  })
})
