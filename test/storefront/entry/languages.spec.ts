import { storefrontSampleData } from '../../../src/shopify'
import type { StoreData } from '../../../src/shopify'
import { harness, harnessTheme } from './harness'

const form = (fields: Record<string, string>) => new URLSearchParams({ form_type: 'localization', _method: 'put', ...fields }).toString()

/** A theme that ships English, German, Brazilian Portuguese, Arabic and Japanese, the way a Shopify theme does: `locales/<language>.json` and one `.default.json`. */
function localeTheme () {
  const { 'templates/index.json': _json, ...rest } = harnessTheme().files
  const files = {
    ...rest,
    'layout/theme.liquid': '<!doctype html><html lang="{{ request.locale.iso_code }}" dir="{{ request.locale.direction }}"><head>{{ content_for_header }}</head><body>{{ content_for_layout }}</body></html>',
    'templates/index.liquid': [
      '<h1>{{ "hello" | t }}</h1>',
      '<p id="n0">{{ "items" | t: count: 0 }}</p><p id="n1">{{ "items" | t: count: 1 }}</p><p id="n2">{{ "items" | t: count: 2 }}</p><p id="n5">{{ "items" | t: count: 5 }}</p><p id="n11">{{ "items" | t: count: 11 }}</p>',
      '<p id="only">{{ "english_only" | t }}</p><p id="gone">{{ "nowhere" | t }}</p>',
      '<p id="root">{{ routes.root_url }}</p><p id="cart">{{ routes.cart_url }}</p><p id="product">{{ all_products["hoodie"].url }}</p>',
      '<p id="langs">{% for l in localization.available_languages %}{{ l.iso_code }}={{ l.endonym_name }}={{ l.root_url }}{% unless forloop.last %};{% endunless %}{% endfor %}</p>',
      '<p id="title">{{ all_products["hoodie"].title }}</p>',
      '<p id="current">{{ localization.language.iso_code }}/{{ request.locale.primary }}</p>'
    ].join('\n'),
    'locales/en.default.json': JSON.stringify({ hello: 'Hello', items: { one: '{{ count }} item', other: '{{ count }} items' }, english_only: 'English only' }),
    'locales/de.json': JSON.stringify({ hello: 'Hallo', items: { one: '{{ count }} Artikel', other: '{{ count }} Artikel' } }),
    'locales/pt-BR.json': JSON.stringify({ hello: 'Olá', items: { one: '{{ count }} item', many: '{{ count }} de itens', other: '{{ count }} itens' } }),
    'locales/ar.json': JSON.stringify({ hello: 'مرحبا', items: { zero: 'صفر', one: 'واحد', two: 'اثنان', few: '{{ count }} قليل', many: '{{ count }} كثير', other: '{{ count }} آخر' } }),
    'locales/ja.json': JSON.stringify({ hello: 'こんにちは', items: { other: '{{ count }}個' } }),
    'locales/en.default.schema.json': '{}'
  }
  delete files['templates/index.json']
  return { files }
}

const paragraph = (html: string, id: string) => new RegExp(`<p id="${id}">([^<]*)</p>`).exec(html)?.[1]

