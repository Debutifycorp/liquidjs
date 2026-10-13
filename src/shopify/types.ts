/** An image as store data supplies it. Liquid sees it as Shopify's `image` object. */
export interface ImageData {
  /** The image's URL or path, in whatever form the caller's `imageUrl` service understands. */
  src: string
  width?: number
  height?: number
  alt?: string | null
  /** The focal point in percent from the top-left corner, as Shopify's `focal_point` object holds it. */
  focal_point?: { x: number, y: number } | null
  id?: number
}

/** The parameters `image_url` passes to the `imageUrl` service, named as Shopify's CDN names them. */
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
}

/** A font from Shopify's font library, as a `font_picker` setting refers to it (`assistant_n4`). */
export interface FontInfo {
  handle: string
  family: string
  style: 'normal' | 'italic' | 'oblique'
  weight: number
  fallback_families: string
  baseline_ratio: number
  system: boolean
  /** Handles of every variant of the family, this one included. */
  variants: string[]
}

/** A locale file (`locales/en.default.json`) or a section schema's `locales` entry for one language. */
export interface LocaleTree {
  [key: string]: string | LocaleTree
}

/** A block in a JSON template, section group or `settings_data.json`. */
export interface BlockData {
  type: string
  name?: string
  settings?: Record<string, unknown>
  blocks?: Record<string, BlockData>
  block_order?: string[]
  disabled?: boolean
  static?: boolean
}

/** A section in a JSON template, section group or `settings_data.json`. */
export interface SectionData {
  type: string
  name?: string
  settings?: Record<string, unknown>
  blocks?: Record<string, BlockData>
  block_order?: string[]
  disabled?: boolean
  custom_css?: string[]
}
