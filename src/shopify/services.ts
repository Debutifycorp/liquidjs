import type { FontInfo, ImageData, ImageUrlParams } from './types'
import { placeholderArt } from './placeholder-art'
import { shopifyPaymentIcon } from './library'
import { withoutProtocol } from './objects/image'

/**
 * Everything the Shopify layer needs from outside the theme: URLs, artwork, the font library and the clock. The package never fetches anything and never hard-codes a host; the caller supplies these. shopify.dev describes what each filter does but not the URLs, artwork or font data Shopify serves, so those come from the caller.
 */
export interface ShopifyServices {
  /** `asset_url`: the URL of `assets/<path>`, https://shopify.dev/docs/api/liquid/filters/asset_url. */
  assetUrl: (path: string) => string
  /** `shopify_asset_url`: the URL of one of Shopify's global assets (`option_selection.js`), https://shopify.dev/docs/api/liquid/filters/shopify_asset_url. */
  shopifyAssetUrl: (path: string) => string
  /** `image_url`, `image_tag`, `img_url`: the URL of `image` with the CDN parameters `params`, https://shopify.dev/docs/api/liquid/filters/image_url, https://shopify.dev/docs/api/liquid/filters/image_tag and https://shopify.dev/docs/api/liquid/filters/img_url. The default service answers without a protocol (`//host/files/a.jpg?width=450`), as the parity store does, so a theme's `prepend: "https:"` makes a valid address; a service that wraps it sees that form. `params.width` and `params.height` are the size the template asked for, up to 5760, and can be larger than the image (the parity store keeps such a request in the address): a service that resizes decides whether to serve or refuse an upscale. */
  imageUrl: (image: ImageData, params: ImageUrlParams) => string
  /** `font_url` and the default `font_face`: the URL of a font file, https://shopify.dev/docs/api/liquid/filters/font_url and https://shopify.dev/docs/api/liquid/filters/font_face. */
  fontUrl: (font: FontInfo, format: 'woff2' | 'woff') => string
  /** `font_face`: the whole `@font-face` rule, https://shopify.dev/docs/api/liquid/filters/font_face. When absent, the filter builds Shopify's rule from `fontUrl`. */
  fontFace?: (font: FontInfo, options: { fontDisplay?: string }) => string
  /** The Shopify font library: a `font_picker` value (`assistant_n4`) to its font, or undefined, https://shopify.dev/docs/storefronts/themes/architecture/settings/fonts. Which fonts exist and how their handles are spelled is not pinned by shopify.dev. */
  fontInfo: (handle: string) => FontInfo | undefined
  /** `placeholder_svg_tag`: the `<svg>` markup for a placeholder name (`product-1`), https://shopify.dev/docs/api/liquid/filters/placeholder_svg_tag (the page lists the names; the artwork is Shopify's, so the default draws Debutify's own line art in the page's markup, `placeholderArt`, and a caller may supply other art). */
  placeholderSvg: (name: string) => string
  /** `payment_type_svg_tag`: the `<svg>` markup for a payment type (`visa`), https://shopify.dev/docs/api/liquid/filters/payment_type_svg_tag. The default is `shopifyPaymentIcon`, Shopify's own icon of the type. */
  paymentTypeSvg: (type: string) => string
  /** `'now' | date`, `time_tag`: the current time, https://shopify.dev/docs/api/liquid/filters/date (`'now'` and `'today'`) and https://shopify.dev/docs/api/liquid/filters/time_tag. */
  currentTime: () => Date
}

const FONT_HANDLE = /^([a-z0-9_]+?)_([nio])([1-9])$/

