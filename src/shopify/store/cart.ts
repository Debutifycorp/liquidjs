import { createHash } from 'crypto'
import { LiquidFloat } from '../../util/liquid-float'
import { stripTags } from '../../util/strip-tags'
import { HandleMap } from '../objects/handle-map'
import type { ImageDrop } from '../objects/image'
import { escapeHtml } from '../util/html'
import { buildStore, hidden, lazy, unitPrice } from './build'
import type { LiquidObject, StoreObjects } from './build'
import { applyDiscounts, discountAllocationJson, discountApplicationJson, enteredCodes } from './discounts'
import type { DiscountResult } from './discounts'
import type { CartData, CollectionData, ProductData, StoreData, UnitPriceMeasurementData, VariantData } from './types'
import { resolveView, withPrefix } from './view'
import type { StoreView } from './view'

/** The hidden field that marks a cart built by `buildCartObject` for the `json` filter. */
const CART_MARKER = '__cart'

/** The hidden field that holds the `DiscountResult` of a cart built by `buildCartObject`, which says which entered codes were rejected. */
const DISCOUNTS_FIELD = '__discounts'

/** The hidden field of a built cart that holds the codes the visitor entered, as the state has them. */
const CODES_FIELD = '__codes'

/**
 * The hidden fields that hold the visitor's text of a cart, or of a line, as it was stored. The `cart` object a template reads holds it HTML-escaped (`escapedText`), so `/cart.js` and `{{ cart | json }}` read it from here. Fixture `ajax-cart-text`: the parity store keeps the note, the attributes and the line item properties raw (`/cart.js`, step 2) and prints them escaped in Liquid (`cart.note`, `cart.attributes.<name>` and the values of `item.properties`, step 3, and through `json`, step 4), except in `{{ cart | json }}`, which prints them raw (the `ajax` of step 4).
 */
const RAW_TEXT = '__raw_text'
const RAW_PROPERTIES = '__raw_properties'

interface RawText { note: string | null, attributes: Record<string, string> }

/** A cart's note and attributes as the visitor stored them (a cart not built by `buildCartObject` has them as they are). */
const rawTextOf = (cart: LiquidObject): RawText => (cart[RAW_TEXT] as RawText | undefined) ?? { note: cart.note as string | null, attributes: cart.attributes as Record<string, string> }

/** A line's properties as the visitor stored them. */
const rawPropertiesOf = (item: LiquidObject): Record<string, string> => (item[RAW_PROPERTIES] as Record<string, string> | undefined) ?? item.properties as Record<string, string>

/**
 * The visitor's text as a template reads it: HTML-escaped (`&lt;`, `&amp;`, `&quot;`, `&#39;`), and a plain string, so `| escape` escapes it once more, as Shopify's would (fixture `ajax-cart-text`, step 3: `note=&lt;/textarea&gt;&lt;b&gt;A &amp; &quot;B&quot;&lt;/b&gt;` for the note `</textarea><b>A & "B"</b>`). The cart's note, the values of its attributes and of a line's properties are the visitor's, set by a post any website can make, and a theme prints them with no filter (Dawn's `<textarea>{{ cart.note }}</textarea>`), so a raw print ran the script of a cross-site `POST /cart/update`. A missing note stays nil.
 */
const escapedText = <T extends string | null>(text: T): T => (text === null ? text : escapeHtml(text) as T)

/**
 * The name of an attribute or of a line item property as a template reads it: the visitor's name with its HTML tags stripped, so `<s>k</s>` reads `k` and `<u>N</u>` reads `N` (fixture `ajax-cart-text`: `/cart.js` keeps `"<s>k</s>":"w"` and `"<u>N</u>":"v"`, step 2, and in Liquid `{% for a in cart.attributes %}{{ a.first }}` prints `k` and `{% for p in item.properties %}{{ p.first }}` prints `N`, step 3, and `cart.attributes | json` and `item.properties | json` print the keys `k` and `N`, step 4; `{{ cart | json }}` keeps the raw names, the `ajax` of step 4). The stripped name is the key, so `cart.attributes.k` and `item.properties.N` read the value; that lookup is inferred from the keys the `json` filter printed, the recording does not read by name. What stripping leaves of `&`, `<`, `>`, `"` and `'` is escaped as the values are, so a theme that prints `{{ p.first }}` in an attribute (`<input name="{{ p.first }}">`) cannot be broken out of by a name like `x"y`: the recording holds no such name, so this is a safety rule of this package, and a name with none of them (`gift`, `Engraving`, `Gift wrap`) reads as it is. Final review B, lane FA2. Two names that strip to the same one (`k` and `<s>k</s>`) leave the later one's value, which nothing pins.
 */
