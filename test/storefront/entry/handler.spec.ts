import { resolveView, storefrontSampleData as data } from '../../../src/shopify'
import type { StoreData } from '../../../src/shopify'
import { buildStore } from '../../../src/shopify/store/build'
import { redirect, ROUTE_HANDLERS } from '../../../src/storefront/handler'
import type { Context, RouteHandler } from '../../../src/storefront/handler'
import { harness, VISITOR } from './harness'

const locked = { ...data, shop: { ...data.shop, password_enabled: true } }
const at = (basePath: string, localePrefix: string) => ({ basePath, routed: { localePrefix }, data }) as unknown as Context
const location = (response: Response) => response.headers.get('location')
const slow = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const BASE = { visitor: VISITOR, basePath: '/p/tok/' }

/** The promise's value, or 'blocked' when it has not settled within `ms`; the timer does not outlive the call. */
async function within<T> (promise: Promise<T>, ms: number): Promise<T | 'blocked'> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([promise, new Promise<'blocked'>(resolve => { timer = setTimeout(() => resolve('blocked'), ms) })])
  } finally {
    clearTimeout(timer)
  }
}

/** Registers handlers for the routes of later tasks for one test. */
function register (handlers: Partial<typeof ROUTE_HANDLERS>): void {
  Object.assign(ROUTE_HANDLERS, handlers)
}

const originals = { ...ROUTE_HANDLERS }
afterEach(() => {
  for (const kind of Object.keys(ROUTE_HANDLERS)) delete (ROUTE_HANDLERS as Record<string, unknown>)[kind]
  Object.assign(ROUTE_HANDLERS, originals)
})

describe('redirect', () => {
  it('goes to a path on the store, under the base path and the locale prefix', () => {
    const plain = redirect(at('', ''), '/cart?step=1#top')
    expect([plain.status, location(plain), plain.headers.get('cache-control')]).toEqual([302, '/cart?step=1#top', 'private, no-store'])
    expect(location(redirect(at('/p/tok', '/fr-ca'), '/cart'))).toBe('/p/tok/fr-ca/cart')
    expect(location(redirect(at('/p/tok', '/fr-ca'), '/'))).toBe('/p/tok/fr-ca')
    expect(location(redirect(at('/p/tok', ''), '/'))).toBe('/p/tok')
    // a path that already starts with the prefix keeps it once
    expect(location(redirect(at('/p/tok', '/fr-ca'), '/p/tok/fr-ca/cart'))).toBe('/p/tok/fr-ca/cart')
    expect(location(redirect(at('/p/tok', '/fr-ca'), '/p/tok/fr-ca?x=1'))).toBe('/p/tok/fr-ca?x=1')
    // a prefix is whole segments: `/fr-ca-sale` is a page of the store, not under `/fr-ca`
    expect(location(redirect(at('', '/fr-ca'), '/fr-ca-sale'))).toBe('/fr-ca/fr-ca-sale')
  })

  it('falls back for anything that is not a path on the store: a host, a backslash, a control character', () => {
    const hostile = ['//evil.com', '///evil.com', '/\\evil.com', '/\t/evil.com', '/\n/evil.com', '/\r\n/evil.com', '/\u0000', '/a\u001fb', '/\u007f', 'https://evil.com', 'javascript:alert(1)', 'evil.com', '', '  /cart', null, undefined]
    for (const target of hostile) {
      expect([target, location(redirect(at('', ''), target))]).toEqual([target, '/'])
      expect([target, location(redirect(at('', ''), target, '/cart'))]).toEqual([target, '/cart'])
    }
  })

  it('writes a Location that is always a valid header: non-ASCII text is percent-encoded', () => {
    expect(location(redirect(at('', ''), '/café/日本?q=ü'))).toBe('/caf%C3%A9/%E6%97%A5%E6%9C%AC?q=%C3%BC')
    expect(location(redirect(at('', ''), '/a b'))).toBe('/a%20b')
    expect(location(redirect(at('', ''), '/\ud800x'))).toBe('/%EF%BF%BDx')
    expect(location(redirect(at('', ''), '/%41'))).toBe('/%41')
    expect(location(redirect(at('', ''), '/😀'))).toBe('/%F0%9F%98%80')
  })
})

