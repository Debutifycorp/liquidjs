import { requestFromUrl, storefrontSampleData } from '../../src/shopify'
import type { StoreData } from '../../src/shopify'
import { loadFixture } from './fixtures'
import type { FixtureStep } from './fixtures'
import { renderProbeHtml } from './probe'

/** Values of a recorded body that the live parity store makes and the engine cannot reproduce from the dataset: the probe comparison ignores them on both sides. A path is dotted from the body's root, with `[]` for any array element (`ajax.variants[].featured_image`); a path covers everything below it. The paths are the ones the fixtures hold (found by reading them), so a new fixture with another path adds an entry here. */
export const VOLATILE: ReadonlyArray<{ paths: string[], reason: string }> = [
  {
    paths: [
      // the probe's `product | json`, `/products/<handle>.js`, and the product lists of `/recommendations/products.json`
      'ajax.created_at', 'ajax.published_at', 'ajax.updated_at',
      'created_at', 'published_at', 'updated_at',
      'products[].created_at', 'products[].published_at', 'products[].updated_at'
    ],
    reason: 'A product\'s created_at, published_at and updated_at are the moment the parity store was seeded; the dataset holds no timestamps.'
  },
  {
    paths: [
      'ajax.featured_image', 'ajax.variants[].featured_image', 'featured_image', 'variants[].featured_image',
      'products[].featured_image', 'products[].variants[].featured_image', 'resources.results.products[].featured_image',
      'items[].featured_image', 'ajax.items[].featured_image'
    ],
    reason: 'A featured image is the image the live store hosts and numbers: its address, id and created_at/updated_at (image timestamps) are the store\'s, not the dataset\'s.'
  },
  {
    paths: [
      'ajax.cart_level_discount_applications[].key', 'ajax.items[].line_level_discount_allocations[].discount_application.key',
      'cart_level_discount_applications[].key', 'cart_level_discount_applications[].discount_application.key', 'items[].line_level_discount_allocations[].discount_application.key'
    ],
    reason: 'A discount application\'s key is a UUID Shopify makes for each request.'
  },
  {
    paths: [
      'ajax.cart_level_discount_applications[].created_at', 'ajax.items[].line_level_discount_allocations[].discount_application.created_at',
      'cart_level_discount_applications[].created_at', 'cart_level_discount_applications[].discount_application.created_at', 'items[].line_level_discount_allocations[].discount_application.created_at'
    ],
    reason: 'A discount application\'s created_at is the moment of the request that made it.'
  },
  {
    paths: ['token'],
    reason: 'A cart\'s token identifies the cart (its id); the fixtures hold the placeholder <token> and the engine makes its own.'
  },
  {
    paths: ['items_added[].id'],
    reason: 'The id of an added line in a cart change is a UUID Shopify makes (the dataset ids are its variant_id and product_id).'
  },
  {
    paths: [
      'ajax.selling_plan_groups[].id', 'ajax.variants[].selling_plan_allocations[].selling_plan_group_id',
      'selling_plan_groups[].id', 'selling_plan_groups[].selling_plans[].group_id', 'variants[].allocations[].group', 'variants[].selling_plan_allocations[].selling_plan_group_id'
    ],
    reason: 'A selling plan group\'s id is a checksum (40 hex digits) Shopify makes from the group; the dataset gives the group an id of its own.'
  }
]

const VOLATILE_PATHS = new Set(VOLATILE.flatMap(entry => entry.paths))

/** A copy of `value` without the keys at the `VOLATILE` paths. */
export function stripVolatile (value: unknown, path = ''): unknown {
  if (Array.isArray(value)) return value.map(item => stripVolatile(item, `${path}[]`))
  if (value === null || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key
    if (!VOLATILE_PATHS.has(childPath)) out[key] = stripVolatile(child, childPath)
  }
  return out
}

/** The step a probe renders: the last request for a page (`?view=` or `section_id=`) of a fixture that has one, otherwise its last step (`/collections/featured` and the like, whose template the store picks). */
function probeStep (steps: FixtureStep[]): FixtureStep {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].method === 'GET' && /[?&](view|section_id)=/.test(steps[i].url)) return steps[i]
  }
  return steps[steps.length - 1]
}

/**
 * Renders the last probe step of fixture `name` with the engine and returns both sides, each without the `VOLATILE` values and then passed through `pick`. The step's address picks the template (`?view=probe` and the like) and the request, as `requestFromUrl` reads it; a probe section (`section_id=probe-…`) renders on that page.
 */
export async function probeMatches (name: string, pick: (body: any) => unknown = body => body, data: StoreData = storefrontSampleData): Promise<{ actual: unknown, expected: unknown }> {
  const step = probeStep(loadFixture(name).steps)
  const page = requestFromUrl(step.url, data)
  const section = new URL(step.url, 'https://x.invalid').searchParams.get('section_id')
  // a probe section renders on the `index` page: the probe theme holds only `templates/index.json` for sections, and `renderSection` throws for a template the theme lacks (the address's own template, such as `search` for the predictive probes, would)
  const templateName = section ? 'index' : page.request.view ? `${page.templateName}.${page.request.view}` : page.templateName
  const html = await renderProbeHtml(section ?? templateName, { request: page.request, data, section: !!section, templateName, locale: page.locale })
  return { actual: pick(stripVolatile(JSON.parse(html))), expected: pick(stripVolatile(probeStep(loadFixture(name).steps).body)) }
}
