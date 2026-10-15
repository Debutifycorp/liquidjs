import { HandleMap } from '../objects/handle-map'
import { TemplateDrop } from '../objects/template'
import { own } from '../util/own'
import type { ReportCollector } from '../report'
import { buildLinklists, LiquidObject, StoreObjects } from './build'
import { alternatesOf, buildLocalization, languageIn } from './markets'
import { buildRecommendations, RecommendationsRequest } from './recommendations'
import { buildSearch } from './search'
import type { StoreData } from './types'
import { resolveView, withoutPrefix, withPrefix } from './view'
import type { StoreView } from './view'
import { sampleStoreData } from '../sample/sample-data'

export interface PredictiveRequest {
  q: string
  types: string[]
  limit: number
  limitScope: 'all' | 'each'
  fields: string[]
  unavailable: 'show' | 'hide' | 'last'
}

export interface FormOutcome {
  type: string
  posted: boolean
  /** By field, as `form.errors` reads them. https://shopify.dev/docs/api/liquid/objects/form_errors */
  errors?: Record<string, string[]>
  values?: Record<string, string>
}

/** What the caller says about the request being rendered. Everything is optional; defaults follow from the template and the shop. */
export interface RequestInput {
  /** Defaults to the resource's URL for the template (`/products/<handle>`), `/` for `index`. */
  path?: string
  /** Defaults to the shop's domain. */
  host?: string
  /** Defaults to `https://<host>`. */
  origin?: string
  /** `?page=` for `paginate`. */
  page?: number
  /** The handle of the product, collection, page or blog the template shows (`<blog>/<article>` for articles), or the name (`#1001`), number or id of the customer's order on `customers/order`; the first one in the store, or the customer's first order, when omitted. */
  resource?: string
  /** Chooses contextual section group files (`header-group.context.<market>.json`). */
  context?: { market?: string, b2b?: boolean }
  /** `search.terms` on the search template. */
  searchTerms?: string
  /** A Product Recommendations API request (`/recommendations/products?product_id=…&limit=…&intent=…`), which renders `recommendations` for that product (`buildRecommendations`). */
  recommendations?: RecommendationsRequest
  /** Every query pair of the address, in order. Debutify's: the request object (https://shopify.dev/docs/api/liquid/objects/request) has no query, so this only keeps what the address said. */
  query?: Array<[string, string]>
  /** `?variant=`: the variant `product.selected_variant` names. https://shopify.dev/docs/api/liquid/objects/product#product-selected_variant */
  variant?: number
  /** `?selling_plan=`. https://shopify.dev/docs/api/liquid/objects/product#product-selected_selling_plan */
  sellingPlan?: number
  /** `?view=`: the alternate template suffix. https://shopify.dev/docs/storefronts/themes/architecture/templates/alternate-templates */
  view?: string
  /** `?sort_by=`. https://shopify.dev/docs/api/liquid/objects/collection#collection-sort_by */
  sortBy?: string
  /** The `filter.*` pairs. https://shopify.dev/docs/storefronts/themes/navigation-search/filtering/storefront-filtering */
  filters?: Array<[string, string]>
  /** The tags of `/collections/<handle>/<tag>+<tag>` (https://shopify.dev/docs/storefronts/themes/navigation-search/filtering/tag-filtering) or `/blogs/<handle>/tagged/<tag>+<tag>` (https://shopify.dev/docs/storefronts/themes/architecture/templates/blog). */
  tags?: string[]
  /** The search page's `type` and `options[...]`. https://shopify.dev/docs/storefronts/themes/navigation-search/search */
  search?: { types?: string[], prefix?: 'last' | 'none', unavailable?: 'show' | 'hide' | 'last' }
  /** A Predictive Search API request. https://shopify.dev/docs/api/ajax/reference/predictive-search */
  predictive?: PredictiveRequest
  /** The outcome of the form posted before this page, for the `form` tag. */
  form?: FormOutcome
  /** The path every URL starts with (`/p/<token>`); empty when omitted. Debutify's: a store served under a path of its own, which shopify.dev does not describe. */
  basePath?: string
  /** The market and language prefix after the base path (`/fr-ca`); empty for the primary market's default language. */
  localePrefix?: string
  /** The handle of the market the address belongs to, and its language: https://shopify.dev/docs/storefronts/themes/markets/multiple-currencies-languages */
  market?: string
  language?: string
  /** The shopper's country, ISO code. */
  country?: string
  /** The collection of `/collections/<handle>/products/<product>`, which Shopify sets as the `collection` global on that product page. */
  collection?: string
}

