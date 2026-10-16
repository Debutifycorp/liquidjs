import { DEFAULT_MONEY_FORMAT, DEFAULT_MONEY_WITH_CURRENCY_FORMAT } from '../state'
import type { LiquidObject } from './build'
import { localePrefixes } from './request'
import { defaultCountry } from './view'
import type { StoreView } from './view'
import type { LanguageData, MarketData, StoreData } from './types'

/** The currency of a view's market: https://shopify.dev/docs/api/liquid/objects/currency (`iso_code`, `symbol`, and a `name` that is the ISO code unless the market data names it), with the market's `rate`, price `rounding` and `adjustment` (`convert` in `pricing.ts` prices products with them), whether the currency is the shop's own (`own`: its prices are not converted), whether the market hides compare-at prices (`hide_compare_at_prices`, `MarketData`) and the two money formats its prices print in. */
export interface ViewCurrency {
  iso_code: string
  symbol: string
  name: string
  rate: number
  rounding: boolean | number
  adjustment: number
  own: boolean
  hide_compare_at_prices: boolean
  money_format: string
  money_with_currency_format: string
}

const defaults = new WeakMap<StoreData, MarketData[]>()

/**
 * The legacy `localization` of a store with neither markets nor languages: `StoreData.localization` was the whole of what the engine knew of a store's country and language (one of each), and such a store renders as it did then, with the country and language the data names whatever the shop's locale or currency say. Undefined for any other store.
 */
const legacyLocalization = (data: StoreData) => data.markets?.length || data.languages?.length ? undefined : data.localization

/** The language the store's names (countries, languages) are written in, and its primary language: the first published language, otherwise the language of the legacy `localization` (`legacyLocalization`) or the shop's locale. */
export const primaryLanguage = (data: StoreData): string => data.languages?.[0]?.iso_code ?? legacyLocalization(data)?.language.iso_code ?? data.shop.locale ?? 'en'

/**
 * The store's markets, https://shopify.dev/docs/api/liquid/objects/market. A store whose data names none has one market, `default`, of the shop's country (`localization.country` or the United States), currency and languages (`languages` or the shop's locale), which is what the engine rendered before it had markets.
 */
export function marketsOf (data: StoreData): MarketData[] {
  if (data.markets?.length) return data.markets
  let market = defaults.get(data)
  if (!market) {
    const country = data.localization?.country
    market = [{
      handle: 'default',
      name: 'Default',
      primary: true,
      countries: [{ iso_code: country?.iso_code ?? 'US', name: country?.name ?? 'United States' }],
      // the shop's own currency, whatever currency the legacy country shows (`buildLocalization`): prices, the cart and `Shopify.currency` stay in the shop's currency, as before
      currency: { iso_code: data.shop.currency, symbol: country?.currency.symbol ?? '$', name: country?.currency.name, rate: 1 },
      languages: data.languages?.length ? data.languages.map(l => l.iso_code) : [primaryLanguage(data)]
    }]
    defaults.set(data, market)
  }
  return market
}

const primaryOf = (markets: MarketData[]): MarketData => markets.find(m => m.primary) ?? markets[0]

/** The market with `handle`; the primary market when the store has none by that handle. */
export const marketOf = (data: StoreData, handle: string): MarketData => {
  const markets = marketsOf(data)
  return markets.find(m => m.handle === handle) ?? primaryOf(markets)
}

/**
 * The money formats of the view's currency, which `money` and `money_with_currency` print prices in (https://shopify.dev/docs/api/liquid/filters/money). The shop's own formats serve its own currency, and a store without markets has only that; a market that gives its formats uses them; any other currency writes its symbol before the amount, with `{{amount_with_comma_separator}}` for the euro, as the parity store prints them (fixtures `probe-page-en-ca` and `probe-page-fr-eu`: `$19.99` and `$19.99 CAD`, `€19,99` and `€19,99 EUR`). The euro is the only currency whose default the fixtures show; shopify.dev does not list the defaults, so every other currency uses `{{amount}}`.
 */
