import { createContext, runInContext } from 'vm'
import { accountElementsScript, featureLoaderScript } from '../../../src/shopify/theme/browser-runtime'

/** A window with the few browser parts the scripts use, and the timers a test advances by hand. */
function browser () {
  const tasks: Array<() => void> = []
  const defined = new Map<string, any>()
  class HTMLElement {
    shadowRoot: any = null
    events: any[] = []
    attachShadow () { this.shadowRoot = { firstChild: null, innerHTML: '', anchor: { href: '' }, querySelector: () => this.shadowRoot.anchor }; return this.shadowRoot }
    dispatchEvent (event: any) { this.events.push(event) }
  }
  class CustomEvent { constructor (public type: string, public init: object) {} }
  const location = { assigned: '' as string, assign (url: string) { this.assigned = url } }
  const window: any = { customElements: { get: (name: string) => defined.get(name), define: (name: string, ctor: any) => defined.set(name, ctor) }, location }
  window.window = window
  Object.assign(window, { HTMLElement, CustomEvent, setTimeout: (fn: () => void) => tasks.push(fn) })
  const context = createContext(window)
  return { window, defined, location, run: (code: string) => runInContext(code, context), flush: () => { while (tasks.length) tasks.shift()!() } }
}

/** A document with the parts the feature loader uses: the scripts it appends (which a test loads or fails by hand), the `#shopify-features` element, and the elements the autoload selectors find. */
function documentWith (options: { locale?: string, present?: string[], readyState?: string } = {}) {
  const scripts: any[] = []
  const observers: any[] = []
  const present = options.present || []
  const document: any = {
    readyState: options.readyState || 'complete',
    body: {},
    head: { appendChild: (script: any) => scripts.push(script) },
    getElementById: (id: string) => id === 'shopify-features' && options.locale ? { textContent: JSON.stringify({ locale: options.locale }) } : null,
    querySelector: (selector: string) => {
      const match = /^script\[src="(.*)"\]$/.exec(selector)
      if (match) return scripts.find(script => script.src === match[1]) || null
      return present.includes(selector) ? {} : null
    },
    createElement: () => {
      const listeners: Record<string, Array<() => void>> = {}
      return {
        attributes: {} as Record<string, string>,
        setAttribute (name: string, value: string) { this.attributes[name] = value },
        addEventListener: (type: string, fn: () => void) => { (listeners[type] = listeners[type] || []).push(fn) },
        removeEventListener: (type: string, fn: () => void) => { listeners[type] = (listeners[type] || []).filter(x => x !== fn) },
        fire (type: string) { (listeners[type] || []).slice().forEach(fn => fn()) }
      }
    },
    addEventListener: () => {}
  }
  const MutationObserver = class { constructor (public callback: (list: any[]) => void) { observers.push(this) } observe () {} }
  return { document, scripts, observers, MutationObserver }
}

function loaderPage (options: Parameters<typeof documentWith>[0] = {}) {
  const page = browser()
  const doc = documentWith(options)
  page.window.document = doc.document
  page.window.MutationObserver = doc.MutationObserver
  page.run(featureLoaderScript())
  return { ...page, ...doc }
}

