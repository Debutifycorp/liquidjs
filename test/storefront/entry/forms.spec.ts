import { storefrontSampleData } from '../../../src/shopify'
import type { StoreData } from '../../../src/shopify'
import { loadFixture } from '../fixtures'
import { harness, harnessTheme } from './harness'

const form = (fields: Record<string, string>) => new URLSearchParams(fields).toString()

describe('forms', () => {
  it('changes the cart from form posts and redirects as the parity store does', async () => {
    const { send } = harness()
    const steps = loadFixture('ajax-cart-form-add').steps
    for (const step of steps.slice(0, 3)) {
      const answer = await send(step.method, step.url, step.form ? form(step.form) : undefined)
      // step 2 posts the checkout button: Shopify redirects to its own checkout, `/checkouts/cn/<cart token>/en-us?_r=<signature>`, and so does the storefront; the token and the signature are not the recording's
      const masked = (location: string | null) => location?.replace(/(\/checkouts\/cn\/)[^/?]+/, '$1<token>').replace(/([?&]_r=)[^&]+/, '$1<token>')
      expect([step.url, answer.status, masked(answer.headers.get('location'))]).toEqual([step.url, step.status, step.location])
    }
    expect((await send('GET', '/cart.js')).json).toMatchObject({ item_count: (steps[3].body as any).item_count })
  })
  it('shows a cart form error on its own page', async () => {
    const { send } = harness()
    // the hoodie's Clay / Small variant, sold out
    const answer = await send('POST', '/cart/add', form({ id: '43695847145494', quantity: '1', form_type: 'product' }))
    expect(answer.status).toBe(422)
    expect(answer.text).toContain('sold out')
  })
  it('redirects a successful contact form back to its page and shows errors on that page', async () => {
    // no fixture holds these: Shopify's bot challenge answers every scripted POST /contact with 403, so the expectations are the documented behaviour (https://shopify.dev/docs/storefronts/themes/customer-engagement/add-contact-form and https://shopify.dev/docs/api/liquid/objects/form_errors): a valid post goes back to the page it came from with `contact_posted=true` and the form's `#contact_form` fragment, an invalid email renders that page again with `form.errors`
    const { send } = harness()
    const referer = { referer: 'https://store.invalid/pages/about?view=probe-form' }
    const sent = await send('POST', '/contact', form({ form_type: 'contact', utf8: '✓', 'contact[email]': 'shopper@example.com', 'contact[body]': 'Hello', 'contact[name]': 'Pat' }), referer)
    expect([sent.status, sent.headers.get('location')]).toEqual([302, '/pages/about?view=probe-form&contact_posted=true'])
    const failed = await send('POST', '/contact', form({ form_type: 'contact', utf8: '✓', 'contact[email]': 'not-an-email', 'contact[body]': 'Hello' }), referer)
    expect(failed.status).toBe(200)
    expect((failed.json as any).contact).toMatchObject({ posted_successfully: false, errors: [{ field: 'email' }], email: 'not-an-email', body: 'Hello' })
  })
  it('redirects a newsletter signup back with customer_posted=true', async () => {
    // documented, not recorded (same reason): https://shopify.dev/docs/storefronts/themes/customer-engagement/email-consent
    const { send } = harness()
    const joined = await send('POST', '/contact', form({ form_type: 'customer', utf8: '✓', 'contact[email]': 'news@example.com', 'contact[tags]': 'newsletter' }), { referer: 'https://store.invalid/' })
    expect([joined.status, joined.headers.get('location')]).toEqual([302, '/?customer_posted=true'])
  })
  it('redirects /variants/<id> to the product page with that variant, and drops the rest of the query', async () => {
    const { send } = harness()
    const step = loadFixture('flow-variant-route').steps[0]
    const answer = await send('GET', `${step.url}?view=probe`)
    expect([answer.status, answer.headers.get('location')]).toEqual([step.status, step.location])
  })
  it('renders a section asked for at a variant\'s address, as the pickup availability fetch does', async () => {
    // https://shopify.dev/docs/storefronts/themes/delivery-fulfillment/pickup-availability: the request "needs to be prefixed with a /variants/[variant-id] parameter", the section reads `product_variant` and "can't access the Liquid product object". The parity store answered `/variants/<id>/?section_id=pickup-availability` with 200, `text/html; charset=utf-8` and `<div id="shopify-section-pickup-availability" class="shopify-section"></div>` (a store with no pickup location); a variant it lacks answered 404 with an empty body of the same type (read once, not a fixture)
    const files = { ...harnessTheme().files, 'sections/pickup-availability.liquid': "{%- assign pick_up_availabilities = product_variant.store_availabilities | where: 'pick_up_enabled', true -%}{%- if pick_up_availabilities.size > 0 -%}<p>pickup</p>{%- endif -%}", 'sections/variant-probe.liquid': '[{{ product_variant.id }}|{{ product_variant.title }}|{{ product.title }}]' }
    const { send } = harness({ theme: { files } })
    const pickup = await send('GET', '/variants/43695846653974/?section_id=pickup-availability')
    expect([pickup.status, pickup.headers.get('content-type'), pickup.text]).toEqual([200, 'text/html; charset=utf-8', '<div id="shopify-section-pickup-availability" class="shopify-section"></div>'])
    expect((await send('GET', '/variants/43695846653974?section_id=variant-probe')).text).toBe('<div id="shopify-section-variant-probe" class="shopify-section">[43695846653974|Red / Medium|]</div>')
    expect((await send('GET', '/variants/43695846653974?sections=variant-probe,missing')).json).toEqual({ 'variant-probe': '<div id="shopify-section-variant-probe" class="shopify-section">[43695846653974|Red / Medium|]</div>', missing: null })
    expect((await send('GET', '/variants/43695846653974?section_id=missing')).status).toBe(404)
    const gone = await send('GET', '/variants/1/?section_id=pickup-availability')
    expect([gone.status, gone.headers.get('content-type'), gone.text]).toEqual([404, 'text/html; charset=utf-8', ''])
    expect((await send('GET', '/variants/43695846653974/')).status).toBe(302)
  })
  it('switches country and language and redirects under the new locale prefix', async () => {
    for (const name of ['flow-localization-country', 'flow-localization-language']) {
      const { send } = harness()
      const [post, page] = loadFixture(name).steps
      const moved = await send('POST', '/localization', form(post.form!))
      expect([name, moved.status, moved.headers.get('location')]).toEqual([name, post.status, post.location])
      const shown = await send('GET', page.url)
      expect((shown.json as any).localization).toEqual((page.body as any).localization)
    }
  })
  it('reads the language from locale_code as well as language_code', async () => {
    // Dawn's language selector (https://github.com/Shopify/dawn/blob/main/snippets/language-localization.liquid) holds `<input type="hidden" name="locale_code">`, and a theme built on it posts that name, not the `language_code` of the recorded post (fixture `flow-localization-language`); Shopify answers both, so the answer is the recorded one
    const [post] = loadFixture('flow-localization-language').steps
    const { language_code: language, ...rest } = post.form!
    const { send } = harness()
    const moved = await send('POST', '/localization', form({ ...rest, locale_code: language }))
    expect([moved.status, moved.headers.get('location')]).toEqual([post.status, post.location])
    // a language_code wins when both are sent
    const both = await send('POST', '/localization', form({ ...rest, language_code: language, locale_code: 'en' }))
    expect(both.headers.get('location')).toBe(post.location)
  })
  it('keeps redirects on the store, under the base path', async () => {
    const { send } = harness({}, { visitor: 'test-visitor-key-0001', basePath: '/p/tok' })
    for (const [target, expected] of [['//evil.example/x', '/p/tok'], ['https://evil.example/', '/p/tok'], ['/\\evil', '/p/tok'], ['/cart.js', '/p/tok/cart.js'], ['/p/tok/cart', '/p/tok/cart']]) {
      const answer = await send('GET', `/p/tok/discount/WELCOME10?redirect=${encodeURIComponent(target)}`)
      expect([target, answer.headers.get('location')]).toEqual([target, expected])
    }
  })
  it('answers checkout and the account pages with the notice page, or the caller\'s', async () => {
    const { send } = harness()
    for (const url of ['/checkouts/cn/abc/en-us', '/customer_authentication/redirect?locale=en&region_country=US']) {
      const answer = await send('GET', url, undefined, { referer: 'https://store.invalid/cart' })
      expect([url, answer.status, answer.text.includes('Available in your own store'), answer.text.includes('href="/cart"')]).toEqual([url, 200, true, true])
    }
    const custom = harness({ notice: kind => new Response(`mine ${kind}`) })
    expect((await custom.send('GET', '/checkouts/cn/abc/en-us')).text).toBe('mine checkout')
    expect((await send('POST', '/customer_authentication/redirect', form({ form_type: 'customer_login' }))).text).toContain('Available in your own store')
  })
})

