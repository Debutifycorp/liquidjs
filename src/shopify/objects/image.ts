import { Drop } from '../../drop'
import { toValue } from '../../util'
import { LiquidFloat } from '../../util/liquid-float'
import type { ImageData, ImageUrlParams } from '../types'

const AS_MEDIA = Symbol('asMedia')

/** Shopify's `image` object over `ImageData`. Printed on its own it is its `src`. https://shopify.dev/docs/api/liquid/objects/image */
export class ImageDrop extends Drop {
  public readonly src: string
  public readonly width: number | null
  public readonly height: number | null
  /** A decimal, as Shopify documents it, so `{{ 1 | divided_by: image.aspect_ratio }}` stays a float division for square or 2:1 images. */
  public readonly aspect_ratio: LiquidFloat | null
  public readonly alt: string
  public readonly id: number | null
  public readonly media_type = 'image'
  public readonly focal_point: string | null
  public readonly presentation: { focal_point: string | null }
  private readonly [AS_MEDIA]: boolean

  /** `asMedia` marks an image reached as product media (`product.media`, `featured_media`), the only images whose `preview_image` is set. */
  public constructor (public readonly data: ImageData, asMedia = false) {
    super()
    this[AS_MEDIA] = asMedia
    this.src = data.src
    this.width = data.width ?? null
    this.height = data.height ?? null
    this.aspect_ratio = data.width && data.height ? new LiquidFloat(data.width / data.height) : null
    this.alt = data.alt ?? ''
    this.id = data.id ?? null
    this.focal_point = data.focal_point ? `${data.focal_point.x}% ${data.focal_point.y}%` : null
    this.presentation = { focal_point: this.focal_point }
  }

  /** The image itself for product media, nil for images from anywhere else. https://shopify.dev/docs/api/liquid/objects/image#image-preview_image */
  public get preview_image (): ImageDrop | null {
    return this[AS_MEDIA] ? this : null
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
  if (input instanceof ImageDrop) return { image: input.data, alt: input.data.alt || title }
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

/** What `image_url` returns: the URL, printed as itself, carrying the image and parameters `image_tag` needs. */
export class ImageUrlDrop extends Drop {
  public constructor (public readonly url: string, public readonly image: ImageData, public readonly params: ImageUrlParams, public readonly alt: string) {
    super()
  }

  public valueOf () {
    return this.url
  }
}
