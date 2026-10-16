import { findVariant, lineKey, stockFor } from '../shopify'
import type { CartLineState, ProductData, StoreData, VariantData } from '../shopify'
import { UNSAFE } from './body'
import type { Fields } from './body'
import type { StorefrontLimits, VisitorState } from './types'

export interface CartError { status: number, body: Record<string, unknown> }
type Failure = { ok: false, error: CartError }
export type CartResult = { ok: true, state: VisitorState, lines: CartLineState[] } | Failure

/** Where Shopify puts a new line: first, as the parity store shows (fixture `ajax-cart-session`: the slides added at step 4 are the first line of `cart.js` at step 5, and one `add.js` call with several items lists them in reverse, fixture `ajax-discount-codes`, steps 0 and 1). */
export const NEW_LINES_FIRST = true

const VARIANT_ID = /^\d+$/
const LINE_KEY = /^\d+:[a-f0-9]{32}$/

const fail = (status: number, description: string, message = 'Cart Error'): Failure => ({ ok: false, error: { status, body: { status, message, description } } })
/** An error whose body names its status as a word (fixture `ajax-cart-errors`, steps 4 and 8). */
const failWord = (status: number, word: string, description: string, message = description): Failure => ({ ok: false, error: { status, body: { status: word, message, description } } })
const failed = (value: object): value is Failure => 'ok' in value

/**
 * The statuses and texts of Shopify's cart errors (https://shopify.dev/docs/api/ajax/reference/cart), word for word as the parity store answers them where a fixture records them (`ajax-cart-errors`): `status` is the number 422 and `message` repeats the description, except where `message` is `Cart Error`, or `status` is a word (`unprocessable_entity`, `bad_request`). `cantAddMore` is shopify.dev's text for an add when the cart already holds all the stock ("You can't add more #{item.name} to the cart.", status 422, message `Cart Error`), `badPlan` the text merchants report from the live Cart API for a selling plan the variant lacks (`{"status":422,"message":"Cart Error","description":"Cannot apply selling plan to variant"}`: https://community.shopify.com/t/status-422-message-cart-error-description-cannot-apply-selling-plan-to-variant/229194, https://community.shopify.com/t/cannot-apply-selling-plan-to-variant/88766, https://community.shopify.com/t/cart-error-cannot-apply-selling-plan-to-variant/57624), and `noLine` shopify.dev's 400 for a change that names no line of the cart ("no valid id or line parameter"); none of the three is in a recording. `limit` is the storefront's own limit, at 422 with a text of its own.
 */
export const CART_ERRORS = {
  soldOut: (name: string) => fail(422, `The product '${name}' is already sold out.`, `The product '${name}' is already sold out.`),
  tooMany: (left: number) => {
    // the plural is the only recorded form (fixture `ajax-cart-errors`, step 1); the singular for one unit is this storefront's own text, no recording or page gives it
    const description = left === 1 ? 'Only 1 item was added to your cart due to availability.' : `Only ${left} items were added to your cart due to availability.`
    return fail(422, description, description)
  },
  cantAddMore: (name: string) => fail(422, `You can't add more ${name} to the cart.`),
  notFound: () => fail(422, 'Cannot find variant'),
  badPlan: () => fail(422, 'Cannot apply selling plan to variant'),
  needsPlan: () => fail(422, 'Variant can only be purchased with a selling plan.'),
  badLine: () => failWord(422, 'unprocessable_entity', 'line parameter is invalid.'),
  badId: () => failWord(400, 'bad_request', 'expected Integer to be a (?-mix:(?-mix:\\A\\d+\\z)|(?-mix:\\A\\d+:[a-f0-9]{32}\\z)): id'),
  noLine: () => failWord(400, 'bad_request', 'no valid id or line parameter'),
  limit: (description: string) => fail(422, description)
}

const quantityRange = (min: number, max: number) => CART_ERRORS.limit(`The quantity must be a whole number from ${min} to ${max}.`)
const linesLimit = (max: number) => CART_ERRORS.limit(`The cart can hold at most ${max} lines.`)
const lineFull = (max: number) => CART_ERRORS.limit(`A line can hold at most ${max} items.`)

