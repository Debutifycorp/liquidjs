import type { RequestInput } from './globals'
import type { MarketData, StoreData } from './types'

/** What a store's objects depend on beyond its data: the market (currency, prices), the language (translations) and the URL prefix (the base path, then the locale prefix). */
export interface StoreView {
  market: string
  language: string
  prefix: string
  /** `'cdn'` when the page is not served from the store's own domain (a sandboxed preview): the videos and 3D models Liquid prints keep Shopify's CDN address, since `//<store domain>/cdn/shop/<path>` would reach no server. */
  storeFiles?: 'cdn'
}

export const viewKey = (view: StoreView) => `${view.market}|${view.language}|${view.prefix}${view.storeFiles ? `|${view.storeFiles}` : ''}`

/**
 * The view a request renders in: the market and language it names, otherwise the primary market's and its first language, and the prefix `basePath + localePrefix`, each normalised to one leading slash, no trailing slash and no doubled slash (`'//'` and `'/'` are no prefix, `'p/tok/'` is `/p/tok`), so no URL built from it can start with `//`. A request that says nothing renders unprefixed in the primary market and language, which is what the store rendered before it had views.
 *
 * The locale prefix follows https://shopify.dev/docs/storefronts/themes/markets/multiple-currencies-languages; the base path is Debutify's, for a store served under a path of its own, which shopify.dev does not describe.
 */
export function resolveView (data: StoreData, request: RequestInput): StoreView {
  const primary = data.markets?.find(m => m.primary) ?? data.markets?.[0]
  return {
    market: request.market ?? primary?.handle ?? 'default',
    language: request.language ?? primary?.languages[0] ?? data.languages?.[0]?.iso_code ?? data.shop.locale ?? 'en',
    prefix: `${cleanPrefix(request.basePath)}${cleanPrefix(request.localePrefix)}`,
    ...(request.storeFiles ? { storeFiles: request.storeFiles } : {})
  }
}

/** The country a market shows a shopper who has chosen none: the one with the lowest ISO code. The parity store's visitor to the Europe market (France, Germany, Italy, Spain and the Netherlands) is in Germany, `DE`, on its recorded French and English pages (fixture `probe-page-fr-eu`, and the `Shopify.country` of its recorded `/en-eu/products/hoodie`), though the dataset lists France first; shopify.dev does not say how it picks. */
export const defaultCountry = (market: MarketData): string | undefined => market.countries.map(c => c.iso_code).sort()[0]

/** A prefix of whole segments: one leading slash, none trailing or doubled; empty for none. */
export function cleanPrefix (path = ''): string {
  const clean = path.replace(/\/{2,}/g, '/').replace(/^\/|\/$/g, '')
  return clean ? `/${clean}` : ''
}

/** What follows `prefix` at the start of `path` when `path` is the prefix or continues it on a segment boundary (`/`, `?` or `#`); undefined otherwise, so `/fr` is not the start of `/france`. */
function afterPrefix (prefix: string, path: string): string | undefined {
  if (!prefix || !path.startsWith(prefix)) return undefined
  const rest = path.slice(prefix.length)
  return rest === '' || /^[/?#]/.test(rest) ? rest : undefined
}

/**
 * `path` (root-relative) under `prefix`. The root, with or without a query or fragment, is the bare prefix (`/` is `/fr-ca`, `/?x=1` is `/fr-ca?x=1`, `/#top` is `/fr-ca#top`), or itself when there is no prefix. External, protocol-relative and fragment-only URLs stay as they are, and so does a path that already sits under the prefix (the prefix itself, or the prefix followed by `/`, `?` or `#`), so putting it on twice is the same as once. The root under a prefix is the bare prefix with no trailing slash, as the parity store prints its root URLs (`routes.root_url`, `request.locale.root_url` and each language's `root_url`, fixture `probe-page-fr-ca`).
 */
export function withPrefix (prefix: string, path: string): string {
  if (!prefix || !path.startsWith('/') || path.startsWith('//')) return path
  if (afterPrefix(prefix, path) !== undefined) return path
  if (path === '/' || path.startsWith('/?') || path.startsWith('/#')) return `${prefix}${path.slice(1)}`
  return `${prefix}${path}`
}

/** `path` without `prefix` when it sits under it on a segment boundary (`/fr-ca/products/x?y` is `/products/x?y`, the prefix alone is `/`); any other path as it is. The inverse of `withPrefix`. */
export function withoutPrefix (prefix: string, path: string): string {
  const rest = afterPrefix(prefix, path)
  if (rest === undefined) return path
  return rest === '' ? '/' : rest.startsWith('/') ? rest : `/${rest}`
}
