import { createHash } from 'crypto'
import { runInNewContext } from 'vm'
import { storefrontSampleData as data } from '../../../src/shopify'
import type { StoreData } from '../../../src/shopify'
import { harness, harnessTheme, VISITOR } from './harness'

// the files `shopify_asset_url` is asked for by the gift card templates of the private theme, Horizon and Dawn; the parity store's themes load them from Shopify's `/cdn/shopifycloud/storefront/assets/…`, at addresses with a hash that cannot be known ahead of time
const PATHS = ['vendor/qrcode.js', 'gift-card/card.svg', 'gift-card/add-to-apple-wallet.svg']
// qrcode.min.js of github.com/davidshimjs/qrcodejs at commit 04f46c6a0708418cb7b96fc563eacae0fbf77674, as the repository holds it
const QRCODE_SHA256 = 'c541ef06327885a8415bca8df6071e14189b4855336def4f36db54bde8484f36'

describe('the files of Shopify\'s global assets', () => {
  it('serves vendor/qrcode.js as the MIT library Shopify\'s copy is, unmodified and with its notices', async () => {
    const { send } = harness()
    const answer = await send('GET', '/shopify-assets/vendor/qrcode.js')
    expect([answer.status, answer.headers.get('content-type'), answer.headers.get('x-content-type-options')]).toEqual([200, 'application/javascript; charset=utf-8', 'nosniff'])
    const notice = answer.text.slice(0, answer.text.indexOf('*/') + 2)
    expect(notice).toContain('MIT')
    expect(notice).toContain('Copyright (c) 2012 davidshimjs')
    expect(notice).toContain('Copyright (c) 2009 Kazuhiko Arase')
    expect(notice).toContain('github.com/davidshimjs/qrcodejs')
    expect(createHash('sha256').update(answer.text.slice(notice.length).replace(/^\n/, '')).digest('hex')).toBe(QRCODE_SHA256)
    // the API the themes call, `new QRCode(element, { text, width, height })`, draws the code on a canvas it adds to the element (a canvas stand-in that counts the squares drawn)
    let squares = 0
    const context = { fillRect: () => { squares++ }, strokeRect: () => undefined, clearRect: () => undefined }
    const node = (): any => ({ style: {}, children: [] as unknown[], appendChild (child: unknown) { this.children.push(child) }, getContext: () => context, toDataURL: () => 'data:image/png;base64,' })
    const element = node()
    const page: Record<string, unknown> = { navigator: { userAgent: 'jest' }, document: { documentElement: { tagName: 'HTML' }, createElement: node }, CanvasRenderingContext2D: function CanvasRenderingContext2D () { return undefined }, element }
    runInNewContext(`${answer.text}\nnew QRCode(element, { text: 'shopify-giftcard-v1-8QH2VN5DCT4YJ6LM', width: 72, height: 72 })`, page)
    expect([typeof (page.QRCode as any).CorrectLevel.H, typeof (page.QRCode as any).prototype.makeCode]).toEqual(['number', 'function'])
    expect(element.children.length).toBeGreaterThan(0)
    expect(squares).toBeGreaterThan(100)
  })

  it('serves gift-card/card.svg at the 570 by 380 ratio of the themes\' image, with no text and no Shopify artwork', async () => {
    const answer = await harness().send('GET', '/shopify-assets/gift-card/card.svg')
    expect([answer.status, answer.headers.get('content-type'), answer.headers.get('x-content-type-options')]).toEqual([200, 'image/svg+xml', 'nosniff'])
    expect(answer.text).toMatch(/^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
    expect(answer.text).toContain('viewBox="0 0 570 380"')
    expect(answer.text).not.toMatch(/<text|shopify/i)
    expect(answer.text.trim().endsWith('</svg>')).toBe(true)
  })

  it('serves gift-card/add-to-apple-wallet.svg as a 120 by 40 stand-in that reads "Add to Apple Wallet" in plain text', async () => {
    const answer = await harness().send('GET', '/shopify-assets/gift-card/add-to-apple-wallet.svg')
    expect([answer.status, answer.headers.get('content-type'), answer.headers.get('x-content-type-options')]).toEqual([200, 'image/svg+xml', 'nosniff'])
    expect(answer.text).toContain('width="120"')
    expect(answer.text).toContain('height="40"')
    expect(answer.text).toMatch(/<text[^>]*>Add to Apple Wallet<\/text>/)
    expect(answer.text.trim().endsWith('</svg>')).toBe(true)
  })

  it('caches each file with a validator, and answers a request that holds it with 304', async () => {
    const { send } = harness()
    for (const path of PATHS) {
      const first = await send('GET', `/shopify-assets/${path}`)
      const etag = first.headers.get('etag')
      expect([path, first.headers.get('cache-control'), etag]).toEqual([path, 'public, max-age=604800', expect.stringMatching(/^"[0-9a-f]+-\d+"$/)])
      expect(first.headers.get('content-length')).toBe(String(new TextEncoder().encode(first.text).length))
      const again = await send('GET', `/shopify-assets/${path}`, undefined, { 'if-none-match': etag as string })
      expect([path, again.status, again.text, again.headers.get('etag'), again.headers.get('cache-control')]).toEqual([path, 304, '', etag, 'public, max-age=604800'])
      expect((await send('GET', `/shopify-assets/${path}`, undefined, { 'if-none-match': `W/${etag}, "other"` })).status).toBe(304)
      expect((await send('GET', `/shopify-assets/${path}`, undefined, { 'if-none-match': '"other"' })).status).toBe(200)
    }
    const head = await send('HEAD', '/shopify-assets/gift-card/card.svg')
    expect([head.status, head.text, head.headers.get('etag')]).toEqual([200, '', expect.any(String)])
  })

  it('answers 404 for any other path, and for a method that is not a read', async () => {
    const { send } = harness()
    // a file has one address: the encoded, doubled and trailing-slash spellings (a backslash is read as a slash by `Request` before the storefront sees it; `routeRequest` refuses it when it is given the raw address) of it are not it, and the bare folder is no file
    const spellings = ['vendor%2Fqrcode.js', 'vendor%2fqrcode.js', '%76endor/qrcode.js', 'vendor//qrcode.js', '/vendor/qrcode.js', 'vendor/qrcode.js/', 'vendor/qrcode.js//', 'gift-card%2Fcard.svg']
    for (const path of ['', 'nope.js', 'vendor/qrcode.js/more', 'vendor/', 'gift-card/Card.svg', '__proto__', 'constructor', 'gift-card/card.svg%00', ...spellings]) {
      const answer = await send('GET', `/shopify-assets/${path}`)
      expect([path, answer.status, answer.headers.get('cache-control'), answer.text]).toEqual([path, 404, 'private, no-store', 'Not found'])
    }
    expect([(await send('GET', '/shopify-assets')).status, (await send('GET', '/shopify-assets')).text]).toEqual([404, 'Not found'])
    const post = await send('POST', '/shopify-assets/gift-card/card.svg', '')
    expect(post.status).toBe(404)
  })

  it('serves them under the base path and a locale prefix, which is where shopify_asset_url points', async () => {
    const theme = harnessTheme()
    theme.files['templates/gift_card.liquid'] = '{% layout none %}{{ "vendor/qrcode.js" | shopify_asset_url }}|{{ "gift-card/card.svg" | shopify_asset_url }}'
    const { send } = harness({ theme }, { visitor: VISITOR, basePath: '/p/tok' })
    const page = await send('GET', `/p/tok${data.gift_card?.url}`)
    expect([page.status, page.text]).toEqual([200, '/p/tok/shopify-assets/vendor/qrcode.js|/p/tok/shopify-assets/gift-card/card.svg'])
    expect((await send('GET', '/p/tok/shopify-assets/vendor/qrcode.js')).status).toBe(200)
    expect((await send('GET', '/p/tok/fr-ca/shopify-assets/gift-card/card.svg')).status).toBe(200)
    expect((await send('GET', '/shopify-assets/gift-card/card.svg')).status).toBe(404)
  })

  it('leaves a caller\'s own shopifyAssetUrl service in charge of the address', async () => {
    const theme = harnessTheme()
    theme.files['templates/gift_card.liquid'] = '{% layout none %}{{ "vendor/qrcode.js" | shopify_asset_url }}'
    const { send } = harness({ theme, services: { shopifyAssetUrl: path => `https://cdn.test/${path}` } })
    expect((await send('GET', data.gift_card?.url as string)).text).toBe('https://cdn.test/vendor/qrcode.js')
  })

  it('serves them to a visitor who has not passed the storefront password, and to a sandboxed page', async () => {
    const locked = { ...data, shop: { ...data.shop, password_enabled: true } } as StoreData
    const { send } = harness({ data: locked, password: 'open' })
    expect((await send('GET', '/')).status).toBe(302)
    for (const path of PATHS) expect([path, (await send('GET', `/shopify-assets/${path}`)).status]).toEqual([path, 200])
    const sandboxed = harness({ data: locked, password: 'open' }, { visitor: VISITOR, sandbox: true })
    const answer = await sandboxed.send('GET', '/shopify-assets/gift-card/card.svg')
    expect([answer.status, answer.headers.get('access-control-allow-origin'), answer.headers.get('cache-control')]).toEqual([200, '*', 'public, max-age=604800'])
  })
})
