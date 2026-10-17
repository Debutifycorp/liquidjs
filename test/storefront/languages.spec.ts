import { localePrefixes, renderPage, storefrontSampleData as data, themeLanguages, withLanguages } from '../../src/shopify'
import type { StoreData } from '../../src/shopify'
import { buildLocalization, languageIn } from '../../src/shopify/store/markets'
import { resolveView } from '../../src/shopify/store/view'
import { Translator } from '../../src/shopify/translations'

const plain: StoreData = { shop: { name: 'Shop', domain: 'shop.example', currency: 'USD', locale: 'en' } }

describe('the languages a theme ships', () => {
  it('lists the storefront locale files, the default one first and none of the schema files', () => {
    const files = { 'locales/en.default.json': '{}', 'locales/de.json': '{}', 'locales/pt-BR.json': '{}', 'locales/en.default.schema.json': '{}', 'locales/de.schema.json': '{}', 'sections/a.liquid': '' }
    expect(themeLanguages({ files })).toEqual(['en', 'de', 'pt-BR'])
    expect(themeLanguages({ files: { 'sections/a.liquid': '' } })).toEqual([])
  })

  it('puts each language on the store with Shopify\'s name and endonym, the store\'s own languages kept as they are', () => {
    const out = withLanguages(plain, ['en', 'de', 'pt-BR', 'zh-TW', 'zh-CN', 'nb', 'ar'])
    const by = (iso: string) => out.languages?.find(l => l.iso_code === iso)
    expect(out.languages?.map(l => l.iso_code)).toEqual(['en', 'de', 'pt-BR', 'zh-TW', 'zh-CN', 'nb', 'ar'])
    expect(by('en')).toEqual({ iso_code: 'en', name: 'English', endonym_name: 'English' })
    expect(by('de')).toEqual({ iso_code: 'de', name: 'German', endonym_name: 'Deutsch' })
    expect(by('pt-BR')).toEqual({ iso_code: 'pt-BR', name: 'Portuguese (Brazil)', endonym_name: 'português (Brasil)' })
    // https://help.shopify.com/en/manual/international/languages/requirements lists "Chinese (Simplified)" and "Chinese (Traditional)"
    expect(by('zh-TW')).toMatchObject({ name: 'Chinese (Traditional)', endonym_name: '繁體中文' })
    expect(by('zh-CN')).toMatchObject({ name: 'Chinese (Simplified)', endonym_name: '简体中文' })
    expect(by('ar')).toMatchObject({ name: 'Arabic', endonym_name: 'العربية' })
    const sample = withLanguages(data, ['en', 'fr', 'de'])
    expect(sample.languages).toEqual([...data.languages!, { iso_code: 'de', name: 'German', endonym_name: 'Deutsch' }])
  })

  it('is the same object for the same data and languages, and leaves the data alone', () => {
    const before = JSON.stringify(data)
    expect(withLanguages(data, ['de', 'ja'])).toBe(withLanguages(data, ['de', 'ja']))
    expect(JSON.stringify(data)).toBe(before)
    expect(withLanguages(data, ['en'])).toBe(data)
    expect(withLanguages(data, [])).toBe(data)
  })

  it('offers them in the primary market, after the languages it has, and leaves the other markets as they are', () => {
    const out = withLanguages(data, ['en', 'fr', 'de', 'pt-BR'])
    expect(out.markets?.map(m => [m.handle, m.languages])).toEqual([['us', ['en', 'fr', 'de', 'pt-BR']], ['ca', ['en', 'fr']], ['eu', ['en', 'fr']]])
  })

  it('offers a language the data lists but the primary market lacks (the sample\'s French)', () => {
    const out = withLanguages(data, ['en', 'fr'])
    expect(out.languages).toBe(data.languages)
    expect(out.markets?.map(m => [m.handle, m.languages])).toEqual([['us', ['en', 'fr']], ['ca', ['en', 'fr']], ['eu', ['en', 'fr']]])
    expect(localePrefixes(out).filter(p => p.market === 'us').map(p => p.prefix)).toEqual(['/fr'])
    expect(withLanguages(out, ['en', 'fr'])).toBe(out)
  })

  it('forms the subfolders as Shopify does: the primary market\'s other languages at /<language>, other markets at /<language>-<subfolder>, all lower case', () => {
    const out = withLanguages(plain, ['en', 'de', 'pt-BR', 'zh-TW'])
    expect(localePrefixes(out).map(p => p.prefix)).toEqual(['/de', '/pt-br', '/zh-tw'])
    expect(localePrefixes(out).map(p => p.language)).toEqual(['de', 'pt-BR', 'zh-TW'])
    const sample = localePrefixes(withLanguages(data, ['en', 'fr', 'pt-BR'])).map(p => p.prefix)
    expect(sample).toEqual(['/fr', '/pt-br', '/en-ca', '/fr-ca', '/en-eu', '/fr-eu'])
  })

  it('describes them to a theme: available_languages with root_url, the current language, primary, direction', () => {
    const out = withLanguages(plain, ['en', 'de', 'ar'])
    const view = resolveView(out, { basePath: '/p/tok', localePrefix: '/ar', market: 'default', language: 'ar' })
    const localization = buildLocalization(out, view) as Record<string, any>
    expect(localization.available_languages.map((l: any) => [l.iso_code, l.root_url, l.primary, l.direction])).toEqual([['en', '/p/tok', true, 'ltr'], ['de', '/p/tok/de', false, 'ltr'], ['ar', '/p/tok/ar', false, 'rtl']])
    expect(localization.language.iso_code).toBe('ar')
    expect(languageIn(out, view, 'ar')).toMatchObject({ endonym_name: 'العربية', direction: 'rtl', primary: false })
    // `name` is in the store's primary language on an English page
    const english = resolveView(out, { basePath: '', localePrefix: '', language: 'en' })
    expect(languageIn(out, english, 'de').name).toBe('German')
  })
})