/** The route paths of the primary locale, https://shopify.dev/docs/api/liquid/objects/routes lists them for the default locale. */
const BASE_ROUTES: Readonly<Record<string, string>> = {
  root_url: '/',
  account_url: '/account',
  account_login_url: '/account/login',
  account_logout_url: '/account/logout',
  account_register_url: '/account/register',
  account_recover_url: '/account/recover',
  account_addresses_url: '/account/addresses',
  account_profile_url: '/account/profile',
  collections_url: '/collections',
  all_products_collection_url: '/collections/all',
  search_url: '/search',
  predictive_search_url: '/search/suggest',
  cart_url: '/cart',
  cart_add_url: '/cart/add',
  cart_change_url: '/cart/change',
  cart_clear_url: '/cart/clear',
  cart_update_url: '/cart/update',
  product_recommendations_url: '/recommendations/products',
  storefront_login_url: '/account/login'
}

/**
 * Shopify's storefront routes under `prefix` (the view's base path, then its locale prefix), https://shopify.dev/docs/api/liquid/objects/routes. Under a locale prefix the parity store prints every route with the prefix before it (fixtures `probe-page-en-ca`, `probe-page-fr-ca` and `probe-page-fr-eu`, where shopify.dev lists only the default locale's paths), and its `root_url` as the bare prefix with no trailing slash (`/fr-ca`), or `/` with no prefix (fixtures `probe-page-fr-ca` and `probe-page-home`).
 *
 * The fixtures print `account_login_url` as an address on the store's own domain (`customer_authentication/redirect`, new customer accounts); customer accounts are out of scope for item 22, so it stays `<prefix>/account/login`, which is where the engine's customer templates are.
 */
export function buildRoutes (prefix: string): Readonly<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const [name, path] of Object.entries(BASE_ROUTES)) out[name] = withPrefix(prefix, path)
  return Object.freeze(out)
}

/** The routes of an unprefixed store (`buildRoutes('')`). */
export const ROUTES: Readonly<Record<string, string>> = buildRoutes('')

const RESOURCE_TYPES: Record<string, keyof StoreObjects> = { product: 'products', collection: 'collections', page: 'pages', blog: 'blogs', article: 'articles' }

const PATHS: Record<string, string> = { index: '/', cart: '/cart', search: '/search', 'list-collections': '/collections', 404: '/404', password: '/password', gift_card: '/gift_cards/sample' }

/** The path a template is served from when the caller gives none: the resource's own URL (already under the view's prefix), or the storefront path of the template under `prefix`. shopify.dev's request page (https://shopify.dev/docs/api/liquid/objects/request) documents `path` as the page's path but not the path of each template, so the account and gift card paths here are the conventional ones and are not pinned. */
function defaultPath (pageType: string, template: TemplateDrop, resource: LiquidObject | null, prefix: string): string {
  if (resource) return String(resource.url)
  const known = own(PATHS, pageType)
  if (known) return withPrefix(prefix, known)
  if (template.directory === 'customers') return withPrefix(prefix, template.name === 'account' ? '/account' : `/account/${template.name}`)
  return withPrefix(prefix, `/${pageType}`)
}

