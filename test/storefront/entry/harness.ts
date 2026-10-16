import { storefrontSampleData } from '../../../src/shopify'
import type { CartLineState, StoreData, ThemeInput } from '../../../src/shopify'
import { createStorefront, memoryCartStore } from '../../../src/storefront'
import type { CartStore, HandleOptions, StorefrontOptions, VisitorState } from '../../../src/storefront'
import { emptyVisitor } from '../../../src/storefront/visitor'
import { probeTheme } from '../probe'

const LAYOUT = '<!doctype html><html><head>{{ content_for_header }}</head><body>{{ content_for_layout }}</body></html>'

/** The probe theme with a layout, a 404 template and a section the Ajax tests bundle. */
export function harnessTheme (): ThemeInput {
  const files = probeTheme().files
  return {
    files: {
      ...files,
      'layout/theme.liquid': LAYOUT,
      'templates/404.liquid': '<h1>Not found</h1>',
      'templates/index.json': '{"sections":{},"order":[]}',
      'templates/product.json': '{"sections":{},"order":[]}',
      'templates/collection.json': '{"sections":{},"order":[]}',
      'templates/page.json': '{"sections":{},"order":[]}',
      'templates/cart.json': '{"sections":{},"order":[]}',
      'templates/search.json': '{"sections":{},"order":[]}',
      'templates/password.liquid': '{% form "storefront_password" %}{% if form.errors %}wrong{% endif %}{% endform %}',
      'sections/cart-count.liquid': '{{ cart.item_count }}'
    }
  }
}

export const VISITOR = 'test-visitor-key-0001'

/** A storefront over the probe theme and `storefrontSampleData`, with `send` keyed to one visitor. `store` is the visitor's cart store, so a test can put a visitor in any state with `seed` before the routes that change a cart exist. */
export function harness (options: Partial<StorefrontOptions> = {}, handleOptions: HandleOptions = { visitor: VISITOR }) {
  const store: CartStore = options.cartStore ?? memoryCartStore()
  const storefront = createStorefront({ theme: harnessTheme(), data: storefrontSampleData as StoreData, cartStore: store, ...options })
  async function send (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
    const init: RequestInit = { method, headers: { ...headers } }
    if (body !== undefined) {
      init.body = typeof body === 'string' ? body : JSON.stringify(body)
      ;(init.headers as Record<string, string>)['content-type'] ??= typeof body === 'string' ? 'application/x-www-form-urlencoded' : 'application/json'
    }
    const response = await storefront.handle(new Request(`https://store.invalid${url}`, init), handleOptions)
    const text = await response.text()
    let json: unknown
    try { json = JSON.parse(text) } catch { json = undefined }
    return { status: response.status, headers: response.headers, text, json }
  }
  /** Saves the visitor's state, the cart lines and whatever else `state` holds. */
  async function seed (lines: CartLineState[], state: Partial<VisitorState> = {}): Promise<void> {
    const key = handleOptions.visitor ?? VISITOR
    const empty = emptyVisitor(key)
    await store.set(key, { ...empty, ...state, cart: { ...empty.cart, ...state.cart, lines } })
  }
  return { storefront, store, send, seed }
}

export const line = (variantId: number, quantity: number): CartLineState => ({ variantId, quantity, properties: {}, sellingPlanId: null })
