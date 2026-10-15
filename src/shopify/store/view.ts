import type { RequestInput } from './globals'
import type { StoreData } from './types'

/** What a store's objects depend on beyond its data: the market (currency, prices), the language (translations) and the URL prefix (the base path, then the locale prefix). */
export interface StoreView {
  market: string
  language: string
  prefix: string
}

export const viewKey = (view: StoreView) => `${view.market}|${view.language}|${view.prefix}`

/**
 * The view a request renders in: the market and language it names, otherwise the primary market's and its first language, and the prefix `basePath + localePrefix` (a trailing slash on the base path is dropped). A request that says nothing renders unprefixed in the primary market and language, which is what the store rendered before it had views.
 *
 * The locale prefix follows https://shopify.dev/docs/storefronts/themes/markets/multiple-currencies-languages; the base path is Debutify's, for a store served under a path of its own, which shopify.dev does not describe.
 */
export function resolveView (data: StoreData, request: RequestInput): StoreView {
  const primary = data.markets?.find(m => m.primary) ?? data.markets?.[0]
  return {
    market: request.market ?? primary?.handle ?? 'default',
    language: request.language ?? primary?.languages[0] ?? data.languages?.[0]?.iso_code ?? data.shop.locale ?? 'en',
    prefix: `${(request.basePath ?? '').replace(/\/$/, '')}${request.localePrefix ?? ''}`
  }
}

/** `path` (root-relative) under `prefix`; `/` becomes the prefix itself, or `/` when there is none. External, protocol-relative and fragment URLs stay as they are. The root under a prefix is the bare prefix with no trailing slash, as the parity store prints its root URLs (`routes.root_url`, `request.locale.root_url` and each language's `root_url`, fixture `probe-page-fr-ca`). */
export function withPrefix (prefix: string, path: string): string {
  if (!prefix || !path.startsWith('/') || path.startsWith('//')) return path
  if (path === '/') return prefix
  return `${prefix}${path}`
}
