import { LiquidFloat } from '../../util/liquid-float'
import { HandleMap } from '../objects/handle-map'
import type { ImageDrop } from '../objects/image'
import { buildStore } from './build'
import type { ImageRole, LiquidObject } from './build'
import { resolveView } from './view'
import type { StoreView } from './view'
import type { StoreData } from './types'

/** An image's URL as the parity store answers it: in the Ajax answer the full `https://` address of the dataset, not the protocol-relative `//cdn.shopify.com/…` that https://shopify.dev/docs/api/ajax/reference/product shows (fixture `ajax-product-js`), and in `product | json` the image's `src`, protocol-relative (scenario `page-product`: `"src":"\/\/host\/cdn\/shop\/files\/…"`). */
const imageUrl = (image: ImageDrop | null | undefined, shape: 'ajax' | 'liquid') => image ? (shape === 'ajax' ? image.data.src : image.src) : null

/** The text of a field the Ajax API writes as `null` when it is empty (an image's `alt`, a variant's `sku`), as the parity store does (fixture `ajax-product-js`). */
const textOrNull = (text: unknown) => text === '' || text === undefined || text === null ? null : text

/** An image's own alt text as the answers write it, `null` when it has none: the title that `image.alt` reads in its place is for Liquid only (fixtures `probe-product-default` and `ajax-product-js`, where the media and the variants' images print `"alt":null`). */
const altOf = (image: ImageDrop) => textOrNull(image.data.alt)

/** Whether two variants show the same image: matched by `id` when both have one, by `src` otherwise (as the product's images are). */
const sameImage = (a: ImageDrop, b: ImageDrop) => a.id != null && b.id != null ? a.id === b.id : a.src === b.src

/** An image's aspect ratio as the answer writes it: in `product | json` the decimal itself, which the `json` filter writes with its point, `1.0` (scenarios `page-product`, `page-product-variant`, `page-product-subscription`, `page-product-requires-plan` and `page-product-en-eu`: `"aspect_ratio":1.0`), and in the Ajax answer the number, which `JSON.stringify` writes as `1` (the comparison reads that answer as JSON, where the two are one value, fixture `ajax-product-js`). */
const aspectRatio = (image: ImageDrop, shape: 'ajax' | 'liquid') => image.aspect_ratio ? (shape === 'ajax' ? image.aspect_ratio.value : new LiquidFloat(image.aspect_ratio.value)) : null

/** An image as the `preview_image` of a media entry or a variant's `featured_media` (fixture `ajax-product-js`: `aspect_ratio`, `height`, `width`, `src`). */
function previewImage (image: ImageDrop | null | undefined, shape: 'ajax' | 'liquid'): Record<string, unknown> | null {
  if (!image) return null
  return { aspect_ratio: aspectRatio(image, shape), height: image.height, width: image.width, src: imageUrl(image, shape) }
}

/** A variant's `featured_media` in the variant's JSON: the media's alt, id, position and preview image (fixtures `ajax-product-js` and `probe-product-default`). */
function variantMediaJson (media: ImageDrop, shape: 'ajax' | 'liquid'): Record<string, unknown> {
  return { alt: altOf(media), id: media.id, position: media.position, preview_image: previewImage(media, shape) }
}

/** A variant's image as the Ajax API writes it: the product's image with its `position` in `product.images`, the ids of the variants that show it and its two timestamps, which the dataset does not hold, so they are the product's creation time (the parity store prints the moments it made the image, which the engine cannot reproduce: `VOLATILE` in `test/storefront/expect-probe.ts`). */
function variantImage (image: ImageDrop, product: LiquidObject, shape: 'ajax' | 'liquid'): Record<string, unknown> {
  const variantIds = (product.variants as LiquidObject[]).filter(other => other.featured_image && sameImage(other.featured_image as ImageDrop, image)).map(other => other.id)
  return { id: image.id, product_id: product.id, position: image.position, created_at: product.created_at ?? null, updated_at: product.created_at ?? null, alt: altOf(image), width: image.width, height: image.height, src: imageUrl(image, shape), variant_ids: variantIds }
}

/** The answer's form of a selling plan allocation, the same in the Ajax answer and in `product | json` (fixtures `ajax-product-js` and `probe-product-plans`): the allocation's price fields with the ids of its plan and group in place of the objects. */
function allocationJson (allocation: LiquidObject): Record<string, unknown> {
  return {
    price_adjustments: allocation.price_adjustments,
    price: allocation.price,
    compare_at_price: allocation.compare_at_price,
    per_delivery_price: allocation.per_delivery_price,
    selling_plan_id: (allocation.selling_plan as LiquidObject).id,
    selling_plan_group_id: allocation.selling_plan_group_id
  }
}

