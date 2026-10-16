/** @jest-environment ./test/support/jsdom-environment.cjs */
import { Linter } from 'eslint'
import type { JSDOM as JSDOMType } from 'jsdom'
import { storefrontClientScript } from '../../../src/storefront'
import { harness, harnessTheme } from './harness'

// jsdom 30 depends on an ES module that Jest's sandboxed require cannot load: its JSDOM class comes from the environment, as in `settings-safety.spec.ts`
const JSDOM = (globalThis as any).JSDOM as typeof JSDOMType

function sandboxedWindow (url: string) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><a id="hard" href="/products/x">x</a><form id="f" action="/cart/add" method="post"></form></body></html>', { url, runScripts: 'outside-only' })
  const calls: Array<{ url: string, header: string | null }> = []
  // jsdom has no fetch API; the client script uses Node's classes, as a browser's
  Object.assign(dom.window, { Headers, Request, Response })
  dom.window.fetch = (async (input: string, init: RequestInit = {}) => {
    calls.push({ url: String(input), header: new Headers(init.headers).get('X-Storefront-Page') })
    return new Response('{}')
  }) as never
  Object.defineProperty(dom.window, 'localStorage', { configurable: true, get () { throw new dom.window.DOMException('blocked', 'SecurityError') } })
  dom.window.eval(storefrontClientScript({ basePath: '/p/tok' }))
  // jsdom cannot navigate; the script's capture-phase listeners still run first
  dom.window.document.addEventListener('click', event => event.preventDefault())
  return { window: dom.window, calls }
}

describe('the client script', () => {
  it('replaces storage and cookies with in-memory versions', () => {
    const { window } = sandboxedWindow('https://preview.invalid/p/tok/fr-ca/products/x')
    window.localStorage.setItem('a', '1')
    window.sessionStorage.setItem('_esk_lv', '1')
    expect([window.localStorage.getItem('a'), window.sessionStorage.getItem('_esk_lv'), window.localStorage.length]).toEqual(['1', '1', 1])
    window.document.cookie = 'cart_currency=CAD; path=/'
    window.document.cookie = 'seen=1'
    expect(window.document.cookie).toBe('cart_currency=CAD; seen=1')
    window.document.cookie = 'seen=; max-age=0'
    expect(window.document.cookie).toBe('cart_currency=CAD')
  })
  it('prefixes root-relative fetches, links and forms that lack the prefix, and names the page on the store\'s own requests only', async () => {
    const { window, calls } = sandboxedWindow('https://preview.invalid/p/tok/fr-ca/products/x?variant=2')
    ;(window as any).Shopify = { routes: { root: '/p/tok/fr-ca/' } }
    await window.fetch('/cart/add.js', { method: 'POST' })
    await window.fetch('/p/tok/fr-ca/cart.js')
    await window.fetch('https://cdn.example/x.js')
    expect(calls).toEqual([
      { url: '/p/tok/fr-ca/cart/add.js', header: '/p/tok/fr-ca/products/x?variant=2' },
      { url: '/p/tok/fr-ca/cart.js', header: '/p/tok/fr-ca/products/x?variant=2' },
      { url: 'https://cdn.example/x.js', header: null }
    ])
    window.document.getElementById('hard')!.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(window.document.getElementById('hard')!.getAttribute('href')).toBe('/p/tok/fr-ca/products/x')
    window.document.getElementById('f')!.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
    expect(window.document.getElementById('f')!.getAttribute('action')).toBe('/p/tok/fr-ca/cart/add')
  })
})

