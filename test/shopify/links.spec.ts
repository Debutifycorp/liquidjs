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
