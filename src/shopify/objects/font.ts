import { Drop } from '../../drop'
import { LiquidFloat } from '../../util/liquid-float'
import type { FontInfo } from '../types'

/** Shopify quotes a family name holding anything but letters, digits and hyphens. https://shopify.dev/docs/api/liquid/objects/font (family) */
export function cssFamily (family: string): string {
  return /^[A-Za-z0-9-]+$/.test(family) ? family : `"${family.replace(/"/g, '\\"')}"`
}

/** Shopify's `font` object for a `font_picker` setting. `weight` is a string (`"400"`) as in the docs' example; printed on its own it is the font's handle. https://shopify.dev/docs/api/liquid/objects/font */
export class FontDrop extends Drop {
  public readonly family: string
  public readonly style: string
  public readonly weight: string
  public readonly fallback_families: string
  public readonly baseline_ratio: LiquidFloat
  public readonly 'system?': boolean
  private variantDrops?: FontDrop[]

  public constructor (public readonly info: FontInfo, private readonly lookup: (handle: string) => FontInfo | undefined) {
    super()
    this.family = cssFamily(info.family)
    this.style = info.style
    this.weight = String(info.weight)
    this.fallback_families = info.fallback_families
    this.baseline_ratio = new LiquidFloat(info.baseline_ratio)
    this['system?'] = info.system
  }

  /** The other fonts of the family the font library lists, built on first use. */
  public get variants (): FontDrop[] {
    if (!this.variantDrops) {
      this.variantDrops = []
      for (const handle of this.info.variants) {
        const info = handle === this.info.handle ? this.info : this.lookup(handle)
        if (info) this.variantDrops.push(handle === this.info.handle ? this : new FontDrop(info, this.lookup))
      }
    }
    return this.variantDrops
  }

  /** The variant with this style and weight, if the family has it: found among the family's fonts by their style and weight, not by rebuilding a handle (`mono` and `serif` have none of the `<family>_<style><weight>` shape). */
  public variant (style: string, weight: number): FontDrop | undefined {
    if (style === this.info.style && weight === this.info.weight) return this
    return this.variants.find(font => font.info.style === style && font.info.weight === weight)
  }

  public valueOf () {
    return this.info.handle
  }
}
