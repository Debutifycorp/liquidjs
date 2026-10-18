import { loadFixture } from '../fixtures'
import { harness, line } from './harness'

const HOODIE = 43695846621206
const SUNNIES = 43696940613654
const BEANIE = 43696949592086
const CHECKOUT = /^\/checkouts\/cn\/([^/?]+)\/([a-z]{2})-([a-z]{2})\?_r=(AQAB[\w-]{48})(&.*)?$/

describe('checkout, the account and the cart permalink', () => {
  it('answers /checkout with a 302 to Shopify\'s checkout address for the cart, as the parity store does (ajax-checkout-redirects)', async () => {
    const { send, seed } = harness()
    await seed([line(SUNNIES, 1)])
    const answer = await send('GET', '/checkout')
    expect(answer.status).toBe(302)
    const match = CHECKOUT.exec(answer.headers.get('location')!)
    expect(match?.slice(2, 4)).toEqual(['en', 'us'])
    expect(match![1]).toBe(((await send('GET', '/cart.js')).json as any).token.split('?')[0])
    expect((await send('GET', '/checkout/')).status).toBe(302)
    expect((await send('POST', '/checkout')).status).toBe(302)
  })

  it('takes the language from the locale prefix and the country from the cart, and keeps the base path', async () => {
    const { send, seed } = harness({}, { visitor: 'test-visitor-key-0001', basePath: '/p/tok' })
    await seed([line(SUNNIES, 1)])
    const french = await send('GET', '/p/tok/fr-ca/checkout')
    expect(/^\/p\/tok\/checkouts\/cn\/[^/]+\/fr-us\?_r=/.test(french.headers.get('location')!)).toBe(true)
    await seed([line(SUNNIES, 1)], { country: 'CA' })
    expect(/\/en-ca\?_r=/.test((await send('GET', '/p/tok/checkout')).headers.get('location')!)).toBe(true)
  })

  it('shows the notice page at Shopify\'s checkout address', async () => {
    const { send, seed } = harness()
    await seed([line(SUNNIES, 1)])
    const location = (await send('GET', '/checkout')).headers.get('location')!
    const notice = await send('GET', location)
    expect([notice.status, notice.text.includes('Available in your own store')]).toEqual([200, true])
  })

  it('redirects /account and every address under it to the customer authentication address, which shows the account notice', async () => {
    const { send } = harness()
    for (const url of ['/account', '/account/login', '/account/register', '/account/orders/1']) {
      const answer = await send('GET', url)
      expect([url, answer.status, answer.headers.get('location')]).toEqual([url, 302, '/customer_authentication/redirect?locale=en&region_country=US'])
    }
    const french = await send('GET', '/fr-ca/account')
    expect(french.headers.get('location')).toBe('/customer_authentication/redirect?locale=fr&region_country=US')
    const notice = await send('GET', '/customer_authentication/redirect?locale=en&region_country=US')
    expect([notice.status, notice.text.includes('Customer accounts work once this store is published on Shopify')]).toEqual([200, true])
  })

  it('loads the cart with the lines of a permalink, newest first, and goes to checkout (ajax-checkout-redirects)', async () => {
    const { send, seed } = harness()
    await seed([line(HOODIE, 5)])
    const answer = await send('GET', `/cart/${SUNNIES}:1,${BEANIE}:2`)
    expect(answer.status).toBe(302)
    expect(answer.headers.get('location')).toMatch(/^\/checkouts\/cn\/[^/]+\/en-us\?_r=AQAB[\w-]{48}&cart_link_id=[\w-]{8}$/)
    const cart = (await send('GET', '/cart.js')).json as any
    expect(cart.items.map((item: any) => [item.variant_id, item.quantity])).toEqual([[BEANIE, 2], [SUNNIES, 1]])
  })

  it('passes a discount to checkout, and with storefront=true goes to the cart page', async () => {
    const { send } = harness()
    const discounted = await send('GET', `/cart/${SUNNIES}:1?discount=WELCOME10`)
    expect(discounted.headers.get('location')).toMatch(/&cart_link_id=[\w-]{8}&discount=WELCOME10$/)
    const stored = await send('GET', `/cart/${SUNNIES}:1?storefront=true`)
    expect(stored.headers.get('location')).toMatch(/^\/cart\?cart_link_id=[\w-]{8}$/)
  })

  it('serves the wallets module for a language and the accelerated checkout stylesheet, and no other file of cdn/shopifycloud', async () => {
    const { send } = harness()
    const script = await send('GET', '/cdn/shopifycloud/portable-wallets/latest/portable-wallets.fr.js')
    expect([script.status, script.headers.get('content-type'), script.headers.get('cache-control')]).toEqual([200, 'text/javascript; charset=utf-8', 'public, max-age=604800'])
    expect(script.text).toContain('customElements.define(name')
    expect(script.text).toContain('"Acheter maintenant"')
    expect((await send('GET', '/cdn/shopifycloud/portable-wallets/latest/portable-wallets.xx.js')).text).toContain('"Buy it now"')
    const styles = await send('GET', '/cdn/shopifycloud/portable-wallets/latest/accelerated-checkout.css')
    expect([styles.status, styles.headers.get('content-type')]).toEqual([200, 'text/css; charset=utf-8'])
    expect((await send('GET', '/cdn/shopifycloud/other.js')).status).toBe(404)
  })

  it('links the wallets module under the base path in a page that has a dynamic checkout button', async () => {
    const { send } = harness({}, { visitor: 'test-visitor-key-0001', basePath: '/p/tok' })
    const page = await send('GET', '/p/tok/')
    expect(page.text).toContain('portable-wallets.en.js')
    expect(page.text).toContain('"/p/tok/cdn/shopifycloud/portable-wallets/latest/portable-wallets.en.js"')
  })

  it('answers the steps of the parity store\'s recording (ajax-checkout-redirects) with its statuses and addresses', async () => {
    const { send } = harness()
    const masked = (location: string | null) => location?.replace(/(\/checkouts\/cn\/)[^/?]+/, '$1<token>').replace(/([?&]_r=)[^&]+/, '$1<token>').replace(/([?&]cart_link_id=)[^&]+/, '$1<id>')
    const steps = loadFixture('ajax-checkout-redirects').steps
    for (const [i, step] of steps.entries()) {
      const answer = await send(step.method, step.url, step.form ? new URLSearchParams(step.form).toString() : step.json)
      // Shopify's accounts are its own site (the storefront redirects to its notice address instead), and its error page for a gone link is its own artwork
      const account = /\/account/.test(step.url) || step.url.startsWith('/customer_authentication')
      if (account) {
        expect([i, step.url, answer.status]).toEqual([i, step.url, step.url.startsWith('/customer_authentication') ? 200 : 302])
        continue
      }
      expect([i, step.url, answer.status, masked(answer.headers.get('location'))]).toEqual([i, step.url, step.status, masked(step.location)])
    }
  })
})
