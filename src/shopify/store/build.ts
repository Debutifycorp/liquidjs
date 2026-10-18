import { LiquidFloat } from '../../util/liquid-float'
import { ImageDrop } from '../objects/image'
import { HandleMap } from '../objects/handle-map'
import { buildMetafields } from '../objects/metafield'
import type { MetafieldResolver } from '../objects/metafield'
import { buildOptions, keepOptionInfo, optionInfoOf, optionValueId, OptionsByNameDrop, SwatchDrop } from '../objects/product-option'
import type { OptionValueInfo } from '../objects/product-option'
import type { ImageData } from '../types'
import { escapeHtml } from '../util/html'
import { handleize } from '../util/handleize'
import { hasOwn, own } from '../util/own'
import { buildCartObject, cartStateOf } from './cart'
import { buildFilters } from './filters'
import { buildLocalization, currencyOf, enabledCurrencies, marketRoot } from './markets'
import type { ViewCurrency } from './markets'
import { convert, planAmount, planPrice } from './pricing'
import { byTitle, SORT_VALUES, sortProducts } from './sort'
import { translateData } from './translate'
import { resolveView, viewKey, withoutPrefix, withPrefix } from './view'
import type { StoreView } from './view'
import type { AddressData, ArticleData, BlogData, CollectionData, CountryOptionData, CustomerData, FilterData, GiftCardData, LinkData, LinkListData, MediaData, OrderData, PageData, PolicyData, ProductData, SellingPlanData, SellingPlanGroupData, StoreAvailabilityData, StoreData, TransactionData, UnitPriceMeasurementData, VariantData } from './types'

/**
 * Turns `StoreData` into the objects Liquid reads, computing what Shopify derives (URLs, price ranges, the first available variant, option values) so templates find every field they expect. Built objects are plain objects, readable under `ownPropertyOnly`; images become `ImageDrop`s and handle-keyed collections `HandleMap`s. Field lists follow https://shopify.dev/docs/api/liquid/objects, object by object as each builder cites.
 */
export type LiquidObject = Record<string, unknown>

export interface StoreObjects {
  /** The data the objects were built from, before `translateData`: the cart reads the store's default-language titles from it. */
  data: StoreData
  /** The view's URL prefix (the base path, then the locale prefix), which the cart puts before its own addresses. */
  prefix: string
  shop: LiquidObject
  products: HandleMap<LiquidObject>
  collections: HandleMap<LiquidObject>
  pages: HandleMap<LiquidObject>
  blogs: HandleMap<LiquidObject>
  /** Articles by `<blog handle>/<article handle>`, the key https://shopify.dev/docs/api/liquid/objects/articles shows (`articles['blog/article']`). */
  articles: HandleMap<LiquidObject>
  /** The policies that are set, by handle (`privacy-policy`), which `/policies/<handle>` shows (`buildPolicy`). */
  policies: HandleMap<LiquidObject>
  images: HandleMap<ImageDrop>
  videos: Record<string, LiquidObject>
  linklists: LinkListData[]
  cart: LiquidObject
  customer: LiquidObject | null
  localization: LiquidObject
  /** The currency of the view's market, in which prices print (`state.money`) and the cart is held. */
  currency: ViewCurrency
  country_option_tags: string
  all_country_option_tags: string
  gift_card: LiquidObject | null
  /** The store data's storefront filters, which the search builds its `filters` from. */
  storefrontFilters: FilterData[]
}

const image = (data: ImageData | null | undefined) => data ? new ImageDrop(data) : null
const unique = <T>(items: T[]) => [...new Set(items)]

/** The tags of `products`, each once, sorted. */
export const tagsOf = (products: LiquidObject[]): string[] => unique(products.flatMap(product => (product.tags as string[] | undefined) ?? [])).sort()

/** The collections Shopify makes itself: the catalogue and the vendor and type collections. They have no manual order, and `manual` shows their default one, by title (fixture `probe-collection-sort-manual`), and their `tags` follow the products they hold, inside a `paginate` block the page's, where a collection of the store's has the tags of all its products (`buildCollection`). That the split is between these and the store's collections is Debutify's reading of the fixtures, not a rule shopify.dev states. */
export const AUTOMATIC_COLLECTIONS: ReadonlySet<string> = new Set(['all', 'vendors', 'types'])

/** A field Liquid can read but `json` and `for` do not walk, for back references such as `variant.product`. */
export function hidden (target: LiquidObject, key: string, value: unknown) {
  Object.defineProperty(target, key, { value, enumerable: false })
}

/** Defines `key` on `target` as a property that `make` fills when it is first read, and keeps: a store build or a request does not pay for what no template reads. Enumerable, like the property it stands for, so `json` and `for` read it. */
export function lazy (target: LiquidObject, key: string, make: () => unknown): void {
  let value: unknown
  let made = false
  Object.defineProperty(target, key, {
    get () {
      if (!made) {
        value = make()
        made = true
      }
      return value
    },
    enumerable: true,
    configurable: true
  })
}

/** What `cache` holds for the built object `key`, made by `make` and kept the first time it is asked for: the object, which lives as long as its view, owns the answer. */
export function remember<K extends object, V> (cache: WeakMap<K, V>, key: K, make: () => V): V {
  let found = cache.get(key)
  if (found === undefined) {
    found = make()
    cache.set(key, found)
  }
  return found
}

/** A copy of `object` with every own property as it has it, the hidden ones (`toString`, back references, markers) included, so a hidden property added to a builder travels with a copy of what it builds; `omit` names the properties left out, which the caller sets again. */
export function copyObject (object: LiquidObject, ...omit: string[]): LiquidObject {
  const descriptors = Object.getOwnPropertyDescriptors(object)
  for (const key of omit) delete descriptors[key]
  return Object.create(Object.getPrototypeOf(object), descriptors)
}

/** The hidden field that holds a collection's products in the order of the store data, its manual order; `products` lists them in the collection's default order (`buildCollection`). */
const MANUAL_ORDER = 'manual_products'

/** The products of a built collection in the order of the store data: what the collection page's `sort_by=manual` shows, and what its other sorts start from, so a tie keeps the data's order. */
export const manualProductsOf = (collection: LiquidObject): LiquidObject[] => (collection[MANUAL_ORDER] as LiquidObject[] | undefined) ?? collection.products as LiquidObject[]

/** The hidden field that says which place of a product an image was built for, so `json` prints it as the product prints that place inside `product | json` (`imageJsonRole`). */
const IMAGE_ROLE = '__image_role'

/** Where a product's image sits, which sets its form in JSON: `image` (`product.images`, `product.featured_image`: the address), `media` (`product.media`, `product.featured_media`), `variant_image` (`variant.featured_image`, `variant.image`) and `variant_media` (`variant.featured_media`). `variant` is the variant that holds a variant's image. */
export interface ImageRole {
  role: 'image' | 'media' | 'variant_image' | 'variant_media'
  variant?: LiquidObject
}

/** The place of a product's image, or undefined for an image from anywhere else (`images['logo']`, a collection's, an article's), which `json` prints as the drop's own fields. */
export const imageJsonRole = (value: unknown): ImageRole | undefined => typeof value === 'object' && value !== null ? (value as LiquidObject)[IMAGE_ROLE] as ImageRole | undefined : undefined

/** The hidden field that marks a built product for the `json` filter. */
const PRODUCT_MARKER = '__product'

/** The hidden field that marks a built variant for the `json` filter. */
const VARIANT_MARKER = '__variant'

/** Whether `value` is a variant built by `buildVariant` (or a copy `selectProduct` and `selectSellingPlan` make of one). */
export const isBuiltVariant = (value: unknown): value is LiquidObject => typeof value === 'object' && value !== null && (value as LiquidObject)[VARIANT_MARKER] === true

/** Whether `value` is a product built by `buildProduct` (or selected by `selectProduct`). */
export const isBuiltProduct = (value: unknown): value is LiquidObject => typeof value === 'object' && value !== null && (value as LiquidObject)[PRODUCT_MARKER] === true

/** Whether `value` is a collection built by `buildCollection` (or a view of one `collectionView` makes, which keeps its hidden fields). */
export const isBuiltCollection = (value: unknown): value is LiquidObject => typeof value === 'object' && value !== null && Object.prototype.hasOwnProperty.call(value, MANUAL_ORDER)

/** The hidden field that marks a built article. */
const ARTICLE_MARKER = '__article'

/** Whether `value` is an article built by `buildArticle`. */
export const isBuiltArticle = (value: unknown): value is LiquidObject => typeof value === 'object' && value !== null && (value as LiquidObject)[ARTICLE_MARKER] === true

/**
 * Makes `object` print as its handle: https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings says of the `product`, `collection`, `page`, `blog` and `article` settings that "outputting the setting directly will return the object's handle". Applied to the object itself, so a setting returns the store's own object and `==`, `contains` and the filters that take the object work as on any other; shopify.dev does not say what the object prints elsewhere (a `product_list` element, `{{ product }}` on a product page), so the same handle is printed there too, on the confirm-on-a-development-store list. The `toString` is not enumerable, so `json`, `inspect` and `for` do not see it.
 */
export function printsHandle (object: LiquidObject): LiquidObject {
  Object.defineProperty(object, 'toString', { value: () => String(object.handle ?? ''), enumerable: false })
  return object
}

/** Product media: images (https://shopify.dev/docs/api/liquid/objects/media), videos (https://shopify.dev/docs/api/liquid/objects/video) and external videos (https://shopify.dev/docs/api/liquid/objects/external_video). Only media images carry a `preview_image`, https://shopify.dev/docs/api/liquid/objects/image#image-preview_image. `index` is the media's place in `product.media`; it becomes the media's `position`, counted from 1 (https://shopify.dev/docs/api/liquid/objects/media#media-position). The media page and shopify.dev's image page (https://shopify.dev/docs/api/liquid/objects/image#image-position) both show `1` in their example for the first entry but neither states the base; the parity store counts from 1 (fixture `probe-product-default`: the hoodie's eight media print positions 1 to 8 in `product | json`). Media from anywhere else has no position. */
function buildMedia (media: MediaData, index?: number, title = ''): unknown {
  const position = index === undefined ? null : index + 1
  if (media.media_type === 'image') {
    const drop = new ImageDrop(media, true, position, title)
    hidden(drop as unknown as LiquidObject, IMAGE_ROLE, { role: 'media' } satisfies ImageRole)
    return drop
  }
  // https://shopify.dev/docs/api/liquid/objects/video and https://shopify.dev/docs/api/liquid/objects/external_video: `aspect_ratio` is "the aspect ratio of the video as a decimal", the data's, else the width over the height of a hosted video's first sized source, else of its preview image; a hosted video's `duration` is in milliseconds, nil when the data has none
  const sized = media.media_type === 'video' ? media.sources.find(source => source.width && source.height) : undefined
  const ratio = media.media_type === 'video' && media.aspect_ratio ? media.aspect_ratio : sized ? sized.width! / sized.height! : media.preview_image?.width && media.preview_image.height ? media.preview_image.width / media.preview_image.height : null
  return { ...media, alt: media.alt ?? '', preview_image: image(media.preview_image), position, aspect_ratio: ratio === null ? null : new LiquidFloat(ratio), ...(media.media_type === 'video' ? { duration: media.duration ?? null } : {}) }
}

