import { createHash } from 'crypto'
import { strip_html } from '../../filters/html'
import { HandleMap } from '../objects/handle-map'
import type { ImageDrop } from '../objects/image'
import { buildStore, hidden } from './build'
import type { LiquidObject, StoreObjects } from './build'
import type { CartData, ProductData, StoreData, VariantData } from './types'
import { resolveView, withPrefix } from './view'
import type { StoreView } from './view'

/** The hidden field that marks a cart built by `buildCartObject` for the `json` filter. */
const CART_MARKER = '__cart'

/** Whether `value` is a cart built by `buildCartObject`. */
export const isBuiltCart = (value: unknown): value is LiquidObject => typeof value === 'object' && value !== null && (value as LiquidObject)[CART_MARKER] === true

/** One line of a visitor's cart: a variant, how many of it, its line item properties and the selling plan it is bought under. */
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

/** How many of a variant can be sold: unlimited (null) when Shopify does not track its stock or sells past zero. https://shopify.dev/docs/api/liquid/objects/variant#variant-inventory_policy ("continue" sells when the stock is out) and #variant-inventory_management. A tracked variant whose data gives no quantity counts as the variant object does (`inventory_quantity`: one when it is available, none when it is not). */
export function stockFor (variant: VariantData): number | null {
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

/** Line item properties as a template reads them: by name (`item.properties.Engraving`) and as pairs (`for property in item.properties`), and printed by `json` as the parity store prints them, a list of `[name, value]` pairs (`[]` for none, fixture `ajax-cart-session`, step 11). */
function propertiesOf (properties: Record<string, string>): Record<string, string> {
  const copy = { ...properties }
  Object.defineProperty(copy, 'toJSON', { value: () => Object.entries(properties), enumerable: false })
  return copy
}

/**
 * One line item, https://shopify.dev/docs/api/liquid/objects/line_item, for a line of the cart, in the view's currency (the built variant is). `index` (0-based) is not a property of that page, but themes read it as a row number (`item.index | plus: 1`); the page does not pin its base. A line under a selling plan carries the plan's allocation and its price, and its `url` names the plan (`?selling_plan=71001&variant=43695710371862`, fixture `ajax-cart-session`); `original_price` is that price too, as the parity store prints it. `url_to_remove` is the cart change address of the line's key, under the view's prefix (fixtures `ajax-cart-session` and `ajax-cart-en-ca`). No discounts are applied here.
 */
function lineItem (store: StoreObjects, state: CartLineState, index: number): LiquidObject | null {
  const found = builtVariant(store, state.variantId)
  if (!found) return null
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
    title: defaultTitle ? product.title : `${product.title} - ${variant.title}`,
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
    gift_card: false,
    options_with_values: (product.options as string[]).map((name, i) => ({ name, value: (variant.options as string[])[i] ?? null })),
    unit_price_measurement: null
  }
  hidden(item, 'untranslated_product_title', untranslatedTitle)
  return item
}

/**
 * The `cart` object for a cart state, https://shopify.dev/docs/api/liquid/objects/cart, in the store's view (its prices, language and prefix). Lines naming a variant the store does not have are left out. `token` is nil for a cart without one (`cartStateOf`). Totals add the lines' prices, `total_weight` their weight in grams times the quantity, and `requires_shipping` is true while a line requires it. No discounts are applied yet, so `total_discount` is 0 and the discount lists are empty.
 */
export function buildCartObject (store: StoreObjects, state: CartState): LiquidObject {
  const items: LiquidObject[] = []
  for (const entry of state.lines) {
    const item = lineItem(store, entry, items.length)
    if (item) items.push(item)
  }
  const subtotal = items.reduce((sum, item) => sum + (item.final_line_price as number), 0)
  const cart: LiquidObject = {
    token: state.token || null,
    items,
    item_count: items.reduce((sum, item) => sum + (item.quantity as number), 0),
    items_subtotal_price: subtotal,
    original_total_price: items.reduce((sum, item) => sum + (item.original_line_price as number), 0),
    total_price: subtotal,
    checkout_charge_amount: subtotal,
    total_discount: 0,
    total_weight: items.reduce((sum, item) => sum + ((item.variant as LiquidObject).weight as number) * (item.quantity as number), 0),
    currency: { iso_code: store.currency.iso_code },
    note: state.note,
    attributes: state.attributes,
    requires_shipping: items.some(item => item.requires_shipping),
    cart_level_discount_applications: [],
    discount_applications: [],
    taxes_included: false,
    duties_included: false,
    'empty?': items.length === 0
  }
  hidden(cart, CART_MARKER, true)
  return cart
}

/** The text of a field the Ajax API writes as `null` when it is empty (a variant's `sku`), as the parity store does (fixture `ajax-cart-session`). */
const textOrNull = (text: unknown) => text === '' || text === undefined || text === null ? null : text

const noMemoryLimit = { context: { memoryLimit: { use: () => undefined } } } as unknown as ThisParameterType<typeof strip_html>

/** A product's description as the Ajax cart prints it: the text without its tags (`<p>` is gone in fixture `ajax-cart-session`, whose products' descriptions are paragraphs). */
const plainText = (html: unknown) => strip_html.call(noMemoryLimit, String(html ?? ''))

