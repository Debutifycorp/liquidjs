import { createShopifyLiquid, renderLiquid, storefrontSampleData } from '../../src/shopify'
import { ReportCollector } from '../../src/shopify/report'
import { buildStore } from '../../src/shopify/store/build'
import { buildGlobals } from '../../src/shopify/store/globals'
import { requestFromUrl } from '../../src/shopify/store/request'

const liquid = createShopifyLiquid()
const render = async (source: string, scope: object) => (await renderLiquid(liquid, source, scope)).html
const globalsOf = (url: string) => {
  const page = requestFromUrl(url, storefrontSampleData)
  return buildGlobals({ store: buildStore(storefrontSampleData), data: storefrontSampleData, templateName: page.templateName, request: page.request, locale: 'en', report: new ReportCollector() }).globals
}

describe('collection objects', () => {
  it('gives a vendor or type collection the term it lists as current_vendor or current_type', async () => {
    const source = '[{{ collection.current_vendor }}|{{ collection.current_type }}|{{ collection.products_count }}]'
    expect(await render(source, globalsOf('/collections/vendors?q=mock.shop'))).toBe('[mock.shop||29]')
    expect(await render(source, globalsOf('/collections/types?q=Hoodies'))).toBe('[|Hoodies|7]')
    expect(await render(source, globalsOf('/collections/men'))).toBe('[||10]')
    expect(await render('<input value="{{ collection.current_vendor }}">', globalsOf('/collections/vendors?q=%22%3E%3Cb%3E'))).toBe('<input value="&quot;&gt;&lt;b&gt;">')
  })
  it('gives the collections Shopify makes no id', async () => {
    expect(await render('[{{ collection.id }}|{{ collection.id | json }}]', globalsOf('/collections/all'))).toBe('[|null]')
    expect(await render('[{{ collection.id }}]', globalsOf('/collections/vendors?q=mock.shop'))).toBe('[]')
    expect(await render('{{ collections.men.id }}', globalsOf('/'))).not.toBe('')
  })
  it('reads the collection title as the alt of its own image when the image has none', async () => {
    expect(await render('{{ collections.men.featured_image.alt }}|{{ collections.men.image.alt }}|{{ collections.all.featured_image.alt }}', globalsOf('/'))).toBe('Men|Men|Beanie')
  })
})