/** The customer's order the `customers/order` template shows: the one `resource` names by its name, number or id, or the first one; nil when the customer has none, and nil and reported when `resource` names none of them. https://shopify.dev/docs/api/liquid/objects/order */
function orderFor (customer: LiquidObject | null, resource: string | undefined, report: ReportCollector): LiquidObject | null {
  const orders = (customer?.orders as LiquidObject[] | undefined) ?? []
  if (resource === undefined) return orders[0] ?? null
  const found = orders.find(order => order.name === resource || String(order.order_number) === resource || String(order.id) === resource)
  if (!found) report.missing('resource', `order ${resource}`)
  return found ?? null
}

export interface GlobalsInput {
  store: StoreObjects
  /** The data `store` was built from, which the view (market, language and prefix) is resolved against with the request; the sample store's when omitted, as the runtime does. */
  data?: StoreData
  templateName: string
  request: RequestInput
  locale: string
  report: ReportCollector
}

export interface PageGlobals {
  /** Every global but `settings`, which the caller resolves with `linklists` and sets. */
  globals: Record<string, unknown>
  /** The request's menus, with `active` and `current` set for its path. */
  linklists: HandleMap<LiquidObject>
  /** The resolved request: path, origin and page, for the Shopify state, with the `hreflang` links of its page (`content_for_header`). */
  request: { path: string, origin: string, page: number, prefix: string, alternates: Array<{ hreflang: string, path: string }> }
}

/**
 * The global objects of one page, each following its page under https://shopify.dev/docs/api/liquid/objects: `shop`, `cart`, `customer`, `localization`, `collections`, `all_products`, `pages`, `blogs`, `articles`, `linklists`, `images`, `routes`, `template`, `request` (`page_type`, `path`, `host`, `origin`, `locale`, `design_mode`, `visual_preview_mode`), `page_title`, `page_description`, `canonical_url`, `handle`, `current_page`, `current_tags`, `search`, `recommendations`, `powered_by_link`, `additional_checkout_buttons`, `content_for_additional_checkout_buttons`, `metaobjects`, `country_option_tags`, `all_country_option_tags`, `gift_card` on the `gift_card` template (https://shopify.dev/docs/api/liquid/objects/gift_card, nil when the store data issues none), `order` on the `customers/order` template (https://shopify.dev/docs/api/liquid/objects/order, the customer's order `orderFor` picks), and the template's resource under its own name (`product`, `collection`, `page`, `blog`, `article`; an article also sets `blog`).
 *
 * Choices shopify.dev does not pin, for the "confirm on a development store" list: `canonical_url` is the origin plus the path, with no query string or page number (the page says only that it is the canonical URL of the current page); `page_title` is the resource's title or the shop's name, without the shop-name suffix a live store adds; `powered_by_link` is empty because the link points at shopify.com, which a Debutify store does not show; `search` runs only when the request has `searchTerms` (`buildSearch`, whose matching is Debutify's), `recommendations` is performed only for a request's `recommendations` (`buildRecommendations`, whose related products are Debutify's) and carries `performed` beside `performed?` (shopify.dev names only `performed?`, but liquid-spec's recorded Shopify environments hold both, so a template that reads `recommendations.performed` takes the same branch as on a store), and `metaobjects` is empty.
 */
