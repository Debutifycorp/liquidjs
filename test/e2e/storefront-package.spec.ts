import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

// Reads the built files in `dist`, like the other e2e specs: run `pnpm build` first.
const root = join(__dirname, '../..')

describe('the built storefront entry', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

  it('writes every file the package exports', () => {
    for (const file of Object.values<string>(pkg.exports['./storefront'])) expect([file, existsSync(join(root, file))]).toEqual([file, true])
  })

  it('is two Node-only bundles that import the engine by its package name, once, never by a path', () => {
    const allowed = ['@debutify/liquidjs/shopify', 'crypto']
    const cjs = readFileSync(join(root, 'dist/storefront.node.js'), 'utf8')
    const esm = readFileSync(join(root, 'dist/storefront.node.mjs'), 'utf8')
    const specifiers = [...cjs.matchAll(/require\('([^']+)'\)/g), ...esm.matchAll(/from '([^']+)'/g), ...esm.matchAll(/^import '([^']+)'/gm)].map(match => match[1])
    for (const specifier of specifiers) expect(allowed).toContain(specifier)
    // the entry reaches the router and the pages, so the engine is imported, and exactly once per bundle
    expect(cjs.match(/require\('@debutify\/liquidjs\/shopify'\)/g)).toHaveLength(1)
    expect(esm.match(/from '@debutify\/liquidjs\/shopify'/g)).toHaveLength(1)
    expect(esm).toMatch(/^import \{[^}]*\brenderPage\b[^}]*\} from '@debutify\/liquidjs\/shopify'/m)
    // the engine is not copied in: a process holds one copy of it, the one `@debutify/liquidjs/shopify` loads
    for (const source of [cjs, esm]) expect(source).not.toMatch(/class Liquid |class Context /)
  })

  it('loads from dist and lists its public names', () => {
    const storefront = require('../../dist/storefront.node.js')
    expect(storefront.DEFAULT_LIMITS).toMatchObject({ body: 65536, lines: 100, quantity: 9999, properties: 25, propertyLength: 255, sections: 5, search: 256, visitors: 10000, idleMs: 86400000 })
    expect(Object.isFrozen(storefront.DEFAULT_LIMITS)).toBe(true)
    expect(Object.keys(storefront).sort()).toEqual(['DEFAULT_LIMITS', 'createStorefront', 'memoryCartStore'])
  })

  it('answers requests from dist, through the engine the package loads once', async () => {
    const { createStorefront } = require('../../dist/storefront.node.js')
    const { storefrontSampleData } = require('../../dist/shopify.node.js')
    const theme = { files: { 'config/settings_schema.json': '[]', 'config/settings_data.json': '{"current":{}}', 'layout/theme.liquid': '<main>{{ content_for_layout }}</main>', 'templates/index.liquid': 'home {{ shop.name | escape }}', 'templates/404.liquid': 'missing', 'templates/password.liquid': 'locked' } }
    const reports: unknown[] = []
    const storefront = createStorefront({ theme, data: storefrontSampleData, password: 'open', onReport: (report: unknown) => reports.push(report) })
    const home = await storefront.handle(new Request('https://store.invalid/'), { visitor: 'dist-visitor-key-0001' })
    expect([home.status, await home.text()]).toEqual([200, expect.stringMatching(/^<main>home .+<\/main>$/)])
    const missing = await storefront.handle(new Request('https://store.invalid/nope'), { visitor: 'dist-visitor-key-0001' })
    expect([missing.status, await missing.text(), missing.headers.get('cache-control')]).toEqual([404, '<main>missing</main>', 'private, no-store'])
    const broken = createStorefront({ theme: { files: {} }, data: storefrontSampleData })
    const failed = await broken.handle(new Request('https://store.invalid/'), { visitor: 'dist-visitor-key-0001' })
    expect([failed.status, await failed.text()]).toEqual([500, expect.stringContaining('This page could not be shown.')])
    expect(reports).toHaveLength(2)
  })
})
