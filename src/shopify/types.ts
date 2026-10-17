/** An image as store data supplies it. Liquid sees it as Shopify's `image` object, https://shopify.dev/docs/api/liquid/objects/image (`alt`, `width`, `height`, `src`, `id`). */
export interface ImageData {
  /** The image's URL or path, in whatever form the caller's `imageUrl` service understands. */
  src: string
  width?: number
  height?: number
  alt?: string | null
  /** The focal point in percent from the top-left corner, as Shopify's `focal_point` object holds it, https://shopify.dev/docs/api/liquid/objects/focal_point (`x` and `y`, 50 when none is set). */
  focal_point?: { x: number, y: number } | null
  id?: number
}

/** The parameters `image_url` passes to the `imageUrl` service, named as https://shopify.dev/docs/api/liquid/filters/image_url names them (`crop`, `format`, `height`, `pad_color`, `quality`, `width`). The four `crop_*` parameters (`crop_left`, `crop_top`, `crop_width`, `crop_height`) are the same page's `crop: 'region'` mode. */
export interface ImageUrlParams {
  width?: number
  height?: number
  crop?: string
  format?: string
  pad_color?: string
  quality?: number
  crop_left?: number
  crop_top?: number
  crop_width?: number
  crop_height?: number
  /** The legacy size of `img_url` and of the `video_tag` poster (`small`, `480x`, `x480`, `480x480`, `large`), https://shopify.dev/docs/api/liquid/filters/img_url and https://shopify.dev/docs/api/liquid/filters/video_tag, whose examples put it in the file name (`..._480x.jpg?v=1683744744`, `..._small.jpg?v=1655255324`). `width` and `height` carry the same size in pixels, for services that do not know `size`; the default `imageUrl` service renders the file-name suffix and nothing else. */
  size?: string
}

/** A font from Shopify's font library, as a `font_picker` setting refers to it (`assistant_n4`), https://shopify.dev/docs/storefronts/themes/architecture/settings/fonts. Liquid sees it as Shopify's `font` object, https://shopify.dev/docs/api/liquid/objects/font (`baseline_ratio`, `fallback_families`, `family`, `style`, `variants`, `weight`); `system` is the `font` object's own `system?`; `handle` is Debutify's, and `variants` here holds handles. */
export interface FontInfo {
  handle: string
  family: string
  style: 'normal' | 'italic' | 'oblique'
  weight: number
  fallback_families: string
  baseline_ratio: number
  system: boolean
  /** Handles of every variant of the family, this one included. The default `fontInfo` gives the family's fonts one frozen array. */
  variants: readonly string[]
  /** The font's files on Shopify's font CDN, relative to https://fonts.shopifycdn.com/ (`assistant/assistant_n4.9120912a469cad1cc292572851508ca49d12e768.woff2`). Absent for a system font and for a font outside Shopify's library. */
  files?: Readonly<{ woff2: string, woff: string }>
}

/** A locale file (`locales/en.default.json`) or a section schema's `locales` entry for one language, https://shopify.dev/docs/storefronts/themes/architecture/locales/storefront-locale-files and https://shopify.dev/docs/storefronts/themes/architecture/sections/section-schema. */
export interface LocaleTree {
  [key: string]: string | LocaleTree
}

/** A block in a JSON template, section group or `settings_data.json`, https://shopify.dev/docs/storefronts/themes/architecture/templates/json-templates (`type`, `settings`, `blocks`, `block_order`, `disabled`) and https://shopify.dev/docs/storefronts/themes/architecture/section-groups. `static` marks a static block's saved entry: https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks/static-blocks ("Static theme blocks in data") shows it with `"static": true`, kept under `blocks` and left out of `block_order`. `name` is not part of a block's data on those pages, so shopify.dev does not pin it for this shape. */
export interface BlockData {
  type: string
  name?: string
  settings?: Record<string, unknown>
  blocks?: Record<string, BlockData>
  block_order?: string[]
  disabled?: boolean
  static?: boolean
}

/** A section in a JSON template, section group or `settings_data.json`, https://shopify.dev/docs/storefronts/themes/architecture/templates/json-templates and https://shopify.dev/docs/storefronts/themes/architecture/section-groups. `custom_css` is described on the first page ("stored in a `custom_css` attribute in the section data"); a `name` belongs to a section group there, not to a section, so shopify.dev does not pin it for this shape. */
export interface SectionData {
  type: string
  name?: string
  settings?: Record<string, unknown>
  blocks?: Record<string, BlockData>
  block_order?: string[]
  disabled?: boolean
  custom_css?: string[]
}
