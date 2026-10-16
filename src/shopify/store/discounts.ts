import { createHash } from 'crypto'
import type { LiquidObject } from './build'
import type { ViewCurrency } from './markets'
import { convert } from './pricing'
import type { AmountOffProductsDiscountData, BuyXGetYDiscountData, DiscountData, DiscountItemsData } from './types'

/** What the discounts need to know besides the lines: the products of each collection (collection handle to product handles), the currency amounts are held in, and the country a shipping address names when it is known. */
export interface DiscountContext {
  collections: Map<string, Set<string>>
  currency: ViewCurrency
  shippingCountry?: string
}

/** One line of the cart once the discounts are in: the line item it comes from, how many of its units this line holds (a Buy X Get Y that discounts some units of a line splits it in two), and the discount allocations on it, those of the discounts that touch only some lines first. */
export interface DiscountedLine {
  item: LiquidObject
  units: number
  allocations: LiquidObject[]
}

export interface DiscountResult {
  /** The applications of the discounts that apply to the lines, product discounts first and then order discounts, in the order Shopify calculates them. A free shipping discount is in `freeShipping`, not here: the cart has no shipping line to show it on. */
  applications: LiquidObject[]
  /** The order discounts among `applications` (`target_selection` `all`), which `cart.cart_level_discount_applications` lists. */
  cartLevel: LiquidObject[]
  /** The cart's lines in order, split where a Buy X Get Y discounts only some of a line's units. */
  lines: DiscountedLine[]
  /** The codes that were entered and do not apply, as they were entered. */
  rejectedCodes: string[]
  /** `maxPrice` is the dearest rate the discount makes free, in the view's currency, when the discount has a limit. */
  freeShipping: { applies: boolean, discount: LiquidObject | null, maxPrice?: number }
}

type DiscountClass = 'product' | 'order' | 'shipping'