describe('the form endpoints asked for JSON', () => {
  // https://github.com/Shopify/dawn/blob/main/assets/product-form.js posts the add form's FormData to `routes.cart_add_url` (`/cart/add`, no extension) with `Accept: application/javascript` and `X-Requested-With: XMLHttpRequest`, and reads the answer as JSON; a theme's cart code posts `cart_change_url` and `cart_update_url` the same way with `Accept: application/json`. No shopify.dev page states the rule and no recording holds it: it is what those themes need and what the platform does for them. A request that asks for neither stays a form post.
  const ADD = form({ id: '43696940613654', quantity: '1' })
  it('answers /cart/add with the added line when the request asks for JavaScript, and when it is an XMLHttpRequest', async () => {
    const asks: Array<Record<string, string>> = [{ accept: 'application/javascript', 'x-requested-with': 'XMLHttpRequest' }, { accept: 'application/json' }, { accept: 'text/javascript, */*; q=0.01' }, { 'x-requested-with': 'XMLHttpRequest' }]
    for (const headers of asks) {
      const { send } = harness()
      const answer = await send('POST', '/cart/add', ADD, headers)
      expect([headers, answer.status, (answer.json as any)?.variant_id]).toEqual([headers, 200, 43696940613654])
      expect(((await send('GET', '/cart.js')).json as any).item_count).toBe(1)
    }
  })
  it('answers /cart/change and /cart/update with the cart when the request asks for JSON', async () => {
    const { send } = harness()
    await send('POST', '/cart/add.js', { items: [{ id: 43696940613654, quantity: 2 }] })
    const changed = await send('POST', '/cart/change', { line: 1, quantity: 1 }, { accept: 'application/json' })
    expect([changed.status, (changed.json as any).item_count]).toEqual([200, 1])
    const updated = await send('POST', '/cart/update', { updates: { 43696940613654: 3 } }, { accept: 'application/json' })
    expect([updated.status, (updated.json as any).item_count]).toEqual([200, 3])
  })
  it('keeps a browser form post and a link a redirect', async () => {
    const { send } = harness()
    const accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    const posted = await send('POST', '/cart/add', ADD, { accept })
    expect([posted.status, posted.headers.get('location')]).toEqual([302, '/cart'])
    const removed = await send('GET', '/cart/change?line=1&quantity=0', undefined, { accept: 'application/json' })
    expect([removed.status, removed.headers.get('location')]).toEqual([302, '/cart'])
  })
})