const readableName = (name: string): string => escapedText(stripTags(name))

/** A cart's attributes, or a line's properties, as a template reads them: the names without their tags (`readableName`) and the values escaped (`escapedText`). */
const readableText = (values: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(values).map(([name, value]) => [readableName(name), escapedText(value)]))

/** Whether `value` is a cart built by `buildCartObject`. */
export const isBuiltCart = (value: unknown): value is LiquidObject => typeof value === 'object' && value !== null && (value as LiquidObject)[CART_MARKER] === true

/** The hidden field that marks a line item built by `buildCartObject` for the `json` filter. */
const LINE_MARKER = '__line'

/** Whether `value` is a line item built by `buildCartObject`. */
export const isBuiltLine = (value: unknown): value is LiquidObject => typeof value === 'object' && value !== null && (value as LiquidObject)[LINE_MARKER] === true

/** One line of a visitor's cart: a variant, how many of it, its line item properties and the selling plan it is bought under. A line holds at least one of its variant (the storefront removes a line whose quantity reaches zero); the engine leaves a line with less out of the cart. */
export interface CartLineState {
  variantId: number
  quantity: number
  properties: Record<string, string>
  sellingPlanId: number | null
}

/**
 * A visitor's cart as plain JSON, which the storefront keeps and the engine renders (`RenderPageOptions.cart`, `cartJson`). `lines` are in the order the cart lists them (a new line goes first, as the parity store does, fixture `ajax-cart-session`). `note` is `null` for a cart nobody has changed and `''` after its first change (fixtures `ajax-cart-session` and `ajax-cart-errors`). `currency` is the currency the cart was last shown in; the engine prices a cart in the currency of the view it renders in, so it does not read it.
 */
export interface CartState {
  token: string
  lines: CartLineState[]
  note: string | null
  attributes: Record<string, string>
  discountCodes: string[]
  currency?: string
}

/**
 * The shape a line is printed in: `cart` for `/cart.js`, `change` for the lines in the answers of `/cart/add.js`, `/cart/change.js` and `/cart/update.js`, which hold `untranslated_product_title` and `untranslated_variant_title` where `/cart.js` holds `quantity_rule` and `has_components`, and `liquid` for the lines of `{{ cart | json }}`, which hold neither pair nor `presentment_price` (fixtures `ajax-cart-session` and `ajax-cart-en-ca`: the steps of `/cart.js` and of the cart add and change answers, and the `ajax` of the cart probe).
 */
export type LineItemForm = 'cart' | 'change' | 'liquid'

/** A line's key: the variant id and a hash of its properties and selling plan, so the same line keeps its key (https://shopify.dev/docs/api/ajax/reference/cart: "Items with different prices, properties, or selling plans become separate lines"); the hash is 32 hex digits, as the parity store's keys are (the recorded keys that fixture `ajax-cart-session` keeps as `<hash>`). The hash is the engine's own, not Shopify's, and does not depend on the order the properties were set in. */
export function lineKey (line: CartLineState): string {
  const properties = Object.keys(line.properties).sort().map(name => [name, line.properties[name]])
  const hash = createHash('md5').update(JSON.stringify([properties, line.sellingPlanId])).digest('hex')
  return `${line.variantId}:${hash}`
}

/** The variant with `variantId` and the product it belongs to, or null when the store has none. */
export function findVariant (data: StoreData, variantId: number): { product: ProductData, variant: VariantData } | null {
  for (const product of data.products ?? []) {
    const variant = product.variants.find(v => v.id === variantId)
    if (variant) return { product, variant }
  }
  return null
}

/** How many of a variant can be sold: none when the data marks it unavailable, otherwise unlimited (null) when Shopify does not track its stock or sells past zero. https://shopify.dev/docs/api/liquid/objects/variant#variant-inventory_policy ("continue" sells when the stock is out) and #variant-inventory_management. A tracked variant whose data gives no quantity counts as the variant object does (`inventory_quantity`: one when it is available, none when it is not). */
export function stockFor (variant: VariantData): number | null {
  if (!variant.available) return 0
  if (variant.inventory_management == null || variant.inventory_policy === 'continue') return null
  return Math.max(0, variant.inventory_quantity ?? (variant.available ? 1 : 0))
}

