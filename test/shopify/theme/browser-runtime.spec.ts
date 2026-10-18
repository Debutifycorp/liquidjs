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

describe('shopify/theme/browser-runtime: Shopify.loadFeatures', () => {
  it('sets Shopify.modules and both loaders, which answer the features after the current task', () => {
    const page = browser()
    page.run(featureLoaderScript())
    expect(page.window.Shopify.modules).toBe(true)
    expect(typeof page.window.Shopify.loadFeatures).toBe('function')
    const seen: unknown[] = []
    page.window.Shopify.loadFeatures([{ name: 'model-viewer-ui', version: '1.0', onLoad: (error: Error) => seen.push(['onLoad', error.message]) }], (errors: Error[]) => seen.push(['callback', errors.length]))
    expect(seen).toEqual([])
    page.flush()
    expect(seen).toEqual([['onLoad', 'load error: the feature { name: "model-viewer-ui", version: "1.0"} is not available in the preview'], ['callback', 1]])
  })
  it('says a feature the loader does not register does not exist, as the loader does', () => {
    const page = browser()
    page.run(featureLoaderScript())
    const seen: string[] = []
    page.window.Shopify.loadFeatures([{ name: 'model-viewer-ui', version: '9.9', onLoad: (error: Error) => seen.push(error.message) }, { name: 'other', version: '1.0' }])
    page.flush()
    expect(seen).toEqual(['The feature { name: "model-viewer-ui", version: "9.9"} does not exist'])
  })
  it('throws on arguments the loader refuses, and autoloads with no error', () => {
    const page = browser()
    page.run(featureLoaderScript())
    expect(() => page.window.Shopify.loadFeatures('model-viewer-ui')).toThrow('Features should be an Array. Received: "model-viewer-ui"')
    expect(() => page.window.Shopify.loadFeatures([{ name: 'a' }])).toThrow('Features should be defined as')
    const seen: unknown[] = []
    page.window.Shopify.autoloadFeatures((errors: unknown) => seen.push(errors))
    page.flush()
    expect(seen).toEqual([null])
  })
  it('keeps what Shopify already holds', () => {
    const page = browser()
    page.run('var Shopify = { shop: "a.example" };')
    page.run(featureLoaderScript())
    expect(page.window.Shopify.shop).toBe('a.example')
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
