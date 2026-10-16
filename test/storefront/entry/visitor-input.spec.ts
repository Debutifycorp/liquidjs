import { storefrontSampleData } from '../../../src/shopify'
import type { StoreData } from '../../../src/shopify'
import { createStorefront, DEFAULT_LIMITS, memoryCartStore } from '../../../src/storefront'
import type { StorefrontReport, VisitorState } from '../../../src/storefront'
import { redirect } from '../../../src/storefront/handler'
import type { Context } from '../../../src/storefront/handler'
import { cutSearch, routeRequest } from '../../../src/storefront/router'
import { emptyVisitor } from '../../../src/storefront/visitor'
import { harness, harnessTheme, VISITOR } from './harness'

// The visitor's input in one place (the final review A, `.superpowers/sdd/plan-storefront/final-review-a.md`): the addresses a visitor writes (I1, M3), the size of what a visitor can store (I2), search terms (M2), prefetches (M4), the sandbox header (M5), limits a host sets (M6) and a stored state that is not one (M7).

const data = storefrontSampleData as StoreData
const at = (basePath: string, localePrefix: string) => ({ basePath, routed: { localePrefix }, data }) as unknown as Context
const location = (response: Response) => response.headers.get('location')
const form = (fields: Record<string, string>) => new URLSearchParams(fields).toString()
const SUNNIES = 43696940613654
/** A variant the store sells past its stock, so a test can add it as often as it likes. */
const SNEAKERS = 43696963485718
const HOST = 'https://host.invalid'

/** Where a browser takes a `Location` header: the path from the host's root. */
const resolved = (header: string | null) => {
  const url = new URL(header ?? '', `${HOST}/p/tok/discount/x`)
  return { origin: url.origin, path: `${url.pathname}${url.search}${url.hash}`, pathname: url.pathname }
}
const insideStore = (header: string | null, base: string) => {
  const { origin, pathname } = resolved(header)
  return origin === HOST && (pathname === base || pathname.startsWith(`${base}/`))
}

/** What a visitor can write as a target: every form of "up and out" that the review names, and the ones around it. The answer is what a store of the base path `/p/tok` gives, or `undefined` for a target that is not a path on the store at all (the fallback). */
const DOT_TARGETS: Array<[string, string | undefined]> = [
  ['/../../client/dashboard', '/p/tok/client/dashboard'],
  ['/../tokB/cart', '/p/tok/tokB/cart'],
  ['/%2e%2e/%2e%2e/client/dashboard', '/p/tok/client/dashboard'],
  ['/%2E%2E/x', '/p/tok/x'],
  ['/./x', '/p/tok/x'],
  ['/a/../../x', '/p/tok/x'],
  ['/a/./b/../c', '/p/tok/a/c'],
  ['/.%2e/x', '/p/tok/x'],
  ['/%2e./x', '/p/tok/x'],
  ['/..', '/p/tok'],
  ['/.', '/p/tok'],
  ['/..?x=1', '/p/tok/?x=1'],
  ['/a/..#top', '/p/tok/#top'],
  // a backslash is a slash to the address parser
  ['/a\\..\\..\\x', '/p/tok/x'],
  ['/..\\..\\client', '/p/tok/client'],
  // an encoded slash or backslash hides a dot segment from the parser, and a server that decodes it would climb
  ['/..%2f..%2fclient', undefined],
  ['/..%2F..%2Fclient', undefined],
  ['/%2e%2e%2fclient', undefined],
  ['/a%2f..%2f..%2fx', undefined],
  ['/..%5c..%5cclient', undefined],
  ['/%2e%2e%5cclient', undefined],
  // dot segments that leave an empty segment first would read as a host
  ['/..//evil.com', undefined],
  ['/.//evil.com', undefined],
  ['/a/..//evil.com', undefined],
  ['/%2e%2e//evil.com', undefined]
]