/** The cart of the store data as a state: a `CartState` as it is, lines by handle as lines with no properties or selling plan (the variant id names the line, the handle is not read), nothing as an empty cart. A cart the data holds has no token. */
export function cartStateOf (cart: CartData | undefined): CartState {
  if (cart && 'lines' in cart) return cart
  return {
    token: '',
    lines: (cart?.items ?? []).map(item => ({ variantId: item.variant_id, quantity: item.quantity, properties: {}, sellingPlanId: null })),
    note: cart?.note ?? null,
    attributes: {},
    discountCodes: []
  }
}

interface BuiltVariant {
  product: LiquidObject
  variant: LiquidObject
  /** The product's title in the store's default language, which the `change` form of the Ajax answers prints beside the translated one. */
  untranslatedTitle: string
}

const variantIndexes = new WeakMap<StoreObjects, Map<number, BuiltVariant>>()

/** The built product and variant with `variantId`, from an index made once per `StoreObjects`. */
function builtVariant (store: StoreObjects, variantId: number): BuiltVariant | undefined {
  let index = variantIndexes.get(store)
  if (!index) {
    index = new Map()
    const titles = new Map((store.data.products ?? []).map(product => [product.id, product.title]))
    for (const product of HandleMap.values(store.products)) {
      for (const variant of product.variants as LiquidObject[]) index.set(variant.id as number, { product, variant, untranslatedTitle: titles.get(product.id as number) ?? String(product.title) })
    }
    variantIndexes.set(store, index)
  }
  return index.get(variantId)
}

/** Line item properties as a template reads them: by name (`item.properties.Engraving`) and as pairs (`for property in item.properties`), and printed by `json` as the parity store prints them, a list of `[name, value]` pairs (`[]` for none, fixture `ajax-cart-session`, step 11). Its `size` reads nil, unless a property is named `size`: Dawn's cart drawer opens its `<dl>` and prints `<p class="product-option"></p>` for a line with no properties, no selling plan and only the default variant (`item.product.has_only_default_variant == false or item.properties.size != 0 or item.selling_plan_allocation != null`), and the parity store prints exactly that for black-sunnies (recording `ajax-cart-sections` of Dawn), which only a `size` that is not 0 explains; this is the inference from that recording, shopify.dev's line_item page does not describe the type of `properties`. */
function propertiesOf (properties: Record<string, string>): Record<string, string> {
  const copy = readableText(properties)
  if (!('size' in copy)) Object.defineProperty(copy, 'size', { value: undefined, enumerable: false })
  Object.defineProperty(copy, 'toJSON', { value: () => Object.entries(copy), enumerable: false })
  return copy
}

/**
 * One line item, https://shopify.dev/docs/api/liquid/objects/line_item, for a line of the cart, in the view's currency (the built variant is). `index` (0-based) is not a property of that page, but themes read it as a row number (`item.index | plus: 1`); the page does not pin its base. A line under a selling plan carries the plan's allocation and its price, and its `url` names the plan (`?selling_plan=71001&variant=43695710371862`, fixture `ajax-cart-session`); `original_price` is that price too, as the parity store prints it. `url_to_remove` is the cart change address of the line's key, under the view's prefix (fixtures `ajax-cart-session` and `ajax-cart-en-ca`). `title` is HTML-escaped, as the parity store's Liquid prints it (`Men&#39;s T-shirt - Small / Green`, fixture `ajax-discount-codes`, steps 2 and 8, in `/cart.js` and in `{{ cart | json }}` too; `product_title` is not, and the `title` in the answers of add, change and update is not either, step 1). The discounts are not applied here: `buildCartObject` does that and sets the prices and allocations the line then holds.
 */