describe('the handler and the routes of other units', () => {
  it('rejects ?redirect=/%09/evil.com, //evil.com and a backslash, and follows a path on the store', async () => {
    const { send } = harness()
    register({ discount: async ctx => ({ response: redirect(ctx, ctx.routed.query.get('redirect')), state: ctx.visitor }) })
    const to = async (target: string) => (await send('GET', `/discount/SAVE?redirect=${target}`)).headers.get('location')
    expect(await to('/%09/evil.com')).toBe('/')
    expect(await to('/%0d%0a/evil.com')).toBe('/')
    expect(await to('//evil.com')).toBe('/')
    expect(await to('/%5Cevil.com')).toBe('/')
    expect(await to('https://evil.com')).toBe('/')
    expect(await to('/cart')).toBe('/cart')
  })

  it('runs a route that changes visitor state one at a time per visitor', async () => {
    const { send, store } = harness()
    const count: RouteHandler = async ctx => {
      const seen = Number(ctx.visitor.cart.note ?? 0)
      await slow(5)
      return { response: new Response('ok'), state: { ...ctx.visitor, cart: { ...ctx.visitor.cart, note: String(seen + 1) } } }
    }
    register({ contact: count })
    const answers = await Promise.all([1, 2, 3, 4, 5].map(() => send('POST', '/contact', 'a=1')))
    expect(answers.map(answer => answer.status)).toEqual([200, 200, 200, 200, 200])
    expect((await store.get(VISITOR))?.cart.note).toBe('5')
  })

  it('does not let a HEAD request change visitor state, on the link-style routes that GET changes', async () => {
    const { send, store } = harness()
    const add: RouteHandler = async ctx => ({ response: redirect(ctx, '/cart'), state: { ...ctx.visitor, cart: { ...ctx.visitor.cart, discountCodes: [...ctx.visitor.cart.discountCodes, ctx.routed.route.kind] } } })
    register({ discount: add, cart: add })
    const head = await send('HEAD', '/discount/SAVE')
    expect([head.status, head.headers.get('location'), head.text]).toEqual([302, '/cart', ''])
    expect((await send('HEAD', '/cart/change?id=1:abc&quantity=0')).status).toBe(302)
    expect(await store.get(VISITOR)).toBeUndefined()
    await send('GET', '/discount/SAVE')
    expect((await store.get(VISITOR))?.cart.discountCodes).toEqual(['discount'])
    await send('GET', '/cart/change?id=1:abc&quantity=0')
    expect((await store.get(VISITOR))?.cart.discountCodes).toEqual(['discount', 'cart'])
    await send('HEAD', '/discount/SAVE')
    expect((await store.get(VISITOR))?.cart.discountCodes).toEqual(['discount', 'cart'])
  })

  it('sets no cookie for a HEAD request that would have changed the visitor', async () => {
    const { storefront } = harness({}, {})
    register({ discount: async ctx => ({ response: redirect(ctx, '/'), state: ctx.visitor }) })
    expect((await storefront.handle(new Request('https://store.invalid/discount/SAVE', { method: 'HEAD' }))).headers.get('set-cookie')).toBeNull()
    expect((await storefront.handle(new Request('https://store.invalid/discount/SAVE'))).headers.get('set-cookie')).toMatch(/^cart=[0-9a-f]{32}; Path=\/; HttpOnly; SameSite=Lax$/)
  })

  it('reads a body before the visitor\'s turn, so a stalled upload does not hold their lock', async () => {
    const { storefront, send } = harness({ data: locked, password: 'open' })
    let upload!: ReadableStreamDefaultController<Uint8Array>
    const stalled = new Request('https://store.invalid/password', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new ReadableStream<Uint8Array>({ start (controller) { upload = controller } }),
      duplex: 'half'
    } as RequestInit)
    const first = storefront.handle(stalled, { visitor: VISITOR })
    const second = await within(send('POST', '/password', 'password=open'), 1000)
    expect(second).not.toBe('blocked')
    expect((second as Awaited<ReturnType<typeof send>>).status).toBe(302)
    upload.enqueue(new TextEncoder().encode('password=no'))
    upload.close()
    expect((await first).status).toBe(200)
  })

  it('hands a route its body as fields, and nothing for a route that has none', async () => {
    const { send } = harness()
    const seen: unknown[] = []
    register({ contact: async ctx => { seen.push(ctx.fields); return { response: new Response('ok') } }, discount: async ctx => { seen.push(ctx.fields); return { response: new Response('ok') } } })
    await send('POST', '/contact', 'contact[email]=a%40b.c&contact[body]=hi')
    await send('POST', '/contact', { contact: { email: 'x@y.z' } })
    await send('GET', '/discount/SAVE?contact[email]=nope')
    expect(seen).toEqual([{ contact: { email: 'a@b.c', body: 'hi' } }, { contact: { email: 'x@y.z' } }, {}])
  })
})

