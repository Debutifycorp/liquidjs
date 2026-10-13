import * as root from '../../src'
import * as shopify from '../../src/shopify'

describe('the /shopify entry', () => {
  it('exports the root entry and only the public Shopify names', () => {
    const added = Object.keys(shopify).filter(name => !Object.prototype.hasOwnProperty.call(root, name)).sort()
    expect(added).toEqual([
      'ColorDrop', 'ColorSchemeDrop', 'ContentForTag', 'DocTag', 'ExternalVideoUrlDrop', 'FontDrop', 'FormTag', 'ImageDrop', 'ImageUrlDrop', 'JavascriptTag', 'PaginateTag',
      'SHOPIFY_DEFAULT_LIMITS', 'SchemaTag', 'SectionTag', 'SectionsTag', 'SettingsDrop', 'ShopifyLayoutTag', 'ShopifyTablerowTag', 'StyleTag', 'StylesheetTag', 'Translator', 'VideoUrlDrop',
      'compileTheme', 'createShopifyLiquid', 'defaultServices', 'parseWrapper', 'renderLiquid', 'renderPage', 'renderSection', 'sampleStoreData', 'shopifyFilterRegistry'
    ])
  })
  it('leaves the root tag classes alone and registers its own under the Shopify names', () => {
    expect(shopify.TablerowTag).toBe(root.TablerowTag)
    expect(shopify.LayoutTag).toBe(root.LayoutTag)
    const liquid = shopify.createShopifyLiquid()
    expect(liquid.tags.tablerow).toBe(shopify.ShopifyTablerowTag)
    expect(liquid.tags.layout).toBe(shopify.ShopifyLayoutTag)
  })
})