function lineItem (store: StoreObjects, state: CartLineState, index: number): LiquidObject | null {
  const found = builtVariant(store, state.variantId)
  if (!found || !(state.quantity >= 1)) return null
  const { product, variant, untranslatedTitle } = found
  const allocation = state.sellingPlanId === null ? null : (variant.selling_plan_allocations as LiquidObject[]).find(entry => (entry.selling_plan as LiquidObject).id === state.sellingPlanId) ?? null
  const price = allocation ? allocation.price as number : variant.price as number
  const key = lineKey(state)
  const defaultTitle = variant.title === 'Default Title'
  const item: LiquidObject = {
    index,
    id: variant.id,
    key,
    quantity: state.quantity,
    product,
    variant,
    product_id: product.id,
    variant_id: variant.id,
    title: escapeHtml(defaultTitle ? product.title : `${product.title} - ${variant.title}`),
    product_title: product.title,
    variant_title: defaultTitle ? null : variant.title,
    url: allocation ? `${product.url}?selling_plan=${state.sellingPlanId}&variant=${variant.id}` : variant.url,
    url_to_remove: withPrefix(store.prefix, `/cart/change?id=${key}&quantity=0`),
    image: variant.featured_image ?? product.featured_image,
    sku: variant.sku,
    vendor: product.vendor,
    properties: propertiesOf(state.properties),
    original_price: price,
    final_price: price,
    price,
    original_line_price: price * state.quantity,
    final_line_price: price * state.quantity,
    line_price: price * state.quantity,
    line_level_total_discount: 0,
    line_level_discount_allocations: [],
    discount_allocations: [],
    total_discount: 0,
    selling_plan_allocation: allocation,
    requires_shipping: variant.requires_shipping,
    taxable: variant.taxable,
    grams: variant.weight,
    gift_card: false,
    options_with_values: (product.options as string[]).map((name, i) => ({ name, value: (variant.options as string[])[i] ?? null })),
    unit_price_measurement: variant.unit_price_measurement,
    // https://shopify.dev/docs/api/liquid/objects/line_item: a cart line can be removed and its quantity changed (`instructions`), has no components and no parent: the store data has no bundles, and Dawn and Horizon read the defaults so (`can_remove` and `can_update_quantity` true)
    instructions: { can_remove: true, can_update_quantity: true },
    item_components: [],
    parent_relationship: null,
    fulfillment: null
  }
  // "The price reflects any discounts that are applied to the line item" (https://shopify.dev/docs/api/liquid/objects/line_item#line_item-unit_price), so it is read from the final price when asked, after the discounts are allocated
  lazy(item, 'unit_price', () => unitPrice(item.final_price as number, variant.unit_price_measurement as UnitPriceMeasurementData | null))
  hidden(item, 'untranslated_product_title', untranslatedTitle)
  hidden(item, LINE_MARKER, true)
  hidden(item, RAW_PROPERTIES, state.properties)
  return item
}

const collectionIndexes = new WeakMap<CollectionData[], Map<string, Set<string>>>()
const noCollections = new Map<string, Set<string>>()

/** Each collection's handle with the handles of its products, which discounts name their items by; made once per list of collections. */
export function collectionsOf (data: StoreData): Map<string, Set<string>> {
  if (!data.collections) return noCollections
  let index = collectionIndexes.get(data.collections)
  if (!index) {
    index = new Map(data.collections.map(collection => [collection.handle, new Set(collection.products)]))
    collectionIndexes.set(data.collections, index)
  }
  return index
}

/** A line item with the discount allocations of its line: https://shopify.dev/docs/api/liquid/objects/line_item says `final_price` and `final_line_price` "include any line-level discounts", `line_level_discount_allocations` are "the discount allocations that apply directly to the line item", `discount_allocations` all of them, an order discount's share included (fixture `ajax-discount-codes`: WELCOME10 is in `discount_allocations` and not in `line_level_discount_allocations`, and leaves `final_line_price` alone), and `line_level_total_discount` is the sum of the line-level ones. `final_price` is the final line price per unit, rounded to the minor unit (no fixture has a line that does not divide). The deprecated `price`, `line_price` and `total_discount` stay as they were: the page says they leave automatic discounts and codes out. */
function discountLine (item: LiquidObject, allocations: LiquidObject[], index: number): LiquidObject {
  const lineLevel = allocations.filter(entry => (entry.discount_application as LiquidObject).target_selection !== 'all')
  const lineLevelTotal = lineLevel.reduce((total, entry) => total + (entry.amount as number), 0)
  item.index = index
  item.discount_allocations = allocations
  item.line_level_discount_allocations = lineLevel
  item.line_level_total_discount = lineLevelTotal
  item.final_line_price = (item.original_line_price as number) - lineLevelTotal
  item.final_price = Math.round((item.final_line_price as number) / (item.quantity as number))
  return item
}

/**
 * The `cart` object for a cart state, https://shopify.dev/docs/api/liquid/objects/cart, in the store's view (its prices, language and prefix). Lines naming a variant the store does not have, or holding less than one of it, are left out. `attributes` are the state's less the private ones, those whose name starts with `__`, which https://shopify.dev/docs/api/ajax/reference/cart says are "not available in the Liquid `cart.attributes` object or the Ajax API"; the object is a copy, so a template or a caller changing it leaves the state alone. `currency` has the view's `iso_code`, `symbol` and `name`. `token` is nil for a cart without one (`cartStateOf`). Totals add the lines' prices, `total_weight` their weight in grams times the quantity, and `requires_shipping` is true while a line requires it.
 *
 * The store's discounts and the cart's codes are applied (`applyDiscounts`): a Buy X Get Y that discounts some units of a line splits it into two lines of the same key and variant (fixture `ajax-discount-automatic-bxgy`), and `index` counts the lines after the split. `items_subtotal_price` is the sum of the final line prices, "after any line item discounts"; `total_price` takes the order discounts off it, `total_discount` is "the total amount of all discounts", which is what separates `original_total_price` from `total_price`; `discount_applications` lists every application and `cart_level_discount_applications` the order discounts (fixture `ajax-discount-codes`, steps 2, 4 and 6). The cart holds the result for `cartJson`'s `discount_codes`.
 */
