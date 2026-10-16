import { readdirSync } from 'fs'
import { join } from 'path'
import { probeMatches } from './expect-probe'

const RELEVANCE = 'Shopify ranks search results by its own relevance, which the dataset does not carry and no rule of plain matching reproduces (the engine lists them in store order); the results are compared as a set.'
const PREDICTIVE_INDEX = 'For `q=ca` Shopify\'s predictive index finds the `hoodie` before `canvas-sneakers`, though nothing in the dataset for the hoodie holds a word that starts "ca"; the engine finds `canvas-sneakers` alone.'
const SAMPLED = 'Shopify samples related products per request from its own recommendation model (two recordings of one request share two of four products); the engine lists the products of the product\'s collections, then of its type, in store order.'
const NEW_ACCOUNTS = 'The parity store uses new customer accounts, whose login address is Shopify\'s `customer_authentication/redirect` on the store\'s myshopify domain, a setting the dataset does not carry; customer accounts are out of the item\'s scope, so the engine prints the classic `<prefix>/account/login`.'

/**
 * Probe keys the engine cannot match, by fixture, each with the reason recorded in the README's "Known gaps". A key is a top-level key of the probe's body or a dotted path below one (`routes.account_login_url`), and it is left out of both sides; with `unordered` it is compared as a set instead.
 */
const ACCEPTED_PROBE_KEYS: Record<string, { keys: string[], reason: string, unordered?: boolean }> = {
  'probe-search-shirt': { keys: ['results'], reason: RELEVANCE, unordered: true },
  'probe-search-type-product': { keys: ['results'], reason: RELEVANCE, unordered: true },
  'probe-predictive-prefix': { keys: ['products'], reason: PREDICTIVE_INDEX },
  'probe-recommendations-related': { keys: ['products'], reason: SAMPLED },
  'probe-page-home': { keys: ['routes.account_login_url'], reason: NEW_ACCOUNTS },
  'probe-page-en-ca': { keys: ['routes.account_login_url'], reason: NEW_ACCOUNTS },
  'probe-page-en-eu': { keys: ['routes.account_login_url'], reason: NEW_ACCOUNTS },
  'probe-page-fr-ca': { keys: ['routes.account_login_url'], reason: NEW_ACCOUNTS },
  'probe-page-fr-eu': { keys: ['routes.account_login_url'], reason: NEW_ACCOUNTS }
}

const names = readdirSync(join(__dirname, 'fixtures')).map(f => f.replace(/\.json$/, '')).filter(n => n.startsWith('probe-'))

/** `body` with the value at the dotted `path` left out, or, with `unordered`, sorted; the rest is the same object. */
function accept (body: any, path: string[], unordered: boolean): any {
  if (body === null || typeof body !== 'object' || !(path[0] in body)) return body
  const [key, ...rest] = path
  const copy = { ...body }
  if (rest.length) copy[key] = accept(body[key], rest, unordered)
  else if (unordered && Array.isArray(body[key])) copy[key] = [...body[key]].sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : 1)
  else delete copy[key]
  return copy
}

describe('every probe fixture', () => {
  it('has the recorded probes', () => {
    expect(names.length).toBeGreaterThanOrEqual(62)
    for (const name of Object.keys(ACCEPTED_PROBE_KEYS)) expect(names).toContain(name)
  })
  for (const name of names) {
    it(`matches ${name}`, async () => {
      const accepted = ACCEPTED_PROBE_KEYS[name]
      const pick = (b: any) => (accepted?.keys ?? []).reduce((body, key) => accept(body, key.split('.'), !!accepted.unordered), b)
      const { actual, expected } = await probeMatches(name, pick)
      expect(actual).toEqual(expected)
    })
  }
})
