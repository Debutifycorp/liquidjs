import { Drop } from '../../drop'
import { toValue } from '../../util'
import { LiquidFloat, formatRubyFloat } from '../../util/liquid-float'
import type { ImageData, ImageUrlParams } from '../types'

const AS_MEDIA = Symbol('asMedia')
const TITLE = Symbol('title')
const PREVIEW = Symbol('preview')

/** A focal point as Shopify writes it, `X% Y%` with each value rounded to four decimals and written as a Ruby decimal (`50.0% 50.0%`). */
export const focalText = (point: { x: number, y: number }): string => `${formatRubyFloat(Number(point.x.toFixed(4)))}% ${formatRubyFloat(Number(point.y.toFixed(4)))}%`

/** The `focal_point` object: `x` and `y` in percent (50 when none is set) that prints as `X% Y%`, each rounded to four decimals and written as a Ruby decimal (`1.9231% 9.7917%`, and `50.0% 50.0%` for the centre, as the parity store prints it in Horizon's resource cards, private parity recordings of Horizon). https://shopify.dev/docs/api/liquid/objects/focal_point and https://shopify.dev/docs/api/liquid/objects/image_presentation */
export class FocalPointDrop extends Drop {
  public readonly x: number
  public readonly y: number

  public constructor (point?: { x: number, y: number } | null) {
    super()
    this.x = point?.x ?? 50
    this.y = point?.y ?? 50
  }

  public valueOf () {
    return focalText(this)
  }
}

/** An address without its protocol (`https://host/a.jpg` is `//host/a.jpg`), the form the parity store prints for an image on its CDN: `image_url` and the other image filters (scenario `page-product`: every `srcset` candidate starts `//host/cdn/shop/files/`) and the `src` of an image object (the same scenario's `product | json`: `"src":"\/\/host\/cdn\/shop\/files\/…"`). Other addresses stay as they are. */
export const withoutProtocol = (url: string): string => url.replace(/^https?:(?=\/\/)/i, '')

/** Shopify's `image` object over `ImageData`. Printed on its own it is its `src`, which has no protocol (`withoutProtocol`); the Ajax answers print the data's own address (`data.src`) instead, as the parity store does. https://shopify.dev/docs/api/liquid/objects/image */
export class ImageDrop extends Drop {
  public readonly src: string
  public readonly width: number | null
  public readonly height: number | null
  /** A decimal, as Shopify documents it, so `{{ 1 | divided_by: image.aspect_ratio }}` stays a float division for square or 2:1 images. */
  public readonly aspect_ratio: LiquidFloat | null
  public readonly alt: string
  public readonly id: number | null
  /** `image` for product media, nil for images from anywhere else. https://shopify.dev/docs/api/liquid/objects/image#image-media_type */
  public readonly media_type: 'image' | null
  public readonly presentation: { focal_point: FocalPointDrop }
  /** The place in `product.images` or `product.media`, nil for images from anywhere else. https://shopify.dev/docs/api/liquid/objects/image#image-position; the page's example shows `1` for the first, and does not otherwise say the numbering starts at 1. */
  public readonly position: number | null
  /** The data the image was built from, with the alt text it has of its own (`alt` reads the title in its place). Not enumerable: it is the engine's, and neither `json` nor `for` may print it. */
  public declare readonly data: ImageData
  private readonly [AS_MEDIA]: boolean
  private readonly [TITLE]: string
  private [PREVIEW]?: ImageDrop

  /** `asMedia` marks an image reached as product media (`product.media`, `featured_media`), the only images whose `preview_image` and `media_type` are set. `position` is the image's place in the product's `images` or `media`. `title` is the title of the product when the image is one of the product's own (`product.images`, `featured_image`, `media`, `featured_media`), which `alt` reads when the image has no alt text of its own: the parity store prints such an image's alt as its product's title (scenarios `page-product` and `page-collections`: `<img alt="Beanie">` from `card_product.featured_media.alt`, where the dataset's image has none), while `product | json` and the Ajax answer print its own, `null` (fixture `probe-product-default`). The images of a variant read the title too (scenario `page-product`: the modal's `product.selected_or_first_available_variant.featured_media.alt` is the title). */
  public constructor (data: ImageData, asMedia = false, position: number | null = null, title = '') {
    super()
    Object.defineProperty(this, 'data', { value: data, enumerable: false })
    this[AS_MEDIA] = asMedia
    this[TITLE] = title
    this.position = position
    this.src = withoutProtocol(data.src)
    this.width = data.width ?? null
    this.height = data.height ?? null
    this.aspect_ratio = data.width && data.height ? new LiquidFloat(data.width / data.height) : null
    this.alt = data.alt || title
    this.id = data.id ?? null
    this.media_type = asMedia ? 'image' : null
    this.presentation = { focal_point: new FocalPointDrop(data.focal_point) }
  }

