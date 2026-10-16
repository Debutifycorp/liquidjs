import { join } from 'path'
import { renderPage, storefrontSampleData as data } from '../../src/shopify'
import type { StoreData } from '../../src/shopify'
import { buildStore } from '../../src/shopify/store/build'
import { translateData } from '../../src/shopify/store/translate'
import { legacySampleData } from '../shopify/legacy-sample'
import { loadTheme } from '../shopify/theme/load-fixture'
import { probeMatches } from './expect-probe'

const theme = loadTheme(join(__dirname, '../shopify/fixtures/theme'))

const FR_DESCRIPTION = 'Des vêtements du quotidien, bien faits.'

describe('content translations', () => {
  it('replaces translated fields and keeps the rest', () => {
    const fr = translateData(data, 'fr')
    // the shop has no translatable name, only a description (fixtures `probe-page-fr-ca` and `probe-page-fr-eu` print "Debutify Parity" in French)
    expect(fr.shop.name).toBe('Debutify Parity')
    expect(fr.shop.description).toBe(FR_DESCRIPTION)
    expect(fr.shop.domain).toBe(data.shop.domain)
    expect(fr.products?.find(p => p.handle === 'hoodie')?.title).toBe('Sweat à capuche')
    expect(fr.products?.find(p => p.handle === 'black-sunnies')?.title).toBe('Black Sunnies')
    expect(fr.linklists?.[0].links.map(l => l.title)).toEqual(['Hommes', 'Femmes', 'Unisexe', 'Collections', 'Actualités'])
    expect(translateData(data, 'fr')).toBe(fr)
    expect(translateData(data, 'en')).toBe(data)
  })
  it('keeps the default value of a field with no translation, and every handle', () => {
    const fr = translateData(data, 'fr')
    const tee = fr.products?.find(p => p.handle === 'men-t-shirt')
    const original = data.products?.find(p => p.handle === 'men-t-shirt')
    expect(tee?.title).toBe('T-shirt pour homme')
    expect(tee?.description).toBe(original?.description)
    expect(tee?.variants).toBe(original?.variants)
    expect(fr.products?.map(p => p.handle)).toEqual(data.products?.map(p => p.handle))
    expect(fr.collections?.map(c => c.handle)).toEqual(data.collections?.map(c => c.handle))
    expect(fr.pages?.map(p => p.handle)).toEqual(data.pages?.map(p => p.handle))
    expect(fr.pages?.find(p => p.handle === 'faq')).toBe(data.pages?.find(p => p.handle === 'faq'))
    expect(fr.blogs).toBe(data.blogs)
  })
  it('leaves the dataset untouched', () => {
    const before = JSON.stringify(data)
    translateData(data, 'fr')
    expect(JSON.stringify(data)).toBe(before)
    expect(data.shop.description).toBe('Everyday clothing, made well.')
    expect(data.products?.find(p => p.handle === 'hoodie')?.title).toBe('Hoodie')
  })
  it('returns the data itself for a language with no translations, even one named like a prototype property', () => {
    expect(translateData(data, 'de')).toBe(data)
    expect(translateData(data, 'constructor')).toBe(data)
    expect(translateData({ shop: data.shop }, 'fr')).toEqual({ shop: data.shop })
  })
  it('translates articles by blog and article handle, and nested menu links in order, children after their parent', () => {
    const store: StoreData = {
      shop: { name: 'Shop', domain: 'shop.example', currency: 'USD' },
      blogs: [{ id: 1, handle: 'news', title: 'News', articles: [{ id: 2, handle: 'hello', title: 'Hello', content: '<p>Hi</p>', excerpt: 'Hi', published_at: '2026-01-01T00:00:00Z' }, { id: 3, handle: 'bye', title: 'Bye', content: '<p>Bye</p>', published_at: '2026-01-02T00:00:00Z' }] }],
      linklists: [{ handle: 'main-menu', title: 'Main menu', links: [{ title: 'Shop', url: '/collections/all', links: [{ title: 'Men', url: '/collections/men' }, { title: 'Women', url: '/collections/women' }] }, { title: 'News', url: '/blogs/news' }] }, { handle: 'footer', title: 'Footer', links: [{ title: 'Search', url: '/search' }] }],
      translations: { fr: { articles: { 'news/hello': { title: 'Bonjour', content: '<p>Salut</p>', excerpt: 'Salut' } }, menus: { 'main-menu': ['Boutique', 'Hommes', 'Femmes'] } } }
    }
    const fr = translateData(store, 'fr')
    const [hello, bye] = fr.blogs?.[0].articles ?? []
    expect([hello.title, hello.content, hello.excerpt, hello.handle]).toEqual(['Bonjour', '<p>Salut</p>', 'Salut', 'hello'])
    expect(bye).toBe(store.blogs?.[0].articles[1])
    const [main, footer] = fr.linklists ?? []
    // a title the list does not reach keeps the default
    expect(main.links.map(l => l.title)).toEqual(['Boutique', 'News'])
    expect(main.links[0].links?.map(l => l.title)).toEqual(['Hommes', 'Femmes'])
    expect(main.links.map(l => l.url)).toEqual(['/collections/all', '/blogs/news'])
    expect(main.links[1].links).toBeUndefined()
    expect(footer).toBe(store.linklists?.[1])
    expect(store.linklists?.[0].links[0].title).toBe('Shop')
  })
  it('builds each language\'s objects from its own translations', () => {
    const english = buildStore(data)
    const french = buildStore(data, { market: 'ca', language: 'fr', prefix: '' })
    const hoodie = (store: ReturnType<typeof buildStore>) => store.products.liquidMethodMissing('hoodie') as Record<string, any>
    expect(hoodie(english).title).toBe('Hoodie')
    expect(hoodie(french).title).toBe('Sweat à capuche')
    expect(hoodie(french).handle).toBe('hoodie')
    expect(hoodie(french).url).toBe('/products/hoodie')
    // the collection's products are the translated ones
    const tops = (store: ReturnType<typeof buildStore>) => store.collections.liquidMethodMissing('tops') as Record<string, any>
    expect(tops(french).title).toBe('Hauts')
    expect(tops(french).products.find((p: any) => p.handle === 'men-t-shirt').title).toBe('T-shirt pour homme')
    expect(tops(english).products.find((p: any) => p.handle === 'men-t-shirt').title).toBe('Men\'s T-shirt')
    expect((french.pages.liquidMethodMissing('about') as Record<string, any>).title).toBe('À propos')
    expect(french.shop.description).toBe(FR_DESCRIPTION)
    expect(english.shop.description).toBe('Everyday clothing, made well.')
    expect(french.linklists[0].links[0].title).toBe('Hommes')
    expect(english.linklists[0].links[0].title).toBe('Men')
    // a data object with no translations builds as it did
    expect(buildStore(legacySampleData, { market: 'default', language: 'fr', prefix: '' }).shop.name).toBe(legacySampleData.shop.name)
  })
  it('builds one store per language of a market, keyed by the language alone', () => {
    const english = buildStore(data, { market: 'ca', language: 'en', prefix: '' })
    const french = buildStore(data, { market: 'ca', language: 'fr', prefix: '' })
    const hoodie = (store: ReturnType<typeof buildStore>) => (store.products.liquidMethodMissing('hoodie') as Record<string, any>).title
    expect(french).not.toBe(english)
    expect([hoodie(english), hoodie(french)]).toEqual(['Hoodie', 'Sweat à capuche'])
    expect(buildStore(data, { market: 'ca', language: 'en', prefix: '' })).toBe(english)
  })
  it('ignores an empty translation everywhere, as one that does not exist', () => {
    const store: StoreData = {
      shop: { ...data.shop, name: 'Shop', description: 'Default description' },
      products: [{ ...data.products![0], handle: 'tee', title: 'Tee', description: 'A tee' }],
      linklists: [{ handle: 'main-menu', title: 'Main menu', links: [{ title: 'Shop', url: '/collections/all' }, { title: 'News', url: '/blogs/news' }] }],
      translations: { fr: { shop: { name: '', description: '' }, products: { tee: { title: '', description: 'Un tee' } }, menus: { 'main-menu': ['', 'Actualités'] } } }
    }
    const fr = translateData(store, 'fr')
    expect([fr.shop.name, fr.shop.description]).toEqual(['Shop', 'Default description'])
    expect([fr.products![0].title, fr.products![0].description]).toEqual(['Tee', 'Un tee'])
    expect(fr.linklists![0].links.map(l => l.title)).toEqual(['Shop', 'Actualités'])
  })
  it('matches the parity store in French and in English', async () => {
    const pick = (b: any) => ({ shop: [b.shop.name, b.shop.description], product: b.product.title, collection: b.collection.title, page: [b.page.title, b.page.content], menu: b.menu.map((l: any) => l.title) })
    for (const name of ['probe-page-fr-ca', 'probe-page-fr-eu', 'probe-page-en-ca', 'probe-page-en-eu', 'probe-page-home']) {
      const { actual, expected } = await probeMatches(name, pick)
      expect(actual).toEqual(expected)
    }
    for (const name of ['probe-product-fr-ca', 'probe-product-fr-eu']) {
      const product = await probeMatches(name, (b: any) => [b.title, b.description])
      expect(product.actual).toEqual(product.expected)
    }
  })
  it('picks the theme\'s locale file from the request\'s language when the caller names no locale', async () => {
    const greeting = async (options: { request?: { language: string }, locale?: string }) => (await renderPage({ data: legacySampleData, theme, templateName: 'index', ...options })).html
    expect(await greeting({})).toContain('<p>Hello, Sample Store!</p>')
    expect(await greeting({ request: { language: 'fr' } })).toContain('<p>Bonjour, Sample Store !</p>')
    // the caller's locale still decides, as it did
    expect(await greeting({ request: { language: 'fr' }, locale: 'en' })).toContain('<p>Hello, Sample Store!</p>')
    expect(await greeting({ locale: 'fr' })).toContain('<p>Bonjour, Sample Store !</p>')
  })
})
