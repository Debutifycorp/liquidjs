import { createShopifyLiquid, renderLiquid, SHOPIFY_DEFAULT_LIMITS } from '../../src/shopify'

describe('createShopifyLiquid', () => {
  const liquid = createShopifyLiquid({ files: { 'snippets/price.liquid': '[{{ amount }}]' } })
  const render = (source: string, scope: object = {}) => renderLiquid(liquid, source, scope)

  it('uses Ruby number semantics', async () => expect((await render('{{ 10 | divided_by: 4 }} {{ 2.0 }}')).html).toBe('2 2.0'))
  it('nests comments', async () => expect((await render('a{% comment %}x{% comment %}y{% endcomment %}z{% endcomment %}b')).html).toBe('ab'))
  it('writes render errors inline and keeps going', async () => {
    const { html, report } = await render('a{{ 1 | divided_by: 0 }}b')
    expect(html).toBe('aLiquid error (line 1): divided by 0b')
    expect(report.errors).toEqual([{ message: 'Liquid error (line 1): divided by 0', file: undefined, line: 1 }])
  })
  it('renders an unknown tag as nothing and reports it', async () => {
    const { html, report } = await render('a{% frobnicate %}b{% endfrobnicate %}c')
    expect(html).toBe('abc')
    expect(report.unknownTags.map(entry => entry.name)).toEqual(['frobnicate', 'endfrobnicate'])
  })
  it('passes an unknown filter through and reports it', async () => {
    const { html, report } = await render("{{ 'x' | frobnicate | upcase }}")
    expect(html).toBe('X')
    expect(report.unknownFilters).toEqual([{ name: 'frobnicate', count: 1, files: [] }])
  })
  it('fails the parse on unknown tags when asked to, in Shopify words', async () => {
    const strict = createShopifyLiquid({ unknownTags: 'error' })
    await expect(renderLiquid(strict, '{% frobnicate %}')).rejects.toThrow("Unknown tag 'frobnicate'")
  })
  it('renders snippets from the in-memory files', async () => expect((await render("{% render 'price', amount: 5 %}")).html).toBe('[5]'))
  it('reports a missing snippet in Shopify words', async () => {
    const { html, report } = await render("{% render 'nope' %}")
    expect(html).toBe('Liquid error (line 1): Could not find asset snippets/nope.liquid')
    expect(report.missing).toEqual([{ kind: 'snippet', name: 'snippets/nope.liquid' }])
  })
  it('never reads the disk', async () => expect((await render("{% render '../package' %}")).html).toBe('Liquid error (line 1): Could not find asset snippets/../package.liquid'))
  it('sees an edited snippet on the next render', async () => {
    const files: Record<string, string> = { 'snippets/a.liquid': 'one' }
    const engine = createShopifyLiquid({ files })
    expect((await renderLiquid(engine, "{% render 'a' %}")).html).toBe('one')
    files['snippets/a.liquid'] = 'two'
    expect((await renderLiquid(engine, "{% render 'a' %}")).html).toBe('two')
  })
  it('sets the default limits', () => {
    expect(liquid.options.parseLimit).toBe(SHOPIFY_DEFAULT_LIMITS.parseLimit)
    expect(liquid.options.renderLimit).toBe(SHOPIFY_DEFAULT_LIMITS.renderLimit)
    expect(liquid.options.memoryLimit).toBe(SHOPIFY_DEFAULT_LIMITS.memoryLimit)
  })
  it('lets a caller lower a limit', async () => {
    const small = createShopifyLiquid({ parseLimit: 10 })
    await expect(renderLiquid(small, '{{ "a long template" }}')).rejects.toThrow(/parse length limit exceeded/)
  })
  it('hides own-property-less values', async () => expect((await render('{{ obj.constructor }}', { obj: {} })).html).toBe(''))
})
