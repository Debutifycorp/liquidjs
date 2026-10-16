import { own } from '../util/own'
import type { LinkData, LinkListData, ResourceTranslations, StoreData } from './types'

const cache = new WeakMap<StoreData, Map<string, StoreData>>()

/** `item` with each field of `map` (a translation key to the item's field) replaced by the translation's value when `fields` has one that is not empty: an empty translation is no translation, here as for the shop and the menus (`translateData`). */
function apply<T extends object> (item: T, fields: ResourceTranslations | undefined, map: Partial<Record<keyof ResourceTranslations, keyof T>>): T {
  if (!fields) return item
  const out = { ...item }
  for (const [from, to] of Object.entries(map) as Array<[keyof ResourceTranslations, keyof T]>) {
    if (fields[from]) (out as Record<keyof T, unknown>)[to] = fields[from]
  }
  return out
}

/** The menu's links with their titles replaced in order, children right after their parent, as `TranslationsData.menus` lists them; a link past the end of `titles`, or whose translated title is empty, keeps its title. */
function translateLinks (links: LinkData[], titles: string[], at = { i: 0 }): LinkData[] {
  return links.map(link => {
    const title = titles[at.i++] || link.title
    return { ...link, title, ...(link.links ? { links: translateLinks(link.links, titles, at) } : {}) }
  })
}

/** The menu with its link titles replaced by `titles`; the menu itself when it has none. */
const translateMenu = (menu: LinkListData, titles: string[] | undefined): LinkListData => titles ? { ...menu, links: translateLinks(menu.links, titles) } : menu

/**
 * `data` in `language`: each translated field replaces the default language's, and every other field stays, https://help.shopify.com/en/manual/international/localization-and-translation ("When translations don't exist, your store displays content in your default language"; shopify.dev has no page that says it). Shopify can translate a handle too (its translatable fields include `handle`, for language-specific URLs), but `ResourceTranslations` holds none and the parity store prints every handle as it is (fixture `probe-page-fr-ca`: `/fr-ca/products/hoodie`), so every URL stays the same. The fields are the ones https://shopify.dev/docs/api/admin-graphql/latest/enums/TranslatableResourceType lists as translatable: a product's, collection's, page's and article's title and body (a product's and collection's `body_html` is the `description`, a page's and article's the `content`; an article's `summary_html` is the `excerpt`), a menu link's title, and the shop's `meta_description` (https://shopify.dev/docs/api/admin-graphql/latest/enums/TranslatableResourceType), which the parity store prints as `shop.description` (fixtures `probe-page-home` and `probe-page-fr-ca`; the shop page of shopify.dev, https://shopify.dev/docs/api/liquid/objects/shop, links its description to the meta description setting but does not say so). The shop's name is not translatable there, so `shop.name` stays whatever the language, as the parity store prints it (fixtures `probe-page-fr-ca` and `probe-page-fr-eu`), and `TranslationsData` takes a `shop.name` only for a caller's data that is not the parity store's.
 *
 * An empty translation is ignored everywhere (a resource field, a menu link title, the shop's name and description), so the default language's text shows, as for a translation that does not exist (the help centre sentence above); data that comes from a form can hold `''` for a field nobody translated yet.
 *
 * Cached per data object and language; the default language, and a language with no translations, return `data` itself.
 */
export function translateData (data: StoreData, language: string): StoreData {
  const t = own(data.translations, language)
  if (!t) return data
  let byLanguage = cache.get(data)
  if (!byLanguage) cache.set(data, byLanguage = new Map())
  const hit = byLanguage.get(language)
  if (hit) return hit
  const out: StoreData = {
    ...data,
    shop: { ...data.shop, ...(t.shop?.name ? { name: t.shop.name } : {}), ...(t.shop?.description ? { description: t.shop.description } : {}) }
  }
  const { products, collections, pages, articles, menus } = t
  if (data.products && products) out.products = data.products.map(p => apply(p, own(products, p.handle), { title: 'title', description: 'description' }))
  if (data.collections && collections) out.collections = data.collections.map(c => apply(c, own(collections, c.handle), { title: 'title', description: 'description' }))
  if (data.pages && pages) out.pages = data.pages.map(p => apply(p, own(pages, p.handle), { title: 'title', content: 'content' }))
  if (data.blogs && articles) out.blogs = data.blogs.map(b => ({ ...b, articles: b.articles.map(a => apply(a, own(articles, `${b.handle}/${a.handle}`), { title: 'title', content: 'content', excerpt: 'excerpt' })) }))
  if (data.linklists && menus) out.linklists = data.linklists.map(l => translateMenu(l, own(menus, l.handle)))
  byLanguage.set(language, out)
  return out
}
