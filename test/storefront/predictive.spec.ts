import { predictiveJson, productJson, recommendationsJson, requestFromUrl, resolveView, storefrontSampleData as data } from '../../src/shopify'
import type { PredictiveRequest } from '../../src/shopify'
import { loadFixture } from './fixtures'
import { maskVolatile, probeMatches } from './expect-probe'
import { renderProbeSection } from './probe'

type ResultKey = 'products' | 'collections' | 'pages' | 'articles' | 'queries'

/** The parity store makes a new id for each request (`pr_rec_id`, `_psid`), 9 hex digits, the same on every URL of one answer; the engine makes its own, the same for the same request. */
const ID = /(?:_psid|pr_rec_id)=([0-9a-f]+)/g
/** The distinct ids in `value`. */
const idsIn = (value: unknown) => [...new Set([...JSON.stringify(value).matchAll(ID)].map(match => match[1]))]
/** `value` with every id replaced, and the volatile values masked; key order is kept, so `JSON.stringify` of two masked values tells order differences. */
const masked = (value: unknown) => maskVolatile(JSON.parse(JSON.stringify(value).replace(/(_psid|pr_rec_id)=[0-9a-f]+/g, '$1=<id>')))
const same = (actual: unknown, expected: unknown) => expect(JSON.stringify(masked(actual))).toBe(JSON.stringify(masked(expected)))

const suggest = (query: string, prefix = ''): PredictiveRequest => requestFromUrl(`${prefix}/search/suggest?${query}`, data).request.predictive!
const suggestIn = (query: string, ...fields: ResultKey[]) => {
  const results = (predictiveJson(data, suggest(query)) as any).resources.results
  return Object.fromEntries(fields.map(field => [field, (results[field] as Array<{ handle: string }>).map(item => item.handle)]))
}
/** The view an address names (`/fr-eu/...`), as the storefront router resolves it. */
const viewOf = (url: string) => resolveView(data, requestFromUrl(url, data).request)
const byHandle = (handle: string) => data.products!.find(product => product.handle === handle)!

