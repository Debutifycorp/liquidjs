import { storefrontSampleData as data } from '../../../src/shopify'
import { loadFixture } from '../fixtures'
import { harness, line } from './harness'

const wrapper = (id: string, inner: string) => `<div id="shopify-section-${id}" class="shopify-section">${inner}</div>`

describe('pages', () => {
  it('renders a page for its request, with the visitor\'s cart', async () => {
    const { send, seed } = harness()
    const product = await send('GET', '/products/hoodie?view=probe&variant=43695846653974')
    expect(product.status).toBe(200)
    expect(product.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(product.headers.get('cache-control')).toBe('private, no-store')
    expect((product.json as any).selected_variant).toBe(43695846653974)
    // the routes that change a cart come with the Ajax unit (Task 5); the page only reads the state the store holds
    expect((await send('GET', '/cart?view=probe')).json).toMatchObject({ item_count: 0 })
    await seed([line(43695847538710, 2)])
    expect((await send('GET', '/cart?view=probe')).json).toMatchObject({ item_count: 2 })
  })

  it('answers ?section_id= and ?sections= on any page', async () => {
    const { send, seed } = harness()
    await seed([line(43696940613654, 3)])
    const one = await send('GET', '/collections/tops?section_id=cart-count')
    expect(one.status).toBe(200)
    expect(one.text).toBe(wrapper('cart-count', '3'))
    const many = await send('GET', '/?sections=cart-count,missing')
    expect(many.json).toEqual({ 'cart-count': wrapper('cart-count', '3'), missing: null })
    // an id such as `__proto__` is a key like any other
    expect(Object.keys((await send('GET', '/?sections=__proto__,cart-count')).json as object)).toEqual(['__proto__', 'cart-count'])
    const sixth = await send('GET', '/?sections=a,b,c,d,e,f')
    expect([sixth.status, sixth.text, sixth.headers.get('cache-control')]).toEqual([loadFixture('ajax-sections-page').steps[2].status, '', 'private, no-store'])
    const absent = await send('GET', '/?section_id=missing')
    expect([absent.status, absent.text, absent.headers.get('cache-control')]).toEqual([loadFixture('ajax-sections-page').steps[3].status, '', 'private, no-store'])
    expect([one.headers.get('cache-control'), many.headers.get('cache-control'), many.headers.get('content-type')]).toEqual(['private, no-store', 'private, no-store', 'application/json; charset=utf-8'])
  })

  it('answers the section calls the parity store recorded (fixture ajax-sections-page)', async () => {
    const { send } = harness()
    const inner = (html: string | null) => html === null ? null : JSON.parse(html.replace(/^<div[^>]*>/, '').replace(/<\/div>\s*$/, ''))
    const [single, several] = loadFixture('ajax-sections-page').steps
    const one = await send('GET', single.url)
    expect([one.status, inner(one.text)]).toEqual([single.status, single.body])
    const many = await send('GET', several.url)
    const sections: Record<string, unknown> = {}
    for (const [id, html] of Object.entries(many.json as Record<string, string | null>)) sections[id] = inner(html)
    expect([many.status, sections]).toEqual([several.status, several.body])
  })

  it('answers 404 with the theme\'s 404 template for unknown pages and resources', async () => {
    const { send } = harness()
    for (const url of ['/nope', '/products/nope', '/pages/does-not-exist', '/collections/nope', '/blogs/news/nope', '/policies/refund-policy']) {
      const answer = await send('GET', url)
      expect([url, answer.status, answer.text.includes('<h1>Not found</h1>')]).toEqual([url, 404, true])
    }
  })

  it('shows the 404 template at /404, whatever address was asked for, with the status 404', async () => {
    // recording `page-not-found` (`/pages/does-not-exist`, status 404): the canonical link, `og:url` and the localization form's `return_to` all name `/404`
    const { harnessTheme } = await import('./harness')
    const theme = harnessTheme()
    theme.files['templates/404.liquid'] = '{{ canonical_url }}|{{ request.path }}|{{ request.page_type }}|{{ template.name }}'
    const { send } = harness({ theme })
    const body = (text: string) => text.split('<body>')[1]?.split('</body>')[0]
    for (const url of ['/nope', '/pages/does-not-exist', '/products/nope?variant=1', '/collections/nope/products/hoodie', '/404']) {
      const answer = await send('GET', url)
      expect([url, answer.status, body(answer.text)]).toEqual([url, 404, 'https://store.invalid/404|/404|404|404'])
    }
    // the shopper's language stays: the 404 of the French Canada store is at its own /404
    const french = await send('GET', '/fr-ca/does-not-exist')
    expect([french.status, body(french.text)]).toEqual([404, 'https://store.invalid/fr-ca/404|/fr-ca/404|404|404'])
  })

  it('answers 404 for a section of a page that does not exist, and for a product under a collection that does not', async () => {
    const { send } = harness()
    for (const url of ['/products/nope?section_id=cart-count', '/products/nope?sections=cart-count', '/collections/nope/products/hoodie', '/collections/tops/products/nope']) {
      const answer = await send('GET', url)
      expect([url, answer.status, answer.text.includes('<h1>Not found</h1>')]).toEqual([url, 404, true])
    }
    expect((await send('GET', '/collections/tops/products/hoodie')).status).toBe(200)
  })

  it('reads the collection of a product link as the collection page reads it: all, vendors, types and the data\'s collections', async () => {
    const { send } = harness()
    for (const collection of ['all', 'vendors', 'types', 'tops']) {
      const page = await send('GET', `/collections/${collection}`)
      const product = await send('GET', `/collections/${collection}/products/hoodie`)
      expect([collection, page.status, product.status, product.text.includes('<h1>Not found</h1>')]).toEqual([collection, 200, 200, false])
    }
    const section = await send('GET', '/collections/all/products/hoodie?section_id=cart-count')
    expect([section.status, section.text]).toEqual([200, wrapper('cart-count', '0')])
    // a collection that exists nowhere, or a product that does not, is still a 404
    for (const url of ['/collections/nowhere', '/collections/nowhere/products/hoodie', '/collections/all/products/nope', '/collections/vendors/products/nope']) {
      const answer = await send('GET', url)
      expect([url, answer.status, answer.text.includes('<h1>Not found</h1>')]).toEqual([url, 404, true])
    }
  })

  it('answers a render that throws with a plain 500 page and reports the error', async () => {
    const reports: unknown[] = []
    const { send } = harness({ data: () => { throw new Error('boom at /src/x.ts:12') }, onReport: report => reports.push(report) })
    const answer = await send('GET', '/')
    expect(answer.status).toBe(500)
    expect(answer.text).toContain('This page could not be shown.')
    expect(answer.text).not.toContain('boom')
    expect(answer.text).not.toContain('x.ts')
    expect(answer.headers.get('cache-control')).toBe('private, no-store')
    expect(reports).toEqual([expect.objectContaining({ kind: 'error' })])
  })

  it('reports the render of every page and section it shows', async () => {
    const reports: any[] = []
    const { send } = harness({ onReport: report => reports.push(report) })
    await send('GET', '/')
    await send('GET', '/?section_id=cart-count')
    await send('GET', '/?sections=cart-count,missing')
    expect(reports.map(report => report.kind)).toEqual(['render', 'render', 'render', 'render'])
    expect(reports[0].report).toHaveProperty('sections')
  })

  it('keeps a reporter that throws, or rejects, from failing the page', async () => {
    const calls: string[] = []
    const { send } = harness({ onReport: report => { calls.push(report.kind); throw new Error('reporter down') } })
    expect((await send('GET', '/')).status).toBe(200)
    const rejecting = harness({ data: () => { throw new Error('boom') }, onReport: (() => Promise.reject(new Error('reporter down'))) as () => void })
    const answer = await rejecting.send('GET', '/')
    expect(answer.status).toBe(500)
    // a rejection nobody holds would end the process: give it a turn to surface
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(calls).toEqual(['render'])
  })

  it('answers a page with no 404 template in the theme with a plain 404 and reports the error', async () => {
    const reports: any[] = []
    const { harnessTheme } = await import('./harness')
    const theme = harnessTheme()
    delete theme.files['templates/404.liquid']
    const { send } = harness({ theme, onReport: report => reports.push(report) })
    const answer = await send('GET', '/nope')
    expect([answer.status, answer.text.includes('Page not found'), answer.headers.get('cache-control')]).toEqual([404, true, 'private, no-store'])
    expect(answer.text).not.toContain('template not found')
    expect(reports.map(report => report.kind)).toEqual(['error'])
    expect((await send('GET', '/')).status).toBe(200)
  })

  it('answers a HEAD request with the headers of the GET and no body', async () => {
    const { send } = harness()
    const head = await send('HEAD', '/')
    const get = await send('GET', '/')
    expect([head.status, head.text, head.headers.get('content-type')]).toEqual([200, '', get.headers.get('content-type')])
    expect((await send('HEAD', '/nope')).status).toBe(404)
  })

  it('sends a locked store to /password until the password is given', async () => {
    const locked = { ...data, shop: { ...data.shop, password_enabled: true } }
    const { send } = harness({ data: locked, password: 'open' })
    expect((await send('GET', '/products/hoodie')).status).toBe(302)
    expect((await send('GET', '/password')).status).toBe(200)
    const wrong = await send('POST', '/password', 'form_type=storefront_password&password=no')
    expect(wrong.text).toContain('wrong')
    const right = await send('POST', '/password', 'form_type=storefront_password&password=open')
    expect([right.status, right.headers.get('location')]).toEqual([302, '/'])
    expect((await send('GET', '/products/hoodie')).status).toBe(200)
  })
})
