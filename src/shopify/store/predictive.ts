import { HandleMap } from '../objects/handle-map'
import type { ImageDrop } from '../objects/image'
import { own } from '../util/own'
import { buildStore, remember } from './build'
import type { LiquidObject, StoreObjects } from './build'
import type { PredictiveRequest } from './globals'
import { trackingId } from './recommendations'
import type { StoreData } from './types'
import { resolveView } from './view'
import type { StoreView } from './view'

type ResourceKey = 'products' | 'collections' | 'pages' | 'articles' | 'queries'

/** The `resources[type]` values the Predictive Search API takes and the list each fills, https://shopify.dev/docs/api/ajax/reference/predictive-search. */
const KEYS: Readonly<Record<string, ResourceKey>> = { product: 'products', collection: 'collections', page: 'pages', article: 'articles', query: 'queries' }

/** The order the types fill a shared `limit` in (`resources[limit_scope]` `all`): the order of the API's own type list, `query,product,collection,page` (https://shopify.dev/docs/api/ajax/reference/predictive-search), with articles, which that list leaves out by default, last. shopify.dev says only that the limit applies "across all types", not how it is split, so the order is Debutify's choice; no recording has results of more than one type. */
const FILL_ORDER = ['query', 'product', 'collection', 'page', 'article']

