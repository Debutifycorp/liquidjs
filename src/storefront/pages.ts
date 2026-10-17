import { renderPage, renderSection, requestFromUrl } from '../shopify'
import type { FormOutcome, PageRequest, StoreData } from '../shopify'
import { notFoundPage } from './html'
import { cutSearch, decode } from './router'
import type { Context } from './handler'
import { asError, PRIVATE, report, storeRoot } from './support'

const HTML = { 'content-type': 'text/html; charset=utf-8', 'cache-control': PRIVATE }

/** The collection handles that name no collection of the data but list products: `all`, and the vendor and type lists. The collection page and a product under a collection (`/collections/all/products/<handle>`, where every card of the all-products listing links) read the same ones. */
const PSEUDO_COLLECTIONS = ['all', 'vendors', 'types']

const collectionExists = (data: StoreData, handle: string) => PSEUDO_COLLECTIONS.includes(handle) || (data.collections ?? []).some(c => c.handle === handle)

/** The `<store_id>/<gift_card_token>` the store's gift card is served at: the path of its `url`, which reads `/gift_cards/<store_id>/<gift_card_token>` (https://shopify.dev/docs/api/liquid/objects/gift_card#gift_card-url; an absolute `url` keeps its host, which the storefront does not serve). Undefined for a store with no card, a card with no `url`, or a `url` that is not that path. */
function giftCardResource (data: StoreData): string | undefined {
  const url = data.gift_card?.url
  if (!url) return undefined
  try {
    const parts = new URL(url, 'https://storefront.invalid').pathname.split('/').filter(Boolean).map(decode)
    return parts.length === 3 && parts[0] === 'gift_cards' ? `${parts[1]}/${parts[2]}` : undefined
  } catch {
    return undefined
  }
}

/** Whether the resource a page names exists, so a missing one shows the theme's 404 template with status 404 (https://shopify.dev/docs/storefronts/themes/architecture/templates/404 names the template and not the status; `page-not-found` is a page recording that part S's comparison checks, not a fixture). A product under a collection (`/collections/<c>/products/<p>`) needs both, and the collection is read as the collection page reads it; whether Shopify also asks that the collection holds the product is not pinned, and here it does not. */
export function resourceExists (data: StoreData, page: PageRequest): boolean {
  const resource = page.request.resource
  if (resource === undefined) return true
  const collection = page.request.collection
  if (collection !== undefined && !collectionExists(data, collection)) return false
  switch (page.templateName) {
    case 'product': return (data.products ?? []).some(p => p.handle === resource)
    case 'collection': return collectionExists(data, resource)
    case 'page': return (data.pages ?? []).some(p => p.handle === resource)
    case 'blog': return (data.blogs ?? []).some(b => b.handle === resource)
    // the resource is `<blog>/<article>`: compared whole, so a handle that held a `/` could not be read as two
    case 'article': return (data.blogs ?? []).some(b => b.articles.some(a => `${b.handle}/${a.handle}` === resource))
    // https://shopify.dev/docs/storefronts/themes/architecture/templates/gift-card-liquid and https://shopify.dev/docs/api/liquid/objects/gift_card say nothing of a card that does not exist, so the theme's 404 template answers it, as it does an unknown product or page (not pinned). A disabled or expired card is shown: the themes mark it with `gift_card.enabled` and `gift_card.expired`
    case 'gift_card': return resource === giftCardResource(data)
    default: return true
  }
}

/** The engine's render options for a page of this request. */
function renderOptions (ctx: Context, page: PageRequest, form?: FormOutcome) {
  const url = new URL(ctx.request.url)
  return {
    theme: ctx.theme,
    templateName: page.templateName,
    data: ctx.data,
    locale: page.locale,
    services: ctx.services,
    cart: ctx.visitor.cart,
    // https://shopify.dev/docs/storefronts/themes/architecture/section-groups#contextual-section-groups: a group file `<group>.context.<context>.json` with `"market": "<market handle>"` overrides its parent for that market; the page's market is the context when the store data names it (a store with no markets has the engine's stand-in handle `default`, which is no market handle), and no B2B customers exist here, so `b2b` is never set. Which file wins when several match, and what happens when none does, the page does not say: the engine takes the first match and otherwise the group as it is
    request: { ...page.request, ...(ctx.data.markets?.some(market => market.handle === page.request.market) ? { context: { market: page.request.market } } : {}), host: url.host, origin: url.origin, ...(form ? { form } : {}) }
  }
}