describe('languages: theme', () => {
  const data = { ...storefrontSampleData, markets: undefined } as StoreData

  it('changes nothing without the option', async () => {
    const { send } = harness({ theme: localeTheme(), data })
    expect((await send('GET', '/de')).status).toBe(404)
    const home = await send('GET', '/')
    expect(paragraph(home.text, 'langs')).toBe('en=English=/;fr=français=/fr')
  })

  it('serves every language the theme has a locale file for, at its own subfolder', async () => {
    const { send } = harness({ theme: localeTheme(), data, languages: 'theme' })
    const home = await send('GET', '/')
    expect(home.text).toContain('<h1>Hello</h1>')
    expect(home.text).toContain('lang="en" dir="ltr"')
    expect(paragraph(home.text, 'langs')).toBe('en=English=/;fr=français=/fr;de=Deutsch=/de;pt-BR=português (Brasil)=/pt-br;ar=العربية=/ar;ja=日本語=/ja')
    const de = await send('GET', '/de')
    expect(de.status).toBe(200)
    expect(de.text).toContain('<h1>Hallo</h1>')
    expect(paragraph(de.text, 'root')).toBe('/de')
    expect(paragraph(de.text, 'cart')).toBe('/de/cart')
    expect(paragraph(de.text, 'product')).toBe('/de/products/hoodie')
    expect(paragraph(de.text, 'current')).toBe('de/false')
    const br = await send('GET', '/pt-br')
    expect(br.status).toBe(200)
    expect(br.text).toContain('<h1>Olá</h1>')
    expect(br.text).toContain('lang="pt-BR"')
    expect(paragraph(br.text, 'root')).toBe('/pt-br')
  })

  it('reads plural keys by the language\'s CLDR categories and falls back to the default file for a missing key', async () => {
    const { send } = harness({ theme: localeTheme(), data, languages: 'theme' })
    const en = await send('GET', '/')
    expect(['n0', 'n1', 'n2'].map(id => paragraph(en.text, id))).toEqual(['0 items', '1 item', '2 items'])
    const ar = await send('GET', '/ar')
    expect(['n0', 'n1', 'n2', 'n5', 'n11'].map(id => paragraph(ar.text, id))).toEqual(['صفر', 'واحد', 'اثنان', '5 قليل', '11 كثير'])
    const ja = await send('GET', '/ja')
    expect(paragraph(ja.text, 'n1')).toBe('1個')
    expect(paragraph(ja.text, 'only')).toBe('English only')
    expect(paragraph(ja.text, 'gone')).toBe('translation missing: ja.nowhere')
    // Brazilian Portuguese: a million is `many` in CLDR
    const br = await send('GET', '/pt-br')
    expect(paragraph(br.text, 'n1')).toBe('1 item')
    expect(paragraph(br.text, 'n5')).toBe('5 itens')
  })

  it('is right to left for Arabic and shows the primary language\'s content where a language has no translation', async () => {
    const { send } = harness({ theme: localeTheme(), data, languages: 'theme' })
    const ar = await send('GET', '/ar')
    expect(ar.text).toContain('lang="ar" dir="rtl"')
    expect(paragraph(ar.text, 'title')).toBe('Hoodie')
    const fr = await send('GET', '/fr')
    expect(paragraph(fr.text, 'title')).toBe('Sweat à capuche')
  })

  it('moves the visitor to a language\'s subfolder and back, under the base path', async () => {
    const { send } = harness({ theme: localeTheme(), data, languages: 'theme' }, { visitor: 'test-visitor-key-0001', basePath: '/p/tok' })
    const moved = await send('POST', '/p/tok/localization', form({ language_code: 'pt-BR', return_to: '/p/tok/pages/about' }))
    expect([moved.status, moved.headers.get('location')]).toEqual([302, '/p/tok/pt-br/pages/about'])
    const dawn = await send('POST', '/p/tok/pt-br/localization', form({ locale_code: 'ar', return_to: '/p/tok/pt-br/pages/about' }))
    expect(dawn.headers.get('location')).toBe('/p/tok/ar/pages/about')
    const back = await send('POST', '/p/tok/ar/localization', form({ language_code: 'en', return_to: '/p/tok/ar/pages/about' }))
    expect(back.headers.get('location')).toBe('/p/tok/pages/about')
    // the token route works under a language prefix
    const page = await send('GET', '/p/tok/de')
    expect(page.status).toBe(200)
    expect(paragraph(page.text, 'root')).toBe('/p/tok/de')
    expect(paragraph(page.text, 'langs')).toContain('pt-BR=português (Brasil)=/p/tok/pt-br')
  })

  it('offers the languages in the primary market and leaves the other markets as they are', async () => {
    const { send } = harness({ theme: localeTheme(), languages: 'theme' }, { visitor: 'test-visitor-key-0001' })
    expect((await send('GET', '/de')).text).toContain('<h1>Hallo</h1>')
    expect((await send('GET', '/de-ca')).status).toBe(404)
    const ca = await send('GET', '/fr-ca')
    expect(paragraph(ca.text, 'langs')).toBe('en=English=/en-ca;fr=français=/fr-ca')
    // a language the Canadian market does not offer is its default one
    const moved = await send('POST', '/en-ca/localization', form({ language_code: 'pt-BR', return_to: '/en-ca/pages/about' }))
    expect(moved.headers.get('location')).toBe('/en-ca/pages/about')
  })

  it('does nothing for a theme with no locale files beyond its default', async () => {
    const theme = localeTheme()
    for (const file of Object.keys(theme.files)) if (/^locales\/(?!en\.default)/.test(file)) delete (theme.files as Record<string, string>)[file]
    const { send } = harness({ theme, data, languages: 'theme' })
    const home = await send('GET', '/')
    expect(paragraph(home.text, 'langs')).toBe('en=English=/;fr=français=/fr')
    expect((await send('GET', '/de')).status).toBe(404)
  })
})