/** A line, or the part of one that a Buy X Get Y has set apart: `price` is what is left of it after the discounts so far. */
interface Piece {
  item: LiquidObject
  units: number
  price: number
  /** `price` when the order discounts begin: percentages of an order discount are of this, whatever other order discounts have taken (https://help.shopify.com/en/manual/discounts/discount-combinations: "calculated on the original subtotal"). */
  orderBase: number
  allocations: LiquidObject[]
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

/** The class a discount belongs to: Buy X Get Y and amount off products are product discounts. https://help.shopify.com/en/manual/discounts/discount-combinations */
const classOf = (discount: DiscountData): DiscountClass => discount.type === 'amount_off_order' ? 'order' : discount.type === 'free_shipping' ? 'shipping' : 'product'

/** Two discounts combine only when each allows the other's class: "Multiple discounts are applied to an order only when the setting on each discount allows the combination." https://help.shopify.com/en/manual/discounts/discount-combinations */
const combines = (a: DiscountData, b: DiscountData) => a.combines_with?.[classOf(b)] === true && b.combines_with?.[classOf(a)] === true

/** An amount of the discount's data (the shop currency's minor unit) in the view's currency: converted at the market's rate like a price, but not rounded up to the market's rounding value, as a selling plan's fixed amount is (`planAmount`). No fixture records a discount amount in another currency, so this follows the selling plan precedent (fixture `probe-product-en-eu`). */
const money = (amount: number, ctx: DiscountContext) => Math.round(convert(amount, { ...ctx.currency, rounding: false }))

const productHandle = (item: LiquidObject) => String((item.product as LiquidObject).handle)

function inItems (item: LiquidObject, items: DiscountItemsData, ctx: DiscountContext): boolean {
  if ('all' in items) return true
  const handle = productHandle(item)
  return (items.products ?? []).includes(handle) || (items.collections ?? []).some(collection => ctx.collections.get(collection)?.has(handle))
}

/** The codes of a cart as they were entered, without blanks or repeats (a code is read in any case). */
export function enteredCodes (codes: string[]): string[] {
  const seen = new Set<string>()
  return codes.map(code => code.trim()).filter(code => {
    const key = code.toLowerCase()
    if (!code || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Writes a field Liquid can read but `json`, `for` and `inspect` do not walk. (`hidden` of `build.ts` does the same; this file cannot import it without a cycle.) */
function hide (target: LiquidObject, key: string, value: unknown) {
  Object.defineProperty(target, key, { value, enumerable: false })
}

type Allocation = 'across' | 'each'

/** A UUID-shaped key (version 4 and variant bits set) made from a discount's id. */
function uuidOf (id: number): string {
  const hex = createHash('md5').update(`discount:${id}`).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${'89ab'[parseInt(hex[16], 16) % 4]}${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

/**
 * A discount application, https://shopify.dev/docs/api/liquid/objects/discount_application, in the form the parity store's Liquid prints (fixtures `ajax-discount-codes` and `ajax-discount-automatic-bxgy`):
 * - `title` is the code for a code and the discount's title for an automatic one; `type` is `discount_code`, or the empty string for an automatic discount (the page lists `automatic`, which only the add, change and update answers print);
 * - `value` is a number, the percentage or the amount in the minor unit of the view's currency; `description` is nil and so is `allocation_method`, which the page does not document and Liquid prints as nil in every cart the parity store was asked for;
 * - `key` (a UUID) and `created_at` (an ISO date) are hidden fields the Ajax answers print. Shopify makes both for each request and the fixtures mask them as volatile; the engine's are fixed by the discount, so that the same cart answers the same twice: the key is a version 4 shaped UUID made from a hash of the discount's id, and the date is the Unix epoch.
 * `allocation` is the method the Ajax answers print: `across` for an order discount, `each` for a percentage and for Buy X Get Y.
 */
function makeApplication (discount: DiscountData, ctx: DiscountContext): LiquidObject {
  const given = discount.type === 'buy_x_get_y' ? discount.gets.value : discount.type === 'free_shipping' ? { percentage: 100 } : discount.value
  const percentage = 'percentage' in given
  const order = discount.type === 'amount_off_order'
  const fixedAcross = discount.type === 'amount_off_products' && !percentage && !(given as { each?: boolean }).each
  const application: LiquidObject = {
    type: discount.code ? 'discount_code' : '',
    title: discount.code ?? discount.title,
    description: null,
    value: 'percentage' in given ? given.percentage : money(given.amount, ctx),
    value_type: percentage ? 'percentage' : 'fixed_amount',
    allocation_method: null,
    target_selection: order || discount.type === 'free_shipping' ? 'all' : 'entitled',
    target_type: discount.type === 'free_shipping' ? 'shipping_line' : 'line_item',
    total_allocated_amount: 0
  }
  const method: Allocation = order || fixedAcross ? 'across' : 'each'
  hide(application, 'key', uuidOf(discount.id))
  hide(application, 'created_at', new Date(0).toISOString())
  hide(application, 'allocation', method)
  return application
}

const allocation = (amount: number, application: LiquidObject): LiquidObject => ({ amount, discount_application: application })

/** Takes `amount` off `piece` for `application`. */
function allocate (piece: Piece, amount: number, application: LiquidObject) {
  piece.allocations.push(allocation(amount, application))
  piece.price -= amount
  application.total_allocated_amount = (application.total_allocated_amount as number) + amount
}

/** Splits `amount` over `weights` in proportion to them, the remainder (what rounding down leaves) on the last one with a weight. https://shopify.dev/docs/api/liquid/objects/discount_allocation names the allocation and not the rule; the parity store's recordings only split amounts that are exact (fixture `ajax-discount-codes`, WELCOME10: 10% of each line). */
function spread (amount: number, weights: number[]): number[] {
  const total = sum(weights)
  const last = weights.reduce((found, weight, n) => weight > 0 ? n : found, -1)
  if (total <= 0 || last < 0) return weights.map(() => 0)
  let left = amount
  return weights.map((weight, n) => {
    const share = n === last ? left : n < last ? Math.floor(amount * weight / total) : 0
    left -= share
    return share
  })
}

function clonePieces (pieces: Piece[]): Piece[] {
  return pieces.map(piece => ({ ...piece, allocations: [...piece.allocations] }))
}

/** Whether a minimum purchase holds: "the minimum subtotal or quantity of items that are required for the discount to be applied" (https://shopify.dev/docs/api/admin-graphql/latest/input-objects/DiscountCodeBasicInput, `minimumRequirement`), counted on `pieces`. */
function meetsMinimum (discount: DiscountData, pieces: Piece[], ctx: DiscountContext, price: (piece: Piece) => number): boolean {
  const { minimum } = discount
  if (minimum?.subtotal !== undefined && sum(pieces.map(price)) < money(minimum.subtotal, ctx)) return false
  if (minimum?.quantity !== undefined && sum(pieces.map(piece => piece.units)) < minimum.quantity) return false
  return true
}

/**
 * Whether a discount applies to the purchase type of a line: a one time purchase or a subscription (a line bought under a selling plan). The default is one time purchases only: `applies_on_one_time_purchase` is true and `applies_on_subscription` false unless the dataset says otherwise. The Admin API page of the discount input (https://shopify.dev/docs/api/admin-graphql/latest/input-objects/DiscountCustomerGetsInput) gives no default; this is as observed on the parity store (Admin API 2026-10): its two automatic discounts were created without the flags and both read `appliesOnOneTimePurchase: true, appliesOnSubscription: false`, and its recording of a subscription line of five slides (fixture `ajax-cart-session`, step 6) carries no discount although the automatic Buy X Get Y on slides exists.
 */
function allowsPurchase (item: LiquidObject, discount: AmountOffProductsDiscountData | BuyXGetYDiscountData): boolean {
  return item.selling_plan_allocation ? discount.applies_on_subscription === true : discount.applies_on_one_time_purchase !== false
}

/** A line is entitled to an amount-off-products discount when it is one of its items and its purchase type is allowed (`allowsPurchase`). */
function entitled (piece: Piece, discount: AmountOffProductsDiscountData, ctx: DiscountContext): boolean {
  return inItems(piece.item, discount.items, ctx) && allowsPurchase(piece.item, discount)
}

/** Whether a discount besides a code took money off the piece already, which a spend minimum of Buy X Get Y does not count: "If a combinable discount already applies to an item, that item doesn't count towards the minimum purchase amount at all." https://help.shopify.com/en/manual/discounts/discount-types/buy-x-get-y */
const discounted = (piece: Piece) => piece.allocations.some(entry => (entry.amount as number) > 0 && (entry.discount_application as LiquidObject).target_selection !== 'all')

/** `allocations` split over parts of `counts` units out of `of`, each amount in proportion, the rounding carried so that the parts add up to the whole. */
function splitAllocations (allocations: LiquidObject[], counts: number[], of: number): LiquidObject[][] {
  const parts: LiquidObject[][] = counts.map(() => [])
  for (const entry of allocations) {
    let units = 0
    let given = 0
    counts.forEach((count, n) => {
      units += count
      const through = n === counts.length - 1 ? entry.amount as number : Math.round((entry.amount as number) * units / of)
      parts[n].push(allocation(through - given, entry.discount_application as LiquidObject))
      given = through
    })
  }
  return parts
}

interface Unit { piece: Piece, price: number, role: 'buy' | 'get' | null }

/**
 * A Buy X Get Y, https://help.shopify.com/en/manual/discounts/discount-types/buy-x-get-y, settled on single units: each use takes the cheapest units of what is given ("the lower-priced item that the customer chooses is the item that the customer gets at a discount") and then the units that were to be bought (a quantity, or units to the spend), none of them one already counted, so a product that is bought and given at once is bought first and given second (buy 1 get 1 on two pairs discounts one). The uses are unlimited unless the discount gives `uses_per_order`: "Discount usage is unlimited by default." A line that holds units of different kinds is split by kind, as fixture `ajax-discount-automatic-bxgy` shows for the bought pair and the discounted one (the bought unit first, with an allocation of 0, then the discounted unit); units the discount did not touch make a line of their own before them, and a line that was only bought, in whole, gets an allocation of 0 (the T-shirts of BUNDLE, fixture `ajax-discount-codes`, step 6). Whether Shopify also splits bought units from untouched ones on one line is not recorded. Which of the units that tie are taken is the cart's order, which no fixture settles.
 */
function applyBuyXGetY (discount: BuyXGetYDiscountData, pieces: Piece[], ctx: DiscountContext, application: LiquidObject): number | null {
  const units: Unit[] = pieces.flatMap(piece => Array.from({ length: piece.units }, () => ({ piece, price: piece.price / piece.units, role: null })))
  const spend = discount.buys.quantity === undefined
  const buyable = units.filter(unit => inItems(unit.piece.item, discount.buys.items, ctx) && !(spend && discounted(unit.piece)))
  // the purchase types are those of what is given: "customerGets" carries them in the Admin API, so a subscription unit is bought toward a Buy X Get Y but is not discounted by one unless the discount says so
  const given = units.filter(unit => inItems(unit.piece.item, discount.gets.items, ctx) && allowsPurchase(unit.piece.item, discount)).sort((a, b) => a.price - b.price)
  const limit = discount.uses_per_order ?? Infinity
  let uses = 0
  while (uses < limit) {
    const gets = given.filter(unit => !unit.role).slice(0, discount.gets.quantity)
    if (!gets.length) break
    const bought: Unit[] = []
    let spent = 0
    for (const unit of buyable) {
      if (spend ? spent >= money(discount.buys.amount ?? 0, ctx) : bought.length >= (discount.buys.quantity ?? 0)) break
      if (unit.role || gets.includes(unit)) continue
      bought.push(unit)
      spent += unit.price
    }
    if (spend ? spent < money(discount.buys.amount ?? 0, ctx) : bought.length < (discount.buys.quantity ?? 0)) break
    for (const unit of gets) unit.role = 'get'
    for (const unit of bought) unit.role = 'buy'
    uses++
  }
  if (!uses) return null

  const roles = new Map<Piece, { gets: number, buys: number }>()
  for (const unit of units) {
    if (!unit.role) continue
    const entry = roles.get(unit.piece) ?? { gets: 0, buys: 0 }
    entry[unit.role === 'get' ? 'gets' : 'buys']++
    roles.set(unit.piece, entry)
  }
  const value = discount.gets.value
  const amountOff = (piece: Piece, count: number) => {
    const unit = piece.price / piece.units
    return 'percentage' in value ? Math.round(unit * count * value.percentage / 100) : Math.round(Math.min(unit, money(value.amount, ctx)) * count)
  }
  if (sum([...roles].map(([piece, entry]) => entry.gets ? amountOff(piece, entry.gets) : 0)) <= 0) return null

  const next: Piece[] = []
  let total = 0
  for (const piece of pieces) {
    const entry = roles.get(piece)
    if (!entry) {
      next.push(piece)
      continue
    }
    const amount = entry.gets ? amountOff(piece, entry.gets) : 0
    total += amount
    if (entry.gets === piece.units) {
      allocate(piece, amount, application)
      next.push(piece)
    } else if (entry.buys === piece.units) {
      piece.allocations.push(allocation(0, application))
      next.push(piece)
    } else {
      // units that were neither bought nor given come first, then the bought ones with their allocation of 0, then the given ones; a part that is empty is left out
      const parts = [
        { units: piece.units - entry.buys - entry.gets, role: null },
        { units: entry.buys, role: 'buy' },
        { units: entry.gets, role: 'get' }
      ].filter(part => part.units > 0)
      const shares = splitAllocations(piece.allocations, parts.map(part => part.units), piece.units)
      let units = 0
      let paid = 0
      parts.forEach((part, n) => {
        units += part.units
        const through = n === parts.length - 1 ? piece.price : Math.round(piece.price * units / piece.units)
        const split: Piece = { item: piece.item, units: part.units, price: through - paid, orderBase: 0, allocations: shares[n] }
        paid = through
        if (part.role === 'buy') split.allocations.push(allocation(0, application))
        if (part.role === 'get') allocate(split, amount, application)
        next.push(split)
      })
    }
  }
  pieces.splice(0, pieces.length, ...next)
  return total
}

/** Applies one discount to `pieces` and returns what it took off, or null (leaving `pieces` as they were) when it does not apply to them. */
function applyOne (discount: DiscountData, pieces: Piece[], ctx: DiscountContext, application: LiquidObject): number | null {
  if (discount.type === 'amount_off_products') {
    const targets = pieces.filter(piece => entitled(piece, discount, ctx))
    if (!targets.length || !meetsMinimum(discount, targets, ctx, piece => piece.price)) return null
    const value = discount.value
    const prices = targets.map(piece => piece.price)
    const amounts = 'percentage' in value
      ? targets.map(piece => Math.round(piece.price * value.percentage / 100))
      : value.each
        ? targets.map(piece => Math.round(money(value.amount, ctx) * piece.units))
        : spread(Math.min(sum(prices), money(value.amount, ctx)), prices)
    const given = targets.map((piece, n) => Math.min(amounts[n], piece.price))
    if (sum(given) <= 0) return null
    targets.forEach((piece, n) => { if (given[n] > 0) allocate(piece, given[n], application) })
    return sum(given)
  }
  if (discount.type === 'amount_off_order') {
    if (!pieces.length || !meetsMinimum(discount, pieces, ctx, piece => piece.orderBase)) return null
    const value = discount.value
    const wanted = 'percentage' in value ? Math.round(sum(pieces.map(piece => piece.orderBase)) * value.percentage / 100) : money(value.amount, ctx)
    const amount = Math.min(wanted, sum(pieces.map(piece => piece.price)))
    if (amount <= 0) return null
    const shares = spread(amount, pieces.map(piece => piece.price))
    let total = 0
    pieces.forEach((piece, n) => {
      const share = Math.min(shares[n], piece.price)
      if (share <= 0) return
      allocate(piece, share, application)
      total += share
    })
    return total
  }
  if (discount.type === 'free_shipping') {
    // shipping discounts go last, so the minimum counts what the discounts that combine with it left: "Products are counted towards a minimum purchase amount at their discounted price. If another discount has already lowered a product's price, then the lower price is what counts. This happens only with discounts that can be combined." https://help.shopify.com/en/manual/discounts/discount-types/free-shipping
    if (!pieces.length || !meetsMinimum(discount, pieces, ctx, piece => piece.price)) return null
    // a country the address names is checked; without an address the cart cannot say, so the discount holds
    if (discount.countries && ctx.shippingCountry && !discount.countries.includes(ctx.shippingCountry)) return null
    return 0
  }
  return applyBuyXGetY(discount, pieces, ctx, application)
}

interface Candidate {
  discount: DiscountData
  /** The code as it was entered, or null for an automatic discount. */
  entered: string | null
  /** Where the discount stands among the candidates: the entered codes in the order entered, then the automatic discounts in the data's order. */
  order: number
  /** What the discount takes off a cart on its own. */
  savings: number
  /** The line items the discount takes money off on its own, which two product discounts must not share. */
  touched: Set<LiquidObject>
}

/** The order the chosen discounts are applied in: product discounts, then order discounts (percentages before fixed amounts), then shipping, as the help centre says: "Product discounts apply first to individual items. Order discounts apply to the revised subtotal after product discounts. Shipping discounts apply last. [...] the percent off order discount applies first, and then the fixed amount order discount applies after." https://help.shopify.com/en/manual/discounts/discount-combinations */
function phase (discount: DiscountData): number {
  if (discount.type === 'amount_off_order') return 'percentage' in discount.value ? 1 : 2
  return classOf(discount) === 'product' ? 0 : 3
}

/** Most product or order codes one order takes: "Customers can use a maximum of 5 product or order discount codes and 1 shipping discount code on the same order. If this limit is reached, then additional codes won't apply." The one shipping code follows from two shipping discounts not combining. https://help.shopify.com/en/manual/discounts/discount-combinations */
const MAX_CODES = 5

/** Up to this many discounts that apply, the best combination is searched among all the sets that go together; above it the discounts are taken best first, one by one. Twelve keeps a page's cart cheap (at most a few thousand sets) and is far more than a store's discounts that apply to one cart. */
const SEARCH_LIMIT = 12

/** Two discounts go together when each allows the other's class (`combines`), when they are not both shipping discounts ("Multiple shipping discounts can't apply to the same order.") and when they do not both take money off the same line: "you can't apply multiple discounts to a single item unless the discounts are of different classes", and the Shopify Plus plan with product discount tags is the one exception, which the engine does not model. https://help.shopify.com/en/manual/discounts/discount-combinations */
function compatible (a: Candidate, b: Candidate): boolean {
  if (!combines(a.discount, b.discount)) return false
  const classes = [classOf(a.discount), classOf(b.discount)]
  if (classes[0] === 'shipping' && classes[1] === 'shipping') return false
  if (classes[0] === 'product' && classes[1] === 'product') {
    for (const item of a.touched) if (b.touched.has(item)) return false
  }
  return true
}

/** Which of two candidates comes first when nothing else separates them: the one that saves more on its own, the entered code, the earlier one. */
const byRank = (a: Candidate, b: Candidate) => b.savings - a.savings || Number(!a.entered) - Number(!b.entered) || a.order - b.order

/** `set` without the codes over the limit (the best ones stay). */
function withinLimits (set: Candidate[]): Candidate[] {
  const codes = set.filter(candidate => candidate.entered && classOf(candidate.discount) !== 'shipping')
  if (codes.length <= MAX_CODES) return set
  const kept = new Set([...codes].sort(byRank).slice(0, MAX_CODES))
  return set.filter(candidate => !codes.includes(candidate) || kept.has(candidate))
}

interface Applied {
  candidate: Candidate
  application: LiquidObject
  total: number
}

/** Applies the discounts of `set` to `pieces` in the order Shopify calculates them, and returns those that applied. */
function applySet (set: Candidate[], pieces: Piece[], ctx: DiscountContext): Applied[] {
  const applied: Applied[] = []
  let orders = false
  for (const candidate of [...set].sort((a, b) => phase(a.discount) - phase(b.discount))) {
    if (!orders && classOf(candidate.discount) !== 'product') {
      for (const piece of pieces) piece.orderBase = piece.price
      orders = true
    }
    const application = makeApplication(candidate.discount, ctx)
    const total = applyOne(candidate.discount, pieces, ctx, application)
    if (total !== null) applied.push({ candidate, application, total })
  }
  return applied
}

/** The sets of discounts that go together and cannot be added to: each candidate is left out of a set only when it does not go together with one in it. */
function maximalSets (viable: Candidate[]): Candidate[][] {
  const sets: Candidate[][] = []
  const walk = (n: number, chosen: Candidate[]) => {
    if (n === viable.length) {
      if (viable.every(candidate => chosen.includes(candidate) || chosen.some(other => !compatible(other, candidate)))) sets.push(chosen)
      return
    }
    const fits = chosen.every(other => compatible(other, viable[n]))
    if (fits) walk(n + 1, [...chosen, viable[n]])
    // leaving a discount out only leads to a set that cannot be added to when something still to come does not go with it
    if (!fits || viable.slice(n + 1).some(later => !compatible(viable[n], later))) walk(n + 1, chosen)
  }
  walk(0, [])
  return sets
}

/** What a set takes off the cart, how many entered codes it applies, and the places of the discounts it applies, to compare two sets with. */
interface Score {
  total: number
  codes: number
  orders: number[]
}

/** Whether `a` is the better set: more taken off, then more entered codes, then the earlier discounts. */
function better (a: Score, b: Score): boolean {
  if (a.total !== b.total) return a.total > b.total
  if (a.codes !== b.codes) return a.codes > b.codes
  for (let n = 0; n < Math.min(a.orders.length, b.orders.length); n++) {
    if (a.orders[n] !== b.orders[n]) return a.orders[n] < b.orders[n]
  }
  return false
}

/**
 * The discounts a cart gets: the automatic discounts and the entered codes that apply to it, and of those the ones that go together.
 *
 * Discounts that cannot combine (each must allow the other's class, `combines_with`) are not applied together: "If discounts can't combine, then the best discount or combination of discounts for the customer is automatically selected", where "Product and order discounts take priority over shipping discounts" (https://help.shopify.com/en/manual/discounts/discount-combinations). So the discounts that apply to the cart on their own are grouped into the sets that go together (`compatible`) and the set that takes the most off the cart is applied, an entered code winning a tie (more entered codes in the set, then the earlier discounts); a combination of two smaller discounts beats one big discount that combines with nothing. A set is scored by applying it, in the order Shopify calculates (`applySet`). Above twelve such discounts the sets are not searched: the discounts are taken in the order of what each saves on its own, and one that does not go together with one already taken is left out. A free shipping discount saves nothing the cart can count (the shipping price is not known here), so it never changes which set takes the most off, and only joins a set that allows it. Fixture `ajax-discount-codes` shows it: WELCOME10 (4100) beats "Beanie week" (2000) though it allows product discounts, because "Beanie week" does not allow order discounts; "Beanie week" beats SHOES5 (500); BUNDLE (5000) beats "Beanie week"; and FREESHIP gives way to WELCOME10. A code that is not applied is rejected, which includes a code that is unknown, a code over the limit of five (`MAX_CODES`) and every code of an empty cart (step 14).
 *
 * `items` are the cart's line items, which keep their quantities: a Buy X Get Y that discounts some units of a line makes two lines of it (`lines`).
 */
export function applyDiscounts (items: LiquidObject[], discounts: DiscountData[], codes: string[], ctx: DiscountContext): DiscountResult {
  const entered = enteredCodes(codes)
  const result: DiscountResult = { applications: [], cartLevel: [], lines: [], rejectedCodes: entered, freeShipping: { applies: false, discount: null } }
  const pieces: Piece[] = items.map(item => ({ item, units: item.quantity as number, price: item.original_line_price as number, orderBase: item.original_line_price as number, allocations: [] }))
  if (!pieces.length) return result

  const candidates: Candidate[] = []
  entered.forEach((code, n) => {
    const discount = discounts.find(d => d.code?.toLowerCase() === code.toLowerCase())
    if (discount) candidates.push({ discount, entered: code, order: n, savings: 0, touched: new Set() })
  })
  discounts.forEach((discount, n) => { if (!discount.code) candidates.push({ discount, entered: null, order: entered.length + n, savings: 0, touched: new Set() }) })

  const viable = candidates.filter(candidate => {
    const alone = clonePieces(pieces)
    const application = makeApplication(candidate.discount, ctx)
    const savings = applyOne(candidate.discount, alone, ctx, application)
    if (savings === null) return false
    candidate.savings = savings
    candidate.touched = new Set(alone.filter(piece => piece.allocations.some(entry => entry.discount_application === application && (entry.amount as number) > 0)).map(piece => piece.item))
    return true
  })
  viable.sort(byRank)

  let chosen: Candidate[] = []
  if (viable.length > SEARCH_LIMIT) {
    for (const candidate of viable) {
      if (chosen.every(other => compatible(other, candidate))) chosen.push(candidate)
    }
    chosen = withinLimits(chosen)
  } else {
    let top: Score | null = null
    for (const set of maximalSets(viable)) {
      const limited = withinLimits(set)
      const applied = applySet(limited, clonePieces(pieces), ctx)
      const score: Score = { total: sum(applied.map(entry => entry.total)), codes: applied.filter(entry => entry.candidate.entered).length, orders: applied.map(entry => entry.candidate.order).sort((a, b) => a - b) }
      if (!top || better(score, top)) {
        top = score
        chosen = limited
      }
    }
  }

  const applied = applySet(chosen, pieces, ctx)
  for (const { candidate, application } of applied) {
    if (candidate.discount.type === 'free_shipping') {
      const limit = candidate.discount.max_shipping_price
      result.freeShipping = { applies: true, discount: application, ...(limit !== undefined ? { maxPrice: money(limit, ctx) } : {}) }
      continue
    }
    result.applications.push(application)
    if (candidate.discount.type === 'amount_off_order') result.cartLevel.push(application)
  }
  const appliedCodes = new Set(applied.flatMap(entry => entry.candidate.entered ? [entry.candidate.entered.toLowerCase()] : []))
  result.rejectedCodes = entered.filter(code => !appliedCodes.has(code.toLowerCase()))
  result.lines = pieces.map(piece => ({ item: piece.item, units: piece.units, allocations: piece.allocations }))
  return result
}

/** A decimal as the Ajax API prints a discount's value: a string with a decimal point (`"10.0"`, `"2.5"`). */
const decimal = (value: number) => Number.isInteger(value) ? value.toFixed(1) : String(value)

/**
 * A discount application as an Ajax answer prints it. `cart` (`/cart.js` and `{{ cart | json }}`) puts `type` first, in the order of the page, and prints the type of an automatic discount as the empty string; `change` (the answers of `add.js`, `change.js` and `update.js`) sorts the keys by name and prints `automatic` (fixtures `ajax-discount-codes` and `ajax-discount-automatic-bxgy`). `value` is a string: the percentage, or the amount in the currency's major unit (the page's example prints `"2.5"`, https://shopify.dev/docs/api/liquid/objects/discount_application; no fixture holds a fixed amount, so the major unit is the engine's reading of that example).
 */
export function discountApplicationJson (application: LiquidObject, form: 'cart' | 'change', total: unknown = application.total_allocated_amount): Record<string, unknown> {
  const value = application.value_type === 'percentage' ? decimal(application.value as number) : decimal((application.value as number) / 100)
  const fields = {
    type: form === 'change' && application.type === '' ? 'automatic' : application.type,
    key: application.key,
    title: application.title,
    description: application.description,
    value,
    created_at: application.created_at,
    value_type: application.value_type,
    allocation_method: application.allocation,
    target_selection: application.target_selection,
    target_type: application.target_type,
    total_allocated_amount: total
  }
  return form === 'cart' ? fields : Object.fromEntries(Object.entries(fields).sort(([a], [b]) => a < b ? -1 : 1))
}

/**
 * A discount allocation as an Ajax answer prints it: its amount and the application it comes from. In the `change` form the application's `total_allocated_amount` is what was allocated to this line, the allocation's own amount, where `/cart.js` and `{{ cart | json }}` print the application's total over the cart: fixture `ajax-discount-codes`, step 5 (`BUNDLE`) prints 5000 on the line that gets 5000 and 0 on the line with an allocation of 0, and the cart probe of step 6 prints 5000 on both. One recording cannot tell the line's own amount from a running total over the lines; the line's own amount is the simpler reading.
 */
export function discountAllocationJson (entry: LiquidObject, form: 'cart' | 'change'): Record<string, unknown> {
  return { amount: entry.amount, discount_application: discountApplicationJson(entry.discount_application as LiquidObject, form, form === 'change' ? entry.amount : undefined) }
}
