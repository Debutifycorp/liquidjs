import type { FilterImpl } from '../../template/filter-impl-options'
import { Drop } from '../../drop'
import { stringify, toValue } from '../../util'
import { attribute, escapeHtml } from '../util/html'
import { has, splitArgs } from '../util/args'
import { currentFrame, shopifyState, ShopifyState } from '../state'
import { ImageUrlDrop, imageSource } from '../objects/image'
import type { ImageData, ImageUrlParams } from '../types'
import type { ShopifyFilterSet } from './types'

const MAX_DIMENSION = 5760
const URL_PARAMS: Array<keyof ImageUrlParams> = ['width', 'height', 'crop', 'format', 'pad_color', 'quality', 'crop_left', 'crop_top', 'crop_width', 'crop_height']
const NUMERIC_PARAMS = ['width', 'height', 'quality', 'crop_left', 'crop_top', 'crop_width', 'crop_height']

/** `image_tag`'s default `srcset` widths. shopify.dev confirms 352 only ("a smart set of default widths up to the maximum defined in the image URL"); the rest must be pinned on the dev store. */
export const DEFAULT_SRCSET_WIDTHS = [352, 832, 1200, 1920, 2560, 3840]

/** Sections after the third in their location get `loading="lazy"` from `image_tag` and `video_tag` unless told otherwise. https://shopify.dev/docs/api/liquid/objects/section (section.index) */
const EAGER_SECTIONS = 3

function lazyByDefault (state: ShopifyState): boolean {
  const index = currentFrame(state)?.section.index
  return typeof index === 'number' && index > EAGER_SECTIONS
}

/** Returns the image's CDN URL through the `imageUrl` service; `image_tag` reads the image and parameters from the result. https://shopify.dev/docs/api/liquid/filters/image_url */
function imageUrl (this: FilterImpl, input: unknown, ...args: unknown[]) {
  const source = imageSource(input)
  if (!source) return ''
  const { named } = splitArgs(args)
  const params: ImageUrlParams = {}
  for (const key of URL_PARAMS) {
    const value = named[key]
    if (value === undefined || value === null || value === '') continue
    if (NUMERIC_PARAMS.includes(key)) {
      const n = Math.round(Number(value))
      if (Number.isFinite(n) && n > 0) (params as Record<string, number>)[key] = key === 'width' || key === 'height' ? Math.min(n, MAX_DIMENSION) : n
    } else {
      (params as Record<string, string>)[key] = stringify(value)
    }
  }
  return new ImageUrlDrop(shopifyState(this.context).services.imageUrl(source.image, params), source.image, params, source.alt)
}

function widthsFrom (value: unknown): number[] {
  return stringify(value).split(',').map(part => Math.round(Number(part.trim()))).filter(n => Number.isFinite(n) && n > 0)
}

/**
 * `<img>` for an `image_url`, matching every example on https://shopify.dev/docs/api/liquid/filters/image_tag: `src`, `alt`, `srcset`, `width`, `height`, `sizes`, focal-point `style`, `loading`, then other attributes in the order given. `width`/`height` default to the URL's size and aspect ratio; naming one keeps only that one; `nil` removes it.
 */