describe('translations in every language', () => {
  const locales = {
    en: { n: { one: '{{ count }} item', other: '{{ count }} items' }, only_en: 'English only', plain: 'plain' },
    ar: { n: { zero: 'لا شيء', one: 'واحد', two: 'اثنان', few: '{{ count }} قليل', many: '{{ count }} كثير', other: '{{ count }} آخر' } },
    ja: { n: { other: '{{ count }}個' } },
    'pt-BR': { plain: 'simples' },
    pt: { plain: 'simples (pt)', base_only: 'só pt' }
  }
  const translator = (locale: string) => new Translator({ locale, defaultLocale: 'en', locales })

  it('reads the language\'s file, then the default file for a missing key', () => {
    expect(translator('pt-BR').lookup('plain')).toBe('simples')
    expect(translator('pt-BR').lookup('only_en')).toBe('English only')
    expect(translator('ja').lookup('only_en')).toBe('English only')
    // the chain for a theme's own keys (own file, base language file, default file) is Debutify's reading: shopify.dev's sentence "A regional locale such as `en-CA` can inherit keys from its base language file" is about Shopify-provided keys
    expect(translator('pt-BR').lookup('base_only')).toBe('só pt')
    expect(translator('pt-PT').lookup('plain')).toBe('simples (pt)')
  })
})

describe('schema locale files', () => {
  it('translate a t: default by the language of the page', async () => {
    const files = {
      'layout/theme.liquid': '{{ content_for_layout }}',
      'sections/s.liquid': '<p>{{ section.settings.label }}</p>{% schema %}{"name":"t:sections.s.name","settings":[{"type":"text","id":"label","label":"x","default":"t:sections.s.default"}]}{% endschema %}',
      'templates/index.json': '{"sections":{"a":{"type":"s"}},"order":["a"]}',
      'locales/en.default.json': '{}',
      'locales/en.default.schema.json': '{"sections":{"s":{"name":"S","default":"Default"}}}',
      'locales/ja.schema.json': '{"sections":{"s":{"default":"デフォルト"}}}'
    }
    const printed = async (locale: string) => /<p>([^<]*)<\/p>/.exec((await renderPage({ theme: { files }, templateName: 'index', locale })).html)?.[1]
    expect(await printed('en')).toBe('Default')
    expect(await printed('ja')).toBe('デフォルト')
    // a language with no schema file, or no such key, reads the default file
    expect(await printed('de')).toBe('Default')
  })
})

