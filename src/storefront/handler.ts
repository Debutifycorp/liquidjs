import { localePrefixes, resolveView, setViewCacheSize, themeLanguages, withLanguages } from '../shopify'
import type { ShopifyServices, StoreData, StoreView, ThemeInput } from '../shopify'
import { BodyError, readBody } from './body'
import type { Fields } from './body'
import { storefrontClientScript } from './client'
import { errorPage, noticePage } from './html'
import { compiledAssetResponse, pageForPath, renderPageResponse, renderSectionResponse, renderSectionsJson, resourceExists } from './pages'
import { decode, routeRequest } from './router'
import type { Route, Routed } from './router'
import { shopifyAssetResponse } from './shopify-assets'
import { walletsResponse } from './wallets'
import { asError, checkWhole, PRIVATE, report, storeRoot, withoutBase } from './support'
import { DEFAULT_LIMITS } from './types'
import type { HandleOptions, Storefront, StorefrontLimits, StorefrontOptions, VisitorState } from './types'
import { cartToken, cookieVisitor, emptyVisitor, memoryCartStore, newVisitorKey, visitorCookie, VisitorQueue } from './visitor'

export interface Context {
  request: Request
  options: StorefrontOptions
  limits: StorefrontLimits
  theme: ThemeInput
  data: StoreData
  /** The services of this request: `options.services`, called with the request when it is a function. */
  services: Partial<ShopifyServices>
  routed: Routed
  basePath: string
  view: StoreView
  visitor: VisitorState
  key: string
  sandbox: boolean
  /** The body of a `POST` to a route that reads one (the cart forms and endpoints, `contact`, `localization`, `password`, the shipping rates), read before the visitor's turn so a stalled upload does not hold their lock; `{}` for every other request. A route reads this and never the request's body, which is spent. Read named properties only: a field may be called `toString`. */
  fields: Fields
}

/** What a route answers: a response, the visitor's new state when the route changed it, and `fragment` when the response is a piece of a page (a section) and not a document, so a sandboxed page's client script is not added to it. */
export interface Answer { response: Response, state?: VisitorState, fragment?: boolean }

export type RouteHandler = (ctx: Context) => Promise<Answer>

const resolve = async <T>(value: T | ((request: Request) => T | Promise<T>), request: Request): Promise<T> => typeof value === 'function' ? await (value as (request: Request) => T | Promise<T>)(request) : value

/** A path on this store: one leading slash and not a second one or a backslash (a browser reads `//host` and `/\host` as another site), and no control character (a browser drops a tab or a newline inside an address, so `/<tab>/host` is `//host`). */
// eslint-disable-next-line no-control-regex
export const STORE_PATH = /^\/(?![/\\])[^\u0000-\u001f\u007f]*$/

/** A segment that names a dot segment once its escapes are decoded, or that hides one behind an encoded slash or backslash (`..%2f`, `%2e%2e%5c`): the address parser leaves those alone, and a server or proxy that decodes `%2f` before it routes would climb with them. An encoded slash or backslash that hides no dot segment (`a%2fb`, `%5Cevil.com`) is a plain character of the path. */
const hidesClimb = (segment: string) => decode(segment).split(/[/\\]/).some(part => part === '.' || part === '..')

/**
 * A visitor-written target as a path from the store's root, or undefined when it is not a path on the store. It is resolved the way a browser resolves an address (`new URL`: `.` and `..` segments, in their percent-encoded forms and with backslashes for slashes, are applied, and the parser cannot climb above `/`) before anything is checked or prefixed, so no target can point outside the base path (final review A, I1: `?redirect=/../../client/dashboard`, `%2e%2e` and `return_to` put `Location: /p/tok/../../client/dashboard` on the wire, which a browser resolves to `/client/dashboard`). The result must still be a path on the store (`/..//host` resolves to `//host`) and hold no segment that hides a climb (`hidesClimb`). Every target a visitor writes goes through here: `redirect`, `refererPath`, `storefront_page`, `sections_url` and `X-Storefront-Page`.
 */
