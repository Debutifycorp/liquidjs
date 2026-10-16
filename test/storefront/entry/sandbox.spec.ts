import { storefrontClientScript } from '../../../src/storefront'
import { harness, harnessTheme, VISITOR } from './harness'

const sandbox = { visitor: 'preview-token-0000000001', basePath: '/p/tok', sandbox: true }
const HOODIE = 43695847538710

/** The text after the opening `<head>`, where the client script goes first. */
const afterHead = (html: string) => html.slice(html.indexOf('<head>') + '<head>'.length)

describe('sandbox mode', () => {
  it('needs a visitor key', async () => {
    const { storefront } = harness()
    await expect(storefront.handle(new Request('https://x.invalid/p/tok'), { basePath: '/p/tok', sandbox: true })).rejects.toThrow(/visitor/)
  })
  it('answers preflights and allows any origin, without credentials or cookies', async () => {
    const { send } = harness({}, sandbox)
    const preflight = await send('OPTIONS', '/p/tok/cart/add.js', undefined, { origin: 'null', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,x-storefront-page' })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe('*')
    expect(preflight.headers.get('access-control-allow-headers')).toContain('x-storefront-page')
    expect(preflight.headers.get('access-control-allow-credentials')).toBeNull()
    const added = await send('POST', '/p/tok/cart/add.js', { id: 43695847538710, quantity: 1 }, { origin: 'null', cookie: 'cart=someone-elses-cart-key' })
    expect(added.status).toBe(200)
    expect(added.headers.get('access-control-allow-origin')).toBe('*')
    expect(added.headers.get('set-cookie')).toBeNull()
    expect((await send('GET', '/p/tok/cart.js')).json).toMatchObject({ item_count: 1, token: 'preview-token-0000000001' })
  })
  it('puts the client script first in <head>, with the base path', async () => {
    const { send } = harness({}, sandbox)
    const page = await send('GET', '/p/tok/fr-ca')
    const head = page.text.slice(page.text.indexOf('<head>') + '<head>'.length)
    expect(head.startsWith('<script>')).toBe(true)
    expect(head).toContain('"/p/tok"')
    expect(head.indexOf('X-Storefront-Page')).toBeLessThan(head.indexOf('var Shopify = Shopify'))
  })
})

describe('sandbox mode: the preflight', () => {
  it('lists exactly the methods, headers and age the brief names, and holds no state', async () => {
    const { send } = harness({}, sandbox)
    const preflight = await send('OPTIONS', '/p/tok/cart.js', undefined, { origin: 'null' })
    expect(preflight.status).toBe(204)
    expect(preflight.text).toBe('')
    expect(Object.fromEntries(preflight.headers)).toMatchObject({
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, accept, x-requested-with, x-storefront-page',
      'access-control-max-age': '600'
    })
    expect(preflight.headers.get('set-cookie')).toBeNull()
  })
  it('answers any address, also one outside the base path, and the same on a page', async () => {
    const { send } = harness({}, sandbox)
    for (const url of ['/p/tok', '/p/tok/products/black-sunnies', '/elsewhere']) expect([url, (await send('OPTIONS', url)).status]).toEqual([url, 204])
  })
  it('is no preflight outside sandbox mode', async () => {
    const { send } = harness()
    const answer = await send('OPTIONS', '/')
    expect(answer.status).not.toBe(204)
    expect(answer.headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('sandbox mode: cookies and visitors', () => {
  it('ignores a cart cookie and keeps the cart under the visitor option', async () => {
    const { send, store } = harness({}, sandbox)
    await send('POST', '/p/tok/cart/add.js', { id: HOODIE, quantity: 1 }, { cookie: 'cart=someone-elses-cart-key' })
    expect(await store.get('someone-elses-cart-key')).toBeUndefined()
    expect((await store.get(sandbox.visitor))?.cart.lines).toHaveLength(1)
    // another cookie on the next request reaches the same cart
    expect((await send('GET', '/p/tok/cart.js', undefined, { cookie: 'cart=another-cart-key-0000001' })).json).toMatchObject({ item_count: 1 })
  })
  it('sets no cookie on any kind of answer, a page that creates a visitor included', async () => {
    const { send } = harness({}, sandbox)
    for (const [method, url, body] of [['GET', '/p/tok', undefined], ['GET', '/p/tok/cart.js', undefined], ['POST', '/p/tok/cart/add.js', { id: HOODIE }], ['GET', '/p/tok/nope', undefined], ['GET', '/p/tok/discount/SAVE?redirect=/', undefined]] as const) {
      const answer = await send(method, url, body)
      expect([url, answer.headers.get('set-cookie')]).toEqual([url, null])
    }
  })
  it('strips a cookie that a route or the notice callback sets', async () => {
    const notice = () => new Response('<!doctype html><html><head></head><body>notice</body></html>', { headers: { 'content-type': 'text/html', 'set-cookie': 'a=b; Path=/' } })
    const { send } = harness({ notice }, sandbox)
    const answer = await send('GET', '/p/tok/checkout')
    expect([answer.status, answer.headers.get('set-cookie'), answer.headers.get('access-control-allow-origin')]).toEqual([200, null, '*'])
  })
  it('does not set the visitor cookie outside sandbox mode, when it is not given a visitor', async () => {
    const { storefront } = harness()
    const response = await storefront.handle(new Request('https://store.invalid/cart.js'), {})
    expect(response.headers.get('set-cookie')).toBeNull()
    const added = await storefront.handle(new Request('https://store.invalid/cart/add.js', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: HOODIE }) }), {})
    expect(added.headers.get('set-cookie')).toMatch(/^cart=/)
    expect(added.headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('sandbox mode: where the client script goes', () => {
  it('goes on the pages, the 404 page and the error page, once each', async () => {
    const { send } = harness({}, sandbox)
    const script = `<script>${storefrontClientScript({ basePath: '/p/tok' })}</script>`
    for (const url of ['/p/tok', '/p/tok/products/black-sunnies', '/p/tok/products/nope', '/p/tok/nowhere/at/all']) {
      const page = await send('GET', url)
      expect([url, afterHead(page.text).startsWith(script), page.text.split(script).length - 1]).toEqual([url, true, 1])
      expect([url, page.headers.get('access-control-allow-origin'), page.headers.get('x-storefront-page')]).toEqual([url, '*', null])
    }
    expect((await send('GET', '/p/tok/products/nope')).status).toBe(404)
    const broken = harness({ theme: () => { throw new Error('boom') }, onReport: () => undefined }, sandbox)
    const failed = await broken.send('GET', '/p/tok')
    expect([failed.status, afterHead(failed.text).startsWith(script), failed.headers.get('access-control-allow-origin')]).toEqual([500, true, '*'])
    expect(failed.text).not.toContain('boom')
  })
  it('meets a Shopify.routes.root that holds the base path and the locale prefix, which is what its prefix is read from', async () => {
    const { send } = harness({}, sandbox)
    expect((await send('GET', '/p/tok/fr-ca')).text).toContain('Shopify.routes.root = "/p/tok/fr-ca/";')
    expect((await send('GET', '/p/tok')).text).toContain('Shopify.routes.root = "/p/tok/";')
  })
  it('goes at the first <head, <html or doctype in the text, which a comment or an attribute can mislead', async () => {
    const odd = await harness({ notice: () => new Response('<!doctype html><!-- <head> --><html><head></head></html>', { headers: { 'content-type': 'text/html' } }) }, sandbox).send('GET', '/p/tok/checkout')
    // the first textual match, as the pattern of any script injector is: the comment's `<head>` takes it
    expect(odd.text.startsWith('<!doctype html><!-- <head><script>')).toBe(true)
  })
  it('goes after the doctype and <html> of a document with no <head>, so its mode stays standards mode', async () => {
    const bare = (html: string) => harness({ notice: () => new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'content-length': String(html.length) } }) }, sandbox)
    const withHtml = await bare('<!doctype html><html lang="en"><body>x</body></html>').send('GET', '/p/tok/checkout')
    expect(withHtml.text.startsWith('<!doctype html><html lang="en"><script>')).toBe(true)
    expect(withHtml.text.endsWith('</script><body>x</body></html>')).toBe(true)
    expect(withHtml.headers.get('content-length')).toBeNull()
    const doctypeOnly = await bare('<!DOCTYPE html><p>x</p>').send('GET', '/p/tok/checkout')
    expect(doctypeOnly.text.startsWith('<!DOCTYPE html><script>')).toBe(true)
    // `<header>` is no `<head>`
    const header = await bare('<!doctype html><html><body><header>x</header></body></html>').send('GET', '/p/tok/checkout')
    expect(header.text.startsWith('<!doctype html><html><script>')).toBe(true)
  })
  it('does not go into HTML with no <head>, <html> or doctype: a fragment, or JSON or text served as text/html', async () => {
    const files = { ...harnessTheme().files, 'templates/product.quick.liquid': '{% layout none %}<div class="quick">{{ product.title }}</div>', 'templates/product.data.liquid': '{% layout none %}{"title": {{ product.title | json }}}' }
    const { send } = harness({ theme: { files } }, sandbox)
    // `?view=` names an alternate template, and `{% layout none %}` leaves out the layout: the stock way to fetch a fragment (a quick view, a mini cart) or to print JSON from Liquid
    const quick = await send('GET', '/p/tok/products/black-sunnies?view=quick')
    expect([quick.status, quick.headers.get('content-type'), quick.text, quick.headers.get('access-control-allow-origin')]).toEqual([200, expect.stringMatching(/^text\/html/), '<div class="quick">Black Sunnies</div>', '*'])
    const data = await send('GET', '/p/tok/products/black-sunnies?view=data')
    expect([data.status, data.headers.get('content-type'), data.json]).toEqual([200, expect.stringMatching(/^text\/html/), { title: 'Black Sunnies' }])
    const served = (body: string) => harness({ notice: () => new Response(body, { headers: { 'content-type': 'text/html' } }) }, sandbox).send('GET', '/p/tok/checkout')
    expect((await served('{"ok":true}')).text).toBe('{"ok":true}')
    expect((await served('plain text')).text).toBe('plain text')
    expect((await served('')).text).toBe('')
    // a page of the same theme still gets it
    expect((await send('GET', '/p/tok/products/black-sunnies')).text).toContain('X-Storefront-Page')
  })
  it('answers a body that breaks a rule with the JSON error, readable by any origin', async () => {
    const { send } = harness({}, sandbox)
    const big = await send('POST', '/p/tok/cart/add.js', JSON.stringify({ id: HOODIE, note: 'x'.repeat(70000) }), { 'content-type': 'application/json', origin: 'null' })
    expect([big.status, big.headers.get('access-control-allow-origin'), big.headers.get('set-cookie'), big.text.includes('<script')]).toEqual([413, '*', null, false])
    const broken = await send('POST', '/p/tok/cart/add.js', '{"id":', { 'content-type': 'application/json', origin: 'null' })
    expect([broken.status, broken.headers.get('access-control-allow-origin'), broken.headers.get('set-cookie'), broken.text.includes('<script')]).toEqual([400, '*', null, false])
  })
  it('does not go into JSON, section answers, redirects or a HEAD answer', async () => {
    const { send } = harness({}, sandbox)
    const cart = await send('GET', '/p/tok/cart.js')
    expect([cart.status, cart.text.includes('<script'), cart.headers.get('access-control-allow-origin')]).toEqual([200, false, '*'])
    const section = await send('GET', '/p/tok?section_id=cart-count')
    expect([section.status, section.text.includes('<script'), section.headers.get('access-control-allow-origin'), section.headers.get('content-type')]).toEqual([200, false, '*', expect.stringMatching(/^text\/html/)])
    expect(section.text).toMatch(/^<div id="shopify-section-cart-count"/)
    const sections = await send('GET', '/p/tok?sections=cart-count')
    expect([sections.status, sections.text.includes('<script'), Object.keys(sections.json as object)]).toEqual([200, false, ['cart-count']])
    const missing = await send('GET', '/p/tok?section_id=missing')
    expect([missing.status, missing.text, missing.headers.get('access-control-allow-origin')]).toEqual([404, '', '*'])
    const redirected = await send('GET', '/p/tok/discount/SAVE?redirect=/pages/about')
    expect([redirected.status, redirected.text, redirected.headers.get('access-control-allow-origin'), redirected.headers.get('location'), redirected.headers.get('set-cookie')]).toEqual([302, '', '*', '/p/tok/pages/about', null])
    const head = await send('HEAD', '/p/tok')
    expect([head.status, head.text, head.headers.get('access-control-allow-origin')]).toEqual([200, '', '*'])
  })
  it('goes into a page asked for as a section whose resource the store lacks, which is a whole 404 page', async () => {
    const { send } = harness({}, sandbox)
    const page = await send('GET', '/p/tok/products/nope?section_id=main')
    expect([page.status, afterHead(page.text).startsWith('<script>')]).toEqual([404, true])
  })
  it('adds the script and nothing else to a theme page', async () => {
    const { send } = harness({}, sandbox)
    const sandboxed = await send('GET', '/p/tok')
    const plain = await harness({}, { visitor: VISITOR, basePath: '/p/tok' }).send('GET', '/p/tok')
    expect(sandboxed.text.replace(`<script>${storefrontClientScript({ basePath: '/p/tok' })}</script>`, '')).toBe(plain.text)
    expect(plain.headers.get('access-control-allow-origin')).toBeNull()
    expect(plain.text).not.toContain('X-Storefront-Page')
  })
  it('escapes the base path, so a base path cannot close the script', async () => {
    const script = storefrontClientScript({ basePath: '/p/</script><b>' })
    expect(script).not.toContain('</script')
    expect(script).toContain('\\u003c/script')
    const { send } = harness({}, { visitor: 'preview-token-0000000001', basePath: '/p/<b>', sandbox: true })
    const page = await send('GET', '/p/%3Cb%3E')
    expect(afterHead(page.text).startsWith(`<script>${storefrontClientScript({ basePath: '/p/<b>' })}</script>`)).toBe(true)
  })
})
