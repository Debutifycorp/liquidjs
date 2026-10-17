import { stringify } from '../../util'

/** Lower-case, quotes and brackets dropped, other non-word runs as single hyphens, no leading or trailing hyphen: the reference algorithm in liquid-spec's docs/implementers/shopify-theme-filters.md. https://shopify.dev/docs/api/liquid/filters/handleize only shows `Health potion` becoming `health-potion`; it does not state the rules for other characters, so they (and non-ASCII text, which this drops to hyphens) are not pinned by shopify.dev. */
export function handleize (input: unknown): string {
  return stringify(input).toLowerCase().replace(/['"()[\]]/g, '').replace(/[^a-z0-9_]+/g, '-').replace(/^-+|-+$/g, '')
}
