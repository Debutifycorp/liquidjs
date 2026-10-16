import { stripTags } from '../../filters/html'
import { SafeHtmlDrop } from '../objects/safe-html'
import { escapeHtml } from '../util/html'
import type { LiquidObject } from './build'

/** The most characters of a page's text its description holds, as the parity store cuts it (recordings `page-article` and `page-product-requires-plan`: 320, in the middle of a word, with no ellipsis). */
const DESCRIPTION_LENGTH = 320

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…' }

/** The character a numeric reference names; one outside Unicode reads as U+FFFD. */
const fromCode = (code: number) => Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '�'

/** The text of an HTML string's character references: the numeric ones and the common named ones. Another name stays as written. */
function decodeEntities (html: string): string {
  return html.replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));/gi, (whole, hex: string | undefined, dec: string | undefined, name: string | undefined) => {
    if (hex !== undefined) return fromCode(parseInt(hex, 16))
    if (dec !== undefined) return fromCode(Number(dec))
    return NAMED[(name as string).toLowerCase()] ?? whole
  })
}

/**
 * The description of a page from its own HTML text, which is what `page_description` is for a product, a collection, a page and an article. https://shopify.dev/docs/api/liquid/objects/page_description says only "The meta description of the current page"; the rules here are what the parity store prints (recordings `page-product`, `page-collection`, `page-page`, `page-faq`, `page-track-order` and `page-article`): the text of the body with its tags taken out, every run of white space (the line break between two blocks too) one space, the first 320 characters. Nil when nothing is left (recordings `page-contact` and `page-collection-filtered`, an empty page and the `all` collection, print no description). An entity is read as the character it names, because the layout escapes the text for its attribute and the parity store prints `it&#39;s`, not `it&amp;#39;s` (`page-product`); two blocks with no white space between them are joined without one, which no recording settles (the recorded bodies all have a line break there).
 */
export function descriptionOf (html: unknown): string | null {
  if (typeof html !== 'string') return null
  const text = decodeEntities(stripTags(html)).replace(/\s+/g, ' ').trim()
  const characters = Array.from(text)
  return characters.length ? characters.slice(0, DESCRIPTION_LENGTH).join('') : null
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

/**
 * The `page_description` of a page: the text of the resource's own description (a product's, a collection's) or body (a page's, an article's, not its excerpt), and the shop's description on the home page and the password page, as `page-home` and `page-home-fr-ca` print it. Nil for every other page: the parity store's pages that have no text of their own (`page-blog`, `page-cart-empty`, `page-collections`, `page-search`, `page-not-found`, an empty page or collection) print no description meta, and the theme that recorded them falls back to the shop's description itself. The password page is not among the recordings; it keeps the shop's description, which it showed before.
 */
export function pageDescription (pageType: string, resource: LiquidObject | null | undefined, shopDescription: unknown): string | null {
  if (pageType === 'index' || pageType === 'password') return typeof shopDescription === 'string' && shopDescription ? shopDescription : null
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