describe('request bodies', () => {
  it('answers a body over the limit with 413 and one that cannot be read with 400, in JSON', async () => {
    const { send } = harness()
    const big = await send('POST', '/password', `password=${'x'.repeat(70000)}`)
    expect([big.status, big.headers.get('cache-control'), big.headers.get('content-type')]).toEqual([413, 'private, no-store', 'application/json'])
    expect(big.json).toEqual({ status: 413, message: 'Payload Too Large', description: 'The request body is too large.' })
    const bad = await send('POST', '/password', '{"password":', { 'content-type': 'application/json' })
    expect([bad.status, bad.json]).toEqual([400, { status: 400, message: 'Bad Request', description: 'The request body is not valid JSON.' }])
    expect(bad.text).not.toMatch(/at |\.ts/)
  })

  it('keeps the default for a limit given as undefined, and takes the others as given', async () => {
    const body = `password=${'x'.repeat(70000)}`
    expect((await harness({ limits: { body: undefined } }).send('POST', '/password', body)).status).toBe(413)
    expect((await harness({ limits: { body: undefined } }).send('POST', '/password', 'password=a')).status).toBe(200)
    expect((await harness({ limits: { body: 8 } }).send('POST', '/password', 'password=abc')).status).toBe(413)
    expect((await harness({ limits: { sections: undefined } }).send('GET', '/?sections=a,b,c,d,e')).status).toBe(200)
    expect((await harness({ limits: { sections: undefined } }).send('GET', '/?sections=a,b,c,d,e,f')).status).toBe(400)
    expect((await harness({ limits: { sections: 2 } }).send('GET', '/?sections=a,b,c')).status).toBe(400)
    expect((await harness({ limits: { sections: 2 } }).send('GET', '/?sections=a,b')).status).toBe(200)
  })

  it('shows the theme\'s 404 page for a route that nobody answers', async () => {
    const { send } = harness()
    delete ROUTE_HANDLERS.password
    const answer = await send('POST', '/password', 'password=open')
    expect([answer.status, answer.text.includes('<h1>Not found</h1>')]).toEqual([404, true])
    // in the language of the address it was asked under
    const french = await send('POST', '/fr-ca/password', 'password=open')
    expect([french.status, french.text.includes('<h1>Not found</h1>'), french.text.includes('Shopify.locale = "fr"')]).toEqual([404, true, true])
  })

  it('does not read a body for a route that has none', async () => {
    const { send } = harness()
    expect((await send('POST', '/nope', 'x'.repeat(70000))).status).toBe(404)
  })
})

