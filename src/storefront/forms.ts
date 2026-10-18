import { createHash, timingSafeEqual } from 'crypto'
import { localePrefixes } from '../shopify'
import type { StoreData } from '../shopify'
import type { Fields } from './body'
import { addToCart, changeCart, clearCart, updateCart } from './cart'
import { checkoutRedirect } from './checkout'
import { redirect, refererPath, storeTarget } from './handler'
import type { Context, RouteHandler } from './handler'
import { cartErrorPage } from './html'
import { pageForPath, renderPageResponse } from './pages'
import type { Route } from './router'
import { storeRoot, withoutBase } from './support'

const digest = (text: string) => createHash('sha256').update(text).digest()

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The longest email address, RFC 5321's limit (https://www.rfc-editor.org/rfc/rfc5321#section-4.5.3.1.3: a path of 256 octets, with the angle brackets). `EMAIL` takes time quadratic in what it reads on a long run of dots, so a longer value is refused before the pattern runs. */
const EMAIL_MAX = 254

/** `path` (a path on the store, from its root, with its query) with its locale prefix taken off: the prefix, and the path that follows it (`/fr-ca?x=1` is `/fr-ca` and `/?x=1`). */
function splitLocale (data: StoreData, path: string): { prefix: string, rest: string } {
  for (const { prefix } of localePrefixes(data)) {
    if (path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`)) {
      const rest = path.slice(prefix.length)
      return { prefix, rest: rest === '' ? '/' : rest.startsWith('?') ? `/${rest}` : rest }
    }
  }
  return { prefix: '', rest: path }
}

/** The page the visitor came from, from the `Referer` (`refererPath`): its own locale prefix, which is none for a page of the primary language, and its path with query from the store's root with that prefix taken off. */
function cameFrom (ctx: Context): { prefix: string, path: string } | undefined {
  const came = refererPath(ctx)
  if (!came) return undefined
  const { prefix, rest } = splitLocale(ctx.data, `${came.path}${came.search}`)
  return { prefix, path: rest }
}

/** The same request as if it were made under another locale prefix, so `redirect` puts that prefix on the target. */
const under = (ctx: Context, localePrefix: string): Context => ({ ...ctx, routed: { ...ctx.routed, localePrefix } })

/** The `href` of a link to a page `cameFrom` found. */
const hrefOf = (ctx: Context, page: { prefix: string, path: string }) => `${ctx.basePath}${page.prefix}${page.path === '/' ? '' : page.path}` || '/'

/** The fields of a link to `GET /cart/change?id=<key>&quantity=0` (a line's `url_to_remove`): the four the change reads, from the query, so a query cannot name anything else. */
export function linkFields (query: URLSearchParams): Fields {
  const fields: Fields = {}
  for (const name of ['id', 'line', 'quantity', 'selling_plan']) {
    const value = query.get(name)
    if (value !== null) fields[name] = value
  }
  return fields
}

const OPERATIONS = { add: addToCart, change: changeCart, update: updateCart }

/**
 * The cart's form endpoints, `POST /cart/add`, `/cart/change`, `/cart/update`, `/cart/clear` and `/cart` (https://shopify.dev/docs/api/liquid/objects/routes: `cart_add_url`, `cart_change_url`, `cart_update_url`, `cart_clear_url`, and the `cart` form of https://shopify.dev/docs/api/liquid/tags/form), and the remove link `GET /cart/change?line=1&quantity=0` (a line's `url_to_remove`). They change the cart, then redirect: "each form type redirects customers to a specific page after the form submits. For example, the `product` form redirects to the cart page" (https://shopify.dev/docs/api/liquid/tags/form) unless `return_to` names another, a path on the store or `back` for the page the visitor came from. A `checkout` field, the cart form's checkout button, goes to Shopify's checkout address, `/checkouts/cn/<token>/<language>-<country>?_r=…`, which the storefront answers with its notice page (`checkoutPath`); the redirects follow fixture `ajax-cart-form-add`, whose steps 0 to 2 are the add form to `/cart`, the cart form with `checkout` to Shopify's checkout, and `GET /cart/change?line=1&quantity=0` to `/cart`. A cart error shows on its own page with Shopify's status and a link back, as the JSON endpoints answer it. A link reads the four fields the change takes, from its query (`linkFields`).
 */
export const cartForm: RouteHandler = async ctx => {
  const route = ctx.routed.route
  if (route.kind !== 'cart') throw new Error('not a cart route')
  const fields = ctx.request.method.toUpperCase() === 'POST' ? ctx.fields : linkFields(ctx.routed.query)
  const result = route.action === 'clear' ? clearCart(ctx.visitor) : OPERATIONS[route.action](ctx.visitor, fields, ctx.data, ctx.limits)
  if (!result.ok) {
    const back = cameFrom(ctx)
    return { response: cartErrorPage(result.error.status, String(result.error.body.description ?? 'The cart could not be changed.'), back ? hrefOf(ctx, back) : storeRoot(ctx)) }
  }
  const returnTo = fields.return_to
  const back = returnTo === 'back' ? cameFrom(ctx) : undefined
  const response = fields.checkout !== undefined
    ? checkoutRedirect(ctx)
    : back ? redirect(under(ctx, back.prefix), back.path, '/cart') : redirect(ctx, typeof returnTo === 'string' ? returnTo : null, '/cart')
  return { response, state: result.state }
}

/**
 * `POST /contact`, the contact form (`form_type=contact`) and the newsletter form (`form_type=customer`), https://shopify.dev/docs/storefronts/themes/customer-engagement/add-contact-form and https://shopify.dev/docs/storefronts/themes/customer-engagement/email-consent. Nothing is sent anywhere. A valid form redirects to the page it came from with `contact_posted=true` or `customer_posted=true`, which the engine reads as a posted form, and no fragment: a browser never sends one, so Shopify's server cannot name the form, and a redirect with none keeps the fragment of the form's action (RFC 9110 section 10.2.2), the form's own id (`/contact#ContactForm`); an invalid one renders that page with the form's errors (https://shopify.dev/docs/api/liquid/objects/form_errors) and status 200. Neither is recorded: Shopify's bot challenge answers a scripted `POST /contact` with 403, so there is no `flow-contact-*` fixture, and the error wording (`can't be blank`, `is invalid`) is this storefront's own.
 */
const contact: RouteHandler = async ctx => {
  const type = ctx.fields.form_type === 'customer' ? 'customer' : 'contact'
  const posted = ctx.fields.contact
  // the posted `contact[…]` values that are text, which is all a form sends
  const values: Record<string, string> = typeof posted === 'object' && posted !== null && !Array.isArray(posted)
    ? Object.fromEntries(Object.entries(posted).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    : {}
  const email = (values.email ?? '').trim()
  const errors: Record<string, string[]> = {}
  if (!email) errors.email = ["can't be blank"]
  else if (email.length > EMAIL_MAX || !EMAIL.test(email)) errors.email = ['is invalid']
  const back = cameFrom(ctx) ?? { prefix: ctx.routed.localePrefix, path: '/' }
  if (!Object.keys(errors).length) {
    const at = back.path.indexOf('?')
    const params = new URLSearchParams(at < 0 ? '' : back.path.slice(at + 1))
    // one form is posted at a time, and the engine reads `contact_posted` before `customer_posted`
    params.delete('contact_posted')
    params.delete('customer_posted')
    params.set(`${type}_posted`, 'true')
    return { response: redirect(under(ctx, back.prefix), `${at < 0 ? back.path : back.path.slice(0, at)}?${params.toString()}`) }
  }
  const page = pageForPath(ctx, `${back.prefix}${back.path}`)
  return { response: await renderPageResponse(ctx, page, 200, { type, posted: false, errors, values }) }
}

/** The locale prefix and language of `language` in the market that sells to `country`: the primary market when none does, and the market's default language when it is not offered in it (a store without markets has its languages). */
function choose (data: StoreData, country: string | undefined, language: string | undefined): { prefix: string, language: string | undefined } {
  const markets = data.markets ?? []
  const market = markets.find(m => m.countries.some(c => c.iso_code === country)) ?? markets.find(m => m.primary) ?? markets[0]
  const languages = market ? market.languages : (data.languages ?? []).map(l => l.iso_code)
  // a code in another case (`pt-br` for `pt-BR`) is the same language: Shopify's form posts the code as the theme prints it, so a hand-built link is the only way to send another case
  const asked = language === undefined ? undefined : languages.find(iso => iso.toLowerCase() === language.toLowerCase())
  const chosen = asked ?? languages[0]
  const prefix = localePrefixes(data).find(p => p.market === (market?.handle ?? 'default') && p.language === chosen)?.prefix ?? ''
  return { prefix, language: chosen }
}

/** The locale prefix of `language` in the market that sells to `country`: none for the primary market's default language. https://shopify.dev/docs/storefronts/themes/markets/multiple-currencies-languages */
export const localeTarget = (data: StoreData, country: string | undefined, language: string | undefined): string => choose(data, country, language).prefix

/**
 * `POST /localization`, https://shopify.dev/docs/api/liquid/tags/form (the `localization` form: a country selector or a language selector, with `return_to` and `_method=put`): sets the visitor's country and language, then redirects to `return_to` under the locale prefix of the new market and language, as the parity store answers it (fixtures `flow-localization-country`, which posts `country_code=CA` and is answered `302 /en-ca/pages/about`, and `flow-localization-language`, which posts `language_code=fr` with `country_code=CA` and is answered `302 /fr-ca/pages/about`). The unprefixed page that follows the country post still renders the United States: Shopify does not send a visitor from an unprefixed page to their locale prefix, so neither does this. What a post that names only one of the two keeps of the other is Debutify's reading, no fixture settles it: the fixtures post both fields, or a country alone from an English page, and cannot tell the page's language from the market's default. The page the form was on keeps its language and its country where the new market has them. A country no market sells to is not taken. `return_to` is a path on the store (a theme prints the page's `request.path`, which holds the base path and the old locale prefix, both taken off here), `back` for the page the visitor came from (shopify.dev's form page names it for every form type), or the root.
 */
const localization: RouteHandler = async ctx => {
  const sent = ctx.fields.country_code
  const given = typeof sent === 'string' && (ctx.data.markets ?? []).some(m => m.countries.some(c => c.iso_code === sent)) ? sent : undefined
  // the page the form was on: its country is the visitor's when its market has it, and its language is the prefix's
  const here = pageForPath(ctx, `${ctx.routed.localePrefix}/`).request
  const country = given ?? here.country ?? ctx.visitor.country
  // `locale_code` is the name Dawn's language selector posts (https://github.com/Shopify/dawn/blob/main/snippets/language-localization.liquid); the recorded post (`flow-localization-language`) names `language_code`, which wins when both are sent
  const asked = ctx.fields.language_code ?? ctx.fields.locale_code
  const { prefix, language } = choose(ctx.data, country, typeof asked === 'string' ? asked : here.language)
  const returnTo = ctx.fields.return_to
  const back = returnTo === 'back' ? cameFrom(ctx) : undefined
  // resolved before the base path and the locale prefix are taken off, so a `return_to` that climbs (`/p/tok/../../x`) is the store's `/x` (final review A, I1)
  const target = storeTarget(returnTo)
  const from = back ? back.path : target !== undefined ? splitLocale(ctx.data, withoutBase(ctx, target)).rest : '/'
  const state = { ...ctx.visitor, ...(country === undefined ? {} : { country }), ...(language === undefined ? {} : { language }) }
  return { response: redirect(under(ctx, prefix), from), state }
}

/** `POST /password`, https://shopify.dev/docs/storefronts/themes/architecture/templates/password: the storefront password unlocks a protected store for this visitor. A wrong one renders the password page with the form's error. The two passwords are compared as digests, so the comparison takes the same time whatever their lengths. */
const password: RouteHandler = async ctx => {
  const given = typeof ctx.fields.password === 'string' ? ctx.fields.password : ''
  const wanted = ctx.options.password ?? ''
  if (wanted !== '' && timingSafeEqual(digest(given), digest(wanted))) return { response: redirect(ctx, '/'), state: { ...ctx.visitor, unlocked: true } }
  // the error text and status follow no recording (the parity store was recorded past its password page): they are Debutify's
  const page = pageForPath(ctx, `${ctx.routed.localePrefix}/password`)
  return { response: await renderPageResponse(ctx, page, 200, { type: 'storefront_password', posted: false, errors: { password: ['Incorrect password'] } }) }
}

/** `GET /variants/<id>`: a 302 to the product page with that variant selected, and nothing of the request's query (fixture `flow-variant-route`: `/variants/43695846653974` answers `/products/hoodie?variant=43695846653974`). The router found the product (Task 1). */
const variant: RouteHandler = async ctx => {
  const route = ctx.routed.route
  if (route.kind !== 'variant') throw new Error('not a variant route')
  return { response: redirect(ctx, `/products/${route.handle}?variant=${route.variant}`) }
}

/** The handlers this unit adds, by route kind. The `cart` handler is not among them: it answers the `form` format only, and `index.ts` picks it or the Ajax unit's by the route's format. */
export const FORM_HANDLERS: Partial<Record<Route['kind'], RouteHandler>> = { contact, localization, password, variant }