describe('predictive_search', () => {
  it('matches probe-predictive-shirt', async () => {
    const { actual, expected } = await probeMatches('probe-predictive-shirt')
    expect(actual).toEqual(expected)
  })

  // The parity store finds the `hoodie` product for `q=ca` and puts it first. Nothing the dataset holds for it, or for `soft-cotton-hoodie-in-clay`, which has the same variants and is not found, has a word that starts "ca": its title, type, vendor, tags, variant titles, description and metafield are all without one (the product category, which shopify.dev lists as searched, is not in the dataset). The match and the rank come from Shopify's index, so the engine finds `canvas-sneakers` alone, and this test fails when it finds anything else.
  it('matches probe-predictive-prefix except for the hoodie the parity store finds for "ca"', async () => {
    const { actual, expected } = await probeMatches('probe-predictive-prefix')
    expect((expected as { products: string[] }).products).toEqual(['hoodie', 'canvas-sneakers'])
    expect(actual).toEqual({ ...(expected as object), products: ['canvas-sneakers'] })
  })

  it('has no predictive_search on a page that is not a predictive search', async () => {
    expect(await renderProbeSection('probe-predictive')).toEqual(loadFixture('ajax-sections-page').steps[0].body)
  })

  it('is not performed without terms', async () => {
    const page = requestFromUrl('/search/suggest?q=%20&section_id=probe-predictive', data)
    expect(await renderProbeSection('probe-predictive', { request: page.request })).toEqual({ performed: false, terms: ' ', types: ['collection', 'page', 'product', 'query'], products: [], collections: [], pages: [], articles: [], queries: [] })
  })

  it('lists pages, articles and collections by title, and a shared limit in the order of the API\'s types', async () => {
    const lists = async (query: string) => renderProbeSection('probe-predictive', { request: requestFromUrl(`/search/suggest?${query}&section_id=probe-predictive`, data).request })
    expect(await lists('q=liquid&resources[type]=page,article')).toMatchObject({ pages: ['liquid'], articles: ['making-liquid', 'liquidpeak-450'] })
    expect(await lists('q=liquid&resources[type]=page,article&resources[limit]=2')).toMatchObject({ pages: ['liquid'], articles: ['making-liquid'] })
    expect(await lists('q=liquid&resources[type]=page,article&resources[limit]=2&resources[limit_scope]=each')).toMatchObject({ pages: ['liquid'], articles: ['making-liquid', 'liquidpeak-450'] })
    expect(await lists('q=men&resources[type]=product,collection,page,article&resources[limit]=2&resources[limit_scope]=each')).toMatchObject({ products: ['sweatpants', 'men-t-shirt'], collections: ['men'], pages: [], articles: [] })
    expect(await lists('q=men&resources[type]=product,collection&resources[limit]=2')).toMatchObject({ products: ['sweatpants', 'men-t-shirt'], collections: [] })
    expect(await lists('q=men&resources[type]=collection')).toMatchObject({ products: [], collections: ['men'] })
  })

  it('puts unavailable products last, or drops them, or leaves them where they are', () => {
    expect(suggestIn('q=hoodie&resources[type]=product', 'products').products).toEqual(['hoodie-old', 'soft-cotton-hoodie-in-jam', 'soft-cotton-hoodie-in-ocean', 'soft-cotton-hoodie-in-violet', 'soft-cotton-hoodie-in-green', 'hoodie', 'soft-cotton-hoodie-in-clay'])
    expect(suggestIn('q=hoodie&resources[type]=product&resources[options][unavailable_products]=hide', 'products').products).not.toContain('soft-cotton-hoodie-in-clay')
    expect(suggestIn('q=hoodie&resources[type]=product&resources[options][unavailable_products]=show&resources[limit]=3', 'products').products).toEqual(['hoodie-old', 'soft-cotton-hoodie-in-jam', 'soft-cotton-hoodie-in-clay'])
  })

  // https://shopify.dev/docs/api/ajax/reference/predictive-search: "Product results always search all product fields" and ignore `resources[options][fields]`; only the title, type, vendor and variant titles take a partly typed word. The fixtures agree: `ca` does not find the six products whose descriptions hold `carry`, `can`, `casual` and `cashmere`.
  it('searches every product field, whatever the request names, and lets only some of them start a word', () => {
    const hoodies = ['hoodie-old', 'soft-cotton-hoodie-in-jam']
    expect(suggestIn('q=fleece&resources[type]=product&resources[limit]=2', 'products').products).toEqual(hoodies)
    expect(suggestIn('q=fleece&resources[type]=product&resources[limit]=2&resources[options][fields]=title', 'products').products).toEqual(hoodies)
    expect(suggestIn('q=flee&resources[type]=product', 'products').products).toEqual([])
    expect(suggestIn('q=ca&resources[type]=product', 'products').products).toEqual(['canvas-sneakers'])
    expect(suggestIn('q=unisex&resources[type]=product&resources[limit]=3', 'products').products).toEqual(['slides', 'sweatpants', 'hoodie-old'])
    expect(suggestIn('q=unis&resources[type]=product', 'products').products).toEqual([])
    expect(suggestIn('q=fleece%20hoo&resources[type]=product&resources[limit]=2', 'products').products).toEqual(hoodies)
    expect(suggestIn('q=hoodie%20fle&resources[type]=product', 'products').products).toEqual([])
  })

  it('matches a variant SKU as a whole word', () => {
    const skus = { shop: { name: 'Shop', domain: 'shop.example', currency: 'USD' }, products: [{ id: 1, handle: 'mug', title: 'Mug', variants: [{ id: 11, title: 'Default Title', price: 1000, available: true, option1: 'Default Title', sku: 'AB-12' }] }] }
    const found = (q: string) => (predictiveJson(skus, requestFromUrl(`/search/suggest?q=${q}&resources[type]=product`, skus).request.predictive!) as any).resources.results.products.map((product: { handle: string }) => product.handle)
    expect(found('ab-12')).toEqual(['mug'])
    expect(found('ab-1')).toEqual([])
    expect(found('mu')).toEqual(['mug'])
  })

  it('searches the fields the request names for pages and articles', () => {
    expect(suggestIn('q=organic&resources[type]=article&resources[options][fields]=title', 'articles').articles).toEqual([])
    expect(suggestIn('q=organic&resources[type]=article&resources[options][fields]=title,body', 'articles').articles).toContain('making-liquid')
  })

  it('ignores a type it does not know, even one that is a property of every object', () => {
    expect(suggestIn('q=men&resources[type]=constructor,product&resources[limit]=2', 'products').products).toEqual(['sweatpants', 'men-t-shirt'])
    expect(Object.keys((predictiveJson(data, suggest('q=men&resources[type]=constructor,product')) as any).resources.results)).toEqual(['products'])
  })
})