describe('visitors', () => {
  it('sets the cart cookie when a route first saves state, and reads it back', async () => {
    const { storefront } = harness({ data: locked, password: 'open' }, {})
    const post = (password: string, cookie?: string) => storefront.handle(new Request('https://store.invalid/password', { method: 'POST', body: `password=${password}`, headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) } }))
    const get = (cookie?: string) => storefront.handle(new Request('https://store.invalid/products/hoodie', { headers: cookie ? { cookie } : {} }))
    const wrong = await post('no')
    expect(wrong.headers.get('set-cookie')).toBeNull()
    const right = await post('open')
    const cookie = /^(cart=[0-9a-f]{32});/.exec(right.headers.get('set-cookie') ?? '')?.[1]
    expect(cookie).toBeDefined()
    expect(right.headers.get('set-cookie')).toMatch(/; Path=\/; HttpOnly; SameSite=Lax$/)
    expect((await get()).status).toBe(302)
    expect((await get(cookie)).status).toBe(200)
    // the cookie already names the visitor: it is not set again
    expect((await post('open', cookie)).headers.get('set-cookie')).toBeNull()
    expect((await get('cart=0123456789abcdef0123')).status).toBe(302)
  })

  it('sets the cookie under the base path and reads no cookie when it is given the visitor', async () => {
    const { storefront } = harness({ data: locked, password: 'open' })
    const right = await storefront.handle(new Request('https://store.invalid/p/tok/password', { method: 'POST', body: 'password=open', headers: { 'content-type': 'application/x-www-form-urlencoded' } }), { basePath: '/p/tok/' })
    expect([right.status, location(right)]).toEqual([302, '/p/tok'])
    expect(right.headers.get('set-cookie')).toMatch(/^cart=[0-9a-f]{32}; Path=\/p\/tok; HttpOnly; SameSite=Lax$/)
    const keyed = harness({ data: locked, password: 'open' })
    const done = await keyed.send('POST', '/password', 'password=open', { cookie: 'cart=0123456789abcdef0123' })
    expect(done.headers.get('set-cookie')).toBeNull()
    expect((await keyed.send('GET', '/products/hoodie', undefined, { cookie: 'cart=aaaaaaaaaaaaaaaaaaaa' })).status).toBe(200)
  })

  it('needs a visitor key for a sandboxed page', async () => {
    const { storefront } = harness()
    await expect(storefront.handle(new Request('https://store.invalid/'), { sandbox: true })).rejects.toThrow(TypeError)
    expect((await storefront.handle(new Request('https://store.invalid/'), { sandbox: true, visitor: VISITOR })).status).toBe(200)
  })
})

describe('the password lock', () => {
  it('sends every route of a locked store to the password page, under the base path and locale prefix', async () => {
    const { storefront } = harness({ data: locked, password: 'open' })
    const ask = async (method: string, url: string) => location(await storefront.handle(new Request(`https://store.invalid${url}`, { method, ...(method === 'POST' ? { body: 'a=1', headers: { 'content-type': 'application/x-www-form-urlencoded' } } : {}) }), BASE))
    expect(await ask('GET', '/p/tok/products/hoodie')).toBe('/p/tok/password')
    expect(await ask('GET', '/p/tok/en-ca/products/hoodie')).toBe('/p/tok/en-ca/password')
    expect(await ask('GET', '/p/tok/cart.js')).toBe('/p/tok/password')
    expect(await ask('POST', '/p/tok/cart/add.js')).toBe('/p/tok/password')
    expect(await ask('GET', '/p/tok/checkout')).toBe('/p/tok/password')
    expect(await ask('GET', '/p/tok/nope')).toBe('/p/tok/password')
  })

  it('keeps the password page open as a page, and closes it when it is asked for a section', async () => {
    const { send } = harness({ data: locked, password: 'open' })
    // an empty `section_id` asks for no section
    for (const url of ['/password', '/password/', '/password?view=x', '/password?x=1', '/password?section_id=', '/password?sections=']) {
      const page = await send('GET', url)
      expect([url, page.status]).toEqual([url, 200])
    }
    // a section of the theme would show the store's products, collections and pages to a visitor who has not given the password
    for (const url of ['/password?section_id=cart-count', '/password/?section_id=cart-count', '/password?sections=cart-count', '/password?sections=cart-count,missing', '/password?section_id=missing']) {
      const answer = await send('GET', url)
      expect([url, answer.status, answer.headers.get('location'), answer.text]).toEqual([url, 302, '/password', ''])
    }
    expect((await send('GET', '/products/hoodie?section_id=cart-count')).status).toBe(302)
    expect((await send('POST', '/password', 'password=open')).status).toBe(302)
    // unlocked, it is a page like any other
    const section = await send('GET', '/password?section_id=cart-count')
    expect([section.status, section.text]).toEqual([200, '<div id="shopify-section-cart-count" class="shopify-section">0</div>'])
    expect((await send('GET', '/password?sections=cart-count')).status).toBe(200)
  })

  it('renders the wrong-password page in the visitor\'s language, whatever the form sends', async () => {
    const { send } = harness({ data: locked, password: 'open' })
    const wrong = await send('POST', '/fr-ca/password', 'password=a-much-longer-wrong-password')
    expect([wrong.status, wrong.text.includes('wrong'), wrong.text.includes('Shopify.locale = "fr"')]).toEqual([200, true, true])
    expect((await send('POST', '/password', { password: ['open'] })).text).toContain('wrong')
    expect((await send('POST', '/password', { password: { toString: 'open' } })).text).toContain('wrong')
    expect((await send('POST', '/password', '')).text).toContain('wrong')
    const none = harness({ data: locked })
    expect((await none.send('POST', '/password', 'password=')).text).toContain('wrong')
  })
})

