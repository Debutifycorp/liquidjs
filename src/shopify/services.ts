import type { FontInfo, ImageData, ImageUrlParams } from './types'
import { escapeHtml } from './util/html'

/**
 * Everything the Shopify layer needs from outside the theme: URLs, artwork, the font library and the clock. The package never fetches anything and never hard-codes a host; the caller supplies these. shopify.dev describes what each filter does but not the URLs, artwork or font data Shopify serves, so those come from the caller.
 */
export interface ShopifyServices {
  /** `asset_url`: the URL of `assets/<path>`, https://shopify.dev/docs/api/liquid/filters/asset_url. */
  assetUrl: (path: string) => string
  /** `shopify_asset_url`: the URL of one of Shopify's global assets (`option_selection.js`), https://shopify.dev/docs/api/liquid/filters/shopify_asset_url. */
  shopifyAssetUrl: (path: string) => string
  /** `image_url`, `image_tag`, `img_url`: the URL of `image` with the CDN parameters `params`, https://shopify.dev/docs/api/liquid/filters/image_url, https://shopify.dev/docs/api/liquid/filters/image_tag and https://shopify.dev/docs/api/liquid/filters/img_url. */
  imageUrl: (image: ImageData, params: ImageUrlParams) => string
  /** `font_url` and the default `font_face`: the URL of a font file, https://shopify.dev/docs/api/liquid/filters/font_url and https://shopify.dev/docs/api/liquid/filters/font_face. */
  fontUrl: (font: FontInfo, format: 'woff2' | 'woff') => string
  /** `font_face`: the whole `@font-face` rule, https://shopify.dev/docs/api/liquid/filters/font_face. When absent, the filter builds Shopify's rule from `fontUrl`. */
  fontFace?: (font: FontInfo, options: { fontDisplay?: string }) => string
  /** The Shopify font library: a `font_picker` value (`assistant_n4`) to its font, or undefined, https://shopify.dev/docs/storefronts/themes/architecture/settings/fonts. Which fonts exist and how their handles are spelled is not pinned by shopify.dev. */
  fontInfo: (handle: string) => FontInfo | undefined
  /** `placeholder_svg_tag`: the `<svg>` markup for a placeholder name (`product-1`), https://shopify.dev/docs/api/liquid/filters/placeholder_svg_tag (the page lists the names; the artwork is Shopify's, so the caller supplies it). */
  placeholderSvg: (name: string) => string
  /** `payment_type_svg_tag`: the `<svg>` markup for a payment type (`visa`), https://shopify.dev/docs/api/liquid/filters/payment_type_svg_tag. */
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
  let base = at === -1 ? image.src : image.src.slice(0, at)
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

/** Deterministic stand-ins (Debutify's, not Shopify's output): relative URLs, neutral SVG boxes, Shopify-shaped image URLs and the system clock. Callers replace them through the `services` option, one service at a time; the object itself is frozen, as every engine and render reads it. */
export const defaultServices: Readonly<ShopifyServices> = Object.freeze<ShopifyServices>({
  assetUrl: path => `/assets/${path}`,
  shopifyAssetUrl: path => `/shopify-assets/${path}`,
  imageUrl: cdnStyleImageUrl,
  fontUrl: (font, format) => `/fonts/${font.handle}.${format}`,
  fontInfo: parseFontHandle,
  placeholderSvg: name => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 525 525" role="img" aria-label="${escapeHtml(name)}"><rect width="525" height="525" fill="#f1f1f1"/></svg>`,
  paymentTypeSvg: type => `<svg xmlns="http://www.w3.org/2000/svg" role="img" viewBox="0 0 38 24" width="38" height="24" aria-labelledby="pi-${escapeHtml(type)}"><title id="pi-${escapeHtml(type)}">${escapeHtml(type)}</title><rect x=".5" y=".5" width="37" height="23" rx="2.5" fill="#fff" stroke="#000" stroke-opacity=".07"/></svg>`,
  currentTime: () => new Date()
})

export function resolveServices (services: Partial<ShopifyServices> = {}): ShopifyServices {
  return { ...defaultServices, ...services }
}
