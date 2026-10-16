import type { CartState, RenderReport, ShopifyServices, StoreData, ThemeInput } from '../shopify'

/** What the storefront keeps for one visitor, as plain JSON: the cart, the country and language they chose, and whether they passed the storefront password. */
export interface VisitorState {
  cart: CartState
  country?: string
  language?: string
  unlocked?: boolean
}

/** Where visitor states live. The default keeps them in memory (`memoryCartStore`); item 15 may keep them in Postgres later. */
export interface CartStore {
  get (visitor: string): Promise<VisitorState | undefined>
  set (visitor: string, state: VisitorState): Promise<void>
}

export interface StorefrontLimits {
  /** Request body bytes. */
  body: number
  lines: number
  quantity: number
  properties: number
  propertyLength: number
  sections: number
  search: number
  /** Visitors the default cart store holds. */
  visitors: number
  /** Milliseconds after which the default cart store drops an idle visitor. */
  idleMs: number
}

export const DEFAULT_LIMITS: Readonly<StorefrontLimits> = Object.freeze({
  body: 64 * 1024,
  lines: 100,
  quantity: 9999,
  properties: 25,
  propertyLength: 255,
  sections: 5,
  search: 256,
  visitors: 10000,
  idleMs: 24 * 60 * 60 * 1000
})

export type StorefrontReport = { kind: 'render', report: RenderReport } | { kind: 'error', error: Error }

type PerRequest<T> = T | ((request: Request) => T | Promise<T>)

export interface StorefrontOptions {
  /** The theme, with an optional `base`, or a function of the request. Each theme object is compiled once and kept by the engine. */
  theme: PerRequest<ThemeInput>
  data: PerRequest<StoreData>
  services?: Partial<ShopifyServices>
  cartStore?: CartStore
  /** Replaces the notice page shown for checkout and the account pages. */
  notice?: (kind: 'checkout' | 'account', request: Request) => Response | Promise<Response>
  limits?: Partial<StorefrontLimits>
  /** The password `POST /password` accepts when the store data says the store is password protected (`shop.password_enabled`). */
  password?: string
  onReport?: (report: StorefrontReport, request: Request) => void
}

export interface HandleOptions {
  /** The path every storefront URL starts with (`/p/<token>`); default `''`. */
  basePath?: string
  /** The visitor key. When given, cookies are neither read nor set. */
  visitor?: string
  /** The page runs in a sandboxed iframe: cross-origin answers, no cookies, the client script in `<head>`. Needs `visitor`. */
  sandbox?: boolean
}

export interface Storefront {
  handle (request: Request, options?: HandleOptions): Promise<Response>
}
