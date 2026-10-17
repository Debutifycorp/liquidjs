import { createShopifyLiquid, renderLiquid } from '../../src/shopify'
import type { StoreData } from '../../src/shopify'
import { ReportCollector } from '../../src/shopify/report'
import { buildStore } from '../../src/shopify/store/build'
import { buildGlobals } from '../../src/shopify/store/globals'
import { resolveView } from '../../src/shopify/store/view'

const liquid = createShopifyLiquid()
const render = async (source: string, scope: object) => (await renderLiquid(liquid, source, scope)).html

const data: StoreData = {
  shop: { name: 'S', domain: 's.example', currency: 'USD' },
  markets: [{ handle: 'us', name: 'US', primary: true, countries: [{ iso_code: 'US', name: 'United States' }], currency: { iso_code: 'USD', symbol: '$', rate: 1 }, languages: ['en', 'ar', 'he', 'pa-Arab'] }],
  languages: [{ iso_code: 'en', name: 'English', endonym_name: 'English' }, { iso_code: 'ar', name: 'Arabic', endonym_name: 'العربية' }, { iso_code: 'he', name: 'Hebrew', endonym_name: 'עברית' }, { iso_code: 'pa-Arab', name: 'Punjabi', endonym_name: 'پنجابی' }]
}

describe('shop_locale.direction', () => {
  it('is rtl for a right-to-left language and ltr for the others', async () => {
    const page = (language: string, localePrefix: string) => buildGlobals({ store: buildStore(data, resolveView(data, { language, localePrefix })), data, templateName: 'index', request: { language, localePrefix }, locale: language, report: new ReportCollector() }).globals
    expect(await render('{{ request.locale.direction }}|{% for l in shop.published_locales %}{{ l.iso_code }}={{ l.direction }} {% endfor %}|{{ localization.language.direction }}', page('en', ''))).toBe('ltr|en=ltr ar=rtl he=rtl pa-Arab=rtl |ltr')
    expect(await render('<html dir="{{ request.locale.direction | default: \'ltr\' }}">', page('ar', '/ar'))).toBe('<html dir="rtl">')
  })
})
