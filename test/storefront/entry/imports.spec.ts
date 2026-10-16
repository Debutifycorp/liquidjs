import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '../../..')

/** Every module a source file names: `from '…'` (`import` and `export … from`), a side-effect `import '…'`, and `import('…')` / `require('…')`. */
function specifiers (source: string): string[] {
  return [
    ...source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g),
    ...source.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm),
    ...source.matchAll(/\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]/g)
  ].map(match => match[1])
}

describe('storefront imports', () => {
  it('reach the engine only through its public entry, and Node only through crypto', () => {
    const dir = join(root, 'src/storefront')
    for (const file of readdirSync(dir)) {
      const source = readFileSync(join(dir, file), 'utf8')
      for (const from of specifiers(source)) {
        expect([file, from]).toEqual([file, expect.stringMatching(/^(\.\.\/shopify|\.\/[a-z-]+|crypto)$/)])
      }
    }
  })

  it('sees every spelling of an import', () => {
    expect(specifiers([
      'import { a } from \'../shopify\'', 'import type { B } from "../shopify/store/types"', 'export { c } from \'./c\'', 'import \'fs\'', '  import "node:fs"',
      'const d = require(\'fs\')', 'const e = await import( \'../liquid\' )', 'export type { F } from \'crypto\''
    ].join('\n'))).toEqual(['../shopify', '../shopify/store/types', './c', 'crypto', 'fs', 'node:fs', 'fs', '../liquid'])
    // a word that merely contains `from` or `import` is no import
    expect(specifiers('const fromage = 1\n// they import it, then require(x)\nconst important = (\'a\')')).toEqual([])
  })
})

describe('the storefront package entry', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

  it('is exported beside ./shopify, with its types in both places a resolver looks', () => {
    expect(pkg.exports['./storefront']).toEqual({ types: './dist/storefront/index.d.ts', module: './dist/storefront.node.mjs', default: './dist/storefront.node.js' })
    expect(Object.keys(pkg.exports).indexOf('./storefront')).toBe(Object.keys(pkg.exports).indexOf('./shopify') + 1)
    expect(pkg.typesVersions['*'].storefront).toEqual(['dist/storefront/index.d.ts'])
  })
})
