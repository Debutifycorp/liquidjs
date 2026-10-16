import { cartJson, lineKey, predictiveJson, productJson, recommendationsJson, shippingRates } from '../shopify'
import type { CartLineState, PageRequest } from '../shopify'
import type { Fields } from './body'
import { addToCart, changeCart, clearCart, updateCart } from './cart'
import type { CartResult } from './cart'
import { redirect, refererPath, STORE_PATH } from './handler'
import type { Context, RouteHandler } from './handler'
import { pageForPath, renderSectionsJson } from './pages'
import type { CartAction, Route } from './router'
import { withoutBase } from './support'
import type { VisitorState } from './types'
import { randomUUID } from 'crypto'

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store' }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: JSON_HEADERS })
/** A response with a status and no body, as the parity store answers a prepared shipping rate or a product it lacks. */
const empty = (status: number) => new Response(null, { status, headers: JSON_HEADERS })

type Item = Record<string, unknown>

/** The page a cart answer's sections render in: `sections_url`, then the `X-Storefront-Page` header, then the `Referer` path, then `/` (the spec's "Section context"). A candidate must be a path on this store (`STORE_PATH`; the spec's "Redirects": `sections_url` must start with a single `/`), and one that is not is passed over for the next. The theme sends `sections_url: window.location.pathname`, which in the sandbox includes the base path, as the header and the referer do. A path that names no locale takes the request's own, so `/en-ca/cart/add.js` without a context renders its sections in the Canadian market. https://shopify.dev/docs/api/ajax/reference/cart#bundled-section-rendering */
function contextPage (ctx: Context, fields: Fields): PageRequest {
  const given = typeof fields.sections_url === 'string' ? fields.sections_url : null
  // the first two name a path as the browser shows it, base path included; the `Referer` comes from the shared reader, which has taken the base path off (and refuses a page outside it)
  const named = [given, ctx.request.headers.get('x-storefront-page')].find((candidate): candidate is string => candidate !== null && STORE_PATH.test(candidate))
  const path = named !== undefined ? withoutBase(ctx, named) : refererPath(ctx)?.path ?? '/'
  const page = pageForPath(ctx, path)
  const prefix = ctx.routed.localePrefix
  return page.request.localePrefix || !prefix ? page : pageForPath(ctx, `${prefix}${path === '/' ? '' : path}`)
}

/** The ids `sections` names, from a comma-separated string or an array of strings: trimmed, without blanks or repeats. Reading stops at the first id past the limit, so a long list of ids costs no more than a short one; a long run of blanks is read to its end, within the body limit. */
function sectionIds (raw: unknown, limit: number): string[] {
  const ids = new Set<string>()
  const read = (id: unknown) => {
    if (typeof id !== 'string') return
    const trimmed = id.trim()
    if (trimmed) ids.add(trimmed)
  }
  if (typeof raw === 'string') {
    for (let from = 0; from <= raw.length && ids.size <= limit;) {
      const comma = raw.indexOf(',', from)
      read(raw.slice(from, comma < 0 ? undefined : comma))
      from = comma < 0 ? raw.length + 1 : comma + 1
    }
  } else if (Array.isArray(raw)) {
    for (const id of raw) {
      read(id)
      if (ids.size > limit) break
    }
  }
  return [...ids]
}

/** The sections a cart answer bundles: `sections` as a comma-separated string or an array, rendered after the change, with the new cart. More than `limits.sections` are not an error here: the parity store answers a cart change that asks for six sections with 200, the change made, and `"sections": null` (fixture `ajax-cart-errors`, step 6; the recording cannot tell whether the count or the absence of sections `a` to `f` from its theme made it `null`, and this follows the count). `undefined` when the request asked for none. */
export async function sectionsFor (ctx: Context, fields: Fields, state: VisitorState): Promise<Record<string, string | null> | null | undefined> {
  const ids = sectionIds(fields.sections, ctx.limits.sections)
  if (!ids.length) return undefined
  if (ids.length > ctx.limits.sections) return null
  return renderSectionsJson({ ...ctx, visitor: state }, contextPage(ctx, fields), ids)
}

/** The last item of each key: when the cart splits a line in two (a Buy X Get Y discount), the parity store names the line by its key and answers the later of the two (fixture `ajax-discount-automatic-bxgy`, step 0: an add of two answers one item, the discounted one). */
function itemsByKey (items: Item[]): Map<string, Item> {
  return new Map(items.map(item => [String(item.key), item]))
}