describe('form redirects', () => {
  const ADD = form({ id: '43696940613654', quantity: '1', form_type: 'product' })
  const BASE = { visitor: 'test-visitor-key-0001', basePath: '/p/tok' }

  it('goes to return_to when it is a path on the store, and to the page the visitor came from for back', async () => {
    // https://shopify.dev/docs/api/liquid/tags/form: `return_to` is `back`, a relative path or a `routes` attribute
    const { send } = harness()
    const location = async (extra: Record<string, string>, headers: Record<string, string> = {}) => (await send('POST', '/cart/add', form({ id: '43696940613654', quantity: '1', ...extra }), headers)).headers.get('location')
    expect(await location({ return_to: '/collections/all' })).toBe('/collections/all')
    expect(await location({ return_to: '//evil.example/x' })).toBe('/cart')
    expect(await location({ return_to: 'https://evil.example/' })).toBe('/cart')
    expect(await location({ return_to: 'back' }, { referer: 'https://store.invalid/products/hoodie?variant=1' })).toBe('/products/hoodie?variant=1')
    expect(await location({ return_to: 'back' })).toBe('/cart')
    expect(await location({ return_to: 'back' }, { referer: 'https://store.invalid//evil.example' })).toBe('/cart')
    // the checkout button wins over return_to
    expect(await location({ return_to: '/collections/all', checkout: '' })).toMatch(/^\/checkouts\/cn\/[^/]+\/en-us\?_r=AQAB[\w-]{48}$/)
  })
  it('keeps the base path and the locale prefix on the redirect', async () => {
    const { send } = harness({}, BASE)
    expect((await send('POST', '/p/tok/cart/add', ADD)).headers.get('location')).toBe('/p/tok/cart')
    expect((await send('POST', '/p/tok/fr-ca/cart/add', ADD)).headers.get('location')).toBe('/p/tok/fr-ca/cart')
    expect((await send('POST', '/p/tok/fr-ca/cart/add', form({ id: '43696940613654', return_to: 'back' }), { referer: 'https://store.invalid/p/tok/fr-ca/products/hoodie' })).headers.get('location')).toBe('/p/tok/fr-ca/products/hoodie')
    expect((await send('POST', '/p/tok/cart/add', form({ id: '43696940613654', checkout: '' }))).headers.get('location')).toMatch(/^\/p\/tok\/checkouts\/cn\/[^/]+\/en-us\?_r=/)
  })
  it('goes back to the page the visitor came from in the locale that page has, and ignores a page outside the base path', async () => {
    const { send } = harness({}, BASE)
    const back = async (url: string, referer: string) => (await send('POST', url, form({ id: '43696940613654', return_to: 'back' }), { referer })).headers.get('location')
    // a page of the primary language is unprefixed whatever prefix the post was made under, and the other way round
    expect(await back('/p/tok/fr-ca/cart/add', 'https://store.invalid/p/tok/products/hoodie')).toBe('/p/tok/products/hoodie')
    expect(await back('/p/tok/cart/add', 'https://store.invalid/p/tok/fr-ca/products/hoodie?variant=1')).toBe('/p/tok/fr-ca/products/hoodie?variant=1')
    expect(await back('/p/tok/cart/add', 'https://store.invalid/other/products/hoodie')).toBe('/p/tok/cart')
  })
  it('links a cart form error back to the page it came from, or the store, and keeps the cart', async () => {
    const { send } = harness({}, BASE)
    const sold = form({ id: '43695847145494', quantity: '1' })
    const back = async (url: string, headers: Record<string, string> = {}) => /<a href="([^"]*)">Back/.exec((await send('POST', url, sold, headers)).text)?.[1]
    expect(await back('/p/tok/cart/add', { referer: 'https://store.invalid/p/tok/products/hoodie?variant=1' })).toBe('/p/tok/products/hoodie?variant=1')
    expect(await back('/p/tok/fr-ca/cart/add', { referer: 'https://store.invalid/p/tok/fr-ca/products/hoodie' })).toBe('/p/tok/fr-ca/products/hoodie')
    expect(await back('/p/tok/cart/add')).toBe('/p/tok')
    expect(await back('/p/tok/fr-ca/cart/add')).toBe('/p/tok/fr-ca')
    expect(await back('/p/tok/cart/add', { referer: 'https://store.invalid//evil.example/x' })).toBe('/p/tok')
    expect(await back('/p/tok/cart/add', { referer: 'https://store.invalid/p/tok//evil.example/x' })).toBe('/p/tok')
    expect(await back('/p/tok/cart/add', { referer: 'not an address' })).toBe('/p/tok')
    // a page outside the base path is not the store's: it is not linked to
    expect(await back('/p/tok/cart/add', { referer: 'https://store.invalid/other/products/hoodie' })).toBe('/p/tok')
    expect(await back('/p/tok/cart/add', { referer: 'https://store.invalid/p/token/products/hoodie' })).toBe('/p/tok')
    expect(((await send('GET', '/p/tok/cart.js')).json as any).item_count).toBe(0)
  })
  it('reads the four fields of a remove link from its query and saves nothing for HEAD', async () => {
    const { send, seed } = harness()
    await seed([{ variantId: 43696940613654, quantity: 2, properties: {}, sellingPlanId: null }])
    // a link names nothing but `id`, `line`, `quantity` and `selling_plan`: `note` is not read
    const head = await send('HEAD', '/cart/change?line=1&quantity=0&note=x')
    expect([head.status, head.headers.get('location'), head.text]).toEqual([302, '/cart', ''])
    expect((await send('GET', '/cart.js')).json).toMatchObject({ item_count: 2, note: null })
    // a link's `return_to` is ignored by Debutify's choice (the link reads the four fields only); neither shopify.dev nor a fixture says what Shopify does with one
    const get = await send('GET', '/cart/change?line=1&quantity=1&note=x&return_to=/collections/all')
    expect([get.status, get.headers.get('location')]).toEqual([302, '/cart'])
    expect((await send('GET', '/cart.js')).json).toMatchObject({ item_count: 1, note: '' })
  })
  it('answers a remove link that names no line with the cart error on its own page', async () => {
    const { send } = harness()
    const answer = await send('GET', '/cart/change?id=1&quantity=0')
    expect([answer.status, answer.text.includes('no valid id or line parameter')]).toEqual([400, true])
  })
  it('clears and updates the cart from forms', async () => {
    const { send, seed } = harness()
    await seed([{ variantId: 43696940613654, quantity: 2, properties: {}, sellingPlanId: null }])
    expect((await send('POST', '/cart/update', form({ 'updates[]': '5', note: 'Hi' }))).headers.get('location')).toBe('/cart')
    expect((await send('GET', '/cart.js')).json).toMatchObject({ item_count: 5, note: 'Hi' })
    expect((await send('POST', '/cart/clear', form({ return_to: '/collections/all' }))).headers.get('location')).toBe('/collections/all')
    expect((await send('GET', '/cart.js')).json).toMatchObject({ item_count: 0 })
  })
  it('leaves the JSON endpoints on JSON', async () => {
    const { send } = harness()
    const added = await send('POST', '/cart/add.js', { id: 43696940613654, quantity: 1 })
    // the parity store types `add.js` as text/javascript (scenario `ajax-cart-session`, step 1)
    expect([added.status, added.headers.get('content-type')]).toEqual([200, 'text/javascript; charset=utf-8'])
    expect((await send('POST', '/cart/change.js', { line: 1, quantity: 0 })).status).toBe(200)
    expect((await send('GET', '/cart.js')).status).toBe(200)
  })
})

