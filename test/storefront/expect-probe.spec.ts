import { readdirSync } from 'fs'
import { join } from 'path'
import { loadFixture } from './fixtures'
import { maskVolatile, probeMatches, VOLATILE, VOLATILE_PLACEHOLDER } from './expect-probe'

const V = VOLATILE_PLACEHOLDER

describe('maskVolatile', () => {
  it('replaces a listed path whatever the array index with the placeholder, and keeps everything beside it', () => {
    const body = {
      token: '<token>',
      items: [{ id: 1, featured_image: { url: 'a' }, title: 'One' }, { id: 2, featured_image: { url: 'b' }, title: 'Two' }],
      ajax: { title: 'Hoodie', created_at: 'x', published_at: 'y', variants: [{ id: 3, featured_image: { id: 4, src: 's', created_at: 'z', updated_at: 'w' }, title: 'Red' }] }
    }
    expect(maskVolatile(body)).toEqual({
      token: V,
      items: [{ id: 1, featured_image: { url: 'a' }, title: 'One' }, { id: 2, featured_image: { url: 'b' }, title: 'Two' }],
      ajax: { title: 'Hoodie', created_at: V, published_at: V, variants: [{ id: 3, featured_image: { id: 4, src: 's', created_at: V, updated_at: V }, title: 'Red' }] }
    })
    expect(body.token).toBe('<token>')
  })
  it('still needs the key: a missing volatile value differs, two different ones do not', () => {
    expect(maskVolatile({ token: 'a' })).toEqual(maskVolatile({ token: 'b' }))
    expect(maskVolatile({ token: 'a' })).not.toEqual(maskVolatile({}))
    expect(maskVolatile({ items_added: [{ id: 'u', variant_id: 1 }] })).not.toEqual(maskVolatile({ items_added: [{ variant_id: 1 }] }))
  })
  it('matches a path from the body\'s root, so a name that is volatile only in one place stays elsewhere', () => {
    expect(maskVolatile({ created_at: 'a product.js', title: 'Hoodie' })).toEqual({ created_at: V, title: 'Hoodie' })
    expect(maskVolatile({ article: { created_at: 'kept' }, published_at: 'a product.js' })).toEqual({ article: { created_at: 'kept' }, published_at: V })
  })
  it('passes scalars and null through', () => {
    expect(maskVolatile(null)).toBeNull()
    expect(maskVolatile('x')).toBe('x')
    expect(maskVolatile([1, null, 'a'])).toEqual([1, null, 'a'])
  })
  it('leaves none of the live store\'s values in any recorded body', () => {
    const volatile = /"[0-9a-f]{40}"|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{4}-\d\d-\d\dT\d\d:\d\d|<token>/
    for (const file of readdirSync(join(__dirname, 'fixtures'))) {
      const name = file.replace(/\.json$/, '')
      loadFixture(name).steps.forEach((step, i) => expect([name, i, JSON.stringify(maskVolatile(step.body)).match(volatile)?.[0]]).toEqual([name, i, undefined]))
    }
  })
  it('keeps what a product probe is for, the variant\'s featured image included but for its timestamps', () => {
    const [step] = loadFixture('probe-product-default').steps
    const product = (maskVolatile(step.body) as any).ajax
    expect(product).toMatchObject({ id: 10489561382934, title: 'Hoodie', handle: 'hoodie', price: 9000, created_at: V, published_at: V })
    expect(typeof product.featured_image).toBe('string')
    expect(product.variants[0]).toMatchObject({ id: 43695846621206, title: 'Red / Small' })
    expect(product.variants[0].featured_image).toMatchObject({ id: 39774600364054, product_id: 10489561382934, width: 4096, height: 4096, created_at: V, updated_at: V })
    expect(product.variants[0].featured_image.src).toMatch(/^https:\/\//)
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
  it('throws when `pick` finds nothing, or only a volatile value, in the recorded body', async () => {
    await expect(probeMatches('probe-product-default', body => body.ajax.nope)).rejects.toThrow('pick found nothing in the recorded body of probe-product-default')
    await expect(probeMatches('probe-product-default', body => body.ajax.created_at)).rejects.toThrow('pick found nothing')
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
