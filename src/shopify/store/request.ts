import { boundQuery } from './filters'
import type { FormOutcome, PredictiveRequest, RequestInput } from './globals'
import type { MarketData, StoreData } from './types'
import { defaultCountry } from './view'

export interface PageRequest {
  templateName: string
  request: RequestInput
  /** The language the page renders in. */
  locale: string
}

export interface LocalePrefix { prefix: string, market: string, language: string }

const primaryMarket = (data: StoreData): MarketData | undefined => data.markets?.find(m => m.primary) ?? data.markets?.[0]
const shopLanguage = (data: StoreData) => data.languages?.[0]?.iso_code ?? data.shop.locale ?? 'en'

/**
 * Every locale prefix the store serves, https://shopify.dev/docs/storefronts/themes/markets/multiple-currencies-languages: the primary market's other languages at `/<language>`, and each other market at `/<language>-<subfolder>` for each of its languages.
 */
export function localePrefixes (data: StoreData): LocalePrefix[] {
  const out: LocalePrefix[] = []
  const primary = primaryMarket(data)
  for (const language of primary?.languages.slice(1) ?? (data.languages ?? []).slice(1).map(l => l.iso_code)) out.push({ prefix: `/${language}`, market: primary?.handle ?? 'default', language })
  for (const market of data.markets ?? []) {
    if (market === primary || !market.subfolder) continue
    for (const language of market.languages) out.push({ prefix: `/${language}-${market.subfolder}`, market: market.handle, language })
  }
  return out
}

// https://shopify.dev/docs/api/ajax/reference/predictive-search names the defaults: `resources[limit]` is 1 to 10 and 10 when omitted, `resources[limit_scope]` is `all` and `resources[options][unavailable_products]` is `last`; with no `resources[type]` it searches `query,product,collection,page` (the parity store agrees: no articles, fixture `ajax-suggest-json`, step 2). The page gives no default for `resources[options][fields]` (a product searches all its fields, and pages, articles and collections their titles), so the four product fields here are Debutify's choice, and no fixture pins them.
const PREDICTIVE_FIELDS = ['title', 'product_type', 'variants.title', 'vendor']
const PREDICTIVE_TYPES = ['collection', 'page', 'product', 'query']

/** A Predictive Search API request, https://shopify.dev/docs/api/ajax/reference/predictive-search. An empty `resources[limit]` reads as the default, as a missing one does. */
function predictive (params: URLSearchParams): PredictiveRequest {
  const types = params.get('resources[type]')
  const rawLimit = params.get('resources[limit]')
  const limit = rawLimit ? Number(rawLimit) : 10
  return {
    q: params.get('q') ?? '',
    types: types ? types.split(',').map(t => t.trim()).filter(Boolean) : PREDICTIVE_TYPES,
    limit: Number.isInteger(limit) ? Math.min(10, Math.max(1, limit)) : 10,
    limitScope: params.get('resources[limit_scope]') === 'each' ? 'each' : 'all',
    fields: params.get('resources[options][fields]')?.split(',').map(f => f.trim()).filter(Boolean) ?? PREDICTIVE_FIELDS,
    unavailable: unavailable(params.get('resources[options][unavailable_products]')) ?? 'last'
  }
}

function unavailable (value: string | null): 'show' | 'hide' | 'last' | undefined {
  return value === 'show' || value === 'hide' || value === 'last' ? value : undefined
}

const int = (value: string | null) => value !== null && /^\d+$/.test(value) ? Number(value) : undefined

/** `?option_values=<id>,<id>`, https://shopify.dev/docs/storefronts/themes/product-merchandising/variants/support-high-variant-products: the option value ids in it, the first ten of them (a product has at most three options), each a number; none when it names none. */
const optionValueIds = (value: string | null) => {
  const ids = (value ?? '').split(',').slice(0, 10).map(part => int(part.trim())).filter((id): id is number => id !== undefined)
  return ids.length ? ids : undefined
}

/** `?page=` counts from 1: `paginate` clamps anything lower to the first page (https://shopify.dev/docs/api/liquid/tags/paginate). */
const pageNumber = (value: string | null) => {
  const n = int(value)
  return n !== undefined && n >= 1 ? n : undefined
}