describe('shopify/theme/browser-runtime: Shopify.loadFeatures', () => {
  it('sets Shopify.modules and both loaders', () => {
    const page = loaderPage()
    expect(page.window.Shopify.modules).toBe(true)
    expect(typeof page.window.Shopify.loadFeatures).toBe('function')
    expect(typeof page.window.Shopify.autoloadFeatures).toBe('function')
  })
  it('loads model-viewer-ui 1.0 from Shopify\'s CDN as a module and tells the feature and the callback when it loaded', () => {
    const page = loaderPage()
    const seen: unknown[] = []
    page.window.Shopify.loadFeatures([{ name: 'model-viewer-ui', version: '1.0', onLoad: (error: unknown) => seen.push(['onLoad', error]) }], (errors: unknown) => seen.push(['callback', errors]))
    expect(page.scripts.map(script => [script.src, script.attributes])).toEqual([['https://cdn.shopify.com/shopifycloud/model-viewer-ui/v1.0/model-viewer-ui.en.js', { type: 'module', defer: '' }]])
    expect(seen).toEqual([])
    page.scripts[0].fire('load')
    expect(seen).toEqual([['onLoad', null], ['callback', null]])
  })
  it('maps shopify-xr 1.0 and video-ui 2.0 (and 1.1) as the loader does, in the locale of #shopify-features when the feature has it', () => {
    const page = loaderPage({ locale: 'fr' })
    page.window.Shopify.loadFeatures([{ name: 'shopify-xr', version: '1.0' }, { name: 'video-ui', version: '2.0' }, { name: 'consent-tracking-api', version: '0.2' }])
    expect(page.scripts.map(script => script.src)).toEqual([
      'https://cdn.shopify.com/shopifycloud/shopify-xr-js/v1.0/shopify-xr.fr.js',
      'https://cdn.shopify.com/shopifycloud/plyr/v2.0/shopify-plyr.fr.js',
      'https://cdn.shopify.com/shopifycloud/consent-tracking-api/v0.2/consent-tracking-api.js'
    ])
    const old = loaderPage({ locale: 'bg-BG' })
    old.window.Shopify.loadFeatures([{ name: 'video-ui', version: '1.1' }])
    expect(old.scripts.map(script => script.src)).toEqual(['https://cdn.shopify.com/shopifycloud/shopify-plyr/v1.1/shopify-plyr.en.js'])
  })
  it('hands the load error to the feature and the callback when a script fails', () => {
    const page = loaderPage()
    const seen: unknown[] = []
    page.window.Shopify.loadFeatures([{ name: 'video-ui', version: '2.0', onLoad: (error: Error) => seen.push(error.message) }], (errors: Error[]) => seen.push(errors.map(error => error.message)))
    page.scripts[0].fire('error')
    const src = 'https://cdn.shopify.com/shopifycloud/plyr/v2.0/shopify-plyr.en.js'
    expect(seen).toEqual([`load error: ${src}`, [`load error: ${src}`]])
  })
  it('says a feature the loader does not register does not exist, at once, and loads nothing', () => {
    const page = loaderPage()
    const seen: unknown[] = []
    page.window.Shopify.loadFeatures([{ name: 'model-viewer-ui', version: '9.9', onLoad: (error: Error) => seen.push(error.message) }, { name: 'other', version: '1.0' }], (errors: Error[]) => seen.push(errors.length))
    expect(seen).toEqual(['The feature { name: "model-viewer-ui", version: "9.9"} does not exist', 2])
    expect(page.scripts).toEqual([])
  })
  it('refuses a second version of a feature, as the loader does', () => {
    const page = loaderPage()
    page.window.Shopify.loadFeatures([{ name: 'video-ui', version: '1.0' }])
    const seen: string[] = []
    page.window.Shopify.loadFeatures([{ name: 'video-ui', version: '2.0', onLoad: (error: Error) => seen.push(error.message) }])
    expect(seen).toEqual(['video-ui@2.0 has already been loaded at version 1.0'])
  })
  it('throws on arguments the loader refuses', () => {
    const page = loaderPage()
    expect(() => page.window.Shopify.loadFeatures('model-viewer-ui')).toThrow('Features should be an Array. Received: "model-viewer-ui"')
    expect(() => page.window.Shopify.loadFeatures([{ name: 'a' }])).toThrow('Features should be defined as')
  })
  it('loads the model viewer of a <model-viewer data-shopify-feature> element once, at load and when nodes are added', () => {
    const selector = 'model-viewer[data-shopify-feature="1.12"]'
    const present: string[] = []
    const page = loaderPage({ present })
    expect(page.scripts).toEqual([])
    present.push(selector)
    page.observers[0].callback([{ addedNodes: [{}] }])
    expect(page.scripts.map(script => script.src)).toEqual(['https://cdn.shopify.com/shopifycloud/model-viewer/v1.12/model-viewer.js'])
    page.observers[0].callback([{ addedNodes: [{}] }])
    expect(page.scripts).toHaveLength(1)
    const seen: unknown[] = []
    page.window.Shopify.autoloadFeatures((errors: unknown) => seen.push(errors))
    expect(seen).toEqual([null])
  })
})

describe('shopify/theme/browser-runtime: <shopify-account>', () => {
  it('defines both elements once', () => {
    const page = browser()
    page.run(accountElementsScript('https://a.example/customer_authentication/redirect?locale=en&region_country=US'))
    page.run(accountElementsScript('https://other.example/'))
    expect([...page.defined.keys()]).toEqual(['shopify-store', 'shopify-account'])
  })
  it('renders the sign-in link around the theme\'s slot in an open shadow root', () => {
    const page = browser()
    page.run(accountElementsScript('https://a.example/customer_authentication/redirect?locale=en&region_country=US'))
    const element = new (page.defined.get('shopify-account'))()
    element.connectedCallback()
    expect(element.shadowRoot.innerHTML).toContain('<a href="" class="account-button legacy" part="signed-out-avatar" aria-label="Account"><slot name="signed-out-avatar">')
    expect(element.shadowRoot.anchor.href).toBe('https://a.example/customer_authentication/redirect?locale=en&region_country=US')
    element.shadowRoot.firstChild = {}
    element.shadowRoot.innerHTML = 'kept'
    element.connectedCallback()
    expect(element.shadowRoot.innerHTML).toBe('kept')
  })
  it('opens the account notice from showModal and fires open', async () => {
    const page = browser()
    page.run(accountElementsScript('/p/tok/customer_authentication/redirect?locale=en&region_country=US'))
    const element = new (page.defined.get('shopify-account'))()
    expect(await element.showModal()).toBe(element)
    expect(page.location.assigned).toBe('/p/tok/customer_authentication/redirect?locale=en&region_country=US')
    expect(element.events.map((event: any) => [event.type, event.init])).toEqual([['open', { bubbles: false, composed: true }]])
    expect(element.close()).toBe(element)
  })
  it('keeps a hostile address from closing its script', () => {
    expect(accountElementsScript('/x</script><b>')).not.toContain('</script>')
  })
})
