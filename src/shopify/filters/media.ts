import type { Context } from '../../context'
import type { FilterImpl } from '../../template/filter-impl-options'
import { Drop } from '../../drop'
import { stringify, toValue } from '../../util'
import { attribute, escapeHtml, namedAttributes } from '../util/html'
import { splitArgs } from '../util/args'
import { hasOwn } from '../util/own'
import { currentFrame, shopifyState, ShopifyState } from '../state'
import { focalText, ImageDrop, ImageUrlDrop, imageSource } from '../objects/image'
import { SafeHtmlDrop } from '../objects/safe-html'
import type { ImageData, ImageUrlParams } from '../types'
import type { ShopifyFilterSet } from './types'

const MAX_DIMENSION = 5760
const URL_PARAMS: Array<keyof ImageUrlParams> = ['width', 'height', 'crop', 'format', 'pad_color', 'quality', 'crop_left', 'crop_top', 'crop_width', 'crop_height']
const NUMERIC_PARAMS = ['width', 'height', 'quality', 'crop_left', 'crop_top', 'crop_width', 'crop_height']
/** The `quality` range https://shopify.dev/docs/api/liquid/filters/image_url gives ("an integer from `10` to `90`"). The page does not say what a value outside it does; this package clamps it. */
const MIN_QUALITY = 10
const MAX_QUALITY = 90

/** `image_tag`'s default `srcset` widths. shopify.dev confirms 352 only ("a smart set of default widths up to the maximum defined in the image URL"); the rest must be pinned on the dev store. */
export const DEFAULT_SRCSET_WIDTHS: readonly number[] = Object.freeze([352, 832, 1200, 1920, 2560, 3840])

/** Sections after the third in their location get `loading="lazy"` from `image_tag` and `video_tag` unless told otherwise. https://shopify.dev/docs/api/liquid/objects/section (section.index) */
const EAGER_SECTIONS = 3

function lazyByDefault (state: ShopifyState): boolean {
  const index = currentFrame(state)?.section.index
  return typeof index === 'number' && index > EAGER_SECTIONS
}

/**
 * Returns the image's CDN URL through the `imageUrl` service; `image_tag` reads the image and parameters from the result. https://shopify.dev/docs/api/liquid/filters/image_url
 *
 * The page's Caution says that without a `width` or `height` "an error is returned", but Shopify's reference theme (Dawn, recorded in liquid-spec's Dawn template) prints `{{ image | image_url }}` with no size as the last `srcset` candidate, so this package reads the Caution as "no resize happens": the URL has no `width` or `height` (the `crop: 'region'` examples on the page print one too), and any other parameter given is kept. A `width` or `height` that is empty, nil or not above zero counts as omitted. What Shopify prints for the sizeless form is not pinned by shopify.dev, so it goes on the "confirm on a development store" list. The page's Note says an image "can never be resized to be larger than its original dimensions", which is what the CDN does with the URL; the parity store keeps the size the template asked for in the URL (scenario `page-collections`: a request for 1500 pixels of an image 1024 pixels wide is `width=1500` in the address), so `width` and `height` stop only at the 5760 maximum the page gives. When both are given and one is over the maximum, both are scaled by the same factor, so a square request stays a square; shopify.dev does not say how the ratio is handled when a request is too large, so this proportional clamp is not pinned. `image_tag` writes the size and builds its srcset from the URL's size, as the parity store prints Horizon's collection cards (a 3840 pixel request of a 1024 pixel image is `width="3840"`, with a candidate for every width up to 3840). `quality` stays within the page's 10 to 90.
 */
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
      if (!Number.isFinite(n) || n <= 0) continue
      ;(params as Record<string, number>)[key] = key === 'quality' ? Math.min(Math.max(n, MIN_QUALITY), MAX_QUALITY) : n
    } else {
      (params as Record<string, string>)[key] = stringify(value)
    }
  }
  // the URL names the size that was asked for, held to the 5760 maximum; it is not cut to the image's own size (scenario `page-collections`: a request for 1500 pixels of an image 1024 pixels wide is `width=1500` in the address)
  const asked = withinLimit(params, MAX_DIMENSION)
  // `image_tag` writes the size and builds its srcset from the URL's size, as the parity store prints it: Horizon's `image_url: width: 3840 | image_tag: widths: …` of a collection image 1024 pixels wide is width="3840" height="3840" with a candidate for every width up to 3840 (scenario `page-collections` of the Horizon recording)
  return new ImageUrlDrop(shopifyState(this.context).services.imageUrl(source.image, asked), source.image, asked, source.alt)
}