/** A selling plan as the answer writes it: no `selected` or `group_id`, price adjustments with `value_type` before `value`, and `checkout_charge` in `product | json` only (the Ajax answer leaves it out), fixtures `ajax-product-js` and `probe-product-plans`. */
function sellingPlanJson (plan: LiquidObject, shape: 'ajax' | 'liquid'): Record<string, unknown> {
  const checkout = plan.checkout_charge as LiquidObject
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    options: plan.options,
    recurring_deliveries: plan.recurring_deliveries,
    price_adjustments: (plan.price_adjustments as LiquidObject[]).map(adjustment => ({ order_count: adjustment.order_count, position: adjustment.position, value_type: adjustment.value_type, value: adjustment.value })),
    ...(shape === 'liquid' ? { checkout_charge: { value_type: checkout.value_type, value: checkout.value } } : {})
  }
}

/** A selling plan group as the answer writes it: its options without the selected value, `app_id` last (fixtures `ajax-product-js` and `probe-product-plans`). */
function sellingPlanGroupJson (group: LiquidObject, shape: 'ajax' | 'liquid'): Record<string, unknown> {
  return {
    id: group.id,
    name: group.name,
    options: (group.options as LiquidObject[]).map(option => ({ name: option.name, position: option.position, values: option.values })),
    selling_plans: (group.selling_plans as LiquidObject[]).map(plan => sellingPlanJson(plan, shape)),
    app_id: group.app_id
  }
}

/** A decimal as the answers write a measurement's quantity: a whole number with one decimal (`250.0`), any other number as it is, both as text. */
const decimalText = (value: number) => Number.isInteger(value) ? value.toFixed(1) : String(value)

/** A variant in the Ajax answer (`.js`) or in `product | json` (`'liquid'`): the parity store prints the same fields in a different order, with `quantity_price_breaks` in the first only (fixtures `ajax-product-js` and `probe-product-default`). */
function variantJson (variant: LiquidObject, product: LiquidObject, shape: 'ajax' | 'liquid'): Record<string, unknown> {
  const featured = variant.featured_image as ImageDrop | null
  const media = variant.featured_media as ImageDrop | null
  const head = {
    id: variant.id,
    title: variant.title,
    option1: variant.option1,
    option2: variant.option2,
    option3: variant.option3,
    sku: textOrNull(variant.sku),
    requires_shipping: variant.requires_shipping,
    taxable: variant.taxable,
    featured_image: featured ? variantImage(featured, product, shape) : null,
    available: variant.available,
    name: variant.title === 'Default Title' ? product.title : `${product.title} - ${variant.title}`,
    public_title: variant.title === 'Default Title' ? null : variant.title,
    options: variant.options,
    price: variant.price,
    weight: variant.weight,
    compare_at_price: variant.compare_at_price,
    inventory_management: variant.inventory_management,
    barcode: variant.barcode ?? null,
    // a variant with no image has no `featured_media` key (fixtures `ajax-product-js-media`, variants of the gift card and the olive oil)
    ...(media ? { featured_media: variantMediaJson(media, shape) } : {})
  }
  const plans = { requires_selling_plan: variant.requires_selling_plan ?? false, selling_plan_allocations: (variant.selling_plan_allocations as LiquidObject[]).map(allocationJson) }
  // a variant with a unit price measurement has `unit_price` and the measurement, whose `quantity_value` is a decimal written as text (`"250.0"`), after `quantity_rule` in the Ajax answer and after `requires_selling_plan` in `product | json`
  const measurement = variant.unit_price_measurement as LiquidObject | null
  const unit = measurement ? { unit_price: variant.unit_price, unit_price_measurement: { measured_type: measurement.measured_type, quantity_value: decimalText(measurement.quantity_value as number), quantity_unit: measurement.quantity_unit, reference_value: measurement.reference_value, reference_unit: measurement.reference_unit } } : {}
  return shape === 'ajax'
    ? { ...head, quantity_rule: variant.quantity_rule, ...unit, quantity_price_breaks: variant.quantity_price_breaks ?? [], ...plans }
    : { ...head, requires_selling_plan: plans.requires_selling_plan, ...unit, selling_plan_allocations: plans.selling_plan_allocations, quantity_rule: variant.quantity_rule }
}