/** Whether two image entries are the same image: matched by `id` when both have one, by `src` otherwise. */
const sameImage = (a: ImageData, b: ImageData) => a.id != null && b.id != null ? a.id === b.id : a.src === b.src

/** The place, counted from 1, of an image in a list of a product's images or media (a media entry that is not an image keeps its slot but never matches), or nil when the list does not hold it. The counting base is the unpinned one of `buildMedia`. */
function positionIn (list: Array<ImageData | { media_type: string }>, target: ImageData): number | null {
  const index = list.findIndex(item => 'src' in item && sameImage(item, target))
  return index < 0 ? null : index + 1
}

/** One selling plan a variant is offered under: the built group and plan, and the data the plan was built from. */
interface PlanOffer {
  group: LiquidObject
  plan: LiquidObject
  data: SellingPlanData
}

/** Whether `group` offers `variant`: a group applies to every variant of its product unless its `variant_ids` list some (`SellingPlanGroupData`). */
const offersVariant = (group: SellingPlanGroupData, variant: VariantData) => !group.variant_ids || group.variant_ids.includes(variant.id)

/**
 * A selling plan group of the data, https://shopify.dev/docs/api/liquid/objects/selling_plan_group, with its plans (https://shopify.dev/docs/api/liquid/objects/selling_plan), their options (https://shopify.dev/docs/api/liquid/objects/selling_plan_option) and price adjustments (https://shopify.dev/docs/api/liquid/objects/selling_plan_price_adjustment). The group keeps the data's `id`; the parity store makes its own 40-hex checksum, which the probe comparison masks (`VOLATILE` in `test/storefront/expect-probe.ts`). Nothing is selected: `selling_plan_selected` is false, each plan's `selected` is false and each option's `selected_value` is nil until a request names a plan (`selectSellingPlan`). The group has no `selected` field: shopify.dev names the group's flag `selling_plan_selected`, and the parity store prints `group.selected` as nil even with one of its plans selected (fixtures `probe-product-plans` and `probe-product-plan-selected`). Each plan has the `checkout_charge` the parity store prints, 100 percent (fixture `probe-product-plans`, in `product | json`), because the data holds no partial checkout charge. A fixed amount or price in an adjustment's `value` is in the view's currency (`planAmount`), a percentage as it is.
 */
function buildSellingPlanGroup (data: SellingPlanGroupData, currency?: ViewCurrency): LiquidObject {
  return {
    id: data.id,
    name: data.name,
    app_id: data.app_id ?? null,
    options: data.options.map((option, i) => ({ name: option.name, position: i + 1, values: option.values, selected_value: null })),
    selling_plan_selected: false,
    selling_plans: data.selling_plans.map(plan => ({
      id: plan.id,
      name: plan.name,
      description: plan.description ?? null,
      recurring_deliveries: plan.recurring_deliveries,
      selected: false,
      group_id: data.id,
      options: plan.options.map((value, i) => ({ name: data.options[i]?.name ?? '', position: i + 1, value })),
      price_adjustments: plan.price_adjustments.map((adjustment, i) => ({ order_count: adjustment.order_count ?? null, position: i + 1, value: adjustment.value_type === 'percentage' ? adjustment.value : planAmount(adjustment.value, currency), value_type: adjustment.value_type })),
      checkout_charge: { value_type: 'percentage', value: 100 }
    }))
  }
}

/**
 * What a plan does to a variant's `price` (in the view's currency), https://shopify.dev/docs/api/liquid/objects/selling_plan_allocation. `price` and `per_delivery_price` are the first adjustment's price (`planPrice`; one delivery's, which the parity store prints equal to the price) and the variant's own price when the plan adjusts nothing; each entry of `price_adjustments` is the price under that adjustment (https://shopify.dev/docs/api/liquid/objects/selling_plan_allocation_price_adjustment). `compare_at_price` is "the line item's price without the selling plan applied", the variant's price, as the parity store prints it (fixtures `probe-product-plans` and `probe-product-requires-plan`); that holds for a variant that has a compare-at price of its own too, which no fixture shows. `checkout_charge_amount` is the price (the plan charges all of it at checkout, see `buildSellingPlanGroup`) and `remaining_balance_charge_amount` 0; `unit_price` is nil. The last three follow shopify.dev and no fixture prints them.
 */
function buildAllocation ({ group, plan, data }: PlanOffer, price: number, currency?: ViewCurrency): LiquidObject {
  const adjustments = data.price_adjustments.map((adjustment, i) => ({ position: i + 1, price: planPrice(price, adjustment, currency) }))
  const planned = adjustments[0]?.price ?? price
  return {
    selling_plan: plan,
    selling_plan_group_id: group.id,
    price: planned,
    compare_at_price: price,
    per_delivery_price: planned,
    price_adjustments: adjustments,
    checkout_charge_amount: planned,
    remaining_balance_charge_amount: 0,
    unit_price: null
  }
}

/** Each unit of measure as a multiple of its type's base unit (millilitre, gram, millimetre, square metre, item): the units of https://shopify.dev/docs/api/liquid/objects/unit_price_measurement's `quantity_unit` and `reference_unit`, by the codes of Shopify's Admin API (`ML`, `KG`, `FLOZ`…), compared without regard to case. */
const UNIT_SIZES: Record<string, number> = { ml: 1, cl: 10, l: 1000, m3: 1e6, floz: 29.5735, pt: 473.176, qt: 946.353, gal: 3785.41, mg: 0.001, g: 1, kg: 1000, oz: 28.3495, lb: 453.592, mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8, yd: 914.4, m2: 1, ft2: 0.092903, item: 1 }

/** The unit price of `price` (minor units) under `measurement`: the price of `reference_value` `reference_unit` of what `quantity_value` `quantity_unit` cost, rounded to the minor unit (https://shopify.dev/docs/api/liquid/objects/variant#variant-unit_price: "The unit price of the variant in the currency's subunit"). Nil without a measurement, or with a unit this table does not know. How Shopify rounds is not pinned. */
export function unitPrice (price: number, measurement: UnitPriceMeasurementData | null | undefined): number | null {
  if (!measurement) return null
  const quantity = own(UNIT_SIZES, String(measurement.quantity_unit).toLowerCase())
  const reference = own(UNIT_SIZES, String(measurement.reference_unit).toLowerCase())
  if (quantity === undefined || reference === undefined || !(measurement.quantity_value > 0)) return null
  return Math.round(price * (measurement.reference_value * reference) / (measurement.quantity_value * quantity))
}

/** The hidden field that holds a variant's store availabilities; `store_availabilities` shows them only where the variant page says (`showAvailabilities`). */
const STORE_AVAILABILITIES = '__store_availabilities'

/** https://shopify.dev/docs/api/liquid/objects/store_availability, with its https://shopify.dev/docs/api/liquid/objects/location: pickup and a physical storefront default to true. */
function buildStoreAvailability (data: StoreAvailabilityData, prefix: string): LiquidObject {
  const location = data.location
  return {
    available: data.available,
    pick_up_enabled: data.pick_up_enabled ?? true,
    pick_up_time: data.pick_up_time ?? null,
    physical_storefront: data.physical_storefront ?? true,
    location: { id: location.id, name: location.name, address: location.address ? buildAddress(location.address, false, prefix) : null, latitude: location.latitude ?? null, longitude: location.longitude ?? null, metafields: {} }
  }
}

/** Sets each variant's `store_availabilities`: https://shopify.dev/docs/api/liquid/objects/variant#variant-store_availabilities says "The array is defined in only the following cases: `variant.selected` is `true`; The variant is the product's first available variant", so the selected variants and the one `shown` get theirs and every other variant nil. */
function showAvailabilities (variants: LiquidObject[], shown: LiquidObject | null): void {
  for (const variant of variants) variant.store_availabilities = variant.selected || (shown !== null && variant.id === shown.id) ? variant[STORE_AVAILABILITIES] : null
}

/** https://shopify.dev/docs/api/liquid/objects/variant. `url` carries `?variant=<id>` as that page documents. `inventory_quantity`, `inventory_policy` (`deny` unless the data says `continue`), `inventory_management` (nil unless the data says `shopify`), `weight` (grams, 0 when the data has none) and `requires_shipping` (true unless the data says otherwise) come from the data, as that page lists them and as the parity store prints them (fixtures `probe-product-default` and `ajax-product-js`). `selected` is false here: it is the request that selects a variant (`selectProduct`). `unit_price_measurement` is left empty and `quantity_rule` holds Shopify's defaults; shopify.dev documents the fields but this layer has no data for them. `selling_plan_allocations` is one allocation per plan of every group that offers the variant (`plans`, see `buildSellingPlanGroup`), `requires_selling_plan` the product's, and `selected_selling_plan_allocation` nil until a request selects a plan (`selectSellingPlan`). `featured_image` and `featured_media` are the product's own image, so they carry the `position` of the matching entry in `product.images` and `product.media` (nil when the product does not list that image); shopify.dev does not say so, and it goes on the confirm-on-a-development-store list with the counting base. `price` and `compare_at_price` are in the view's currency when `currency` is given (`convert`: the market's rate, price adjustment and rounding, https://help.shopify.com/en/manual/international/pricing/exchange-rates), the dataset's shop-currency amounts otherwise; a variant without a compare-at price keeps nil. A market that hides compare-at prices (`ViewCurrency.hide_compare_at_prices`, Shopify's "Hide compare-at" setting, https://help.shopify.com/en/manual/compliance/legal/pricing-indication-directive) gives its variants none: nil, as the parity store prints the hoodie's on-sale variant in the Europe market (fixture `probe-product-en-eu-hoodie`). */
function buildVariant (variant: VariantData, productUrl: string, productImages: ImageData[], productMedia: MediaData[], currency?: ViewCurrency, plans: PlanOffer[] = [], requiresPlan = false, title = '', resolve?: MetafieldResolver, prefix = ''): LiquidObject {
  const options = [variant.option1, variant.option2, variant.option3].filter((option): option is string => typeof option === 'string')
  const featured = variant.image ? new ImageDrop(variant.image, false, positionIn(productImages, variant.image), title) : null
  const price = currency ? convert(variant.price, currency) : variant.price
  const built: LiquidObject = {
    id: variant.id,
    title: variant.title,
    price,
    compare_at_price: variant.compare_at_price == null || currency?.hide_compare_at_prices ? null : currency ? convert(variant.compare_at_price, currency) : variant.compare_at_price,
    available: variant.available,
    sku: variant.sku ?? '',
    option1: variant.option1 ?? null,
    option2: variant.option2 ?? null,
    option3: variant.option3 ?? null,
    options,
    url: `${productUrl}?variant=${variant.id}`,
    image: featured,
    featured_image: featured,
    featured_media: variant.image ? new ImageDrop(variant.image, true, positionIn(productMedia, variant.image), title) : null,
    selected: false,
    inventory_quantity: variant.inventory_quantity ?? (variant.available ? 1 : 0),
    inventory_management: variant.inventory_management ?? null,
    inventory_policy: variant.inventory_policy ?? 'deny',
    requires_shipping: variant.requires_shipping ?? true,
    taxable: true,
    weight: variant.weight ?? 0,
    barcode: variant.barcode ?? null,
    unit_price_measurement: variant.unit_price_measurement ? { ...variant.unit_price_measurement } : null,
    unit_price: unitPrice(price, variant.unit_price_measurement),
    // "in the current customer context": the data's volume prices, each in the view's currency
    quantity_price_breaks: (variant.quantity_price_breaks ?? []).map(entry => ({ minimum_quantity: entry.minimum_quantity, price: currency ? convert(entry.price, currency) : entry.price })),
    selling_plan_allocations: plans.map(offer => buildAllocation(offer, price, currency)),
    requires_selling_plan: requiresPlan,
    selected_selling_plan_allocation: null,
    quantity_rule: { min: 1, max: null, increment: 1 },
    metafields: buildMetafields(variant.metafields, resolve)
  }
  // marks a built variant for the `json` filter, which prints it with `variantLiquidJson`, and its images with the place they have in it
  hidden(built, VARIANT_MARKER, true)
  hidden(built, STORE_AVAILABILITIES, (variant.store_availabilities ?? []).map(entry => buildStoreAvailability(entry, prefix)))
  if (featured) hidden(featured as unknown as LiquidObject, IMAGE_ROLE, { role: 'variant_image', variant: built } satisfies ImageRole)
  if (built.featured_media) hidden(built.featured_media as LiquidObject, IMAGE_ROLE, { role: 'variant_media', variant: built } satisfies ImageRole)
  return built
}