/** A cart nobody has changed has the note `null`; after its first change it is `""` (fixture `ajax-cart-session`: `null` at step 0, `""` from the first add on; `ajax-cart-en-ca`, steps 0 and 2). */
const changed = (state: VisitorState): VisitorState => ({ ...state, cart: { ...state.cart, note: state.cart.note ?? '' } })

const isFields = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value)
const absent = (value: unknown) => value === undefined || value === null || value === ''
/** A field's text; numbers and booleans are written out (a form sends strings, a JSON body may not). */
const text = (value: unknown): string | undefined => typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : undefined
/** A whole number from a JSON number or a string of digits (every form field is a string); undefined for anything else. */
function whole (value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^-?\d+$/.test(value.trim()) ? Number(value) : NaN
  return Number.isSafeInteger(n) ? n : undefined
}
/** A quantity field: the fallback when it is absent, undefined when it is there and is not a whole number. */
const quantityOf = (value: unknown, fallback: number) => absent(value) ? fallback : whole(value)

const title = (product: ProductData, variant: VariantData) => variant.title === 'Default Title' ? product.title : `${product.title} - ${variant.title}`

/** Whether the product sells `variant` under the selling plan `planId`: through a group that offers the variant (a group offers every variant of its product unless it lists some, as the engine builds `selling_plan_allocations`). https://shopify.dev/docs/api/liquid/objects/selling_plan_group */
const offersPlan = (product: ProductData, variant: VariantData, planId: number) => (product.selling_plan_groups ?? []).some(group => (!group.variant_ids || group.variant_ids.includes(variant.id)) && group.selling_plans.some(plan => plan.id === planId))

/** A line's properties as strings, in the limits; values that are not text (an object, a file field) are dropped, and so are names that could reach a prototype (the ones the body parsers drop too). The names are counted before any value is read, so a body-sized object is refused at once. The result is wrapped, so a property named `ok` or `value` cannot pass for a failure. */
function propertiesOf (value: unknown, limits: StorefrontLimits): { value: Record<string, string> } | Failure {
  const out: Record<string, string> = {}
  if (!isFields(value)) return { value: out }
  const names = Object.keys(value)
  if (names.length > limits.properties) return CART_ERRORS.limit(`A line can have at most ${limits.properties} properties.`)
  for (const name of names) {
    const entry = text(value[name])
    if (entry === undefined || UNSAFE.has(name)) continue
    if (name.length > limits.propertyLength || entry.length > limits.propertyLength) return CART_ERRORS.limit(`A line item property can be at most ${limits.propertyLength} characters.`)
    out[name] = entry
  }
  return { value: out }
}

/**
 * One line to hold, checked against the store: the variant exists, the quantity is within the storefront's limits, a selling plan is one the variant is sold under (and is there when the product requires one), and, when `checkStock` is set, the stock covers it. `inCart` is how many of the variant the cart holds in other lines. A variant that is sold out is "already sold out", one whose stock the cart already holds in full is "You can't add more", and a quantity over what is left is "Only N items were added" (fixture `ajax-cart-errors`, steps 0 and 1, records the 422 and its text; whether the cart keeps the units that fit is unrecorded, and shopify.dev says it adds the maximum, so this storefront's own choice is to add nothing).
 */
function lineFor (item: Fields, data: StoreData, limits: StorefrontLimits, inCart: number, checkStock: boolean): CartLineState | Failure {
  const id = whole(item.id)
  const found = id === undefined ? null : findVariant(data, id)
  if (!found) return CART_ERRORS.notFound()
  const { product, variant } = found
  const quantity = quantityOf(item.quantity, 1)
  if (quantity === undefined || quantity < 1 || quantity > limits.quantity) return quantityRange(1, limits.quantity)
  const plan = absent(item.selling_plan) ? null : whole(item.selling_plan)
  if (plan === undefined || (plan !== null && !offersPlan(product, variant, plan))) return CART_ERRORS.badPlan()
  if (plan === null && product.requires_selling_plan) return CART_ERRORS.needsPlan()
  const stock = checkStock ? stockFor(variant) : null
  if (stock !== null) {
    const left = stock - inCart
    if (stock === 0) return CART_ERRORS.soldOut(title(product, variant))
    if (left <= 0) return CART_ERRORS.cantAddMore(title(product, variant))
    if (quantity > left) return CART_ERRORS.tooMany(left)
  }
  const properties = propertiesOf(item.properties, limits)
  if (!('value' in properties)) return properties
  return { variantId: variant.id, quantity, properties: properties.value, sellingPlanId: plan }
}

