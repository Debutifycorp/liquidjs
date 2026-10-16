import { resolveView } from '../shopify'
import type { StoreData, StoreView, ThemeInput } from '../shopify'
import { BodyError, readBody } from './body'
import type { Fields } from './body'
import { storefrontClientScript } from './client'
import { errorPage, noticePage } from './html'
import { pageForPath, renderPageResponse, renderSectionResponse, renderSectionsJson, resourceExists } from './pages'
import { routeRequest } from './router'
import type { Route, Routed } from './router'
import { asError, PRIVATE, report, storeRoot, withoutBase } from './support'
import { DEFAULT_LIMITS } from './types'
import type { HandleOptions, Storefront, StorefrontLimits, StorefrontOptions, VisitorState } from './types'
import { cartToken, cookieVisitor, emptyVisitor, memoryCartStore, newVisitorKey, visitorCookie, VisitorQueue } from './visitor'

export interface Context {
  request: Request
  options: StorefrontOptions
  limits: StorefrontLimits
  theme: ThemeInput
  data: StoreData
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

/** Non-ASCII text as UTF-8 percent escapes, so a `Location` is always a valid header: a character above U+00FF makes `Headers` throw, and one below it would go out as a single non-UTF-8 byte. A lone surrogate becomes U+FFFD. */
const encodePath = (path: string) => path.replace(/[^\x21-\x7e]+/g, run => Array.from(new TextEncoder().encode(run), byte => `%${byte.toString(16).toUpperCase().padStart(2, '0')}`).join(''))

/** A redirect to a path on this store, under the request's base path and locale prefix. A target that is not a path on the store (a host, `//host`, a backslash, a control character, nothing) is replaced by `fallback`, so a visitor-supplied `redirect` or `return_to` cannot send anyone to another site. https://shopify.dev/docs/api/ajax/reference/cart (forms redirect to the cart); the target rules are the spec's "Redirects". */
export function redirect (ctx: Context, target: string | null | undefined, fallback = '/'): Response {
  const path = typeof target === 'string' && STORE_PATH.test(target) ? target : fallback
  const prefix = `${ctx.basePath}${ctx.routed.localePrefix}`
  const location = prefix && !(path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`)) ? (path === '/' ? prefix : `${prefix}${path}`) : path
  return new Response(null, { status: 302, headers: { location: encodePath(location), 'cache-control': PRIVATE } })
}

/** The answers of the routes other units own, filled by `index.ts`; a route without one renders its page. */
export const ROUTE_HANDLERS: Partial<Record<Route['kind'], RouteHandler>> = {}

/** The routes that change visitor state, whatever their method: they run one at a time per visitor. */
export const mutates = (route: Route) => route.kind === 'cart' || route.kind === 'discount' || route.kind === 'contact' || route.kind === 'localization' || route.kind === 'password'

/** Whether a route reads the body of its request: a `POST` to one of the routes that take a form or JSON. */
const readsBody = (route: Route, method: string) => method === 'POST' && (route.kind === 'cart' || route.kind === 'contact' || route.kind === 'localization' || route.kind === 'password' || route.kind === 'shipping')

/** The page the visitor came from, from the `Referer`: its path from the store's root (the base path taken off) and its query. Undefined when there is no `Referer`, when it is outside the base path, or when it is not an address with a path on a store: the address is the visitor's to write, so anything but a plain path (a malformed address, `//host`, a backslash) is not used. */
export function refererPath (ctx: Context): { path: string, search: string } | undefined {
  const referer = ctx.request.headers.get('referer')
  if (!referer) return undefined
  try {
    const url = new URL(referer)
    const base = ctx.basePath
    if (base !== '' && url.pathname !== base && !url.pathname.startsWith(`${base}/`)) return undefined
    const path = withoutBase(ctx, url.pathname)
    return STORE_PATH.test(url.pathname) && STORE_PATH.test(path) ? { path, search: url.search } : undefined
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

/** The limits with the caller's values laid over the defaults; a limit given as `undefined` keeps its default. */
function mergeLimits (given: Partial<StorefrontLimits> | undefined): StorefrontLimits {
  const limits = { ...DEFAULT_LIMITS }
  for (const name of Object.keys(DEFAULT_LIMITS) as Array<keyof StorefrontLimits>) {
    const value = given?.[name]
    if (value !== undefined) limits[name] = value
  }
  return limits
}

/** The last step of every answer, including the error pages: it holds visitor state (or may), so it is never cached; a `HEAD` answer has no body; the visitor's cookie, when there is one, is added. The headers are copied, so an answer whose headers are immutable (`Response.redirect`) works too. */
function finish (response: Response, head: boolean, cookie?: string): Response {
  const headers = new Headers(response.headers)
  headers.set('cache-control', PRIVATE)
  if (cookie) headers.append('set-cookie', cookie)
  return new Response(head ? null : response.body, { status: response.status, statusText: response.statusText, headers })
}

/** Any origin may read a sandboxed page's answers: with `Content-Security-Policy: sandbox` the page's origin is opaque, so every request it makes to its own host is cross-origin. No credentials are allowed, so this exposes nothing a direct request would not: the token in the base path is the only key (the storefront spec's "Sandboxed pages"). */
const CORS = { 'access-control-allow-origin': '*' }
const PREFLIGHT = { ...CORS, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type, accept, x-requested-with, x-storefront-page', 'access-control-max-age': '600' }

/** The client script first in `<head>` (the storefront spec's "Sandboxed pages"), or, in a document with no `<head>`, after its `<html>` tag or its doctype, where the parser starts the head: before a doctype the script would put the page in quirks mode. HTML with none of the three is not a page (a `{% layout none %}` alternate template read with `?view=`, or JSON or text served as `text/html`): it has no head to put a script in, and the script would be its first bytes, so it is returned as it is. The tag is the first textual match, so a `<head` inside an earlier comment takes the script, and the tag ends at the first `>`; the three are found by scanning, not by one pattern over the whole page, so a long page costs one pass. */
function injectClient (html: string, basePath: string): string {
  const opening = /<head[\s>]/i.exec(html) ?? /<html[\s>]/i.exec(html) ?? /<!doctype[\s>]/i.exec(html)
  if (!opening) return html
  const tag = `<script>${storefrontClientScript({ basePath }).replace(/<\/script/gi, '<\\/script')}</script>`
  const end = html.indexOf('>', opening.index) + 1
  return html.slice(0, end) + tag + html.slice(end)
}

/** The last step of a sandboxed page's answer: any origin may read it, it sets no cookie (the visitor is the option's, never a cookie's), and a document gets the client script. The script is added to HTML that is a document and not a redirect, a `HEAD` answer or a fragment, never to JSON. */
async function sandboxed (response: Response, basePath: string, fragment: boolean): Promise<Response> {
  const headers = new Headers(response.headers)
  headers.delete('set-cookie')
  for (const [name, value] of Object.entries(CORS)) headers.set(name, value)
  const body = response.body
  const redirect = response.status >= 300 && response.status < 400
  if (body && !fragment && !redirect && (headers.get('content-type') ?? '').toLowerCase().startsWith('text/html')) {
    // the length of the page changes, and the caller's own `Content-Length` would cut it short
    headers.delete('content-length')
    return new Response(injectClient(await response.text(), basePath), { status: response.status, statusText: response.statusText, headers })
  }
  return new Response(body, { status: response.status, statusText: response.statusText, headers })
}

/** The answer for a request that failed: a body that breaks a rule is the client's (400 or 413, as JSON, https://shopify.dev/docs/api/ajax/reference/cart shows `status`, `message` and `description`); anything else is ours, and shows a plain page with no detail while the error goes to `onReport`. */
function failure (error: unknown, options: StorefrontOptions, request: Request): Response {
  if (error instanceof BodyError) return Response.json({ status: error.status, message: error.status === 413 ? 'Payload Too Large' : 'Bad Request', description: error.message }, { status: error.status })
  report(options, { kind: 'error', error: asError(error) }, request)
  return errorPage()
}

/**
 * The storefront: one function from a `Request` to a `Response`, for every route of the spec. Visitor state comes from the cart store, keyed by the `cart` cookie or the `visitor` option; a route that changes it runs one at a time per visitor and saves the new state. A render that throws gives a plain 500 page and an `error` report.
 */
export function createStorefront (options: StorefrontOptions): Storefront {
  const limits = mergeLimits(options.limits)
  const store = options.cartStore ?? memoryCartStore({ max: limits.visitors, idleMs: limits.idleMs })
  const queue = new VisitorQueue()

  async function handle (request: Request, handleOptions: HandleOptions = {}): Promise<Response> {
    const sandbox = !!handleOptions.sandbox
    if (sandbox && !handleOptions.visitor) throw new TypeError('createStorefront: handle needs a visitor key with sandbox: true')
    const verb = request.method.toUpperCase()
    // a preflight asks what the page may send, and holds no visitor state: it is answered before anything is read (the storefront spec's "Sandboxed pages")
    if (sandbox && verb === 'OPTIONS') return new Response(null, { status: 204, headers: PREFLIGHT })
    const basePath = cleanBase(handleOptions.basePath)
    const head = verb === 'HEAD'
    // every answer leaves through here, the error pages too
    const done = (response: Response, cookie?: string, fragment = false) => {
      const finished = finish(response, head, cookie)
      return sandbox ? sandboxed(finished, basePath, fragment) : finished
    }
    try {
      const fromCookie = handleOptions.visitor ? undefined : cookieVisitor(request)
      const key = handleOptions.visitor ?? fromCookie ?? newVisitorKey()
      const [theme, data] = await Promise.all([resolve(options.theme, request), resolve(options.data, request)])
      // which routes change state, and which read a body, depend only on the method and the address, so both are decided before the visitor's state is read or their turn is taken
      const first = routeRequest(request.method, request.url, data, { basePath }).route
      const fields = readsBody(first, verb) ? await readBody(request, limits.body) : {}
      const run = async (): Promise<Response> => {
        const stored = (await store.get(key)) ?? emptyVisitor(key)
        // the token is shown, never the key itself, whatever the stored cart holds (`cartToken`)
        const visitor: VisitorState = { ...stored, cart: { ...stored.cart, token: cartToken(key, sandbox) } }
        const routed = routeRequest(request.method, request.url, data, { basePath, country: visitor.country })
        const view = resolveView(data, { basePath, localePrefix: routed.localePrefix, market: routed.market, language: routed.language })
        const ctx: Context = { request, options, limits, theme, data, routed, basePath, view, visitor, key, sandbox, fields }
        // https://shopify.dev/docs/storefronts/themes/architecture/templates/password: the password page is "shown when password protection is applied to a store". The page does not say how any other address reaches it, so sending every other address there is Debutify's reading (no recording: the parity store was recorded past its password page). The page itself is open as a page; asked for a section (`?section_id=`, `?sections=`) it is any other address, or a section of the theme would show the store's products to a visitor without the password.
        const route = routed.route
        const passwordPage = route.kind === 'password' || (route.kind === 'page' && route.page.templateName === 'password' && !route.sectionId && !route.sections)
        const locked = data.shop.password_enabled && !visitor.unlocked && !passwordPage
        if (locked) return done(redirect(ctx, '/password'))
        const answer = await (ROUTE_HANDLERS[routed.route.kind] ?? answerPage)(ctx)
        // a `HEAD` request changes nothing, whatever the route does for a `GET`: HTTP makes it a safe method (https://www.rfc-editor.org/rfc/rfc9110#section-9.2.1), and a link-style route such as `/discount/<code>` is a `GET` that changes the cart while a link prefetcher sends `HEAD`
        if (answer.state && !head) {
          await store.set(key, answer.state)
          return done(answer.response, !handleOptions.visitor && !fromCookie ? visitorCookie(key, basePath) : undefined, answer.fragment)
        }
        return done(answer.response, undefined, answer.fragment)
      }
      return head || !mutates(first) ? await run() : await queue.run(key, run)
    } catch (error) {
      return done(failure(error, options, request))
    }
  }

  return { handle }
}