/** A page through the engine, https://shopify.dev/docs/storefronts/themes/architecture/templates. A page whose resource is missing renders the theme's `404` template with status 404; a theme that cannot show one (it has none, or it fails) gets a plain 404 page and an `error` report instead of a 500. */
export async function renderPageResponse (ctx: Context, page: PageRequest, status = 200, form?: FormOutcome): Promise<Response> {
  const notFound = !resourceExists(ctx.data, page) || page.templateName === '404'
  // Shopify shows its 404 page at `/404`, not at the address that was asked for (recording `page-not-found`, `/pages/does-not-exist`: the canonical link, `og:url` and the localization form's `return_to` name `/404`), so the request drops its path and the engine gives the template its own, under the base path and the locale prefix; the request's query stays, so `/pages/x?a=b` shows `return_to` `/404?a=b`, which no recording covers
  const shown = notFound ? { ...page, templateName: '404', request: { ...page.request, path: undefined } } : page
  try {
    const result = await renderPage(renderOptions(ctx, shown, form))
    report(ctx.options, { kind: 'render', report: result.report }, ctx.request)
    return new Response(result.html, { status: notFound ? 404 : status, headers: HTML })
  } catch (error) {
    if (!notFound) throw error
    report(ctx.options, { kind: 'error', error: asError(error) }, ctx.request)
    return notFoundPage(storeRoot(ctx))
  }
}

/** `?section_id=`: the section's HTML in its wrapper (https://shopify.dev/docs/api/ajax/section-rendering). A section the theme lacks answers 404 with an empty body, as the parity store does (fixture `ajax-sections-page`, step 4: `/?section_id=missing`). */
export async function renderSectionResponse (ctx: Context, page: PageRequest, id: string): Promise<Response> {
  const html = await sectionHtml(ctx, page, id)
  return html === null ? new Response('', { status: 404, headers: HTML }) : new Response(html, { status: 200, headers: HTML })
}

async function sectionHtml (ctx: Context, page: PageRequest, id: string): Promise<string | null> {
  try {
    const result = await renderSection({ ...renderOptions(ctx, page), section: id })
    report(ctx.options, { kind: 'render', report: result.report }, ctx.request)
    // `renderSection` returns '' for a section the theme lacks (it does not throw); a section that exists prints at least its wrapper
    return result.html === '' ? null : result.html
  } catch (error) {
    report(ctx.options, { kind: 'error', error: asError(error) }, ctx.request)
    return null
  }
}

/** `?sections=a,b`: JSON keyed by section id, at most `limits.sections` of them (the caller refuses more); a section that fails or does not exist is `null`, with status 200 (https://shopify.dev/docs/api/ajax/section-rendering; fixture `ajax-sections-page`, step 2: `"missing": null`). */
export async function renderSectionsJson (ctx: Context, page: PageRequest, ids: string[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {}
  for (const id of ids.slice(0, ctx.limits.sections)) {
    // defined, not assigned: an id such as `__proto__` is a key like any other
    Object.defineProperty(out, id, { value: await sectionHtml(ctx, page, id), enumerable: true, writable: true, configurable: true })
  }
  return out
}

/** The page a path names, read as a page address under the request's base path. A path starts with the locale prefix when the page should show in that language. */
export const pageForPath = (ctx: Context, path: string): PageRequest => requestFromUrl(cutSearch(`${ctx.basePath}${path}`, ctx.limits.search), ctx.data, { basePath: ctx.basePath, country: ctx.visitor.country })