/** A window the script runs in, where the fetches and XHR requests it passes on are recorded as they reach the browser's own functions. */
function recordingWindow (url: string, basePath = '/p/tok', setup: (window: any) => void = () => undefined, location?: Record<string, string>) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url, runScripts: 'outside-only' })
  const window = dom.window as any
  const fetched: Array<{ input: any, init: any }> = []
  const xhr: Array<string[]> = []
  Object.assign(window, { Headers, Request, Response })
  window.fetch = async (input: unknown, init?: unknown) => {
    fetched.push({ input, init })
    return new Response('{}')
  }
  const proto = window.XMLHttpRequest.prototype
  proto.open = function (method: string, address: unknown) { xhr.push(['open', method, String(address)]) }
  proto.setRequestHeader = function (name: string, value: string) { xhr.push(['header', name, value]) }
  setup(window)
  const script = storefrontClientScript({ basePath })
  // a document under `sandbox` reads `location.origin` as "null" while the rest of its location is the host's: jsdom cannot be made opaque, so the script runs with a `location` of that shape
  window.eval(location ? `(function (location) {${script}})(${JSON.stringify(location)})` : script)
  const header = (call: { input: any, init: any }) => new Headers(call.init?.headers ?? (call.input instanceof Request ? call.input.headers : undefined)).get('x-storefront-page')
  return { window, fetched, xhr, header }
}

describe('the client script: storage', () => {
  it('keeps what is set, orders keys by first set, and forgets what is removed or cleared', () => {
    const { window } = recordingWindow('https://preview.invalid/p/tok/')
    const store = window.localStorage
    store.setItem('b', 1)
    store.setItem('a', 'x')
    store.setItem('b', 'y')
    expect([store.length, store.key(0), store.key(1), store.key(2), store.getItem('b'), store.getItem('nope')]).toEqual([2, 'b', 'a', null, 'y', null])
    store.removeItem('b')
    store.removeItem('never-set')
    expect([store.length, store.key(0), store.getItem('b')]).toEqual([1, 'a', null])
    store.clear()
    expect([store.length, store.getItem('a')]).toEqual([0, null])
  })
  it('keeps local and session storage apart, and a name that is a prototype key is an ordinary name', () => {
    const { window } = recordingWindow('https://preview.invalid/p/tok/')
    window.localStorage.setItem('__proto__', 'p')
    window.localStorage.setItem('toString', 't')
    window.localStorage.setItem('hasOwnProperty', 'h')
    expect([window.localStorage.getItem('__proto__'), window.localStorage.getItem('toString'), window.localStorage.getItem('hasOwnProperty'), window.sessionStorage.getItem('toString'), window.localStorage.length]).toEqual(['p', 't', 'h', null, 3])
    expect(window.localStorage.getItem('constructor')).toBeNull()
  })
  it('does not throw where storage cannot be replaced or throws, as under an opaque origin', () => {
    expect(() => recordingWindow('https://preview.invalid/p/tok/', '/p/tok', window => {
      for (const name of ['localStorage', 'sessionStorage']) Object.defineProperty(window, name, { configurable: false, get () { throw new window.DOMException('blocked', 'SecurityError') } })
      Object.defineProperty(window.document, 'cookie', { configurable: false, get () { throw new window.DOMException('blocked', 'SecurityError') }, set () { throw new window.DOMException('blocked', 'SecurityError') } })
    })).not.toThrow()
  })
  it('keeps cookies by name, with the value after the first =, and ignores an attribute or a nameless pair', () => {
    const { window } = recordingWindow('https://preview.invalid/p/tok/')
    const doc = window.document
    doc.cookie = 'a=b=c; path=/; SameSite=Lax'
    doc.cookie = '=nameless'
    doc.cookie = 'noequals'
    doc.cookie = 'z = 1 '
    doc.cookie = 'a=again'
    expect(doc.cookie).toBe('a=again; z=1')
    doc.cookie = 'z=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    doc.cookie = 'never=; max-age=-1'
    expect(doc.cookie).toBe('a=again')
    doc.cookie = '__proto__=x'
    expect(doc.cookie).toBe('a=again; __proto__=x')
  })
})

