import type { FormOutcome, PredictiveRequest, RequestInput } from './globals'
import type { MarketData, StoreData } from './types'

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

const PREDICTIVE_FIELDS = ['title', 'product_type', 'variants.title', 'vendor']
// a request with no `resources[type]` gets no articles: the parity store answers collections, pages, products and queries (fixture `ajax-suggest-json`, step 2)
const PREDICTIVE_TYPES = ['collection', 'page', 'product', 'query']

function predictive (params: URLSearchParams): PredictiveRequest {
  const types = params.get('resources[type]')
  const limit = Number(params.get('resources[limit]') ?? 10)
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

/** A path with its percent escapes decoded; a malformed escape leaves the path as the address wrote it, so it names no page rather than throwing. */
function decodePath (pathname: string): string {
  try {
    return decodeURIComponent(pathname)
  } catch {
    return pathname
  }
}

/**
 * The page a storefront address shows, as Shopify routes it (https://shopify.dev/docs/api/liquid/objects/routes and the templates of https://shopify.dev/docs/storefronts/themes/architecture/templates): the template, its resource and the request's query, with the base path and locale prefix taken off first. `/search/suggest` reads as the search template with a predictive request; an address that names no page is the `404` template.
 */
export function requestFromUrl (url: string, data: StoreData, options: { basePath?: string, country?: string, form?: FormOutcome } = {}): PageRequest {
  const parsed = new URL(url, 'https://storefront.invalid')
  const basePath = (options.basePath ?? '').replace(/\/$/, '')
  let path = decodePath(parsed.pathname)
  if (basePath && (path === basePath || path.startsWith(`${basePath}/`))) path = path.slice(basePath.length) || '/'
  const primary = primaryMarket(data)
  let market = primary?.handle ?? 'default'
  let language = primary?.languages[0] ?? shopLanguage(data)
  let localePrefix = ''
  for (const entry of localePrefixes(data)) {
    if (path === entry.prefix || path.startsWith(`${entry.prefix}/`)) {
      market = entry.market
      language = entry.language
      localePrefix = entry.prefix
      path = path.slice(entry.prefix.length) || '/'
      break
    }
  }
  const params = parsed.searchParams
  const query = [...params.entries()]
  const request: RequestInput = {
    // the path the shopper's browser shows, base path included, so `paginate` and other links built from it work under the base path; with no base path it is the path Shopify shows
    path: `${basePath}${localePrefix}${path === '/' && (basePath || localePrefix) ? '' : path}` || '/',
    query,
    basePath,
    localePrefix,
    market,
    language,
    country: countryFor(data, market, options.country),
    page: int(params.get('page')),
    view: params.get('view') ?? undefined,
    sortBy: params.get('sort_by') ?? undefined,
    variant: int(params.get('variant')),
    sellingPlan: int(params.get('selling_plan')),
    filters: query.filter(([name]) => name.startsWith('filter.')),
    ...(options.form ? { form: options.form } : postedForm(params))
  }
  const parts = path.split('/').filter(Boolean)
  const page = (templateName: string, extra: Partial<RequestInput> = {}): PageRequest => ({ templateName, request: { ...request, ...extra }, locale: language })
  if (!parts.length) return page('index')
  const [kind, a, b, c] = parts
  if (kind === 'products' && a && !b) return page('product', { resource: a })
  // `/variants/<id>` is no page: Shopify redirects it to `/products/<handle>?variant=<id>` and drops the rest of the query (fixture `flow-variant-route`), so the storefront router answers it (part S, Task 1) and it falls through to the 404 template here
  if (kind === 'collections' && !a) return page('list-collections')
  if (kind === 'collections' && b === 'products' && c) return page('product', { resource: c, collection: a })
  if (kind === 'collections' && (a === 'vendors' || a === 'types') && !b) return page('collection', { resource: a, searchTerms: params.get('q') ?? '' })
  if (kind === 'collections' && a) return page('collection', { resource: a, ...(b ? { tags: b.split('+').map(t => t.trim()).filter(Boolean) } : {}) })
  if (kind === 'pages' && a && !b) return page('page', { resource: a })
  if (kind === 'blogs' && a && b === 'tagged' && c) return page('blog', { resource: a, tags: [c] })
  if (kind === 'blogs' && a && b && !c) return page('article', { resource: `${a}/${b}` })
  if (kind === 'blogs' && a && !b) return page('blog', { resource: a })
  if (kind === 'search' && a === 'suggest') return page('search', { predictive: predictive(params) })
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

/** The shopper's country: the one they chose when it belongs to the market, otherwise the market's first country. */
function countryFor (data: StoreData, market: string, chosen: string | undefined): string | undefined {
  const entry = data.markets?.find(m => m.handle === market)
  if (!entry) return chosen
  return chosen && entry.countries.some(c => c.iso_code === chosen) ? chosen : entry.countries[0]?.iso_code
}
