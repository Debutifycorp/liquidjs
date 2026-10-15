import { readdirSync } from 'fs'
import { join } from 'path'
import { loadFixture } from './fixtures'
import { probeMatches, stripVolatile, VOLATILE } from './expect-probe'

describe('stripVolatile', () => {
  it('drops a listed path whatever the array index, and keeps everything beside it', () => {
    const body = {
      token: '<token>',
      items: [{ id: 1, featured_image: { url: 'a' }, title: 'One' }, { id: 2, featured_image: { url: 'b' }, title: 'Two' }],
      ajax: { title: 'Hoodie', created_at: 'x', published_at: 'y', variants: [{ id: 3, featured_image: { id: 4, created_at: 'z' }, title: 'Red' }] }
    }
    expect(stripVolatile(body)).toEqual({
      items: [{ id: 1, title: 'One' }, { id: 2, title: 'Two' }],
      ajax: { title: 'Hoodie', variants: [{ id: 3, title: 'Red' }] }
    })
    expect(body.items[0]).toHaveProperty('featured_image')
  })
  it('matches a path from the body\'s root, so a name that is volatile only in one place stays elsewhere', () => {
    expect(stripVolatile({ created_at: 'a product.js', title: 'Hoodie' })).toEqual({ title: 'Hoodie' })
    expect(stripVolatile({ article: { created_at: 'kept' }, published_at: 'a product.js' })).toEqual({ article: { created_at: 'kept' } })
  })
  it('passes scalars and null through', () => {
    expect(stripVolatile(null)).toBeNull()
    expect(stripVolatile('x')).toBe('x')
    expect(stripVolatile([1, null, 'a'])).toEqual([1, null, 'a'])
  })
  it('leaves none of the live store\'s values in any recorded body', () => {
    const volatile = /"[0-9a-f]{40}"|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{4}-\d\d-\d\dT\d\d:\d\d|<token>/
    for (const file of readdirSync(join(__dirname, 'fixtures'))) {
      const name = file.replace(/\.json$/, '')
      loadFixture(name).steps.forEach((step, i) => expect([name, i, JSON.stringify(stripVolatile(step.body)).match(volatile)?.[0]]).toEqual([name, i, undefined]))
    }
  })
  it('keeps what a product probe is for', () => {
    const [step] = loadFixture('probe-product-default').steps
    const product = (stripVolatile(step.body) as any).ajax
    expect(product).toMatchObject({ id: 10489561382934, title: 'Hoodie', handle: 'hoodie', price: 9000 })
    expect(Object.keys(product)).not.toEqual(expect.arrayContaining(['created_at']))
    expect(product.variants[0]).toMatchObject({ id: 43695846621206, title: 'Red / Small' })
    expect(product.variants[0]).not.toHaveProperty('featured_image')
  })
})

describe('VOLATILE', () => {
  it('gives every group of paths its reason', () => {
    for (const entry of VOLATILE) {
      expect(entry.reason.length).toBeGreaterThan(20)
      expect(entry.paths.length).toBeGreaterThan(0)
    }
  })
})

describe('probeMatches', () => {
  it('renders the probe of a fixture with the engine and returns both sides for `toEqual`', async () => {
    const { actual, expected } = await probeMatches('probe-recommendations-complementary')
    expect(expected).toEqual({ performed: true, intent: 'complementary', products_count: 0, products: [] })
    expect(actual).toEqual(expected)
  })
  it('hands both sides to `pick`, and renders in the address\'s locale', async () => {
    const { actual, expected } = await probeMatches('probe-page-fr-ca', body => [body.request.path, body.request.page_type, body.request.locale])
    expect(expected).toEqual(['/fr-ca/pages/about', 'page', 'fr'])
    expect(actual).toEqual(expected)
  })
  it('renders the probe step of a fixture that ends on another request', async () => {
    // `ajax-cart-session` ends on `GET /cart.js`, which no template renders; its probe is step 10, `GET /cart?view=probe`
    const { actual, expected } = await probeMatches('ajax-cart-session', body => Object.keys(body))
    expect(expected).toContain('ajax')
    expect(actual).toEqual(expected)
  })
})