  /** The image itself for product media, nil for images from anywhere else. https://shopify.dev/docs/api/liquid/objects/image#image-preview_image. The preview image has the image's own alt text, not the product's title: the parity store prints `media.alt` as the title and `media.preview_image | image_url | image_tag` with `alt=""` (scenario `page-product`: the gallery's images). Its `id` is nil: Horizon's resource cards pass `featured_media.preview_image` as `data-media-id: featured_image.id`, and the parity store prints no `data-media-id` on those images, where the card's second image, `media[1].id`, has one (private parity recordings of Horizon). */
  public get preview_image (): ImageDrop | null {
    if (!this[AS_MEDIA]) return null
    this[PREVIEW] ??= new ImageDrop({ ...this.data, id: undefined }, true, this.position)
    return this[PREVIEW]
  }

  /** The same media with its own alt text and not the product's title, its `id` kept: what a variant filter shows as a product's `featured_media` (`collectionView`, `buildSearch`). Not `preview_image`, whose `id` is nil, since `product.featured_media` is a media object with an id (https://shopify.dev/docs/api/liquid/objects/media) and Horizon's card gallery prints `slide_id: media.id` for it. */
  public bare (): ImageDrop {
    return this[AS_MEDIA] && this[TITLE] && !this.data.alt ? new ImageDrop(this.data, true, this.position) : this
  }

  public valueOf () {
    return this.src
  }
}

export interface ImageSource {
  image: ImageData
  /** The `alt` Shopify would use: the media alt text, else the resource's title. */
  alt: string
}

/** The image behind an `image_url` input: an image, or a product, variant, collection, article, line item or media that has one. https://shopify.dev/docs/api/liquid/filters/image_url */
export function imageSource (input: unknown, title = ''): ImageSource | undefined {
  if (input instanceof ImageDrop) return { image: input.data, alt: input.alt || title }
  const value = toValue(input)
  if (typeof value === 'string') return value ? { image: { src: value }, alt: title } : undefined
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const ownTitle = typeof record.title === 'string' ? record.title : title
  if (typeof record.src === 'string' && record.media_type !== 'video' && record.media_type !== 'external_video') return { image: record as unknown as ImageData, alt: (record.alt as string) || ownTitle }
  for (const key of ['featured_image', 'featured_media', 'preview_image', 'image']) {
    if (record[key]) return imageSource(record[key], ownTitle)
  }
  return undefined
}

/** What `image_url` returns: the URL, printed as itself, carrying the image and parameters `image_tag` needs. Filters that read a string (`size`, `json`) see the URL. `params` holds the parameters the template asked for (held to the 5760 maximum), which `image_tag` writes its size and `srcset` from, as the URL itself does. */
export class ImageUrlDrop extends Drop {
  public constructor (public readonly url: string, public readonly image: ImageData, public readonly params: ImageUrlParams, public readonly alt: string) {
    super()
  }

  public get length () {
    return this.url.length
  }

  public valueOf () {
    return this.url
  }

  public toString () {
    return this.url
  }

  public toJSON () {
    return this.url
  }
}

/** The media a variant filter shows as a product's `featured_media`, from the matching variant's own: an image as its bare self with its id (`ImageDrop.bare`), another media as its preview image, and nil without one. */
export function variantMedia (media: unknown): unknown {
  if (media instanceof ImageDrop) return media.preview_image ? media.bare() : null
  return (media as { preview_image?: unknown } | null | undefined)?.preview_image ?? null
}
