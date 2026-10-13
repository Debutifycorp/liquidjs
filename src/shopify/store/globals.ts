import { HandleMap } from '../objects/handle-map'
import { TemplateDrop } from '../objects/template'
import { own } from '../util/own'
import type { ReportCollector } from '../report'
import { buildLinklists, LiquidObject, StoreObjects } from './build'

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
  /** The handle of the product, collection, page or blog the template shows (`<blog>/<article>` for articles); the first one in the store when omitted. */
  resource?: string
  /** Chooses contextual section group files (`header-group.context.<market>.json`). */
  context?: { market?: string, b2b?: boolean }
  /** `search.terms` on the search template. */
  searchTerms?: string
}

/** Shopify's storefront routes for the primary locale, https://shopify.dev/docs/api/liquid/objects/routes. The paths are the ones that page lists for the default locale; a market's locale prefix is not applied. */
export const ROUTES: Record<string, string> = {
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

const RESOURCE_TYPES: Record<string, keyof StoreObjects> = { product: 'products', collection: 'collections', page: 'pages', blog: 'blogs', article: 'articles' }

const PATHS: Record<string, string> = { index: '/', cart: '/cart', search: '/search', 'list-collections': '/collections', 404: '/404', password: '/password', gift_card: '/gift_cards/sample' }

/** The path a template is served from when the caller gives none: the resource's own URL, or the storefront path of the template. shopify.dev's request page (https://shopify.dev/docs/api/liquid/objects/request) documents `path` as the page's path but not the path of each template, so the account and gift card paths here are the conventional ones and are not pinned. */
function defaultPath (pageType: string, template: TemplateDrop, resource: LiquidObject | null): string {
  if (resource) return String(resource.url)
  const known = own(PATHS, pageType)
  if (known) return known
  if (template.directory === 'customers') return template.name === 'account' ? '/account' : `/account/${template.name}`
  return `/${pageType}`
}

export interface GlobalsInput {
  store: StoreObjects
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
  /** The resolved request: path, origin and page, for the Shopify state. */
  request: { path: string, origin: string, page: number }
}

/**
 * The global objects of one page, each following its page under https://shopify.dev/docs/api/liquid/objects: `shop`, `cart`, `customer`, `localization`, `collections`, `all_products`, `pages`, `blogs`, `articles`, `linklists`, `images`, `routes`, `template`, `request` (`page_type`, `path`, `host`, `origin`, `locale`, `design_mode`, `visual_preview_mode`), `page_title`, `page_description`, `canonical_url`, `handle`, `current_page`, `current_tags`, `search`, `recommendations`, `powered_by_link`, `additional_checkout_buttons`, `content_for_additional_checkout_buttons`, `metaobjects`, and the template's resource under its own name (`product`, `collection`, `page`, `blog`, `article`; an article also sets `blog`).
 *
 * Choices shopify.dev does not pin, for the "confirm on a development store" list: `canonical_url` is the origin plus the path, with no query string or page number (the page says only that it is the canonical URL of the current page); `page_title` is the resource's title or the shop's name, without the shop-name suffix a live store adds; `powered_by_link` is empty because the link points at shopify.com, which a Debutify store does not show; `search` is empty (no search is run), `recommendations` has `performed?` false and `performed` false too (shopify.dev names only `performed?`, but liquid-spec's recorded environment of Shopify's Dawn theme holds both, and Dawn's templates read `recommendations.performed`, so a template that tests `recommendations.performed == false` takes the same branch as on a store) and `metaobjects` is empty.
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
    if (template.name === 'article' && found) resources.blog = HandleMap.get(store.blogs, String(found.url).split('/')[2]) ?? null
  }
  const resource = kind ? resources[template.name] : null
  const host = request.host ?? String(store.shop.domain)
  const origin = request.origin ?? `https://${host}`
  const path = request.path ?? defaultPath(pageType, template, resource)
  const page = request.page ?? 1
  const linklists = buildLinklists(store.linklists, path)
  const language = (store.localization.language ?? {}) as LiquidObject
  const globals: Record<string, unknown> = {
    shop: store.shop,
    settings: null,
    cart: store.cart,
    customer: store.customer,
    localization: store.localization,
    collections: store.collections,
    all_products: store.products,
    pages: store.pages,
    blogs: store.blogs,
    articles: store.articles,
    linklists,
    images: store.images,
    routes: ROUTES,
    template,
    request: {
      page_type: pageType,
      path,
      host,
      origin,
      locale: { iso_code: input.locale, name: language.name ?? input.locale, endonym_name: language.endonym_name ?? input.locale, primary: input.locale === language.iso_code, root_url: '/' },
      design_mode: false,
      visual_preview_mode: false
    },
    page_title: resource?.title ?? store.shop.name,
    page_description: (resource?.description as string | undefined) ?? store.shop.description,
    canonical_url: `${origin}${path}`,
    handle: resource?.handle ?? '',
    current_page: page,
    current_tags: null,
    search: { performed: false, results: [], results_count: 0, terms: request.searchTerms ?? '', types: ['product', 'page', 'article'], filters: [], sort_by: 'relevance', default_sort_by: 'relevance' },
    recommendations: { 'performed?': false, performed: false, products: [], products_count: 0, intent: 'related' },
    powered_by_link: '',
    additional_checkout_buttons: false,
    content_for_additional_checkout_buttons: '',
    metaobjects: {},
    ...resources
  }
  return { globals, linklists, request: { path, origin, page } }
}
