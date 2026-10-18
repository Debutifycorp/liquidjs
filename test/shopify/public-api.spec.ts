import * as root from '../../src'
import * as shopify from '../../src/shopify'

describe('the /shopify entry', () => {
  it('exports the root entry and only the public Shopify names', () => {
    const added = Object.keys(shopify).filter(name => !Object.prototype.hasOwnProperty.call(root, name)).sort()
    expect(added).toEqual([
      'ColorDrop', 'ColorSchemeDrop', 'ContentForTag', 'DocTag', 'ExternalVideoUrlDrop', 'FontDrop', 'FormTag', 'ImageDrop', 'ImageUrlDrop', 'JavascriptTag', 'PaginateTag',
      'SHOPIFY_DEFAULT_LIMITS', 'SchemaTag', 'SectionTag', 'SectionsTag', 'SettingsDrop', 'ShopifyLayoutTag', 'ShopifyTablerowTag', 'StyleTag', 'StylesheetTag', 'Translator', 'VideoUrlDrop',
      'arrangeNested', 'cartJson', 'compileTheme', 'createShopifyLiquid', 'defaultServices', 'discountCodeStatus', 'findVariant', 'isShopifyFontFile', 'languageOf', 'lineItemJson', 'lineKey', 'localePrefixes', 'oembedJson', 'parseWrapper', 'predictiveJson', 'previewSampleData', 'productJson', 'quantityRuleOf', 'recommendationsJson', 'renderLiquid', 'renderPage', 'renderSection', 'requestFromUrl', 'resolveView', 'sampleStoreData', 'setViewCacheSize', 'shippingRates', 'shopifyFilterRegistry', 'shopifyFontInfo', 'shopifyPaymentIcon', 'stockFor', 'storefrontSampleData', 'themeLanguages', 'withLanguages'
    ])
  })
  it('exports CartLinesData, the cart shape 1.0 had, beside the CartData union (final review C, M1)', () => {
    const lines: shopify.CartLinesData = { items: [{ product_handle: 'a', variant_id: 1, quantity: 2 }] }
    const cart: shopify.CartData = lines
    expect('items' in cart ? cart.items[0].quantity : 0).toBe(2)
  })
  it('leaves the root tag classes alone and registers its own under the Shopify names', () => {
    expect(shopify.TablerowTag).toBe(root.TablerowTag)
    expect(shopify.LayoutTag).toBe(root.LayoutTag)
    const liquid = shopify.createShopifyLiquid()
    expect(liquid.tags.tablerow).toBe(shopify.ShopifyTablerowTag)
    expect(liquid.tags.layout).toBe(shopify.ShopifyLayoutTag)
  })
  it('freezes the defaults every render shares, and the sample store all the way down', () => {
    expect(() => { (shopify.defaultServices as shopify.ShopifyServices).assetUrl = () => 'changed' }).toThrow(TypeError)
    expect(() => { (shopify.SHOPIFY_DEFAULT_LIMITS as { renderLimit: number }).renderLimit = Infinity }).toThrow(TypeError)
    const frozen = (value: unknown): boolean => !value || typeof value !== 'object' || (Object.isFrozen(value) && Object.values(value).every(frozen))
    expect(frozen(shopify.sampleStoreData)).toBe(true)
    expect(frozen(shopify.storefrontSampleData)).toBe(true)
    shopify.shopifyFilterRegistry()[0].aliases.push('changed')
    expect(shopify.shopifyFilterRegistry()[0].aliases).not.toContain('changed')
  })
})