/** How many of each line key the cart holds. */
function quantities (lines: CartLineState[]): Map<string, number> {
  const held = new Map<string, number>()
  for (const line of lines) held.set(lineKey(line), (held.get(lineKey(line)) ?? 0) + line.quantity)
  return held
}

/** The lines of `after` that hold more than they did in `before`, in the order of `after`, with the difference; a line `before` lacked grew by its whole quantity. */
function grown (before: CartLineState[], after: CartLineState[]): Array<{ line: CartLineState, by: number }> {
  const held = quantities(before)
  return after.flatMap(line => line.quantity > (held.get(lineKey(line)) ?? 0) ? [{ line, by: line.quantity - (held.get(lineKey(line)) ?? 0) }] : [])
}

/** The lines of `before` that hold more than they do in `after`, in the order of `before`, with the difference: growth read the other way round. */
const shrunk = (before: CartLineState[], after: CartLineState[]) => grown(after, before)

/** A line's address without its `selling_plan` parameter: the entries of the change lists name the variant alone (fixture `ajax-cart-session`, step 6: `/products/slides?variant=43695710371862` for the line `/cart.js` addresses with `selling_plan=71001`). */
function withoutPlan (url: string): string {
  const [path, query = ''] = url.split('?')
  const rest = query.split('&').filter(param => param !== '' && !param.startsWith('selling_plan='))
  return rest.length ? `${path}?${rest.join('&')}` : path
}

/** One entry of `items_added` or `items_removed`, as the parity store prints it (fixtures `ajax-cart-session`, steps 6 and 7, and `ajax-cart-sections`, step 1): the line's item with its `title` as both titles, the price as a string, a fresh `id`, and the difference as `quantity`. */
function changeEntry (item: Item, quantity: number): Item {
  const presentment = Number(item.presentment_price)
  const variantTitle = item.untranslated_variant_title
  return {
    product_id: item.product_id,
    variant_id: item.variant_id,
    id: randomUUID(),
    image: item.image,
    price: presentment.toFixed(2),
    presentment_price: presentment,
    quantity,
    title: item.title,
    product_title: item.title,
    variant_title: item.variant_title,
    vendor: item.vendor,
    product_type: item.product_type,
    sku: item.sku,
    url: withoutPlan(String(item.url)),
    untranslated_product_title: variantTitle ? `${String(item.untranslated_product_title)} - ${String(variantTitle)}` : item.untranslated_product_title,
    untranslated_variant_title: variantTitle,
    view_key: item.key
  }
}

/** What `change.js` adds to the cart answer: `items_added` for the line that grew and `items_removed` for the line that shrank (or went), each with the difference as `quantity`. The parity store lists one entry for a variant id that names two lines it changed, `items_added` holding 3 where one line grew by 3 and the other by 1 (fixture `ajax-cart-session`, step 7), so the first line of each direction is the entry. `items_removed` is `[]` in every recording and is built the way `items_added` is (the line that fell, the difference): no recording has a line that shrank. A change of properties or selling plan changes the line's key, so the old line is in `items_removed` and the new one in `items_added` with its whole quantity; that is unrecorded too. */
function changeLists (ctx: Context, before: VisitorState, after: VisitorState, items: Item[]): { items_added: Item[], items_removed: Item[] } {
  const [more] = grown(before.cart.lines, after.cart.lines)
  const [fewer] = shrunk(before.cart.lines, after.cart.lines)
  const added = more ? itemsByKey(items).get(lineKey(more.line)) : undefined
  // a line that went is no longer in the new cart, so its item is read from the old one
  const gone = fewer ? itemsByKey(cartJson(ctx.data, before.cart, ctx.view, 'change').items as Item[]).get(lineKey(fewer.line)) : undefined
  return { items_added: more && added ? [changeEntry(added, more.by)] : [], items_removed: fewer && gone ? [changeEntry(gone, fewer.by)] : [] }
}

