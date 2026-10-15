import { readdirSync } from 'fs'
import { join } from 'path'
import { storefrontSampleData } from '../../src/shopify'
import { loadFixture } from './fixtures'

describe('storefront fixtures', () => {
  const names = readdirSync(join(__dirname, 'fixtures')).map(f => f.replace(/\.json$/, ''))
  // the page probe prints `request.host` and `canonical_url`, so the four `probe-page-*` fixtures hold the shop's domain, as the engine prints it from the data (`shop.domain`); nothing else may name a store
  const domain = storefrontSampleData.shop?.domain ?? ''
  it('are present and hold no store domain (other than the data\'s own) or theme markup', () => {
    expect(names.length).toBeGreaterThan(60)
    for (const name of names) {
      const text = JSON.stringify(loadFixture(name)).split(domain).join('')
      expect(text).not.toMatch(/myshopify\.com|shopify-section/)
    }
  })
})
