import { primaryLanguage } from './markets'
import type { LanguageData, MarketData, StoreData } from './types'

/** `Intl.DisplayNames` is not in the TypeScript `lib` this package builds with, and a runtime may lack it or a locale. */
interface DisplayNames { of: (code: string) => string | undefined }
type DisplayNamesConstructor = new (locales: string[], options: { type: string, languageDisplay: string }) => DisplayNames

/**
 * The names Shopify gives the languages that `Intl.DisplayNames` names differently: https://help.shopify.com/en/manual/international/languages/requirements lists "Chinese (Simplified)", "Chinese (Traditional)" and "Norwegian (Bokmål)" (`Intl` says "Chinese (China)", "Chinese (Taiwan)" and "Norwegian Bokmål"). The page gives no endonyms; the Chinese ones are the scripts' own names (简体中文, 繁體中文), which Shopify's admin shows. Not pinned by shopify.dev.
 */
const SHOPIFY_NAMES: Record<string, { name: string, endonym_name: string }> = {
  'zh-CN': { name: 'Chinese (Simplified)', endonym_name: '简体中文' },
  'zh-TW': { name: 'Chinese (Traditional)', endonym_name: '繁體中文' },
  nb: { name: 'Norwegian (Bokmål)', endonym_name: 'norsk bokmål' }
}

function displayName (locale: string, code: string): string | undefined {
  try {
    const Names = (Intl as unknown as { DisplayNames?: DisplayNamesConstructor }).DisplayNames
    const name = Names && new Names([locale], { type: 'language', languageDisplay: 'standard' }).of(code)
    return name && name !== code ? name : undefined
  } catch {
    return undefined
  }
}

/** A language as https://shopify.dev/docs/api/liquid/objects/shop_locale describes it: `name` is "the name of the locale in the store's primary locale" (here, in the primary language; a page in another language names languages in its own, as the parity store prints them, `languageIn`) and `endonym_name` is "the name of the locale in the locale itself". The names come from `Intl.DisplayNames`, with the code itself when the runtime has none. */
export function languageOf (iso: string, primary: string): LanguageData {
  const known = SHOPIFY_NAMES[iso]
  return { iso_code: iso, name: known?.name ?? displayName(primary, iso) ?? iso, endonym_name: known?.endonym_name ?? displayName(iso, iso) ?? iso }
}

const derived = new WeakMap<StoreData, Map<string, StoreData>>()

/**
 * The store, published in `codes` as well as in the languages its data lists. Each new language is added to the store's languages with its name and endonym (`languageOf`) and to the primary market after the languages it has; its subfolder is the one `localePrefixes` forms. The primary language and the languages already listed stay as they are; a listed language the primary market does not offer is offered. Returns `data` itself when there is nothing to add, and the same object for the same `data` and `codes` (a store's views are cached per data object).
 *
 * https://shopify.dev/docs/storefronts/themes/markets/multiple-currencies-languages says a published language gets its own URL path ("then the URL `shop.com/fr` is automatically created"). That only the primary market offers them, and in what order, is Debutify's choice for a store whose languages come from a theme, and is not pinned: offering them in every market would put six more `hreflang` tags and subfolders on each country of every market (`/de-ca`, `/de-eu`), and a shopper in the preview picks a language in the primary market.
 */
export function withLanguages (data: StoreData, codes: readonly string[]): StoreData {
  const primary = primaryLanguage(data)
  const listed = data.languages ?? [{ iso_code: primary, name: '', endonym_name: '' }]
  const known = new Set(listed.map(l => l.iso_code.toLowerCase()))
  const added = [...new Set(codes)].filter(code => !known.has(code.toLowerCase()))
  // a language the data lists may still be missing from the primary market, which is where the languages are offered (the sample store lists French and offers only English in its primary market)
  const primaryMarket = data.markets?.find(m => m.primary) ?? data.markets?.[0]
  const unoffered = primaryMarket ? codes.some(code => !primaryMarket.languages.includes(code)) : false
  if (!added.length && !unoffered) return data
  const key = `${added.join('|')}#${codes.join('|')}`
  let byCodes = derived.get(data)
  if (!byCodes) derived.set(data, byCodes = new Map())
  let out = byCodes.get(key)
  if (!out) {
    const languages = added.length ? [...(data.languages ?? [languageOf(primary, primary)]), ...added.map(code => languageOf(code, primary))] : data.languages
    const offer = (market: MarketData): MarketData => market.primary ? ({ ...market, languages: [...market.languages, ...codes.filter((code, i) => codes.indexOf(code) === i && !market.languages.includes(code))] }) : market
    out = { ...data, ...(languages ? { languages } : {}), ...(data.markets?.length ? { markets: data.markets.some(m => m.primary) ? data.markets.map(offer) : data.markets.map((m, i) => i === 0 ? offer({ ...m, primary: true }) : m) } : {}) }
    byCodes.set(key, out)
  }
  return out
}
