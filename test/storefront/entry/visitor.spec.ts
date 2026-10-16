import { memoryCartStore as entryStore } from '../../../src/storefront'
import { cookieVisitor, emptyVisitor, memoryCartStore, newVisitorKey, visitorCookie, VisitorQueue } from '../../../src/storefront/visitor'

describe('visitors', () => {
  it('keys visitors by the cart cookie, set HttpOnly and SameSite=Lax under the base path', () => {
    const key = newVisitorKey()
    expect(key).toMatch(/^[0-9a-f]{32}$/)
    expect(visitorCookie(key, '/p/tok')).toBe(`cart=${key}; Path=/p/tok; HttpOnly; SameSite=Lax`)
    expect(visitorCookie(key, '')).toBe(`cart=${key}; Path=/; HttpOnly; SameSite=Lax`)
    expect(cookieVisitor(new Request('https://x.invalid/', { headers: { cookie: `a=1; cart=${key}` } }))).toBe(key)
    expect(cookieVisitor(new Request('https://x.invalid/', { headers: { cookie: 'cart=<script>' } }))).toBeUndefined()
    expect(emptyVisitor(key)).toEqual({ cart: { token: key, lines: [], note: null, attributes: {}, discountCodes: [] } })
  })

  it('keeps at most max visitors and drops idle ones', async () => {
    let now = 0
    const store = memoryCartStore({ max: 2, idleMs: 100, now: () => now })
    await store.set('a', emptyVisitor('a'))
    await store.set('b', emptyVisitor('b'))
    await store.get('a')
    await store.set('c', emptyVisitor('c'))
    expect(await store.get('b')).toBeUndefined()
    expect(await store.get('a')).toBeDefined()
    now = 500
    expect(await store.get('a')).toBeUndefined()
  })

  it('runs one task at a time per visitor', async () => {
    const queue = new VisitorQueue()
    const order: string[] = []
    const slow = queue.run('v', async () => { await new Promise(resolve => setTimeout(resolve, 20)); order.push('first') })
    const fast = queue.run('v', async () => { order.push('second') })
    const other = queue.run('w', async () => { order.push('other') })
    await Promise.all([slow, fast, other])
    expect(order).toEqual(['other', 'first', 'second'])
    await expect(queue.run('v', async () => { throw new Error('boom') })).rejects.toThrow('boom')
    await expect(queue.run('v', async () => 'after')).resolves.toBe('after')
  })

  it('releases a visitor whose task throws at once, not as a rejected promise', async () => {
    const queue = new VisitorQueue()
    await expect(queue.run('v', () => { throw new Error('sync') })).rejects.toThrow('sync')
    await expect(queue.run('v', async () => 'after')).resolves.toBe('after')
  })
})