/**
 * What the product knows of each value of each option, in the order its variants first give them (https://shopify.dev/docs/api/liquid/objects/product_option: `values` are "the possible values for the product option"): the name, the id the data gives (`ProductData.option_values`) or `optionValueId` makes, the swatch (`SwatchDrop`, nil without a colour or image) and, for a value that leads to another product (a combined listing), that product's URL under `prefix`, nil otherwise (https://shopify.dev/docs/api/liquid/objects/product_option_value#product_option_value-product_url).
 */
function optionValueInfos (data: ProductData, options: string[], variants: LiquidObject[], prefix: string): OptionValueInfo[][] {
  const taken = new Set<number>()
  const given = data.option_values ?? {}
  const listed = options.map((_, i) => unique(variants.map(variant => (variant.options as string[])[i]).filter(value => value !== undefined)))
  for (const [i, name] of options.entries()) {
    for (const value of listed[i]) {
      const id = own(own(given, name), value)?.id
      if (typeof id === 'number') taken.add(id)
    }
  }
  return options.map((name, i) => listed[i].map(value => {
    const extra = own(own(given, name), value)
    return {
      name: value,
      id: typeof extra?.id === 'number' ? extra.id : optionValueId(data.id, i + 1, value, taken),
      swatch: SwatchDrop.from(extra?.swatch),
      product_url: extra?.product_handle ? withPrefix(prefix, `/products/${extra.product_handle}`) : null
    }
  }))
}

/**
 * https://shopify.dev/docs/api/liquid/objects/product. The product's and its variants' URLs sit under `prefix` (the view's base path and locale prefix, as the parity store prints them, fixture `probe-page-fr-ca`). `price` is the lowest variant price and `compare_at_price` the lowest variant compare-at price, as that page documents them; `compare_at_price` is nil when no variant has one, as the parity store prints it (fixtures `probe-product-in-collection` and `probe-product-plans`: `null` for men-t-shirt and slides; shopify.dev does not pin that case), so dividing by it raises "divided by 0" as Ruby does. `first_available_variant` is nil when no variant is available (the page: "The first available variant of the product"; fixture `probe-product-en-eu-leggings`, whose variants are all sold out, records null), while `selected_or_first_available_variant` (no `?variant=` is known here) then falls back to the first variant, as the page says, and so does each option's `selected_value` (the same fixture); `options_with_values` and `has_only_default_variant` follow the same page, each option's `values` being `product_option_value` objects (`buildOptions`) for the selected-or-first-available variant's values, and `options_by_name` finds an option by its name in any case (`OptionsByNameDrop`). `selling_plan_groups` are the data's (`buildSellingPlanGroup`), `requires_selling_plan` the data's flag, and `selected_selling_plan` and `selected_selling_plan_allocation` nil until a request selects a plan (`selectSellingPlan`). `selected_or_first_available_selling_plan_allocation` is, with nothing selected, "the first allocation on the first available variant", or on the first variant when none is available, and nil when the product has no selling plans (https://shopify.dev/docs/api/liquid/objects/product#product-selected_or_first_available_selling_plan_allocation); the parity store prints it for every product with plans, not only one that requires them (fixtures `probe-product-plans` and `probe-product-requires-plan`: 71001 and 71003). Every price field is in the view's currency when `currency` is given, because the variants' are (`buildVariant`) and the product's are the lowest and highest of them; the parity store's product-level `compare_at_price` is the lowest converted variant compare-at price in the markets that show them (fixtures `probe-product-default` and `probe-product-en-ca`: 110.00 USD and 149.00 CAD, with one variant on sale) and nil in one that hides them, with `compare_at_price_min` and `compare_at_price_max` 0 as for any product without one (fixtures `probe-product-en-eu-hoodie` and `ajax-product-js`).
 */
export function buildProduct (data: ProductData, prefix = '', currency?: ViewCurrency, resolve?: MetafieldResolver): LiquidObject {
  const url = withPrefix(prefix, `/products/${data.handle}`)
  // The image `position` counts from 1, which shopify.dev's image page does not state (its example shows 1 for the first image) and the parity store prints (fixture `probe-product-default`: the first variant's image, the hoodie's sixth, prints `position` 6 in `product | json`).
  const images = (data.images ?? []).map((img, i) => {
    const drop = new ImageDrop(img, false, i + 1, data.title)
    hidden(drop as unknown as LiquidObject, IMAGE_ROLE, { role: 'image' } satisfies ImageRole)
    return drop
  })
  const mediaData: MediaData[] = data.media ?? (data.images ?? []).map(img => ({ ...img, media_type: 'image' as const }))
  const media = mediaData.map((entry, i) => buildMedia(entry, i, data.title))
  // https://shopify.dev/docs/api/liquid/objects/product#product-selling_plan_groups lists "the selling plan groups that the variants of the product are included in", and the selling_plan_group page describes a group as one "that include[s] any of a product's variants": a group that offers none of the product's variants (`variant_ids` empty, or naming only variants the product lacks) is not listed
  const groupData = (data.selling_plan_groups ?? []).filter(group => data.variants.some(variant => offersVariant(group, variant)))
  const groups = groupData.map(group => buildSellingPlanGroup(group, currency))
  const variants = data.variants.map(variant => {
    const offers = groupData.flatMap((group, g) => offersVariant(group, variant) ? group.selling_plans.map((plan, i) => ({ group: groups[g], plan: (groups[g].selling_plans as LiquidObject[])[i], data: plan })) : [])
    return buildVariant(variant, url, data.images ?? [], mediaData, currency, offers, !!data.requires_selling_plan, data.title, resolve, prefix)
  })
  const options = data.options ?? ['Title']
  const prices = variants.map(variant => variant.price as number)
  const compares = variants.map(variant => variant.compare_at_price as number | null).filter((price): price is number => typeof price === 'number')
  const firstAvailable = variants.find(variant => variant.available) ?? null
  const firstOrAvailable = firstAvailable ?? variants[0] ?? null
  showAvailabilities(variants, firstOrAvailable)
  const infos = optionValueInfos(data, options, variants, prefix)
  const optionsWithValues = buildOptions(options, infos, variants, options.map((_, i) => firstOrAvailable ? (firstOrAvailable.options as string[])[i] ?? null : null), firstOrAvailable)
  const product: LiquidObject = {
    id: data.id,
    handle: data.handle,
    title: data.title,
    description: data.description ?? '',
    content: data.description ?? '',
    vendor: data.vendor ?? '',
    type: data.type ?? '',
    tags: data.tags ?? [],
    url,
    available: variants.some(variant => variant.available),
    price: prices.length ? Math.min(...prices) : 0,
    price_min: prices.length ? Math.min(...prices) : 0,
    price_max: prices.length ? Math.max(...prices) : 0,
    price_varies: unique(prices).length > 1,
    compare_at_price: compares.length ? Math.min(...compares) : null,
    compare_at_price_min: compares.length ? Math.min(...compares) : 0,
    compare_at_price_max: compares.length ? Math.max(...compares) : 0,
    compare_at_price_varies: unique(compares).length > 1,
    images,
    featured_image: images[0] ?? null,
    media,
    featured_media: media[0] ?? null,
    options,
    options_with_values: optionsWithValues,
    options_by_name: new OptionsByNameDrop(optionsWithValues),
    has_only_default_variant: variants.length === 1 && options.length === 1 && options[0] === 'Title',
    variants,
    // https://shopify.dev/docs/api/liquid/objects/product#product-variants_count: "The total number of variants for the product"
    variants_count: variants.length,
    first_available_variant: firstAvailable,
    selected_variant: null,
    selected_or_first_available_variant: firstOrAvailable,
    requires_selling_plan: !!data.requires_selling_plan,
    selling_plan_groups: groups,
    selected_selling_plan: null,
    selected_selling_plan_allocation: null,
    selected_or_first_available_selling_plan_allocation: ((firstOrAvailable?.selling_plan_allocations as LiquidObject[] | undefined) ?? [])[0] ?? null,
    // https://shopify.dev/docs/api/liquid/objects/product#product-gift_card?: "true if the product is a gift card"
    'gift_card?': data.gift_card === true,
    // https://shopify.dev/docs/api/liquid/objects/product#product-quantity_price_breaks_configured?: whether the product "has at least one variant with quantity price breaks in the current customer context"
    'quantity_price_breaks_configured?': variants.some(variant => (variant.quantity_price_breaks as unknown[]).length > 0),
    // the suffix of the alternate template the product uses, https://shopify.dev/docs/api/liquid/objects/product#product-template_suffix; nil when it uses the base template (fixture `probe-product-default`)
    template_suffix: data.template_suffix ?? null,
    created_at: data.created_at ?? null,
    published_at: data.published_at ?? null,
    metafields: buildMetafields(data.metafields, resolve)
  }
  for (const variant of variants) hidden(variant, 'product', product)
  // https://shopify.dev/docs/api/liquid/objects/image: an image of `product.images` (and so `product.featured_image`) is `attached_to_variant?` when a variant shows it, and lists those `variants`; not enumerable, as the image's other places are, so `json` and `inspect` print the image as before. Dawn hides the other variants' media with `product.images | where: 'attached_to_variant?', true` (the parity store's gallery shows the hoodie's four, its recording `page-product`)
  for (const [i, drop] of images.entries()) {
    const stored = (data.images ?? [])[i]
    const showing = variants.filter(variant => variant.featured_image && sameImage((variant.featured_image as ImageDrop).data, stored))
    Object.defineProperty(drop, 'attached_to_variant?', { value: showing.length > 0, enumerable: false })
    Object.defineProperty(drop, 'variants', { value: showing, enumerable: false })
    Object.defineProperty(drop, 'product_id', { value: data.id, enumerable: false })
  }
  // marks a built product for the `json` filter, which prints it with `productLiquidJson`
  hidden(product, PRODUCT_MARKER, true)
  keepOptionInfo(product, infos)
  // the store's place in the best-selling order, which `sort_by=best-selling` reads and templates cannot print
  hidden(product, 'sales_rank', data.sales_rank)
  return printsHandle(product)
}