/** `params` with `width` and `height` scaled by one factor so that neither is over its limit (`maxHeight` is `maxWidth` when not given): a request over a limit keeps its ratio. */
function withinLimit (params: ImageUrlParams, maxWidth: number, maxHeight = maxWidth): ImageUrlParams {
  const factor = Math.min(1, params.width ? maxWidth / params.width : 1, params.height ? maxHeight / params.height : 1)
  if (factor >= 1) return params
  const scaled = { ...params }
  if (scaled.width) scaled.width = Math.max(1, Math.round(scaled.width * factor))
  if (scaled.height) scaled.height = Math.max(1, Math.round(scaled.height * factor))
  return scaled
}

function widthsFrom (value: unknown): number[] {
  return stringify(value).split(',').map(part => Math.round(Number(part.trim()))).filter(n => Number.isFinite(n) && n > 0)
}

/**
 * `<img>` for an `image_url`, matching every example on https://shopify.dev/docs/api/liquid/filters/image_tag and the parity store: `src`, `alt`, `srcset`, `width`, `height`, `loading`, the focal-point `style` when no `style` is named, then the other named attributes, `sizes` included, in the order the template wrote them (the page's `loading` example prints `loading` before the `class` written first; the parity store prints `loading="lazy" class=… sizes="auto" ref="" … style=…` for Horizon's resource cards, which name `loading`, `class`, `widths`, `sizes`, `ref`, `data-media-id` and `style`, and `loading=… sizes=… class=…` for its product media, which name `sizes` before `loading`, private parity recordings of Horizon). A name written twice prints once, where it was first written, with its last value (`splitArgs`). `width`/`height` default to the URL's size and aspect ratio; naming one keeps only that one; `nil` removes it. The `srcset` stops at the URL's width, `widths` included (Horizon's resource cards ask for `240, 352, 832, 1200` from a 500-pixel URL, and the parity store prints `240w` and `352w`). Where the focal-point `style` goes when `loading` is also printed is not pinned (the page's focal-point example has no `loading`).
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
  let urlWidth = params.width ?? (params.height && aspect ? Math.round(params.height * aspect) : image.width)
  let urlHeight = params.height ?? (urlWidth && aspect ? Math.round(urlWidth / aspect) : image.height)
  // a height alone makes the width from the aspect ratio, which may pass the 5760 maximum: both are scaled to keep the ratio, as `imageUrl` does for a request with two sides
  if (!params.width && params.height && aspect) {
    const held = withinLimit({ width: urlWidth, height: params.height }, MAX_DIMENSION)
    urlWidth = held.width
    urlHeight = held.height
  }

  let width: unknown = urlWidth
  let height: unknown = urlHeight
  if (hasOwn(named, 'width') || hasOwn(named, 'height')) {
    width = hasOwn(named, 'width') ? named.width : undefined
    height = hasOwn(named, 'height') ? named.height : undefined
  }

  let srcset: string | undefined
  if (hasOwn(named, 'srcset')) {
    srcset = named.srcset === null || named.srcset === undefined ? undefined : stringify(named.srcset)
  } else if (url && urlWidth) {
    const max = urlWidth
    let widths = (hasOwn(named, 'widths') ? widthsFrom(named.widths) : [...DEFAULT_SRCSET_WIDTHS]).filter(w => w <= max)
    const asked = Number(width)
    if (!hasOwn(named, 'widths') && hasOwn(named, 'width') && Number.isFinite(asked) && asked > 0 && asked <= max) widths.push(asked)
    if (!widths.length) widths = [max]
    widths = [...new Set(widths)].sort((a, b) => a - b)
    srcset = widths.map(w => {
      const scaled: ImageUrlParams = { ...params, width: w }
      // both sizes keep their ratio at every width; a height alone is dropped, so the CDN works it out from the width as the image_url page says
      if (params.height && params.width) scaled.height = Math.round(w * params.height / params.width)
      else delete scaled.height
      return `${state.services.imageUrl(image, scaled)} ${w}w`
    }).join(', ')
  }

  let html = `<img src="${escapeHtml(src)}"${attribute('alt', hasOwn(named, 'alt') ? named.alt : url?.alt ?? '')}`
  if (srcset) html += attribute('srcset', srcset)
  html += attribute('width', width) + attribute('height', height)
  const loading = hasOwn(named, 'loading') ? named.loading : (named.preload !== true && lazyByDefault(state) ? 'lazy' : undefined)
  html += attribute('loading', loading)
  if (image.focal_point && !hasOwn(named, 'style')) html += attribute('style', `object-position:${focalText(image.focal_point)};`)
  html += namedAttributes(state.report, 'image_tag', named, order, ['alt', 'width', 'height', 'widths', 'srcset', 'preload', 'loading'])
  // HTML-safe, so `| escape` after it changes nothing, as on Shopify (see `SafeHtmlDrop`)
  return new SafeHtmlDrop(html + '>')
}

/** The named `img_url` sizes and their square dimensions in pixels, `original` and `master` included (1024 by 1024). https://shopify.dev/docs/api/liquid/filters/img_url */
const NAMED_SIZES: Record<string, number> = { pico: 16, icon: 32, thumb: 50, small: 100, compact: 160, medium: 240, large: 480, grande: 600, original: 1024, master: 1024 }