/** What `update.js` adds to the cart answer: `items_changelog.added`, the variants whose quantity grew with the growth (fixture `ajax-cart-session`, step 8: a variant the update brought into the cart; step 9: `added` is `[]` when every quantity fell). Whether a quantity that rose on a line already in the cart is listed is not recorded: it is listed here, as `items_added` lists the same growth. */
function changelog (before: VisitorState, after: VisitorState): { items_changelog: { added: Array<{ variant_id: number, quantity: number }> } } {
  const byVariant = new Map<number, number>()
  for (const { line, by } of grown(before.cart.lines, after.cart.lines)) byVariant.set(line.variantId, (byVariant.get(line.variantId) ?? 0) + by)
  return { items_changelog: { added: [...byVariant].map(([variantId, quantity]) => ({ variant_id: variantId, quantity })) } }
}

/** The answer of `add.js`: the lines the request reached, in the order of the request (fixture `ajax-discount-codes`, step 0, where the cart lists them in reverse), as `{ items }` when the request sent `items` (every recording does, and every example on https://shopify.dev/docs/api/ajax/reference/cart#post-locale-cart-add-js answers so) and as the line itself when it sent one `id`: that is the brief's choice, which no recording or shopify.dev example shows. */
function addAnswer (fields: Fields, lines: CartLineState[], items: Item[]): Item {
  const byKey = itemsByKey(items)
  const keys = [...new Set(lines.map(lineKey))]
  const added = keys.flatMap(key => byKey.has(key) ? [byKey.get(key) as Item] : [])
  return Array.isArray(fields.items) ? { items: added } : added[0] ?? {}
}

const OPS = { add: addToCart, change: changeCart, update: updateCart }

/** The body of a cart answer: what `add.js` added, or the cart with what `change.js` and `update.js` list beside it. */
function answerBody (ctx: Context, action: CartAction, fields: Fields, result: Extract<CartResult, { ok: true }>): Item {
  const cart = cartJson(ctx.data, result.state.cart, ctx.view, 'change')
  switch (action) {
    case 'add': return addAnswer(fields, result.lines, cart.items as Item[])
    case 'change': return { ...cart, ...changeLists(ctx, ctx.visitor, result.state, cart.items as Item[]) }
    case 'update': return { ...cart, ...changelog(ctx.visitor, result.state) }
    default: return cart
  }
}

/**
 * `POST /cart/<action>.js`, https://shopify.dev/docs/api/ajax/reference/cart; the form spellings (`/cart/add`, the remove link) are the forms unit's. `add.js` answers the added lines, the others the cart; `change.js` also lists the lines that grew and shrank, and `update.js` the variants that grew; all hold the bundled sections when the request asked for them. The cart's lines are in the `change` form, which the add, change, update and clear answers print (`cartJson`). A `GET` of `/cart/change` (a line's remove link) is the forms unit's.
 */
const cartOps: RouteHandler = async ctx => {
  const route = ctx.routed.route
  if (route.kind !== 'cart') throw new Error('not a cart route')
  const result: CartResult = route.action === 'clear' ? clearCart(ctx.visitor) : OPS[route.action](ctx.visitor, ctx.fields, ctx.data, ctx.limits)
  if (!result.ok) return { response: json(result.error.body, result.error.status) }
  const body = answerBody(ctx, route.action, ctx.fields, result)
  const sections = await sectionsFor(ctx, ctx.fields, result.state)
  return { response: json(sections === undefined ? body : { ...body, sections }), state: result.state }
}

/** `GET /cart.js`: the cart. */
const cartGet: RouteHandler = async ctx => ({ response: json(cartJson(ctx.data, ctx.visitor.cart, ctx.view)) })

/** `GET /discount/<code>?redirect=<path>`: adds the code to the visitor's cart (once: the same code in any case is moved last), then redirects (default `/`, and `redirect` must be a path on the store), as https://help.shopify.com/en/manual/discounts/discount-methods/discount-links describes discount links; the recorder followed the redirect to `/cart.js`, which showed the code applied (fixture `ajax-discount-codes`, step 13). A cart holds at most `limits.properties` codes of `limits.propertyLength` characters, as `update.js` holds them (the oldest goes first), and a blank or longer code is not added: the link still redirects, as a code that does not exist does on Shopify. */
const discount: RouteHandler = async ctx => {
  const route = ctx.routed.route
  if (route.kind !== 'discount') throw new Error('not a discount route')
  const code = route.code.trim()
  const response = redirect(ctx, route.redirect)
  if (!code || code.length > ctx.limits.propertyLength) return { response }
  const others = ctx.visitor.cart.discountCodes.filter(held => held.toUpperCase() !== code.toUpperCase())
  const discountCodes = [...others, code].slice(-ctx.limits.properties)
  return { response, state: { ...ctx.visitor, cart: { ...ctx.visitor.cart, discountCodes } } }
}

