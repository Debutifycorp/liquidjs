import { resolveView } from '../shopify'
import type { StoreData, StoreView, ThemeInput } from '../shopify'
import { BodyError, readBody } from './body'
import type { Fields } from './body'
import { errorPage, noticePage } from './html'
import { pageForPath, renderPageResponse, renderSectionResponse, renderSectionsJson, resourceExists } from './pages'
import { routeRequest } from './router'
import type { Route, Routed } from './router'
import { asError, PRIVATE, report, storeRoot } from './support'
import { DEFAULT_LIMITS } from './types'
import type { HandleOptions, Storefront, StorefrontLimits, StorefrontOptions, VisitorState } from './types'
import { cookieVisitor, emptyVisitor, memoryCartStore, newVisitorKey, visitorCookie, VisitorQueue } from './visitor'

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

/** What a route answers: a response, and the visitor's new state when the route changed it. */
export interface Answer { response: Response, state?: VisitorState }

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

/** The path of the page the visitor came from, when their `Referer` names a path on a store. The address is the visitor's to write, so anything but a plain path (a malformed address, `//host`, a backslash) is not used. */
function cameFrom (request: Request): string | undefined {
  const referer = request.headers.get('referer')
  if (!referer) return undefined
  try {
    const path = new URL(referer).pathname
    return STORE_PATH.test(path) ? path : undefined
  } catch {
    return undefined
  }
}

async function answerPage (ctx: Context): Promise<Answer> {
  const route = ctx.routed.route
  if (route.kind === 'not-found') return { response: await renderPageResponse(ctx, route.page, 404) }
  if (route.kind === 'notice') {
    return { response: ctx.options.notice ? await ctx.options.notice(route.notice, ctx.request) : noticePage(route.notice, cameFrom(ctx.request) ?? storeRoot(ctx)) }
  }
  if (route.kind !== 'page') return { response: await renderPageResponse(ctx, pageForPath(ctx, `${ctx.routed.localePrefix}/404`), 404) }
  // a page that names a resource the store lacks is the 404 page, whatever sections it was asked for
  if (!resourceExists(ctx.data, route.page)) return { response: await renderPageResponse(ctx, route.page) }
  if (route.sectionId) return { response: await renderSectionResponse(ctx, route.page, route.sectionId) }
  if (route.sections) {
    // https://shopify.dev/docs/api/ajax/section-rendering: "up to five sections"; the parity store answers a sixth with 400 and an empty body (fixture `ajax-sections-page`, step 3)
    if (route.sections.length > ctx.limits.sections) return { response: new Response(null, { status: 400 }) }
    return { response: Response.json(await renderSectionsJson(ctx, route.page, route.sections)) }
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
    const basePath = cleanBase(handleOptions.basePath)
    const verb = request.method.toUpperCase()
    const head = verb === 'HEAD'
    try {
      const fromCookie = handleOptions.visitor ? undefined : cookieVisitor(request)
      const key = handleOptions.visitor ?? fromCookie ?? newVisitorKey()
      const [theme, data] = await Promise.all([resolve(options.theme, request), resolve(options.data, request)])
      // which routes change state, and which read a body, depend only on the method and the address, so both are decided before the visitor's state is read or their turn is taken
      const first = routeRequest(request.method, request.url, data, { basePath }).route
      const fields = readsBody(first, verb) ? await readBody(request, limits.body) : {}
      const run = async (): Promise<Response> => {
        const visitor = (await store.get(key)) ?? emptyVisitor(key)
        const routed = routeRequest(request.method, request.url, data, { basePath, country: visitor.country })
        const view = resolveView(data, { basePath, localePrefix: routed.localePrefix, market: routed.market, language: routed.language })
        const ctx: Context = { request, options, limits, theme, data, routed, basePath, view, visitor, key, sandbox, fields }
        // https://shopify.dev/docs/storefronts/themes/architecture/templates/password: the password page is "shown when password protection is applied to a store". The page does not say how any other address reaches it, so sending every other address there is Debutify's reading (no recording: the parity store was recorded past its password page). The page itself is open as a page; asked for a section (`?section_id=`, `?sections=`) it is any other address, or a section of the theme would show the store's products to a visitor without the password.
        const route = routed.route
        const passwordPage = route.kind === 'password' || (route.kind === 'page' && route.page.templateName === 'password' && !route.sectionId && !route.sections)
        const locked = data.shop.password_enabled && !visitor.unlocked && !passwordPage
        if (locked) return finish(redirect(ctx, '/password'), head)
        const answer = await (ROUTE_HANDLERS[routed.route.kind] ?? answerPage)(ctx)
        // a `HEAD` request changes nothing, whatever the route does for a `GET`: HTTP makes it a safe method (https://www.rfc-editor.org/rfc/rfc9110#section-9.2.1), and a link-style route such as `/discount/<code>` is a `GET` that changes the cart while a link prefetcher sends `HEAD`
        if (answer.state && !head) {
          await store.set(key, answer.state)
          return finish(answer.response, head, !handleOptions.visitor && !fromCookie ? visitorCookie(key, basePath) : undefined)
        }
        return finish(answer.response, head)
      }
      return head || !mutates(first) ? await run() : await queue.run(key, run)
    } catch (error) {
      return finish(failure(error, options, request), head)
    }
  }

  return { handle }
}
