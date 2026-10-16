import { predictiveJson, recommendationsJson, requestFromUrl, storefrontSampleData as data } from '../../src/shopify'
import type { PredictiveRequest } from '../../src/shopify'
import { loadFixture } from './fixtures'
import { maskVolatile, probeMatches } from './expect-probe'
import { renderProbeSection } from './probe'

/** The parity store makes a new id for each request (`pr_rec_id`, `_psid`), 9 hex digits; the engine makes its own, the same for the same request. */
const withoutIds = (value: unknown) => maskVolatile(JSON.parse(JSON.stringify(value).replace(/(_psid|pr_rec_id)=[0-9a-f]{9}/g, '$1=<id>')))

const suggest = (query: string): PredictiveRequest => requestFromUrl(`/search/suggest?${query}`, data).request.predictive!
const suggestIn = (query: string, ...fields: Array<'products' | 'collections' | 'pages' | 'articles' | 'queries'>) => {
  const results = (predictiveJson(data, suggest(query)) as any).resources.results
  return Object.fromEntries(fields.map(field => [field, (results[field] as Array<{ handle: string }>).map(item => item.handle)]))
}

describe('predictive_search', () => {
  it('matches probe-predictive-shirt', async () => {
    const { actual, expected } = await probeMatches('probe-predictive-shirt')
    expect(actual).toEqual(expected)
  })

  // The parity store finds the `hoodie` product for `q=ca` (and puts it first). Nothing the dataset holds for it, or for `soft-cotton-hoodie-in-clay`, which has the same variants and is not found, has a word that starts "ca": its title, type, vendor, tags, variant titles, description and metafield are all without one. The ranking and the match come from Shopify's index, so the engine finds `canvas-sneakers` alone, and this test fails when it finds anything else.
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
    expect(await lists('q=men&resources[type]=product,collection,page,article')).toMatchObject({ products: ['men-t-shirt', 'men-crewneck'], collections: ['men'], pages: [], articles: [] })
    expect(await lists('q=men&resources[type]=collection')).toMatchObject({ products: [], collections: ['men'] })
  })

  it('puts unavailable products last, or drops them, or leaves them where they are', () => {
    expect(suggestIn('q=hoodie&resources[type]=product', 'products').products).toEqual(['hoodie-old', 'soft-cotton-hoodie-in-jam', 'soft-cotton-hoodie-in-ocean', 'soft-cotton-hoodie-in-violet', 'soft-cotton-hoodie-in-green', 'hoodie', 'soft-cotton-hoodie-in-clay'])
    expect(suggestIn('q=hoodie&resources[type]=product&resources[options][unavailable_products]=hide', 'products').products).not.toContain('soft-cotton-hoodie-in-clay')
    expect(suggestIn('q=hoodie&resources[type]=product&resources[options][unavailable_products]=show&resources[limit]=3', 'products').products).toEqual(['hoodie-old', 'soft-cotton-hoodie-in-jam', 'soft-cotton-hoodie-in-clay'])
  })

  it('searches the fields the request names', () => {
    expect(suggestIn('q=fleece&resources[type]=product', 'products').products).toEqual([])
    expect(suggestIn('q=fleece&resources[type]=product&resources[limit]=2&resources[options][fields]=title,body', 'products').products).toEqual(['hoodie-old', 'soft-cotton-hoodie-in-jam'])
    expect(suggestIn('q=organic&resources[type]=product&resources[options][fields]=body', 'products').products).toEqual(['men-t-shirt', 'women-t-shirt'])
    expect(suggestIn('q=unisex&resources[type]=product&resources[limit]=3&resources[options][fields]=tag', 'products').products).toEqual(['slides', 'sweatpants', 'hoodie-old'])
    expect(suggestIn('q=organic&resources[type]=article&resources[options][fields]=title', 'articles').articles).toEqual([])
    expect(suggestIn('q=organic&resources[type]=article&resources[options][fields]=title,body', 'articles').articles).toContain('making-liquid')
  })

  it('ignores a type it does not know, even one that is a property of every object', () => {
    expect(suggestIn('q=men&resources[type]=constructor,product', 'products').products).toEqual(['men-t-shirt', 'men-crewneck'])
    expect(Object.keys((predictiveJson(data, suggest('q=men&resources[type]=constructor,product')) as any).resources.results)).toEqual(['products'])
  })
})