describe('dates in the page\'s language', () => {
  // https://shopify.dev/docs/storefronts/themes/architecture/locales/storefront-locale-files ("Date and time localization"): the `date` and `time_tag` filters "have default format options that will display in the appropriate format for the store's active language"
  const files: Record<string, string> = {
    'layout/theme.liquid': '{{ content_for_layout }}',
    'templates/index.liquid': [
      '{% assign d = "2018-12-31T16:56:00Z" %}',
      '<p id="date">{{ d | date: format: "date" }}</p>',
      '<p id="abbr">{{ d | date: format: "abbreviated_date" }}</p>',
      '<p id="basic">{{ d | date: format: "basic" }}</p>',
      '<p id="words">{{ d | date: "%A %a %B %b %d" }}</p>',
      '<p id="tag">{{ d | time_tag }}</p>',
      '<p id="tagfmt">{{ d | time_tag: format: "abbreviated_date" }}</p>',
      '<p id="mine">{{ d | date: format: "mine" }}</p>'
    ].join('\n'),
    'locales/en.default.json': '{"date_formats":{"mine":"%Y/%m/%d"}}',
    'locales/de.json': '{}',
    'locales/fr.json': '{"date_formats":{"mine":"%d-%m-%Y"}}',
    'locales/ja.json': '{}',
    'locales/ar.json': '{}'
  }
  const page = async (locale: string) => {
    const html = (await renderPage({ theme: { files }, templateName: 'index', locale, services: { currentTime: () => new Date('2018-12-31T16:56:00Z') } })).html
    const get = (id: string) => new RegExp(`<p id="${id}">([\\s\\S]*?)</p>`).exec(html)?.[1]
    return Object.fromEntries(['date', 'abbr', 'basic', 'words', 'tag', 'tagfmt', 'mine'].map(id => [id, get(id)]))
  }

  it('keeps the English formats exactly', async () => {
    expect(await page('en')).toEqual({ date: 'December 31, 2018', abbr: 'Dec 31, 2018', basic: '12/31/2018', words: 'Monday Mon December Dec 31', tag: '<time datetime="2018-12-31T16:56:00Z">December 31, 2018</time>', tagfmt: '<time datetime="2018-12-31T16:56:00Z">Dec 31, 2018</time>', mine: '2018/12/31' })
  })
  it('writes German, French and Japanese dates and day and month names in their own language', async () => {
    const de = await page('de')
    expect(de).toMatchObject({ date: '31. Dezember 2018', abbr: '31. Dez. 2018', basic: '31.12.2018', words: 'Montag Mo Dezember Dez 31' })
    expect(de.tag).toBe('<time datetime="2018-12-31T16:56:00Z">31. Dezember 2018</time>')
    // "If a custom format is missing in the locale file of the active language, then a Liquid error is rendered": German has no `mine`, the default file's does not stand in for it
    expect(de.mine).toMatch(/Liquid error/)
    expect(await page('fr')).toMatchObject({ date: '31 décembre 2018', abbr: '31 déc. 2018', basic: '31/12/2018', words: 'lundi lun. décembre déc. 31', mine: '31-12-2018' })
    expect(await page('ja')).toMatchObject({ date: '2018年12月31日', abbr: '2018年12月31日', basic: '2018/12/31', words: '月曜日 月 12月 12月 31' })
  })
  it('writes Arabic dates as the runtime writes them in Arabic', async () => {
    const ar = await page('ar')
    const when = new Date('2018-12-31T16:56:00Z')
    const intl = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('ar', options).format(when)
    expect(ar.date).toBe(intl({ year: 'numeric', month: 'long', day: 'numeric' }))
    expect(ar.date).not.toMatch(/December/)
    expect(ar.words).toContain(intl({ weekday: 'long' }))
    expect(ar.words).toContain(intl({ month: 'long' }))
  })
  it('keeps a regional language\'s own words (pt-BR)', async () => {
    expect((await page('pt-BR')).date).toBe('31 de dezembro de 2018')
  })
})
