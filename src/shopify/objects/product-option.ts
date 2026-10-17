import { Drop } from '../../drop'
import type { SwatchData } from '../store/types'
import { ColorDrop } from './color'
import { ImageDrop } from './image'

type Variant = Record<string, unknown>

/** What a product knows of one option value before a request selects anything: its name, id, swatch and the address it leads to. */
export interface OptionValueInfo {
  name: string
  id: number
  swatch: SwatchDrop | null
  product_url: string | null
}

/** Shopify's `swatch` object, https://shopify.dev/docs/api/liquid/objects/swatch: the swatch's `color` (a `color` object) and `image` (an `image` object), each nil when the swatch has none. */
export class SwatchDrop extends Drop {
  public readonly color: ColorDrop | null
  public readonly image: ImageDrop | null

  private constructor (color: ColorDrop | null, image: ImageDrop | null) {
    super()
    this.color = color
    this.image = image
  }

  /** The swatch of `data`, or nil when it has neither a colour nor an image: https://shopify.dev/docs/api/liquid/objects/product_option_value#product_option_value-swatch ("If there is no saved `color` or `image` content for the swatch, then the return value is `nil`"). A colour that is not a CSS colour counts as none. */
  public static from (data: SwatchData | null | undefined): SwatchDrop | null {
    const color = data?.color ? ColorDrop.from(data.color) ?? null : null
    const image = data?.image ? new ImageDrop(data.image) : null
    return color || image ? new SwatchDrop(color, image) : null
  }
}

/**
 * Shopify's `product_option_value` object, https://shopify.dev/docs/api/liquid/objects/product_option_value, for the values a request selects (`selected`, one value of each option). Printed on its own, compared with `==` and read by the string filters it is its `name`, as the option's values were strings before Shopify made them objects: the parity store prints our theme's `{% if option.selected_value == value %}` as true for the selected value (its recording `page-product`, the quantity-break pickers' `selected="selected"` on Red). `json` prints the name too, which no recording shows.
 *
 * `available` follows the page's tree: in the context of the values selected for the options before this one, whether any variant with this value is available, whatever the later options hold. `variant` is the variant of this value with the other options' selected values, or nil when there is none, and the selected value's is the product's `selected_or_first_available_variant`, as the page says. The parity store prints Dawn's picker so (its recordings of Dawn's `page-product` and the `option_values` section requests: every Clay is disabled, and with Clay selected every size is too).
 */
export class ProductOptionValueDrop extends Drop {
  public readonly id: number
  public readonly name: string
  public readonly available: boolean
  public readonly selected: boolean
  public readonly swatch: SwatchDrop | null
  public readonly product_url: string | null
  public readonly variant: Variant | null

  public constructor (info: OptionValueInfo, available: boolean, selected: boolean, variant: Variant | null) {
    super()
    this.id = info.id
    this.name = info.name
    this.available = available
    this.selected = selected
    this.swatch = info.swatch
    this.product_url = info.product_url
    this.variant = variant
  }

  public valueOf () {
    return this.name
  }

  public toString () {
    return this.name
  }

  public toJSON () {
    return this.name
  }
}

/** `product.options_by_name`, https://shopify.dev/docs/api/liquid/objects/product#product-options_by_name: the product's options by name, where "the name is case-insensitive" (the page's example reads `options_by_name['strength']` for the option `Strength`). Its own keys are the lower-cased names, which `json` and `for` see; any other spelling is found by `liquidMethodMissing`. */
export class OptionsByNameDrop extends Drop {
  public constructor (options: Array<Record<string, unknown>>) {
    super()
    for (const option of options) {
      const key = String(option.name).toLowerCase()
      if (!Object.prototype.hasOwnProperty.call(this, key)) Object.defineProperty(this, key, { value: option, enumerable: true })
    }
  }

  public liquidMethodMissing (key: string | number): unknown {
    const wanted = String(key).toLowerCase()
    return Object.prototype.hasOwnProperty.call(this, wanted) ? this[wanted] : undefined
  }
}

/**
 * The options of a product, https://shopify.dev/docs/api/liquid/objects/product_option, for the values `selected` (one per option, nil for an option nothing selects) and the variant they select (`chosen`, the product's `selected_or_first_available_variant`): each option's `name`, `position` (from 1), `selected_value` and `values`, the `product_option_value` objects of `ProductOptionValueDrop`.
 */
export function buildOptions (names: string[], values: OptionValueInfo[][], variants: Variant[], selected: Array<string | null>, chosen: Variant | null): Array<Record<string, unknown>> {
  const optionsOf = (variant: Variant) => variant.options as string[]
  return names.map((name, i) => ({
    name,
    position: i + 1,
    selected_value: selected[i] ?? null,
    values: (values[i] ?? []).map(info => {
      const isSelected = info.name === selected[i]
      const available = variants.some(variant => !!variant.available && optionsOf(variant)[i] === info.name && selected.slice(0, i).every((value, j) => optionsOf(variant)[j] === value))
      const variant = isSelected ? chosen : variants.find(candidate => names.every((_, j) => optionsOf(candidate)[j] === (j === i ? info.name : selected[j]))) ?? null
      return new ProductOptionValueDrop(info, available, isSelected, variant)
    })
  }))
}

/** The hidden field of a built product that holds what it knows of its option values (`OptionValueInfo`), option by option, for a request that selects values (`selectProduct`) and for the swatches of the storefront filters. */
const OPTION_INFO = '__option_values'

/** Keeps `infos` on the built `product`, not enumerable, so `json` and `for` do not see it and a copy of the product (`copyObject`) has it too. */
export function keepOptionInfo (product: object, infos: OptionValueInfo[][]): void {
  Object.defineProperty(product, OPTION_INFO, { value: infos, enumerable: false })
}

/** What `keepOptionInfo` kept on a built product, or an empty list. */
export const optionInfoOf = (product: object): OptionValueInfo[][] => ((product as Record<string, unknown>)[OPTION_INFO] as OptionValueInfo[][] | undefined) ?? []

/** The swatch of the value `value` of the option `option` (by name, case-insensitive) in the first of `products` that has one, or nil. */
export function swatchOf (products: object[], option: string, value: string): SwatchDrop | null {
  const wanted = option.toLowerCase()
  for (const product of products) {
    const index = ((product as Record<string, unknown>).options as string[] | undefined ?? []).findIndex(name => name.toLowerCase() === wanted)
    const swatch = optionInfoOf(product)[index]?.find(info => info.name === value)?.swatch
    if (swatch) return swatch
  }
  return null
}

/** A 32-bit FNV-1a hash of `text` from the offset `basis`. */
function fnv (text: string, basis: number): number {
  let h = basis
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return h >>> 0
}

/** A positive safe integer of 52 bits from two FNV-1a hashes of `text`. */
const hash = (text: string) => (fnv(text, 0x811c9dc5) % 0x100000) * 0x100000000 + fnv(text, 0x01000193) + 1

/** The id an option value has when the data gives none: a hash of the product's id, the option's position and the value, so the same data gives the same ids on every build and in every view, which a request that names them (`option_values`) relies on. Values of one product that would share an id get the next free one. */
export function optionValueId (productId: unknown, position: number, value: string, taken: Set<number>): number {
  let id = hash(`${String(productId)}/${position}/${value}`)
  while (taken.has(id)) id++
  taken.add(id)
  return id
}