function imageTag (this: FilterImpl, input: unknown, ...args: unknown[]) {
  const state = shopifyState(this.context)
  const { named, order } = splitArgs(args)
  const url = input instanceof ImageUrlDrop ? input : undefined
  const src = url ? url.url : stringify(toValue(input))
  if (!src) return ''
  const image: ImageData = url?.image ?? { src }
  const params = url?.params ?? {}
  const aspect = image.width && image.height ? image.width / image.height : undefined
  const urlWidth = params.width ?? (params.height && aspect ? Math.round(params.height * aspect) : image.width)
  const urlHeight = params.height ?? (urlWidth && aspect ? Math.round(urlWidth / aspect) : image.height)

  let width: unknown = urlWidth
  let height: unknown = urlHeight
  if (has(named, 'width') || has(named, 'height')) {
    width = has(named, 'width') ? named.width : undefined
    height = has(named, 'height') ? named.height : undefined
  }

  let srcset: string | undefined
  if (has(named, 'srcset')) {
    srcset = named.srcset === null || named.srcset === undefined ? undefined : stringify(named.srcset)
  } else if (url && urlWidth) {
    const max = Math.min(urlWidth, image.width ?? Infinity)
    let widths = has(named, 'widths') ? widthsFrom(named.widths) : DEFAULT_SRCSET_WIDTHS.filter(w => w <= max)
    const asked = Number(width)
    if (!has(named, 'widths') && has(named, 'width') && Number.isFinite(asked) && asked > 0 && asked <= max) widths.push(asked)
    if (!widths.length) widths = [max]
    widths = [...new Set(widths)].sort((a, b) => a - b)
    srcset = widths.map(w => {
      const scaled: ImageUrlParams = { ...params, width: w }
      if (params.height && params.width) scaled.height = Math.round(w * params.height / params.width)
      return `${state.services.imageUrl(image, scaled)} ${w}w`
    }).join(', ')
  }

  let html = `<img src="${escapeHtml(src)}"${attribute('alt', has(named, 'alt') ? named.alt ?? '' : url?.alt ?? '')}`
  if (srcset) html += attribute('srcset', srcset)
  html += attribute('width', width) + attribute('height', height)
  if (has(named, 'sizes')) html += attribute('sizes', named.sizes)
  if (image.focal_point && !has(named, 'style')) html += attribute('style', `object-position:${Number(image.focal_point.x.toFixed(4))}% ${Number(image.focal_point.y.toFixed(4))}%;`)
  const loading = has(named, 'loading') ? named.loading : (named.preload !== true && lazyByDefault(state) ? 'lazy' : undefined)
  html += attribute('loading', loading)
  for (const name of order) {
    if (!['alt', 'width', 'height', 'sizes', 'widths', 'srcset', 'preload', 'loading'].includes(name)) html += attribute(name, named[name])
  }
  return html + '>'
}

/** The named `img_url` sizes and their square dimensions in pixels, `original` and `master` included (1024 by 1024). https://shopify.dev/docs/api/liquid/filters/img_url */
const NAMED_SIZES: Record<string, number> = { pico: 16, icon: 32, thumb: 50, small: 100, compact: 160, medium: 240, large: 480, grande: 600, original: 1024, master: 1024 }

/** Parses an `img_url` size (`480x`, `x480`, `480x480`, `large`) into CDN parameters, up to the 5760 by 5760 the page allows. A missing size is `small`: the page names no default, its no-argument example just prints a `_small` file. https://shopify.dev/docs/api/liquid/filters/img_url */
export function legacySize (size: unknown): ImageUrlParams {
  const text = stringify(size || 'small')
  if (Object.prototype.hasOwnProperty.call(NAMED_SIZES, text)) {
    const n = NAMED_SIZES[text]
    return { width: n, height: n }
  }
  const match = /^(\d*)x(\d*)$/.exec(text)
  if (!match) return { width: 100, height: 100 }
  const params: ImageUrlParams = {}
  if (match[1]) params.width = Math.min(Number(match[1]), MAX_DIMENSION)
  if (match[2]) params.height = Math.min(Number(match[2]), MAX_DIMENSION)
  return params
}

/** Deprecated `img_url`: the same image through the `imageUrl` service, sized as its size argument says (`small` by default). https://shopify.dev/docs/api/liquid/filters/img_url */
function imgUrl (this: FilterImpl, input: unknown, ...args: unknown[]) {
  const source = imageSource(input)
  if (!source) return ''
  const { positional, named } = splitArgs(args)
  const params = legacySize(positional[0])
  const scale = Number(named.scale)
  if (scale === 2 || scale === 3) {
    if (params.width) params.width *= scale
    if (params.height) params.height *= scale
  }
  if (named.crop) params.crop = stringify(named.crop)
  if (named.format) params.format = stringify(named.format)
  return shopifyState(this.context).services.imageUrl(source.image, params)
}

interface VideoSource {
  url: string
  mime_type?: string
  format?: string
}

/** `<video>` for a video media, in the attribute order of https://shopify.dev/docs/api/liquid/filters/video_tag. */
function videoTag (this: FilterImpl, input: unknown, ...args: unknown[]) {
  const state = shopifyState(this.context)
  const media = toValue(input) as Record<string, unknown> | undefined
  if (!media || typeof media !== 'object') return ''
  const { named, order } = splitArgs(args)
  const preview = imageSource(media.preview_image)
  const poster = preview ? state.services.imageUrl(preview.image, legacySize(named.image_size)) : ''
  let html = '<video playsinline="playsinline"'
  for (const name of order) {
    if (name !== 'image_size' && name !== 'loading') html += attribute(name, named[name])
  }
  html += ' preload="metadata"' + attribute('aria-label', media.alt ?? '')
  if (poster) html += attribute('poster', poster)
  const loading = has(named, 'loading') ? named.loading : (lazyByDefault(state) ? 'lazy' : undefined)
  html += attribute('loading', loading) + '>'
  const sources = (Array.isArray(media.sources) ? media.sources : []) as VideoSource[]
  for (const source of sources) {
    if (named.loop === true && /m3u8/.test(source.format ?? source.mime_type ?? '')) continue
    html += `<source src="${escapeHtml(source.url)}"${attribute('type', source.mime_type)}>`
  }
  if (poster) html += `<img src="${escapeHtml(poster)}">`
  return html + '</video>'
}

