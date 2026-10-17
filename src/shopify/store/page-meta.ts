import { stripTags } from '../../util/strip-tags'
import { SafeHtmlDrop } from '../objects/safe-html'
import { escapeHtml } from '../util/html'
import type { LiquidObject } from './build'

/** The most characters of a page's text its description holds, as the parity store cuts it (recordings `page-article` and `page-product-requires-plan`: 320, in the middle of a word, with no ellipsis). */
const DESCRIPTION_LENGTH = 320

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…' }

/** The character a numeric reference names; zero, a surrogate and one outside Unicode read as U+FFFD, as in an HTML parser (https://html.spec.whatwg.org/multipage/parsing.html#numeric-character-reference-end-state). */
const fromCode = (code: number) => Number.isInteger(code) && code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) ? String.fromCodePoint(code) : '\ufffd'

/** The text of an HTML string's character references: the numeric ones and the common named ones. Another name stays as written. */
function decodeEntities (html: string): string {
  return html.replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));/gi, (whole, hex: string | undefined, dec: string | undefined, name: string | undefined) => {
    if (hex !== undefined) return fromCode(parseInt(hex, 16))
    if (dec !== undefined) return fromCode(Number(dec))
    return NAMED[(name as string).toLowerCase()] ?? whole
  })
}

/**
 * The description of a page from its own HTML text, which is what `page_description` is for a product, a collection, a page and an article. https://shopify.dev/docs/api/liquid/objects/page_description says only "The meta description of the current page"; the rules here are what the parity store prints (recordings `page-product`, `page-collection`, `page-page`, `page-faq`, `page-track-order` and `page-article`): the text of the body with its tags taken out, every run of white space (the line break between two blocks too) one space, the first 320 characters. Nil when nothing is left (recordings `page-contact` and `page-collection-filtered`, an empty page and the `all` collection, print no description). Two things no recording settles: an entity is read as the character it names, which is Debutify's choice so that the layout's `escape` does not escape an entity a second time (the dataset's men, women, featured and shoes collections hold `&#39;`, and none is recorded; the recorded hoodie has a literal apostrophe, which `escape` writes as `&#39;`), and two blocks with no white space between them are joined without one (the recorded bodies all have a line break there).
 */
export function descriptionOf (html: unknown): string | null {
  if (typeof html !== 'string') return null
  const text = decodeEntities(stripTags(html)).replace(/\s+/g, ' ').trim()
  // the first 320 characters, counted as characters, without building an array of a long text
  let out = ''
  let count = 0
  for (const character of text) {
    if (count++ === DESCRIPTION_LENGTH) break
    out += character
  }
  return out || null
}

/**
 * The `page_title` of a template that shows no resource: Shopify's own words for the cart (`Your Shopping Cart`), the collection list (`Collections`), the 404 page (`404 Not Found`) and search (recordings `page-cart-empty`, `page-collections`, `page-not-found` and `page-search`). A search with a term names the number of results and the term, as `Search: 5 results found for "shirt"`; the recording holds only that one, so the singular (`1 result found`) and the bare `Search` for a search without a term are Shopify's English as the engine reads it, not pinned. The term is escaped and the title is HTML-safe, because the layout prints it unescaped inside `<title>` (the recording prints `&quot;shirt&quot;` there) and escapes it again for `og:title` (which prints the same `&quot;shirt&quot;`: Shopify's `escape` leaves an HTML-safe string alone, `SafeHtmlDrop`). Undefined for any other template, whose title is its resource's or the shop's name.
 */
export function templateTitle (pageType: string, search: LiquidObject | undefined): string | SafeHtmlDrop | undefined {
  switch (pageType) {
    case 'cart': return 'Your Shopping Cart'
    case 'list-collections': return 'Collections'
    case '404': return '404 Not Found'
    case 'search': {
      const terms = typeof search?.terms === 'string' ? search.terms : ''
      if (!terms.trim()) return 'Search'
      const count = Number(search?.results_count ?? 0)
      return new SafeHtmlDrop(`Search: ${count} ${count === 1 ? 'result' : 'results'} found for ${escapeHtml(`"${terms}"`)}`)
    }
    default: return undefined
  }
}

/** The page types whose `page_description` is the shop's description (see `pageDescription`). */
const SHOP_DESCRIBED = new Set(['index', 'list-collections', 'search', 'password'])

/**
 * The `page_description` of a page: the text of the resource's own description (a product's, a collection's) or body (a page's, an article's, not its excerpt), and the shop's description on the home page, the collection list, the search page and the password page. Horizon 4.3.0 and Dawn 16.0.0 print `<meta name="description">` only `if page_description`, and the parity store prints the shop's description in it on the home page (recordings `page-home` and `page-home-fr-ca`), on `/collections` and on `/search?q=shirt` (recordings `page-collections` and `page-search` of both themes; the private theme falls back to the shop's description itself, so its recordings could not tell). Nil for every other page: `page-blog`, `page-cart-empty`, `page-not-found`, an empty page (`page-contact`) and a collection without a description (`page-collection-filtered`, `/collections/all`) print no description meta in either theme. The password page is not among the recordings; it keeps the shop's description, which it showed before, and so does a search page with no terms, which is not recorded either. https://shopify.dev/docs/api/liquid/objects/page_description says only "The meta description of the current page".
 */
export function pageDescription (pageType: string, resource: LiquidObject | null | undefined, shopDescription: unknown): string | null {
  if (SHOP_DESCRIBED.has(pageType)) return typeof shopDescription === 'string' && shopDescription ? shopDescription : null
  if (!resource) return null
  switch (pageType) {
    case 'product':
    case 'collection': return descriptionOf(resource.description)
    case 'page':
    case 'article': return descriptionOf(resource.content)
    default: return null
  }
}

/**
 * The `page_image` of a page. https://shopify.dev/docs/api/liquid/objects/page_image: "The resource's featured image for product and collection pages, and blog posts, is used", and elsewhere the store's social sharing image, which the store data does not hold (nil here). A product's is its featured image, whichever variant is selected (recording `page-product-variant`), a collection's is its own image (recording `page-collection-filtered`, `/collections/all`, which has none, prints no `og:image`, so the first product's image does not stand in for it), and an article's is its image.
 */
export function pageImage (pageType: string, resource: LiquidObject | null | undefined): unknown {
  if (!resource) return null
  switch (pageType) {
    case 'product': return resource.featured_image ?? null
    case 'collection':
    case 'article': return resource.image ?? null
    default: return null
  }
}