/**
 * The product a request shows: `?variant=<id>` selects that variant (https://shopify.dev/docs/api/liquid/objects/product#product-selected_variant: "The currently selected variant of the product", "On product pages, it is based on the variant ID set in the variant URL parameter", nil when none is), which `selected_or_first_available_variant` then returns "regardless of its availability" (https://shopify.dev/docs/api/liquid/objects/product#product-selected_or_first_available_variant); the variant's `selected` is true (https://shopify.dev/docs/api/liquid/objects/variant#variant-selected) and each option's `selected_value` is the selected variant's (https://shopify.dev/docs/api/liquid/objects/product_option). An id the product does not have selects nothing, as the parity store renders it (fixture `probe-product-unknown-variant`), and then `?option_values=` is not read either. Without a `?variant=` the product's option value ids in `?option_values=` select (`optionValues`, `pickByOptionValues`). The built product is shared by every request of a view, so a selection returns a copy (with its hidden properties) and leaves the shared one alone. On the confirm-on-a-development-store list: the copy is not the same object as the store's product, so `{% if product == all_products[product.handle] %}` and `collections.x.products contains product` are false on a product page with `?variant=` and true without it, and shopify.dev and the parity store's recordings do not say what Shopify answers.
 */
export function selectProduct (product: LiquidObject, variantId: number | undefined, optionValues?: number[]): LiquidObject {
  const variants = product.variants as LiquidObject[]
  const byId = variantId === undefined ? undefined : variants.find(variant => variant.id === variantId)
  // a `?variant=` the product does not have selects nothing, even beside `?option_values=`: `?variant=` wins whether or not it is known (no recording holds both, so this is not pinned)
  const picked = byId ? { variant: byId, values: byId.options as string[] } : variantId === undefined && optionValues?.length ? pickByOptionValues(product, optionValues) : undefined
  if (!picked) return product
  const copy = copyObject(product)
  copy.variants = variants.map(variant => Object.assign(copyObject(variant, 'product'), { selected: variant === picked.variant }))
  for (const variant of copy.variants as LiquidObject[]) hidden(variant, 'product', copy)
  const copyOf = (variant: unknown) => variant ? (copy.variants as LiquidObject[]).find(entry => entry.id === (variant as LiquidObject).id) ?? null : null
  copy.selected_variant = copyOf(picked.variant)
  copy.selected_or_first_available_variant = copy.selected_variant
  copy.first_available_variant = copyOf(product.first_available_variant)
  showAvailabilities(copy.variants as LiquidObject[], (copy.first_available_variant ?? (copy.variants as LiquidObject[])[0] ?? null) as LiquidObject | null)
  refreshOptions(copy, picked.values)
  return copy
}

/**
 * The variant and the option values `?option_values=<id>,<id>` select, https://shopify.dev/docs/storefronts/themes/product-merchandising/variants/support-high-variant-products ("a comma-separated list of option value IDs"): each id names a value of one option, and the variant is the first available one with every named value, or the first one with them, which the request selects "regardless of its availability" as `?variant=` does; an option no id names takes that variant's value. A combination no variant has selects none: the page's Caution says `selected_or_first_available_variant` and `selected_variant` are then nil, and the named values stay selected. Ids the product does not have are ignored, and a request whose ids are all unknown selects nothing. The parity store answers Dawn's section requests so (`option_values` of Clay and Small selects the sold-out Clay / Small, of Ocean alone Ocean / Small, and of two unknown ids the first available variant).
 */
function pickByOptionValues (product: LiquidObject, ids: number[]): { variant: LiquidObject | null, values: Array<string | null> } | undefined {
  const infos = optionInfoOf(product)
  const named = new Map<number, string>()
  for (const id of ids) {
    for (const [i, values] of infos.entries()) {
      const found = values.find(info => info.id === id)
      if (found && !named.has(i)) named.set(i, found.name)
    }
  }
  if (!named.size) return undefined
  const variants = product.variants as LiquidObject[]
  const matching = variants.filter(variant => [...named].every(([i, name]) => (variant.options as string[])[i] === name))
  const variant = matching.find(entry => entry.available) ?? matching[0] ?? null
  const values = infos.map((_, i) => named.get(i) ?? (variant ? (variant.options as string[])[i] ?? null : null))
  return { variant, values }
}

/** Rebuilds the options of a product copy (`selectProduct`, `selectSellingPlan`) over its own variants, for the selected `values` (the options' `selected_value` when omitted), so each value's `variant` is one of the copy's. */
function refreshOptions (copy: LiquidObject, values?: Array<string | null>): void {
  const options = copy.options_with_values as LiquidObject[]
  const selected = values ?? options.map(option => option.selected_value as string | null)
  copy.options_with_values = buildOptions(options.map(option => String(option.name)), optionInfoOf(copy), copy.variants as LiquidObject[], selected, copy.selected_or_first_available_variant as LiquidObject | null)
  copy.options_by_name = new OptionsByNameDrop(copy.options_with_values as LiquidObject[])
}

/**
 * The product a request shows under `?selling_plan=<id>`: that plan is `selected_selling_plan` and `selected` (https://shopify.dev/docs/api/liquid/objects/product#product-selected_selling_plan, https://shopify.dev/docs/api/liquid/objects/selling_plan#selling_plan-selected), its group is `selling_plan_selected` (https://shopify.dev/docs/api/liquid/objects/selling_plan_group#selling_plan_group-selling_plan_selected) and each of the group's options has the plan's value as `selected_value` (https://shopify.dev/docs/api/liquid/objects/selling_plan_group_option#selling_plan_group_option-selected_value). The plan's allocation is the selected one only on the selected variant (`?variant=`): shopify.dev ties `product.selected_selling_plan_allocation` to "the currently selected variant" and returns it, and no other, as `selected_or_first_available_selling_plan_allocation` "if a variant and selling plan are selected", otherwise the first allocation on the first available variant. The parity store agrees: with a plan in the address and no variant, every variant's `selected_selling_plan_allocation` is nil and the product's selected-or-first allocation is the first one (fixture `probe-product-plan-selected`). A selected variant and plan together are not recorded, so the selected variant's own allocation for the plan is what the docs describe, not a fixture's. An id no group of the product has selects nothing, and a request without one leaves the product alone. Like `selectProduct`, a selection returns a copy and leaves the shared product alone; the copy's variants and allocations are copies too, each allocation pointing at the copy's plan, and every reference to a variant is re-pointed at the copy's.
 */
export function selectSellingPlan (product: LiquidObject, planId: number | undefined): LiquidObject {
  if (planId === undefined) return product
  const groups = product.selling_plan_groups as LiquidObject[]
  const group = groups.find(g => (g.selling_plans as LiquidObject[]).some(plan => plan.id === planId))
  if (!group) return product
  const copy = copyObject(product)
  // the group's plans are copies, one of them selected; an allocation of the old plan gets the copy
  const plans = new Map<LiquidObject, LiquidObject>()
  const chosen = (group.selling_plans as LiquidObject[]).find(plan => plan.id === planId)!
  const selectedGroup: LiquidObject = {
    ...group,
    selling_plan_selected: true,
    selling_plans: (group.selling_plans as LiquidObject[]).map(plan => {
      const next = { ...plan, selected: plan === chosen }
      plans.set(plan, next)
      return next
    }),
    options: (group.options as LiquidObject[]).map((option, i) => ({ ...option, selected_value: (((chosen.options as LiquidObject[])[i]) ?? {}).value ?? null }))
  }
  copy.selling_plan_groups = groups.map(g => g === group ? selectedGroup : g)
  const selected = plans.get(chosen)!
  copy.selected_selling_plan = selected
  copy.variants = (product.variants as LiquidObject[]).map(variant => {
    const allocations = (variant.selling_plan_allocations as LiquidObject[]).map(allocation => ({ ...allocation, selling_plan: plans.get(allocation.selling_plan as LiquidObject) ?? allocation.selling_plan }))
    return Object.assign(copyObject(variant, 'product'), { selling_plan_allocations: allocations, selected_selling_plan_allocation: variant.selected ? allocations.find(allocation => allocation.selling_plan === selected) ?? null : null })
  })
  const variants = copy.variants as LiquidObject[]
  for (const variant of variants) hidden(variant, 'product', copy)
  const copyOf = (variant: unknown) => variant ? variants.find(entry => entry.id === (variant as LiquidObject).id) ?? null : null
  copy.selected_variant = copyOf(product.selected_variant)
  copy.selected_or_first_available_variant = copyOf(product.selected_or_first_available_variant)
  copy.first_available_variant = copyOf(product.first_available_variant)
  copy.selected_selling_plan_allocation = (copy.selected_variant as LiquidObject | null)?.selected_selling_plan_allocation ?? null
  copy.selected_or_first_available_selling_plan_allocation = copy.selected_selling_plan_allocation ?? ((((copy.first_available_variant ?? variants[0]) as LiquidObject | undefined)?.selling_plan_allocations as LiquidObject[] | undefined) ?? [])[0] ?? null
  refreshOptions(copy)
  return copy
}

/**
 * https://shopify.dev/docs/api/liquid/objects/collection, at its URL under `prefix`. Filtering, tags and sorting are not applied here (`collectionView` applies them per request): `products` is the collection's product list as given, `filters` are the store's storefront filters over those products (`buildFilters`, in the view `currency` when given), built when first read and kept, so a store build does not pay for collections no page shows, `default_sort_by` is the collection's `sort_order` (`manual` when it has none, or one that is no sort value) and `sort_options` lists the options the parity store lists, `Most relevant` included (fixture `probe-collection-all`). `tags` are read when asked. A collection of the store's has the tags of all its products, on any page and whatever the request's filters, as the parity store prints them (fixtures `probe-collection-suffix`, `probe-collection-suffix-page-3` and `probe-collection-suffix-filtered`: `featured` prints the same six tags on its first page, which holds no shoe, on its third, which holds one product, and under `filter.p.tag=women`, which shows two), although https://shopify.dev/docs/api/liquid/objects/collection#collection-tags says they do not "include tags for products that have been filtered out of the current view"; the fixture wins. A collection Shopify makes itself (`AUTOMATIC_COLLECTIONS`) has the tags of the products in `products`, so inside a `paginate` block the tags of the page's products, as the parity store prints them (fixtures `probe-collection-all`, `probe-collection-page-2`, `probe-collection-page-past`, where the page after the last has none, the `probe-collection-filter-*` fixtures and `probe-collection-vendors`). A store collection under a tag path or a sort is not recorded and takes the same rule.
 */