/**
 * Parses an `img_url` size (`480x`, `x480`, `480x480`, `large`) into `size`, the legacy name that goes into the file name, and the `width` and `height` it stands for, up to the 5760 by 5760 the page allows. A missing, unknown or empty size (`0x0`) is `small`: the page names no default, its no-argument example just prints a `_small` file, and it does not say what an unknown size does. https://shopify.dev/docs/api/liquid/filters/img_url, and https://shopify.dev/docs/api/liquid/filters/video_tag for the poster's `image_size`.
 */
export function legacySize (size: unknown): ImageUrlParams {
  const text = stringify(size || 'small')
  if (hasOwn(NAMED_SIZES, text)) {
    const n = NAMED_SIZES[text]
    return { size: text, width: n, height: n }
  }
  const match = /^(\d*)x(\d*)$/.exec(text)
  const width = match ? Math.min(Number(match[1]), MAX_DIMENSION) : 0
  const height = match ? Math.min(Number(match[2]), MAX_DIMENSION) : 0
  if (!width && !height) return { size: 'small', width: NAMED_SIZES.small, height: NAMED_SIZES.small }
  const params: ImageUrlParams = { size: `${width || ''}x${height || ''}` }
  if (width) params.width = width
  if (height) params.height = height
  return params
}

/** Deprecated `img_url`: the same image through the `imageUrl` service, with the legacy `size` that names the file (`small` by default), so the default service prints `..._480x.jpg?v=...` as the page does. `scale` multiplies the pixel `width` and `height` handed to services; the page's `scale`, `crop` and `format` examples print the same URL as the plain one, so the default service ignores all three. https://shopify.dev/docs/api/liquid/filters/img_url */
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

/** The alt text of a media, else the title of the product in scope: https://shopify.dev/docs/api/liquid/filters/external_video_tag says that "if no alt text is set, then the `title` attribute is set to the product title". A media object has no product of its own here, so the `product` variable in scope stands in for it; `video_tag` uses the same fallback for its `aria-label`, which its page does not state. */
function altOrProductTitle (context: Context, alt: unknown): string {
  const own = alt === undefined || alt === null ? '' : stringify(alt)
  if (own) return own
  try {
    const title = context.getSync(['product', 'title'])
    return typeof title === 'string' ? title : ''
  } catch {
    return ''
  }
}

interface VideoSource {
  url: string
  mime_type?: string
  format?: string
}

/** `<video>` for a video media, in the attribute order of https://shopify.dev/docs/api/liquid/filters/video_tag. The poster and the `<img>` fallback are the preview image with the legacy `image_size` (`small` by default, `400x` in the page's example) in the file name.
 *
 * As the parity store prints it (scenarios `probe-product-video-media` and `page-product-video`): the template's attributes come in the order it wrote them, a `preload` among them replaces the default `preload="metadata"` in its place, `autoplay` without `muted` adds `muted` after the `preload`, only the files that are not an HLS playlist (`m3u8`) are written as `<source>`, and the `<img>` fallback has the media's alt text and then its `src`. */
