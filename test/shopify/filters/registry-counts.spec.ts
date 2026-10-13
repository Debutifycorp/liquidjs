import { readFileSync } from 'fs'
import { join } from 'path'
import { shopifyFilterRegistry } from '../../../src/shopify'

/**
 * The README's "Filter status" section states how many filters are `engine`, `approx` and `stub` ("This release has 154 filters: 56 `engine`, 51 `approx`, 47 `stub`, none `exact` yet"). `registry.spec.ts` pins the split by invariants, because every task that implements a filter moves it between groups; this spec reads the README line and fails when its numbers differ from the registry's, so a change to a filter's status has to update the README in the same commit.
 */
const readme = readFileSync(join(__dirname, '../../../README.md'), 'utf8')
const STATED = /This release has (\d+) filters: (\d+) `engine`, (\d+) `approx`, (\d+) `stub`, (none|\d+) `exact`/

describe('README filter counts', () => {
  const registry = shopifyFilterRegistry()
  const counts = { engine: 0, approx: 0, stub: 0, exact: 0 }
  for (const entry of registry) counts[entry.status]++

  it('states the counts the registry has', () => {
    const match = STATED.exec(readme)
    expect(match).not.toBeNull()
    const [, total, engine, approx, stub, exact] = match!
    expect({ total: Number(total), engine: Number(engine), approx: Number(approx), stub: Number(stub), exact: exact === 'none' ? 0 : Number(exact) })
      .toEqual({ total: registry.length, ...counts })
  })
})
