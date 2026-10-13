import { createShopifyLiquid, renderLiquid } from '../../../src/shopify'

// A documented filter named like an `Object.prototype` member must still be registered: registration looks names up as own properties of the implementations and of the engine's filters, not with `in`.
jest.mock('../../../src/shopify/filters/registry.generated', () => ({
  THEME_LIQUID_DOCS_REVISION: '0'.repeat(40),
  SHOPIFY_FILTER_DOCS: [
    { name: 'constructor', aliases: ['toString'], category: 'test', deprecated: false, syntax: 'string | constructor' },
    { name: 'hasOwnProperty', aliases: [], category: 'test', deprecated: false, syntax: 'string | hasOwnProperty' },
    { name: 'upcase', aliases: [], category: 'test', deprecated: false, syntax: 'string | upcase' }
  ]
}))

describe('Shopify filter registration', () => {
  const liquid = createShopifyLiquid()

  it('registers a stub for a documented filter named like an Object member, and for its alias', async () => {
    for (const name of ['constructor', 'toString', 'hasOwnProperty']) {
      expect(name in liquid.filters).toBe(true)
      const { html, report } = await renderLiquid(liquid, `[{{ 1 | ${name} }}]`)
      expect([name, html]).toEqual([name, '[]'])
      expect([name, report.stubbedFilters]).toEqual([name, [{ name, count: 1, files: [] }]])
      expect([name, report.unknownFilters]).toEqual([name, []])
    }
  })
  it('leaves an engine filter alone', async () => {
    const { html, report } = await renderLiquid(liquid, "{{ 'a' | upcase }}")
    expect(html).toBe('A')
    expect(report.stubbedFilters).toEqual([])
  })
})