export function storeTarget (target: unknown): string | undefined {
  if (typeof target !== 'string' || !STORE_PATH.test(target)) return undefined
  try {
    const url = new URL(target, 'http://store.invalid')
    if (url.host !== 'store.invalid') return undefined
    const path = `${url.pathname}${url.search}${url.hash}`
    return STORE_PATH.test(path) && !url.pathname.split('/').some(hidesClimb) ? path : undefined
  } catch {
    return undefined
  }
}

/** Non-ASCII text as UTF-8 percent escapes, so a `Location` is always a valid header: a character above U+00FF makes `Headers` throw, and one below it would go out as a single non-UTF-8 byte. A lone surrogate becomes U+FFFD. */
const encodePath = (path: string) => path.replace(/[^\x21-\x7e]+/g, run => Array.from(new TextEncoder().encode(run), byte => `%${byte.toString(16).toUpperCase().padStart(2, '0')}`).join(''))

/** Whether `path` is `prefix` or starts with it as a whole segment (`/fr-ca`, `/fr-ca/cart`, `/fr-ca?x=1`, not `/fr-ca-sale`). */
const startsWithSegment = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`) || path.startsWith(`${prefix}#`)

/**
 * A redirect to a path on this store, under the request's base path and locale prefix. A target that is not a path on the store (a host, `//host`, a backslash, a control character, a dot segment that climbs out of the path, nothing) is replaced by `fallback`, so a visitor-supplied `redirect` or `return_to` cannot send anyone to another site or out of the store's base path (`storeTarget`). A target that already holds the base path keeps it once, however its segments are written (`/p/%74ok/cart`), and one that names a locale prefix of its own, the request's or another market's or language's, keeps that one, where the request's prefix is put on only a target that names none (final review A, M3: `POST /p/tok/en-ca/cart/add` with `return_to=/p/tok/products/hoodie` went to `/p/tok/en-ca/p/tok/products/hoodie`). https://shopify.dev/docs/api/ajax/reference/cart (forms redirect to the cart); the target rules are the spec's "Redirects".
 */
export function redirect (ctx: Context, target: string | null | undefined, fallback = '/'): Response {
  // the path from the store's root, with the base path taken off; a path with an empty segment after the base (`/p/tok//host`) is no path on the store
  const fromRoot = (resolved: string | undefined) => {
    const inStore = resolved === undefined ? undefined : withoutBase(ctx, resolved)
    return inStore !== undefined && STORE_PATH.test(inStore) ? inStore : undefined
  }
  const path = fromRoot(storeTarget(target)) ?? fromRoot(storeTarget(fallback)) ?? '/'
  const prefix = [ctx.routed.localePrefix, ...localePrefixes(ctx.data).map(entry => entry.prefix)].find(candidate => candidate !== '' && startsWithSegment(path, candidate))
  const root = `${ctx.basePath}${prefix === undefined ? ctx.routed.localePrefix : ''}`
  const location = root === '' ? path : `${root}${path === '/' ? '' : path}`
  return new Response(null, { status: 302, headers: { location: encodePath(location), 'cache-control': PRIVATE } })
}

/** The answers of the routes other units own, filled by `index.ts`; a route without one renders its page. */
export const ROUTE_HANDLERS: Partial<Record<Route['kind'], RouteHandler>> = {}

/** The routes that change visitor state, whatever their method: they run one at a time per visitor. */
export const mutates = (route: Route) => route.kind === 'cart' || route.kind === 'checkout' || route.kind === 'permalink' || route.kind === 'discount' || route.kind === 'storage' || route.kind === 'contact' || route.kind === 'localization' || route.kind === 'password'

/** Whether a route reads the body of its request: a `POST` to one of the routes that take a form or JSON. */
const readsBody = (route: Route, method: string) => method === 'POST' && (route.kind === 'cart' || route.kind === 'storage' || route.kind === 'contact' || route.kind === 'localization' || route.kind === 'password' || route.kind === 'shipping')

