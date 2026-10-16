import { storefrontSampleData } from '../../../src/shopify'
import type { StoreData } from '../../../src/shopify'
import { harness } from './harness'
import { maskVolatile } from '../expect-probe'
import { loadFixture } from '../fixtures'
import { stepFields } from './steps'

// the answers hold line-key hashes, the cart token, and the UUIDs and ISO dates of discount applications and of `items_added`, which differ on every run
const keys = (v: unknown) => JSON.parse(JSON.stringify(v).replace(/(\d+):[0-9a-f]{32}/g, '$1:<hash>').replace(/"token":"[^"]*"/g, '"token":"<token>"').replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<uuid>').replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, '<date>'))
// what the parity store makes for each request or for its own records and the dataset cannot (`VOLATILE` in `expect-probe.ts`: a product's dates, a selling plan group's checksum), and the ids of predictive search and recommendations, which are new for each request
const same = (v: unknown) => maskVolatile(JSON.parse(JSON.stringify(keys(v)).replace(/(_psid|pr_rec_id)=[0-9a-f]+/g, '$1=<id>')))
const SECTION = /^<div id="shopify-section-[^"]+" class="shopify-section[^"]*">/

/** The fixtures keep the theme's markup out: a section the theme rendered reads `<section>`, and one the theme lacks is `null`. The ids must match in order; the markup need only be a section. */
function sectionsMatch (actual: unknown, expected: Record<string, unknown>): void {
  expect(Object.keys(actual as object)).toEqual(Object.keys(expected))
  for (const [id, html] of Object.entries(actual as Record<string, unknown>)) expect([id, html]).toEqual([id, expected[id] === null ? null : expect.stringMatching(SECTION)])
}

/** Replays a recorded Ajax scenario through the storefront, step by step: statuses always, JSON bodies where the recording kept them, section HTML by its keys (the fixture drops theme markup). */
async function replay (name: string, data: StoreData = storefrontSampleData as StoreData): Promise<void> {
  const { send } = harness({ data })
  for (const step of loadFixture(name).steps) {
    const body = step.json ? stepFields(step) : step.form ? new URLSearchParams(step.form).toString() : undefined
    let answer = await send(step.method, step.url, body)
    // the recorder followed redirects unless a step said not to, so a recorded 200 after a redirect is the page the redirect led to
    const recordedRedirect = step.status >= 300 && step.status < 400
    if (!recordedRedirect) {
      for (let hops = 0; answer.status >= 300 && answer.status < 400 && hops < 5; hops++) answer = await send('GET', answer.headers.get('location')!)
    }
    expect([step.method, step.url, answer.status]).toEqual([step.method, step.url, step.status])
    if (step.location) expect(answer.headers.get('location')).toBe(step.location)
    if (step.body === null || typeof step.body !== 'object') continue
    const expected = same(step.body) as Record<string, unknown>
    const actual = same(answer.json) as Record<string, unknown>
    // `GET <page>?sections=a,b` answers the map itself (`ajax-cart-sections`, step 3); a cart answer holds it under `sections`
    if (/[?&]sections=/.test(step.url)) {
      sectionsMatch(actual, expected)
      continue
    }
    if (expected.sections && typeof expected.sections === 'object') {
      sectionsMatch(actual.sections, expected.sections as Record<string, unknown>)
      delete expected.sections
      delete actual.sections
    }
    // the parity store draws the recommended products at random (the engine's own rule picks others, `predictive.spec.ts`), so only the shape of the answer is compared
    if (name === 'ajax-recommendations-json') {
      expect(Object.keys(actual)).toEqual(Object.keys(expected))
      expect(actual.intent).toBe(expected.intent)
      const products = actual.products as Array<Record<string, unknown>>
      expect(products.length).toBeGreaterThan(0)
      for (const product of products) expect(Object.keys(product)).toEqual(Object.keys((expected.products as Array<Record<string, unknown>>)[0]))
      continue
    }
    expect([step.url, actual]).toEqual([step.url, expected])
  }
}

/** The dataset without the automatic discount `Second pair of slides half off`, which the parity store gained after it recorded `ajax-cart-session`: its slides line of five is one line there, and splits in two with the discount. */
const BEFORE_SLIDES_DISCOUNT: StoreData = { ...storefrontSampleData, discounts: (storefrontSampleData.discounts ?? []).filter(discount => discount.title !== 'Second pair of slides half off') } as StoreData

describe('Ajax endpoints', () => {
  it('replays ajax-cart-session', () => replay('ajax-cart-session', BEFORE_SLIDES_DISCOUNT))
  for (const name of ['ajax-cart-sections', 'ajax-cart-errors', 'ajax-discount-codes', 'ajax-discount-automatic-bxgy', 'ajax-shipping-rates', 'ajax-shipping-rates-en-ca', 'ajax-shipping-rates-en-eu', 'ajax-product-js', 'ajax-suggest-json', 'ajax-recommendations-json', 'ajax-cart-en-ca']) {
    it(`replays ${name}`, () => replay(name))
  }
})
