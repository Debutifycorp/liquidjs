import { requestFromUrl, storefrontSampleData } from '../../src/shopify'
import type { StoreData } from '../../src/shopify'
import { loadFixture } from './fixtures'
import type { FixtureStep } from './fixtures'
import { renderProbeHtml } from './probe'

/** What replaces a live-store value in both sides of a comparison, so the key still has to be there. */
export const VOLATILE_PLACEHOLDER = '<volatile>'

/** Values of a recorded body that the live parity store makes and the engine cannot reproduce from the dataset: the probe comparison replaces them with `VOLATILE_PLACEHOLDER` on both sides, so the key must still be present. A path is dotted from the body's root, with `[]` for any array element (`ajax.variants[].featured_image.created_at`); a path covers everything below it. The paths are the ones the fixtures hold (found by reading them), so a new fixture with another path adds an entry here, with its own reason. */
export const VOLATILE: ReadonlyArray<{ paths: string[], reason: string }> = [
  {
    paths: [
      // the probe's `product | json`, `/products/<handle>.js`, and the product lists of `/recommendations/products.json`
      'ajax.created_at', 'ajax.published_at', 'ajax.updated_at',
      'created_at', 'published_at', 'updated_at',
      'products[].created_at', 'products[].published_at', 'products[].updated_at'
    ],
    reason: 'A product\'s created_at, published_at and updated_at: the dataset holds mock.shop\'s own dates, and the parity store\'s are the moment it was seeded.'
  },
  {
    paths: [
      'ajax.variants[].featured_image.created_at', 'ajax.variants[].featured_image.updated_at',
      'variants[].featured_image.created_at', 'variants[].featured_image.updated_at',
      'products[].variants[].featured_image.created_at', 'products[].variants[].featured_image.updated_at'
    ],
    reason: 'A variant\'s featured image has created_at and updated_at, the moments the parity store made the image; the dataset has no image timestamps and the rest of the image (id, src, alt, size) is the dataset\'s.'
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
    paths: ['shipping_rates[].markup'],
    reason: 'A shipping rate\'s markup in a market with another currency is the printed price less the rate\'s base price converted at Shopify\'s live exchange rate (about 1.4175 for CAD and 0.89 for EUR fit every point of fixtures ajax-shipping-rates-en-ca and ajax-shipping-rates-en-eu to a cent, e.g. -0.17 for the Canadian Standard rate). The dataset holds no live rate, which changes daily, and the engine prints the shop currency\'s "0.00".'
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

/** A copy of `value` with the value at each `VOLATILE` path replaced by `VOLATILE_PLACEHOLDER`. */
export function maskVolatile (value: unknown, path = ''): unknown {
  if (Array.isArray(value)) return value.map(item => maskVolatile(item, `${path}[]`))
  if (value === null || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key
    out[key] = VOLATILE_PATHS.has(childPath) ? VOLATILE_PLACEHOLDER : maskVolatile(child, childPath)
  }
  return out
}

/** The dataset's image addresses, which the fixture cut put in place of the store's own CDN address. */
const DATASET_IMAGE = /^https:(?=\/\/cdn\.shopify\.com\/mock-shop-production-media\/)/

export const withoutProtocol = (value: unknown): unknown => Array.isArray(value)
  ? value.map(withoutProtocol)
  : value !== null && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, withoutProtocol(child)]))
    : typeof value === 'string' ? value.replace(DATASET_IMAGE, '') : value

/**
 * A recorded probe body with the protocol dropped from the image addresses under its `ajax` key, which is `{{ product | json }}`. The parity store prints them protocol-relative there (`//host/cdn/shop/files/…`, scenario `page-product` and the recordings of these probes), and the fixture cut wrote the dataset's absolute address in their place; the Ajax answers (`/products/<handle>.js`, fixture `ajax-product-js`) really are absolute, and are not touched.
 */
export function liquidJsonImages (body: unknown): unknown {
  if (body === null || typeof body !== 'object' || Array.isArray(body) || !('ajax' in body)) return body
  return { ...body, ajax: withoutProtocol((body as Record<string, unknown>).ajax) }
}

/** The step a probe renders: the last request for a page (`?view=` or `section_id=`) of a fixture that has one, otherwise its last step (`/collections/featured` and the like, whose template the store picks). */
function probeStep (steps: FixtureStep[]): FixtureStep {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].method === 'GET' && /[?&](view|section_id)=/.test(steps[i].url)) return steps[i]
  }
  return steps[steps.length - 1]
}

/**
 * Renders the last probe step of fixture `name` with the engine and returns both sides, each with the `VOLATILE` values masked and then passed through `pick`. The step's address picks the template (`?view=probe` and the like) and the request, as `requestFromUrl` reads it; a probe section (`section_id=probe-…`) renders on that page. It throws when `pick` finds nothing in the recorded body, or only a masked value, because a comparison of that proves nothing.
 */
export async function probeMatches (name: string, pick: (body: any) => unknown = body => body, data: StoreData = storefrontSampleData): Promise<{ actual: unknown, expected: unknown }> {
  const step = probeStep(loadFixture(name).steps)
  const expected = pick(liquidJsonImages(maskVolatile(step.body)))
  if (expected === undefined || expected === VOLATILE_PLACEHOLDER) throw new Error(`pick found nothing in the recorded body of ${name} (or only a volatile value)`)
  const page = requestFromUrl(step.url, data)
  const section = new URL(step.url, 'https://x.invalid').searchParams.get('section_id')
  // a probe section renders on the `index` page: the probe theme holds only `templates/index.json` for sections, and `renderSection` throws for a template the theme lacks (the address's own template, such as `search` for the predictive probes, would)
  // a page renders its base template (`product`) and the runtime picks the alternate one from the address's `?view=` or the resource's `template_suffix`
  const templateName = section ? 'index' : page.templateName
  const html = await renderProbeHtml(section ?? templateName, { request: page.request, data, section: !!section, templateName, locale: page.locale })
  return { actual: pick(maskVolatile(JSON.parse(html))), expected }
}

/**
 * A recorded Ajax product (`/products/<handle>.js`, or a product of `/recommendations/products.json`) with the protocol dropped from `featured_image` and `images`. The parity store writes those two without one (`//cdn.shopify.com/…`) and the `src` of its media and of a variant's image with `https:` (scenarios `ajax-product-js` and `ajax-recommendations-json`); the fixture cut wrote `https:` on all of them.
 */
export function ajaxProductImages (product: unknown): unknown {
  if (product === null || typeof product !== 'object' || Array.isArray(product)) return product
  const body = product as Record<string, unknown>
  return {
    ...body,
    ...('featured_image' in body ? { featured_image: withoutProtocol(body.featured_image) } : {}),
    ...(Array.isArray(body.images) ? { images: withoutProtocol(body.images) } : {})
  }
}