/** The page the visitor came from: its path from the store's root (the base path taken off) and its query. A sandboxed page's form posts carry no `Referer` (its document has an opaque origin, and Chrome sends none: seen on the private theme's contact form), so there the client script names the page in the post's address, `storefront_page`, and that is read first; every other request has the `Referer`. Undefined when there is none, when it is outside the base path, or when it is not an address with a path on a store: the address is the visitor's to write, so anything but a plain path (a malformed address, `//host`, a backslash) is not used. */
export function refererPath (ctx: Context): { path: string, search: string } | undefined {
  const named = ctx.sandbox ? ctx.routed.query.get('storefront_page') : null
  const referer = named ?? ctx.request.headers.get('referer')
  if (!referer) return undefined
  try {
    // the named page is a path, resolved as a redirect target is (`storeTarget`); the `Referer` is an address, and its path is resolved by the same rule
    const target = named !== null ? storeTarget(named) : undefined
    if (named !== null && target === undefined) return undefined
    const url = target !== undefined ? new URL(target, 'https://storefront.invalid') : new URL(referer)
    const pathname = storeTarget(url.pathname)
    const base = ctx.basePath
    if (pathname === undefined || (base !== '' && pathname !== base && !pathname.startsWith(`${base}/`))) return undefined
    const path = withoutBase(ctx, pathname)
    return STORE_PATH.test(path) ? { path, search: url.search } : undefined
  } catch {
    return undefined
  }
}

/** The link back from the notice page: the page the visitor came from, as the browser addresses it (base path included, no query), or the store's root. */
function backHref (ctx: Context): string {
  const came = refererPath(ctx)
  return came ? `${ctx.basePath}${came.path === '/' ? '' : came.path}` || '/' : storeRoot(ctx)
}

async function answerPage (ctx: Context): Promise<Answer> {
  const route = ctx.routed.route
  if (route.kind === 'not-found') return { response: await renderPageResponse(ctx, route.page, 404) }
  if (route.kind === 'variant-gone') return { response: new Response('', { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } }), fragment: true }
  if (route.kind === 'notice') {
    return { response: ctx.options.notice ? await ctx.options.notice(route.notice, ctx.request) : noticePage(route.notice, backHref(ctx)) }
  }
  if (route.kind !== 'page') return { response: await renderPageResponse(ctx, pageForPath(ctx, `${ctx.routed.localePrefix}/404`), 404) }
  // a page that names a resource the store lacks is the 404 page, whatever sections it was asked for
  if (!resourceExists(ctx.data, route.page)) return { response: await renderPageResponse(ctx, route.page) }
  if (route.sectionId) return { response: await renderSectionResponse(ctx, route.page, route.sectionId), fragment: true }
  if (route.sections) {
    // https://shopify.dev/docs/api/ajax/section-rendering: "up to five sections"; the parity store answers a sixth with 400 and an empty body typed `text/html; charset=utf-8` (fixture `ajax-sections-page`, step 3), and the map as `application/json; charset=utf-8` (scenario `ajax-sections-page`, step 2)
    if (route.sections.length > ctx.limits.sections) return { response: new Response(null, { status: 400, headers: { 'content-type': 'text/html; charset=utf-8' } }) }
    return { response: new Response(JSON.stringify(await renderSectionsJson(ctx, route.page, route.sections)), { headers: { 'content-type': 'application/json; charset=utf-8' } }) }
  }
  return { response: await renderPageResponse(ctx, route.page) }
}

/** The path every storefront address starts with: one leading slash, no trailing or doubled one, nothing for none. */
function cleanBase (basePath: string | undefined): string {
  const parts = (basePath ?? '').split('/').filter(Boolean)
  return parts.length ? `/${parts.join('/')}` : ''
}