export function currencyOf (data: StoreData, view: StoreView): ViewCurrency {
  const market = marketOf(data, view.market)
  const c = market.currency
  const own = c.iso_code === data.shop.currency || !data.markets?.length
  const amount = c.iso_code === 'EUR' ? '{{amount_with_comma_separator}}' : '{{amount}}'
  return {
    iso_code: c.iso_code,
    symbol: c.symbol,
    name: c.name ?? c.iso_code,
    rate: c.rate,
    rounding: c.rounding ?? false,
    adjustment: market.price_adjustment ?? 0,
    own,
    hide_compare_at_prices: market.hide_compare_at_prices ?? false,
    money_format: c.money_format ?? (own ? data.shop.money_format ?? DEFAULT_MONEY_FORMAT : `${c.symbol}${amount}`),
    money_with_currency_format: c.money_with_currency_format ?? (own ? data.shop.money_with_currency_format ?? DEFAULT_MONEY_WITH_CURRENCY_FORMAT : `${c.symbol}${amount} ${c.iso_code}`)
  }
}

/** The currencies of all the store's markets, one a currency, in ISO order as the parity store lists `shop.enabled_currencies` (fixture `probe-page-home`: CAD, EUR, USD, though its markets run USD, CAD, EUR), each as https://shopify.dev/docs/api/liquid/objects/currency. */
export function enabledCurrencies (data: StoreData): LiquidObject[] {
  const byCode = new Map(marketsOf(data).map(m => [m.currency.iso_code, { iso_code: m.currency.iso_code, symbol: m.currency.symbol, name: m.currency.name ?? m.currency.iso_code }]))
  return [...byCode.values()].sort((a, b) => a.iso_code < b.iso_code ? -1 : 1)
}

/** `Intl.DisplayNames` is not in the TypeScript `lib` this package builds with, and a runtime may lack it or a locale. */
interface DisplayNames { of: (code: string) => string | undefined, resolvedOptions: () => { locale: string } }
type DisplayNamesConstructor = new (locales: string[], options: { type: string }) => DisplayNames

const displayNames = new Map<string, DisplayNames | undefined>()

/** Whether `resolved`, the locale a `Intl` object settled on, is `locale`'s language: for a language the runtime does not know (`zz`) it settles on its default (`en-US`) without saying so. */
const sameLanguage = (resolved: string, locale: string) => resolved.split('-')[0].toLowerCase() === locale.split('-')[0].toLowerCase()

function namesIn (locale: string, type: 'region' | 'language'): DisplayNames | undefined {
  const key = `${locale}|${type}`
  if (!displayNames.has(key)) {
    const Names = (Intl as unknown as { DisplayNames?: DisplayNamesConstructor }).DisplayNames
    let names: DisplayNames | undefined
    try {
      names = Names && new Names([locale], { type })
      // a language the runtime has no names for would be named in English
      if (names && !sameLanguage(names.resolvedOptions().locale, locale)) names = undefined
    } catch {
      // not a locale this runtime knows
      names = undefined
    }
    displayNames.set(key, names)
  }
  return displayNames.get(key)
}

/** The name `Intl.DisplayNames` gives `code` in `locale`; none when the runtime has no names for the locale, no name for the code, or the code is malformed (`of` throws on it): the ISO 639 (`fr`) and ISO 3166 (`CA`) codes mean the same in any language, and a name `Intl` gives back as the code itself is not a name. */
function nameIn (locale: string, type: 'region' | 'language', code: string): string | undefined {
  try {
    const name = namesIn(locale, type)?.of(code)
    return name && name !== code ? name : undefined
  } catch {
    return undefined
  }
}

/** The language of `iso` as the store's data names it; a language the data does not list is named by its code. */
function languageData (data: StoreData, iso: string): LanguageData {
  const listed = data.languages?.find(l => l.iso_code === iso)
  if (listed) return listed
  return { iso_code: iso, name: iso, endonym_name: iso }
}

