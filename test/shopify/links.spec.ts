import { createShopifyLiquid, renderLiquid } from '../../src/shopify'
import type { StoreData } from '../../src/shopify'
import { buildLinklists, buildStore } from '../../src/shopify/store/build'
import { resolveView } from '../../src/shopify/store/view'

const liquid = createShopifyLiquid()
const render = async (source: string, scope: object) => (await renderLiquid(liquid, source, scope)).html

const data: StoreData = {
  shop: { name: 'S', domain: 's.example', currency: 'USD', locale: 'en' },
  languages: [{ iso_code: 'en', name: 'English', endonym_name: 'English' }, { iso_code: 'fr', name: 'French', endonym_name: 'français' }],
  linklists: [{ handle: 'main-menu', title: 'Main menu', links: [{ title: 'News', url: '/blogs/news' }, { title: "Men's & Women's", url: '/collections/all', links: [{ title: 'Tops', url: '/collections/tops' }] }, { title: 'Sale', url: '/collections/sale', handle: 'summer-sale' }] }],
  translations: { fr: { menus: { 'main-menu': ['Actualités', 'Hommes et femmes', 'Hauts', 'Soldes'] } } }
}

describe('link.handle', () => {
  it('is the handle of the link title, or the data\'s, so each menu id is its own', async () => {
    const linklists = buildLinklists(buildStore(data).linklists, '/')
    expect(await render("{% for l in linklists['main-menu'].links %}HeaderMenu-{{ l.handle }}{% for c in l.links %}/{{ c.handle }}{% endfor %} {% endfor %}|{{ linklists['main-menu'].links.first.data_sharing_opt_out_icon | json }}", { linklists }))
      .toBe('HeaderMenu-news HeaderMenu-mens-womens/tops HeaderMenu-summer-sale |null')
  })
  it('gives a link whose title handleizes to nothing its position, and a repeated handle a number, so no two siblings share one', async () => {
    const menus: StoreData = { ...data, linklists: [{ handle: 'main-menu', title: 'Main menu', links: [{ title: 'ホーム', url: '/' }, { title: '  ', url: '/a' }, { title: 'Sale', url: '/b' }, { title: 'Sale', url: '/c' }, { title: 'Sale', url: '/d', links: [{ title: 'Sale', url: '/e' }] }, { title: 'Café Été', url: '/f' }] }] }
    const linklists = buildLinklists(buildStore(menus).linklists, '/')
    expect(await render("{% for l in linklists['main-menu'].links %}{{ l.handle }}{% for c in l.links %}/{{ c.handle }}{% endfor %} {% endfor %}", { linklists })).toBe('link-1 link-2 sale sale-1 sale-2/sale caf-t ')
  })
  it('keeps the primary language\'s handle on a translated menu', async () => {
    const store = buildStore(data, resolveView(data, { language: 'fr', localePrefix: '/fr' }))
    const linklists = buildLinklists(store.linklists, '/fr', store.prefix)
    expect(await render("{% for l in linklists['main-menu'].links %}{{ l.title }}={{ l.handle }} {% endfor %}", { linklists })).toBe('Actualités=news Hommes et femmes=mens-womens Soldes=summer-sale ')
  })
})

describe('link.object', () => {
  const content: StoreData = {
    shop: { name: 'S', domain: 's.example', currency: 'USD', locale: 'en', policies: [{ type: 'privacy_policy', body: '<p>Private</p>' }] },
    products: [{ id: 1, handle: 'tee', title: 'Tee', options: ['Size'], variants: [{ id: 11, title: 'S', option1: 'S', price: 3000, available: true }] }],
    collections: [{ id: 5, handle: 'tops', title: 'Tops', products: ['tee'] }],
    pages: [{ id: 7, handle: 'about', title: 'About', content: '<p>About</p>' }],
    blogs: [{ id: 9, handle: 'news', title: 'News', articles: [{ id: 91, handle: 'hello', title: 'Hello', content: '<p>Hi</p>', published_at: '2026-01-01T00:00:00Z' }] }],
    linklists: [{
      handle: 'main-menu',
      title: 'Main menu',
      links: [
        { title: 'Tops', url: '/collections/tops', links: [{ title: 'Tee', url: '/collections/tops/products/tee?variant=11' }] },
        { title: 'About', url: '/pages/about' },
        { title: 'News', url: '/blogs/news', links: [{ title: 'Hello', url: '/blogs/news/hello' }] },
        { title: 'Privacy', url: '/policies/privacy-policy' },
        { title: 'Catalog', url: '/collections/all' },
        { title: 'All collections', url: '/collections' },
        { title: 'Vendor', url: '/collections/vendors?q=Acme' },
        { title: 'Gone', url: '/products/missing' },
        { title: 'Elsewhere', url: 'https://example.com/products/tee' },
        { title: 'Home', url: '/' }
      ]
    }]
  }
  const kinds = '{% for l in linklists["main-menu"].links %}{{ l.title }}={{ l.object.handle | default: l.object.title | default: "nil" }};{% for c in l.links %}{{ c.title }}={{ c.object.handle | default: "nil" }};{% endfor %}{% endfor %}'

  it('is the collection, page, blog, article, policy or product the link points at, read from its address', async () => {
    const store = buildStore(content)
    const linklists = buildLinklists(content.linklists!, '/', '', store)
    expect(await render(kinds, { linklists })).toBe('Tops=tops;Tee=tee;About=about;News=news;Hello=hello;Privacy=Privacy policy;Catalog=nil;All collections=nil;Vendor=nil;Gone=nil;Elsewhere=nil;Home=nil;')
  })

  it('is the very object the store holds, so a theme reads its image and products', async () => {
    const store = buildStore(content)
    const linklists = buildLinklists(content.linklists!, '/', '', store)
    expect(await render('{{ linklists["main-menu"].links.first.object.products.first.title }}|{{ linklists["main-menu"].links.first.object.products_count }}|{{ linklists["main-menu"].links.first.links.first.object.variants.first.price }}', { linklists })).toBe('Tee|1|3000')
  })

  it('is nil when the menu is built without the store\'s objects', async () => {
    const linklists = buildLinklists(content.linklists!, '/')
    expect(await render('{{ linklists["main-menu"].links.first.object | json }}', { linklists })).toBe('null')
  })

  it('serves the objects of the page\'s language on a translated view', async () => {
    const translated: StoreData = { ...content, languages: [{ iso_code: 'en', name: 'English', endonym_name: 'English' }, { iso_code: 'fr', name: 'French', endonym_name: 'français' }], translations: { fr: { collections: { tops: { title: 'Hauts' } } } } }
    const store = buildStore(translated, resolveView(translated, { language: 'fr', localePrefix: '/fr' }))
    const linklists = buildLinklists(store.linklists, '/fr', store.prefix, store)
    expect(await render('{{ linklists["main-menu"].links.first.object.title }}|{{ linklists["main-menu"].links.first.object.url }}', { linklists })).toBe('Hauts|/fr/collections/tops')
  })
})