describe('redirect targets with dot segments (final review A, I1)', () => {
  it('resolves a target from the store\'s root before the base path goes on, so no answer leaves the base path', () => {
    for (const [target, expected] of DOT_TARGETS) {
      const answer = location(redirect(at('/p/tok', ''), target))
      expect([target, answer]).toEqual([target, expected ?? '/p/tok'])
      expect([target, insideStore(answer, '/p/tok')]).toEqual([target, true])
    }
  })

  it('does the same with no base path: the answer is a path from the root and never a host', () => {
    for (const [target, expected] of DOT_TARGETS) {
      const answer = location(redirect(at('', ''), target))
      expect([target, answer]).toEqual([target, expected === undefined ? '/' : expected.replace(/^\/p\/tok/, '') || '/'])
      expect([target, resolved(answer).origin]).toEqual([target, HOST])
    }
  })

  it('does the same under a locale prefix', () => {
    expect(location(redirect(at('/p/tok', '/fr-ca'), '/../../client/dashboard'))).toBe('/p/tok/fr-ca/client/dashboard')
    expect(location(redirect(at('/p/tok', '/fr-ca'), '/%2e%2e/cart'))).toBe('/p/tok/fr-ca/cart')
    expect(location(redirect(at('/p/tok', '/fr-ca'), '/p/tok/fr-ca/../../../x'))).toBe('/p/tok/fr-ca/x')
  })

  it('keeps the query and the fragment, and leaves a plain path as it was', () => {
    expect(location(redirect(at('/p/tok', ''), '/a/../cart?x=1&y=../z#top'))).toBe('/p/tok/cart?x=1&y=../z#top')
    expect(location(redirect(at('/p/tok', ''), '/cart'))).toBe('/p/tok/cart')
    expect(location(redirect(at('/p/tok', ''), '/products/black-sunnies?variant=1'))).toBe('/p/tok/products/black-sunnies?variant=1')
  })

  describe('through the routes that take a target', () => {
    const base = { visitor: VISITOR, basePath: '/p/tok' }

    it('discount: ?redirect=', async () => {
      const { send } = harness({}, base)
      for (const [target, expected] of DOT_TARGETS) {
        const answer = await send('GET', `/p/tok/discount/SAVE?redirect=${encodeURIComponent(target)}`)
        expect([target, answer.headers.get('location')]).toEqual([target, expected ?? '/p/tok'])
      }
      // the same forms, written percent-encoded in the address as a link would carry them
      expect((await send('GET', '/p/tok/discount/SAVE?redirect=/%2e%2e/%2e%2e/client/dashboard')).headers.get('location')).toBe('/p/tok/client/dashboard')
      expect((await send('GET', '/p/tok/discount/SAVE?redirect=%2F..%2F..%2Fclient%2Fdashboard')).headers.get('location')).toBe('/p/tok/client/dashboard')
      // a literal `%2e%2e` in the target, the address-encoded twice
      expect((await send('GET', `/p/tok/discount/SAVE?redirect=${encodeURIComponent('/%2e%2e/%2e%2e/client/dashboard')}`)).headers.get('location')).toBe('/p/tok/client/dashboard')
    })

    it('the cart form: return_to in a form body and in a JSON body', async () => {
      const { send } = harness({}, base)
      for (const [target, expected] of DOT_TARGETS) {
        // `clear` changes the cart without a stock check, so the loop can run as long as the table
        const posted = await send('POST', '/p/tok/cart/clear', form({ return_to: target }))
        expect([target, posted.headers.get('location')]).toEqual([target, expected ?? '/p/tok/cart'])
        const json = await send('POST', '/p/tok/cart/clear', { return_to: target }, { accept: 'text/html' })
        expect([target, json.headers.get('location')]).toEqual([target, expected ?? '/p/tok/cart'])
      }
      const added = await send('POST', '/p/tok/cart/add', form({ id: String(SUNNIES), quantity: '1', return_to: '/../../client/dashboard' }))
      expect(added.headers.get('location')).toBe('/p/tok/client/dashboard')
    })

    it('the localization form: return_to', async () => {
      const { send } = harness({}, base)
      for (const [target, expected] of DOT_TARGETS) {
        const answer = await send('POST', '/p/tok/localization', form({ country_code: 'US', return_to: target }))
        expect([target, insideStore(answer.headers.get('location'), '/p/tok')]).toEqual([target, true])
        expect([target, answer.headers.get('location')]).toEqual([target, expected ?? '/p/tok'])
      }
    })

    it('return_to=back: the Referer and the page the client script names', async () => {
      const { send } = harness({}, base)
      const referred = await send('POST', '/p/tok/cart/add', form({ id: String(SUNNIES), return_to: 'back' }), { referer: 'https://host.invalid/p/tok/pages/../../../client/dashboard' })
      expect(insideStore(referred.headers.get('location'), '/p/tok')).toBe(true)
      const named = harness({}, { ...base, sandbox: true })
      for (const page of ['/p/tok/../../client/dashboard', '/p/tok/%2e%2e/%2e%2e/client/dashboard', '/p/tok/a/../../../x', '/p/tok/..%2f..%2fclient']) {
        const answer = await named.send('POST', `/p/tok/cart/add?storefront_page=${encodeURIComponent(page)}`, form({ id: String(SUNNIES), return_to: 'back' }), { origin: 'null' })
        expect([page, insideStore(answer.headers.get('location'), '/p/tok')]).toEqual([page, true])
      }
    })
  })

  describe('the bundled sections\' page: sections_url, X-Storefront-Page and the Referer', () => {
    const WHERE = '{{ request.path }}|{{ request.page_type }}'
    const themed = () => ({ files: { ...harnessTheme().files, 'sections/where.liquid': WHERE } })
    const wrapped = (html: unknown) => /^<div id="shopify-section-[^"]+" class="shopify-section[^"]*">([\s\S]*)<\/div>$/.exec(String(html))?.[1]
    const where = async (headers: Record<string, string>, body: Record<string, unknown> = {}) => {
      const { send } = harness({ theme: themed() }, { visitor: VISITOR, basePath: '/p/tok' })
      const answer = await send('POST', '/p/tok/cart/add.js', { items: [{ id: SUNNIES }], sections: 'where', ...body }, headers)
      return wrapped((answer.json as any).sections.where)
    }

    it('resolves dot segments before the base path is taken off, and passes over a path that hides one', async () => {
      // `/p/tok/../tok/products/given` is the store's own product page, `/p/tok/../../x` is outside the store: it is the store's `/x`
      expect(await where({}, { sections_url: '/p/tok/../tok/products/given' })).toBe('/p/tok/products/given|product')
      expect(await where({}, { sections_url: '/p/tok/%2e%2e/tok/products/given' })).toBe('/p/tok/products/given|product')
      expect(await where({ 'x-storefront-page': '/p/tok/./products/given' })).toBe('/p/tok/products/given|product')
      expect(await where({}, { sections_url: '/p/tok/../../client/dashboard' })).toBe('/p/tok/client/dashboard|404')
      expect(await where({ 'x-storefront-page': '/p/tok/../../client/dashboard' })).toBe('/p/tok/client/dashboard|404')
      // an encoded slash is passed over for the next candidate, then the home page
      expect(await where({}, { sections_url: '/p/tok/..%2f..%2fclient' })).toBe('/p/tok|index')
      expect(await where({ 'x-storefront-page': '/p/tok/..%2f..%2fclient', referer: 'https://host.invalid/p/tok/pages/header' }, { sections_url: '/..//evil.com' })).toBe('/p/tok/pages/header|page')
    })
  })
})

