import { createShopifyLiquid, renderLiquid } from '../../src/shopify'
import type { StoreData } from '../../src/shopify'
import { resolveView } from '../../src/shopify/store/view'
import { buildLocalization } from '../../src/shopify/store/markets'

const liquid = createShopifyLiquid()
const render = async (source: string, scope: object) => (await renderLiquid(liquid, source, scope)).html

// https://shopify.dev/docs/api/liquid/objects/country: `popular?` "returns true if the country is popular for this shop", false otherwise, "to sort countries in a country selector".
const data: StoreData = {
  shop: { name: 'S', domain: 's.example', currency: 'USD' },
  markets: [
    { handle: 'us', name: 'US', primary: true, countries: [{ iso_code: 'US', name: 'United States', popular: true }], currency: { iso_code: 'USD', symbol: '$', rate: 1 }, languages: ['en'] },
    { handle: 'ca', name: 'Canada', countries: [{ iso_code: 'CA', name: 'Canada' }], currency: { iso_code: 'CAD', symbol: '$', rate: 1.3 }, languages: ['en'], subfolder: 'ca' }
  ]
}

describe('country.popular?', () => {
  it('is true for a country the data marks as popular and false for any other, in the list and as the current country', async () => {
    const localization = buildLocalization(data, resolveView(data, {}))
    expect(await render('{% for c in localization.available_countries %}{{ c.iso_code }}={{ c["popular?"] }},{% endfor %}{{ localization.country["popular?"] }}', { localization })).toBe('CA=false,US=true,true')
  })
})
