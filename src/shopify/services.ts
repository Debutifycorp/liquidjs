import type { FontInfo, ImageData, ImageUrlParams } from './types'
import { escapeHtml } from './util/html'

/**
 * Everything the Shopify layer needs from outside the theme: URLs, artwork, the font library and the clock. The package never fetches anything and never hard-codes a host; the caller supplies these.
 */
export interface ShopifyServices {
  /** `asset_url`: the URL of `assets/<path>`. */
  assetUrl: (path: string) => string
  /** `shopify_asset_url`: the URL of one of Shopify's global assets (`option_selection.js`). */
  shopifyAssetUrl: (path: string) => string
  /** `image_url`, `image_tag`, `img_url`: the URL of `image` with the CDN parameters `params`. */
  imageUrl: (image: ImageData, params: ImageUrlParams) => string
  /** `font_url` and the default `font_face`: the URL of a font file. */
  fontUrl: (font: FontInfo, format: 'woff2' | 'woff') => string
  /** `font_face`: the whole `@font-face` rule. When absent, the filter builds Shopify's rule from `fontUrl`. */
  fontFace?: (font: FontInfo, options: { fontDisplay?: string }) => string
  /** The Shopify font library: a `font_picker` value (`assistant_n4`) to its font, or undefined. */
  fontInfo: (handle: string) => FontInfo | undefined
  /** `placeholder_svg_tag`: the `<svg>` markup for a placeholder name (`product-1`). */
  placeholderSvg: (name: string) => string
  /** `payment_type_svg_tag`: the `<svg>` markup for a payment type (`visa`). */
  paymentTypeSvg: (type: string) => string
  /** `'now' | date`, `time_tag`: the current time. */
  currentTime: () => Date
}

const FONT_HANDLE = /^([a-z0-9_]+?)_([nio])([1-9])$/

/** Reads a Shopify font handle (`<family>_<style><weight / 100>`, e.g. `assistant_n4`). Variants are guessed as regular, italic, bold and bold italic. */
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

/** Merges `params` into the query of `src` and sorts the keys, which is the shape of Shopify's CDN URLs (`?crop=bottom&height=400&v=1&width=400`). */
export function cdnStyleImageUrl (image: ImageData, params: ImageUrlParams): string {
  const at = image.src.indexOf('?')
  const base = at === -1 ? image.src : image.src.slice(0, at)
  const query = new Map<string, string>()
  if (at !== -1) {
    for (const part of image.src.slice(at + 1).split('&')) {
      if (!part) continue
      const eq = part.indexOf('=')
      query.set(eq === -1 ? part : part.slice(0, eq), eq === -1 ? '' : part.slice(eq + 1))
    }
  }
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') query.set(key, encodeURIComponent(String(value)))
  }
  const keys = [...query.keys()].sort()
  return keys.length ? `${base}?${keys.map(key => `${key}=${query.get(key)}`).join('&')}` : base
}

/** Deterministic stand-ins: relative URLs, neutral SVG boxes, Shopify-shaped image URLs and the system clock. Callers replace them with their own. */
export const defaultServices: ShopifyServices = {
  assetUrl: path => `/assets/${path}`,
  shopifyAssetUrl: path => `/shopify-assets/${path}`,
  imageUrl: cdnStyleImageUrl,
  fontUrl: (font, format) => `/fonts/${font.handle}.${format}`,
  fontInfo: parseFontHandle,
  placeholderSvg: name => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 525 525" role="img" aria-label="${escapeHtml(name)}"><rect width="525" height="525" fill="#f1f1f1"/></svg>`,
  paymentTypeSvg: type => `<svg xmlns="http://www.w3.org/2000/svg" role="img" viewBox="0 0 38 24" width="38" height="24" aria-labelledby="pi-${escapeHtml(type)}"><title id="pi-${escapeHtml(type)}">${escapeHtml(type)}</title><rect x=".5" y=".5" width="37" height="23" rx="2.5" fill="#fff" stroke="#000" stroke-opacity=".07"/></svg>`,
  currentTime: () => new Date()
}

export function resolveServices (services: Partial<ShopifyServices> = {}): ShopifyServices {
  return { ...defaultServices, ...services }
}