describe('a target under the base path or a locale prefix of its own (final review A, M3)', () => {
  it('puts the base path on once: a target that holds it is not given it again, however its segments are written', () => {
    expect(location(redirect(at('/p/tok', ''), '/p/tok/products/hoodie'))).toBe('/p/tok/products/hoodie')
    expect(location(redirect(at('/p/tok', '/en-ca'), '/p/tok/products/hoodie'))).toBe('/p/tok/en-ca/products/hoodie')
    expect(location(redirect(at('/p/tok', '/en-ca'), '/p/tok'))).toBe('/p/tok/en-ca')
    expect(location(redirect(at('/p/tok', '/en-ca'), '/p/tok?x=1'))).toBe('/p/tok/en-ca/?x=1')
    // the router compares decoded segments, so `%74` is `t`
    expect(location(redirect(at('/p/tok', ''), '/p/%74ok/cart'))).toBe('/p/tok/cart')
    expect(location(redirect(at('/p/tok', '/en-ca'), '/p/%74ok/cart'))).toBe('/p/tok/en-ca/cart')
    // `/p/token` is a page of the store, not under the base path
    expect(location(redirect(at('/p/tok', ''), '/p/token/cart'))).toBe('/p/tok/p/token/cart')
  })

  it('keeps the locale prefix a target names, and puts the request\'s on only when it names none', () => {
    expect(location(redirect(at('/p/tok', '/en-ca'), '/fr-ca/products/hoodie'))).toBe('/p/tok/fr-ca/products/hoodie')
    expect(location(redirect(at('/p/tok', '/en-ca'), '/p/tok/fr-ca/products/hoodie'))).toBe('/p/tok/fr-ca/products/hoodie')
    expect(location(redirect(at('/p/tok', '/en-ca'), '/p/tok/en-ca/products/hoodie'))).toBe('/p/tok/en-ca/products/hoodie')
    expect(location(redirect(at('', '/en-ca'), '/fr-ca'))).toBe('/fr-ca')
    expect(location(redirect(at('', '/en-ca'), '/fr-ca?x=1'))).toBe('/fr-ca?x=1')
    // a prefix is whole segments: `/fr-ca-sale` is a page of the store
    expect(location(redirect(at('', '/en-ca'), '/fr-ca-sale'))).toBe('/en-ca/fr-ca-sale')
    // with no prefix on the request, nothing is put on
    expect(location(redirect(at('/p/tok', ''), '/fr-ca/cart'))).toBe('/p/tok/fr-ca/cart')
  })

  it('answers the four shapes of the review through the cart form and the discount link', async () => {
    const { send } = harness({}, { visitor: VISITOR, basePath: '/p/tok' })
    const add = (returnTo: string, url = '/p/tok/en-ca/cart/add') => send('POST', url, form({ id: String(SUNNIES), return_to: returnTo }))
    expect((await add('/p/tok/products/hoodie')).headers.get('location')).toBe('/p/tok/en-ca/products/hoodie')
    expect((await add('/p/tok/en-ca/products/hoodie')).headers.get('location')).toBe('/p/tok/en-ca/products/hoodie')
    expect((await add('/p/tok/fr-ca/products/hoodie')).headers.get('location')).toBe('/p/tok/fr-ca/products/hoodie')
    expect((await add('/products/hoodie')).headers.get('location')).toBe('/p/tok/en-ca/products/hoodie')
    expect((await send('GET', '/p/tok/en-ca/discount/SAVE?redirect=/p/tok/cart')).headers.get('location')).toBe('/p/tok/en-ca/cart')
    expect((await send('GET', `/p/tok/en-ca/discount/SAVE?redirect=${encodeURIComponent('/p/%74ok/cart')}`)).headers.get('location')).toBe('/p/tok/en-ca/cart')
  })
})