export function buildCartObject (store: StoreObjects, state: CartState): LiquidObject {
  const whole: LiquidObject[] = []
  const entries = new Map<LiquidObject, CartLineState>()
  for (const entry of state.lines) {
    const item = lineItem(store, entry, whole.length)
    if (!item) continue
    whole.push(item)
    entries.set(item, entry)
  }
  const discounts = applyDiscounts(whole, store.data.discounts ?? [], state.discountCodes, { collections: collectionsOf(store.data), currency: store.currency })
  const items = discounts.lines.map((line, index) => {
    const entry = entries.get(line.item) as CartLineState
    const item = line.units === entry.quantity ? line.item : lineItem(store, { ...entry, quantity: line.units }, index) as LiquidObject
    return discountLine(item, line.allocations, index)
  })
  const sum = (field: string) => items.reduce((total, item) => total + (item[field] as number), 0)
  const subtotal = sum('final_line_price')
  const original = sum('original_line_price')
  const orderLevel = items.reduce((total, item) => total + (item.discount_allocations as LiquidObject[]).reduce((inner, entry) => inner + ((entry.discount_application as LiquidObject).target_selection === 'all' ? entry.amount as number : 0), 0), 0)
  const total = subtotal - orderLevel
  // the private attributes (`__…`) are left out of the object a template and the Ajax answers read
  const attributes = Object.fromEntries(Object.entries(state.attributes).filter(([name]) => !name.startsWith('__')))
  const cart: LiquidObject = {
    token: state.token || null,
    items,
    item_count: sum('quantity'),
    items_subtotal_price: subtotal,
    original_total_price: original,
    total_price: total,
    checkout_charge_amount: total,
    total_discount: original - total,
    // a Float in Shopify's Liquid, so `{{ cart.total_weight }}` and `cart | json` print `1550.0` (scenarios `ajax-cart-session`, `ajax-discount-codes`, `ajax-discount-automatic-bxgy`, `ajax-cart-en-ca`), an empty cart `0.0`; the Ajax answers (`cartJson`) hold the plain number
    total_weight: new LiquidFloat(items.reduce((weight, item) => weight + ((item.variant as LiquidObject).weight as number) * (item.quantity as number), 0)),
    currency: { iso_code: store.currency.iso_code, symbol: store.currency.symbol, name: store.currency.name },
    note: escapedText(state.note),
    attributes: readableText(attributes),
    requires_shipping: items.some(item => item.requires_shipping),
    cart_level_discount_applications: discounts.cartLevel,
    discount_applications: discounts.applications,
    taxes_included: false,
    duties_included: false,
    'empty?': items.length === 0
  }
  hidden(cart, CART_MARKER, true)
  hidden(cart, RAW_TEXT, { note: state.note, attributes } satisfies RawText)
  hidden(cart, DISCOUNTS_FIELD, discounts)
  hidden(cart, CODES_FIELD, state.discountCodes)
  return cart
}

/** The text of a field the Ajax API writes as `null` when it is empty (a variant's `sku`), as the parity store does (fixture `ajax-cart-session`). */
const textOrNull = (text: unknown) => text === '' || text === undefined || text === null ? null : text

/** A product's description as the Ajax cart prints it: the text without its tags (`<p>` is gone in fixture `ajax-cart-session`, whose products' descriptions are paragraphs). */
const plainText = (html: unknown) => stripTags(String(html ?? ''))

/** A line's image as the Ajax cart prints it: `url` is the full `https://` address of the dataset, the `alt` the image's, or the product's title when it has none (fixtures `ajax-cart-session` and `ajax-cart-sections`: the dataset's images have none), and the keys' order differs by form. In `{{ cart | json }}` (`liquid`) the address has no protocol and the aspect ratio keeps its point (scenarios `ajax-cart-session`, step 11, `ajax-discount-codes`, `ajax-discount-automatic-bxgy` and `ajax-cart-en-ca`: `"url":"\/\/cdn…"`, `"aspect_ratio":1.0`), where the Ajax answers print `https://` and the number. */
function imageJson (image: ImageDrop | null | undefined, product: LiquidObject, form: LineItemForm): Record<string, unknown> | null {
  if (!image) return null
  // a fresh decimal for each answer, so the answer shares nothing with the built store
  const aspectRatio = image.aspect_ratio ? (form === 'liquid' ? new LiquidFloat(image.aspect_ratio.value) : image.aspect_ratio.value) : null
  const alt = image.alt || product.title
  const rest = { height: image.height, url: lineImageAddress(image, form), width: image.width }
  return form === 'cart' ? { aspect_ratio: aspectRatio, alt, ...rest } : { alt, aspect_ratio: aspectRatio, ...rest }
}

