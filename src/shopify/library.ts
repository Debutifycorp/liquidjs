import { FONT_LIBRARY, FONT_REPLACEMENTS, PAYMENT_ICONS } from '../shopify-library'
import type { FontInfo } from './types'
import { own } from './util/own'

/** `payment_type_svg_tag`'s icon: Shopify's own file for a type of its set, byte for byte as Shopify prints it, and for any other type (an unknown name, the empty string, a capitalised `Visa`) the `generic` icon with nothing written for the type, which is what the parity store printed for each (scenarios `page-home`, `ajax-cart-sections` and `probe-payment-icons`). The set is every file of activemerchant/payment_icons at the pinned commit; the type is looked up exactly as given. https://shopify.dev/docs/api/liquid/filters/payment_type_svg_tag */
export function shopifyPaymentIcon (type: string): string {
  return own(PAYMENT_ICONS, type) ?? PAYMENT_ICONS.generic
}

let fonts: Map<string, FontInfo> | undefined
let files: Set<string> | undefined

/** The library by handle, and its file paths, built on first use. */
function library (): { fonts: Map<string, FontInfo>, files: Set<string> } {
  if (!fonts || !files) {
    fonts = new Map()
    files = new Set()
    for (const [family, fallback, system, members] of FONT_LIBRARY) {
      const variants = Object.freeze(members.map(font => font[0]))
      for (const [handle, weight, style, baselineRatio, woff2, woff] of members) {
        fonts.set(handle, Object.freeze({ handle, family, style, weight, fallback_families: fallback, baseline_ratio: baselineRatio, system, variants, ...(woff2 ? { files: Object.freeze({ woff2, woff }) } : {}) }))
        if (woff2) files.add(woff2).add(woff)
      }
    }
  }
  return { fonts, files }
}

/** Shopify's font library (https://shopify.dev/docs/storefronts/themes/architecture/settings/fonts) as the parity store prints it: the font of a library handle; for a retired handle, the font Shopify renders in its place (Harmonia Sans is Poppins); otherwise undefined. The default `fontInfo` service. */
export function shopifyFontInfo (handle: string): FontInfo | undefined {
  return library().fonts.get(own(FONT_REPLACEMENTS, handle) ?? handle)
}

/** True only for a file of Shopify's font library (`assistant/assistant_n4.9120912a469cad1cc292572851508ca49d12e768.woff2`), which https://fonts.shopifycdn.com/<path> serves. A host checks this before it fetches a font, so it fetches nothing else. */
export function isShopifyFontFile (path: string): boolean {
  return library().files.has(path)
}
