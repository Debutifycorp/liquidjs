import { Liquid } from '../../../src'
import { createShopifyLiquid, filterStatus, renderLiquid, shopifyFilterRegistry, SHOPIFY_FILTER_DOCS, SHOPIFY_FILTER_SETS, THEME_LIQUID_DOCS_REVISION } from '../../../src/shopify'
import type { FilterStatus } from '../../../src/shopify'

/**
 * The status split is pinned by invariants, not counts, because every task that implements a filter moves it from `stub` to `exact` or `approx`:
 *
 * - a name a Shopify implementation provides takes that implementation's status, `exact` or `approx`;
 * - a name no implementation provides but the plain engine does is `engine`;
 * - every other documented name is `stub`.
 *
 * What is implemented and what the plain engine provides is read from the data (`SHOPIFY_FILTER_SETS`, a plain `new Liquid()`), never from `filterStatus`, so the checks do not repeat the code they test.
 */
const plain = new Liquid()
const implemented = new Map<string, FilterStatus>()
for (const set of SHOPIFY_FILTER_SETS) {
  for (const [name, filter] of Object.entries(set)) implemented.set(name, filter.status)
}
const providedByEngine = (name: string) => name in plain.filters
const documentedNames = SHOPIFY_FILTER_DOCS.flatMap(doc => [doc.name, ...doc.aliases])
const isStub = (name: string) => !implemented.has(name) && !providedByEngine(name)
const stubNames = documentedNames.filter(isStub)

/** Every name (filters and aliases) for which `statusOf` breaks the invariants above, as `name: got, not wanted`. Empty when it keeps them. */
function violations (statusOf: (name: string) => FilterStatus): string[] {
  const broken: string[] = []
  for (const name of documentedNames) {
    const wanted = implemented.get(name) ?? (providedByEngine(name) ? 'engine' : 'stub')
    if (statusOf(name) !== wanted) broken.push(`${name}: ${String(statusOf(name))}, not ${wanted}`)
  }
  return broken
}

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
    for (const name of documentedNames) expect(name in liquid.filters).toBe(true)
  })
  it('gives every filter one of the four statuses', () => {
    for (const entry of shopifyFilterRegistry()) expect(['exact', 'approx', 'stub', 'engine']).toContain(entry.status)
  })

  describe('status split', () => {
    const registry = shopifyFilterRegistry()
    const withImplementation = registry.filter(entry => implemented.has(entry.name))
    const engineOnly = registry.filter(entry => !implemented.has(entry.name) && providedByEngine(entry.name))
    const neither = registry.filter(entry => isStub(entry.name))

    it('puts every entry in exactly one of the three groups', () => {
      expect(withImplementation.length + engineOnly.length + neither.length).toBe(registry.length)
      // the two groups no change to the stubs can empty
      expect(engineOnly.map(entry => entry.name)).toContain('upcase')
      expect(withImplementation.length).toBeGreaterThan(0)
    })
    it('marks a filter the plain engine provides and no Shopify implementation overrides as engine', () => {
      for (const entry of engineOnly) expect([entry.name, entry.status]).toEqual([entry.name, 'engine'])
    })
    it('marks a filter with a Shopify implementation exact or approx, as its implementation says', () => {
      for (const entry of withImplementation) {
        expect(['exact', 'approx']).toContain(entry.status)
        expect([entry.name, entry.status]).toEqual([entry.name, implemented.get(entry.name)])
      }
    })
    it('marks every other documented filter as stub', () => {
      for (const entry of neither) expect([entry.name, entry.status]).toEqual([entry.name, 'stub'])
    })
    it('gives each alias the status its own name would have', () => {
      expect(violations(filterStatus)).toEqual([])
      for (const doc of SHOPIFY_FILTER_DOCS) for (const alias of doc.aliases) expect(filterStatus(alias)).toBe(implemented.get(alias) ?? (providedByEngine(alias) ? 'engine' : 'stub'))
    })
    it('fails for a filterStatus that says engine for everything, and for one that says stub for everything', () => {
      const named = (list: string[]) => list.map(message => message.split(':')[0])
      const documentedImplemented = documentedNames.filter(name => implemented.has(name))
      const documentedEngine = documentedNames.filter(name => !implemented.has(name) && providedByEngine(name))
      expect(documentedImplemented.length).toBeGreaterThan(0)
      // engine for everything is wrong for every implemented filter and every stub
      expect(named(violations(() => 'engine'))).toEqual(expect.arrayContaining([...documentedImplemented, ...stubNames]))
      expect(named(violations(() => 'engine'))).not.toEqual(expect.arrayContaining(documentedEngine))
      // stub for everything is wrong for every implemented filter and every engine filter
      expect(named(violations(() => 'stub'))).toEqual(expect.arrayContaining([...documentedImplemented, ...documentedEngine]))
      expect(named(violations(() => 'stub'))).not.toEqual(expect.arrayContaining(stubNames))
      expect(violations(() => 'stub')).toContain('upcase: stub, not engine')
    })
  })

  describe('own properties only', () => {
    it('gives a name that is no filter the stub status', () => expect(filterStatus('no_such_filter')).toBe('stub'))
    it.each(['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__'])('does not read %s as an inherited Object member', name => {
      expect(filterStatus(name)).toBe('stub')
    })
  })

  it('leaves engine filters working', async () => {
    const { html, report } = await renderLiquid(liquid, "{{ 'a' | upcase }}{{ 'a-b' | split: '-' | join: '+' }}")
    expect(html).toBe('Aa+b')
    expect(report.stubbedFilters).toEqual([])
  })
  it('renders every stub, and every alias of one, as nothing and reports it under the name used', async () => {
    for (const name of stubNames) {
      const { html, report } = await renderLiquid(liquid, `[{{ 1 | ${name} }}]`)
      expect([name, html]).toEqual([name, '[]'])
      expect([name, report.stubbedFilters]).toEqual([name, [{ name, count: 1, files: [] }]])
      expect([name, report.unknownFilters]).toEqual([name, []])
      expect([name, filterStatus(name)]).toEqual([name, 'stub'])
    }
  })
})