export function buildCollection (data: CollectionData, products: HandleMap<LiquidObject>, filters: FilterData[] | undefined, prefix: string, currency?: ViewCurrency, resolve?: MetafieldResolver): LiquidObject {
  const items = data.products.map(handle => HandleMap.get(products, handle)).filter((product): product is LiquidObject => !!product)
  // `products` lists the collection in its default order wherever it is read, not only on the collection page: https://shopify.dev/docs/api/liquid/objects/collection#collection-default_sort_by; the parity store lists `collections['all'].products` by title in the header's predictive search suggestions and the empty cart's featured collection (scenarios `page-home` and `page-cart-empty`), where the data's order is Slides, Sweatpants, Men's T-shirt, Hoodie. The store data's order is the manual one (`MANUAL_ORDER`), which the collection page's own sort starts from (`collectionView`).
  // a `sort_order` that is none of the sort values reads as `manual`, the data's own order, and not as the order of the handles that `Array.sort` falls back to for a value it has no comparison for (final review B, M5). https://shopify.dev/docs/api/liquid/objects/collection#collection-default_sort_by lists manual, best-selling, title-ascending, price-ascending, price-descending, created-ascending and created-descending; `title-descending` is the sort option that page's `sort_options` lists besides. Nothing says the data may name another order, so one that does is read as the first value listed.
  const sortOrder = data.sort_order !== undefined && SORT_VALUES.includes(data.sort_order) ? data.sort_order : 'manual'
  // sorted when first read and kept, as the filters are, so a store build does not pay for collections no page shows
  let listed: LiquidObject[] | undefined
  const ordered = () => {
    listed ??= sortProducts(items, sortOrder, AUTOMATIC_COLLECTIONS.has(data.handle))
    return listed
  }
  const collect = (key: string) => unique(items.flatMap(product => product[key] as string | string[]).filter(Boolean)).sort()
  // the collection's own image reads the collection's title as its alt when it has none of its own, as the parity store prints Dawn's `card_collection.featured_image.alt` (`alt="Men"`, its recording `page-collections`)
  const own = data.image ? new ImageDrop(data.image, false, null, data.title) : null
  const url = withPrefix(prefix, `/collections/${data.handle}`)
  let computed: LiquidObject[] | undefined
  const collection = printsHandle({
    id: data.id,
    handle: data.handle,
    title: data.title,
    description: data.description ?? '',
    url,
    image: own,
    // the collection's own image, else the image of its first product in the order the collection lists them, which is the order Shopify shows: an assumption, no recording prints a collection without an image (every collection of the sample data has one); on `all` it is the first product by title
    get featured_image () {
      return own ?? ordered()[0]?.featured_image ?? null
    },
    get products () {
      return ordered()
    },
    products_count: items.length,
    all_products_count: items.length,
    all_tags: collect('tags'),
    all_types: collect('type'),
    all_vendors: collect('vendor'),
    get tags () {
      return tagsOf(AUTOMATIC_COLLECTIONS.has(data.handle) ? (this as LiquidObject).products as LiquidObject[] : items)
    },
    get filters () {
      computed ??= buildFilters(filters, items, url, [], currency)
      return computed
    },
    sort_by: '',
    default_sort_by: sortOrder,
    sort_options: [
      { name: 'Featured', value: 'manual' },
      { name: 'Most relevant', value: 'most-relevant' },
      { name: 'Best selling', value: 'best-selling' },
      { name: 'Alphabetically, A-Z', value: 'title-ascending' },
      { name: 'Alphabetically, Z-A', value: 'title-descending' },
      { name: 'Price, low to high', value: 'price-ascending' },
      { name: 'Price, high to low', value: 'price-descending' },
      { name: 'Date, old to new', value: 'created-ascending' },
      { name: 'Date, new to old', value: 'created-descending' }
    ],
    // https://shopify.dev/docs/api/liquid/objects/collection#collection-template_suffix; nil when it uses the base template (fixture `probe-collection-default`)
    template_suffix: data.template_suffix ?? null,
    metafields: buildMetafields(data.metafields, resolve)
  })
  hidden(collection, MANUAL_ORDER, items)
  return collection
}

/** https://shopify.dev/docs/api/liquid/objects/page, at its URL under `prefix`; `template_suffix` is the data's (https://shopify.dev/docs/api/liquid/objects/page#page-template_suffix), nil for the base template (fixture `probe-page-home`). */
function buildPage (data: PageData, prefix: string, resolve?: MetafieldResolver): LiquidObject {
  return printsHandle({ ...data, url: withPrefix(prefix, `/pages/${data.handle}`), template_suffix: data.template_suffix ?? null, published_at: data.published_at ?? null, metafields: buildMetafields(data.metafields, resolve) })
}

/** https://shopify.dev/docs/api/liquid/objects/article, at its URL under `prefix`. Comments are not modelled: `comments` is empty and `comments_enabled?` false. */
function buildArticle (data: ArticleData, blogHandle: string, prefix: string, resolve?: MetafieldResolver): LiquidObject {
  const author = data.author ?? ''
  const article = printsHandle({
    id: data.id,
    handle: data.handle,
    title: data.title,
    content: data.content,
    excerpt: data.excerpt ?? '',
    excerpt_or_content: data.excerpt || data.content,
    url: withPrefix(prefix, `/blogs/${blogHandle}/${data.handle}`),
    author,
    user: { name: author, first_name: author.split(' ')[0] ?? '', last_name: author.split(' ').slice(1).join(' ') },
    published_at: data.published_at,
    created_at: data.published_at,
    image: image(data.image),
    tags: data.tags ?? [],
    comments: [],
    comments_count: 0,
    'comments_enabled?': false,
    metafields: buildMetafields(data.metafields, resolve)
  })
  hidden(article, ARTICLE_MARKER, true)
  return article
}

/** The title Shopify gives each policy, as its checkout's policy list and the parity store's privacy policy page name them (`Privacy policy`, recording of `/policies/privacy-policy`); the titles of the others are Shopify's admin names, not recorded. */
const POLICY_TITLES: Record<PolicyData['type'], string> = { privacy_policy: 'Privacy policy', refund_policy: 'Refund policy', shipping_policy: 'Shipping policy', terms_of_service: 'Terms of service', subscription_policy: 'Cancellation policy', contact_information: 'Contact information', legal_notice: 'Legal notice' }

/** The handle of a policy type, which its address ends with: `privacy_policy` is at `/policies/privacy-policy`, as the parity store's footer links it (its recordings of Dawn and Horizon). */
export const policyHandle = (type: string): string => type.replace(/_/g, '-')

/** The policies a shop has set: the first entry of each type `POLICY_TITLES` names, when its body is not empty. A later entry of the same type and a type outside that list are ignored, so `shop.<type>`, `shop.policies` and `/policies/<handle>` always agree. */
function setPolicies (list: PolicyData[] | undefined): PolicyData[] {
  const seen = new Set<string>()
  const set: PolicyData[] = []
  for (const policy of list ?? []) {
    if (!hasOwn(POLICY_TITLES, policy.type) || seen.has(policy.type)) continue
    seen.add(policy.type)
    if (policy.body) set.push(policy)
  }
  return set
}

/** https://shopify.dev/docs/api/liquid/objects/policy: `id`, `title`, `body` (HTML) and `url`, "the relative URL of the policy", under `prefix` (the parity store links `/fr-ca/policies/privacy-policy` on its French pages). */
function buildPolicy (data: PolicyData, prefix: string): LiquidObject {
  return { id: data.id ?? null, title: data.title || POLICY_TITLES[data.type] || data.type, body: data.body, url: withPrefix(prefix, `/policies/${policyHandle(data.type)}`) }
}

/** `articles` newest first, by the time their `published_at` holds (whatever its UTC offset); a tie keeps the order it came in, and an article whose `published_at` is no date sorts after every dated one. */
function newestFirst (articles: LiquidObject[]): LiquidObject[] {
  const time = (article: LiquidObject) => {
    const stamp = Date.parse(String(article.published_at))
    return Number.isNaN(stamp) ? -Infinity : stamp
  }
  return [...articles].sort((a, b) => time(a) === time(b) ? 0 : time(a) < time(b) ? 1 : -1)
}

/** The hidden field that holds a blog's articles in the order of the store data; `articles` lists them newest first (`buildBlog`). */
const DATA_ORDER = 'articles_in_data_order'

/** The articles of a built blog in the order of the store data, which the search and the predictive search rank their ties by. */
export const articlesInDataOrder = (blog: LiquidObject): LiquidObject[] => (blog[DATA_ORDER] as LiquidObject[] | undefined) ?? blog.articles as LiquidObject[]

/** https://shopify.dev/docs/api/liquid/objects/blog, at its URL under `prefix`. Comments are not modelled: `comments_enabled?` and `moderated?` are false. */
function buildBlog (data: BlogData, prefix: string, resolve?: MetafieldResolver): LiquidObject {
  // a blog lists its articles newest first, https://shopify.dev/docs/api/liquid/objects/blog#blog-articles ("all of the articles in the blog"): the parity store's blog page starts with the latest article (scenario `page-blog`); articles published at the same time keep the data's order, and one with no date comes last
  const inDataOrder = data.articles.map(article => buildArticle(article, data.handle, prefix, resolve))
  const articles = newestFirst(inDataOrder)
  const blog = printsHandle({
    id: data.id,
    handle: data.handle,
    title: data.title,
    url: withPrefix(prefix, `/blogs/${data.handle}`),
    articles,
    articles_count: articles.length,
    all_tags: unique(data.articles.flatMap(article => article.tags ?? [])).sort(),
    tags: [],
    'comments_enabled?': false,
    'moderated?': false,
    metafields: buildMetafields(data.metafields, resolve)
  })
  hidden(blog, DATA_ORDER, inDataOrder)
  return blog
}