const inCartOf = (lines: CartLineState[], variantId: number) => lines.reduce((total, line) => line.variantId === variantId ? total + line.quantity : total, 0)

/** `/cart/add.js` and `/cart/add`: `items: [...]` or one item's `id`, `quantity` (1 when absent), `properties` and `selling_plan` (https://shopify.dev/docs/api/ajax/reference/cart#post-locale-cart-add-js). Lines of the same variant, properties and selling plan merge: "if the same items have differing prices, properties, or selling plans, then they'll be split into their own line items" (fixture `ajax-cart-session`, steps 1 to 3). All items are added or none is; `lines` are the lines the items reached, in the order of the request, each as it stood after its item. */
export function addToCart (state: VisitorState, fields: Fields, data: StoreData, limits: StorefrontLimits): CartResult {
  const items = Array.isArray(fields.items) ? fields.items as unknown[] : [fields]
  if (items.length === 0) return CART_ERRORS.notFound()
  if (items.length > limits.lines) return CART_ERRORS.limit(`A request can add at most ${limits.lines} items.`)
  const lines = [...state.cart.lines]
  const keys = lines.map(lineKey)
  const touched: CartLineState[] = []
  for (const raw of items) {
    const item = isFields(raw) ? raw : {}
    const id = whole(item.id)
    const line = lineFor(item, data, limits, id === undefined ? 0 : inCartOf(lines, id), true)
    if (failed(line)) return line
    const key = lineKey(line)
    const at = keys.indexOf(key)
    if (at >= 0) {
      const quantity = lines[at].quantity + line.quantity
      if (quantity > limits.quantity) return lineFull(limits.quantity)
      lines[at] = { ...lines[at], quantity }
      touched.push(lines[at])
      continue
    }
    if (lines.length >= limits.lines) return linesLimit(limits.lines)
    if (NEW_LINES_FIRST) {
      lines.unshift(line)
      keys.unshift(key)
    } else {
      lines.push(line)
      keys.push(key)
    }
    touched.push(line)
  }
  return { ok: true, state: changed({ ...state, cart: { ...state.cart, lines } }), lines: touched }
}

/**
 * The indexes of the lines `change.js` names, https://shopify.dev/docs/api/ajax/reference/cart#post-locale-cart-change-js: `line` (1-based; out of range is a 422, fixture `ajax-cart-errors`, step 4), or `id`, a line key (one line) or a variant id as a string (every line of that variant, as the parity store sets them, fixture `ajax-cart-session`, step 7; shopify.dev says "you can change only one line item at a time", and the fixture wins). An `id` that is a JSON number is a 400 with the recorded type error (fixture `ajax-cart-errors`, step 8); the same answer stands for a list, an object or a boolean, which no recording reaches. An `id` that names no line, no `id` or `line` at all, and a string that is neither a variant id nor a key (a guess: no recording reaches it, and this is the documented text that says "no valid id") is the 400 "no valid id or line parameter" shopify.dev documents ("If the item that you're attempting to change isn't already in the cart, then change.js doesn't add it").
 */
function lineIndexes (lines: CartLineState[], fields: Fields): number[] | Failure {
  if (!absent(fields.line)) {
    const n = whole(fields.line)
    return n !== undefined && n >= 1 && n <= lines.length ? [n - 1] : CART_ERRORS.badLine()
  }
  if (absent(fields.id)) return CART_ERRORS.noLine()
  const id = fields.id
  if (typeof id !== 'string') return CART_ERRORS.badId()
  if (!VARIANT_ID.test(id) && !LINE_KEY.test(id)) return CART_ERRORS.noLine()
  const byKey = LINE_KEY.test(id)
  const at = lines.flatMap((line, i) => (byKey ? lineKey(line) === id : line.variantId === Number(id)) ? [i] : [])
  return at.length > 0 ? at : CART_ERRORS.noLine()
}