/**
 * The language `iso` as https://shopify.dev/docs/api/liquid/objects/shop_locale describes it, in the view: `endonym_name` is its name in itself, `primary` is whether it is the store's primary language, and `name` is "the name of the locale in the store's primary locale" by that page, so `French` on a store whose primary language is English. On the French pages the parity store prints `français`, not `French`, for the French language (fixture `probe-page-fr-ca`), so there the fixture wins: a view in another language than the store's primary one names its own language by its endonym and any other by `Intl.DisplayNames` in the view's language (`anglais`; no fixture shows one, so it is the same idea applied, with the dataset's name when the runtime has none).
 */
export function languageIn (data: StoreData, view: StoreView, iso: string): { iso_code: string, name: string, endonym_name: string, primary: boolean } {
  const primary = primaryLanguage(data)
  // the legacy `localization` names the store's one language, and the page's locale is named after it whatever its code (`request.locale.name` was that language's name, `endonym_name` its endonym or name)
  const legacy = legacyLocalization(data)?.language
  if (legacy) return { iso_code: iso, name: legacy.name, endonym_name: legacy.endonym_name ?? legacy.name, primary: iso === primary }
  const language = languageData(data, iso)
  const name = view.language === primary ? language.name : iso === view.language ? language.endonym_name : nameIn(view.language, 'language', iso) ?? language.name
  return { iso_code: iso, name, endonym_name: language.endonym_name, primary: iso === primary }
}

/** The base path of a view: its prefix without its own locale prefix, since `resolveView` writes the prefix as the base path followed by the locale prefix. */
export function basePathOf (data: StoreData, view: StoreView): string {
  const own = localePrefixes(data).find(p => p.market === view.market && p.language === view.language)?.prefix ?? ''
  return own && view.prefix.endsWith(own) ? view.prefix.slice(0, -own.length) : view.prefix
}

/** The URL prefix of `language` in `market` under `basePath`: the locale prefix `localePrefixes` gives it (`/fr-ca`), none for the primary market's first language and for a market the store serves without a subfolder. */
const prefixOf = (prefixes: ReturnType<typeof localePrefixes>, basePath: string, market: MarketData, language: string) => `${basePath}${prefixes.find(p => p.market === market.handle && p.language === language)?.prefix ?? ''}`

/** A country's name in the view's language: the dataset's (the primary language's) when the view is in that, otherwise `Intl.DisplayNames`' (`Allemagne`, as the parity store prints on its French pages, fixture `probe-page-fr-ca`), or the dataset's when the runtime has none. */
const countryName = (data: StoreData, view: StoreView, country: { iso_code: string, name: string }) => view.language === primaryLanguage(data) || legacyLocalization(data) ? country.name : nameIn(view.language, 'region', country.iso_code) ?? country.name

/** Sorts by `locale`, as the parity store sorts `available_countries` by the names it shows; plain code-unit order when the runtime does not know the locale (it would otherwise sort by its own default's rules, whatever the language of the names). */
function compareIn (locale: string): (a: string, b: string) => number {
  const plain = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
  try {
    const collator = new Intl.Collator(locale)
    return sameLanguage(collator.resolvedOptions().locale, locale) ? collator.compare : plain
  } catch {
    return plain
  }
}

/**
 * https://shopify.dev/docs/api/liquid/objects/localization for one view. `country` is the shopper's, when `country` is one of the view market's and otherwise the market's default country (`defaultCountry`); `language` is the view's language and `market` its market. `available_countries` is every country of every market, each with its own market's currency (`market`, `currency`) and its name in the view's language, sorted by that name, and `available_languages` is the view market's languages in the order the market lists them, each with its `root_url` under the view's base path (`/`, the base path, or the locale prefix of that market and language), all as the parity store prints them (fixtures `probe-page-home`, `probe-page-en-ca`, `probe-page-fr-ca` and `probe-page-fr-eu`).
 *
 * https://shopify.dev/docs/api/liquid/objects/country says `unit_system` is `imperial` or `metric` and does not say which countries use which; every country here is `metric`, as the engine had it, and no fixture prints it. A market's `id` is its place in the store's market list from 1, the dataset holding none of Shopify's.
 */