/**
 * A private copy of what the built store hands over: arrays and plain objects are copied all the way down, anything else (a string, a number, `null`) is itself. The answers of `cartJson` and `lineItemJson` are the caller's own, and the store keeps its built variants and selling plans for the next request, so an answer that held one of their arrays or objects (`variant.options`, `variant.quantity_rule`, a plan's `options` and `price_adjustments`) let a caller that changed it change every later answer, `productJson`'s too. Final review B, M1.
 */
function own<T> (value: T): T {
  if (Array.isArray(value)) return value.map(own) as T
  if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, own(entry)])) as T
  }
  return value
}

/** The address of a line's image: the dataset's `https://` address in the Ajax answers, the one without a protocol in `{{ cart | json }}`. */
const lineImageAddress = (image: ImageDrop, form: LineItemForm) => form === 'liquid' ? image.src : image.data.src

/** A line's selling plan allocation as the cart prints it: the allocation's prices and its plan, which `/cart.js` gives a `fixed_selling_plan` (false, the only value recorded) and the other Ajax answers a `checkout_charge`; `{{ cart | json }}` gives neither and ends the allocation with its `checkout_charge_amount` and `remaining_balance_charge_amount` (fixture `ajax-cart-session`: steps 4 and 5, and the `ajax` of step 10). */
function allocationJson (allocation: LiquidObject, form: LineItemForm): Record<string, unknown> {
  const plan = allocation.selling_plan as LiquidObject
  const checkout = plan.checkout_charge as LiquidObject
  return {
    price_adjustments: own(allocation.price_adjustments),
    price: allocation.price,
    compare_at_price: allocation.compare_at_price,
    per_delivery_price: allocation.per_delivery_price,
    selling_plan: {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      options: own(plan.options),
      recurring_deliveries: plan.recurring_deliveries,
      ...(form === 'cart' ? { fixed_selling_plan: false } : {}),
      price_adjustments: (plan.price_adjustments as LiquidObject[]).map(adjustment => ({ order_count: adjustment.order_count, position: adjustment.position, value_type: adjustment.value_type, value: adjustment.value })),
      ...(form === 'change' ? { checkout_charge: { value_type: checkout.value_type, value: checkout.value } } : {})
    },
    ...(form === 'liquid' ? { checkout_charge_amount: allocation.checkout_charge_amount, remaining_balance_charge_amount: allocation.remaining_balance_charge_amount } : {})
  }
}

/** The fields of a line of `/cart.js`, in the order the parity store prints them (fixture `ajax-cart-session`, step 6); `selling_plan_allocation` follows them on a line under a selling plan. */
const CART_LINE_KEYS = [
  'id', 'properties', 'quantity', 'variant_id', 'key', 'title', 'price', 'original_price', 'presentment_price', 'discounted_price', 'line_price', 'original_line_price', 'total_discount', 'discounts', 'sku', 'grams', 'vendor', 'taxable', 'product_id', 'product_has_only_default_variant', 'gift_card', 'final_price', 'final_line_price', 'url', 'featured_image', 'image', 'handle', 'requires_shipping', 'product_type', 'product_title', 'product_description', 'variant_title', 'variant_options', 'options_with_values', 'line_level_discount_allocations', 'line_level_total_discount', 'quantity_rule', 'has_components'
] as const

/** The fields of a line of `{{ cart | json }}`: those of `/cart.js` less `presentment_price`, `quantity_rule` and `has_components` (fixture `ajax-cart-session`, the `ajax` of step 10). */
const LIQUID_LINE_KEYS = CART_LINE_KEYS.filter(key => key !== 'presentment_price' && key !== 'quantity_rule' && key !== 'has_components')