/** The limits with the caller's values laid over the defaults; a limit given as `undefined` keeps its default. Every limit given must be a whole number of at least zero, and a `TypeError` here names the one that is not, where the host's bug is (final review A, M6: `body: NaN` built and made every `POST` a 500 at request time, `sections: -1` refused every `?sections=`). */
function mergeLimits (given: Partial<StorefrontLimits> | undefined): StorefrontLimits {
  const limits = { ...DEFAULT_LIMITS }
  for (const name of Object.keys(DEFAULT_LIMITS) as Array<keyof StorefrontLimits>) {
    const value = given?.[name]
    if (value !== undefined) limits[name] = checkWhole(`limits.${name}`, value)
  }
  return limits
}

/** The last step of every answer, including the error pages: it holds visitor state (or may), so it is never cached, except the files of Shopify's global assets, which hold none (`keepCache`); a `HEAD` answer has no body; the visitor's cookie, when there is one, is added. The headers are copied, so an answer whose headers are immutable (`Response.redirect`) works too. */
function finish (response: Response, head: boolean, cookie?: string, keepCache = false): Response {
  const headers = new Headers(response.headers)
  if (!keepCache) headers.set('cache-control', PRIVATE)
  if (cookie) headers.append('set-cookie', cookie)
  return new Response(head ? null : response.body, { status: response.status, statusText: response.statusText, headers })
}