/** A line's image as the Ajax cart prints it: `url` is the full `https://` address of the dataset, the `alt` the image's, or the product's title when it has none (fixtures `ajax-cart-session` and `ajax-cart-sections`: the dataset's images have none), and the keys' order differs by form. */
function imageJson (image: ImageDrop | null | undefined, product: LiquidObject, form: LineItemForm): Record<string, unknown> | null {
  if (!image) return null
  const aspectRatio = image.aspect_ratio ? image.aspect_ratio.value : null
  const alt = image.alt || product.title
  const rest = { height: image.height, url: String(image.src), width: image.width }
  return form === 'cart' ? { aspect_ratio: aspectRatio, alt, ...rest } : { alt, aspect_ratio: aspectRatio, ...rest }
}

/** A line's selling plan allocation as the cart prints it: the allocation's prices and its plan, which `/cart.js` gives a `fixed_selling_plan` (false, the only value recorded) and the other Ajax answers a `checkout_charge`; `{{ cart | json }}` gives neither and ends the allocation with its `checkout_charge_amount` and `remaining_balance_charge_amount` (fixture `ajax-cart-session`: steps 4 and 5, and the `ajax` of step 10). */
function allocationJson (allocation: LiquidObject, form: LineItemForm): Record<string, unknown> {
  const plan = allocation.selling_plan as LiquidObject
  const checkout = plan.checkout_charge as LiquidObject
  return {
    price_adjustments: allocation.price_adjustments,
    price: allocation.price,
    compare_at_price: allocation.compare_at_price,
    per_delivery_price: allocation.per_delivery_price,
    selling_plan: {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      options: plan.options,
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
  const fields: Record<string, unknown> = {
    id: item.id,
    properties: { ...(item.properties as Record<string, string>) },
    quantity: item.quantity,
    variant_id: item.variant_id,
    key: item.key,
    title: item.title,
    product_title: item.product_title,
    variant_title: item.variant_title,
    price: item.price,
    original_price: item.original_price,
    presentment_price: (item.price as number) / 100,
    discounted_price: item.final_price,
    line_price: item.line_price,
    original_line_price: item.original_line_price,
    total_discount: item.total_discount,
    discounts: [],
    sku: form === 'change' ? item.sku : textOrNull(item.sku),
    grams: variant.weight,
    vendor: item.vendor,
    taxable: variant.taxable,
    product_id: item.product_id,
    product_has_only_default_variant: product.has_only_default_variant,
    gift_card: item.gift_card,
    final_price: item.final_price,
    final_line_price: item.final_line_price,
    url: form === 'liquid' ? variant.url : item.url,
    featured_image: imageJson(item.image as ImageDrop | null, product, form),
    image: item.image ? String((item.image as ImageDrop).src) : null,
    handle: product.handle,
    requires_shipping: item.requires_shipping,
    product_type: product.type,
    untranslated_product_title: item.untranslated_product_title,
    product_description: plainText(product.description),
    untranslated_variant_title: item.variant_title,
    variant_options: variant.options,
    options_with_values: item.options_with_values,
    line_level_discount_allocations: item.line_level_discount_allocations,
    line_level_total_discount: item.line_level_total_discount,
    quantity_rule: variant.quantity_rule,
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
  return {
    token: cart.token,
    note: cart.note,
    attributes: cart.attributes,
    original_total_price: cart.original_total_price,
    total_price: cart.total_price,
    total_discount: cart.total_discount,
    total_weight: cart.total_weight,
    item_count: cart.item_count,
    items: (cart.items as LiquidObject[]).map(item => lineItemJson(item, form)),
    requires_shipping: cart.requires_shipping,
    currency: (cart.currency as LiquidObject).iso_code,
    items_subtotal_price: cart.items_subtotal_price,
    cart_level_discount_applications: cart.cart_level_discount_applications,
    // the Cart API prints the list last (fixture `ajax-cart-session`, step 1: `[]`); the discount codes of Task 14 fill it
    discount_codes: []
  }
}

/**
 * What `{{ cart | json }}` prints for a built cart, as the parity store prints it (fixtures `ajax-cart-session`, step 10, and `ajax-cart-en-ca`, step 3: the `ajax` of the cart probe), which is neither the engine's cart object nor `/cart.js`: no `token` or `discount_codes` and a `checkout_charge_amount` last, lines of the `liquid` form (`lineItemJson`), and a line's `properties` as an object, where the line's own `properties | json` prints pairs. `cart_level_discount_applications` is the cart object's list as it is.
 */
export function cartLiquidJson (cart: LiquidObject): Record<string, unknown> {
  return {
    note: cart.note,
    attributes: cart.attributes,
    original_total_price: cart.original_total_price,
    total_price: cart.total_price,
    total_discount: cart.total_discount,
    total_weight: cart.total_weight,
    item_count: cart.item_count,
    items: (cart.items as LiquidObject[]).map(item => lineItemJson(item, 'liquid')),
    requires_shipping: cart.requires_shipping,
    currency: (cart.currency as LiquidObject).iso_code,
    items_subtotal_price: cart.items_subtotal_price,
    cart_level_discount_applications: cart.cart_level_discount_applications,
    checkout_charge_amount: cart.checkout_charge_amount
  }
}
