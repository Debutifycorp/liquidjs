import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

// Reads the built files in `dist`, like the other e2e specs: run `pnpm build` first.
const root = join(__dirname, '../..')

describe('the built storefront entry', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

  it('writes every file the package exports', () => {
    for (const file of Object.values<string>(pkg.exports['./storefront'])) expect([file, existsSync(join(root, file))]).toEqual([file, true])
  })

  it('is two Node-only bundles that import the engine by its package name, never by a path', () => {
    const allowed = ['@debutify/liquidjs/shopify', 'crypto']
    const cjs = readFileSync(join(root, 'dist/storefront.node.js'), 'utf8')
    const esm = readFileSync(join(root, 'dist/storefront.node.mjs'), 'utf8')
    const specifiers = [...cjs.matchAll(/require\('([^']+)'\)/g), ...esm.matchAll(/from '([^']+)'/g), ...esm.matchAll(/^import '([^']+)'/gm)].map(match => match[1])
    for (const specifier of specifiers) expect(allowed).toContain(specifier)
    // the engine is not copied in: a process holds one copy of it, the one `@debutify/liquidjs/shopify` loads
    for (const source of [cjs, esm]) expect(source).not.toMatch(/class Liquid |class Context /)
  })

  it('loads from dist and lists its public names', () => {
    const storefront = require('../../dist/storefront.node.js')
    expect(storefront.DEFAULT_LIMITS).toMatchObject({ body: 65536, lines: 100, quantity: 9999, properties: 25, propertyLength: 255, sections: 5, search: 256, visitors: 10000, idleMs: 86400000 })
    expect(Object.isFrozen(storefront.DEFAULT_LIMITS)).toBe(true)
  })
})
