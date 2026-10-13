import { createShopifyLiquid, renderLiquid, shopifyFilterRegistry, SHOPIFY_FILTER_DOCS, THEME_LIQUID_DOCS_REVISION } from '../../../src/shopify'

describe('Shopify filter registry', () => {
  const liquid = createShopifyLiquid()

  it('records the theme-liquid-docs revision it was generated from', () => expect(THEME_LIQUID_DOCS_REVISION).toMatch(/^[0-9a-f]{40}$/))
  it('lists each filter once', () => {
    const names = SHOPIFY_FILTER_DOCS.map(doc => doc.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names.filter(name => name === 'date')).toHaveLength(1)
  })
  it('records the t and handle aliases', () => {
    expect(SHOPIFY_FILTER_DOCS.find(doc => doc.name === 'translate')!.aliases).toEqual(['t'])
    expect(SHOPIFY_FILTER_DOCS.find(doc => doc.name === 'handleize')!.aliases).toEqual(['handle'])
  })
  it('registers every documented filter and alias', () => {
    for (const doc of SHOPIFY_FILTER_DOCS) {
      for (const name of [doc.name, ...doc.aliases]) expect(name in liquid.filters).toBe(true)
    }
  })
  it('gives every filter a status', () => {
    for (const entry of shopifyFilterRegistry()) expect(['exact', 'approx', 'stub', 'engine']).toContain(entry.status)
  })
  it('marks standard Liquid filters as engine filters', () => expect(shopifyFilterRegistry().find(entry => entry.name === 'upcase')!.status).toBe('engine'))
  it('leaves engine filters working', async () => expect((await renderLiquid(liquid, "{{ 'a' | upcase }}")).html).toBe('A'))
  it('renders a stubbed filter as nothing and reports it', async () => {
    const { html, report } = await renderLiquid(liquid, '[{{ 1500 | weight_with_unit }}]')
    expect(html).toBe('[]')
    expect(report.stubbedFilters).toEqual([{ name: 'weight_with_unit', count: 1, files: [] }])
    expect(report.unknownFilters).toEqual([])
  })
})