/** Any origin may read a sandboxed page's answers: with `Content-Security-Policy: sandbox` the page's origin is opaque, so every request it makes to its own host is cross-origin. No credentials are allowed, so this exposes nothing a direct request would not: the token in the base path is the only key (the storefront spec's "Sandboxed pages"). */
const CORS = { 'access-control-allow-origin': '*' }
const PREFLIGHT = { ...CORS, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type, accept, x-requested-with, x-storefront-page', 'access-control-max-age': '600' }

/** The client script first in `<head>` (the storefront spec's "Sandboxed pages"), or, in a document with no `<head>`, after its `<html>` tag or its doctype, where the parser starts the head: before a doctype the script would put the page in quirks mode. HTML with none of the three is not a page (a `{% layout none %}` alternate template read with `?view=`, or JSON or text served as `text/html`): it has no head to put a script in, and the script would be its first bytes, so it is returned as it is. The tag is the first textual match, so a `<head` inside an earlier comment takes the script, and the tag ends at the first `>`; the three are found by scanning, not by one pattern over the whole page, so a long page costs one pass. */
function injectClient (html: string, basePath: string, storage: VisitorState['storage']): string {
  const opening = /<head[\s>]/i.exec(html) ?? /<html[\s>]/i.exec(html) ?? /<!doctype[\s>]/i.exec(html)
  if (!opening) return html
  const tag = `<script>${storefrontClientScript({ basePath, storage: storage ?? { local: {}, session: {} } }).replace(/<\/script/gi, '<\\/script')}</script>`
  const end = html.indexOf('>', opening.index) + 1
  return html.slice(0, end) + tag + html.slice(end)
}

/** The policy that gives a page its opaque origin and still lets its scripts and forms run (the storefront spec's "Sandboxed pages": `sandbox allow-scripts allow-forms`, since with `allow-scripts` alone the theme's add-to-cart form never reaches its own script). */
const SANDBOX_POLICY = 'sandbox allow-scripts allow-forms'

/** The last step of a sandboxed page's answer: any origin may read it, it sets no cookie (the visitor is the option's, never a cookie's), it carries the sandbox policy unless the answer has a policy of its own, and a document gets the client script. The script is added to HTML that is a document and not a redirect, a `HEAD` answer or a fragment, never to JSON. The policy is defence in depth (final review A, M5): the isolation of a theme nobody reviewed would otherwise rest on the host remembering the header on every answer. */
async function sandboxed (response: Response, basePath: string, fragment: boolean, storage: VisitorState['storage']): Promise<Response> {
  const headers = new Headers(response.headers)
  headers.delete('set-cookie')
  for (const [name, value] of Object.entries(CORS)) headers.set(name, value)
  if (!headers.has('content-security-policy')) headers.set('content-security-policy', SANDBOX_POLICY)
  const body = response.body
  const redirect = response.status >= 300 && response.status < 400
  if (body && !fragment && !redirect && (headers.get('content-type') ?? '').toLowerCase().startsWith('text/html')) {
    // the length of the page changes, and the caller's own `Content-Length` would cut it short
    headers.delete('content-length')
    return new Response(injectClient(await response.text(), basePath, storage), { status: response.status, statusText: response.statusText, headers })
  }
  return new Response(body, { status: response.status, statusText: response.statusText, headers })
}

/** The answer for a request that failed: a body that breaks a rule is the client's (400 or 413, as JSON, https://shopify.dev/docs/api/ajax/reference/cart shows `status`, `message` and `description`); anything else is ours, and shows a plain page with no detail while the error goes to `onReport`. */
function failure (error: unknown, options: StorefrontOptions, request: Request): Response {
  if (error instanceof BodyError) return Response.json({ status: error.status, message: error.status === 413 ? 'Payload Too Large' : 'Bad Request', description: error.message }, { status: error.status })
  report(options, { kind: 'error', error: asError(error) }, request)
  return errorPage()
}

/** Whether a `GET` is a browser prefetching or prerendering the page, not the visitor going to it. Chrome's `<link rel=prefetch>` and speculation rules send `Sec-Purpose: prefetch` (`prefetch;prerender` for a prerender), Safari and older Chrome `Purpose: prefetch`, and Firefox `X-Moz: prefetch` (https://developer.mozilla.org/docs/Web/HTTP/Reference/Headers/Sec-Purpose, https://developer.mozilla.org/docs/Web/HTTP/Guides/Link_prefetching_FAQ). Only a `GET` can be one, so a `POST` that names a purpose is an ordinary request. */
function prefetching (request: Request): boolean {
  if (request.method.toUpperCase() !== 'GET') return false
  return ['sec-purpose', 'purpose', 'x-moz'].some(name => (request.headers.get(name) ?? '').split(/[;,]/).some(purpose => ['prefetch', 'prerender'].includes(purpose.trim().toLowerCase())))
}

/** Whether `value` is a plain object, not an array or null. */
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Whether a stored cart is one the cart code can read: lines with a variant, a quantity and properties, a note that is text or null, attributes that are text, and discount codes that are text. */
const isCart = (cart: unknown): boolean => isRecord(cart) && Array.isArray(cart.lines) &&
  cart.lines.every(line => isRecord(line) && Number.isFinite(line.variantId) && Number.isFinite(line.quantity) && isRecord(line.properties) && (line.sellingPlanId === undefined || line.sellingPlanId === null || Number.isFinite(line.sellingPlanId))) &&
  (cart.note === undefined || cart.note === null || typeof cart.note === 'string') &&
  isRecord(cart.attributes) && Object.values(cart.attributes).every(value => typeof value === 'string') &&
  Array.isArray(cart.discountCodes) && cart.discountCodes.every(code => typeof code === 'string')

/** Whether a stored `VisitorState.storage` is two maps of text to text. */
const isStorage = (storage: unknown): boolean => isRecord(storage) && [storage.local, storage.session].every(map => isRecord(map) && Object.values(map).every(value => typeof value === 'string'))

/**
 * What the cart store returned for a visitor, as a state the storefront can use (final review A, M7). A custom `CartStore` may return anything after a schema change (a row from Postgres, say), and a state without `cart` or `cart.lines` would make every request of that visitor a 500. One that is not a `VisitorState` is replaced by an empty visitor that keeps the country, language and unlocked flag that are valid, and the problem goes to `onReport` as an `error` (the key, a credential, is not in it). The stored state is replaced when the visitor next changes it; a visitor who does not change it is repaired, and reported, on each request.
 */
function usable (stored: unknown, key: string, options: StorefrontOptions, request: Request): VisitorState {
  if (isRecord(stored) && isCart(stored.cart) &&
    (stored.country === undefined || typeof stored.country === 'string') && (stored.language === undefined || typeof stored.language === 'string') && (stored.unlocked === undefined || typeof stored.unlocked === 'boolean') && (stored.storage === undefined || isStorage(stored.storage))) return stored as unknown as VisitorState
  report(options, { kind: 'error', error: new Error('the cart store returned a visitor state that is not a VisitorState (a cart with lines, a note, attributes and discount codes): the visitor starts with an empty cart') }, request)
  const kept = isRecord(stored) ? stored : {}
  return {
    ...emptyVisitor(key),
    ...(typeof kept.country === 'string' ? { country: kept.country } : {}),
    ...(typeof kept.language === 'string' ? { language: kept.language } : {}),
    ...(kept.unlocked === true ? { unlocked: true } : {}),
    ...(isStorage(kept.storage) ? { storage: kept.storage as VisitorState['storage'] } : {})
  }
}

/**
 * The storefront: one function from a `Request` to a `Response`, for every route of the spec. Visitor state comes from the cart store, keyed by the `cart` cookie or the `visitor` option; a route that changes it runs one at a time per visitor and saves the new state. A render that throws gives a plain 500 page and an `error` report.
 */
export function createStorefront (options: StorefrontOptions): Storefront {
  const limits = mergeLimits(options.limits)
  const store = options.cartStore ?? memoryCartStore({ max: limits.visitors, maxBytes: limits.storeBytes, idleMs: limits.idleMs })
  const queue = new VisitorQueue()

  async function handle (request: Request, handleOptions: HandleOptions = {}): Promise<Response> {
    const sandbox = !!handleOptions.sandbox
    if (sandbox && !handleOptions.visitor) throw new TypeError('createStorefront: handle needs a visitor key with sandbox: true')
    const verb = request.method.toUpperCase()
    // a preflight asks what the page may send, and holds no visitor state: it is answered before anything is read (the storefront spec's "Sandboxed pages")
    if (sandbox && verb === 'OPTIONS') return new Response(null, { status: 204, headers: PREFLIGHT })
    const basePath = cleanBase(handleOptions.basePath)
    const head = verb === 'HEAD'
    // a `HEAD` and a prefetch change nothing, whatever the route does for a visitor's `GET` (final review A, M4: a prefetcher sends a `GET`, not a `HEAD`, so a prefetched `url_to_remove` or discount link changed the cart); only the `HEAD` answer has no body
    const readOnly = head || prefetching(request)
    // the visitor's storage, which a sandboxed page starts with (set once the visitor is read)
    let storage: VisitorState['storage']
    // every answer leaves through here, the error pages too
    const done = (response: Response, cookie?: string, fragment = false, keepCache = false) => {
      const finished = finish(response, head, cookie, keepCache)
      return sandbox ? sandboxed(finished, basePath, fragment, storage) : finished
    }
    try {
      const fromCookie = handleOptions.visitor ? undefined : cookieVisitor(request)
      const key = handleOptions.visitor ?? fromCookie ?? newVisitorKey()
      const theme = await resolve(options.theme, request)
      // the theme's compiled stylesheet and javascript hold no visitor state: answered before any is read, and before the data and services are resolved, which they do not need; with caching of their own, and open to a visitor who has not passed the password
      const asset = compiledAssetResponse(request, basePath, theme)
      if (asset) return sandbox ? sandboxed(asset, basePath, true, undefined) : asset
      const [given, services] = await Promise.all([resolve(options.data, request), resolve(options.services ?? {}, request)])
      // the store in the theme's languages (`StorefrontOptions.languages`); the same object for the same data and theme languages, so its views stay cached
      const data = options.languages === 'theme' ? withLanguages(given, themeLanguages(theme)) : given
      // set before any route runs, so the Ajax answers that build a view obey it as much as the pages do
      if (options.viewCacheSize !== undefined) setViewCacheSize(data, options.viewCacheSize)
      // which routes change state, and which read a body, depend only on the method and the address, so both are decided before the visitor's state is read or their turn is taken
      const first = routeRequest(request.method, request.url, data, { basePath, search: limits.search }).route
      // the files of Shopify's global assets hold no visitor's state and the gift card page loads them, so they are answered before the visitor is read and whatever the storefront password says; only a file that exists keeps its public cache
      if (first.kind === 'shopify-asset') {
        const asset = shopifyAssetResponse(first.path, request)
        return done(asset, undefined, true, asset.status === 200 || asset.status === 304)
      }
      if (first.kind === 'cloud-asset') {
        const cloud = walletsResponse(first.path)
        if (cloud) return done(cloud, undefined, true, true)
      }
      const fields = readsBody(first, verb) ? await readBody(request, limits.body) : {}
      const run = async (): Promise<Response> => {
        const given = await store.get(key)
        const stored = given === undefined ? emptyVisitor(key) : usable(given, key, options, request)
        // the token is shown, never the key itself, whatever the stored cart holds (`cartToken`)
        const visitor: VisitorState = { ...stored, cart: { ...stored.cart, token: cartToken(key, sandbox) } }
        storage = visitor.storage
        const routed = routeRequest(request.method, request.url, data, { basePath, country: visitor.country, search: limits.search })
        const view = resolveView(data, { basePath, localePrefix: routed.localePrefix, market: routed.market, language: routed.language })
        const ctx: Context = { request, options, limits, theme, data, services, routed, basePath, view, visitor, key, sandbox, fields }
        // https://shopify.dev/docs/storefronts/themes/architecture/templates/password: the password page is "shown when password protection is applied to a store". The page does not say how any other address reaches it, so sending every other address there is Debutify's reading (no recording: the parity store was recorded past its password page). The page itself is open as a page; asked for a section (`?section_id=`, `?sections=`) it is any other address, or a section of the theme would show the store's products to a visitor without the password.
        const route = routed.route
        const passwordPage = route.kind === 'password' || (route.kind === 'page' && route.page.templateName === 'password' && !route.sectionId && !route.sections)
        // https://shopify.dev/docs/storefronts/themes/architecture/templates/gift-card-liquid: Shopify hosts the gift card page "on the `checkout.shopify.com` domain", outside the storefront password, so a card the store holds opens without it (the page alone: its sections, and an address that names no card, which would show the theme's 404 page with the store's header, stay behind it)
        const giftCardPage = route.kind === 'page' && route.page.templateName === 'gift_card' && !route.sectionId && !route.sections && resourceExists(data, route.page)
        const locked = data.shop.password_enabled && !visitor.unlocked && !passwordPage && !giftCardPage
        if (locked) return done(redirect(ctx, '/password'))
        const answer = await (ROUTE_HANDLERS[routed.route.kind] ?? answerPage)(ctx)
        // a `HEAD` request changes nothing, whatever the route does for a `GET`: HTTP makes it a safe method (https://www.rfc-editor.org/rfc/rfc9110#section-9.2.1), and a link-style route such as `/discount/<code>` is a `GET` that changes the cart; a link prefetcher sends a `GET` that says so in `Sec-Purpose`, `Purpose` or `X-Moz`, which changes nothing either (`prefetching`), and sets no cookie
        if (answer.state && !readOnly) {
          storage = answer.state.storage
          await store.set(key, answer.state)
          return done(answer.response, !handleOptions.visitor && !fromCookie ? visitorCookie(key, basePath) : undefined, answer.fragment)
        }
        return done(answer.response, undefined, answer.fragment)
      }
      return readOnly || !mutates(first) ? await run() : await queue.run(key, run)
    } catch (error) {
      return done(failure(error, options, request))
    }
  }

  return { handle }
}
