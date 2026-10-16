import { BodyError, nestFields, readBody } from '../../../src/storefront/body'

const post = (body: BodyInit, type?: string, extra: Record<string, string> = {}) => new Request('https://x.invalid/cart/add', { method: 'POST', body, headers: { ...(type ? { 'content-type': type } : {}), ...extra } })

const streamed = (pull: (controller: ReadableStreamDefaultController<unknown>) => void) => new Request('https://x.invalid/cart/add.js', { method: 'POST', body: new ReadableStream({ pull }), duplex: 'half', headers: { 'content-type': 'application/x-www-form-urlencoded' } } as RequestInit)

describe('readBody', () => {
  it('reads JSON, url-encoded and multipart bodies into one shape', async () => {
    expect(await readBody(post('{"items":[{"id":43695847538710,"quantity":2}]}', 'application/json'), 1000)).toEqual({ items: [{ id: 43695847538710, quantity: 2 }] })
    expect(await readBody(post('id=43695847538710&quantity=1&properties%5BEngraving%5D=Hi', 'application/x-www-form-urlencoded'), 1000)).toEqual({ id: '43695847538710', quantity: '1', properties: { Engraving: 'Hi' } })
    const form = new FormData()
    form.append('id', '43696940613654')
    form.append('properties[Photo]', new Blob(['x']), 'photo.png')
    form.append('properties[Note]', 'Hi')
    expect(await readBody(new Request('https://x.invalid/cart/add', { method: 'POST', body: form }), 1000)).toEqual({ id: '43696940613654', properties: { Note: 'Hi' } })
    expect(await readBody(new Request('https://x.invalid/cart/clear.js', { method: 'POST' }), 1000)).toEqual({})
  })

  it('reads the bracket names of a url-encoded or multipart form that Shopify themes post', async () => {
    const encoded = 'items%5B0%5D%5Bid%5D=1&items%5B0%5D%5Bquantity%5D=2&items%5B1%5D%5Bid%5D=3&attributes%5BGift+wrap%5D=Yes&updates%5B%5D=4&updates%5B%5D=5'
    const expected = { items: [{ id: '1', quantity: '2' }, { id: '3' }], attributes: { 'Gift wrap': 'Yes' }, updates: ['4', '5'] }
    expect(await readBody(post(encoded, 'application/x-www-form-urlencoded; charset=UTF-8'), 1000)).toEqual(expected)
    const form = new FormData()
    for (const [name, value] of new URLSearchParams(encoded)) form.append(name, value)
    expect(await readBody(new Request('https://x.invalid/cart/add.js', { method: 'POST', body: form }), 1000)).toEqual(expected)
  })

  it('reads the content type with its parameters and case ignored, and a +json type as JSON', async () => {
    expect(await readBody(post('{"id":1}', 'Application/JSON; charset=utf-8'), 1000)).toEqual({ id: 1 })
    expect(await readBody(post('{"id":1}', 'application/vnd.api+json'), 1000)).toEqual({ id: 1 })
  })

  it('reads a url-encoded body when the request names no type, as a form posts it', async () => {
    expect(await readBody(post(new URLSearchParams({ id: '7', quantity: '2' })), 1000)).toEqual({ id: '7', quantity: '2' })
    expect(await readBody(post('id=7&id=8', 'application/x-www-form-urlencoded'), 1000)).toEqual({ id: '8' })
  })

  it('accepts a body of exactly the limit and rejects one byte more with 413', async () => {
    const at = '{"note":"' + 'x'.repeat(100 - 11) + '"}'
    expect(at.length).toBe(100)
    expect(await readBody(post(at, 'application/json'), 100)).toEqual({ note: 'x'.repeat(89) })
    await expect(readBody(post(at + ' ', 'application/json'), 100)).rejects.toMatchObject({ status: 413 })
  })

  it('rejects a body over the limit with 413 and a body it cannot parse with 400', async () => {
    await expect(readBody(post('x'.repeat(2000), 'application/x-www-form-urlencoded'), 1000)).rejects.toMatchObject({ status: 413 })
    await expect(readBody(post('{"items":', 'application/json'), 1000)).rejects.toMatchObject({ status: 400 })
    await expect(readBody(post('[1,2]', 'application/json'), 1000)).rejects.toBeInstanceOf(BodyError)
  })

  it('stops reading a stream that never ends at the limit, without a declared length', async () => {
    let pulls = 0
    await expect(readBody(streamed(controller => { pulls++; controller.enqueue(new Uint8Array(100).fill(97)) }), 1000)).rejects.toMatchObject({ status: 413 })
    expect(pulls).toBeLessThan(15)
  })

  it('counts the chunks of a stream together: the limit can be crossed by a later chunk, and a body in several chunks within it is read whole', async () => {
    const bytesOf = (text: string) => new TextEncoder().encode(text)
    let sent = 0
    await expect(readBody(streamed(controller => { if (sent++ < 3) controller.enqueue(new Uint8Array(400).fill(97)); else controller.close() }), 1000)).rejects.toMatchObject({ status: 413 })
    const parts = ['a=1&', 'b%5Bc%5D=2&', 'd=3']
    let at = 0
    expect(await readBody(streamed(controller => { if (at < parts.length) controller.enqueue(bytesOf(parts[at++])); else controller.close() }), 1000)).toEqual({ a: '1', b: { c: '2' }, d: '3' })
  })

  it('answers 400 to a stream that fails or yields something that is not bytes, and cannot be made to skip the limit with it', async () => {
    let sent = 0
    await expect(readBody(streamed(controller => { if (sent++ < 3) controller.enqueue('a'.repeat(100000)); else controller.close() }), 1000)).rejects.toMatchObject({ status: 400 })
    await expect(readBody(streamed(controller => controller.error(new Error('secret internal path'))), 1000)).rejects.toMatchObject({ status: 400, message: 'The request body could not be read.' })
  })

  it('refuses a limit that is not a usable number, so the limit cannot be switched off', async () => {
    for (const limit of [undefined, Number.NaN, -1, Infinity]) await expect(readBody(post('x'.repeat(100000), 'application/x-www-form-urlencoded'), limit as number)).rejects.toThrow(TypeError)
  })

  it('refuses on the declared length alone, before it reads a byte', async () => {
    await expect(readBody(post('id=1', 'application/x-www-form-urlencoded', { 'content-length': '5000' }), 1000)).rejects.toMatchObject({ status: 413 })
  })

  it('counts a multipart body against the limit too', async () => {
    const form = new FormData()
    form.append('note', 'x'.repeat(2000))
    await expect(readBody(new Request('https://x.invalid/cart/update.js', { method: 'POST', body: form }), 1000)).rejects.toMatchObject({ status: 413 })
  })

  it('answers 400 to JSON that is not an object and to multipart it cannot read', async () => {
    for (const text of ['[1,2]', 'null', '"text"', '5', 'true']) await expect(readBody(post(text, 'application/json'), 1000)).rejects.toMatchObject({ status: 400 })
    await expect(readBody(post('--nope', 'multipart/form-data'), 1000)).rejects.toMatchObject({ status: 400 })
    await expect(readBody(post('not a form at all', 'multipart/form-data; boundary=zzz'), 1000)).rejects.toMatchObject({ status: 400 })
  })

  it('answers 400 to fields that name a value as both a value and a container', async () => {
    await expect(readBody(post('a=1&a%5Bb%5D=2', 'application/x-www-form-urlencoded'), 1000)).rejects.toMatchObject({ status: 400 })
  })

  it('never lets a body write to a prototype or hand one on', async () => {
    const json = await readBody(post('{"properties":{"__proto__":{"polluted":"yes"},"constructor":"c","Note":"Hi"},"__proto__":{"also":"yes"}}', 'application/json'), 1000)
    expect(json).toEqual({ properties: { Note: 'Hi' } })
    expect(Object.getPrototypeOf(json)).toBe(Object.prototype)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(({} as Record<string, unknown>).also).toBeUndefined()
    const form = await readBody(post('properties%5B__proto__%5D%5Bpolluted%5D=yes&properties%5BNote%5D=Hi', 'application/x-www-form-urlencoded'), 1000)
    expect(form).toEqual({ properties: { Note: 'Hi' } })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('leaves no stack in what it throws', async () => {
    for (const request of [post('x'.repeat(2000), 'application/json'), post('{', 'application/json'), post('--x', 'multipart/form-data')]) {
      const error = await readBody(request, 1000).then(() => undefined, (e: unknown) => e as BodyError)
      expect(error).toBeInstanceOf(BodyError)
      expect(error?.message).toMatch(/^The request body [^\n]+\.$/)
    }
  })
})

describe('nestFields', () => {
  it('reads Shopify\'s bracket names', () => {
    expect(nestFields([['items[0][id]', '1'], ['items[0][quantity]', '2'], ['items[1][id]', '3'], ['updates[]', '4'], ['updates[]', '5'], ['attributes[gift]', 'yes'], ['contact[email]', 'a@b.c']])).toEqual({ items: [{ id: '1', quantity: '2' }, { id: '3' }], updates: ['4', '5'], attributes: { gift: 'yes' }, contact: { email: 'a@b.c' } })
    expect(nestFields([['updates[43695847538710]', '2'], ['updates[43695846653974]', '0']])).toEqual({ updates: { 43695847538710: '2', 43695846653974: '0' } })
  })

  it('nests as deep as a line\'s properties go', () => {
    expect(nestFields([['items[0][properties][Engraving]', 'Hi'], ['items[0][selling_plan]', '9']])).toEqual({ items: [{ properties: { Engraving: 'Hi' }, selling_plan: '9' }] })
  })

  it('keeps numeric names under properties and attributes as names, not positions', () => {
    expect(nestFields([['properties[1]', 'a'], ['attributes[2]', 'b']])).toEqual({ properties: { 1: 'a' }, attributes: { 2: 'b' } })
  })

  it('orders a list by its indexes and closes the gaps, without ever building a sparse array', () => {
    const fields = nestFields([['items[999999999][id]', 'b'], ['items[2][id]', 'a'], ['items[999999999][quantity]', '3']])
    expect(fields).toEqual({ items: [{ id: 'a' }, { id: 'b', quantity: '3' }] })
    expect((fields.items as unknown[]).length).toBe(2)
  })

  it('groups items[][id] and items[][quantity] into elements as Rack does: the last element goes on until a name would repeat in it', () => {
    expect(nestFields([['items[][id]', '1'], ['items[][quantity]', '2'], ['items[][id]', '3'], ['items[][quantity]', '4']])).toEqual({ items: [{ id: '1', quantity: '2' }, { id: '3', quantity: '4' }] })
    expect(nestFields([['items[][properties][a]', '1'], ['items[][properties][b]', '2'], ['items[][properties][a]', '3']])).toEqual({ items: [{ properties: { a: '1', b: '2' } }, { properties: { a: '3' } }] })
    expect(nestFields([['list[3]', 'x'], ['list[][a]', '1'], ['list[][b]', '2']])).toEqual({ list: ['x', { a: '1', b: '2' }] })
  })

  it('puts a field named [] after the highest index', () => {
    expect(nestFields([['list[3]', 'a'], ['list[]', 'b'], ['list[0]', 'c']])).toEqual({ list: ['c', 'a', 'b'] })
  })

  it('lets the last of two values for one name win', () => {
    expect(nestFields([['id', '1'], ['id', '2'], ['properties[a]', 'x'], ['properties[a]', 'y']])).toEqual({ id: '2', properties: { a: 'y' } })
  })

  it('drops names it cannot read: no name, an open bracket, a stray bracket, too many parts', () => {
    expect(nestFields([['', 'a'], ['[a]', 'b'], ['a[', 'c'], ['a]b', 'd'], ['a[b]c', 'e'], ['a[b][c][d][e][f]', 'g'], ['ok[a][b][c][d]', 'h']])).toEqual({ ok: { a: { b: { c: { d: 'h' } } } } })
  })

  it('never writes to prototypes', () => {
    const fields = nestFields([['__proto__[polluted]', 'yes'], ['a[constructor][prototype][x]', '1']])
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(fields).toEqual({})
  })

  it('does not reach an inherited property of a plain object as if the form had set it', () => {
    const toString = Object.prototype.toString
    const fields = nestFields([['toString[x]', '1'], ['valueOf', '2'], ['hasOwnProperty[y][z]', '3'], ['__defineGetter__[w]', '4']])
    expect(Object.prototype.toString).toBe(toString)
    expect((Object.prototype.toString as unknown as Record<string, unknown>).x).toBeUndefined()
    expect((Object.prototype.hasOwnProperty as unknown as Record<string, unknown>).y).toBeUndefined()
    expect(((Object.prototype as unknown as Record<string, Record<string, unknown>>).__defineGetter__).w).toBeUndefined()
    expect(Object.keys(fields).sort()).toEqual(['__defineGetter__', 'hasOwnProperty', 'toString', 'valueOf'])
    expect(fields.toString).toEqual({ x: '1' })
  })

  it('throws a 400 when a name is used both as a value and as a container', () => {
    for (const pairs of [[['a', '1'], ['a[b]', '2']], [['a[b]', '2'], ['a', '1']], [['u[]', '1'], ['u[x]', '2']], [['u[x]', '1'], ['u[]', '2']]] as Array<Array<[string, string]>>) {
      expect(() => nestFields(pairs)).toThrow(BodyError)
      expect(() => nestFields(pairs)).toThrow(expect.objectContaining({ status: 400 }))
    }
  })
})
