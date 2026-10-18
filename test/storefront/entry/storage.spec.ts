import { harness } from './harness'

// A sandboxed page has no storage of its own, so the storefront keeps `localStorage` and `sessionStorage` in the visitor's state and puts them into the client script of the next page (`storefrontClientScript`).

const alice = { visitor: 'preview-token-alice-0001', basePath: '/p/tok', sandbox: true }
const bob = { visitor: 'preview-token-bob-000001', basePath: '/p/tok', sandbox: true }
const SAVE = '/p/tok/storefront-storage'
const post = (body: unknown) => ['POST', SAVE, body, { origin: 'null' }] as const
const saved = (html: string) => {
  const match = /var saved = (\{.*?\}|null);\n/.exec(html)
  return match ? JSON.parse(match[1]) : undefined
}

describe('POST /storefront-storage', () => {
  it('saves both storages, and the next page of the same visitor starts with them', async () => {
    const { send } = harness({}, alice)
    expect(saved((await send('GET', '/p/tok/')).text)).toEqual({ local: {}, session: {} })
    const answer = await send(...post({ local: { recent: '[1,2]' }, session: { view: 'grid' } }))
    expect(answer.status).toBe(204)
    expect(answer.headers.get('access-control-allow-origin')).toBe('*')
    expect(saved((await send('GET', '/p/tok/products/hoodie')).text)).toEqual({ local: { recent: '[1,2]' }, session: { view: 'grid' } })
  })

  it('replaces what was saved, and keeps the cart beside it', async () => {
    const { send } = harness({}, alice)
    await send('POST', '/p/tok/cart/add.js', { id: 43695847538710, quantity: 1 })
    await send(...post({ local: { a: '1' }, session: {} }))
    await send(...post({ local: { b: '2' }, session: {} }))
    expect(saved((await send('GET', '/p/tok/')).text)).toEqual({ local: { b: '2' }, session: {} })
    expect((await send('GET', '/p/tok/cart.js')).json).toMatchObject({ item_count: 1 })
  })

  it('is one visitor\'s alone: another visitor, on the same store, starts empty', async () => {
    const store = harness({}, alice)
    await store.send(...post({ local: { secret: 'alice' }, session: {} }))
    const other = harness({ cartStore: store.store }, bob)
    expect(saved((await other.send('GET', '/p/tok/')).text)).toEqual({ local: {}, session: {} })
    expect(saved((await store.send('GET', '/p/tok/')).text)).toEqual({ local: { secret: 'alice' }, session: {} })
  })

  it('keeps only text values, never a prototype name, and no more than 500 names', async () => {
    const { send } = harness({}, alice)
    const many = Object.fromEntries(Array.from({ length: 600 }, (_, i) => [`k${i}`, 'v']))
    await send('POST', SAVE, '{"local":{"ok":"1","n":2,"o":{"x":1},"__proto__":"p","constructor":"c"},"session":[1]}', { 'content-type': 'application/json' })
    expect(saved((await send('GET', '/p/tok/')).text)).toEqual({ local: { ok: '1' }, session: {} })
    await send(...post({ local: many, session: {} }))
    expect(Object.keys(saved((await send('GET', '/p/tok/')).text).local)).toHaveLength(500)
  })

  it('refuses a body past the limit, and escapes what it prints into the script', async () => {
    const { send } = harness({}, alice)
    expect((await send(...post({ local: { big: 'x'.repeat(70 * 1024) }, session: {} }))).status).toBe(413)
    await send(...post({ local: { html: '</script><script>alert(1)</script>' }, session: {} }))
    const page = (await send('GET', '/p/tok/')).text
    expect(page).not.toContain('</script><script>alert(1)')
    expect(saved(page)).toEqual({ local: { html: '</script><script>alert(1)</script>' }, session: {} })
  })

  it('answers 404 where the page is not sandboxed', async () => {
    const { send } = harness({}, { visitor: 'plain-visitor-key-0001', basePath: '/p/tok' })
    expect((await send(...post({ local: { a: '1' }, session: {} }))).status).toBe(404)
  })
})