/** One part of `shipping_address[…]`, as long as a cart attribute may be. */
const part = (ctx: Context, name: string) => ctx.routed.query.get(`shipping_address[${name}]`)?.slice(0, ctx.limits.propertyLength)

/** `prepare_shipping_rates.json`, `async_shipping_rates.json` and `shipping_rates.json` (https://shopify.dev/docs/api/ajax/reference/cart: the shipping rates endpoints). The rates are computed on the cart as it is when they are asked for, so `prepare` answers 202 with an empty body, as the parity store does (fixture `ajax-shipping-rates`, steps 1, 3 and 5), and `async` answers the rates on the first poll (200). An address no zone covers answers the error object with status 422 (step 9). */
const shipping: RouteHandler = async ctx => {
  const route = ctx.routed.route
  if (route.kind !== 'shipping') throw new Error('not a shipping route')
  if (route.action === 'prepare') return { response: empty(202) }
  const rates = shippingRates(ctx.data, ctx.visitor.cart, { country: part(ctx, 'country'), province: part(ctx, 'province'), zip: part(ctx, 'zip') }, ctx.view)
  return { response: json(rates, 'shipping_rates' in rates ? 200 : 422) }
}

/** `GET /products/<handle>.js`. An unknown product answers 404 with an empty body, not the theme's page (fixture `ajax-product-js`, step 2). */
const product: RouteHandler = async ctx => {
  const route = ctx.routed.route
  if (route.kind !== 'product-json') throw new Error('not a product route')
  const found = productJson(ctx.data, route.handle, ctx.view)
  return { response: found ? json(found) : empty(404) }
}

/** `GET /search/suggest.json`; the terms are cut to `limits.search` characters. */
const suggest: RouteHandler = async ctx => {
  const route = ctx.routed.route
  if (route.kind !== 'suggest-json') throw new Error('not a suggest route')
  const request = route.page.request.predictive
  if (!request) throw new Error('not a predictive search')
  return { response: json(predictiveJson(ctx.data, { ...request, q: request.q.slice(0, ctx.limits.search) }, ctx.view)) }
}

/** `GET /recommendations/products.json`, with the errors https://shopify.dev/docs/api/ajax/reference/product-recommendations lists: 422 for a missing `product_id`, 404 for a product the store lacks, and 422 for an `intent` that is not `related` or `complementary` (the engine answers none of these with an error; the recording, fixture `ajax-recommendations-json`, has none either). The products in the visitor's cart are left out, as they are on the `section_id` path (https://shopify.dev/docs/storefronts/themes/product-merchandising/recommendations/related-products lists the products in the cart among the left-out ones). */
const recommendations: RouteHandler = async ctx => {
  const route = ctx.routed.route
  if (route.kind !== 'recommendations-json') throw new Error('not a recommendations route')
  const request = route.page.request.recommendations
  if (!request) throw new Error('not a recommendations request')
  const id = String(request.productId)
  const error = (status: number, message: string, description: string) => json({ status, message, description }, status)
  if (id === '') return { response: error(422, 'Invalid parameter error', 'A product_id value is missing') }
  if (!(ctx.data.products ?? []).some(candidate => String(candidate.id) === id)) return { response: error(404, 'Product not found', `No product with id ${id.slice(0, ctx.limits.propertyLength)} is published in the online store`) }
  if (request.intent && request.intent !== 'related' && request.intent !== 'complementary') return { response: error(422, 'Invalid parameter error', 'The intent parameter must be one of related, complementary') }
  return { response: json(recommendationsJson(ctx.data, request, ctx.view, ctx.visitor.cart)) }
}

/** The handlers this unit adds, by route kind; `cart` answers the `.js` format; `index.ts` sends the form format to the forms unit. */
export const AJAX_HANDLERS: Partial<Record<Route['kind'], RouteHandler>> = { 'cart-json': cartGet, cart: cartOps, discount, shipping, 'product-json': product, 'suggest-json': suggest, 'recommendations-json': recommendations }