/** Reads a Shopify font handle (`<family>_<style><weight / 100>`, e.g. `assistant_n4`). shopify.dev lists handles but does not define their grammar (https://shopify.dev/docs/storefronts/themes/architecture/settings/fonts), so this reading and the guessed variants (regular, italic, bold and bold italic) are Debutify's and not pinned; callers with the real font library replace `fontInfo`. */
export function parseFontHandle (handle: string): FontInfo | undefined {
  const match = FONT_HANDLE.exec(handle)
  if (!match) return undefined
  const [, slug, styleCode, weightCode] = match
  const family = slug.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
  const style = styleCode === 'n' ? 'normal' : styleCode === 'i' ? 'italic' : 'oblique'
  const variants = [handle]
  for (const code of ['n4', 'i4', 'n7', 'i7']) {
    const variant = `${slug}_${code}`
    if (!variants.includes(variant)) variants.push(variant)
  }
  return { handle, family, style, weight: Number(weightCode) * 100, fallback_families: 'sans-serif', baseline_ratio: 0, system: false, variants }
}

/** Inserts `_<size>` before the extension of the last path segment (`a/b.jpg` becomes `a/b_480x.jpg`), the legacy file name https://shopify.dev/docs/api/liquid/filters/img_url prints (`..._480x.jpg?v=1683744744`); a path without an extension gets the suffix at its end. */
function withSizeSuffix (path: string, size: string): string {
  const suffix = `_${encodeURIComponent(size)}`
  const match = /\.[^./]+$/.exec(path)
  return match ? path.slice(0, match.index) + suffix + match[0] : path + suffix
}

/** Merges `params` into the query of `src` and sorts the keys, which is the shape of Shopify's CDN URLs (`?crop=bottom&height=400&v=1&width=400`). https://shopify.dev/docs/api/liquid/filters/image_url shows `?v=1683744744&width=450`; it does not state that keys are sorted, so the order is not pinned and the URL stays `approx`. A legacy `size` (`img_url`, the `video_tag` poster) writes only the `_<size>` file name and keeps the image's own query, as the examples on https://shopify.dev/docs/api/liquid/filters/img_url do, whose `crop`, `format` and `scale` examples print the same `_small` URL as the plain one. */
export function cdnStyleImageUrl (image: ImageData, params: ImageUrlParams): string {
  const at = image.src.indexOf('?')
  // the address has no protocol, as the parity store prints it (scenario `page-product`: srcset candidates start `//host/cdn/shop/files/`, and the theme's `image_url | prepend: "https:"` makes the JSON-LD `https:\/\/host\/cdn\/shop\/files\/…`, not `https:https:`)
  let base = withoutProtocol(at === -1 ? image.src : image.src.slice(0, at))
  const query = new Map<string, string>()
  if (at !== -1) {
    for (const part of image.src.slice(at + 1).split('&')) {
      if (!part) continue
      const eq = part.indexOf('=')
      query.set(eq === -1 ? part : part.slice(0, eq), eq === -1 ? '' : part.slice(eq + 1))
    }
  }
  if (params.size) {
    base = withSizeSuffix(base, params.size)
  } else {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') query.set(key, encodeURIComponent(String(value)))
    }
  }
  const keys = [...query.keys()].sort()
  return keys.length ? `${base}?${keys.map(key => `${key}=${query.get(key)}`).join('&')}` : base
}

/** Deterministic defaults. Relative URLs, Debutify's own placeholder line art, Shopify-shaped image URLs and the system clock are stand-ins (Debutify's, not Shopify's output); the payment icons are Shopify's own (`shopifyPaymentIcon`, the files of activemerchant/payment_icons that `payment_type_svg_tag` prints). Callers replace them through the `services` option, one service at a time; the object itself is frozen, as every engine and render reads it. */
export const defaultServices: Readonly<ShopifyServices> = Object.freeze<ShopifyServices>({
  assetUrl: path => `/assets/${path}`,
  shopifyAssetUrl: path => `/shopify-assets/${path}`,
  imageUrl: cdnStyleImageUrl,
  fontUrl: (font, format) => `/fonts/${font.handle}.${format}`,
  fontInfo: parseFontHandle,
  placeholderSvg: placeholderArt,
  paymentTypeSvg: shopifyPaymentIcon,
  currentTime: () => new Date()
})

export function resolveServices (services: Partial<ShopifyServices> = {}): ShopifyServices {
  return { ...defaultServices, ...services }
}