/** One path segment with its percent escapes decoded; a malformed escape leaves the segment as the address wrote it, so it names no page rather than throwing. */
function decodeSegment (segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/** The path (still encoded) after `prefix`, a path of whole segments such as `/p/tok` or `/fr-ca`, compared by decoded segment; undefined when `path` does not start with it. `/p/tok` after `/p/tok` is `/`. */
function after (path: string, prefix: string): string | undefined {
  const have = path.split('/')
  const want = prefix.split('/')
  if (want.length > have.length || want.some((segment, i) => decodeSegment(segment) !== decodeSegment(have[i]))) return undefined
  return `/${have.slice(want.length).join('/')}`
}

/**
 * The page a storefront address shows, as Shopify routes it (https://shopify.dev/docs/api/liquid/objects/routes and the templates of https://shopify.dev/docs/storefronts/themes/architecture/templates): the template, its resource and the request's query, with the base path and locale prefix taken off first. The path stays percent-encoded in `request.path`; each segment is decoded only to be matched, so `%2F` and `%2B` stay inside their segment. `/search/suggest` reads as the search template with a predictive request; an address that names no page is the `404` template.
 */
export function requestFromUrl (url: string, data: StoreData, options: { basePath?: string, country?: string, form?: FormOutcome } = {}): PageRequest {
  // an address that opens with `//` is a path, not a host
  const parsed = new URL(url.replace(/^\/{2,}/, '/'), 'https://storefront.invalid')
  const trimmedBase = (options.basePath ?? '').replace(/^\/+|\/+$/g, '')
  const basePath = trimmedBase ? `/${trimmedBase}` : ''
  // the path stays percent-encoded: a segment is decoded only to be read, so `%2F` and `%2B` stay inside their segment
  let path = parsed.pathname
  if (basePath) path = after(path, basePath) ?? path
  const primary = primaryMarket(data)
  let market = primary?.handle ?? 'default'
  let language = primary?.languages[0] ?? shopLanguage(data)
  let localePrefix = ''
  for (const entry of localePrefixes(data)) {
    const rest = after(path, entry.prefix)
    if (rest !== undefined) {
      market = entry.market
      language = entry.language
      localePrefix = entry.prefix
      path = rest
      break
    }
  }
  const params = parsed.searchParams
  // the pairs a request keeps are bounded (`boundQuery`, final review B I1): every filter and page link repeats them, and the filters are tested against every product
  const query = boundQuery([...params.entries()])
  const request: RequestInput = {
    // the path the shopper's browser shows, base path included, so `paginate` and other links built from it work under the base path; with no base path it is the path Shopify shows
    path: `${basePath}${localePrefix}${path === '/' && (basePath || localePrefix) ? '' : path}` || '/',
    query,
    basePath,
    localePrefix,
    market,
    language,
    country: countryFor(data, market, options.country),
    page: pageNumber(params.get('page')),
    view: params.get('view') ?? undefined,
    sortBy: params.get('sort_by') ?? undefined,
    variant: int(params.get('variant')),
    optionValues: optionValueIds(params.get('option_values')),
    sellingPlan: int(params.get('selling_plan')),
    filters: query.filter(([name]) => name.startsWith('filter.')),
    ...(options.form ? { form: options.form } : postedForm(params))
  }
  const rawParts = path.split('/').filter(Boolean)
  const parts = rawParts.map(decodeSegment)
  const page = (templateName: string, extra: Partial<RequestInput> = {}): PageRequest => ({ templateName, request: { ...request, ...extra }, locale: language })
  if (!parts.length) return page('index')
  const [kind, a, b, c] = parts
  // the tags of a segment: `+` joins them (https://shopify.dev/docs/storefronts/themes/navigation-search/filtering/tag-filtering for collections, https://shopify.dev/docs/storefronts/themes/architecture/templates/blog for blogs), so it splits the encoded segment, and a `%2B` stays inside its tag
  const tagsOf = (segment: string) => segment.split('+').map(t => decodeSegment(t).trim()).filter(Boolean)
  if (kind === 'products' && a && !b) return page('product', { resource: a })
  // `/variants/<id>` is no page: Shopify redirects it to `/products/<handle>?variant=<id>` and drops the rest of the query (fixture `flow-variant-route`), so the storefront router answers it (part S, Task 1) and it falls through to the 404 template here
  if (kind === 'collections' && !a) return page('list-collections')
  // `/collections/<collection>/products/<product>`, https://shopify.dev/docs/api/liquid/objects/collection: a longer address is no page
  if (kind === 'collections' && parts.length === 4 && b === 'products') return page('product', { resource: c, collection: a })
  if (kind === 'collections' && (a === 'vendors' || a === 'types') && !b) return page('collection', { resource: a, searchTerms: params.get('q') ?? '' })
  if (kind === 'collections' && a && parts.length <= 3) return page('collection', { resource: a, ...(b ? { tags: tagsOf(rawParts[2]) } : {}) })
  if (kind === 'pages' && a && !b) return page('page', { resource: a })
  // https://shopify.dev/docs/storefronts/themes/architecture/templates/gift-card-liquid hosts the page at `/gift_cards/[store_id]/[gift_card_token]`, and https://shopify.dev/docs/api/liquid/objects/gift_card#gift_card-url shows a card's `url` as that path on Shopify's checkout domain (`checkout.shopify.com`); the storefront serves the same path, and the resource is `<store_id>/<gift_card_token>` as the article's is `<blog>/<article>`
  if (kind === 'gift_cards' && parts.length === 3) return page('gift_card', { resource: `${a}/${b}` })
  // `/blogs/<blog>/tagged/<tag>[+<tag>]`, https://shopify.dev/docs/storefronts/themes/architecture/templates/blog (filter articles by tag)
  if (kind === 'blogs' && parts.length === 4 && b === 'tagged') return page('blog', { resource: a, tags: tagsOf(rawParts[3]) })
  if (kind === 'blogs' && a && b && !c) return page('article', { resource: `${a}/${b}` })
  if (kind === 'blogs' && a && !b) return page('blog', { resource: a })
  if (kind === 'search' && parts.length === 2 && a === 'suggest') return page('search', { predictive: predictive(params) })
  // https://shopify.dev/docs/api/ajax/reference/product-recommendations: answered with a section (`section_id`), so the page template does not matter; `index` gives the section the shop's globals
  if (kind === 'recommendations' && a === 'products' && !b) return page('index', { recommendations: { productId: params.get('product_id') ?? '', limit: params.get('limit'), intent: params.get('intent') } })
  if (kind === 'search' && !a) {
    const types = params.get('type')
    return page('search', {
      searchTerms: params.get('q') ?? undefined,
      search: { types: types ? types.split(',').map(t => t.trim()).filter(Boolean) : undefined, prefix: params.get('options[prefix]') === 'none' ? 'none' : params.get('options[prefix]') === 'last' ? 'last' : undefined, unavailable: unavailable(params.get('options[unavailable_products]')) }
    })
  }
  if (kind === 'cart' && !a) return page('cart')
  if (kind === 'password' && !a) return page('password')
  return page('404')
}

/** Shopify redirects a successful contact or newsletter form to the page it came from with `contact_posted=true` or `customer_posted=true` (and the form's `#contact_form` fragment), and the form then shows as posted, `form.posted_successfully?` (https://shopify.dev/docs/storefronts/themes/customer-engagement/add-contact-form, https://shopify.dev/docs/storefronts/themes/customer-engagement/email-consent and https://shopify.dev/docs/api/liquid/objects/form). shopify.dev names `form.posted_successfully?` and the `/contact#contact_form` action but not the query; the two names are Shopify's long-standing ones, not recorded: the parity store's bot challenge answers every scripted `POST /contact` with 403, so there is no `flow-contact-*` fixture. */
function postedForm (params: URLSearchParams): { form?: FormOutcome } {
  if (params.get('contact_posted') === 'true') return { form: { type: 'contact', posted: true } }
  if (params.get('customer_posted') === 'true') return { form: { type: 'customer', posted: true } }
  return {}
}

/** The shopper's country: the one they chose when it belongs to the market, otherwise the market's default country (`defaultCountry`). */
function countryFor (data: StoreData, market: string, chosen: string | undefined): string | undefined {
  const entry = data.markets?.find(m => m.handle === market)
  if (!entry) return chosen
  return chosen && entry.countries.some(c => c.iso_code === chosen) ? chosen : defaultCountry(entry)
}
