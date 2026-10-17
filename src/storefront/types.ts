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
  /** Characters in the cart note. */
  noteLength: number
  /** Characters in the value of a cart attribute. */
  attributeLength: number
  sections: number
  search: number
  /** Visitors the default cart store holds. */
  visitors: number
  /** Milliseconds after which the default cart store drops an idle visitor. */
  idleMs: number
  /** Bytes the default cart store may hold in all, counted as two bytes for each character of each visitor's state as JSON; past it the least recently used visitors go. */
  storeBytes: number
}

export const DEFAULT_LIMITS: Readonly<StorefrontLimits> = Object.freeze({
  body: 64 * 1024,
  lines: 100,
  quantity: 9999,
  properties: 25,
  propertyLength: 255,
  // no shopify.dev page and no recording states a length for the note or for an attribute's value (https://shopify.dev/docs/api/storefront/latest/mutations/cartAttributesUpdate states only that one input holds at most 250 attributes, and the Ajax cart page states no limit). The note's 5,000 is the figure Dawn merchants report for Shopify's cart note (a Shopify Community answer, not documented), and the attribute value's 1,000 is Debutify's own; both exist to bound what one visitor can make the default store hold (final review A, I2)
  noteLength: 5000,
  attributeLength: 1000,
  sections: 5,
  search: 256,
  visitors: 10000,
  idleMs: 24 * 60 * 60 * 1000,
  // Debutify's: under the other limits one visitor's state is at most about 1.34 MB as JSON (2.68 MB counted, measured: 100 lines of 25 maximal properties, a full note, 25 full attributes and 25 full discount codes), where it was 2.99 MB before the note and attribute values were bounded, so 10,000 visitors could still hold 13 GB; the budget is the stated ceiling of the default store's states (final review A, I2)
  storeBytes: 256 * 1024 * 1024
})

export type StorefrontReport = { kind: 'render', report: RenderReport } | { kind: 'error', error: Error }

type PerRequest<T> = T | ((request: Request) => T | Promise<T>)

export interface StorefrontOptions {
  /** The theme, with an optional `base`, or a function of the request. Each theme object is compiled once and kept by the engine. */
  theme: PerRequest<ThemeInput>
  data: PerRequest<StoreData>
  /** Merged over `defaultServices` for every render, or a function of the request that returns them, called once per request like `theme` and `data`. */
  services?: PerRequest<Partial<ShopifyServices>>
  cartStore?: CartStore
  /** Replaces the notice page shown for checkout and the account pages. */
  notice?: (kind: 'checkout' | 'account', request: Request) => Response | Promise<Response>
  limits?: Partial<StorefrontLimits>
  /** The most views of the store data kept (default 16). A view is a full copy of the store's objects for one base path, market and language, built the first time a request needs it and kept for the next ones; the least recently used is dropped past this number. About 40 MB per view for 5,000 products and 45,000 variants. */
  viewCacheSize?: number
  /** `'theme'`: the store is published in every language the theme has a storefront locale file for, besides the languages its data lists, in the primary market (another market keeps its own languages). Each is served at its own subfolder (`/de`, `/pt-br`), appears in `localization.available_languages`, and `POST /localization` moves a visitor to it. Content with no translation in the language shows the primary language's text. Without the option the store's languages are the ones its data lists. */
  languages?: 'theme'
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