const words = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
const plain = (html: unknown) => String(html ?? '').replace(/<[^>]*>/g, ' ').replace(/&[#\w]+;/g, ' ')

/** Whether `found` holds every term: all but the last as a whole word, the last as the start of one (the last word the shopper types is unfinished, https://shopify.dev/docs/api/ajax/reference/predictive-search). */
const hasTerm = (found: string[], term: string, last: boolean) => last ? found.some(word => word.startsWith(term)) : found.includes(term)
const matches = (found: string[], terms: string[]) => terms.length > 0 && terms.every((term, at) => hasTerm(found, term, at === terms.length - 1))

/** The words of each built product, page and article that the matching reads, made once and kept as long as the built resource (final review B, M3): a predictive search runs on every keystroke and matches every product, and tokenising their text is most of what it costs. The built resources are the view's and are not changed, so their words do not change either. Each word once: a description repeats words, and the matching only asks whether one is there. */
const partialMemo = new WeakMap<LiquidObject, string[]>()
const wholeMemo = new WeakMap<LiquidObject, string[]>()
const contentMemo = new WeakMap<LiquidObject, Map<string, string[]>>()
const distinct = (list: string[]) => [...new Set(list)]

/** The words of a product that a partly typed last term can start: its title, type, vendor and variant titles, the fields https://shopify.dev/docs/api/ajax/reference/predictive-search lists for typo tolerance. The words of a product's description, tags and variant SKUs, which are searched too, are matched whole (`wholeWords`). */
function partialWords (product: LiquidObject): string[] {
  return remember(partialMemo, product, () => {
    const variants = product.variants as LiquidObject[]
    return distinct([...words(String(product.title)), ...words(String(product.type)), ...words(String(product.vendor)), ...variants.flatMap(variant => words(String(variant.title)))])
  })
}

/** The words of a product's description, tags and variant SKUs, which must be typed whole (see `partialWords`). The variant barcode and the product category, the other fields that page lists, are not in the store data. */
function wholeWords (product: LiquidObject): string[] {
  return remember(wholeMemo, product, () => {
    const variants = product.variants as LiquidObject[]
    return distinct([...words(plain(product.description)), ...(product.tags as string[]).flatMap(words), ...variants.flatMap(variant => words(String(variant.sku)))])
  })
}

/** Whether a product is found: every term is one of its words, the last also as the start of a word of `partialWords`. */
function matchesProduct (product: LiquidObject, terms: string[]): boolean {
  const partial = partialWords(product)
  const whole = wholeWords(product)
  return terms.length > 0 && terms.every((term, at) => hasTerm(partial, term, at === terms.length - 1) || whole.includes(term))
}

/** The words of one field of a page or an article: `author`, `body` and `title` for pages and also `tag` for articles, https://shopify.dev/docs/api/ajax/reference/predictive-search. Only these four fields are kept, so a request cannot make the memo grow by naming others. */
const CONTENT_FIELDS = new Map<string, (item: LiquidObject, kind: 'page' | 'article') => string[]>([
  ['title', item => words(String(item.title))],
  ['author', item => words(String(item.author ?? ''))],
  ['body', item => words(plain(item.content))],
  ['tag', (item, kind) => kind === 'article' ? ((item.tags as string[] | undefined) ?? []).flatMap(words) : []]
])

/** The words of a page's or an article's searchable `fields`: https://shopify.dev/docs/api/ajax/reference/predictive-search lists `author`, `body` and `title` for pages and also `tag` for articles. A collection is found by its title alone, the only property that page lists for it. */
function contentWords (item: LiquidObject, fields: string[], kind: 'page' | 'article'): string[] {
  const kept = remember(contentMemo, item, () => new Map<string, string[]>())
  return fields.flatMap(field => {
    const wordsOfField = CONTENT_FIELDS.get(field)
    if (!wordsOfField) return []
    let found = kept.get(field)
    if (!found) {
      found = wordsOfField(item, kind)
      kept.set(field, found)
    }
    return found
  })
}

/** The matching variant a product result shows: the one whose title has the most of the terms, the first on a tie, and none when no variant title has any (https://shopify.dev/docs/api/ajax/reference/predictive-search: "only the variant with the most matching terms is returned"). */
function bestVariant (product: LiquidObject, terms: string[]): LiquidObject | undefined {
  let best: LiquidObject | undefined
  let most = 0
  for (const variant of product.variants as LiquidObject[]) {
    const found = words(String(variant.title))
    const count = terms.filter((term, at) => hasTerm(found, term, at === terms.length - 1)).length
    if (count > most) {
      best = variant
      most = count
    }
  }
  return best
}

/**
 * What a predictive request finds, by list. Not performed without terms, so every list is empty: the `predictive_search` page says `performed` is true inside a section rendered through the API with no condition on the terms, and no recording has a blank term, so a blank `q` is Debutify's choice. Products ignore `resources[options][fields]` and search every product field, as https://shopify.dev/docs/api/ajax/reference/predictive-search says ("Product results always search all product fields"): the last term may start a word of the title, type, vendor and variant titles, the fields that page lists for partial matching, and every other term, and the last one too for the description, tags and variant SKUs, must be a whole word. The fixtures agree with that rule: `shirt` finds the three T-shirts (fixtures `probe-predictive-shirt` and `ajax-suggest-json`) and `ca` finds `canvas-sneakers` but not `frontpack`, `black-sunnies`, `gray-runners`, `clear-sunnies`, `high-top-sneakers` or `beanie`, whose descriptions hold only `carry`, `can`, `casual` and `cashmere` (fixture `probe-predictive-prefix`). The page's typo tolerance (one letter, after four correct ones) is not modelled. Pages and articles match on the `title`, `author` and `body` (articles also `tag`) that `fields` names; collections on their title in the store's primary language (the page: "Collection suggestions are based on the store's primary language", `collectionTitle`). Unavailable products follow `unavailable` (`last` puts them after the available ones, `hide` drops them). Results are in store order, Debutify's choice in place of Shopify's relevance ranking. Each list stops at `limit`, and with `limit_scope` `all` the types share it (`FILL_ORDER`). There are no query suggestions: Shopify makes them from the store's search history, which the dataset does not hold, and the parity store lists none for `shirt` or `ca` (fixtures `probe-predictive-shirt` and `probe-predictive-prefix`). The parity store's `ca` also finds `hoodie`, first, for a reason nothing in the dataset gives (possibly the product category, which the page lists and the dataset lacks).
 */
function search (store: StoreObjects, request: PredictiveRequest, collectionTitle: (collection: LiquidObject) => string): Record<ResourceKey, LiquidObject[]> {
  const found: Record<ResourceKey, LiquidObject[]> = { products: [], collections: [], pages: [], articles: [], queries: [] }
  const terms = words(request.q)
  if (!request.q.trim()) return found
  const lists: Record<string, () => LiquidObject[]> = {
    query: () => [],
    product: () => {
      const products = HandleMap.values(store.products).filter(product => matchesProduct(product, terms))
      return request.unavailable === 'hide' ? products.filter(product => product.available) : request.unavailable === 'last' ? [...products.filter(product => product.available), ...products.filter(product => !product.available)] : products
    },
    collection: () => HandleMap.values(store.collections).filter(collection => collection.handle !== 'all' && matches(words(collectionTitle(collection)), terms)),
    page: () => HandleMap.values(store.pages).filter(page => matches(contentWords(page, request.fields, 'page'), terms)),
    article: () => HandleMap.values(store.articles).filter(article => matches(contentWords(article, request.fields, 'article'), terms))
  }
  let room = request.limit
  for (const type of FILL_ORDER) {
    if (!request.types.includes(type)) continue
    const taken = lists[type]().slice(0, request.limitScope === 'all' ? room : request.limit)
    room -= taken.length
    found[KEYS[type]] = taken
  }
  return found
}

/** A collection's title in the store's primary language, which is what a predictive search compares a term with (https://shopify.dev/docs/api/ajax/reference/predictive-search: "A customer's search won't be compared to a collection's translated content"): the title in `data`, which is not translated, or the built collection's own when no data is given. */
function primaryTitles (data: StoreData | undefined): (collection: LiquidObject) => string {
  const titles = new Map((data?.collections ?? []).map(collection => [collection.handle, collection.title]))
  return collection => titles.get(String(collection.handle)) ?? String(collection.title)
}

/**
 * The `predictive_search` object, https://shopify.dev/docs/api/liquid/objects/predictive_search, for one Predictive Search API request (`search`). `performed` is true for a request with terms; `terms` are the typed text and `types` the requested types in alphabetical order, as the parity store prints them (fixture `probe-predictive-shirt`: a request for `product,collection,page,article,query` gives `article, collection, page, product, query`). `resources` has all five lists, empty for a type that was not asked for, and holds the store's own objects: unlike `predictiveJson`, a product that a variant title matched does not take that variant's image and URL (the Ajax page has `url` and `featured_media` follow the variant for Section Rendering), and no URL carries the tracking parameters. `data` is the store data the objects were built from, so collections are found by their title in the primary language. A page that is not a predictive search has no `predictive_search` (`buildGlobals`).
 */
export function buildPredictiveSearch (store: StoreObjects, request: PredictiveRequest, data?: StoreData): LiquidObject {
  return { performed: !!request.q.trim(), terms: request.q, types: [...new Set(request.types)].sort(), resources: search(store, request, primaryTitles(data)) }
}

/** An amount in the minor unit as the API prints prices, a decimal string (`4000` is `"40.00"`, fixture `ajax-suggest-json`). */
const decimal = (cents: unknown) => (Number(cents) / 100).toFixed(2)

/** An image as the API writes it, `{ alt, aspect_ratio, height, url, width }` (fixture `ajax-suggest-json`); an image without its own `alt` takes the title of the resource it belongs to, as the fixture shows. */
function imageJson (image: ImageDrop | null | undefined, title: unknown): Record<string, unknown> | null {
  if (!image) return null
  return { alt: image.alt || title, aspect_ratio: image.aspect_ratio ? image.aspect_ratio.value : null, height: image.height, url: image.data.src, width: image.width }
}

/** A result's URL with the tracking parameters the parity store adds, in its order (fixture `ajax-suggest-json`): `_pos` (the result's place in its list, from 1), `_psq` (the typed text), `_psid` (`trackingId`) and `_ss` (`e`). */
function tracked (url: unknown, position: number, request: PredictiveRequest): string {
  const base = String(url)
  return `${base}${base.includes('?') ? '&' : '?'}_pos=${position}&_psq=${encodeURIComponent(request.q)}&_psid=${trackingId(request.q, request.types.join(','))}&_ss=e`
}

/** A product result (fixture `ajax-suggest-json`). `variants` is empty unless a variant title has one of the terms; then it holds that variant and the product's `image`, `featured_image` and `url` are the variant's (https://shopify.dev/docs/api/ajax/reference/predictive-search), whose own fields, and the order of `?variant=` and the tracking parameters, no recording shows. */
function productResult (product: LiquidObject, position: number, request: PredictiveRequest): Record<string, unknown> {
  const variant = bestVariant(product, words(request.q))
  const variantImage = (variant?.featured_image ?? null) as ImageDrop | null
  const featured = imageJson(variantImage ?? (product.featured_image as ImageDrop | null), product.title)
  return {
    available: product.available,
    body: product.description,
    compare_at_price_max: decimal(product.compare_at_price_max),
    compare_at_price_min: decimal(product.compare_at_price_min),
    handle: product.handle,
    id: product.id,
    image: featured ? featured.url : null,
    price: decimal(product.price),
    price_max: decimal(product.price_max),
    price_min: decimal(product.price_min),
    tags: [...(product.tags as string[])],
    title: product.title,
    type: product.type,
    url: tracked(variant ? `${product.url}?variant=${variant.id}` : product.url, position, request),
    variants: variant
      ? [{ available: variant.available, compare_at_price: variant.compare_at_price == null ? null : decimal(variant.compare_at_price), id: variant.id, image: variantImage ? variantImage.data.src : null, price: decimal(variant.price), title: variant.title, url: variant.url, featured_image: imageJson(variantImage, product.title) }]
      : [],
    vendor: product.vendor,
    featured_image: featured
  }
}

/** A collection, page or article result with the fields https://shopify.dev/docs/api/ajax/reference/predictive-search lists for it; no recording has one, so their values follow the store data: a collection has no `published_at` there (nil), a page no `author` (empty), and an article's `image` is its image URL. */
function contentResult (type: string, item: LiquidObject, position: number, request: PredictiveRequest): Record<string, unknown> {
  const url = tracked(item.url, position, request)
  if (type === 'collection') return { body: item.description, handle: item.handle, id: item.id, featured_image: imageJson(item.image as ImageDrop | null, item.title), published_at: null, title: item.title, url }
  if (type === 'page') return { author: item.author ?? '', body: item.content, handle: item.handle, id: item.id, published_at: item.published_at ?? null, title: item.title, url }
  return { author: item.author, body: item.content, handle: item.handle, id: item.id, image: item.image ? (item.image as ImageDrop).data.src : null, published_at: item.published_at, summary_html: item.excerpt, tags: [...(item.tags as string[])], title: item.title, url }
}

/**
 * The `/search/suggest.json` answer, https://shopify.dev/docs/api/ajax/reference/predictive-search: `resources.results` with a list for each requested type, in the order the request names them (fixture `ajax-suggest-json`: `products, collections, pages, articles, queries` for `product,collection,page,article,query`, and `collections, pages, products, queries` for a request without `resources[type]`, whose default types `requestFromUrl` lists that way). `view` is the market and language the request is in (the primary ones when omitted).
 */
export function predictiveJson (data: StoreData, request: PredictiveRequest, view: StoreView = resolveView(data, {})): Record<string, unknown> {
  const found = search(buildStore(data, view), request, primaryTitles(data))
  const results: Record<string, unknown[]> = {}
  for (const type of new Set(request.types)) {
    const key = own(KEYS, type)
    if (!key) continue
    results[key] = found[key].map((item, at) => type === 'product' ? productResult(item, at + 1, request) : contentResult(type, item, at + 1, request))
  }
  return { resources: { results } }
}