describe('how much one visitor can store (final review A, I2)', () => {
  const limits = DEFAULT_LIMITS

  it('holds the cart note to noteLength characters and answers a longer one with a 422 in the cart error shape', async () => {
    expect(limits.noteLength).toBe(5000)
    const { send, store } = harness()
    const ok = await send('POST', '/cart/update.js', { note: 'n'.repeat(limits.noteLength) })
    expect(ok.status).toBe(200)
    const over = await send('POST', '/cart/update.js', { note: 'n'.repeat(limits.noteLength + 1) })
    expect(over.status).toBe(422)
    expect(over.json).toEqual({ status: 422, message: 'Cart Error', description: 'The cart note can be at most 5000 characters.' })
    // nothing changed
    expect((await store.get(VISITOR))?.cart.note).toHaveLength(limits.noteLength)
    // a form post gets the same status on its error page
    const page = await send('POST', '/cart', form({ note: 'n'.repeat(limits.noteLength + 1) }))
    expect(page.status).toBe(422)
  })

  it('holds an attribute\'s value to attributeLength characters', async () => {
    expect(limits.attributeLength).toBe(1000)
    const { send, store } = harness()
    const ok = await send('POST', '/cart/update.js', { attributes: { gift: 'g'.repeat(limits.attributeLength) } })
    expect(ok.status).toBe(200)
    const over = await send('POST', '/cart/update.js', { attributes: { gift: 'g'.repeat(limits.attributeLength + 1) } })
    expect(over.status).toBe(422)
    expect(over.json).toEqual({ status: 422, message: 'Cart Error', description: 'A cart attribute value can be at most 1000 characters.' })
    expect((await store.get(VISITOR))?.cart.attributes.gift).toHaveLength(limits.attributeLength)
    // a value that is removed is not measured
    expect((await send('POST', '/cart/update.js', { attributes: { gift: '' } })).status).toBe(200)
  })

  it('takes the limits from the caller', async () => {
    const { send } = harness({ limits: { noteLength: 10, attributeLength: 4 } })
    expect((await send('POST', '/cart/update.js', { note: '0123456789' })).status).toBe(200)
    expect((await send('POST', '/cart/update.js', { note: '0123456789a' })).status).toBe(422)
    expect((await send('POST', '/cart/update.js', { attributes: { a: '1234' } })).status).toBe(200)
    expect((await send('POST', '/cart/update.js', { attributes: { a: '12345' } })).status).toBe(422)
  })

  it('still holds a line property\'s value to propertyLength', async () => {
    const { send } = harness()
    const over = await send('POST', '/cart/add.js', { id: SUNNIES, quantity: 1, properties: { engraving: 'e'.repeat(limits.propertyLength + 1) } })
    expect(over.status).toBe(422)
  })

  it('bounds the worst case: the most one visitor can have stored under the default limits', async () => {
    // a cart full of lines with as many properties as they can hold, a note and attributes at their limits
    const properties = (n: number) => Object.fromEntries(Array.from({ length: limits.properties }, (_, i) => [`${'k'.repeat(limits.propertyLength - 4)}${String(n).padStart(2, '0')}${i.toString().padStart(2, '0')}`.slice(0, limits.propertyLength), 'v'.repeat(limits.propertyLength)]))
    const { send, store } = harness()
    for (let n = 0; n < limits.lines; n++) {
      const added = await send('POST', '/cart/add.js', { id: SNEAKERS, quantity: 1, properties: properties(n) })
      expect([n, added.status]).toEqual([n, 200])
    }
    await send('POST', '/cart/update.js', { note: 'n'.repeat(limits.noteLength), attributes: Object.fromEntries(Array.from({ length: limits.properties }, (_, i) => [`${'a'.repeat(limits.propertyLength - 2)}${i.toString().padStart(2, '0')}`, 'v'.repeat(limits.attributeLength)])), discount: Array.from({ length: limits.properties }, (_, i) => `${'c'.repeat(limits.propertyLength - 2)}${i.toString().padStart(2, '0')}`).join(',') })
    const stored = await store.get(VISITOR)
    const bytes = JSON.stringify(stored).length
    // the figure the README states: about 1.4 MB at most for one visitor
    expect(bytes).toBeGreaterThan(1_000_000)
    expect(bytes).toBeLessThan(1_500_000)
  })
})