describe('the contact form under a base path and locale', () => {
  const BASE = { visitor: 'test-visitor-key-0001', basePath: '/p/tok' }
  const fields = (email: string) => form({ form_type: 'contact', 'contact[email]': email })

  it('redirects back under both, replacing a posted flag the page already had', async () => {
    const { send } = harness({}, BASE)
    const sent = await send('POST', '/p/tok/fr-ca/contact', fields('a@example.com'), { referer: 'https://store.invalid/p/tok/fr-ca/pages/about?view=probe-form&customer_posted=true' })
    expect(sent.headers.get('location')).toBe('/p/tok/fr-ca/pages/about?view=probe-form&contact_posted=true')
    const again = await send('POST', '/p/tok/contact', fields('a@example.com'), { referer: 'https://store.invalid/p/tok/pages/about?contact_posted=true' })
    expect(again.headers.get('location')).toBe('/p/tok/pages/about?contact_posted=true')
  })
  it('goes to the store\'s root when there is no usable referer', async () => {
    const { send } = harness({}, BASE)
    for (const headers of [{} as Record<string, string>, { referer: 'https://store.invalid//evil.example/x' }, { referer: 'javascript:alert(1)' }, { referer: 'nonsense' }]) {
      expect((await send('POST', '/p/tok/contact', fields('a@example.com'), headers)).headers.get('location')).toBe('/p/tok/?contact_posted=true')
    }
    expect((await send('POST', '/p/tok/fr-ca/contact', fields('a@example.com'))).headers.get('location')).toBe('/p/tok/fr-ca/?contact_posted=true')
  })
  it('names a blank and a malformed email, and shows nothing as posted', async () => {
    const { send } = harness()
    const referer = { referer: 'https://store.invalid/pages/about?view=probe-form' }
    for (const [email, message] of [['', "can't be blank"], ['  ', "can't be blank"], ['a b@example.com', 'is invalid'], ['no-at.example.com', 'is invalid']]) {
      const answer = await send('POST', '/contact', fields(email), referer)
      expect([email, answer.status, (answer.json as any).contact]).toEqual([email, 200, expect.objectContaining({ posted_successfully: false, errors: [expect.objectContaining({ field: 'email', message: expect.stringContaining(message) })] })])
    }
    // a post that sends no `contact` fields, or one that is not a group of fields, is a blank email
    for (const body of ['form_type=contact', 'form_type=contact&contact=x', 'form_type=contact&contact[]=x']) {
      expect(((await send('POST', '/contact', body, referer)).json as any).contact.errors).toEqual([expect.objectContaining({ field: 'email' })])
    }
  })
  it('refuses an email longer than an address can be before the pattern reads it, however it ends', async () => {
    // `[^\s@]+\.[^\s@]+$` takes time quadratic in a run of dots: 60,000 of them held a request for about two seconds
    const { send } = harness()
    const referer = { referer: 'https://store.invalid/pages/about?view=probe-form' }
    for (const email of [`a@${'.'.repeat(60000)}@`, `${'a'.repeat(60000)}@example.com`, `a@${'b'.repeat(250)}.com`]) {
      const started = performance.now()
      const answer = await send('POST', '/contact', fields(email), referer)
      expect([answer.status, (answer.json as any).contact.errors, performance.now() - started < 500]).toEqual([200, [expect.objectContaining({ field: 'email', message: expect.stringContaining('is invalid') })], true])
    }
    // the longest address is still an address
    const longest = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`
    expect(longest).toHaveLength(254)
    expect((await send('POST', '/contact', fields(longest), referer)).status).toBe(302)
    expect((await send('POST', '/contact', fields(`${longest}d`), referer)).status).toBe(200)
  })
  it('goes back in the locale of the page it came from, and the redirect shows the form as posted', async () => {
    const { send } = harness({}, BASE)
    const sent = await send('POST', '/p/tok/contact', fields('a@example.com'), { referer: 'https://store.invalid/p/tok/fr-ca/pages/about?view=probe-form' })
    expect(sent.headers.get('location')).toBe('/p/tok/fr-ca/pages/about?view=probe-form&contact_posted=true')
    const shown = await send('GET', sent.headers.get('location')!.replace(/#.*/, ''))
    expect((shown.json as any).contact).toMatchObject({ posted_successfully: true, errors: [] })
    // a page outside the base path is not the store's: the post goes to the store's root
    expect((await send('POST', '/p/tok/contact', fields('a@example.com'), { referer: 'https://store.invalid/other/pages/about' })).headers.get('location')).toBe('/p/tok/?contact_posted=true')
    // an error shows the page it came from in that page's language
    const failed = await send('POST', '/p/tok/contact', fields('x'), { referer: 'https://store.invalid/p/tok/fr-ca/pages/about?view=probe-form' })
    expect([failed.status, (failed.json as any).contact.errors.length]).toEqual([200, 1])
  })
  it('reads no prototype key of the posted fields', async () => {
    const { send } = harness()
    const referer = { referer: 'https://store.invalid/pages/about?view=probe-form' }
    for (const body of ['form_type=contact&contact[__proto__][email]=a@example.com', 'form_type=contact&contact[constructor][prototype]=x', 'form_type=contact&contact[toString]=x', 'form_type=contact&toString=x&contact[email]=']) {
      const answer = await send('POST', '/contact', body, referer)
      expect([body, answer.status, (answer.json as any).contact.errors]).toEqual([body, 200, [expect.objectContaining({ field: 'email', message: expect.stringContaining("can't be blank") })]])
    }
  })
  it('shows a newsletter error on the page with the customer form', async () => {
    const { send } = harness()
    const answer = await send('POST', '/contact', form({ form_type: 'customer', 'contact[email]': 'x' }), { referer: 'https://store.invalid/pages/about?view=probe-form' })
    expect((answer.json as any).customer).toMatchObject({ posted_successfully: false, errors: [{ field: 'email' }], email: 'x' })
    expect((answer.json as any).contact).toMatchObject({ posted_successfully: false, errors: [] })
  })
})

describe('the localization form', () => {
  const post = async (send: ReturnType<typeof harness>['send'], url: string, fields: Record<string, string>, headers: Record<string, string> = {}) => (await send('POST', url, form({ form_type: 'localization', _method: 'put', ...fields }), headers)).headers.get('location')

  it('goes back to the page the visitor came from for return_to back, under the new prefix', async () => {
    const { send } = harness({}, { visitor: 'test-visitor-key-0001', basePath: '/p/tok' })
    expect(await post(send, '/p/tok/localization', { country_code: 'CA', return_to: 'back' }, { referer: 'https://store.invalid/p/tok/pages/about?view=probe' })).toBe('/p/tok/en-ca/pages/about?view=probe')
    expect(await post(send, '/p/tok/fr-ca/localization', { country_code: 'US', return_to: 'back' }, { referer: 'https://store.invalid/p/tok/fr-ca/collections/all?sort_by=price-ascending' })).toBe('/p/tok/collections/all?sort_by=price-ascending')
    // no usable referer, or a page outside the base path: the root
    expect(await post(send, '/p/tok/localization', { country_code: 'CA', return_to: 'back' })).toBe('/p/tok/en-ca')
    expect(await post(send, '/p/tok/localization', { country_code: 'CA', return_to: 'back' }, { referer: 'https://store.invalid/other/pages/about' })).toBe('/p/tok/en-ca')
    expect(await post(send, '/p/tok/localization', { country_code: 'CA', return_to: 'back' }, { referer: 'https://store.invalid//evil.example/x' })).toBe('/p/tok/en-ca')
  })
  it('switches the languages of a store that has languages and no markets', async () => {
    const { send, store } = harness({ data: { ...storefrontSampleData, markets: undefined } as StoreData })
    expect(await post(send, '/localization', { language_code: 'fr', return_to: '/pages/about' })).toBe('/fr/pages/about')
    expect(await store.get('test-visitor-key-0001')).toMatchObject({ language: 'fr' })
    expect(await post(send, '/fr/localization', { language_code: 'en', return_to: '/fr/pages/about' })).toBe('/pages/about')
    // a country names no market here; a language the store lacks is its default one
    expect(await post(send, '/fr/localization', { country_code: 'CA', language_code: 'de', return_to: '/fr/pages/about' })).toBe('/pages/about')
  })

  it('moves between markets and languages, keeping what the post leaves out as the page it was on has it', async () => {
    const { send } = harness()
    expect(await post(send, '/localization', { country_code: 'US', return_to: '/pages/about' })).toBe('/pages/about')
    expect(await post(send, '/localization', { country_code: 'FR', return_to: '/pages/about' })).toBe('/en-eu/pages/about')
    expect(await post(send, '/localization', { country_code: 'FR', language_code: 'fr', return_to: '/' })).toBe('/fr-eu')
    // a language selector on a Canadian page names no country: the market stays
    expect(await post(send, '/en-ca/localization', { language_code: 'fr', return_to: '/en-ca/pages/about' })).toBe('/fr-ca/pages/about')
    expect(await post(send, '/fr-ca/localization', { language_code: 'en', return_to: '/fr-ca/collections/all?sort_by=price-ascending' })).toBe('/en-ca/collections/all?sort_by=price-ascending')
    // a country selector keeps the language of the page when the new market has it, and takes the market's own when it does not
    expect(await post(send, '/fr-ca/localization', { country_code: 'FR', return_to: '/fr-ca/pages/about' })).toBe('/fr-eu/pages/about')
    expect(await post(send, '/fr-ca/localization', { country_code: 'US', return_to: '/fr-ca/pages/about' })).toBe('/pages/about')
    // a language the market does not offer is its default one
    expect(await post(send, '/localization', { country_code: 'US', language_code: 'fr', return_to: '/pages/about' })).toBe('/pages/about')
  })
  it('ignores a country no market sells to, and keeps a return_to on the store, under the base path', async () => {
    const { send } = harness({}, { visitor: 'test-visitor-key-0001', basePath: '/p/tok' })
    expect(await post(send, '/p/tok/fr-ca/localization', { country_code: 'ZZ', return_to: '/p/tok/fr-ca/pages/about' })).toBe('/p/tok/fr-ca/pages/about')
    expect(await post(send, '/p/tok/localization', { country_code: 'CA', return_to: '/p/tok' })).toBe('/p/tok/en-ca')
    for (const target of ['//evil.example/x', 'https://evil.example/', '/\\evil', '', 'back']) {
      expect([target, await post(send, '/p/tok/localization', { country_code: 'CA', return_to: target })]).toEqual([target, '/p/tok/en-ca'])
    }
    expect(await post(send, '/p/tok/localization', { country_code: 'CA' })).toBe('/p/tok/en-ca')
  })
  it('remembers the country and the language for the next page under the new prefix', async () => {
    const { send, store } = harness()
    await post(send, '/localization', { country_code: 'CA', language_code: 'fr', return_to: '/' })
    expect(await store.get('test-visitor-key-0001')).toMatchObject({ country: 'CA', language: 'fr' })
    // a country no market sells to names nothing: the page the form was on (here a Canadian one) keeps its own
    await post(send, '/fr-ca/localization', { country_code: 'ZZ', return_to: '/fr-ca' })
    expect(await store.get('test-visitor-key-0001')).toMatchObject({ country: 'CA', language: 'fr' })
  })
})

describe('the variant redirect', () => {
  it('keeps the base path and the locale prefix, and answers the 404 page for a variant the store lacks', async () => {
    const { send } = harness({}, { visitor: 'test-visitor-key-0001', basePath: '/p/tok' })
    const step = loadFixture('flow-variant-route').steps[0]
    expect((await send('GET', `/p/tok/fr-ca${step.url}`)).headers.get('location')).toBe(`/p/tok/fr-ca${step.location}`)
    expect((await send('HEAD', `/p/tok${step.url}`)).headers.get('location')).toBe(`/p/tok${step.location}`)
    expect((await send('GET', '/p/tok/variants/1')).status).toBe(404)
  })
})

describe('the notice page\'s link back under a base path', () => {
  it('is the page the visitor came from when it is on the store, and the store\'s root when it is not', async () => {
    const { send } = harness({}, { visitor: 'test-visitor-key-0001', basePath: '/p/tok' })
    const back = async (referer: string | undefined) => /<a href="([^"]*)">Back to the store/.exec((await send('GET', '/p/tok/checkouts/cn/abc/en-us', undefined, referer ? { referer } : {})).text)?.[1]
    expect(await back('https://store.invalid/p/tok/cart?x=1')).toBe('/p/tok/cart')
    expect(await back('https://store.invalid/p/tok')).toBe('/p/tok')
    expect(await back('https://store.invalid/p/tok/')).toBe('/p/tok')
    expect(await back('https://store.invalid/p/tok/fr-ca/products/hoodie')).toBe('/p/tok/fr-ca/products/hoodie')
    expect(await back('https://store.invalid/other/cart')).toBe('/p/tok')
    expect(await back('https://store.invalid/p/token/cart')).toBe('/p/tok')
    expect(await back('https://store.invalid/p/tok//evil.example')).toBe('/p/tok')
    expect(await back('https://store.invalid//evil.example')).toBe('/p/tok')
    expect(await back(undefined)).toBe('/p/tok')
  })
})

// final review B, C1 and final review A, C1: `POST /contact` is a simple request any website can make, and an invalid email re-renders the page with what was posted, which a theme prints as Dawn does, with no filter
describe('a hostile contact post', () => {
  const SCRIPT = '"><script>alert(document.domain)</script>'
  const TEXTAREA = '</textarea><img src=x onerror=alert(1)>'
  const CROSS_SITE = { referer: 'https://evil.example/', origin: 'https://evil.example' }
  // the contact form on a page of the store, and the newsletter form in the layout (a theme's footer), each printing what was posted the way Dawn does
  const files = {
    ...harnessTheme().files,
    'layout/theme.liquid': '<!doctype html><html><head>{{ content_for_header }}</head><body>{{ content_for_layout }}<footer>{% form "customer" %}<input name="contact[email]" value="{{ form.email }}">{% endform %}</footer></body></html>',
    'templates/page.echo.liquid': '{% form "contact" %}<input name="contact[name]" value="{% if form.name %}{{ form.name }}{% endif %}"><input name="contact[phone]" value="{{ form.phone | escape }}"><textarea name="contact[body]">{{ form.body }}</textarea><p>{{ form.email }}</p>{% endform %}',
    'templates/index.liquid': 'home'
  }
  const hostile = (type: string) => form({ form_type: type, 'contact[email]': SCRIPT, 'contact[name]': SCRIPT, 'contact[phone]': SCRIPT, 'contact[body]': TEXTAREA })

  it('stays inside the attribute, the textarea and the text node of the page it came from', async () => {
    const { send } = harness({ theme: { files } })
    const answer = await send('POST', '/contact', hostile('contact'), { referer: 'https://store.invalid/pages/about?view=echo' })
    expect(answer.status).toBe(200)
    // (the page's own header holds a script, so the hostile one is named)
    expect(answer.text).not.toMatch(/<script>alert|<img/)
    expect(answer.text).toContain('<input name="contact[name]" value="&quot;&gt;&lt;script&gt;alert(document.domain)&lt;/script&gt;">')
    // an explicit `escape` leaves the escaped text as it is
    expect(answer.text).toContain('<input name="contact[phone]" value="&quot;&gt;&lt;script&gt;alert(document.domain)&lt;/script&gt;">')
    expect(answer.text).toContain('<textarea name="contact[body]">&lt;/textarea&gt;&lt;img src=x onerror=alert(1)&gt;</textarea>')
    expect(answer.text).toContain('<p>&quot;&gt;&lt;script&gt;alert(document.domain)&lt;/script&gt;</p>')
  })

  it('stays inside the newsletter field of a layout, from a cross-site page that names no address of the store', async () => {
    const { send } = harness({ theme: { files } })
    for (const headers of [CROSS_SITE, {}]) {
      const answer = await send('POST', '/contact', form({ form_type: 'customer', 'contact[email]': SCRIPT }), headers)
      expect(answer.status).toBe(200)
      expect(answer.text).not.toContain('<script>alert')
      expect(answer.text).toContain('<input name="contact[email]" value="&quot;&gt;&lt;script&gt;alert(document.domain)&lt;/script&gt;">')
    }
  })

  it('keeps a note, an attribute and a property set by a cross-site post inside their textarea and text node, and still answers /cart.js with them as stored', async () => {
    // fixture `ajax-cart-text`: Shopify prints the visitor's cart text HTML-escaped in Liquid and keeps it raw in the Ajax answers
    const cartFiles: Record<string, string> = { ...files, 'templates/cart.liquid': '<textarea>{{ cart.note }}</textarea><i>{{ cart.attributes.gift }}</i>{% for item in cart.items %}{% for p in item.properties %}<b>{{ p.last }}</b>{% endfor %}{% endfor %}' }
    delete cartFiles['templates/cart.json']
    const { send } = harness({ theme: { files: cartFiles } })
    await send('POST', '/cart/add', form({ id: '43695847538710', quantity: '1', 'properties[Engraving]': SCRIPT }), CROSS_SITE)
    await send('POST', '/cart/update', form({ note: TEXTAREA, 'attributes[gift]': SCRIPT }), CROSS_SITE)
    const page = await send('GET', '/cart')
    expect(page.text).not.toMatch(/<script>alert|<img/)
    expect(page.text).toContain('<textarea>&lt;/textarea&gt;&lt;img src=x onerror=alert(1)&gt;</textarea>')
    expect(page.text).toContain('<i>&quot;&gt;&lt;script&gt;alert(document.domain)&lt;/script&gt;</i>')
    expect(page.text).toContain('<b>&quot;&gt;&lt;script&gt;alert(document.domain)&lt;/script&gt;</b>')
    expect(page.json ?? JSON.parse((await send('GET', '/cart.js')).text)).toMatchObject({ note: TEXTAREA, attributes: { gift: SCRIPT }, items: [{ properties: { Engraving: SCRIPT } }] })
  })

  it('does not echo the password of a wrong storefront password', async () => {
    const locked = { ...storefrontSampleData, shop: { ...storefrontSampleData.shop, password_enabled: true } } as StoreData
    const { send } = harness({ data: locked, password: 'open' })
    const answer = await send('POST', '/password', form({ password: SCRIPT }))
    expect(answer.text).toContain('wrong')
    expect(answer.text).not.toContain('alert(')
  })
})