describe('/search/suggest.json', () => {
  it('answers as the parity store does, with one id for the whole answer and the keys in the same order', () => {
    const fixture = loadFixture('ajax-suggest-json')
    for (const step of fixture.steps) {
      const page = requestFromUrl(step.url.replace('/search/suggest.json', '/search/suggest'), data)
      const answer = predictiveJson(data, page.request.predictive!)
      same(answer, step.body)
      expect(idsIn(answer).length).toBe(idsIn(step.body).length)
      for (const id of idsIn(answer)) expect(id).toMatch(/^[0-9a-f]{9}$/)
    }
    expect(idsIn(predictiveJson(data, requestFromUrl('/search/suggest?q=shirt&resources[type]=product', data).request.predictive!))).toHaveLength(1)
  })

  it('lists the requested types in the order of the request', () => {
    const results = (predictiveJson(data, suggest('q=men&resources[type]=query,page,product')) as any).resources.results
    expect(Object.keys(results)).toEqual(['queries', 'pages', 'products'])
  })

  it('gives the same tracking id to the same request, and a variant to a query that hits a variant title', () => {
    const first = predictiveJson(data, suggest('q=clay&resources[type]=product&resources[limit]=2')) as any
    expect(predictiveJson(data, suggest('q=clay&resources[type]=product&resources[limit]=2'))).toEqual(first)
    const [hoodie, clay] = first.resources.results.products
    expect(hoodie.url).toMatch(/^\/products\/hoodie\?variant=43695847145494&_pos=1&_psq=clay&_psid=[0-9a-f]{9}&_ss=e$/)
    expect(hoodie.variants.map((v: { title: string }) => v.title)).toEqual(['Clay / Small'])
    expect(clay.url).toMatch(/^\/products\/soft-cotton-hoodie-in-clay\?variant=\d+&_pos=2&_psq=clay&_psid=/)
    expect(idsIn(first)).toHaveLength(1)
  })

  it('lists pages, articles and collections with the fields the API names', () => {
    const results = (predictiveJson(data, suggest('q=liquid&resources[type]=page,article,collection,product')) as any).resources.results
    expect(Object.keys(results.pages[0])).toEqual(['author', 'body', 'handle', 'id', 'published_at', 'title', 'url'])
    expect(results.pages[0].url).toMatch(/^\/pages\/liquid\?_pos=1&_psq=liquid&_psid=[0-9a-f]{9}&_ss=e$/)
    expect(Object.keys(results.articles[0])).toEqual(['author', 'body', 'handle', 'id', 'image', 'published_at', 'summary_html', 'tags', 'title', 'url'])
    expect(results.articles[1].url).toMatch(/^\/blogs\/news\/liquidpeak-450\?_pos=2&/)
    const collection = (predictiveJson(data, suggest('q=men&resources[type]=collection')) as any).resources.results.collections[0]
    expect(Object.keys(collection)).toEqual(['body', 'handle', 'id', 'featured_image', 'published_at', 'title', 'url'])
    expect(collection.featured_image).toMatchObject({ alt: 'Men', width: 1024, height: 1024, aspect_ratio: 1 })
  })

  it('hands out an answer the caller may change', () => {
    const ask = () => predictiveJson(data, suggest('q=shirt&resources[type]=product')) as any
    const before = JSON.stringify(ask())
    const answer = ask()
    answer.resources.results.products[0].tags.push('changed')
    answer.resources.results.products[0].title = 'changed'
    const articles = (predictiveJson(data, suggest('q=liquid&resources[type]=article')) as any).resources.results.articles
    articles[0].tags.push('changed')
    expect(JSON.stringify(ask())).toBe(before)
    expect((predictiveJson(data, suggest('q=liquid&resources[type]=article')) as any).resources.results.articles[0].tags).not.toContain('changed')
  })

  it('prices, titles and URLs follow the view', () => {
    const url = '/fr-eu/search/suggest?q=shirt&resources[type]=product,collection'
    const view = viewOf(url)
    const eu = (predictiveJson(data, suggest('q=shirt&resources[type]=product,collection', '/fr-eu'), view) as any).resources.results
    expect(eu.products[0]).toMatchObject({ handle: 'men-t-shirt', title: 'T-shirt pour homme', price: '36.95' })
    expect(eu.products[0].url).toMatch(/^\/fr-eu\/products\/men-t-shirt\?_pos=1&_psq=shirt&/)
    const sneakers = (predictiveJson(data, suggest('q=white%204&resources[type]=product', '/fr-eu'), view) as any).resources.results.products[0]
    expect(sneakers).toMatchObject({ handle: 'white-leather-sneakers', price: '82.95', compare_at_price_min: '0.00', compare_at_price_max: '0.00' })
    expect(sneakers.variants).toHaveLength(1)
    expect(sneakers.variants[0]).toMatchObject({ title: '4', price: '82.95', compare_at_price: null })
    expect(sneakers.variants[0].url).toMatch(/^\/fr-eu\/products\/white-leather-sneakers\?variant=\d+$/)
    expect(sneakers.url).toMatch(/^\/fr-eu\/products\/white-leather-sneakers\?variant=\d+&_pos=1&/)
    const primary = (predictiveJson(data, suggest('q=white%204&resources[type]=product')) as any).resources.results.products[0]
    expect(primary).toMatchObject({ price: '90.00', compare_at_price_min: '110.00' })
    expect(primary.variants[0].compare_at_price).toBe('110.00')
  })

  // https://shopify.dev/docs/api/ajax/reference/predictive-search: "Collection suggestions are based on the store's primary language" and "a customer's search won't be compared to a collection's translated content"
  it('finds a collection by its title in the primary language, whatever language the view is in', () => {
    const view = viewOf('/fr-ca/search/suggest?q=tops')
    const collections = (q: string) => (predictiveJson(data, suggest(`q=${q}&resources[type]=collection`, '/fr-ca'), view) as any).resources.results.collections
    expect(collections('tops').map((c: { handle: string }) => c.handle)).toEqual(['tops'])
    expect(collections('hauts')).toEqual([])
    expect(collections('tops')[0].url).toMatch(/^\/fr-ca\/collections\/tops\?_pos=1&/)
  })
})

