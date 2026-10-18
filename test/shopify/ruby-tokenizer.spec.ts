import { Liquid } from '../../src'
import { createShopifyLiquid, renderLiquid } from '../../src/shopify'

describe('Ruby Liquid tokenizer under the Shopify preset', () => {
  const liquid = createShopifyLiquid()
  const render = async (source: string) => (await renderLiquid(liquid, source, {})).html

  it('refuses the output of a theme file Shopify refused on upload', async () => {
    const source = "{{ 'flag-us.svg' | asset_url | replace: 'flag-us.svg', 'flag-{code}.svg' }}"
    await expect(render(source)).rejects.toThrow("Variable '{{ 'flag-us.svg' | asset_url | replace: 'flag-us.svg', 'flag-{code}' was not properly terminated with regexp: /\\}\\}/")
  })
  it('ends an output at a } inside a string', async () => {
    await expect(render("{{ 'a}' }}")).rejects.toThrow("Variable '{{ 'a}' was not properly terminated with regexp: /\\}\\}/, line:1, col:1")
  })
  it('names an output with no } at all `{{`', async () => {
    await expect(render('x{{ name')).rejects.toThrow("Variable '{{' was not properly terminated with regexp: /\\}\\}/, line:1, col:2")
  })
  it('names an output that ends in a single } with that text', async () => {
    await expect(render('{{ name }')).rejects.toThrow("Variable '{{ name }' was not properly terminated with regexp: /\\}\\}/")
  })
  it('names a tag with no %} `{%`', async () => {
    await expect(render('{% if true')).rejects.toThrow("Tag '{%' was not properly terminated with regexp: /\\%\\}/, line:1, col:1")
  })
  it('ends a tag at a %} inside a string, which leaves the string unclosed', async () => {
    await expect(render("{% assign x = '%}' %}")).rejects.toThrow("Unexpected character ', line:1, col:15")
  })
  it('refuses a string that never closes', async () => {
    await expect(render('{{ "hello }}')).rejects.toThrow('Unexpected character ", line:1, col:4')
    await expect(render("{{ x | append: 'hello }}")).rejects.toThrow("Unexpected character '")
  })
  it('renders an output and a string with an opening brace', async () => {
    expect(await render("{{ 'a' }}")).toBe('a')
    expect(await render('{{ "{" }}')).toBe('{')
    expect(await render("{{ '{{' }}|{{ \"{%\" }}")).toBe('{{|{%')
    expect(await render('{{- "x" -}}')).toBe('x')
  })
})

describe('upstream tokenizer by default', () => {
  const liquid = new Liquid()
  it('reads a quoted } as text', async () => expect(await liquid.parseAndRender("{{ 'a}' }}")).toBe('a}'))
  it('keeps its own message for an unclosed output', async () => {
    await expect(liquid.parseAndRender('{{ name')).rejects.toThrow('output "{{ name" not closed')
  })
})