export function buildLocalization (data: StoreData, view: StoreView, country?: string): LiquidObject {
  const markets = marketsOf(data)
  const market = marketOf(data, view.market)
  const id = (m: MarketData) => markets.indexOf(m) + 1
  // the country the legacy `localization` names shows the currency the data gives it, which need not be the shop's (`marketsOf` keeps the shop's for prices)
  const legacyCurrency = legacyLocalization(data)?.country.currency
  const countries = markets.flatMap(m => m.countries.map(c => ({
    iso_code: c.iso_code,
    name: countryName(data, view, c),
    unit_system: 'metric',
    currency: legacyCurrency ?? { iso_code: m.currency.iso_code, symbol: m.currency.symbol, name: m.currency.name ?? m.currency.iso_code },
    market: { id: id(m), handle: m.handle }
  })))
  const here = countries.filter(c => c.market.handle === market.handle)
  const current = here.find(c => c.iso_code === country) ?? here.find(c => c.iso_code === defaultCountry(market)) ?? here[0] ?? null
  const prefixes = localePrefixes(data)
  const basePath = basePathOf(data, view)
  const languages = market.languages.map(iso => ({ ...languageIn(data, view, iso), root_url: prefixOf(prefixes, basePath, market, iso) || '/' }))
  const compare = compareIn(view.language)
  return {
    country: current,
    language: languages.find(l => l.iso_code === view.language) ?? languages[0],
    market: { id: id(market), handle: market.handle },
    available_countries: countries.sort((a, b) => compare(a.name, b.name)),
    available_languages: languages
  }
}

/** One `hreflang` tag and the prefix (base path, then locale prefix) of the market and language it names; the page's path goes after it. */
export interface Alternate { hreflang: string, prefix: string }

/**
 * The `hreflang` alternates `content_for_header` links, https://shopify.dev/docs/storefronts/themes/seo/hreflang says Shopify adds them "automatically through the `content_for_header` object" for a store with markets, "reflect each market's languages and regions" and "stay in sync with each page's canonical URL". The rest is as the parity store's recorded pages print them (its recordings `page-home`, `page-home-fr-ca` and `page-product-en-eu`, which are not among the fork's fixtures): first `x-default`, the primary market's first language's root, then one tag of the language alone for each language of the primary market, then each other market in the store's order: for each of its countries in ISO order, one `<language>-<COUNTRY>` tag for each of its languages. Each carries the prefix (base path and locale prefix) of its market and language. The recordings do not tell two orders of the other markets apart: the order above (markets in the store's order, countries in ISO order inside each) and all the other markets' countries in one ISO order give the same list for the one store recorded (Canada, then Europe, which are also in alphabetical order); the first is what is written here, and a store with its markets in another order, or a primary market of several countries (which prints only its languages here), is not recorded. A store of one market and one language has none, the page not saying whether Shopify then prints any; the recordings show no such store.
 */
export function alternatesOf (data: StoreData, view: StoreView): Alternate[] {
  const markets = marketsOf(data)
  const primary = primaryOf(markets)
  if (markets.length === 1 && primary.languages.length === 1) return []
  const prefixes = localePrefixes(data)
  const basePath = basePathOf(data, view)
  const alternate = (hreflang: string, market: MarketData, language: string): Alternate => ({ hreflang, prefix: prefixOf(prefixes, basePath, market, language) })
  const out = [alternate('x-default', primary, primary.languages[0]), ...primary.languages.map(language => alternate(language, primary, language))]
  for (const market of markets) {
    if (market === primary) continue
    for (const iso of market.countries.map(c => c.iso_code).sort()) {
      for (const language of market.languages) out.push(alternate(`${language}-${iso}`, market, language))
    }
  }
  return out
}
