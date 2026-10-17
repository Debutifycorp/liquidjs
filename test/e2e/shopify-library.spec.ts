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
  })
  it('is held by no other bundle: the root, browser and storefront ones carry no icon and do not import it', () => {
    for (const file of ['liquid.node.js', 'liquid.node.mjs', 'liquid.browser.mjs', 'liquid.browser.umd.js', 'liquid.browser.min.js', 'storefront.node.js', 'storefront.node.mjs']) {
      const source = read(`dist/${file}`)
      expect([file, source.includes('aria-labelledby="pi-visa"')]).toEqual([file, false])
      expect([file, source.includes('shopify-library')]).toEqual([file, false])
    }
  })
  it("prints Shopify's icon from dist", async () => {
    const { createShopifyLiquid, renderLiquid } = require('../../dist/shopify.node.js')
    const { html } = await renderLiquid(createShopifyLiquid(), "{{ 'visa' | payment_type_svg_tag }}")
    expect(html).toContain('<title id="pi-visa">Visa</title>')
  })
})