/**
 * A built variant, or a list of them (`product.variants`), as `{{ variant | json }}` prints it: the variants of `product | json` (`variantJson`, fixtures `probe-product-default` and `probe-product-en-ca`), whose keys and order are those the parity store prints for `product.variants | json` (scenarios `page-product`, `page-product-variant`: `id`, `title`, `option1` to `option3`, `sku` (nil without one), `requires_shipping`, `taxable`, `featured_image` as the Ajax API writes an image, `available`, `name`, `public_title`, `options`, `price`, `weight`, `compare_at_price`, `inventory_management`, `barcode`, `featured_media`, `requires_selling_plan`, `selling_plan_allocations`, `quantity_rule`). A single variant is printed the same way: no recording prints one on its own, so that is the list's element, not a pinned shape. The variant's product is the hidden back reference `buildProduct` sets.
 */
export function variantLiquidJson (variant: LiquidObject): Record<string, unknown> {
  return variantJson(variant, variant.product as LiquidObject, 'liquid')
}

/**
 * An image of a product, or a list of them (`product.media`, `product.images`, `product.featured_image`, `variant.featured_media`), as `{{ image | json }}` prints it: the form the same place has inside `product | json` (fixtures `probe-product-default` and `probe-product-en-ca`, scenario `page-product`): `product.images` and `product.featured_image` are the address (`src`), `product.media` and `product.featured_media` the media object (`mediaJson`), a variant's `featured_image` the image with its product and variant ids (`variantImage`) and its `featured_media` the short media object. No recording prints one of these alone, so the form of the place is what is assumed; the engine's own fields (`data` and the title that `alt` reads) are never printed, and `alt` is the image's own, `null` without one.
 */
export function imageLiquidJson (image: ImageDrop, place: ImageRole): unknown {
  switch (place.role) {
    case 'image': return imageUrl(image, 'liquid')
    case 'media': return mediaJson(image as unknown as LiquidObject, 'liquid')
    case 'variant_image': return variantImage(image, (place.variant as LiquidObject).product as LiquidObject, 'liquid')
    default: return variantMediaJson(image, 'liquid')
  }
}

/** The preview picture of a video, an external video or a model: its fields as `previewImage` writes them, the aspect ratio to three places in both answers (`1.778` for 960 by 540 and `1.333` for 480 by 360, fixtures `ajax-product-js-media` and `probe-product-video-media`: `product | json` and `media | json` print the rounded ratio where `{{ media.preview_image.aspect_ratio }}` prints the full one, scenario `page-product-video`: `--preview-ratio: 1.7777777777777777`). */
function mediaPreview (image: ImageDrop | null | undefined, shape: 'ajax' | 'liquid'): Record<string, unknown> | null {
  const preview = previewImage(image, shape)
  if (!preview) return preview
  const ratio = preview.aspect_ratio
  if (typeof ratio === 'number') preview.aspect_ratio = Math.round(ratio * 1000) / 1000
  else if (ratio instanceof LiquidFloat) preview.aspect_ratio = new LiquidFloat(Math.round(ratio.value * 1000) / 1000)
  return preview
}

/** A media entry as the Ajax API writes it. An image carries its own fields beside its `preview_image` (fixture `ajax-product-js`); a hosted video has its `aspect_ratio` and `duration` and its sources, an external video its `aspect_ratio`, `external_id` and `host`, a model only its sources, each source with `format`, `height`, `mime_type`, `url` and `width` (a model's without the size), as the parity store prints them (fixture `ajax-product-js-media`). */
function mediaJson (media: LiquidObject, shape: 'ajax' | 'liquid'): Record<string, unknown> {
  if (media.media_type === 'image') {
    const image = media as unknown as ImageDrop
    return { alt: altOf(image), id: image.id, position: image.position, preview_image: previewImage(image, shape), aspect_ratio: aspectRatio(image, shape), height: image.height, media_type: 'image', src: imageUrl(image, shape), width: image.width }
  }
  const head = { alt: textOrNull(media.alt), id: media.id, position: media.position, preview_image: mediaPreview(media.preview_image as ImageDrop | null, shape) }
  const ratio = media.aspect_ratio === null || media.aspect_ratio === undefined ? null : shape === 'ajax' ? Number(media.aspect_ratio) : media.aspect_ratio
  // Liquid lists a video's HLS playlist first (`media.sources`), and `media | json` and `product | json` list it last, as the Ajax answer does (scenario `probe-product-video-media`: `mp4` then `m3u8` in both)
  const listed = ((shape === 'ajax' ? media.ajax_sources : undefined) ?? media.sources ?? []) as Array<Record<string, unknown>>
  const sources = shape === 'ajax' ? listed : [...listed.filter(source => source.format !== 'm3u8'), ...listed.filter(source => source.format === 'm3u8')]
  const files = sources.map(source => ({ format: source.format, ...(source.height === undefined ? {} : { height: source.height }), mime_type: source.mime_type, url: source.url, ...(source.width === undefined ? {} : { width: source.width }) }))
  if (media.media_type === 'video') return { ...head, aspect_ratio: ratio, duration: media.duration, media_type: 'video', sources: files }
  if (media.media_type === 'external_video') return { ...head, aspect_ratio: ratio, external_id: media.external_id, host: media.host, media_type: 'external_video' }
  return { ...head, media_type: media.media_type, sources: files }
}

