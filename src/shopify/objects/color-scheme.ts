import { Drop } from '../../drop'

/**
 * Shopify's `color_scheme` object, a scheme from a theme's `color_scheme_group` setting. Printed on its own it is the scheme's `id`. `settings` holds the scheme's settings as the group's `definition` declares them, with `color` settings as `color` objects and the stored values' defaults filled in from the schema.
 *
 * https://shopify.dev/docs/api/liquid/objects/color_scheme (`id`, `settings`; "When a color_scheme setting is referenced directly, the color scheme ID is returned"), https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings (the `color_scheme` and `color_scheme_group` setting types).
 */
export class ColorSchemeDrop extends Drop {
  public constructor (public readonly id: string, public readonly settings: Record<string, unknown>) {
    super()
  }

  public valueOf () {
    return this.id
  }
}