function videoTag (this: FilterImpl, input: unknown, ...args: unknown[]) {
  const state = shopifyState(this.context)
  const media = toValue(input) as Record<string, unknown> | undefined
  if (!media || typeof media !== 'object') return ''
  const { named, order } = splitArgs(args)
  const preview = imageSource(media.preview_image)
  const poster = preview ? state.services.imageUrl(preview.image, legacySize(named.image_size)) : ''
  let html = '<video playsinline="playsinline"'
  html += namedAttributes(state.report, 'video_tag', named, order, ['image_size', 'loading'])
  if (!hasOwn(named, 'preload')) html += attribute('preload', 'metadata')
  if (named.autoplay === true && !hasOwn(named, 'muted')) html += attribute('muted', true)
  html += attribute('aria-label', altOrProductTitle(this.context, media.alt))
  if (poster) html += attribute('poster', poster)
  const loading = hasOwn(named, 'loading') ? named.loading : (lazyByDefault(state) ? 'lazy' : undefined)
  html += attribute('loading', loading) + '>'
  const sources = (Array.isArray(media.sources) ? media.sources : []) as VideoSource[]
  const playlist = (source: VideoSource) => /m3u8/.test(source.format ?? source.mime_type ?? '')
  for (const source of sources.some(source => !playlist(source)) ? sources.filter(source => !playlist(source)) : sources) {
    html += `<source src="${escapeHtml(source.url)}"${attribute('type', source.mime_type)}>`
  }
  if (poster) html += `<img${attribute('alt', altOrProductTitle(this.context, media.alt))} src="${escapeHtml(poster)}">`
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

/** The YouTube or Vimeo player URL for an external video, with Shopify's YouTube defaults and keys sorted as in https://shopify.dev/docs/api/liquid/filters/external_video_url. Only the video provider's own host is used. */
function externalVideoUrl (this: FilterImpl, input: unknown, ...args: unknown[]) {
  const media = toValue(input) as Record<string, unknown> | undefined
  if (!media || typeof media !== 'object') return ''
  const host = stringify(media.host)
  if (!hasOwn(EMBEDS, host)) return ''
  const embed = EMBEDS[host]
  const { named } = splitArgs(args)
  const query: Record<string, string> = embed.defaults(shopifyState(this.context).request.origin)
  for (const [key, value] of Object.entries(named)) query[key] = typeof value === 'boolean' ? (value ? '1' : '0') : stringify(value)
  const keys = Object.keys(query).filter(key => query[key] !== '').sort()
  const url = `${embed.base}${encodeURIComponent(stringify(media.external_id))}${keys.length ? '?' + keys.map(key => `${key}=${encodeURIComponent(query[key])}`).join('&') : ''}`
  return new ExternalVideoUrlDrop(url, media)
}

/** `<iframe>` for an external video or an `external_video_url`. https://shopify.dev/docs/api/liquid/filters/external_video_tag */
function externalVideoTag (this: FilterImpl, input: unknown, ...args: unknown[]) {
  const target = input instanceof ExternalVideoUrlDrop ? input : externalVideoUrl.call(this, input)
  if (!(target instanceof ExternalVideoUrlDrop)) return ''
  const { named, order } = splitArgs(args)
  const extra = namedAttributes(shopifyState(this.context).report, 'external_video_tag', named, order)
  return `<iframe frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen="allowfullscreen"${extra} src="${escapeHtml(target.url)}"${attribute('title', altOrProductTitle(this.context, target.media.alt))}></iframe>`
}

/**
 * The tag for any media: `image_tag` (an `ImageDrop` from `product.media` or an image record), `video_tag` (with controls), `external_video_tag`; 3D models are not rendered. https://shopify.dev/docs/api/liquid/filters/media_tag
 *
 * The page has no image example, so the image branch is not pinned: it renders `image_tag` at the image's own width (1100 when it has none).
 */
function mediaTag (this: FilterImpl, input: unknown, ...args: unknown[]) {
  const imageTagFor = (image: unknown) => {
    const source = imageSource(image)
    if (!source) return ''
    return imageTag.call(this, imageUrl.call(this, image, ['width', source.image.width ?? 1100]), ...args)
  }
  if (input instanceof ImageDrop) return imageTagFor(input)
  const media = toValue(input) as Record<string, unknown> | undefined
  if (!media || typeof media !== 'object') return ''
  const type = stringify(media.media_type)
  if (type === 'video') {
    const controls = splitArgs(args).named
    return videoTag.call(this, media, ...(hasOwn(controls, 'controls') ? [] : [['controls', true]]), ...args)
  }
  if (type === 'external_video') return externalVideoTag.call(this, media, ...args)
  if (type === 'model') {
    shopifyState(this.context).report.unsupported('media_tag', '3D model media renders nothing')
    return ''
  }
  return imageTagFor(media)
}

/** The attributes `model_viewer_tag` writes after the model's `src`, in the order of https://shopify.dev/docs/api/liquid/filters/model_viewer_tag's output; a template's argument of the same name replaces the value in its place. */
const MODEL_VIEWER_DEFAULTS = ['camera-controls', 'style', 'data-shopify-feature', 'alt', 'poster']

/**
 * A `<model-viewer>` for a 3D model, https://shopify.dev/docs/api/liquid/filters/model_viewer_tag: `src` (the model's `glb` source), `camera-controls="true"`, `style="--poster-color: transparent;"`, `data-shopify-feature="1.12"`, `alt` (the media's alt text, else the product's title) and `poster` (the preview image with the legacy `image_size`, `small` by default), as the page prints them. Other attributes a template names come first (`<model-viewer interaction-policy="allow-when-focused" src=…`), as the page's example shows; one that names a default attribute replaces its value in place, which the page states ("You can override these attributes") without an example of where it goes, so the place is not pinned.
 *
 * A model is a media with `media_type: 'model'` and its `sources` (`url`, `format`), https://shopify.dev/docs/api/liquid/objects/model; the store data has no 3D models (`MediaData` describes images and videos), so a theme meets one only in data a caller supplies. Anything that is not a model prints nothing and is reported.
 */
function modelViewerTag (this: FilterImpl, input: unknown, ...args: unknown[]) {
  const state = shopifyState(this.context)
  const media = toValue(input) as Record<string, unknown> | undefined
  if (!media || typeof media !== 'object' || media.media_type !== 'model') {
    state.report.unsupported('model_viewer_tag', 'only a 3D model media has a model viewer')
    return ''
  }
  const sources = (Array.isArray(media.sources) ? media.sources : []) as Array<Record<string, unknown>>
  const source = sources.find(entry => stringify(entry.format) === 'glb') ?? sources[0]
  const { named, order } = splitArgs(args)
  const preview = imageSource(media.preview_image)
  const defaults: Record<string, unknown> = {
    'camera-controls': 'true',
    style: '--poster-color: transparent;',
    'data-shopify-feature': '1.12',
    alt: altOrProductTitle(this.context, media.alt),
    poster: preview ? state.services.imageUrl(preview.image, legacySize(named.image_size)) : undefined
  }
  const extra = namedAttributes(state.report, 'model_viewer_tag', named, order, ['src', 'image_size', ...MODEL_VIEWER_DEFAULTS])
  const own = MODEL_VIEWER_DEFAULTS.map(name => attribute(name, hasOwn(named, name) ? named[name] : defaults[name])).join('')
  return `<model-viewer${extra}${attribute('src', source?.url)}${own}></model-viewer>`
}

export const mediaFilters: ShopifyFilterSet = {
  image_url: { status: 'approx', handler: imageUrl },
  image_tag: { status: 'approx', handler: imageTag },
  img_url: { status: 'approx', handler: imgUrl },
  video_tag: { status: 'approx', handler: videoTag },
  media_tag: { status: 'approx', handler: mediaTag },
  external_video_url: { status: 'approx', handler: externalVideoUrl },
  external_video_tag: { status: 'approx', handler: externalVideoTag },
  model_viewer_tag: { status: 'approx', handler: modelViewerTag }
}
