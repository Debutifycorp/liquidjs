import { createHash } from 'crypto'
import { lineKey, storefrontSampleData } from '../../../src/shopify'
import type { StoreData } from '../../../src/shopify'
import { harness, harnessTheme, line, VISITOR } from './harness'

const data = storefrontSampleData as StoreData
const HOODIE = 43695847538710
const SUNNIES = 43696940613654
const SLIDES = 43695710371862

/** A theme whose `where` section prints the page it was rendered for and the market it was rendered in. */
const WHERE = '{{ request.path }}|{{ request.page_type }}|{{ localization.country.iso_code }}|{{ cart.currency.iso_code }}'
const themed = () => ({ files: { ...harnessTheme().files, 'sections/where.liquid': WHERE } })
const wrapped = (html: unknown) => /^<div id="shopify-section-[^"]+" class="shopify-section[^"]*">([\s\S]*)<\/div>$/.exec(String(html))?.[1]

type Answer = Awaited<ReturnType<ReturnType<typeof harness>['send']>>
const items = (answer: Answer) => (answer.json as { items: Array<Record<string, any>> }).items

describe('the cart answers', () => {
  it('answers add.js with one id as the line itself, and the sections beside it', async () => {
    const { send } = harness()
    const added = await send('POST', '/cart/add.js', { id: SUNNIES, quantity: 2, sections: 'cart-count' })
    expect(added.status).toBe(200)
    expect(added.json).toMatchObject({ id: SUNNIES, variant_id: SUNNIES, quantity: 2, title: 'Black Sunnies' })
    expect((added.json as any).items).toBeUndefined()
    expect(wrapped((added.json as any).sections['cart-count'])).toBe('2')
  })

  it('reads a form body as the theme\'s add-to-cart form posts it', async () => {
    const { send } = harness()
    const added = await send('POST', '/cart/add.js', `id=${SUNNIES}&quantity=1&properties%5BEngraving%5D=Hi&sections=cart-count&form_type=product&utf8=%E2%9C%93`)
    expect(added.json).toMatchObject({ variant_id: SUNNIES, quantity: 1, properties: { Engraving: 'Hi' }, sections: { 'cart-count': expect.any(String) } })
  })

  it('lists what an add reached in the order of the request, a line once however many items reached it', async () => {
    const { send } = harness()
    const added = await send('POST', '/cart/add.js', { items: [{ id: SUNNIES, quantity: 1 }, { id: HOODIE, quantity: 1 }, { id: SUNNIES, quantity: 2 }] })
    expect(items(added).map(item => [item.variant_id, item.quantity])).toEqual([[SUNNIES, 3], [HOODIE, 1]])
  })

  it('makes no change, and answers the error, when an add fails', async () => {
    const { send, store } = harness()
    await send('POST', '/cart/add.js', { items: [{ id: SUNNIES, quantity: 1 }] })
    const refused = await send('POST', '/cart/add.js', { items: [{ id: HOODIE, quantity: 1 }, { id: 1, quantity: 1 }], sections: 'cart-count' })
    expect([refused.status, refused.json]).toEqual([422, { status: 422, message: 'Cart Error', description: 'Cannot find variant' }])
    expect((await store.get(VISITOR))?.cart.lines.map(l => l.variantId)).toEqual([SUNNIES])
  })

  it('answers a body that is not JSON or a form with a 400, and one that is too big with a 413', async () => {
    const { send } = harness({ limits: { body: 64 } })
    expect((await send('POST', '/cart/add.js', '{"items": [', { 'content-type': 'application/json' })).status).toBe(400)
    expect((await send('POST', '/cart/add.js', `id=${SUNNIES}&note=${'x'.repeat(100)}`)).status).toBe(413)
  })

  it('lists on change.js the line that grew, with its difference, a fresh id and the price as a string', async () => {
    const { send, seed } = harness()
    await seed([line(SUNNIES, 1)])
    const key = lineKey(line(SUNNIES, 1))
    const changed = await send('POST', '/cart/change.js', { id: key, quantity: 4 })
    const [entry] = (changed.json as any).items_added
    expect((changed.json as any).items_added).toHaveLength(1)
    expect((changed.json as any).items_removed).toEqual([])
    expect(entry).toMatchObject({ variant_id: SUNNIES, quantity: 3, price: '50.00', presentment_price: 50, title: 'Black Sunnies', product_title: 'Black Sunnies', variant_title: null, view_key: key, url: '/products/black-sunnies?variant=43696940613654' })
    expect(entry.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(Object.keys(entry)).toEqual(['product_id', 'variant_id', 'id', 'image', 'price', 'presentment_price', 'quantity', 'title', 'product_title', 'variant_title', 'vendor', 'product_type', 'sku', 'url', 'untranslated_product_title', 'untranslated_variant_title', 'view_key'])
  })

  it('names a variant\'s title in both its titles, and gives the line of a selling plan the address of its variant', async () => {
    const { send, seed } = harness({ data: { ...data, discounts: [] } })
    await seed([{ variantId: SLIDES, quantity: 1, properties: {}, sellingPlanId: 71001 }])
    const changed = await send('POST', '/cart/change.js', { line: 1, quantity: 2 })
    expect((changed.json as any).items_added[0]).toMatchObject({ title: 'Slides - Small', product_title: 'Slides - Small', untranslated_product_title: 'Slides - Small', variant_title: 'Small', untranslated_variant_title: 'Small', url: '/products/slides?variant=43695710371862' })
  })

  it('lists on change.js the line that shrank in items_removed, and the line that went from the old cart', async () => {
    const { send, seed } = harness()
    await seed([line(SUNNIES, 4)])
    const fewer = await send('POST', '/cart/change.js', { line: 1, quantity: 1 })
    expect((fewer.json as any).items_added).toEqual([])
    expect((fewer.json as any).items_removed).toMatchObject([{ variant_id: SUNNIES, quantity: 3 }])
    const gone = await send('POST', '/cart/change.js', { line: 1, quantity: 0 })
    expect((gone.json as any).items).toEqual([])
    expect((gone.json as any).items_removed).toMatchObject([{ variant_id: SUNNIES, quantity: 1, title: 'Black Sunnies', view_key: lineKey(line(SUNNIES, 1)) }])
  })

  it('lists on update.js the variants that grew, once each, and nothing for a cart that only shrank', async () => {
    const { send, seed } = harness()
    await seed([line(SUNNIES, 1), { ...line(HOODIE, 1), properties: { a: 'b' } }, line(HOODIE, 2)])
    const grew = await send('POST', '/cart/update.js', { updates: [3, 2, 2] })
    expect((grew.json as any).items_changelog).toEqual({ added: [{ variant_id: SUNNIES, quantity: 2 }, { variant_id: HOODIE, quantity: 1 }] })
    const shrank = await send('POST', '/cart/update.js', { updates: [1, 1, 1] })
    expect((shrank.json as any).items_changelog).toEqual({ added: [] })
    expect(Object.keys(shrank.json as object).slice(-2)).toEqual(['discount_codes', 'items_changelog'])
  })

  it('answers clear.js with the empty cart, and keeps the sections after it', async () => {
    const { send, seed } = harness()
    await seed([line(SUNNIES, 2)])
    const cleared = await send('POST', '/cart/clear.js', { sections: ['cart-count'] })
    expect(cleared.json).toMatchObject({ item_count: 0, items: [], sections: { 'cart-count': expect.stringContaining('>0<') } })
  })

  it('prints a cart answer\'s lines in the change form, and /cart.js in its own', async () => {
    const { send, seed } = harness()
    await seed([line(SUNNIES, 1)])
    const changed = await send('POST', '/cart/change.js', { line: 1, quantity: 2 })
    const cart = await send('GET', '/cart.js')
    expect(Object.keys(items(changed)[0])).toContain('untranslated_product_title')
    expect(Object.keys(items(changed)[0])).not.toContain('quantity_rule')
    expect(Object.keys(items(cart)[0])).toContain('quantity_rule')
    expect(Object.keys(items(cart)[0])).not.toContain('untranslated_product_title')
  })

  it('prints the amount a line was allocated, not the application\'s total, in a line\'s application in a change answer', async () => {
    const { send, seed } = harness()
    // fixture `ajax-discount-codes`, step 5: BUNDLE gives the sunnies free for two tops, and the tops (2 of them) are allocated 0
    const TOPS = 43696932126742
    await seed([line(SUNNIES, 1), line(TOPS, 2)], { cart: { token: VISITOR, lines: [], note: null, attributes: {}, discountCodes: ['BUNDLE'] } })
    const answer = await send('POST', '/cart/update.js', { note: 'x' })
    const allocations = items(answer).flatMap(item => item.line_level_discount_allocations as Array<{ amount: number, discount_application: { total_allocated_amount: number } }>)
    expect(allocations.map(allocation => [allocation.amount, allocation.discount_application.total_allocated_amount])).toEqual([[5000, 5000], [0, 0]])
  })

  it('runs the changes of one visitor one after the other', async () => {
    const { send, store } = harness()
    const answers = await Promise.all([1, 2, 3, 4, 5, 6].map(() => send('POST', '/cart/add.js', { items: [{ id: SUNNIES, quantity: 1 }] })))
    expect(answers.map(answer => answer.status)).toEqual([200, 200, 200, 200, 200, 200])
    expect((await store.get(VISITOR))?.cart.lines).toMatchObject([{ variantId: SUNNIES, quantity: 6 }])
  })
})

describe('the bundled sections', () => {
  const where = async (headers: Record<string, string>, body: Record<string, unknown> = {}, url = '/cart/add.js', options: Parameters<typeof harness>[1] = undefined) => {
    const { send } = harness({ theme: themed() }, options)
    const answer = await send('POST', url, { items: [{ id: SUNNIES }], sections: 'where', ...body }, headers)
    return wrapped((answer.json as any).sections.where)
  }

  it('takes a comma-separated string or an array, drops blanks and repeats, and null for a section the theme lacks', async () => {
    const { send } = harness()
    const asString = await send('POST', '/cart/add.js', { items: [{ id: SUNNIES }], sections: ' cart-count, ,nope,cart-count' })
    const asArray = await send('POST', '/cart/add.js', { items: [{ id: SUNNIES }], sections: ['cart-count', '', 7, 'nope', 'cart-count'] })
    for (const answer of [asString, asArray]) expect(Object.keys((answer.json as any).sections)).toEqual(['cart-count', 'nope'])
    expect((asString.json as any).sections.nope).toBeNull()
    expect(wrapped((asString.json as any).sections['cart-count'])).toBe('1')
  })

  it('answers null for more sections than the limit, and still makes the change', async () => {
    const { send } = harness()
    const many = await send('POST', '/cart/add.js', { items: [{ id: SUNNIES }], sections: 'a,b,c,d,e,f' })
    expect([many.status, (many.json as any).sections]).toEqual([200, null])
    expect(((await send('GET', '/cart.js')).json as any).item_count).toBe(1)
    const five = await send('POST', '/cart/add.js', { items: [{ id: SUNNIES }], sections: 'a,b,c,d,e' })
    expect(Object.keys((five.json as any).sections)).toHaveLength(5)
    // the limit is the option's
    const fewer = harness({ limits: { sections: 1 } })
    expect(((await fewer.send('POST', '/cart/add.js', { items: [{ id: SUNNIES }], sections: 'a,b' })).json as any).sections).toBeNull()
  })

  it('reads a very long list of sections without rendering any of it', async () => {
    const { send } = harness()
    const ids = Array.from({ length: 4000 }, (_, i) => `s${i}`)
    const answer = await send('POST', '/cart/add.js', { items: [{ id: SUNNIES }], sections: ids })
    expect([answer.status, (answer.json as any).sections]).toEqual([200, null])
    const joined = await send('POST', '/cart/add.js', { items: [{ id: SUNNIES }], sections: ids.join(',') })
    expect((joined.json as any).sections).toBeNull()
  })

  it('keeps a section named like a prototype key as a key of its own', async () => {
    const { send } = harness()
    const answer = await send('POST', '/cart/add.js', '{"items":[{"id":43696940613654}],"sections":["__proto__","constructor","toString"]}', { 'content-type': 'application/json' })
    const sections = (answer.json as any).sections
    expect(Object.keys(sections)).toEqual(['__proto__', 'constructor', 'toString'])
    expect(Object.getPrototypeOf(sections)).toBe(Object.prototype)
    expect(({} as any).polluted).toBeUndefined()
    expect(sections.constructor).toBeNull()
  })

  it('does not let a body name a prototype key of the request', async () => {
    const { send } = harness()
    const answer = await send('POST', '/cart/add.js', '{"__proto__":{"items":[{"id":1}]},"constructor":{"prototype":{"x":1}},"items":[{"id":43696940613654}]}', { 'content-type': 'application/json' })
    expect([answer.status, items(answer).map(item => item.variant_id)]).toEqual([200, [SUNNIES]])
    expect(({} as any).x).toBeUndefined()
  })

  it('renders them in the page sections_url names, then X-Storefront-Page, then the Referer, then the home page', async () => {
    const all = { 'x-storefront-page': '/pages/header', referer: 'https://store.invalid/products/referred?x=1' }
    expect(await where(all, { sections_url: '/products/given' })).toBe('/products/given|product|US|USD')
    expect(await where(all)).toBe('/pages/header|page|US|USD')
    expect(await where({ referer: all.referer })).toBe('/products/referred|product|US|USD')
    expect(await where({})).toBe('/|index|US|USD')
  })

  it('passes over a sections_url, header or referer that is not a path on the store', async () => {
    for (const bad of ['//evil.com/products/x', '/\\evil.com', 'https://evil.com/products/x', 'products/x', '/\t/evil.com']) {
      expect([bad, await where({}, { sections_url: bad })]).toEqual([bad, '/|index|US|USD'])
      expect([bad, await where({ 'x-storefront-page': bad })]).toEqual([bad, '/|index|US|USD'])
    }
    expect(await where({ referer: 'https://store.invalid//evil.com' })).toBe('/|index|US|USD')
    expect(await where({ referer: 'not an address' })).toBe('/|index|US|USD')
    // a bad address is passed over for the next one
    expect(await where({ 'x-storefront-page': '/pages/header' }, { sections_url: '//evil.com' })).toBe('/pages/header|page|US|USD')
    expect(await where({}, { sections_url: 42 })).toBe('/|index|US|USD')
  })

  it('reads the Referer under the base path, and passes over a page outside it', async () => {
    const options = { visitor: VISITOR, basePath: '/p/tok' }
    const at = (referer: string) => where({ referer }, {}, '/p/tok/cart/add.js', options)
    expect(await at('https://store.invalid/p/tok/products/referred?x=1')).toBe('/p/tok/products/referred|product|US|USD')
    expect(await at('https://store.invalid/other/products/referred')).toBe('/p/tok|index|US|USD')
    expect(await at('https://store.invalid/p/token/products/referred')).toBe('/p/tok|index|US|USD')
    expect(await at('https://store.invalid/p/tok//evil.com')).toBe('/p/tok|index|US|USD')
  })

  it('takes the base path off the page, as a whole segment', async () => {
    const options = { visitor: VISITOR, basePath: '/p/tok' }
    expect(await where({}, { sections_url: '/p/tok/products/given' }, '/p/tok/cart/add.js', options)).toBe('/p/tok/products/given|product|US|USD')
    expect(await where({}, { sections_url: '/p/tok' }, '/p/tok/cart/add.js', options)).toBe('/p/tok|index|US|USD')
    expect(await where({}, { sections_url: '/p/tok#top' }, '/p/tok/cart/add.js', options)).toBe('/p/tok|index|US|USD')
    expect(await where({}, { sections_url: '/products/given' }, '/p/tok/cart/add.js', options)).toBe('/p/tok/products/given|product|US|USD')
    // `/p/token` is a page of the store, not under the base path `/p/tok`
    expect(await where({}, { sections_url: '/p/token/x' }, '/p/tok/cart/add.js', options)).toBe('/p/tok/p/token/x|404|US|USD')
  })

  it('renders them in the market of the request when the page names none', async () => {
    expect(await where({}, {}, '/en-ca/cart/add.js')).toBe('/en-ca|index|CA|CAD')
    expect(await where({}, { sections_url: '/products/given' }, '/en-ca/cart/add.js')).toBe('/en-ca/products/given|product|CA|CAD')
    expect(await where({}, { sections_url: '/en-ca/products/given' }, '/en-ca/cart/add.js')).toBe('/en-ca/products/given|product|CA|CAD')
    expect(await where({}, { sections_url: '/en-eu/products/given' }, '/en-ca/cart/add.js')).toBe('/en-eu/products/given|product|DE|EUR')
  })

  it('renders them with the cart as the change left it', async () => {
    const { send, seed } = harness({ theme: { files: { ...harnessTheme().files, 'sections/lines.liquid': '{% for item in cart.items %}{{ item.quantity }}x{{ item.variant.id }};{% endfor %}' } } })
    await seed([line(SUNNIES, 1)])
    const answer = await send('POST', '/cart/update.js', { updates: { [HOODIE]: 2 }, sections: 'lines' })
    expect(wrapped((answer.json as any).sections.lines)).toBe(`2x${HOODIE};1x${SUNNIES};`)
  })
})

describe('GET /discount/<code>', () => {
  it('applies a code on GET and not on HEAD, then redirects to the page the link names', async () => {
    const { send, store } = harness()
    const head = await send('HEAD', '/discount/WELCOME10?redirect=/cart')
    expect([head.status, head.headers.get('location')]).toEqual([302, '/cart'])
    expect(await store.get(VISITOR)).toBeUndefined()
    const get = await send('GET', '/discount/WELCOME10?redirect=/cart')
    expect([get.status, get.headers.get('location'), get.headers.get('cache-control')]).toEqual([302, '/cart', 'private, no-store'])
    expect((await store.get(VISITOR))?.cart.discountCodes).toEqual(['WELCOME10'])
  })

  it('redirects home without a redirect, and under the base path and the locale prefix', async () => {
    const { send } = harness({}, { visitor: VISITOR, basePath: '/p/tok' })
    expect((await send('GET', '/p/tok/discount/SAVE')).headers.get('location')).toBe('/p/tok')
    expect((await send('GET', '/p/tok/en-ca/discount/SAVE?redirect=/cart')).headers.get('location')).toBe('/p/tok/en-ca/cart')
    expect((await send('GET', '/p/tok/en-ca/discount/SAVE?redirect=/products/x%3Fvariant%3D1')).headers.get('location')).toBe('/p/tok/en-ca/products/x?variant=1')
  })

  it('never redirects off the store', async () => {
    const { send } = harness()
    for (const target of ['//evil.com', '/%5Cevil.com', '/%09/evil.com', '/%0d%0a/evil.com', 'https://evil.com', 'javascript:alert(1)', 'evil.com', '']) {
      expect([target, (await send('GET', `/discount/SAVE?redirect=${target}`)).headers.get('location')]).toEqual([target, '/'])
    }
  })

  it('holds a code once, whatever its case, and keeps the codes of the cart', async () => {
    const { send, seed, store } = harness()
    await seed([], { cart: { token: VISITOR, lines: [], note: null, attributes: {}, discountCodes: ['FREESHIP', 'welcome10'] } })
    await send('GET', '/discount/WELCOME10')
    expect((await store.get(VISITOR))?.cart.discountCodes).toEqual(['FREESHIP', 'WELCOME10'])
    await send('GET', '/discount/FREESHIP')
    expect((await store.get(VISITOR))?.cart.discountCodes).toEqual(['WELCOME10', 'FREESHIP'])
  })

  it('reads a code with escapes, and the code of a path with a slash whole', async () => {
    const { send, store } = harness()
    await send('GET', '/discount/SPRING%20SALE')
    await send('GET', '/discount/a%2Fb')
    expect((await store.get(VISITOR))?.cart.discountCodes).toEqual(['SPRING SALE', 'a/b'])
  })

  it('holds at most the limit of codes, drops the oldest, and adds no blank or overlong code', async () => {
    const { send, store } = harness({ limits: { properties: 2, propertyLength: 8 } })
    for (const code of ['AAA', 'BBB', 'CCC']) await send('GET', `/discount/${code}`)
    expect((await store.get(VISITOR))?.cart.discountCodes).toEqual(['BBB', 'CCC'])
    const blank = await send('GET', '/discount/%20%20')
    const long = await send('GET', '/discount/TOOLONGCODE')
    expect([blank.status, long.status]).toEqual([302, 302])
    expect((await store.get(VISITOR))?.cart.discountCodes).toEqual(['BBB', 'CCC'])
  })

  it('answers the discount with the codes applied in /cart.js', async () => {
    const { send, seed } = harness()
    await seed([line(SUNNIES, 1), line(HOODIE, 1)])
    await send('GET', '/discount/WELCOME10')
    expect(((await send('GET', '/cart.js')).json as any).discount_codes).toEqual([{ code: 'WELCOME10', applicable: true }])
  })
})

describe('the other endpoints', () => {
  it('does not save a visitor for a read of the cart', async () => {
    const { send, store } = harness()
    expect((await send('GET', '/cart.js')).status).toBe(200)
    expect(await store.get(VISITOR)).toBeUndefined()
    expect((await send('GET', '/cart.json')).status).toBe(200)
  })

  it('prints a one-way derivation of the visitor key as the cart token, and the key itself only in a sandbox', async () => {
    const derived = createHash('sha256').update(VISITOR).digest('hex').slice(0, 32)
    const { send, seed } = harness()
    const first = await send('GET', '/cart.js')
    expect((first.json as any).token).toBe(derived)
    expect(derived).toMatch(/^[0-9a-f]{32}$/)
    expect(first.text).not.toContain(VISITOR)
    // the same on every answer that prints the cart, whatever the stored cart holds
    await seed([line(SUNNIES, 1)], { cart: { token: VISITOR, lines: [], note: null, attributes: {}, discountCodes: [] } })
    for (const answer of [await send('GET', '/cart.js'), await send('POST', '/cart/add.js', { items: [{ id: SUNNIES }] }), await send('POST', '/cart/update.js', { note: 'x' }), await send('POST', '/cart/clear.js')]) {
      expect((answer.json as any).token ?? derived).toBe(derived)
      expect(answer.text).not.toContain(VISITOR)
    }
    // a page prints the same token
    const page = harness({ theme: { files: { ...harnessTheme().files, 'sections/token.liquid': '{{ cart.token }}' } } })
    expect(wrapped((await page.send('GET', '/?section_id=token')).text)).toBe(derived)
    // another visitor has another token
    const other = harness({}, { visitor: 'another-visitor-key-0002' })
    expect(((await other.send('GET', '/cart.js')).json as any).token).not.toBe(derived)
    // in a sandbox the key is in the base path already
    const sandboxed = harness({}, { visitor: VISITOR, sandbox: true })
    expect(((await sandboxed.send('GET', '/cart.js')).json as any).token).toBe(VISITOR)
  })

  it('answers the shipping rates for a cart and an address, 202 for the prepare, 422 for an address no zone covers', async () => {
    const { send, seed } = harness()
    await seed([line(HOODIE, 1)])
    const query = 'shipping_address[country]=United%20States&shipping_address[province]=CA&shipping_address[zip]=90210'
    const prepared = await send('POST', `/cart/prepare_shipping_rates.json?${query}`)
    expect([prepared.status, prepared.text]).toEqual([202, ''])
    for (const path of ['async_shipping_rates.json', 'shipping_rates.json']) {
      const rates = await send('GET', `/cart/${path}?${query}`)
      expect([rates.status, (rates.json as any).shipping_rates.length > 0]).toEqual([200, true])
    }
    const unknown = await send('GET', '/cart/shipping_rates.json?shipping_address[country]=Atlantis')
    expect([unknown.status, unknown.json]).toEqual([422, { country: ['Country/region not supported'], zip: ['Enter a postal code'] }])
    expect((await send('GET', '/cart/shipping_rates.json')).status).toBe(422)
  })

  it('reads an address part up to the length of a cart attribute, and no more', async () => {
    const { send, seed } = harness({ limits: { propertyLength: 8 } })
    await seed([line(HOODIE, 1)])
    expect((await send('GET', '/cart/shipping_rates.json?shipping_address[country]=Canada')).status).toBe(200)
    // the country is cut to `United S`, which is none
    expect((await send('GET', '/cart/shipping_rates.json?shipping_address[country]=United%20States')).status).toBe(422)
    expect((await send('GET', `/cart/shipping_rates.json?shipping_address[country]=Canada&shipping_address[zip]=${'9'.repeat(100000)}`)).status).toBe(200)
  })

  it('answers a product as JSON, in the language and market of the address, and a product the store lacks with 404 and no body', async () => {
    const { send } = harness()
    const hoodie = await send('GET', '/products/hoodie.js')
    expect([hoodie.status, hoodie.headers.get('content-type'), (hoodie.json as any).handle, (hoodie.json as any).url]).toEqual([200, 'application/json; charset=utf-8', 'hoodie', '/products/hoodie'])
    expect((await send('GET', '/en-ca/products/hoodie.js')).json).toMatchObject({ url: '/en-ca/products/hoodie' })
    const missing = await send('GET', '/products/nope.js')
    expect([missing.status, missing.text]).toEqual([404, ''])
    expect((await send('HEAD', '/products/hoodie.js')).text).toBe('')
    expect((await send('GET', '/products/%E0%A4%A.js')).status).toBe(404)
  })

  it('cuts the search terms to the limit, and answers by the types the request names', async () => {
    const { send } = harness({ limits: { search: 5 } })
    const cut = await send('GET', '/search/suggest.json?q=shirtfoo&resources[type]=product')
    const whole = await send('GET', '/search/suggest.json?q=shirt&resources[type]=product')
    const handles = (answer: Answer) => (answer.json as any).resources.results.products.map((product: any) => product.handle)
    expect(handles(whole).length).toBeGreaterThan(0)
    expect(handles(cut)).toEqual(handles(whole))
    expect(Object.keys((cut.json as any).resources.results)).toEqual(['products'])
    expect((await send('GET', '/search/suggest.json?q=' + 'a'.repeat(100000))).status).toBe(200)
  })

  it('answers the recommendations, and shopify.dev\'s errors for a request it cannot answer', async () => {
    const { send } = harness()
    const ok = await send('GET', '/recommendations/products.json?product_id=10489561382934&limit=2&intent=related')
    expect([ok.status, (ok.json as any).intent, (ok.json as any).products.length]).toEqual([200, 'related', 2])
    expect(await send('GET', '/recommendations/products.json')).toMatchObject({ status: 422, json: { status: 422, message: 'Invalid parameter error', description: 'A product_id value is missing' } })
    expect(await send('GET', '/recommendations/products.json?product_id=1')).toMatchObject({ status: 404, json: { status: 404, message: 'Product not found', description: 'No product with id 1 is published in the online store' } })
    expect(await send('GET', '/recommendations/products.json?product_id=10489561382934&intent=nope')).toMatchObject({ status: 422, json: { status: 422, message: 'Invalid parameter error', description: 'The intent parameter must be one of related, complementary' } })
    const complementary = await send('GET', '/recommendations/products.json?product_id=10489561382934&intent=complementary')
    expect([complementary.status, (complementary.json as any).products]).toEqual([200, []])
    const long = await send('GET', `/recommendations/products.json?product_id=${'7'.repeat(5000)}`)
    expect(long.status).toBe(404)
    expect((long.json as any).description.length).toBeLessThan(400)
  })

  it('leaves the products in the visitor\'s cart out of the recommendations, the same ones the section_id answer leaves out', async () => {
    const { send, seed } = harness()
    const query = 'product_id=10489561382934&limit=4'
    const handles = (answer: Answer) => (answer.json as any).products.map((product: any) => product.handle) as string[]
    const sectionHandles = async () => JSON.parse(wrapped((await send('GET', `/recommendations/products?${query}&section_id=probe-recommendations`)).text)!).products as string[]
    const before = handles(await send('GET', `/recommendations/products.json?${query}`))
    expect(await sectionHandles()).toEqual(before)
    expect(before.length).toBe(4)
    const product = data.products!.find(candidate => candidate.handle === before[0])!
    await seed([line(product.variants[0].id, 1)])
    const after = handles(await send('GET', `/recommendations/products.json?${query}`))
    expect(after).not.toContain(before[0])
    expect(after.slice(0, 3)).toEqual(before.slice(1))
    expect(after).toHaveLength(4)
    expect(await sectionHandles()).toEqual(after)
  })

  it('sends every answer as private, uncached JSON', async () => {
    const { send, seed } = harness()
    await seed([line(HOODIE, 1)])
    for (const [method, url] of [['GET', '/cart.js'], ['POST', '/cart/clear.js'], ['GET', '/products/hoodie.js'], ['GET', '/products/nope.js'], ['GET', '/cart/shipping_rates.json?shipping_address[country]=Canada'], ['GET', '/search/suggest.json?q=a'], ['GET', '/recommendations/products.json']]) {
      const answer = await send(method, url)
      expect([url, answer.headers.get('cache-control')]).toEqual([url, 'private, no-store'])
    }
  })
})