/** Lines with one key become one line (the first position, the quantities added): a change of properties or selling plan can make a line the same as another, and a line is its key (https://shopify.dev/docs/api/ajax/reference/cart: "Items with different prices, properties, or selling plans become separate lines"). */
function mergeLines (lines: CartLineState[], limits: StorefrontLimits): CartLineState[] | Failure {
  const seen = new Map<string, number>()
  const merged: CartLineState[] = []
  for (const line of lines) {
    const key = lineKey(line)
    const at = seen.get(key)
    if (at === undefined) {
      seen.set(key, merged.length)
      merged.push(line)
      continue
    }
    const quantity = merged[at].quantity + line.quantity
    if (quantity > limits.quantity) return lineFull(limits.quantity)
    merged[at] = { ...merged[at], quantity }
  }
  return merged
}

/**
 * Sets the quantity of each line `fields` names (`lineIndexes`; 0 removes it), and its properties or selling plan when given. "Whenever a POST request includes properties, it overwrites the entire properties object" but "it's not possible to set a line item's properties property to an empty object once a value is set", so an empty object leaves them; a selling plan of `null` or an empty string removes the plan, and a change of selling plan without a quantity sets 1 ("If the quantity isn't specified, then it's assumed to be 1"), all https://shopify.dev/docs/api/ajax/reference/cart#post-locale-cart-change-js. Nothing changes when one line fails. `checkStock` is off for `update.js`, which "doesn't validate the quantity on variants that are already in the cart" (https://shopify.dev/docs/api/ajax/reference/cart#post-locale-cart-update-js); that can leave a line above its stock, so `change.js` checks the stock of a line only when it raises the quantity, and a change that lowers it, keeps it or only edits the line always works.
 */
function setLines (state: VisitorState, fields: Fields, data: StoreData, limits: StorefrontLimits, checkStock: boolean): CartResult {
  const named = lineIndexes(state.cart.lines, fields)
  if (failed(named)) return named
  const targets = new Set(named)
  const others = state.cart.lines.filter((_, i) => !targets.has(i))
  const properties = isFields(fields.properties) && Object.keys(fields.properties).length > 0 ? fields.properties : undefined
  const planGiven = fields.selling_plan !== undefined
  const lines: CartLineState[] = []
  const touched: CartLineState[] = []
  for (const [i, current] of state.cart.lines.entries()) {
    if (!targets.has(i)) {
      lines.push(current)
      continue
    }
    const quantity = quantityOf(fields.quantity, planGiven ? 1 : current.quantity)
    if (quantity === undefined || quantity < 0 || quantity > limits.quantity) return quantityRange(0, limits.quantity)
    if (quantity === 0) continue
    const inCart = inCartOf(others, current.variantId) + inCartOf(touched, current.variantId)
    const line = lineFor({ id: current.variantId, quantity, properties: properties ?? current.properties, selling_plan: planGiven ? fields.selling_plan : current.sellingPlanId }, data, limits, inCart, checkStock && quantity > current.quantity)
    if (failed(line)) return line
    lines.push(line)
    touched.push(line)
  }
  const result = properties || planGiven ? mergeLines(lines, limits) : lines
  if (failed(result)) return result
  return { ok: true, state: changed({ ...state, cart: { ...state.cart, lines: result } }), lines: touched }
}

/** `/cart/change.js` and `/cart/change`: sets the quantity of the line or lines `lineIndexes` names (0 removes), and its properties or selling plan when given. https://shopify.dev/docs/api/ajax/reference/cart#post-locale-cart-change-js */
export function changeCart (state: VisitorState, fields: Fields, data: StoreData, limits: StorefrontLimits): CartResult {
  return setLines(state, fields, data, limits, true)
}

/** The index of the line an `updates` key names: a line key, or a variant id, which names "the first matching line item" (https://shopify.dev/docs/api/ajax/reference/cart#post-locale-cart-update-js), where `change.js` was recorded to set every line of the variant. */
function updateIndex (lines: CartLineState[], id: string): number {
  if (LINE_KEY.test(id)) return lines.findIndex(line => lineKey(line) === id)
  return VARIANT_ID.test(id) ? lines.findIndex(line => line.variantId === Number(id)) : -1
}

