import { cartErrorPage, errorPage, noticePage, notFoundPage } from '../../../src/storefront/html'

describe('the plain pages', () => {
  it('load no theme file, show no detail, and are never cached', async () => {
    for (const [name, response] of [['notice', noticePage('checkout', '/')], ['error', errorPage()], ['not found', notFoundPage('/')], ['cart error', cartErrorPage(422, 'All 1 sold out.', '/cart')]] as const) {
      const text = await response.text()
      expect([name, response.headers.get('cache-control'), response.headers.get('content-type')]).toEqual([name, 'private, no-store', 'text/html; charset=utf-8'])
      expect([name, /<link|<script/.test(text)]).toEqual([name, false])
    }
    expect([noticePage('checkout', '/').status, noticePage('account', '/').status, errorPage().status, notFoundPage('/').status, cartErrorPage(422, 'x', '/').status]).toEqual([200, 200, 500, 404, 422])
  })

  it('names what is not available, and escapes the link back and the description', async () => {
    expect(await noticePage('checkout', '/').text()).toContain('Checkout work once this store is published on Shopify.')
    expect(await noticePage('account', '/').text()).toContain('Customer accounts work once this store is published on Shopify.')
    expect(await noticePage('account', '/a"><script>x</script>').text()).toContain('<a href="/a&#34;&#62;&#60;script&#62;x&#60;/script&#62;">Back to the store</a>')
    const error = await cartErrorPage(422, '<img src=x>', '/cart?a=1&b=2').text()
    expect(error).toContain('<p>&#60;img src=x&#62;</p>')
    expect(error).toContain('<a href="/cart?a=1&#38;b=2">Back</a>')
  })
})