describe('/search/suggest.json', () => {
  it('answers as the parity store does', () => {
    const fixture = loadFixture('ajax-suggest-json')
    for (const step of fixture.steps) {
      const page = requestFromUrl(step.url.replace('/search/suggest.json', '/search/suggest'), data)
      expect(withoutIds(predictiveJson(data, page.request.predictive!))).toEqual(withoutIds(step.body))
    }
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
    expect(hoodie.url.match(/_psid=([0-9a-f]+)/)[1]).toBe(clay.url.match(/_psid=([0-9a-f]+)/)[1])
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

  it('lists URLs under the view\'s prefix', () => {
    const page = requestFromUrl('/en-eu/search/suggest?q=shirt&resources[type]=product', data)
    const products = (predictiveJson(data, page.request.predictive!, { market: page.request.market!, language: page.request.language!, prefix: '/en-eu' }) as any).resources.results.products
    expect(products[0].url).toMatch(/^\/en-eu\/products\/men-t-shirt\?_pos=1&_psq=shirt&/)
  })
})

describe('/recommendations/products.json', () => {
  const fixture = loadFixture('ajax-recommendations-json').steps[0]
  const params = new URL(fixture.url, 'https://x.invalid').searchParams
  const request = { productId: params.get('product_id')!, limit: params.get('limit'), intent: params.get('intent') }

  // The parity store samples the products at random from the collections the product is in: its two recordings of this request (fixtures `ajax-recommendations-json` and `probe-recommendations-related`) share only the first product, and the dataset lists the `hoodie` in no collection. So the answer is compared with the dataset put the way the recording says it was: the `hoodie` in `tops` with exactly the products it got.
  it('answers as the parity store does, given the collection the parity store drew from', () => {
    const asRecorded = { ...data, collections: data.collections!.map(collection => collection.handle === 'tops' ? { ...collection, products: ['hoodie', 'soft-cotton-hoodie-in-jam', 'puffer', 'men-crewneck', 'women-t-shirt'] } : collection) }
    const answer = recommendationsJson(asRecorded, request)
    expect(Object.keys(answer)).toEqual(['products', 'intent'])
    expect(withoutIds(answer)).toEqual(withoutIds(fixture.body))
  })

  it('recommends from what the dataset holds: the collections the product is in, then its type', () => {
    const answer = recommendationsJson(data, request) as { intent: string, products: Array<{ handle: string, url: string }> }
    expect(answer.intent).toBe('related')
    expect(answer.products.map(product => product.handle)).toEqual(['hoodie-old', 'soft-cotton-hoodie-in-jam', 'soft-cotton-hoodie-in-ocean', 'soft-cotton-hoodie-in-violet'])
    expect(answer.products[0].url).toMatch(/^\/products\/hoodie-old\?pr_prod_strat=collection_fallback&pr_rec_id=[0-9a-f]{9}&pr_rec_pid=7982904639510&pr_ref_pid=10489561382934&pr_seq=uniform$/)
  })

  it('answers a complementary request as the parity store does, with no products', () => {
    const recorded = loadFixture('probe-recommendations-complementary').steps[0]
    const step = new URL(recorded.url, 'https://x.invalid').searchParams
    expect(recommendationsJson(data, { productId: step.get('product_id')!, limit: step.get('limit'), intent: step.get('intent') })).toEqual({ products: [], intent: (recorded.body as { intent: string }).intent })
  })

  it('gives no products for a request it cannot answer', () => {
    expect(recommendationsJson(data, { productId: 1 })).toEqual({ products: [], intent: 'related' })
    expect(recommendationsJson(data, { productId: request.productId, intent: 'nope' })).toEqual({ products: [], intent: 'nope' })
  })
})