/**
 * `/cart/update.js` and `POST /cart`: `updates` as an object of quantities by variant id or line key (0 removes; a variant that is not in the cart is added as a new line, fixture `ajax-cart-session`, step 8, and one the store lacks is a 422 "Cannot find variant", where shopify.dev says 404, fixture `ajax-cart-errors`, step 5), or as an array of quantities by position (fixture `ajax-cart-session`, step 9; a position past the last line is a 422), then `note`, `attributes` (an empty value removes one, which shopify.dev does not say) and `discount` (comma-separated codes that replace the cart's; an empty string removes them all). https://shopify.dev/docs/api/ajax/reference/cart#post-locale-cart-update-js. Nothing changes when one part fails. The storefront bounds what a cart can hold: at most `limits.properties` attributes and discount codes, with names and codes of at most `limits.propertyLength` characters.
 */
export function updateCart (state: VisitorState, fields: Fields, data: StoreData, limits: StorefrontLimits): CartResult {
  let current = state
  const updates = fields.updates
  if (Array.isArray(updates)) {
    for (let i = updates.length - 1; i >= 0; i--) {
      const result = setLines(current, { line: i + 1, quantity: updates[i] }, data, limits, false)
      if (!result.ok) return result
      current = result.state
    }
  } else if (isFields(updates)) {
    const entries = Object.entries(updates)
    if (entries.length > limits.lines) return CART_ERRORS.limit(`A request can update at most ${limits.lines} lines.`)
    for (const [id, raw] of entries) {
      if (absent(raw)) continue
      const at = updateIndex(current.cart.lines, id)
      const quantity = whole(raw)
      if (quantity === undefined || quantity < 0 || quantity > limits.quantity) return quantityRange(0, limits.quantity)
      if (at < 0 && quantity === 0) continue
      const result = at >= 0 ? setLines(current, { line: at + 1, quantity }, data, limits, false) : addToCart(current, { id, quantity }, data, limits)
      if (!result.ok) return result
      current = result.state
    }
  }
  const cart = { ...current.cart }
  if (fields.note !== undefined) {
    const note = fields.note === null ? '' : text(fields.note)
    if (note !== undefined) cart.note = note
  }
  if (isFields(fields.attributes)) {
    const attributes = { ...cart.attributes }
    // a request can usefully name the attributes the cart holds (to change or remove) and as many more as it can still take; the names are counted before any value is read
    const names = Object.keys(fields.attributes)
    const room = Object.keys(attributes).length + limits.properties
    if (names.length > room) return CART_ERRORS.limit(`A request can name at most ${room} attributes.`)
    for (const name of names) {
      const raw = fields.attributes[name]
      const value = raw === null ? '' : text(raw)
      if (value === undefined || UNSAFE.has(name)) continue
      if (value === '') {
        delete attributes[name]
        continue
      }
      if (name.length > limits.propertyLength) return CART_ERRORS.limit(`A cart attribute name can be at most ${limits.propertyLength} characters.`)
      attributes[name] = value
    }
    if (Object.keys(attributes).length > limits.properties) return CART_ERRORS.limit(`The cart can have at most ${limits.properties} attributes.`)
    cart.attributes = attributes
  }
  const discount = fields.discount === null ? '' : text(fields.discount)
  if (discount !== undefined) {
    const codes = discount.split(',').map(code => code.trim()).filter(code => code !== '')
    if (codes.length > limits.properties || codes.some(code => code.length > limits.propertyLength)) return CART_ERRORS.limit(`The cart can have at most ${limits.properties} discount codes of ${limits.propertyLength} characters.`)
    cart.discountCodes = codes
  }
  return { ok: true, state: changed({ ...current, cart }), lines: [] }
}

/** Empties the cart's lines; the note, attributes and discount codes stay, as shopify.dev says ("This does not remove cart attributes or the cart note") and the parity store keeps them (fixture `ajax-cart-session`, steps 11 and 12; `ajax-discount-codes`, step 14). https://shopify.dev/docs/api/ajax/reference/cart#post-locale-cart-clear-js */
export function clearCart (state: VisitorState): CartResult {
  return { ok: true, state: changed({ ...state, cart: { ...state.cart, lines: [] } }), lines: [] }
}