const EMBEDS: Record<string, { base: string, defaults: (origin: string) => Record<string, string> }> = {
  youtube: { base: 'https://www.youtube.com/embed/', defaults: origin => ({ controls: '1', enablejsapi: '1', modestbranding: '1', origin, playsinline: '1', rel: '0' }) },
  vimeo: { base: 'https://player.vimeo.com/video/', defaults: () => ({}) }
}

/** What `external_video_url` returns: the embed URL, carrying the media for `external_video_tag`'s title. */
export class ExternalVideoUrlDrop extends Drop {
  public constructor (public readonly url: string, public readonly media: Record<string, unknown>) {
    super()
  }

  public valueOf () {
    return this.url
  }
}

/** The YouTube or Vimeo player URL for an external video, with Shopify's YouTube defaults and keys sorted as in https://shopify.dev/docs/api/liquid/filters/external_video_url. Only the video provider's own host is used. */
function externalVideoUrl (this: FilterImpl, input: unknown, ...args: unknown[]) {
  const media = toValue(input) as Record<string, unknown> | undefined
  if (!media || typeof media !== 'object') return ''
  const embed = EMBEDS[stringify(media.host)]
  if (!embed) return ''
  const { named } = splitArgs(args)
  const query: Record<string, string> = embed.defaults(shopifyState(this.context).request.origin)
  for (const [key, value] of Object.entries(named)) query[key] = stringify(value)
  const keys = Object.keys(query).filter(key => query[key] !== '').sort()
  const url = `${embed.base}${encodeURIComponent(stringify(media.external_id))}${keys.length ? '?' + keys.map(key => `${key}=${encodeURIComponent(query[key])}`).join('&') : ''}`
  return new ExternalVideoUrlDrop(url, media)
}

/** `<iframe>` for an external video or an `external_video_url`. https://shopify.dev/docs/api/liquid/filters/external_video_tag */
function externalVideoTag (this: FilterImpl, input: unknown, ...args: unknown[]) {
  const target = input instanceof ExternalVideoUrlDrop ? input : externalVideoUrl.call(this, input)
  if (!(target instanceof ExternalVideoUrlDrop)) return ''
  const { named, order } = splitArgs(args)
  const extra = order.map(name => attribute(name, named[name])).join('')
  return `<iframe frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen="allowfullscreen"${extra} src="${escapeHtml(target.url)}"${attribute('title', target.media.alt ?? '')}></iframe>`
}

/** The tag for any media: `image_tag`, `video_tag` (with controls), `external_video_tag`; 3D models are not rendered. https://shopify.dev/docs/api/liquid/filters/media_tag */
function mediaTag (this: FilterImpl, input: unknown, ...args: unknown[]) {
  const media = toValue(input) as Record<string, unknown> | undefined
  if (!media || typeof media !== 'object') return ''
  const type = stringify(media.media_type)
  if (type === 'video') return videoTag.call(this, media, ['controls', true], ...args)
  if (type === 'external_video') return externalVideoTag.call(this, media, ...args)
  if (type === 'model') {
    shopifyState(this.context).report.unsupported('media_tag', '3D model media renders nothing')
    return ''
  }
  const source = imageSource(media)
  if (!source) return ''
  const url = imageUrl.call(this, media, ['width', source.image.width ?? 1100])
  return imageTag.call(this, url, ...args)
}

export const mediaFilters: ShopifyFilterSet = {
  image_url: { status: 'approx', handler: imageUrl },
  image_tag: { status: 'approx', handler: imageTag },
  img_url: { status: 'approx', handler: imgUrl },
  video_tag: { status: 'approx', handler: videoTag },
  media_tag: { status: 'approx', handler: mediaTag },
  external_video_url: { status: 'approx', handler: externalVideoUrl },
  external_video_tag: { status: 'approx', handler: externalVideoTag }
}
