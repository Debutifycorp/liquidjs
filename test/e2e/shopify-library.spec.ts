import { readFileSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '../..')
const read = (file: string) => readFileSync(join(root, file), 'utf8')

describe('the built shopify-library entry', () => {
  it('is one CommonJS file that both /shopify bundles import by its package name, once', () => {
    const pkg = JSON.parse(read('package.json'))
    expect(pkg.exports['./shopify-library']).toEqual({ types: './dist/shopify-library/index.d.ts', default: './dist/shopify-library.js' })
    const cjs = read('dist/shopify.node.js')
    const esm = read('dist/shopify.node.mjs')
    expect(cjs.match(/require\('@debutify\/liquidjs\/shopify-library'\)/g)).toHaveLength(1)
    expect(esm.match(/from '@debutify\/liquidjs\/shopify-library'/g)).toHaveLength(1)
    for (const source of [cjs, esm]) expect(source).not.toContain('aria-labelledby="pi-visa"')
    // the font table is in the same file, and in neither /shopify bundle
    expect(read('dist/shopify-library.js')).toContain('Zen Old Mincho')
    for (const source of [cjs, esm]) expect(source).not.toContain('Zen Old Mincho')
  })
  it('is held by no other bundle: the root, browser and storefront ones carry no icon and do not import it', () => {
    for (const file of ['liquid.node.js', 'liquid.node.mjs', 'liquid.browser.mjs', 'liquid.browser.umd.js', 'liquid.browser.min.js', 'storefront.node.js', 'storefront.node.mjs']) {
      const source = read(`dist/${file}`)
      expect([file, source.includes('aria-labelledby="pi-visa"')]).toEqual([file, false])
      expect([file, source.includes('Zen Old Mincho')]).toEqual([file, false])
      expect([file, source.includes('shopify-library')]).toEqual([file, false])
    }
  })
  it("prints Shopify's icon from dist", async () => {
    const { createShopifyLiquid, renderLiquid } = require('../../dist/shopify.node.js')
    const { html } = await renderLiquid(createShopifyLiquid(), "{{ 'visa' | payment_type_svg_tag }}")
    expect(html).toContain('<title id="pi-visa">Visa</title>')
  })
  it("reads Shopify's font library from dist", async () => {
    const { createShopifyLiquid, isShopifyFontFile, renderLiquid, shopifyFontInfo } = require('../../dist/shopify.node.js')
    expect(shopifyFontInfo('harmonia_sans_n4').family).toBe('Poppins')
    expect(isShopifyFontFile(shopifyFontInfo('assistant_n4').files.woff2)).toBe(true)
    const { html } = await renderLiquid(createShopifyLiquid(), "{{ 'assistant_n4' | font_url }}")
    expect(html).toBe(`/fonts/${shopifyFontInfo('assistant_n4').files.woff2}`)
  })
})