describe('the notice page', () => {
  it('answers checkout and the account pages with status 200 and a link back', async () => {
    const { send } = harness()
    for (const [method, url] of [['GET', '/checkout'], ['POST', '/checkout'], ['GET', '/checkouts/cn/abc'], ['GET', '/account/login'], ['POST', '/account/login'], ['GET', '/account']]) {
      const answer = await send(method, url)
      expect([url, answer.status, answer.text.includes('Available in your own store'), answer.headers.get('cache-control')]).toEqual([url, 200, true, 'private, no-store'])
      expect(answer.text).toContain('<a href="/">')
    }
    expect((await send('GET', '/checkout')).text).not.toContain('<script')
  })

  it('links back to the page the visitor came from, only when that is a path on a store', async () => {
    const { send } = harness()
    const back = async (referer: string) => /<a href="([^"]*)">Back to the store/.exec((await send('GET', '/checkout', undefined, { referer })).text)?.[1]
    expect(await back('https://store.invalid/products/hoodie?variant=1')).toBe('/products/hoodie')
    expect(await back('https://elsewhere.example/products/hoodie')).toBe('/products/hoodie')
    expect(await back('https://store.invalid//evil.com/x')).toBe('/')
    expect(await back('https://store.invalid/%5Cevil.com')).toBe('/%5Cevil.com')
    expect(await back('javascript:alert(1)')).toBe('/')
    expect(await back('not a url')).toBe('/')
    expect(await back('https://store.invalid/\'onmouseover=\'x')).toBe('/&#39;onmouseover=&#39;x')
    const markup = (await send('GET', '/checkout', undefined, { referer: 'https://store.invalid/"><img src=x onerror=y>' })).text
    expect(markup).not.toContain('<img')
  })

  it('links back to the store\'s root under its base path and locale prefix when there is no referer', async () => {
    const { storefront } = harness()
    const answer = await storefront.handle(new Request('https://store.invalid/p/tok/en-ca/checkout'), BASE)
    expect(await answer.text()).toContain('<a href="/p/tok/en-ca">')
  })

  it('is replaced by the notice option, whatever headers the replacement has', async () => {
    const seen: string[] = []
    const { send } = harness({ notice: kind => { seen.push(kind); return new Response(`custom ${kind}`, { status: 200 }) } })
    expect((await send('GET', '/checkout')).text).toBe('custom checkout')
    const account = await send('GET', '/account/login')
    expect([account.text, account.headers.get('cache-control')]).toEqual(['custom account', 'private, no-store'])
    expect(seen).toEqual(['checkout', 'account'])
    const frozen = harness({ notice: () => Response.redirect('https://elsewhere.example/', 302) })
    const redirected = await frozen.send('GET', '/checkout')
    expect([redirected.status, redirected.headers.get('location'), redirected.headers.get('cache-control')]).toEqual([302, 'https://elsewhere.example/', 'private, no-store'])
    const failing = harness({ notice: () => { throw new Error('boom') } })
    expect((await failing.send('GET', '/checkout')).status).toBe(500)
  })
})

describe('viewCacheSize (final review B, I2)', () => {
  it('bounds the views kept for the data it serves, from the first answer on, whatever the route', async () => {
    const own = { ...data } as StoreData
    const { storefront } = harness({ data: own, viewCacheSize: 2 })
    const get = (base: string, path: string) => storefront.handle(new Request(`https://store.invalid${base}${path}`), { visitor: VISITOR, basePath: base }).then(response => response.text())
    const view = (base: string) => resolveView(own, { basePath: base })
    // the first answers are Ajax answers, so the limit does not wait for a page
    await get('/p/a', '/cart.js')
    const a = buildStore(own, view('/p/a'))
    await get('/p/b', '/cart.js')
    await get('/p/c', '/')
    expect(buildStore(own, view('/p/a'))).not.toBe(a)
    const c = buildStore(own, view('/p/c'))
    await get('/p/d', '/cart.js')
    expect(buildStore(own, view('/p/c'))).toBe(c)
  })
})
