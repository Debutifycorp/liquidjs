import { HandleMap } from '../objects/handle-map'
import { escapeHtml } from '../util/html'
import { hasOwn } from '../util/own'
import { variantMedia } from '../objects/image'
import { articlesInDataOrder, copyObject, printsHandle, remember, selectProduct, type LiquidObject, type StoreObjects } from './build'
import { sortProducts } from './collection-view'
import { buildFilters, filterMatcher, requestQuery } from './filters'
import type { RequestInput } from './globals'
import { parseQuery } from './search-query'
import type { QueryNode } from './search-query'
import { encodeQueryComponent } from '../util/query'
import { withPrefix } from './view'

const words = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
const plain = (html: unknown) => String(html ?? '').replace(/<[^>]*>/g, ' ').replace(/&[#\w]+;/g, ' ')

/** The words a resource is found by: a product's title, vendor, type, tags and description; a page's title and content; an article's title, tags and content. HTML tags and entities are not words. */
function searchable (item: LiquidObject, kind: 'product' | 'page' | 'article'): string[] {
  const tags = (item.tags as string[] | undefined) ?? []
  const fields = kind === 'product'
    ? [item.title, item.vendor, item.type, ...tags, plain(item.description)]
    : kind === 'page' ? [item.title, plain(item.content)] : [item.title, ...tags, plain(item.content)]
  return fields.flatMap(field => words(String(field ?? '')))
}

/** The words of each built resource, made once and kept as long as the resource (final review B, M3): a search matches every product, page and article against its terms, and tokenising their text is most of what it costs. The built resources are the view's and are not changed, so their words do not change either. */
const wordsOf = new WeakMap<LiquidObject, Set<string>>()

const foundIn = (item: LiquidObject, kind: 'product' | 'page' | 'article') => remember(wordsOf, item, () => new Set(searchable(item, kind)))

/** Whether a word of `found` starts with `term`. */
function startsAWord (found: Set<string>, term: string): boolean {
  for (const word of found) if (word.startsWith(term)) return true
  return false
}

/** How many of `terms` the resource's words hold: a term is a whole word, except the last, which starts one when `prefix` is on (`options[prefix]=last`, the default) or is a whole word too (`none`), as shopify.dev's storefront search page describes ("Perform a partial word match on the last search term"). */
function countMatches (found: Set<string>, terms: string[], prefix: boolean): number {
  return terms.reduce((count, term, at) => count + ((at === terms.length - 1 && prefix ? startsAWord(found, term) : found.has(term)) ? 1 : 0), 0)
}

/**
 * The terms of a query that uses no syntax. The parity store's search finds a resource that holds ANY of the words, not all of them, and lists the ones that hold more of them first (fixtures `probe-search-q-two-words`, `-two-words-leather` and `-words-miss`: `gray sneakers` finds the five products that have either word, `beanie zzzz` finds the beanie). A lowercase `and` or `or` among other words is not searched (`gray and sneakers` finds those five, `slides or beanie` the two, fixtures `-lower-and` and `-lower-or`), an uppercase one is a word like any other (`gray AND sneakers` finds all 28 products, whose texts hold `and`, fixture `-and`), and on its own it is searched (fixture `-and-word`). shopify.dev's help says terms are joined with AND; the store answers otherwise, and the store is the target.
 */
function plainTerms (list: string[]): string[] {
  const dropped = (word: string) => word === 'and' || word === 'or'
  const kept = list.some(word => !dropped(word)) ? list.filter(word => !dropped(word)) : list
  return kept.flatMap(word => words(word))
}

/** The checks a field query makes, by kind of resource: the values of the field and how a query value is compared with them (https://help.shopify.com/en/manual/online-store/storefront-search/search-behavior lists the fields; "Field searches require exact matches", which the parity store reads as a whole word or phrase of a text field, fixtures `probe-search-q-title` and `-title-partial`, and the whole value of a tag, `-tag` and `-tag-lower`, and a variant's title is a field the search knows but finds nothing by, `-variant-title`: `variants.title:Large` finds none of the products, the slides among them, whose variant is titled exactly `Large`). */
type Comparison = 'words' | 'exact' | 'prefix'
type Fields = Record<string, [Comparison, (item: LiquidObject) => string[]]>

const text = (value: unknown) => String(value ?? '')
const texts = (values: unknown) => (Array.isArray(values) ? values : []).map(text)
const variantsOf = (product: LiquidObject) => (Array.isArray(product.variants) ? product.variants : []) as LiquidObject[]

const FIELDS: Record<Kind, Fields> = {
  product: {
    id: ['exact', item => [text(item.id)]],
    title: ['words', item => [text(item.title)]],
    body: ['words', item => [plain(item.description)]],
    product_type: ['words', item => [text(item.type)]],
    vendor: ['words', item => [text(item.vendor)]],
    tag: ['exact', item => texts(item.tags)],
    // recognised, so the query narrows (an unknown field would find every product), yet the parity store matches no variant title, not even a whole one (fixture `probe-search-q-variant-title`)
    'variants.title': ['exact', () => []],
    'variants.sku': ['prefix', item => variantsOf(item).map(variant => text(variant.sku))],
    'variants.barcode': ['prefix', item => variantsOf(item).map(variant => text(variant.barcode))]
  },
  // a page and an article have an id the search matches too: `id:<a product's id>` finds no page and no article (fixture `probe-search-w-id-all`, a search of every kind), where a field the search ignores would find them all
  page: {
    id: ['exact', item => [text(item.id)]],
    title: ['words', item => [text(item.title)]],
    body: ['words', item => [plain(item.content)]],
    author: ['words', item => [text(item.author)]]
  },
  article: {
    id: ['exact', item => [text(item.id)]],
    title: ['words', item => [text(item.title)]],
    body: ['words', item => [plain(item.content)]],
    author: ['words', item => [text(item.author)]],
    tag: ['exact', item => texts(item.tags)]
  }
}

/** Whether `phrase` (words) appears in `sequence` as consecutive words. */
function containsPhrase (sequence: string[], phrase: string[]): boolean {
  for (let at = 0; at + phrase.length <= sequence.length; at++) {
    if (phrase.every((word, i) => sequence[at + i] === word)) return true
  }
  return false
}

/** `undefined` is a part of a query the search does not read (an unknown field, an empty value, a comparison, a wildcard, a plain word beside syntax), which narrows nothing. */
type Verdict = boolean | undefined

/**
 * Whether a resource meets a query that uses syntax (`parseQuery`), by what the parity store answers (fixtures `probe-search-q-*`): a field or a quoted phrase narrows (`tag:women`, `title:"gray leather"`); `OR` joins and `AND` and a space meet, OR binding tighter, and parentheses group (`tag:women AND (title:shirt OR title:leggings)`); a negation takes the resources that hold the word or field out (`tag:men -tag:women`), also beside a plain word (`sneakers -leather` finds every product but the two with `leather`); and the plain words beside a field, a phrase or a negation only rank (`tag:women hoodie` finds the four women's products, none of them a hoodie). An unknown field name is ignored ("Unrecognized names are ignored and can return all products": `colour:red` finds all 28), and so is a wildcard (`hood*` finds all 28 as well). A query that narrows nothing finds every resource. A phrase searches the title and the description only ("A quoted phrase on its own doesn't search other fields").
 */
function verdict (node: QueryNode, item: LiquidObject, kind: Kind, negated = false): Verdict {
  switch (node.type) {
    case 'neutral': return undefined
    case 'word': return negated ? words(node.word).every(word => foundIn(item, kind).has(word)) : undefined
    case 'phrase': {
      const phrase = words(node.phrase)
      if (phrase.length === 0) return undefined
      return containsPhrase(words(text(item.title)), phrase) || FIELDS[kind].body[1](item).some(value => containsPhrase(words(value), phrase))
    }
    case 'field': {
      const field = hasOwn(FIELDS[kind], node.field) ? FIELDS[kind][node.field] : undefined
      if (!field) return undefined
      const [how, values] = field
      if (how === 'words') {
        const phrase = words(node.value)
        return phrase.length === 0 ? undefined : values(item).some(value => containsPhrase(words(value), phrase))
      }
      const wanted = node.value.trim().toLowerCase()
      if (wanted === '') return undefined
      return values(item).some(value => how === 'exact' ? value.toLowerCase() === wanted : value.toLowerCase().startsWith(wanted))
    }
    case 'not': {
      const inner = verdict(node.item, item, kind, true)
      return inner === undefined ? undefined : !inner
    }
    case 'and':
    case 'or': {
      const parts = node.items.map(part => verdict(part, item, kind, negated)).filter((part): part is boolean => part !== undefined)
      if (parts.length === 0) return undefined
      return node.type === 'and' ? parts.every(Boolean) : parts.some(Boolean)
    }
  }
}

/**
 * A copy of a built object with `changes` set, as `collectionView` makes one of a product (`copyOf`): every own property as the object has it, the hidden ones and the accessors included, so the `json` filter still knows a product by its marker and its image roles (final review B, M2: the spread `{ ...product }` dropped them, and `search.results.first | json` printed the engine's raw key order, 45,650 characters, where `all_products[handle] | json` prints the parity store's form, 33,348). The object's `toString` is left out: it names the original's handle, and `printsHandle` sets the copy's own.
 */
function copyWith (object: LiquidObject, changes: LiquidObject): LiquidObject {
  const copy = copyObject(object, 'toString')
  for (const [key, value] of Object.entries(changes)) Object.defineProperty(copy, key, { value, enumerable: true, configurable: true, writable: true })
  return copy
}

/** The search page's sort options, names and values, as the parity store prints them (fixture `probe-search-none`; https://shopify.dev/docs/api/liquid/objects/search gives no values). */
const SORT_OPTIONS = [{ name: 'Relevance', value: 'relevance' }, { name: 'Price, low to high', value: 'price-ascending' }, { name: 'Price, high to low', value: 'price-descending' }]
const LIMIT = 1000

type Kind = 'article' | 'page' | 'product'

/** The kinds of result, in the order the parity store prints `search.types` (fixtures `probe-search-shirt` and `probe-search-none`: `article`, `page`, `product`; a `type` parameter reports the kinds it names in this order too, fixtures `probe-search-type-page` and `-type-product`). */
const KINDS: Kind[] = ['article', 'page', 'product']

/** The kinds the request searches: those of its `type` parameter that are kinds of result, and all of them when it names none ("Defaults to all types", https://shopify.dev/docs/storefronts/themes/navigation-search/search). */
function kindsOf (request: RequestInput): Kind[] {
  const asked = request.search?.types ?? []
  const named = KINDS.filter(kind => asked.includes(kind))
  return named.length ? named : [...KINDS]
}

/** The `sort_by` the search answers: the request's when it is one of the sort options, otherwise `relevance`. */
const sortOf = (request: RequestInput) => SORT_OPTIONS.find(option => option.value === request.sortBy)?.value ?? 'relevance'

/**
 * The `search` object of https://shopify.dev/docs/api/liquid/objects/search. Without terms no search is run: `performed` is false, `terms` is nil and nothing is found (fixture `probe-search-none`). With terms, `results` holds the store's products, pages and articles whose words match every term, case-insensitively, each a copy with the `object_type` that page documents; `results_count` and the results stop at 1,000.
 *
 * `terms` is the query as the parity store prints it, HTML-escaped (fixture `probe-search-q-phrase`: `&quot;gray leather&quot;`), so a theme that prints it as it is cannot be broken out of by what the shopper typed. The words of the query, the `OR`, `AND`, `-`, `NOT`, `field:value` and quoted-phrase syntax and the fields searched are `parseQuery`, `plainTerms` and `verdict` (fixtures `probe-search-q-*`).
 *
 * The request shapes the search as https://shopify.dev/docs/storefronts/themes/navigation-search/search describes. `type` limits the kinds of result (`types` reports them, `article`, `page`, `product` order). `options[prefix]` is `last` by default, so the last term matches the start of a word, and `none` makes it a whole word. `options[unavailable_products]` is `last` by default, so unavailable products come after every other result, `show` leaves them where they are found, and `hide` drops them. `sort_by` is `relevance` or one of the price orders, and with a price order "all non-product results are pushed to the end of the results array" (products first, in price order, unavailable ones last unless the option says otherwise). That page labels `price-ascending` "high to low" and `price-descending` "low to high", the reverse of the names and of the parity store (fixture `probe-search-filtered`: `price-ascending` lists 40.00 before 90.00), so the names win. The `filter.*` parameters of the storefront filters narrow the products (https://shopify.dev/docs/storefronts/themes/navigation-search/filtering/storefront-filtering, as `collectionView` does for a collection), and under variant filters a product's `url` and `featured_media` are its first matching variant's (`Matcher.firstVariant`; that page describes the `product` object, not only collections). `filters` are the store's storefront filters over the products that match the terms, the types and the unavailable option, before the filters, so the counts show what each value would give; their links keep the whole query of the address, `q`, `type`, `options[...]`, `sort_by`, `view` and the filters, ordered by name (`withQuery`; fixtures `probe-search-filtered` and `probe-search-prefix`), at `/search` under `prefix` (the view's base path and locale prefix, like the search route). A request with no `query` (one built by hand) extends `/search?q=<terms>` with its `sort_by` and filters. `sort_options` are the three sort orders the page lists, with the values and names of the parity store (fixture `probe-search-none`); `default_sort_by` is `relevance`.
 *
 * Debutify's matching, which shopify.dev does not pin and so goes on the "confirm on a development store" list: the fields searched (a product's title, vendor, type, tags and description; a page's title and content; an article's title, tags and content), splitting text into words at anything that is not a letter or digit, the order of results (available products, then pages, then articles, each in store order, then unavailable products) in place of Shopify's relevance ranking, an unknown `type` being ignored (and a `type` of only unknown kinds searching all kinds), an unknown `sort_by` reading as `relevance`, and the `q` parameter's encoding in the filter URLs. Shopify's relevance order is not reproduced where the fixtures show it: `probe-search-type-product` lists gray-leather-sneakers, canvas-sneakers, high-top-sneakers, white-leather-sneakers and `probe-search-shirt` lists the article liquidpeak-450 before new-line-of-tennis-products (while `probe-search-prefix` lists them the other way round), which no rule of plain matching yields; they are accepted differences.
 */
export function buildSearch (store: StoreObjects, terms: string | undefined, request: RequestInput = {}, prefix = ''): LiquidObject {
  const kinds = kindsOf(request)
  const sortBy = sortOf(request)
  const base = { terms: terms === undefined ? null : escapeHtml(terms), types: kinds, sort_by: sortBy, default_sort_by: 'relevance', sort_options: SORT_OPTIONS.map(option => ({ ...option })) }
  if (terms === undefined || terms.trim() === '') return { performed: false, results: [], results_count: 0, filters: [], ...base }
  const parsed = parseQuery(terms)
  const wanted = parsed.words ? plainTerms(parsed.words) : []
  const partial = (request.search?.prefix ?? 'last') === 'last'
  const unavailable = request.search?.unavailable ?? 'last'
  // a query with syntax meets `verdict`; one without finds the resources that hold any of its words, the ones that hold more of them first
  const find = (items: LiquidObject[], kind: Kind): LiquidObject[] => {
    if (!kinds.includes(kind)) return []
    const tree = parsed.tree
    if (tree) return items.filter(item => verdict(tree, item, kind) !== false)
    if (wanted.length === 0) return []
    return items.map(item => ({ item, count: countMatches(foundIn(item, kind), wanted, partial) })).filter(entry => entry.count > 0).sort((a, b) => b.count - a.count).map(entry => entry.item)
  }
  // the products that match the terms; `hide` drops the unavailable ones
  const matching = find(HandleMap.values(store.products), 'product').filter(product => unavailable !== 'hide' || product.available)
  const { query: requested, active } = requestQuery(request)
  // `resources[type]` and `resources[limit]` belong to the predictive search: the search page ignores them and its filter links leave them out (fixture `probe-search-w-resources-type`: the links of `q=…&resources[type]=product` end `&view=probe`)
  const asked = requested.filter(([name]) => !name.startsWith('resources['))
  // the filters' links keep the terms: a request built by hand with a query of its own but no `q` gets one
  const query = request.query && !asked.some(([name]) => name === 'q') ? [['q', terms] as [string, string], ...asked] : asked
  // compiled once for every product of the request
  const matcher = filterMatcher(active, store.currency, store.storefrontFilters)
  const narrowed = matching.filter(matcher.test)
  const linked = active.some(([name]) => name.startsWith('filter.v.'))
  // a result is made when the template reads `results` (final review B, I1), and only for the 1,000 the search shows: under variant filters a product's `url` and `featured_media` are its first matching variant's
  const shown = ({ item, kind }: { item: LiquidObject, kind: Kind }) => {
    const variant = linked && kind === 'product' ? matcher.firstVariant(item) : undefined
    // the matching variant's media is the bare image, as on the collection page (`collectionView`; scenario `page-collection-filtered` records it there, search is not recorded with variant filters: the same mechanism is assumed)
    const media = variant?.featured_media
    return printsHandle(copyWith(variant ? selectProduct(item, variant.id as number) : item, { ...(variant ? { url: variant.url, featured_media: variantMedia(media) ?? item.featured_media } : {}), object_type: kind }))
  }
  const asProduct = (product: LiquidObject) => ({ item: product, kind: 'product' as Kind })
  const pages = find(HandleMap.values(store.pages), 'page').map(page => ({ item: page, kind: 'page' as Kind }))
  // an article found by search has its blog in its handle, `news/liquidpeak-450` (fixtures `probe-search-shirt` and `probe-search-prefix`), where `article.handle` elsewhere is the article's own
  const articles = HandleMap.values(store.blogs)
    .flatMap(blog => find(articlesInDataOrder(blog), 'article').map(article => ({ item: copyWith(article, { handle: `${blog.handle}/${article.handle}` }), kind: 'article' as Kind })))
  // `last` sets the unavailable products apart, to follow every other result; a price order pushes the non-products to the end of the results, behind those products
  const apart = unavailable === 'last'
  const inOrder = (list: LiquidObject[]) => (sortBy === 'relevance' ? list : sortProducts(list, sortBy)).map(asProduct)
  const leading = inOrder(apart ? narrowed.filter(product => product.available) : narrowed)
  const trailing = inOrder(apart ? narrowed.filter(product => !product.available) : [])
  const priced = sortBy !== 'relevance'
  const found = [...leading, ...(priced ? trailing : []), ...pages, ...articles, ...(priced ? [] : trailing)].slice(0, LIMIT)
  let results: LiquidObject[] | undefined
  let filters: LiquidObject[] | undefined
  return {
    performed: true,
    get results () {
      results ??= found.map(shown)
      return results
    },
    results_count: found.length,
    // built when read (final review B, I1): the counts walk every product that matched, and a template that lists the results or their count does not need them
    get filters () {
      filters ??= buildFilters(store.storefrontFilters, matching, request.query ? withPrefix(prefix, '/search') : withPrefix(prefix, `/search?q=${encodeQueryComponent(terms)}`), query, store.currency)
      return filters
    },
    ...base
  }
}