/** A video, external video or 3D model of a product as `product | json` and `product.media | json` print it. */
export const mediaLiquidJson = (media: LiquidObject): Record<string, unknown> => mediaJson(media, 'liquid')

/** The fields both answers start with, in their order (fixtures `ajax-product-js` and `probe-product-default`). */
function productHead (product: LiquidObject): Record<string, unknown> {
  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    description: product.description,
    published_at: product.published_at,
    created_at: product.created_at,
    vendor: product.vendor,
    type: product.type,
    tags: product.tags,
    price: product.price,
    price_min: product.price_min,
    price_max: product.price_max,
    available: product.available,
    price_varies: product.price_varies,
    compare_at_price: product.compare_at_price,
    compare_at_price_min: product.compare_at_price_min,
    compare_at_price_max: product.compare_at_price_max,
    compare_at_price_varies: product.compare_at_price_varies
  }
}

/**
 * The built `product` as https://shopify.dev/docs/api/ajax/reference/product answers `/products/<handle>.js`, with the key order and field forms of the parity store's answer (fixture `ajax-product-js`; it has `url` and no `content`, which the page does not list). Prices are the view's, because the product is built in it.
 */
export function productAjax (product: LiquidObject): Record<string, unknown> {
  return {
    ...productHead(product),
    variants: (product.variants as LiquidObject[]).map(variant => variantJson(variant, product, 'ajax')),
    // `featured_image` and `images` have no protocol in the parity store's answer, where the `src` of the media and of a variant's image have `https://` (fixture `ajax-product-js`)
    images: (product.images as ImageDrop[]).map(image => imageUrl(image, 'liquid')),
    featured_image: imageUrl(product.featured_image as ImageDrop | null, 'liquid'),
    options: (product.options_with_values as LiquidObject[]).map(option => ({ name: option.name, position: option.position, values: (option.values as unknown[]).map(String) })),
    url: product.url,
    media: (product.media as LiquidObject[]).map(media => mediaJson(media, 'ajax')),
    requires_selling_plan: product.requires_selling_plan,
    selling_plan_groups: (product.selling_plan_groups as LiquidObject[]).map(group => sellingPlanGroupJson(group, 'ajax'))
  }
}

/**
 * The built `product` as `{{ product | json }}` prints it. https://shopify.dev/docs/api/liquid/filters/json shows the product's fields, with `content` last; the parity store's object is not `/products/<handle>.js` (fixtures `probe-product-default`, `probe-product-en-ca` and `probe-product-en-eu-hoodie`): its `options` are the option names, it has no `url`, its variants have no `quantity_price_breaks` and list `quantity_rule` last, and it ends with `content`, the description. The page also says stores created after 5 December 2017 leave out the variants' `inventory_quantity` and `inventory_policy`, which the fixtures agree with.
 */
export function productLiquidJson (product: LiquidObject): Record<string, unknown> {
  return {
    ...productHead(product),
    variants: (product.variants as LiquidObject[]).map(variant => variantJson(variant, product, 'liquid')),
    images: (product.images as ImageDrop[]).map(image => imageUrl(image, 'liquid')),
    featured_image: imageUrl(product.featured_image as ImageDrop | null, 'liquid'),
    options: product.options,
    media: (product.media as LiquidObject[]).map(media => mediaJson(media, 'liquid')),
    requires_selling_plan: product.requires_selling_plan,
    selling_plan_groups: (product.selling_plan_groups as LiquidObject[]).map(group => sellingPlanGroupJson(group, 'liquid')),
    content: product.content
  }
}

/** The product `handle` as `/products/<handle>.js` answers it in `view` (the primary market and language when omitted), `productAjax` of the view's product; null for a handle the store does not have (the parity store answers 404, fixture `ajax-product-js`). The answer is the caller's own: `buildStore` keeps the built products for the next request, and the answer shares no array or object with them, so a caller may change it. */
export function productJson (data: StoreData, handle: string, view: StoreView = resolveView(data, {})): Record<string, unknown> | null {
  const product = HandleMap.get(buildStore(data, view).products, handle)
  // plain data all the way down (strings, numbers, booleans, null, arrays, objects), so a JSON round trip is a deep copy
  return product ? JSON.parse(JSON.stringify(productAjax(product))) : null
}