/** A URL without its query string and fragment: `link.current` and `link.child_current` "ignore URL parameters". https://shopify.dev/docs/api/liquid/objects/link */
function stripQuery (url: string): string {
  return url.split(/[?#]/)[0]
}

/** The path `link.current` compares: a product reached through a collection (`/collections/x/products/y`) is "treated as equal to a standard product URL for the same product". https://shopify.dev/docs/api/liquid/objects/link */
function linkPath (url: string): string {
  return stripQuery(url).replace(/^\/collections\/[^/]+(\/products\/)/, '$1')
}

/**
 * The `link.type` of a URL. shopify.dev lists the types and what each points at (`frontpage_link`, `catalog_link`, `collections_link`, `collection_link`, `product_link`, `page_link`, `blog_link`, `article_link`, `search_link`, `policy_link`, `customer_account_page_link`, `http_link` for "an external web page, or a product type or vendor collection", `metaobject_link`) but not the URL each one is chosen from, so the patterns here are Shopify's storefront paths read from those descriptions. `metaobject_link` is never produced: a metaobject page has no URL form in the store data. https://shopify.dev/docs/api/liquid/objects/link
 */
function linkType (url: string): string {
  const path = linkPath(url)
  if (path === '/') return 'frontpage_link'
  if (path === '/collections') return 'collections_link'
  if (path === '/collections/all') return 'catalog_link'
  if (path === '/collections/vendors' || path === '/collections/types') return 'http_link'
  if (/^\/collections\/[^/]+$/.test(path)) return 'collection_link'
  if (/^\/products\/[^/]+$/.test(path)) return 'product_link'
  if (/^\/pages\/[^/]+$/.test(path)) return 'page_link'
  if (/^\/blogs\/[^/]+$/.test(path)) return 'blog_link'
  if (/^\/blogs\/[^/]+\/[^/]+$/.test(path)) return 'article_link'
  if (path === '/search') return 'search_link'
  if (/^\/policies\/[^/]+$/.test(path)) return 'policy_link'
  if (path === '/account' || path.startsWith('/account/')) return 'customer_account_page_link'
  return 'http_link'
}

/**
 * One menu link, https://shopify.dev/docs/api/liquid/objects/link. Its `url` sits under `prefix` (`withPrefix`), as a link of the parity store's menu does under a locale prefix (fixture `probe-page-fr-ca`); `type` and the comparisons below read the store's own path, without the prefix, and so does the request `path`, which carries it. `current` is true when the link's path is the request path and `active` when it is the path or a parent of it ("matches, or contains, the link's url"); both ignore query strings, `current` also reads a product in a collection as the product, and `child_active` and `child_current` look at the children. `levels` counts the nested levels below the link. `object` is always nil: the page says it is the article, blog, collection, metaobject, page, policy or product the link points at, which this layer does not resolve from a URL. `handle` is the one `buildLinks` gives it: the data's, else its title handleized, the title of the store's primary language (`translateData` keeps it on a translated link): the parity store prints Dawn's `HeaderMenu-{{ link.handle }}` as `HeaderMenu-news` for the link `News`, and as the same on its French pages, where the link reads `Actualités` (its recordings `page-home` and `page-home-fr-ca`); the handle of a link whose data gives none is the engine's choice beyond those recordings. `data_sharing_opt_out_icon` is nil: the page gives it to the data-sale opt-out link Shopify adds, which the store data has no setting for.
 */
function buildLink (data: LinkData, path: string, prefix: string, handle: string): LiquidObject {
  const links = buildLinks(data.links ?? [], path, prefix)
  const here = withoutPrefix(prefix, path)
  const current = linkPath(data.url) === linkPath(here)
  const target = stripQuery(data.url)
  // the list of collections holds no page below it: a collection's page does not light `/collections`, as the parity store renders it (scenarios `page-collection` and `page-collection-filtered`), while a blog's link is active on its articles (scenario `page-article`)
  // no recording renders a menu on a product reached through a collection (`/collections/<c>/products/<p>`), so the list of collections being inactive there is the same rule extended, not recorded
  const holdsPagesBelow = target !== '/' && target !== '/collections'
  const active = current || (holdsPagesBelow && stripQuery(here).startsWith(`${target}/`))
  return {
    title: data.title,
    handle,
    url: withPrefix(prefix, data.url),
    type: linkType(data.url),
    active,
    current,
    child_active: links.some(link => link.active || link.child_active),
    child_current: links.some(link => link.current || link.child_current),
    levels: links.length ? 1 + Math.max(...links.map(link => link.levels as number)) : 0,
    links,
    object: null,
    data_sharing_opt_out_icon: null
  }
}

/**
 * The links of one list, each with its own handle among its siblings: the data's handle, else its title handleized (`buildLink`). A handle that comes out empty (a title of only non-Latin letters, such as `ホーム`, which `handleize` drops) is `link-<position>`, and one a sibling already has gets `-1`, `-2` and so on, so every `HeaderMenu-{{ link.handle }}` id of a list is its own. Shopify's menu item handles for such titles are not recorded, so both fallbacks are the engine's and not pinned.
 */
function buildLinks (list: LinkData[], path: string, prefix: string): LiquidObject[] {
  const used = new Set<string>()
  return list.map((link, i) => {
    let handle = link.handle || handleize(link.title) || `link-${i + 1}`
    if (used.has(handle)) {
      let n = 1
      while (used.has(`${handle}-${n}`)) n++
      handle = `${handle}-${n}`
    }
    used.add(handle)
    return buildLink(link, path, prefix, handle)
  })
}

/**
 * The `linklists` object for one request path, https://shopify.dev/docs/api/liquid/objects/linklists (each menu is https://shopify.dev/docs/api/liquid/objects/linklist), with its links under `prefix`. A menu prints as its handle, as the parity store prints a `link_list` setting: Horizon's `menu="{{ customer_account_menu }}"` came out `menu="customer-account-main-menu"` (shopify.dev says so only of the `product`, `collection`, `page`, `blog` and `article` settings, https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings; for a menu it is recorded, not documented).
 *
 * A handle that names no menu is nil, so `linklists['x'].links` is nil and a loop over it prints nothing: shopify.dev does not say what a missing menu gives, but its `link_list` setting is "blank, if either no selection has been made or the selection no longer exists". Whether Shopify gives nil or an empty menu to `linklists['x']` itself is not pinned.
 */
export function buildLinklists (lists: LinkListData[], path: string, prefix = ''): HandleMap<LiquidObject> {
  return new HandleMap(lists.map(list => {
    const links = buildLinks(list.links, path, prefix)
    return [list.handle, printsHandle({ handle: list.handle, title: list.title, links, levels: links.length ? 1 + Math.max(...links.map(link => link.levels as number)) : 0 })]
  }))
}

/** The line items of `lines`, https://shopify.dev/docs/api/liquid/objects/line_item, for an order (the cart builds its own, `buildCartObject`). Lines naming a product or variant the store does not have are skipped. No discounts, properties or selling plans are applied, so original, final and line prices are equal. */
function buildLineItems (lines: Array<{ product_handle: string, variant_id: number, quantity: number }>, products: HandleMap<LiquidObject>): LiquidObject[] {
  const items: LiquidObject[] = []
  for (const line of lines) {
    const product = HandleMap.get(products, line.product_handle)
    const variant = (product?.variants as LiquidObject[] | undefined)?.find(item => item.id === line.variant_id)
    if (!product || !variant) continue
    const price = variant.price as number
    items.push({
      // `index` (0-based) is not a property of https://shopify.dev/docs/api/liquid/objects/line_item, but themes read it as a row number (`item.index | plus: 1`), so it is built; the page does not pin its base
      index: items.length,
      id: variant.id,
      key: `${variant.id}:${items.length + 1}`,
      quantity: line.quantity,
      product,
      variant,
      product_id: product.id,
      variant_id: variant.id,
      title: variant.title === 'Default Title' ? product.title : `${product.title} - ${variant.title}`,
      product_title: product.title,
      variant_title: variant.title === 'Default Title' ? null : variant.title,
      url: variant.url,
      image: variant.featured_image ?? product.featured_image,
      sku: variant.sku,
      vendor: product.vendor,
      price,
      original_price: price,
      final_price: price,
      line_price: price * line.quantity,
      original_line_price: price * line.quantity,
      final_line_price: price * line.quantity,
      options_with_values: (product.options as string[]).map((name, i) => ({ name, value: (variant.options as string[])[i] ?? null })),
      properties: {},
      discount_allocations: [],
      line_level_discount_allocations: [],
      unit_price_measurement: variant.unit_price_measurement,
      unit_price: unitPrice(price, variant.unit_price_measurement as UnitPriceMeasurementData | null),
      selling_plan_allocation: null,
      requires_shipping: true,
      gift_card: false
    })
  }
  return items
}

/** The `<option>` tags of https://shopify.dev/docs/api/liquid/objects/country_option_tags, one a line as its example prints them: a `---` option first, then each country, its subregions JSON-encoded in `data-provinces` (an empty array when it has none). The page shows no example for https://shopify.dev/docs/api/liquid/objects/all_country_option_tags, which is printed the same way; whether it starts with `---` too is not pinned. */
function countryOptionTags (countries: CountryOptionData[]): string {
  const option = (name: string, provinces: Array<[string, string]>) => `<option value="${escapeHtml(name)}" data-provinces="${escapeHtml(JSON.stringify(provinces))}">${escapeHtml(name)}</option>`
  return [option('---', []), ...countries.map(country => option(country.name, country.provinces ?? []))].join('\n')
}

/** https://shopify.dev/docs/api/liquid/objects/gift_card, with the properties that page lists: `last_four_characters` is the code's last four characters (spaces left out, as its example's code `WCGX 7X97 K9HJ DFR8` ends `DFR8`), `currency` defaults to the shop's, `enabled` to true, `expired` to false, `product` and `variant` are the store's own objects, and every other property the data leaves out is nil. `url` is the data's, a path such as `/gift_cards/<store_id>/<gift_card_token>` printed under `prefix` (the address the storefront serves the card at) or an absolute address as it is (Shopify's own, on `checkout.shopify.com`). */
function buildGiftCard (data: GiftCardData, products: HandleMap<LiquidObject>, currency: string, prefix: string): LiquidObject {
  const product = data.product_handle ? HandleMap.get(products, data.product_handle) ?? null : null
  const variant = product && data.variant_id !== undefined ? (product.variants as LiquidObject[]).find(entry => entry.id === data.variant_id) ?? null : null
  return {
    balance: data.balance,
    initial_value: data.initial_value,
    code: data.code,
    last_four_characters: data.code.replace(/\s+/g, '').slice(-4),
    currency: data.currency ?? currency,
    enabled: data.enabled ?? true,
    expired: data.expired ?? false,
    expires_on: data.expires_on ?? null,
    customer: data.customer ?? null,
    message: data.message ?? null,
    send_on: data.send_on ?? null,
    pass_url: data.pass_url ?? null,
    product,
    variant,
    properties: data.properties ?? null,
    qr_identifier: data.qr_identifier ?? null,
    recipient: data.recipient ?? null,
    template_suffix: data.template_suffix ?? null,
    url: data.url ? withPrefix(prefix, data.url) : null
  }
}

/** A status value as English text, its first letter upper-case and `_` as a space (`partially_paid` is `Partially paid`), for the `_label` properties, which shopify.dev describes as the localized value and shows only as `Paid`, `Partial` and `Success` in its examples. */
const statusLabel = (value: string) => value ? value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ') : value

/** The `cancel_reason_label` of each `cancel_reason`: the description the order page gives each value. https://shopify.dev/docs/api/liquid/objects/order#order-cancel_reason */
const CANCEL_REASON_LABELS: Record<string, string> = { customer: 'Customer changed/cancelled order', declined: 'Payment declined', fraud: 'Fraudulent order', inventory: 'Items unavailable', staff: 'Staff error', other: 'Other' }

/** https://shopify.dev/docs/api/liquid/objects/address. `name` joins the first and last names, `street` the two lines, and `summary` the name, lines, city, province and country, as the page lists them (its example joins them with `, `). `country` is a country object (https://shopify.dev/docs/api/liquid/objects/country) that prints its name, as that page says a country does when referenced directly. `url` is `/account/addresses/<id>` for a customer address, as the page's example shows, under `prefix` like the account routes, and nil for an order's address ("This only applies to customer addresses"). */
function buildAddress (data: AddressData, ofCustomer: boolean, prefix: string): LiquidObject {
  const name = [data.first_name, data.last_name].filter(Boolean).join(' ')
  const street = [data.address1, data.address2].filter(Boolean).join(', ')
  const country: LiquidObject = { iso_code: data.country_code, name: data.country }
  Object.defineProperty(country, 'toString', { value: () => data.country, enumerable: false })
  return {
    id: data.id ?? null,
    first_name: data.first_name ?? null,
    last_name: data.last_name ?? null,
    name,
    company: data.company ?? null,
    address1: data.address1,
    address2: data.address2 ?? null,
    street,
    city: data.city,
    province: data.province ?? null,
    province_code: data.province_code ?? null,
    country,
    country_code: data.country_code,
    zip: data.zip,
    phone: data.phone ?? null,
    summary: [name, street, data.city, data.province, data.country].filter(Boolean).join(', '),
    url: ofCustomer && data.id !== undefined ? withPrefix(prefix, `/account/addresses/${data.id}`) : null
  }
}

/**
 * An amount of an order in the view's currency (final review B, M6): the data holds an order's shipping, tax, refunds and payments in the shop's currency, while its lines are priced by the view, so in another market the total added two currencies. The amount is converted at the market's rate like a discount's (`money` in `discounts.ts`), a shipping price like a shipping rate, which the market rounds up (fixtures `ajax-shipping-rates-en-ca` and `ajax-shipping-rates-en-eu`, `shippingRates`). No recording holds an order in another market, and https://shopify.dev/docs/api/liquid/objects/order does not say which currency an order's amounts print in; they are the view's, as every other amount of the page is. The shop's own currency is not converted.
 */
const orderAmount = (amount: number, currency: ViewCurrency, rounding = false) => convert(amount, rounding ? currency : { ...currency, rounding: false })

/** https://shopify.dev/docs/api/liquid/objects/transaction. */
function buildTransaction (data: TransactionData, currency: ViewCurrency): LiquidObject {
  return {
    id: data.id,
    amount: orderAmount(data.amount, currency),
    kind: data.kind,
    status: data.status,
    status_label: statusLabel(data.status),
    gateway: data.gateway,
    gateway_display_name: data.gateway_display_name ?? data.gateway,
    created_at: data.created_at,
    name: data.name ?? null,
    payment_details: data.payment_details ?? null,
    receipt: data.receipt ?? null,
    buyer_pending_payment_instructions: [],
    buyer_pending_payment_notice: null,
    'show_buyer_pending_payment_instructions?': false
  }
}

/**
 * https://shopify.dev/docs/api/liquid/objects/order, with its line items (https://shopify.dev/docs/api/liquid/objects/line_item), addresses, shipping methods (https://shopify.dev/docs/api/liquid/objects/shipping_method), tax lines (https://shopify.dev/docs/api/liquid/objects/tax_line), fulfillments (https://shopify.dev/docs/api/liquid/objects/fulfillment) and transactions. No discounts or duties are modelled: `line_items_subtotal_price` and `subtotal_price` are the sum of the lines, `total_price` adds the shipping and tax prices to it, `total_net_amount` is `total_price` minus `total_refunded_amount`, as the page defines it, the shipping, tax, refund and payment amounts being the view's currency (`orderAmount`), and `total_duties` is nil ("If there are no duties"). Each line item carries the `fulfillment` that ships it (the first one that lists it) and its `successfully_fulfilled_quantity`. `tags` are sorted, as the page says. `customer_url` is `/account/orders/<id>` under `prefix`, and `order_status_url` and `customer_order_url` are nil: the page's examples are URLs with tokens a store issues.
 */
function buildOrder (data: OrderData, products: HandleMap<LiquidObject>, prefix: string, currency: ViewCurrency): LiquidObject {
  const lineItems = buildLineItems(data.line_items, products)
  const fulfilled = new Map<LiquidObject, number>()
  const fulfillments = (data.fulfillments ?? []).map(entry => {
    const lines = entry.line_items.flatMap(line => {
      const item = lineItems.find(candidate => candidate.variant_id === line.variant_id)
      if (!item) return []
      const quantity = line.quantity ?? item.quantity as number
      fulfilled.set(item, (fulfilled.get(item) ?? 0) + quantity)
      const part: LiquidObject = { quantity }
      hidden(part, 'line_item', item)
      return [part]
    })
    const fulfillment: LiquidObject = {
      created_at: entry.created_at,
      fulfillment_line_items: lines,
      item_count: lines.reduce((sum, line) => sum + (line.quantity as number), 0),
      tracking_company: entry.tracking_company ?? null,
      tracking_number: entry.tracking_number ?? null,
      tracking_numbers: entry.tracking_number ? [entry.tracking_number] : [],
      tracking_url: entry.tracking_url ?? null
    }
    for (const line of lines) {
      const item = line.line_item as LiquidObject
      if (!item.fulfillment) item.fulfillment = fulfillment
    }
    return fulfillment
  })
  for (const item of lineItems) {
    item.fulfillment ??= null
    item.successfully_fulfilled_quantity = Math.min(item.quantity as number, fulfilled.get(item) ?? 0)
    item.fulfillment_service = 'manual'
  }
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)
  const itemCount = sum(lineItems.map(item => item.quantity as number))
  const shippedCount = sum(lineItems.map(item => item.successfully_fulfilled_quantity as number))
  const fulfillmentStatus = data.fulfillment_status ?? (itemCount > 0 && shippedCount === itemCount ? 'fulfilled' : shippedCount > 0 ? 'partial' : 'unfulfilled')
  const financialStatus = data.financial_status ?? 'paid'
  const shippingMethods = (data.shipping_methods ?? []).map(method => {
    const price = orderAmount(method.price, currency, true)
    return { title: method.title, price, original_price: price, price_with_discounts: price, handle: null, id: null, tax_lines: [], discount_allocations: [] }
  })
  const taxLines = (data.tax_lines ?? []).map(line => ({ title: line.title, rate: line.rate, rate_percentage: Math.round(line.rate * 10000) / 100, price: orderAmount(line.price, currency) }))
  const subtotal = sum(lineItems.map(item => item.final_line_price as number))
  const shippingPrice = sum(shippingMethods.map(method => method.price))
  const taxPrice = sum(taxLines.map(line => line.price))
  const totalPrice = subtotal + shippingPrice + taxPrice
  const refunded = orderAmount(data.total_refunded_amount ?? 0, currency)
  return {
    id: data.id,
    name: data.name ?? `#${data.order_number}`,
    order_number: data.order_number,
    confirmation_number: data.confirmation_number ?? null,
    created_at: data.created_at,
    email: data.email ?? null,
    phone: data.phone ?? null,
    customer_url: withPrefix(prefix, `/account/orders/${data.id}`),
    customer_order_url: null,
    order_status_url: null,
    line_items: lineItems,
    subtotal_line_items: lineItems,
    item_count: itemCount,
    billing_address: data.billing_address ? buildAddress(data.billing_address, false, prefix) : null,
    shipping_address: data.shipping_address ? buildAddress(data.shipping_address, false, prefix) : null,
    'pickup_in_store?': false,
    shipping_methods: shippingMethods,
    shipping_price: shippingPrice,
    tax_lines: taxLines,
    tax_price: taxPrice,
    line_items_subtotal_price: subtotal,
    subtotal_price: subtotal,
    total_discounts: 0,
    total_duties: null,
    total_price: totalPrice,
    total_refunded_amount: refunded,
    total_net_amount: totalPrice - refunded,
    cart_level_discount_applications: [],
    discount_applications: [],
    financial_status: financialStatus,
    financial_status_label: statusLabel(financialStatus),
    fulfillment_status: fulfillmentStatus,
    fulfillment_status_label: statusLabel(fulfillmentStatus),
    fulfillments,
    transactions: (data.transactions ?? []).map(transaction => buildTransaction(transaction, currency)),
    cancelled: !!data.cancelled_at,
    cancelled_at: data.cancelled_at ?? null,
    cancel_reason: data.cancel_reason ?? null,
    cancel_reason_label: data.cancel_reason ? CANCEL_REASON_LABELS[data.cancel_reason] ?? statusLabel(data.cancel_reason) : null,
    note: data.note ?? null,
    tags: [...(data.tags ?? [])].sort(),
    attributes: data.attributes ?? {},
    metafields: {}
  }
}

/**
 * https://shopify.dev/docs/api/liquid/objects/customer, built from `data`, whose other fields are kept as given. `name` joins the first and last names; `addresses` are address objects (`buildAddress`) with `addresses_count`, and `default_address` is the one `default_address_id` names, the first address without it, or nil without addresses; `orders` are order objects (`buildOrder`) in the order the data gives them, each with this customer as its `customer`, with `orders_count`, `last_order` (the order created last) and `total_spent` (the sum of the orders' `total_net_amount`). The customer is not B2B, has an account, has no avatar, saved payment methods, store credit or company locations, and accepts marketing and is tax exempt only when the data says so.
 */
function buildCustomer (data: CustomerData, products: HandleMap<LiquidObject>, prefix: string, currency: ViewCurrency, resolve?: MetafieldResolver): LiquidObject {
  const { addresses: addressData, orders: orderData, default_address_id: defaultId, ...rest } = data
  const addresses = (addressData ?? []).map(address => buildAddress(address, true, prefix))
  const orders = (orderData ?? []).map(order => buildOrder(order, products, prefix, currency))
  const created = (order: LiquidObject) => Date.parse(String(order.created_at)) || 0
  const firstName = data.first_name ?? ''
  const lastName = data.last_name ?? ''
  const customer: LiquidObject = {
    ...rest,
    id: data.id ?? null,
    email: data.email ?? null,
    first_name: firstName,
    last_name: lastName,
    name: [firstName, lastName].filter(Boolean).join(' '),
    phone: data.phone ?? null,
    accepts_marketing: data.accepts_marketing ?? false,
    tax_exempt: data.tax_exempt ?? false,
    tags: data.tags ?? [],
    'b2b?': false,
    has_account: true,
    'has_avatar?': false,
    addresses,
    addresses_count: addresses.length,
    default_address: addresses.find(address => defaultId !== undefined && address.id === defaultId) ?? addresses[0] ?? null,
    orders,
    orders_count: orders.length,
    last_order: orders.reduce<LiquidObject | null>((last, order) => !last || created(order) >= created(last) ? order : last, null),
    total_spent: orders.reduce((sum, order) => sum + (order.total_net_amount as number), 0),
    payment_methods: [],
    company_available_locations: [],
    company_available_locations_count: 0,
    current_company: null,
    current_location: null,
    store_credit_account: null,
    metafields: buildMetafields(data.metafields, resolve)
  }
  for (const order of orders) hidden(order, 'customer', customer)
  return customer
}

/** The views built for one `data` object, least recently used first, and how many of them are kept. */
interface ViewCache {
  views: Map<string, StoreObjects>
  size: number
}

const built = new WeakMap<StoreData, ViewCache>()

/**
 * The views kept for one `data` object unless `setViewCacheSize` says otherwise; the least recently used one is dropped past it (final review B, I2). A view holds a full copy of the store's objects, because every URL in them sits under the view's prefix (the base path, then the locale prefix), so a store served under many base paths (one a preview session) builds a view for each. Measured on a store of 5,000 products and 45,000 variants, a view holds about 40 MB and takes about 120 ms to build: the 64 views kept before this limit came to about 2.6 GB for one data object, and 16 come to about 640 MB. The number of products and variants sets the size, about 8 KB per product with its nine variants.
 *
 * The base path stays in the built objects, because it cannot be applied where a URL is printed without changing every builder and what templates may do with a URL. It reaches the URL of every product, variant, collection, page, blog, article, menu link, cart line, route, filter, pagination and localization link (some 25 `withPrefix` calls in eight files), each a plain string that a template compares (`link.url == request.path`), cuts and hands to filters (`append`, `split`, `replace`, `url_encode`), so none of them can become a value that fills the prefix in when it is printed; and filling it in on the finished page would have to tell a URL from other text, in markup, in JSON and in scripts. The cache is bounded instead.
 */
export const DEFAULT_VIEW_CACHE_SIZE = 16

/** The most views `data` keeps from now on: `size` rounded down, at least 1 (`0` and negative sizes are `1`), `Infinity` for no limit, and the default for a size that is not a number. Views beyond the limit are dropped at once, the least recently used first; the objects a render already holds stay valid, they are only no longer found by the next request. The limit belongs to the `data` object, so the latest call that names one decides, and a call that names none leaves it as it is. */
export function setViewCacheSize (data: StoreData, size: number): void {
  const cache = cacheOf(data)
  cache.size = Number.isNaN(size) ? DEFAULT_VIEW_CACHE_SIZE : Math.max(1, Math.floor(size))
  trim(cache)
}

function cacheOf (data: StoreData): ViewCache {
  let cache = built.get(data)
  if (!cache) {
    cache = { views: new Map(), size: DEFAULT_VIEW_CACHE_SIZE }
    built.set(data, cache)
  }
  return cache
}

/** Drops the least recently used views until the cache is within its size. */
function trim (cache: ViewCache): void {
  while (cache.views.size > cache.size) cache.views.delete(cache.views.keys().next().value as string)
}

/**
 * The Liquid objects for `data` in `view`, built once per `data` object and view and reused, the `DEFAULT_VIEW_CACHE_SIZE` most recently used views of a `data` object kept (`setViewCacheSize`). Without a view it is the one a request that says nothing renders in (`resolveView`): the primary market and language, no prefix. Every resource URL sits under the view's prefix (the base path, then the locale prefix), as the parity store prints them under a locale prefix (fixture `probe-page-fr-ca`). `shop` follows https://shopify.dev/docs/api/liquid/objects/shop; `shop.url` and `shop.secure_url` are `https://<domain>`, as shopify.dev gives no other form for a store without its own scheme.
 */
export function buildStore (data: StoreData, view?: StoreView): StoreObjects {
  const resolved = view ?? resolveView(data, {})
  const key = viewKey(resolved)
  const cache = cacheOf(data)
  const cached = cache.views.get(key)
  if (cached) {
    // read again, so it is now the most recently used
    cache.views.delete(key)
    cache.views.set(key, cached)
    return cached
  }
  const objects = buildObjects(data, resolved)
  cache.views.set(key, objects)
  trim(cache)
  return objects
}

/** Shopify's title for the collection `all` in the languages the parity store prints it in, by language code: `Produits` in French (recording `page-home-fr-ca` of the Dawn theme, where a featured collection section picks `all`: "Afficher tous les produits de la collection Produits"). Any other language keeps `Products`, the English title, which shopify.dev does not pin for other languages either. */
const ALL_TITLES: Record<string, string> = { fr: 'Produits' }

/** The objects of `data` in `view`: every resource is built from `source`, `data` in the view's language (`translateData`), while the market, its currency and the localization come from `data`, which the language does not change. */
function buildObjects (data: StoreData, view: StoreView): StoreObjects {
  const { prefix } = view
  const source = translateData(data, view.language)
  const currency = currencyOf(data, view)
  // a reference metafield points at an object of this view, which is read when the metafield's `value` is (`MetafieldDrop`), after the view is built
  const finished: { objects?: StoreObjects } = {}
  const resolve: MetafieldResolver = (kind, key) => {
    const ready = finished.objects
    if (!ready) return null
    if (kind === 'variant') return HandleMap.values(ready.products).flatMap(product => product.variants as LiquidObject[]).find(variant => String(variant.id) === key) ?? null
    const map = kind === 'product' ? ready.products : kind === 'collection' ? ready.collections : kind === 'page' ? ready.pages : undefined
    return map ? HandleMap.get(map, key) ?? null : null
  }
  const products = new HandleMap((source.products ?? []).map(product => [product.handle, buildProduct(product, prefix, currency, resolve)]))
  // Every shop answers `collections.all` with all its products. https://shopify.dev/docs/api/liquid/objects/collections
  // its default order is by title (fixture `probe-collection-all`)
  const all = buildCollection({ id: 0, handle: 'all', title: own(ALL_TITLES, view.language.split('-')[0].toLowerCase()) ?? 'Products', products: (source.products ?? []).map(product => product.handle), sort_order: 'title-ascending' }, products, data.filters, prefix, currency)
  // a collection Shopify makes has no id: the parity store prints Dawn's and Horizon's `data-collection-id="{{ collection.id }}"` empty on `/collections/all` (their recordings `page-collection-filtered`)
  all.id = null
  // `collections` lists the store's collections alphabetically by title, whatever order the data has them in: https://shopify.dev/docs/api/liquid/objects/collections shows its example sorted so, and the parity store lists /collections that way (scenario `page-collections`: Accessories, Bottoms, Featured, Home page, Men, Shoes, Tops, Unisex, Women)
  const collections = new HandleMap((source.collections ?? []).map(collection => [collection.handle, buildCollection(collection, products, data.filters, prefix, currency, resolve)]), [['all', all]], byTitle)
  const blogs = new HandleMap((source.blogs ?? []).map(blog => [blog.handle, buildBlog(blog, prefix, resolve)]))
  const localization = buildLocalization(data, view)
  const shippingCountries = data.country_option_tags ?? [{ name: String((localization.country as LiquidObject | null)?.name ?? '') }]
  // the articles keep the store data's order here, which the search and the predictive search rank their ties by (fixture `probe-search-prefix`: the older article of two equal matches comes first), while a blog lists them newest first
  const articles = new HandleMap(HandleMap.values(blogs).flatMap(blog => articlesInDataOrder(blog).map(article => [`${blog.handle}/${article.handle}`, article] as [string, LiquidObject])))
  // a policy with no body is not set (Shopify answers its address with 404, as the parity store does for the four it has none of)
  const policies = setPolicies(source.shop.policies).map(policy => ({ type: policy.type, built: buildPolicy(policy, prefix) }))
  const policyOf = (type: PolicyData['type']) => policies.find(policy => policy.type === type)?.built ?? null
  const objects: StoreObjects = {
    data,
    prefix,
    shop: {
      name: source.shop.name,
      email: data.shop.email ?? '',
      description: source.shop.description ?? '',
      domain: data.shop.domain,
      permanent_domain: data.shop.domain,
      url: `https://${data.shop.domain}`,
      // the market's root in its default language (`marketRoot`; recordings `page-home-fr-ca` and `page-product-en-eu`)
      secure_url: `https://${data.shop.domain}${marketRoot(data, view.market)}`,
      currency: data.shop.currency,
      // the formats of the market's currency, which are the shop's own for the shop's currency (recording `page-product-en-eu`: `€{{amount_with_comma_separator}}`); the money filters already print in them. https://shopify.dev/docs/api/liquid/objects/shop shows `${{amount}}` for a shop's own currency only, and no recording shows `money_with_currency_format` in another market: it follows `money_format` by symmetry
      money_format: currency.money_format,
      money_with_currency_format: currency.money_with_currency_format,
      locale: data.shop.locale ?? 'en',
      // https://shopify.dev/docs/api/liquid/objects/shop lists both: the currencies of the store's markets and its published locales. The parity store prints the currencies by ISO code and, as `published_locales`, the languages of the market the page is in with their URLs there (fixtures `probe-page-home` and `probe-page-en-ca`), not every language the store is published in.
      enabled_currencies: enabledCurrencies(data),
      published_locales: localization.available_languages,
      enabled_payment_types: data.shop.enabled_payment_types ?? [],
      customer_accounts_enabled: true,
      customer_accounts_optional: true,
      products_count: source.products?.length ?? 0,
      collections_count: source.collections?.length ?? 0,
      types: unique((source.products ?? []).map(product => product.type ?? '').filter(Boolean)).sort(),
      vendors: unique((source.products ?? []).map(product => product.vendor ?? '').filter(Boolean)).sort(),
      // https://shopify.dev/docs/api/liquid/objects/shop: `policies` are "the policies for the store", each also under its own name, nil when it is not set; the parity store's footer lists its one policy (Dawn's `for policy in shop.policies`, recordings `page-home` of Dawn and Horizon)
      policies: policies.map(policy => policy.built),
      privacy_policy: policyOf('privacy_policy'),
      refund_policy: policyOf('refund_policy'),
      shipping_policy: policyOf('shipping_policy'),
      subscription_policy: policyOf('subscription_policy'),
      terms_of_service: policyOf('terms_of_service'),
      // "The password page message of the store", https://shopify.dev/docs/api/liquid/objects/shop#shop-password_message
      password_message: source.shop.password_message ?? null,
      metafields: buildMetafields(data.shop.metafields, resolve)
    },
    products,
    collections,
    pages: new HandleMap((source.pages ?? []).map(page => [page.handle, buildPage(page, prefix, resolve)])),
    blogs,
    articles,
    policies: new HandleMap(policies.map(policy => [policyHandle(policy.type), policy.built])),
    images: new HandleMap(Object.entries(data.images ?? {}).map(([name, img]) => [name, new ImageDrop(img)])),
    videos: Object.fromEntries(Object.entries(data.videos ?? {}).map(([name, video]) => [name, buildMedia(video) as LiquidObject])),
    linklists: source.linklists ?? [],
    cart: {},
    customer: data.customer ? buildCustomer(data.customer, products, prefix, currency, resolve) : null,
    localization,
    currency,
    country_option_tags: countryOptionTags(shippingCountries),
    all_country_option_tags: countryOptionTags(data.all_country_option_tags ?? shippingCountries),
    gift_card: data.gift_card ? buildGiftCard(data.gift_card, products, data.shop.currency, prefix) : null,
    storefrontFilters: data.filters ?? []
  }
  // the cart reads the products, the currency and the prefix of the objects above
  objects.cart = buildCartObject(objects, cartStateOf(data.cart))
  finished.objects = objects
  return objects
}