describe('/recommendations/products.json', () => {
  const fixture = loadFixture('ajax-recommendations-json').steps[0]
  const recorded = fixture.body as { intent: string, products: Array<Record<string, unknown> & { handle: string, id: number, url: string }> }
  const params = new URL(fixture.url, 'https://x.invalid').searchParams
  const request = { productId: params.get('product_id')!, limit: params.get('limit'), intent: params.get('intent') }
  const answer = recommendationsJson(data, request) as { intent: string, products: Array<Record<string, unknown> & { handle: string, id: number, url: string }> }

  // The parity store samples the products at random from the collections the product is in: its two recordings of this request (fixtures `ajax-recommendations-json` and `probe-recommendations-related`) share two of their four products (`soft-cotton-hoodie-in-jam`, first in both, and `women-t-shirt`, in different places), and the dataset lists the `hoodie` in no collection. So which products come back, and in what order, cannot be compared with the recording; what can be is how each product is printed, which the next tests pin.
  it('prints each recommended product as the parity store prints it', () => {
    for (const product of recorded.products) {
      const path = product.url.split('?')[0]
      const engine = productJson(data, product.handle)!
      same({ ...engine, url: path }, { ...product, url: path })
    }
  })

  it('prints the product the engine and the parity store both recommend as the parity store does', () => {
    const jam = answer.products.find(product => product.handle === 'soft-cotton-hoodie-in-jam')!
    same(jam, recorded.products.find(product => product.handle === 'soft-cotton-hoodie-in-jam'))
  })

  it('adds the tracking parameters in the parity store\'s order, with one id for the whole answer', () => {
    expect(Object.keys(answer)).toEqual(['products', 'intent'])
    expect(answer.intent).toBe(recorded.intent)
    const parameters = (url: string) => [...new URL(url, 'https://x.invalid').searchParams.entries()]
    expect(idsIn(recorded)).toHaveLength(1)
    expect(idsIn(answer)).toHaveLength(1)
    expect(idsIn(answer)[0]).toMatch(/^[0-9a-f]{9}$/)
    for (const product of answer.products) {
      const mine = parameters(product.url)
      expect(mine.map(([name]) => name)).toEqual(parameters(recorded.products[0].url).map(([name]) => name))
      expect(Object.fromEntries(mine)).toMatchObject({ pr_prod_strat: 'collection_fallback', pr_seq: 'uniform', pr_rec_pid: String(product.id), pr_ref_pid: request.productId, pr_rec_id: idsIn(answer)[0] })
    }
    expect(Object.fromEntries(parameters(recorded.products[0].url))).toMatchObject({ pr_prod_strat: 'collection_fallback', pr_seq: 'uniform', pr_ref_pid: request.productId })
  })

  // Evidence for the engine's pool: every product either recording draws is in the `tops` collection, and the engine draws from the collections the product is in. The dataset lacks the `hoodie`'s membership (the parity store has it in `tops`), so the engine falls back to its type; when the dataset gains it, this expectation changes with it.
  it('recommends from the collections the product is in, then its type, as Debutify\'s rule says', () => {
    const tops = data.collections!.find(collection => collection.handle === 'tops')!.products
    const drawn = [...recorded.products, ...(loadFixture('probe-recommendations-related').steps[0].body as { products: string[] }).products.map(handle => ({ handle }))]
    expect(drawn).toHaveLength(8)
    for (const product of drawn) expect(tops).toContain(product.handle)
    expect(data.collections!.filter(collection => collection.products.includes('hoodie'))).toEqual([])
    expect(answer.intent).toBe('related')
    expect(answer.products.map(product => product.handle)).toEqual(['hoodie-old', 'soft-cotton-hoodie-in-jam', 'soft-cotton-hoodie-in-ocean', 'soft-cotton-hoodie-in-violet'])
    const all = recommendationsJson(data, { productId: request.productId, limit: 10 }) as typeof answer
    expect(all.products.map(product => product.handle)).not.toContain('hoodie')
    expect(all.products.map(product => product.handle)).not.toContain('soft-cotton-hoodie-in-clay')
  })

  it('answers a complementary request as the parity store does, with no products', () => {
    const complementary = loadFixture('probe-recommendations-complementary').steps[0]
    const step = new URL(complementary.url, 'https://x.invalid').searchParams
    expect(recommendationsJson(data, { productId: step.get('product_id')!, limit: step.get('limit'), intent: step.get('intent') })).toEqual({ products: [], intent: (complementary.body as { intent: string }).intent })
  })

  it('gives no products for a request it cannot answer', () => {
    expect(recommendationsJson(data, { productId: 1 })).toEqual({ products: [], intent: 'related' })
    expect(recommendationsJson(data, { productId: request.productId, intent: 'nope' })).toEqual({ products: [], intent: 'nope' })
  })

  describe('with the visitor\'s cart', () => {
    const requestOf = { productId: byHandle('men-t-shirt').id, limit: 4 }
    const handles = (answer: Record<string, unknown>) => (answer.products as Array<{ handle: string }>).map(product => product.handle)
    const five = handles(recommendationsJson(data, { ...requestOf, limit: 5 }))
    const inCart = five[0]
    const cart = { token: 't', lines: [{ variantId: byHandle(inCart).variants[0].id, quantity: 1, properties: {}, sellingPlanId: null }], note: null, attributes: {}, discountCodes: [] }

    it('leaves out the products in it, the rest in their order, the limit filled from the products after them', () => {
      expect(handles(recommendationsJson(data, requestOf, undefined, cart))).toEqual(five.slice(1))
    })

    it('leaves out what a page rendered for that cart leaves out (shopify.dev: products in the cart are not recommended)', async () => {
      const page = requestFromUrl(`/recommendations/products?product_id=${requestOf.productId}&limit=4`, data).request
      const section = await renderProbeSection('probe-recommendations', { request: page, cart }) as { products: string[] }
      expect(section.products).toEqual(handles(recommendationsJson(data, requestOf, undefined, cart)))
      expect(section.products).not.toContain(inCart)
    })

    it('answers as before without one, and an empty cart leaves nothing out', () => {
      expect(handles(recommendationsJson(data, requestOf, undefined, { ...cart, lines: [] }))).toEqual(five.slice(0, 4))
      expect(handles(recommendationsJson(data, requestOf))).toEqual(five.slice(0, 4))
    })
  })

  it('takes a limit from 1 to 10, and 10 when there is none', () => {
    const count = (limit?: number | string | null) => (recommendationsJson(data, { productId: byHandle('men-t-shirt').id, limit }) as { products: unknown[] }).products.length
    expect(count()).toBe(10)
    expect(count(null)).toBe(10)
    expect(count('4')).toBe(4)
    expect(count(0)).toBe(1)
    expect(count('99')).toBe(10)
    expect(count('abc')).toBe(10)
  })

  it('prints prices, URLs and compare-at prices of the view', () => {
    const view = viewOf('/fr-eu/recommendations/products')
    const eu = (recommendationsJson(data, { productId: byHandle('women-t-shirt').id, limit: 10 }, view) as { products: Array<Record<string, any>> }).products
    const shirt = eu.find(product => product.handle === 'men-t-shirt')!
    expect(shirt).toMatchObject({ title: 'T-shirt pour homme', price: 3695 })
    expect(shirt.url).toMatch(/^\/fr-eu\/products\/men-t-shirt\?pr_prod_strat=/)
    expect(shirt.variants[0].price).toBe(3695)
    const sneakers = (recommendationsJson(data, { productId: byHandle('canvas-sneakers').id, limit: 10 }, view) as { products: Array<Record<string, any>> }).products.find(product => product.handle === 'white-leather-sneakers')!
    expect(sneakers).toMatchObject({ price: 8295, compare_at_price: null, compare_at_price_min: 0, compare_at_price_max: 0 })
    expect(sneakers.variants.every((variant: { compare_at_price: unknown }) => variant.compare_at_price === null)).toBe(true)
    const primary = (recommendationsJson(data, { productId: byHandle('canvas-sneakers').id, limit: 10 }) as { products: Array<Record<string, any>> }).products.find(product => product.handle === 'white-leather-sneakers')!
    expect(primary).toMatchObject({ price: 9000, compare_at_price: 11000 })
  })
})