/** The fields of a line in the answers of `add.js`, `change.js` and `update.js`, in the order the parity store prints them (fixture `ajax-cart-session`, step 2). */
const CHANGE_LINE_KEYS = [
  'id', 'properties', 'quantity', 'variant_id', 'key', 'title', 'product_title', 'variant_title', 'price', 'original_price', 'discounted_price', 'line_price', 'original_line_price', 'presentment_price', 'total_discount', 'discounts', 'sku', 'grams', 'vendor', 'taxable', 'product_id', 'product_has_only_default_variant', 'gift_card', 'final_price', 'final_line_price', 'url', 'featured_image', 'image', 'handle', 'requires_shipping', 'product_type', 'untranslated_product_title', 'product_description', 'untranslated_variant_title', 'variant_options', 'options_with_values', 'line_level_discount_allocations', 'line_level_total_discount'
] as const

/**
 * One line of the Ajax cart answers, from a line item of the `cart` object. Field names, order and forms follow the parity store's answers (fixtures `ajax-cart-session`, `ajax-cart-sections` and `ajax-cart-en-ca`): `form` `cart` (the default) is a line of `/cart.js`, `change` a line in the answers of `/cart/add.js`, `/cart/change.js` and `/cart/update.js`, `liquid` a line of `{{ cart | json }}`. `selling_plan_allocation` is present only on a line under a selling plan, `sku` is `null` when empty in `/cart.js` and `{{ cart | json }}` and `''` in the other answers, the `url` of a plan line in `{{ cart | json }}` is the variant's (the line's own `url` names the plan), and `presentment_price` is the price in the currency's major unit.
 */
export function lineItemJson (item: LiquidObject, form: LineItemForm = 'cart'): Record<string, unknown> {
  const product = item.product as LiquidObject
  const variant = item.variant as LiquidObject
  const allocation = item.selling_plan_allocation as LiquidObject | null
  // the Ajax line prints the discounts of all allocations, an order discount's share included, where the Liquid line's final prices leave that share out (fixture `ajax-discount-codes`, step 2: `discounted_price` 9000 and `final_price` 10000 for the same beanie)
  const allocations = item.discount_allocations as LiquidObject[]
  const discount = allocations.reduce((total, entry) => total + (entry.amount as number), 0)
  const linePrice = (item.original_line_price as number) - discount
  const applicationForm = form === 'change' ? 'change' : 'cart'
  const fields: Record<string, unknown> = {
    id: item.id,
    properties: { ...rawPropertiesOf(item) },
    quantity: item.quantity,
    variant_id: item.variant_id,
    key: item.key,
    title: form !== 'change' ? item.title : item.variant_title ? `${item.product_title} - ${item.variant_title}` : item.product_title,
    product_title: item.product_title,
    variant_title: item.variant_title,
    price: item.price,
    original_price: item.original_price,
    presentment_price: (item.price as number) / 100,
    discounted_price: Math.round(linePrice / (item.quantity as number)),
    line_price: linePrice,
    original_line_price: item.original_line_price,
    total_discount: discount,
    discounts: allocations.map(entry => ({ amount: entry.amount, title: (entry.discount_application as LiquidObject).title })),
    sku: form === 'change' ? item.sku : textOrNull(item.sku),
    grams: item.grams,
    vendor: item.vendor,
    taxable: item.taxable,
    product_id: item.product_id,
    product_has_only_default_variant: product.has_only_default_variant,
    gift_card: item.gift_card,
    final_price: item.final_price,
    final_line_price: item.final_line_price,
    url: form === 'liquid' ? variant.url : item.url,
    featured_image: imageJson(item.image as ImageDrop | null, product, form),
    image: item.image ? lineImageAddress(item.image as ImageDrop, form) : null,
    handle: product.handle,
    requires_shipping: item.requires_shipping,
    product_type: product.type,
    untranslated_product_title: item.untranslated_product_title,
    product_description: plainText(product.description),
    untranslated_variant_title: item.variant_title,
    variant_options: own(variant.options),
    options_with_values: own(item.options_with_values),
    line_level_discount_allocations: (item.line_level_discount_allocations as LiquidObject[]).map(entry => discountAllocationJson(entry, applicationForm)),
    line_level_total_discount: item.line_level_total_discount,
    quantity_rule: own(variant.quantity_rule),
    has_components: false
  }
  const line = Object.fromEntries((form === 'cart' ? CART_LINE_KEYS : form === 'liquid' ? LIQUID_LINE_KEYS : CHANGE_LINE_KEYS).map(key => [key, fields[key]]))
  return allocation ? { ...line, selling_plan_allocation: allocationJson(allocation, form) } : line
}

