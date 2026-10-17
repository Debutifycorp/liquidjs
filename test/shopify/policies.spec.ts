import { createShopifyLiquid, renderLiquid, renderPage, requestFromUrl, sampleStoreData, storefrontSampleData } from '../../src/shopify'
import type { StoreData } from '../../src/shopify'
import { buildStore } from '../../src/shopify/store/build'
import { resolveView } from '../../src/shopify/store/view'
import { harness } from '../storefront/entry/harness'

const liquid = createShopifyLiquid()
const render = async (source: string, scope: object) => (await renderLiquid(liquid, source, scope)).html

const data: StoreData = {
  shop: {
    name: 'S',
    domain: 's.example',
    currency: 'USD',
    password_message: 'Opening soon',
    policies: [
      { type: 'privacy_policy', body: '<p>Private.</p>' },
      { type: 'shipping_policy', title: 'Delivery', body: '<p>Fast.</p>', id: 7 },
      { type: 'refund_policy', body: '' }
    ]
  },
  languages: [{ iso_code: 'en', name: 'English', endonym_name: 'English' }, { iso_code: 'fr', name: 'French', endonym_name: 'français' }],
  translations: { fr: { policies: { privacy_policy: { title: 'Confidentialité', content: '<p>Privé.</p>' } } } }
}

describe('shop policies', () => {
  it('lists the policies that are set and names each one', async () => {
    const { shop } = buildStore(data)
    expect(await render('{% for policy in shop.policies %}{{ policy.title }}={{ policy.url }}={{ policy.body }}={{ policy.id | json }};{% endfor %}|{{ shop.privacy_policy.title }}|{{ shop.shipping_policy.url }}|{{ shop.refund_policy | json }}|{{ shop.terms_of_service | json }}|{{ shop.subscription_policy | json }}', { shop }))
      .toBe('Privacy policy=/policies/privacy-policy=<p>Private.</p>=null;Delivery=/policies/shipping-policy=<p>Fast.</p>=7;|Privacy policy|/policies/shipping-policy|null|null|null')
  })
  it('translates a policy and puts its URL under the view\'s prefix', async () => {
    const { shop } = buildStore(data, resolveView(data, { language: 'fr', localePrefix: '/fr' }))
    expect(await render('{% for policy in shop.policies %}{{ policy.title }}={{ policy.url }}={{ policy.body }};{% endfor %}', { shop })).toBe('Confidentialité=/fr/policies/privacy-policy=<p>Privé.</p>;Delivery=/fr/policies/shipping-policy=<p>Fast.</p>;')
  })
  it('gives the password message', async () => {
    expect(await render('[{{ shop.password_message }}]', { shop: buildStore(data).shop })).toBe('[Opening soon]')
    expect(await render('[{{ shop.password_message }}]', { shop: buildStore({ shop: { name: 'S', domain: 's.example', currency: 'USD' } }).shop })).toBe('[]')
  })
  it('holds the parity store\'s privacy policy in the storefront sample, and four policies in the public sample', async () => {
    expect(await render('{% for policy in shop.policies %}{{ policy.url }} {% endfor %}', { shop: buildStore(storefrontSampleData).shop })).toBe('/policies/privacy-policy ')
    expect(await render('{{ shop.privacy_policy.title }}', { shop: buildStore(storefrontSampleData, resolveView(storefrontSampleData, { market: 'ca', language: 'fr', localePrefix: '/fr-ca' })).shop })).toBe('Politique de confidentialité')
    expect(await render('{{ shop.policies | map: "title" | join: "," }}', { shop: buildStore(sampleStoreData).shop })).toBe('Privacy policy,Refund policy,Shipping policy,Terms of service')
  })
  it('renders a policy page in the theme layout, with no template of the theme', async () => {
    const theme = { files: { 'layout/theme.liquid': '<title>{{ page_title }}</title><main data-template="{{ template.name }}" data-page="{{ request.page_type }}">{{ content_for_layout }}</main>{{ canonical_url }}' } }
    const page = requestFromUrl('/policies/privacy-policy', data)
    expect([page.templateName, page.request.resource]).toEqual(['policy', 'privacy-policy'])
    const { html } = await renderPage({ theme, data, templateName: page.templateName, request: page.request })
    expect(html).toBe('<title>Privacy policy</title><main data-template="" data-page="policy"><div class="shopify-policy__container">\n  <div class="shopify-policy__title">\n    <h1>Privacy policy</h1>\n  </div>\n\n  <div class="shopify-policy__body">\n    <div class="rte">\n        <p>Private.</p>\n    </div>\n  </div>\n</div>\n</main>https://s.example/policies/privacy-policy')
  })
  it('adds the rules of the stylesheet Shopify links for a policy page to its header, and to no other page', async () => {
    const theme = { files: { 'layout/theme.liquid': '<head>{{ content_for_header }}</head>{{ content_for_layout }}' } }
    const policy = requestFromUrl('/policies/privacy-policy', data)
    const { html } = await renderPage({ theme, data, templateName: policy.templateName, request: policy.request })
    expect(html).toContain('.shopify-policy__container{max-width:560px;max-width:65ch;margin:0 auto;padding-left:20px;padding-right:20px}.shopify-policy__title{text-align:center}')
    expect(html).toContain('.shopify-policy__remote-policy-body{margin-bottom:20px}')
    const unset = requestFromUrl('/policies/terms-of-service', data)
    expect((await renderPage({ theme, data, templateName: unset.templateName, request: unset.request })).html).not.toContain('shopify-policy')
    const home = requestFromUrl('/', data)
    expect((await renderPage({ theme: { files: { ...theme.files, 'templates/index.liquid': 'home' } }, data, templateName: home.templateName, request: home.request })).html).not.toContain('shopify-policy')
  })
  it('takes the first entry of a type and ignores a type Shopify has not, in the shop and at the policy address alike', async () => {
    const doubled: StoreData = { ...data, shop: { ...data.shop, policies: [{ type: 'terms_of_service', body: '<p>First.</p>' }, { type: 'terms_of_service', body: '<p>Second.</p>' }, { type: 'cancellation_policy' as 'legal_notice', body: '<p>Odd.</p>' }] } }
    const { shop } = buildStore(doubled)
    expect(await render('{{ shop.policies | size }}|{{ shop.terms_of_service.body }}', { shop })).toBe('1|<p>First.</p>')
    const page = requestFromUrl('/policies/terms-of-service', doubled)
    const { html } = await renderPage({ theme: { files: { 'layout/theme.liquid': '{{ content_for_layout }}' } }, data: doubled, templateName: page.templateName, request: page.request })
    expect(html).toContain('<p>First.</p>')
    expect(html).not.toContain('Second')
  })
  it('answers the policy pages through the storefront, and 404 for a policy that is not set', async () => {
    const { send } = harness()
    const found = await send('GET', '/policies/privacy-policy')
    expect(found.status).toBe(200)
    expect(found.text).toContain('<h1>Privacy policy</h1>')
    expect((await send('GET', '/fr-ca/policies/privacy-policy')).text).toContain('<h1>Politique de confidentialité</h1>')
    for (const path of ['/policies/terms-of-service', '/policies/nope']) expect((await send('GET', path)).status).toBe(404)
  })
})