export function buildGlobals (input: GlobalsInput): PageGlobals {
  const { store, request, report } = input
  const template = new TemplateDrop(input.templateName)
  const pageType = template.directory ? `${template.directory}/${template.name}` : template.name
  const resources: Record<string, LiquidObject | null> = {}
  const kind = own(RESOURCE_TYPES, template.name)
  if (kind) {
    const map = store[kind] as HandleMap<LiquidObject>
    const found = request.resource ? HandleMap.get(map, request.resource) : HandleMap.values(map)[0]
    if (request.resource && !found) report.missing('resource', `${template.name} ${request.resource}`)
    resources[template.name] = found ?? null
    // the article's blog is the one that lists it (the article objects are the same in `store.articles` and in its blog's `articles`); its URL is no help, as a base path or locale prefix adds segments before the blog's
    if (template.name === 'article' && found) resources.blog = HandleMap.values(store.blogs).find(blog => (blog.articles as LiquidObject[]).includes(found)) ?? null
  }
  const resource = kind ? resources[template.name] : null
  const host = request.host ?? String(store.shop.domain)
  const origin = request.origin ?? `https://${host}`
  const data = input.data ?? sampleStoreData
  const view = resolveView(data, request)
  const path = request.path ?? defaultPath(pageType, template, resource, view.prefix)
  const page = request.page ?? 1
  const linklists = buildLinklists(store.linklists, path, view.prefix)
  // the shopper's country is per request, so a request that names another country than the view's default gets its own localization
  const localization = request.country && request.country !== (store.localization.country as LiquidObject | null)?.iso_code ? buildLocalization(data, view, request.country) : store.localization
  const globals: Record<string, unknown> = {
    shop: store.shop,
    settings: null,
    cart: store.cart,
    customer: store.customer,
    localization,
    collections: store.collections,
    all_products: store.products,
    pages: store.pages,
    blogs: store.blogs,
    articles: store.articles,
    linklists,
    images: store.images,
    routes: view.prefix ? buildRoutes(view.prefix) : ROUTES,
    template,
    request: {
      page_type: pageType,
      path,
      host,
      origin,
      // https://shopify.dev/docs/api/liquid/objects/request: `locale` is the language the page is shown in, a shop_locale (https://shopify.dev/docs/api/liquid/objects/shop_locale), with the view's root as its `root_url` (fixtures `probe-page-home`, `probe-page-en-ca` and `probe-page-fr-ca`)
      locale: { ...languageIn(data, view, input.locale), root_url: view.prefix || '/' },
      design_mode: false,
      visual_preview_mode: false
    },
    page_title: resource?.title ?? store.shop.name,
    page_description: (resource?.description as string | undefined) ?? store.shop.description,
    canonical_url: `${origin}${path}`,
    handle: resource?.handle ?? '',
    current_page: page,
    current_tags: null,
    search: buildSearch(store, request.searchTerms, view.prefix),
    recommendations: buildRecommendations(store, request.recommendations, report),
    powered_by_link: '',
    additional_checkout_buttons: false,
    content_for_additional_checkout_buttons: '',
    metaobjects: {},
    country_option_tags: store.country_option_tags,
    all_country_option_tags: store.all_country_option_tags,
    ...(pageType === 'gift_card' ? { gift_card: store.gift_card } : {}),
    ...(pageType === 'customers/order' ? { order: orderFor(store.customer, request.resource, report) } : {}),
    ...resources
  }
  return { globals, linklists, request: { path, origin, page, prefix: view.prefix, alternates: pageType === '404' ? [] : alternates(data, view, path, request.searchTerms, pageType) } }
}

/**
 * The `hreflang` links of the page at `path` (`content_for_header`): the page in each market and language of `alternatesOf`, with its path taken from the view's prefix and put under that one's. https://shopify.dev/docs/storefronts/themes/seo/hreflang says they "stay in sync with each page's canonical URL", and the parity store's recorded pages have them without the query of a variant (`?variant=`), a filter or a sort, with a search's `?q=` (its recordings `page-product-variant`, `page-collection-filtered` and `page-search`, which are not among the fork's fixtures), and none on the 404 page (recording `page-not-found`).
 */
function alternates (data: StoreData, view: StoreView, path: string, searchTerms: string | undefined, pageType: string): Array<{ hreflang: string, path: string }> {
  const bare = withoutPrefix(view.prefix, path).split(/[?#]/)[0]
  const query = pageType === 'search' && searchTerms ? `?${new URLSearchParams({ q: searchTerms })}` : ''
  return alternatesOf(data, view).map(({ hreflang, prefix }) => ({ hreflang, path: `${withPrefix(prefix, bare)}${query}` }))
}