/**
 * The `/cart.js` answer, https://shopify.dev/docs/api/ajax/reference/cart, built from the same cart object a page shows, in `view` (the primary market and language when omitted). `form` is the shape of its lines (`LineItemForm`, less `liquid`): `cart` for `/cart.js`, `change` for the cart in the answers of `add.js`, `change.js` and `update.js`, whose extra fields (`items_added`, `items_removed`, `items_changelog`, `sections`) the storefront adds.
 */
export function cartJson (data: StoreData, state: CartState, view: StoreView = resolveView(data, {}), form: Exclude<LineItemForm, 'liquid'> = 'cart'): Record<string, unknown> {
  const cart = buildCartObject(buildStore(data, view), state)
  const text = rawTextOf(cart)
  return {
    token: cart.token,
    note: text.note,
    attributes: { ...text.attributes },
    original_total_price: cart.original_total_price,
    total_price: cart.total_price,
    total_discount: cart.total_discount,
    total_weight: (cart.total_weight as LiquidFloat).value,
    item_count: cart.item_count,
    items: (cart.items as LiquidObject[]).map(item => lineItemJson(item, form)),
    requires_shipping: cart.requires_shipping,
    currency: (cart.currency as LiquidObject).iso_code,
    items_subtotal_price: cart.items_subtotal_price,
    // `/cart.js` lists the applications as they are; the answers of add, change and update wrap each in its amount (fixture `ajax-discount-codes`, steps 1 and 8)
    cart_level_discount_applications: (cart.cart_level_discount_applications as LiquidObject[]).map(application => form === 'change' ? { amount: application.total_allocated_amount, discount_application: discountApplicationJson(application, 'change') } : discountApplicationJson(application, 'cart')),
    // the Cart API prints the list last (fixture `ajax-cart-session`, step 1)
    discount_codes: codeStatus(cart)
  }
}

/** Each entered code of a built cart with whether it applies: the codes that apply first and then the rejected ones, whatever order they were entered in (fixture `ajax-discount-codes`, step 8: `FREESHIP,WELCOME10` answers `WELCOME10` and then `FREESHIP`). */
export function codeStatus (cart: LiquidObject): Array<{ code: string, applicable: boolean }> {
  const rejected = new Set((cart[DISCOUNTS_FIELD] as DiscountResult).rejectedCodes.map(code => code.toLowerCase()))
  const codes = enteredCodes(cart[CODES_FIELD] as string[]).map(code => ({ code, applicable: !rejected.has(code.toLowerCase()) }))
  return [...codes.filter(entry => entry.applicable), ...codes.filter(entry => !entry.applicable)]
}

/**
 * The `discount_codes` of the Cart API's answers, https://shopify.dev/docs/api/ajax/reference/cart: each code of the cart with whether it applies to it. A code applies when it is a discount of the store that the cart qualifies for and that combines with the discounts Shopify picks for it (`applyDiscounts`); none does once the cart is empty (fixture `ajax-discount-codes`, step 14: `clear.js` keeps the codes). A code is read in any case and is answered as it was entered.
 */
export function discountCodeStatus (data: StoreData, state: CartState, view: StoreView = resolveView(data, {})): Array<{ code: string, applicable: boolean }> {
  return codeStatus(buildCartObject(buildStore(data, view), state))
}

/**
 * What `{{ cart | json }}` prints for a built cart, as the parity store prints it (fixtures `ajax-cart-session`, step 10, and `ajax-cart-en-ca`, step 3: the `ajax` of the cart probe), which is neither the engine's cart object nor `/cart.js`: no `token` or `discount_codes` and a `checkout_charge_amount` last, lines of the `liquid` form (`lineItemJson`), and a line's `properties` as an object, where the line's own `properties | json` prints pairs. `cart_level_discount_applications` are the applications in the form of `/cart.js` (fixture `ajax-discount-codes`, the `ajax` of step 2).
 */
export function cartLiquidJson (cart: LiquidObject): Record<string, unknown> {
  const text = rawTextOf(cart)
  return {
    note: text.note,
    attributes: { ...text.attributes },
    original_total_price: cart.original_total_price,
    total_price: cart.total_price,
    total_discount: cart.total_discount,
    total_weight: new LiquidFloat((cart.total_weight as LiquidFloat).value),
    item_count: cart.item_count,
    items: (cart.items as LiquidObject[]).map(item => lineItemJson(item, 'liquid')),
    requires_shipping: cart.requires_shipping,
    currency: (cart.currency as LiquidObject).iso_code,
    items_subtotal_price: cart.items_subtotal_price,
    cart_level_discount_applications: (cart.cart_level_discount_applications as LiquidObject[]).map(application => discountApplicationJson(application, 'cart')),
    checkout_charge_amount: cart.checkout_charge_amount
  }
}
