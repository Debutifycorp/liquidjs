import { localePrefixes, storefrontSampleData as data, themeLanguages, withLanguages } from '../../src/shopify'
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
    // https://shopify.dev/docs/storefronts/themes/architecture/locales/storefront-locale-files: "A regional locale such as en-CA can inherit keys from its base language file"
    expect(translator('pt-BR').lookup('base_only')).toBe('só pt')
    expect(translator('pt-PT').lookup('plain')).toBe('simples (pt)')
  })
})