describe('the client script: requests', () => {
  const PAGE = 'https://preview.invalid/p/tok/fr-ca/products/x?variant=2'

  it('keeps the base path when the page sets no Shopify.routes.root, and takes the locale from it once it does', async () => {
    const { window, fetched } = recordingWindow(PAGE)
    await window.fetch('/cart.js')
    window.Shopify = { routes: { root: '/p/tok/fr-ca/' } }
    await window.fetch('/cart.js')
    window.Shopify = { routes: { root: 'not-a-path' } }
    await window.fetch('/cart.js')
    expect(fetched.map(call => call.input)).toEqual(['/p/tok/cart.js', '/p/tok/fr-ca/cart.js', '/p/tok/cart.js'])
  })
  it('leaves an address that already has the base path or the prefix, or is not a root-relative path, as it is', async () => {
    const { window, fetched, header } = recordingWindow(PAGE)
    window.Shopify = { routes: { root: '/p/tok/fr-ca/' } }
    for (const url of ['/p/tok', '/p/tok?x=1', '/p/tok/cart.js', '/p/tok#top', '/p/tok/fr-ca/cart.js', 'cart.js', '//cdn.example/x.js', '/\\cdn.example/x.js', 'https://preview.invalid/cart.js', '']) await window.fetch(url)
    expect(fetched.map(call => call.input)).toEqual(['/p/tok', '/p/tok?x=1', '/p/tok/cart.js', '/p/tok#top', '/p/tok/fr-ca/cart.js', 'cart.js', '//cdn.example/x.js', '/\\cdn.example/x.js', 'https://preview.invalid/cart.js', ''])
    // the page is named on the root-relative ones that are the store's, and on no other
    expect(fetched.map(header)).toEqual(['/p/tok/fr-ca/products/x?variant=2', '/p/tok/fr-ca/products/x?variant=2', '/p/tok/fr-ca/products/x?variant=2', '/p/tok/fr-ca/products/x?variant=2', '/p/tok/fr-ca/products/x?variant=2', null, null, null, null, null])
  })
  it('prefixes a path that only starts like the base path', async () => {
    const { window, fetched } = recordingWindow(PAGE)
    await window.fetch('/p/token/x')
    expect(fetched[0].input).toBe('/p/tok/p/token/x')
  })
  it('names the page as it is when the request is made, not when the script ran', async () => {
    const { window, fetched, header } = recordingWindow(PAGE)
    window.history.replaceState(null, '', '/p/tok/fr-ca/products/x?variant=3')
    await window.fetch('/cart.js')
    expect(header(fetched[0])).toBe('/p/tok/fr-ca/products/x?variant=3')
  })
  it('keeps the caller\'s headers and options, and does not change the options object it is given', async () => {
    const { window, fetched, header } = recordingWindow(PAGE)
    const options = { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: '{"id":1}' }
    await window.fetch('/cart/add.js', options)
    expect(options).toEqual({ method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: '{"id":1}' })
    const sent = fetched[0].init
    expect([sent.method, sent.body, new Headers(sent.headers).get('content-type'), new Headers(sent.headers).get('x-requested-with'), header(fetched[0])]).toEqual(['POST', '{"id":1}', 'application/json', 'XMLHttpRequest', '/p/tok/fr-ca/products/x?variant=2'])
    // headers given as a Headers object or as pairs work too
    await window.fetch('/cart.js', { headers: new Headers({ Accept: 'application/json' }) })
    await window.fetch('/cart.js', { headers: [['Accept', 'text/html']] })
    expect(fetched.slice(1).map(call => new Headers(call.init.headers).get('accept'))).toEqual(['application/json', 'text/html'])
  })
  it('prefixes a Request for the page\'s own host and names the page on it', async () => {
    const { window, fetched, header } = recordingWindow(PAGE)
    window.Shopify = { routes: { root: '/p/tok/fr-ca/' } }
    await window.fetch(new window.Request('https://preview.invalid/cart.js?x=1', { headers: { Accept: 'application/json' } }))
    await window.fetch(new window.Request('https://cdn.example/cart.js'))
    expect(fetched[0].input).toBeInstanceOf(Request)
    expect([fetched[0].input.url, header(fetched[0]), fetched[0].input.headers.get('accept')]).toEqual(['https://preview.invalid/p/tok/fr-ca/cart.js?x=1', '/p/tok/fr-ca/products/x?variant=2', 'application/json'])
    expect([fetched[1].input.url, header(fetched[1])]).toEqual(['https://cdn.example/cart.js', null])
  })
  it('takes a Request for the page\'s own host as its own where the origin reads null, as under a sandbox', async () => {
    const { window, fetched, header } = recordingWindow(PAGE, '/p/tok', () => undefined, { protocol: 'https:', host: 'preview.invalid', origin: 'null', pathname: '/p/tok/fr-ca/products/x', search: '?variant=2' })
    window.Shopify = { routes: { root: '/p/tok/fr-ca/' } }
    await window.fetch(new window.Request('https://preview.invalid/cart.js'))
    await window.fetch('/cart.js')
    expect(fetched.map(call => [call.input instanceof Request ? call.input.url : call.input, header(call)])).toEqual([
      ['https://preview.invalid/p/tok/fr-ca/cart.js', '/p/tok/fr-ca/products/x?variant=2'],
      ['/p/tok/fr-ca/cart.js', '/p/tok/fr-ca/products/x?variant=2']
    ])
  })
  it('prefixes a Request that carries a body, and the body arrives whole, where a stream body in the init is refused', async () => {
    // the rule of Chrome's Request constructor, which Node's does not share: a stream given as `init.body` throws (it wants `duplex`, and a streaming upload needs HTTP/2). Emulated here, not observed in a browser.
    const strict = (window: any) => {
      window.Request = class extends Request {
        constructor (input: any, init?: any) {
          if (init?.body && typeof init.body.getReader === 'function') throw new TypeError('The `duplex` member must be specified for a request with a streaming body')
          super(input, init)
        }
      }
    }
    const { window, fetched, header } = recordingWindow(PAGE, '/p/tok', strict)
    window.Shopify = { routes: { root: '/p/tok/fr-ca/' } }
    await window.fetch(new window.Request('https://preview.invalid/cart/add.js', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"id":1}' }))
    const sent = fetched[0].input
    expect([sent.url, sent.method, sent.headers.get('content-type'), await sent.text(), header(fetched[0])]).toEqual(['https://preview.invalid/p/tok/fr-ca/cart/add.js', 'POST', 'application/json', '{"id":1}', '/p/tok/fr-ca/products/x?variant=2'])
  })
  it('passes a Request whose body is spent to the browser as it is', async () => {
    const { window, fetched } = recordingWindow(PAGE)
    const request = new window.Request('https://preview.invalid/cart/add.js', { method: 'POST', body: 'x' })
    await request.text()
    await window.fetch(request)
    expect(fetched[0].input).toBe(request)
  })
  it('does not take an address with a control character for the store\'s own: a browser reads it as another host', async () => {
    const { window, fetched, header } = recordingWindow('https://preview.invalid/products/x', '')
    for (const url of ['/\t/evil.example/x', '/\n/evil.example/x', '/\r/evil.example/x', '/\u0000/x', '/\u007f/x']) await window.fetch(url)
    expect(fetched.map(call => call.input)).toEqual(['/\t/evil.example/x', '/\n/evil.example/x', '/\r/evil.example/x', '/\u0000/x', '/\u007f/x'])
    expect(fetched.map(header)).toEqual([null, null, null, null, null])
    const xhr = new window.XMLHttpRequest()
    const sent: string[][] = []
    xhr.setRequestHeader = (name: string, value: string) => sent.push([name, value])
    xhr.open('GET', '/\t/evil.example/x')
    expect(sent).toEqual([])
  })
  it('passes a URL object through untouched', async () => {
    const { window, fetched } = recordingWindow(PAGE)
    const url = new URL('https://cdn.example/x.js')
    await window.fetch(url)
    expect(fetched[0].input).toBe(url)
  })
  it('prefixes XMLHttpRequest addresses and names the page on the store\'s own ones', () => {
    const { window, xhr } = recordingWindow(PAGE)
    window.Shopify = { routes: { root: '/p/tok/fr-ca/' } }
    const request = new window.XMLHttpRequest()
    request.open('POST', '/cart/add.js', true)
    request.open('GET', 'https://cdn.example/x.js')
    request.open('GET', new URL('https://cdn.example/y.js'))
    expect(xhr).toEqual([
      ['open', 'POST', '/p/tok/fr-ca/cart/add.js'], ['header', 'X-Storefront-Page', '/p/tok/fr-ca/products/x?variant=2'],
      ['open', 'GET', 'https://cdn.example/x.js'],
      ['open', 'GET', 'https://cdn.example/y.js']
    ])
  })
  it('does nothing to requests when the store has no base path, except naming the page', async () => {
    const { window, fetched, header } = recordingWindow('https://preview.invalid/products/x', '')
    await window.fetch('/cart.js')
    expect([fetched[0].input, header(fetched[0])]).toEqual(['/cart.js', '/products/x'])
  })
})

describe('the client script: run twice', () => {
  it('keeps what the page stored, and wraps nothing a second time', async () => {
    const { window, fetched, xhr } = recordingWindow('https://preview.invalid/p/tok/fr-ca/products/x')
    window.localStorage.setItem('a', '1')
    window.sessionStorage.setItem('b', '2')
    window.document.cookie = 'seen=1'
    const wrapped = { fetch: window.fetch, open: window.XMLHttpRequest.prototype.open }
    const listeners: string[] = []
    const add = window.document.addEventListener.bind(window.document)
    window.document.addEventListener = (type: string, ...rest: unknown[]) => { listeners.push(type); return (add as any)(type, ...rest) }
    // a fragment inserted by a script-running library, or a page that includes the script twice
    window.eval(storefrontClientScript({ basePath: '/p/tok' }))
    expect([window.localStorage.getItem('a'), window.sessionStorage.getItem('b'), window.document.cookie]).toEqual(['1', '2', 'seen=1'])
    expect([window.fetch, window.XMLHttpRequest.prototype.open]).toEqual([wrapped.fetch, wrapped.open])
    expect(listeners).toEqual([])
    await window.fetch('/cart.js')
    new window.XMLHttpRequest().open('GET', '/cart.js')
    expect([fetched.length, xhr.filter(entry => entry[0] === 'header').length]).toEqual([1, 1])
  })
})

describe('the client script: links and forms', () => {
  it('prefixes a link when it is clicked, also from a child element, and leaves other links alone', () => {
    const { window } = recordingWindow('https://preview.invalid/p/tok/fr-ca/')
    window.Shopify = { routes: { root: '/p/tok/fr-ca/' } }
    window.document.body.innerHTML = '<a id="a" href="/collections/all"><span id="inner">all</span></a><a id="b" href="https://cdn.example/x">x</a><a id="c" href="/p/tok/fr-ca/cart">cart</a><a id="d" name="anchor">d</a>'
    window.document.addEventListener('click', (event: Event) => event.preventDefault())
    const click = (id: string) => window.document.getElementById(id).dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    for (const id of ['inner', 'b', 'c', 'd']) click(id)
    expect(['a', 'b', 'c'].map(id => window.document.getElementById(id).getAttribute('href'))).toEqual(['/p/tok/fr-ca/collections/all', 'https://cdn.example/x', '/p/tok/fr-ca/cart'])
  })
  it('prefixes a form\'s action when it is submitted, and adds none to a form with none', () => {
    const { window } = recordingWindow('https://preview.invalid/p/tok/')
    window.document.body.innerHTML = '<form id="a" action="/search"></form><form id="b"></form><form id="c" action="/p/tok/cart"></form>'
    for (const id of ['a', 'b', 'c']) window.document.getElementById(id).dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
    expect(['a', 'b', 'c'].map(id => window.document.getElementById(id).getAttribute('action'))).toEqual(['/p/tok/search', null, '/p/tok/cart'])
  })
})

describe('the client script text', () => {
  // the script runs in every browser the theme supports, and nothing transpiles it: it is parsed here as ES5 by eslint's own parser, a direct dev dependency
  const parseAsEs5 = (code: string) => new Linter().verify(code, { languageOptions: { ecmaVersion: 5, sourceType: 'script' } }).filter(message => message.fatal).map(message => message.message)

  it('parses as ES5, for an ordinary, an empty and a hostile base path', () => {
    for (const basePath of ['/p/tok', '', '/a</script><!--\u2028\u2029"\\']) expect([basePath, parseAsEs5(storefrontClientScript({ basePath }))]).toEqual([basePath, []])
  })
  it('has a parse check that rejects what ES5 lacks', () => {
    for (const code of ['var f = () => 1;', 'let a = 1;', 'const a = 1;', 'var a = `x`;', 'class A {}', 'async function f () {}', 'var a = b?.c;', 'var a = b ?? c;', 'var o = { m () {} };', 'var { a } = b;', 'function f (a = 1) {}', 'for (var a of b) {}', 'f(...a);']) expect([code, parseAsEs5(code).length > 0]).toEqual([code, true])
  })
  it('holds the base path as a string that cannot close the script or break a line', () => {
    const script = storefrontClientScript({ basePath: '/p/tok/' })
    expect(script).toContain('var base = "/p/tok";')
    const hostile = storefrontClientScript({ basePath: '/a</script><!--\u2028\u2029"\\' })
    expect(hostile).not.toMatch(/<\/script|<!--|\u2028|\u2029/)
    // the hostile base path is still a value of the script, read back exactly
    const read = /var base = (.*);\n/.exec(hostile)![1]
    expect(JSON.parse(read)).toBe('/a</script><!--\u2028\u2029"\\')
  })
  it('is the same text for the same base path, so a host can cache it', () => {
    expect(storefrontClientScript({ basePath: '/p/tok' })).toBe(storefrontClientScript({ basePath: '/p/tok' }))
  })
})

describe('the client script and the storefront agree on the page header', () => {
  const sandbox = { visitor: 'preview-token-0000000001', basePath: '/p/tok', sandbox: true }
  const SUNNIES = 43696940613654
  const WHERE = '{{ request.path }}|{{ request.page_type }}|{{ localization.country.iso_code }}|{{ cart.currency.iso_code }}'
  const themed = () => ({ files: { ...harnessTheme().files, 'sections/where.liquid': WHERE } })
  const wrapped = (html: unknown) => /^<div id="shopify-section-[^"]+" class="shopify-section[^"]*">([\s\S]*)<\/div>$/.exec(String(html))?.[1]

  it('names the page with the base path, the locale prefix and the query, and the storefront renders its sections there', async () => {
    const { storefront } = harness({ theme: themed() }, sandbox)
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://preview.invalid/p/tok/fr-ca/products/black-sunnies?variant=43696940613654', runScripts: 'outside-only' })
    Object.assign(dom.window, { Headers, Request, Response })
    // the browser's fetch, which sends the request to the storefront and holds nothing back
    dom.window.fetch = (async (input: string, init?: RequestInit) => storefront.handle(new Request(new URL(String(input), 'https://store.invalid'), init), sandbox)) as never
    dom.window.eval(storefrontClientScript({ basePath: '/p/tok' }))
    ;(dom.window as any).Shopify = { routes: { root: '/p/tok/fr-ca/' } }
    const answer = await (dom.window as any).fetch('/cart/add.js', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: SUNNIES, sections: 'where' }) })
    const body = await answer.json()
    expect(answer.status).toBe(200)
    expect(wrapped(body.sections.where)).toBe('/p/tok/fr-ca/products/black-sunnies|product|CA|CAD')
    // without the header the same call renders the home page of the locale it is sent to
    const bare = await storefront.handle(new Request('https://store.invalid/p/tok/fr-ca/cart/add.js', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: SUNNIES, sections: 'where' }) }), sandbox)
    expect(wrapped((await bare.json()).sections.where)).toBe('/p/tok/fr-ca|index|CA|CAD')
  })
})
