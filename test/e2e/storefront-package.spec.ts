import { execFileSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'

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
    expect(Object.keys(storefront).sort()).toEqual(['DEFAULT_LIMITS', 'createStorefront', 'memoryCartStore', 'storefrontClientScript'])
  })

  it('loads as an ES module from dist and lists the same public names (final review C, M6)', () => {
    const script = 'const entry = await import(process.argv[1]); console.log(JSON.stringify(Object.keys(entry).sort()))'
    const names = execFileSync(process.execPath, ['--input-type=module', '-e', script, pathToFileURL(join(root, 'dist/storefront.node.mjs')).href], { encoding: 'utf8' })
    expect(JSON.parse(names)).toEqual(['DEFAULT_LIMITS', 'createStorefront', 'memoryCartStore', 'storefrontClientScript'])
  })

  it('declares the real version in dist/index.d.ts, which the storefront bundles emit again (final review C, I2)', () => {
    for (const file of ['dist/index.d.ts', 'dist/shopify/index.d.ts']) {
      const declarations = readFileSync(join(root, file), 'utf8')
      expect(declarations).not.toContain('[VI]')
    }
    expect(readFileSync(join(root, 'dist/index.d.ts'), 'utf8')).toContain(`export declare const version = "${pkg.version}";`)
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

  it('answers a sandboxed page from dist with the client script, and exports the script on its own', async () => {
    const { createStorefront, storefrontClientScript } = require('../../dist/storefront.node.js')
    const { storefrontSampleData } = require('../../dist/shopify.node.js')
    const theme = { files: { 'config/settings_schema.json': '[]', 'config/settings_data.json': '{"current":{}}', 'layout/theme.liquid': '<html><head>{{ content_for_header }}</head><body>{{ content_for_layout }}</body></html>', 'templates/index.liquid': 'home' } }
    const storefront = createStorefront({ theme, data: storefrontSampleData })
    const sandbox = { visitor: 'dist-visitor-key-0001', basePath: '/p/tok', sandbox: true }
    const preflight = await storefront.handle(new Request('https://store.invalid/p/tok/cart/add.js', { method: 'OPTIONS' }), sandbox)
    expect([preflight.status, preflight.headers.get('access-control-allow-origin')]).toEqual([204, '*'])
    const home = await storefront.handle(new Request('https://store.invalid/p/tok'), sandbox)
    const html = await home.text()
    expect([home.status, home.headers.get('access-control-allow-origin'), home.headers.get('set-cookie')]).toEqual([200, '*', null])
    expect(html.startsWith(`<html><head><script>${storefrontClientScript({ basePath: '/p/tok' })}</script>`)).toBe(true)
  })
})