describe('visitor keys', () => {
  it('draws a new key from 128 random bits, never twice the same', () => {
    const keys = new Set(Array.from({ length: 1000 }, () => newVisitorKey()))
    expect(keys.size).toBe(1000)
    for (const key of keys) expect(key).toMatch(/^[0-9a-f]{32}$/)
  })

  it('reads only a plain key from the cart cookie: a foreign or tampered value starts a fresh visitor', () => {
    const key = newVisitorKey()
    const read = (cookie?: string) => cookieVisitor(new Request('https://x.invalid/', { headers: cookie === undefined ? {} : { cookie } }))
    expect(read()).toBeUndefined()
    expect(read('')).toBeUndefined()
    expect(read(`cart=${key}`)).toBe(key)
    expect(read(`  cart=${key}  ;a=1`)).toBe(key)
    expect(read(`a=${key}`)).toBeUndefined()
    expect(read(`xcart=${key}`)).toBeUndefined()
    expect(read(`cart_sig=${key}`)).toBeUndefined()
    expect(read('cart=')).toBeUndefined()
    expect(read('cart=short')).toBeUndefined()
    expect(read(`cart=${key};x`)).toBe(key)
    expect(read(`cart=${key}=`)).toBeUndefined()
    expect(read(`cart=${key}%00`)).toBeUndefined()
    expect(read(`cart="${key}"`)).toBeUndefined()
    expect(read(`cart=${key} x`)).toBeUndefined()
    expect(read(`cart=${'a'.repeat(129)}`)).toBeUndefined()
    expect(read(`cart=${'a'.repeat(128)}`)).toBe('a'.repeat(128))
    expect(read(`cart=../../etc/passwd${'a'.repeat(20)}`)).toBeUndefined()
    expect(read(`cart=${'a'.repeat(15)}`)).toBeUndefined()
  })

  it('uses the first usable cart cookie when a browser sends two', () => {
    const [first, second] = [newVisitorKey(), newVisitorKey()]
    expect(cookieVisitor(new Request('https://x.invalid/', { headers: { cookie: `cart=${first}; cart=${second}` } }))).toBe(first)
    expect(cookieVisitor(new Request('https://x.invalid/', { headers: { cookie: `cart=<x>; cart=${second}` } }))).toBe(second)
  })

  it('sets the cookie under a base path written with or without its slashes, and refuses one that would add cookie attributes', () => {
    const key = newVisitorKey()
    expect(visitorCookie(key, 'p/tok')).toBe(`cart=${key}; Path=/p/tok; HttpOnly; SameSite=Lax`)
    expect(visitorCookie(key, '/p/tok/')).toBe(`cart=${key}; Path=/p/tok; HttpOnly; SameSite=Lax`)
    expect(visitorCookie(key, '/')).toBe(`cart=${key}; Path=/; HttpOnly; SameSite=Lax`)
    for (const bad of ['/p; Domain=evil.invalid', '/p\r\nSet-Cookie: x=1', '/p tok']) expect(() => visitorCookie(key, bad)).toThrow(TypeError)
  })

  it('refuses a key that is not a plain key', () => {
    expect(() => visitorCookie('a b', '')).toThrow(TypeError)
    expect(() => visitorCookie('x; Domain=evil.invalid', '')).toThrow(TypeError)
  })
})

describe('memoryCartStore', () => {
  const cart = (key: string, note: string) => ({ ...emptyVisitor(key), country: 'CA', cart: { ...emptyVisitor(key).cart, note } })

  it('is the store the entry exports', () => {
    expect(entryStore).toBe(memoryCartStore)
  })

  it('returns what was set, as a copy the caller cannot change the store through', async () => {
    const store = memoryCartStore()
    expect(await store.get('v')).toBeUndefined()
    const state = cart('v', 'first')
    await store.set('v', state)
    state.cart.note = 'changed after set'
    const read = await store.get('v')
    expect(read).toEqual(cart('v', 'first'))
    read!.cart.note = 'changed after get'
    expect(await store.get('v')).toEqual(cart('v', 'first'))
    await store.set('v', cart('v', 'second'))
    expect((await store.get('v'))?.cart.note).toBe('second')
  })

  it('holds 10,000 visitors and forgets one after 24 hours idle, by default', async () => {
    let now = 1_000_000
    const store = memoryCartStore({ now: () => now })
    await store.set('old', emptyVisitor('old'))
    now += 24 * 60 * 60 * 1000
    expect(await store.get('old')).toBeDefined()
    now += 24 * 60 * 60 * 1000
    expect(await store.get('old')).toBeDefined()
    now += 24 * 60 * 60 * 1000 + 1
    expect(await store.get('old')).toBeUndefined()
    for (let i = 0; i < 10001; i++) await store.set(`v${i}`, emptyVisitor(`v${i}`))
    expect(await store.get('v0')).toBeUndefined()
    expect(await store.get('v1')).toBeDefined()
    expect(await store.get('v10000')).toBeDefined()
  })

  it('counts a read as use, and a write as use', async () => {
    let now = 0
    const store = memoryCartStore({ idleMs: 100, now: () => now })
    await store.set('a', emptyVisitor('a'))
    now = 90
    expect(await store.get('a')).toBeDefined()
    now = 180
    expect(await store.get('a')).toBeDefined()
    now = 250
    await store.set('a', emptyVisitor('a'))
    now = 340
    expect(await store.get('a')).toBeDefined()
    now = 441
    expect(await store.get('a')).toBeUndefined()
  })

  it('drops the least recently used visitor first', async () => {
    let now = 0
    const store = memoryCartStore({ max: 2, idleMs: 100, now: () => now })
    await store.set('a', emptyVisitor('a'))
    now = 50
    await store.set('b', emptyVisitor('b'))
    now = 120
    await store.set('c', emptyVisitor('c'))
    expect(await store.get('a')).toBeUndefined()
    expect(await store.get('b')).toBeDefined()
    expect(await store.get('c')).toBeDefined()
  })
})