describe('the default cart store has a byte budget (final review A, I2)', () => {
  const bulky = (key: string, size: number): VisitorState => ({ ...emptyVisitor(key), cart: { ...emptyVisitor(key).cart, note: 'n'.repeat(size) } })
  /** What the store counts for a state: two bytes for each character of its JSON. */
  const counted = (state: VisitorState) => JSON.stringify(state).length * 2

  it('evicts the least recently used visitors until the states are under the budget', async () => {
    // about 3,200 counted for each of these, so three fit in 10,000 and a fourth does not
    expect(counted(bulky('a', 1500))).toBeGreaterThan(3100)
    expect(counted(bulky('a', 1500))).toBeLessThan(3300)
    const store = memoryCartStore({ maxBytes: 10_000 })
    await store.set('a', bulky('a', 1500))
    await store.set('b', bulky('b', 1500))
    await store.set('c', bulky('c', 1500))
    expect(await store.get('a')).toBeDefined()
    await store.set('d', bulky('d', 1500))
    // `a` was used after `b` and `c`, so `b` goes first
    expect(await store.get('b')).toBeUndefined()
    await store.set('e', bulky('e', 1500))
    expect(await store.get('c')).toBeUndefined()
    expect(await store.get('a')).toBeDefined()
    expect(await store.get('d')).toBeDefined()
    expect(await store.get('e')).toBeDefined()
  })

  it('counts a state again when the same visitor is saved with a different size', async () => {
    const store = memoryCartStore({ maxBytes: 10_000 })
    await store.set('a', bulky('a', 1000))
    await store.set('b', bulky('b', 1000))
    for (let i = 0; i < 10; i++) await store.set('a', bulky('a', 1000))
    expect(await store.get('b')).toBeDefined()
    await store.set('a', bulky('a', 4000))
    expect(await store.get('b')).toBeUndefined()
    expect(await store.get('a')).toBeDefined()
  })

  it('keeps the states of many visitors under the budget however many arrive', async () => {
    const store = memoryCartStore({ maxBytes: 50_000, max: 1_000_000 })
    for (let i = 0; i < 500; i++) await store.set(`v${i}`, bulky(`v${i}`, 1000))
    let kept = 0
    for (let i = 0; i < 500; i++) if (await store.get(`v${i}`)) kept++
    // 500 states of about 2,200 counted would be 1.1 MB: the budget keeps about 22
    expect(kept).toBeGreaterThan(5)
    expect(kept).toBeLessThanOrEqual(24)
    expect(await store.get('v499')).toBeDefined()
  })

  it('does not keep a state that alone is over the budget, and does not evict the others for it', async () => {
    const store = memoryCartStore({ maxBytes: 10_000 })
    await store.set('a', bulky('a', 1000))
    await store.set('big', bulky('big', 20_000))
    expect(await store.get('big')).toBeUndefined()
    expect(await store.get('a')).toBeDefined()
    // and the visitor's earlier state goes: it is not kept beside a newer one that was refused
    await store.set('a', bulky('a', 20_000))
    expect(await store.get('a')).toBeUndefined()
  })

  it('has a default budget, 256 MiB, which the storefront takes from limits.storeBytes', async () => {
    expect(DEFAULT_LIMITS.storeBytes).toBe(256 * 1024 * 1024)
    expect(memoryCartStore()).toBeDefined()
    // room for two visitors with a note of 1,000 characters (about 2,500 counted each), not three
    const storefront = createStorefront({ theme: harnessTheme(), data, limits: { storeBytes: 6000 } })
    const as = (visitor: string, path: string, body?: unknown) => storefront.handle(new Request(`https://store.invalid${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }), { visitor })
    for (const visitor of ['budget-visitor-key-01', 'budget-visitor-key-02', 'budget-visitor-key-03']) expect((await as(visitor, '/cart/update.js', { note: 'n'.repeat(1000) })).status).toBe(200)
    const note = async (visitor: string) => ((await (await as(visitor, '/cart.js')).json()) as { note: string | null }).note
    expect(await note('budget-visitor-key-01')).toBeNull()
    expect(await note('budget-visitor-key-02')).toHaveLength(1000)
    expect(await note('budget-visitor-key-03')).toHaveLength(1000)
  })
})

describe('search terms, in every route (final review A, M2)', () => {
  const long = 'x'.repeat(DEFAULT_LIMITS.search + 100)
  const cut = 'x'.repeat(DEFAULT_LIMITS.search)

  it('cuts q to the limit and nothing else of the address', () => {
    const q = (url: string) => new URL(`https://store.invalid${cutSearch(url, 256)}`).searchParams
    expect(q(`/search?q=${long}&type=product`).get('q')).toHaveLength(256)
    expect(q(`/search?type=product&q=${long}`).get('type')).toBe('product')
    expect(cutSearch('/search?q=short', 256)).toBe('/search?q=short')
    expect(cutSearch('/search', 256)).toBe('/search')
    expect(cutSearch('/search?q=%C3%A9%C3%A9%C3%A9', 2)).toBe('/search?q=%C3%A9%C3%A9')
    expect(cutSearch(`https://store.invalid/p/tok/search?q=${long}#top`, 256)).toBe(`/p/tok/search?q=${cut}#top`)
  })

  it('reads the cut term on the routes that take one', () => {
    const terms = (path: string) => (routeRequest('GET', `https://store.invalid${path}`, data, { basePath: '', search: DEFAULT_LIMITS.search }).route as { page: { request: { searchTerms?: string } } }).page.request.searchTerms
    expect(terms(`/search?q=${long}`)).toBe(cut)
    expect(terms(`/collections/vendors?q=${long}`)).toBe(cut)
    expect(terms(`/collections/types?q=${long}`)).toBe(cut)
    expect(terms(`/search?q=${long}&section_id=terms`)).toBe(cut)
  })

  it('shows the cut term on /search and on a section of it, and the predictive terms are cut as before', async () => {
    const theme = { files: { ...harnessTheme().files, 'templates/search.json': '{"sections":{"main":{"type":"terms"}},"order":["main"]}', 'sections/terms.liquid': '[{{ search.terms }}]' } }
    const { send } = harness({ theme })
    for (const url of [`/search?q=${long}`, `/search?q=${long}&section_id=terms`]) {
      const page = await send('GET', url)
      expect([url, page.text.includes(`[${cut}]`), page.text.includes('x'.repeat(257))]).toEqual([url, true, false])
    }
    expect((await send('GET', `/collections/vendors?q=${long}`)).status).toBe(200)
    expect((await send('GET', `/search/suggest.json?q=${long}`)).status).toBe(200)
  })
})

describe('a prefetch changes nothing (final review A, M4)', () => {
  const prefetches: Array<Record<string, string>> = [{ 'sec-purpose': 'prefetch' }, { 'sec-purpose': 'prefetch;prerender' }, { purpose: 'prefetch' }, { 'x-moz': 'prefetch' }, { 'sec-purpose': 'Prefetch' }]

  it('answers a GET that names a prefetch like a HEAD for state: the redirect, with nothing saved and no cookie', async () => {
    for (const headers of prefetches) {
      const { send, store } = harness()
      const link = await send('GET', '/discount/WELCOME10?redirect=/cart', undefined, headers)
      expect([headers, link.status, link.headers.get('location')]).toEqual([headers, 302, '/cart'])
      expect(await store.get(VISITOR)).toBeUndefined()
      const real = harness()
      await real.seed([{ variantId: SUNNIES, quantity: 1, properties: {}, sellingPlanId: null }])
      const removed = await real.send('GET', '/cart/change?line=1&quantity=0', undefined, headers)
      expect([headers, removed.status]).toEqual([headers, 302])
      expect((await real.store.get(VISITOR))?.cart.lines).toHaveLength(1)
    }
  })

  it('sets no cookie in cookie mode, and still answers the page with its body', async () => {
    const storefront = createStorefront({ theme: harnessTheme(), data })
    const link = await storefront.handle(new Request('https://store.invalid/discount/WELCOME10', { headers: { 'sec-purpose': 'prefetch' } }))
    expect([link.status, link.headers.get('set-cookie')]).toEqual([302, null])
    const page = await storefront.handle(new Request('https://store.invalid/', { headers: { 'sec-purpose': 'prefetch' } }))
    expect(page.status).toBe(200)
    expect((await page.text()).length).toBeGreaterThan(0)
    // an ordinary request still changes the cart and sets the cookie
    const real = await storefront.handle(new Request('https://store.invalid/discount/WELCOME10'))
    expect(real.headers.get('set-cookie')).toMatch(/^cart=/)
  })

  it('is no reason to ignore a POST, which a prefetch never is', async () => {
    const { send, store } = harness()
    const added = await send('POST', '/cart/add.js', { id: SUNNIES, quantity: 1 }, { 'sec-purpose': 'prefetch' })
    expect(added.status).toBe(200)
    expect((await store.get(VISITOR))?.cart.lines).toHaveLength(1)
  })
})

describe('the sandbox header (final review A, M5)', () => {
  const sandbox = { visitor: 'preview-token-0000000001', basePath: '/p/tok', sandbox: true }

  it('puts Content-Security-Policy: sandbox allow-scripts allow-forms on every sandboxed answer that has none', async () => {
    const { send } = harness({}, sandbox)
    const policy = 'sandbox allow-scripts allow-forms'
    for (const [method, url] of [['GET', '/p/tok'], ['GET', '/p/tok/cart.js'], ['GET', '/p/tok/discount/X'], ['POST', '/p/tok/cart/add.js'], ['GET', '/p/tok/products/nope'], ['GET', '/p/tok/checkout']]) {
      const answer = await send(method, url, method === 'POST' ? { id: SUNNIES } : undefined)
      expect([url, answer.headers.get('content-security-policy')]).toEqual([url, policy])
    }
  })

  it('leaves a policy the answer has, and adds none outside the sandbox', async () => {
    const { send } = harness({ notice: () => new Response('mine', { headers: { 'content-security-policy': 'sandbox allow-scripts' } }) }, sandbox)
    expect((await send('GET', '/p/tok/checkout')).headers.get('content-security-policy')).toBe('sandbox allow-scripts')
    const plain = harness()
    expect((await plain.send('GET', '/')).headers.get('content-security-policy')).toBeNull()
  })
})

describe('limits are checked where the host sets them (final review A, M6)', () => {
  const make = (limits: Record<string, unknown>) => () => createStorefront({ theme: harnessTheme(), data, limits: limits as any })

  it('refuses NaN, a negative number, a fraction, infinity and anything that is not a number', () => {
    for (const bad of [NaN, -1, 1.5, Infinity, -Infinity, '10', null, {}, true]) {
      expect(make({ body: bad })).toThrow(TypeError)
      expect(make({ body: bad })).toThrow(/limits\.body/)
    }
    for (const name of Object.keys(DEFAULT_LIMITS)) expect(make({ [name]: NaN })).toThrow(new RegExp(`limits\\.${name}`))
  })

  it('takes a whole number from zero up, and a limit given as undefined keeps its default', async () => {
    for (const ok of [0, 1, 100, Number.MAX_SAFE_INTEGER]) expect(make({ sections: ok })).not.toThrow()
    expect(make({ body: undefined })).not.toThrow()
    expect(make({})).not.toThrow()
    const { send } = harness({ limits: { body: undefined } })
    expect((await send('POST', '/cart/add.js', { id: SUNNIES })).status).toBe(200)
  })

  it('checks the options of the memory store too', () => {
    expect(() => memoryCartStore({ max: NaN })).toThrow(/max/)
    expect(() => memoryCartStore({ maxBytes: -1 })).toThrow(/maxBytes/)
    expect(() => memoryCartStore({ idleMs: 1.5 })).toThrow(/idleMs/)
    expect(() => memoryCartStore({ max: 0, maxBytes: 0, idleMs: 0 })).not.toThrow()
  })
})

describe('a stored state that is not one (final review A, M7)', () => {
  const broken = (key: string): Array<[string, unknown]> => [
    ['no cart', { country: 'CA' }],
    ['cart is null', { cart: null, country: 'CA' }],
    ['no lines', { cart: { token: key, note: null, attributes: {}, discountCodes: [] }, country: 'CA' }],
    ['lines is an object', { cart: { token: key, lines: {}, note: null, attributes: {}, discountCodes: [] }, country: 'CA' }],
    ['a line is a number', { cart: { token: key, lines: [7], note: null, attributes: {}, discountCodes: [] }, country: 'CA' }],
    ['a line has no quantity', { cart: { token: key, lines: [{ variantId: SUNNIES, properties: {} }], note: null, attributes: {}, discountCodes: [] }, country: 'CA' }],
    ['attributes is a string', { cart: { token: key, lines: [], note: null, attributes: 'x', discountCodes: [] }, country: 'CA' }],
    ['discountCodes is missing', { cart: { token: key, lines: [], note: null, attributes: {} }, country: 'CA' }],
    ['the note is a number', { cart: { token: key, lines: [], note: 3, attributes: {}, discountCodes: [] }, country: 'CA' }]
  ]

  it('starts from an empty visitor, keeps the country, language and unlocked flag that are valid, and reports it', async () => {
    for (const [what, state] of broken('mv-key-0000000000001')) {
      const reports: StorefrontReport[] = []
      const store = memoryCartStore()
      const real = store.get.bind(store)
      store.get = async key => key === 'mv-key-0000000000001' ? { ...(state as object), language: 'fr', unlocked: true } as VisitorState : real(key)
      const { send } = harness({ cartStore: store, onReport: report => { reports.push(report) } }, { visitor: 'mv-key-0000000000001' })
      const page = await send('GET', '/')
      expect([what, page.status]).toEqual([what, 200])
      const cart = await send('GET', '/cart.js')
      expect([what, cart.status, (cart.json as any)?.item_count]).toEqual([what, 200, 0])
      const added = await send('POST', '/cart/add.js', { id: SUNNIES, quantity: 1 })
      expect([what, added.status]).toEqual([what, 200])
      const errors = reports.filter(entry => entry.kind === 'error')
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].kind === 'error' && errors[0].error.message).toMatch(/visitor state/)
      // the visitor's key is a credential and is not in the report
      expect(errors.every(entry => entry.kind === 'error' && !entry.error.message.includes('mv-key-0000000000001'))).toBe(true)
    }
  })

  it('saves the repaired state with the valid parts of the stored one', async () => {
    const store = memoryCartStore()
    const key = 'mv-key-0000000000002'
    const real = store.get.bind(store)
    let served = false
    store.get = async k => {
      if (k === key && !served) { served = true; return { country: 'CA', language: 'fr', unlocked: true } as unknown as VisitorState }
      return real(k)
    }
    const { send } = harness({ cartStore: store }, { visitor: key })
    await send('POST', '/cart/add.js', { id: SUNNIES, quantity: 1 })
    const saved = await real(key)
    expect(saved).toMatchObject({ country: 'CA', language: 'fr', unlocked: true })
    expect(saved?.cart.lines).toHaveLength(1)
  })

  it('drops a country, language or flag of the wrong type', async () => {
    const key = 'mv-key-0000000000003'
    const store = memoryCartStore()
    const real = store.get.bind(store)
    let served = false
    store.get = async k => {
      if (k === key && !served) { served = true; return { country: 7, language: {}, unlocked: 'yes' } as unknown as VisitorState }
      return real(k)
    }
    const { send } = harness({ cartStore: store }, { visitor: key })
    await send('POST', '/cart/add.js', { id: SUNNIES, quantity: 1 })
    const saved = await real(key)
    expect(saved?.country).toBeUndefined()
    expect(saved?.language).toBeUndefined()
    expect(saved?.unlocked).toBeUndefined()
  })

  it('leaves a state that is right alone, and reports nothing', async () => {
    const reports: StorefrontReport[] = []
    const { send, seed } = harness({ onReport: report => { reports.push(report) } })
    await seed([{ variantId: SUNNIES, quantity: 2, properties: { a: 'b' }, sellingPlanId: null }], { country: 'CA' })
    expect(((await send('GET', '/cart.js')).json as any).item_count).toBe(2)
    expect(reports.filter(entry => entry.kind === 'error')).toEqual([])
  })
})
