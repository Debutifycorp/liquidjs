import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '../../..')

describe('storefront imports', () => {
  it('reach the engine only through its public entry, and Node only through crypto', () => {
    const dir = join(root, 'src/storefront')
    for (const file of readdirSync(dir)) {
      const source = readFileSync(join(dir, file), 'utf8')
      for (const [, from] of source.matchAll(/from '([^']+)'/g)) {
        expect([file, from]).toEqual([file, expect.stringMatching(/^(\.\.\/shopify|\.\/[a-z-]+|crypto)$/)])
      }
    }
  })
})

describe('the storefront package entry', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

  it('is exported beside ./shopify, with its types in both places a resolver looks', () => {
    expect(pkg.exports['./storefront']).toEqual({ types: './dist/storefront/index.d.ts', module: './dist/storefront.node.mjs', default: './dist/storefront.node.js' })
    expect(Object.keys(pkg.exports).indexOf('./storefront')).toBe(Object.keys(pkg.exports).indexOf('./shopify') + 1)
    expect(pkg.typesVersions['*'].storefront).toEqual(['dist/storefront/index.d.ts'])
    for (const file of Object.values<string>(pkg.exports['./storefront'])) expect([file, existsSync(join(root, file))]).toEqual([file, true])
  })

  it('is built to dist as Node-only bundles that import the engine by its package name, never by a path', () => {
    const allowed = ['@debutify/liquidjs/shopify', 'crypto']
    const cjs = readFileSync(join(root, 'dist/storefront.node.js'), 'utf8')
    const esm = readFileSync(join(root, 'dist/storefront.node.mjs'), 'utf8')
    const specifiers = [...cjs.matchAll(/require\('([^']+)'\)/g), ...esm.matchAll(/from '([^']+)'/g)].map(match => match[1])
    for (const specifier of specifiers) expect(allowed).toContain(specifier)
    // the engine is not copied in: a process holds one copy of it, the one `@debutify/liquidjs/shopify` loads
    for (const source of [cjs, esm]) expect(source).not.toMatch(/class Liquid |class Context /)
  })

  it('loads from dist and lists its public names', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const storefront = require('../../../dist/storefront.node.js')
    expect(storefront.DEFAULT_LIMITS).toMatchObject({ body: 65536, lines: 100, quantity: 9999, properties: 25, propertyLength: 255, sections: 5, search: 256, visitors: 10000, idleMs: 86400000 })
    expect(Object.isFrozen(storefront.DEFAULT_LIMITS)).toBe(true)
  })
})
