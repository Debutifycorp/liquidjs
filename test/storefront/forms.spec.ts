import { renderPage, renderSection, requestFromUrl, storefrontSampleData as data } from '../../src/shopify'
import { FormErrorsDrop } from '../../src/shopify/tags/form'
import type { FormOutcome } from '../../src/shopify'
import { probeMatches } from './expect-probe'
import { probeTheme, renderProbe } from './probe'

describe('posted forms', () => {
  it('shows a successful contact form as posted', async () => {
    const page = requestFromUrl('/pages/about?view=probe-form&contact_posted=true', data)
    expect(page.request.form).toEqual({ type: 'contact', posted: true })
    const body = await renderProbe('page.probe-form', { request: page.request }) as any
    expect(body.contact).toMatchObject({ posted_successfully: true, errors: [] })
    expect(body.customer.posted_successfully).toBe(false)
  })
  it('shows a successful newsletter form as posted', async () => {
    const page = requestFromUrl('/pages/about?view=probe-form&customer_posted=true', data)
    expect(page.request.form).toEqual({ type: 'customer', posted: true })
    const body = await renderProbe('page.probe-form', { request: page.request }) as any
    expect(body.customer).toMatchObject({ posted_successfully: true, errors: [] })
    expect(body.contact.posted_successfully).toBe(false)
  })
  it('shows contact errors with their messages and translated field names', async () => {
    const page = requestFromUrl('/pages/about?view=probe-form', data, { form: { type: 'contact', posted: false, errors: { email: ['is invalid'] }, values: { email: 'not-an-email', body: 'Hello' } } })
    const body = await renderProbe('page.probe-form', { request: page.request }) as any
    expect(body.contact).toMatchObject({ posted_successfully: false, errors: [{ field: 'email', message: 'is invalid', translated: 'Email' }], email: 'not-an-email', body: 'Hello' })
    expect(body.customer.posted_successfully).toBe(false)
  })
})

// the posted form is the one of the outcome's type; this theme prints each form type's state next to a loop over its errors
const FORMS = [
  '{%- form \'contact\' -%}[contact {{ form.posted_successfully? }}|{{ form.errors | size }}|{{ form.email }}|{{ form.name }}|{{ form.phone }}|{{ form.first_name }}|{{ form.last_name }}|{{ form.body }}]{%- endform -%}',
  '{%- form \'customer\' -%}[customer {{ form.posted_successfully? }}|{{ form.email }}]{%- endform -%}',
  '{%- form \'customer_login\' -%}[login {{ form.posted_successfully? }}|{% if form.errors %}errors{% else %}clean{% endif %}|{% for field in form.errors %}{{ field }}={{ form.errors.messages[field] }}/{{ form.errors.translated_fields[field] }};{% endfor %}]{%- endform -%}',
  '{%- form \'customer_address\', customer.addresses.first -%}[address {{ form.posted_successfully? }}]{%- endform -%}'
].join('')

function formTheme (extra: Record<string, string> = {}) {
  return { files: { ...probeTheme().files, 'templates/index.liquid': FORMS, 'sections/forms.liquid': FORMS, ...extra } }
}

/** What `template` prints inside `{% form 'contact' %}`, for a contact form that failed with `errors` and kept `values`. */
async function inContact (template: string, errors?: Record<string, string[]>, values?: Record<string, string>) {
  const request = requestFromUrl('/', data, { form: { type: 'contact', posted: false, ...(errors ? { errors } : {}), ...(values ? { values } : {}) } })
  const { html: out } = await renderPage({ theme: formTheme({ 'templates/index.liquid': `{%- form 'contact' -%}${template}{%- endform -%}` }), templateName: 'index', data, request: request.request })
  return out.replace(/<form[^>]*>|<input[^>]*>|<\/form>/g, '')
}

async function html (form: FormOutcome | undefined, extra: Record<string, string> = {}) {
  const request = requestFromUrl('/', data, form ? { form } : {})
  const { html } = await renderPage({ theme: formTheme(extra), templateName: 'index', data, request: request.request })
  return html.replace(/<form[^>]*>|<input[^>]*>|<\/form>/g, '')
}

describe('form state', () => {
  it('renders every form unposted when nothing was posted', async () => {
    expect(await html(undefined)).toBe('[contact false|0||||||][customer false|][login false|clean|][address true]')
  })

  it('posts only the form of the outcome\'s type, and carries its posted values', async () => {
    const posted = await html({ type: 'contact', posted: false, errors: { email: ['is invalid'] }, values: { email: 'a@b', name: 'Ann', phone: '555', first_name: 'A', last_name: 'B', body: 'Hi' } })
    expect(posted).toBe('[contact false|1|a@b|Ann|555|A|B|Hi][customer false|][login false|clean|][address true]')
  })

  it('reports a posted form as posted, with no errors', async () => {
    expect(await html({ type: 'customer', posted: true })).toBe('[contact false|0||||||][customer true|][login false|clean|][address true]')
  })

  it('lists the errors of a failed form by field, with messages and translated names', async () => {
    const out = await html({ type: 'customer_login', posted: false, errors: { form: ['Incorrect email or password.'], password: ['is required', 'is too short'] } })
    expect(out).toContain('[login false|errors|form=Incorrect email or password./Form;password=is required, is too short/Password;]')
  })

  it('keeps customer_address posted, as https://shopify.dev/docs/api/liquid/objects/form says it always is', async () => {
    expect(await html({ type: 'customer_address', posted: false })).toContain('[address true]')
  })

  it('starts an address form from the customer\'s address and lets a posted field win', async () => {
    const home = { id: 11, first_name: 'Ana', last_name: 'Ruiz', address1: '1 Main St', city: 'Springfield', province: 'Oregon', province_code: 'OR', country: 'United States', country_code: 'US', zip: '97477' }
    const theme = { files: { ...probeTheme().files, 'templates/customers/addresses.liquid': "{%- for address in customer.addresses -%}{%- form 'customer_address', address -%}[{{ form.first_name }}|{{ form.address1 }}|{{ form.city }}|{{ form.country }}|{{ form.zip }}]{%- endform -%}{%- endfor -%}" } }
    const show = async (form?: FormOutcome) => (await renderPage({ theme, templateName: 'customers/addresses', data: { ...data, customer: { id: 7, addresses: [home] } }, request: requestFromUrl('/account/addresses', data, form ? { form } : {}).request })).html
    expect(await show()).toContain('[Ana|1 Main St|Springfield|United States|97477]')
    expect(await show({ type: 'customer_address', posted: false, values: { address1: '9 Posted St', zip: '' } })).toContain('[Ana|9 Posted St|Springfield|United States|]')
  })

  it('takes translated field names from the theme\'s shopify.<form type>.form translations', async () => {
    const locales = { 'locales/en.default.json': JSON.stringify({ shopify: { customer_login: { form: { password: 'Your password' } } } }) }
    const out = await html({ type: 'customer_login', posted: false, errors: { password: ['is required'], email: ['is invalid'] } }, locales)
    expect(out).toContain('password=is required/Your password;email=is invalid/Email;')
  })

  it('takes the translated field name from the language the page renders in', async () => {
    const locales = {
      'locales/en.default.json': JSON.stringify({ shopify: { customer_login: { form: { password: 'Password' } } } }),
      'locales/fr.json': JSON.stringify({ shopify: { customer_login: { form: { password: 'Mot de passe' } } } })
    }
    const request = requestFromUrl('/', data, { form: { type: 'customer_login', posted: false, errors: { password: ['est obligatoire'] } } })
    const { html: out } = await renderPage({ theme: formTheme(locales), templateName: 'index', data, request: request.request, locale: 'fr' })
    expect(out).toContain('password=est obligatoire/Mot de passe;')
  })

  it('names a field with an underscore in words', async () => {
    const out = await html({ type: 'customer_login', posted: false, errors: { first_name: ['is required'] } })
    expect(out).toContain('first_name=is required/First name;')
  })

  it('treats a form with no errors as having none', async () => {
    expect(await html({ type: 'customer_login', posted: false, errors: {} })).toContain('[login false|clean|]')
  })

  it('shows the same form state to a section rendered on its own', async () => {
    const request = requestFromUrl('/', data, { form: { type: 'customer', posted: true } })
    const theme = { files: { ...formTheme().files, 'templates/index.json': '{"sections":{"forms":{"type":"forms"}},"order":["forms"]}' } }
    const { html: out } = await renderSection({ theme, templateName: 'index', section: 'forms', data, request: request.request })
    expect(out).toContain('[customer true|]')
  })

  it('loops over the errors and tests them with contains', async () => {
    const form = '{%- form \'contact\' -%}{% if form.errors contains \'email\' %}E{% endif %}{% unless form.errors contains \'body\' %}-B{% endunless %}|{% for e in form.errors %}{{ forloop.index }}.{{ e }},{% endfor %}{%- endform -%}'
    const request = requestFromUrl('/', data, { form: { type: 'contact', posted: false, errors: { email: ['is invalid'], phone: ['is bad'] } } })
    const { html: out } = await renderPage({ theme: formTheme({ 'templates/index.liquid': form }), templateName: 'index', data, request: request.request })
    expect(out.replace(/<form[^>]*>|<input[^>]*>|<\/form>/g, '')).toBe('E-B|1.email,2.phone,')
  })
})

describe('form errors', () => {
  const errors = new FormErrorsDrop({ email: ['is invalid'], body: ['is required', 'is too short'] }, field => field.toUpperCase())

  it('is the list of its fields, with a message and a translated name for each', () => {
    expect([...errors]).toEqual(['email', 'body'])
    expect(errors.valueOf()).toEqual(['email', 'body'])
    expect(errors.messages).toEqual({ email: 'is invalid', body: 'is required, is too short' })
    expect(errors.translated_fields).toEqual({ email: 'EMAIL', body: 'BODY' })
  })

  it('reads as an array for size, first, last and an index', async () => {
    const out = await inContact('{{ form.errors.size }}|{{ form.errors | size }}|{{ form.errors | join: \'+\' }}|{{ form.errors.first }}|{{ form.errors.last }}|{{ form.errors[0] }}|{{ form.errors[1] }}|{{ form.errors[-1] }}|[{{ form.errors[2] }}]|[{{ form.errors.other }}]', { email: ['is invalid'], phone: ['is bad'] })
    expect(out).toBe('2|2|email+phone|email|phone|email|phone|phone|[]|[]')
  })

  it('shows only its messages and translated names to json, not the fields it was made from', async () => {
    expect(await inContact('{{ form.errors | json }}|[{{ form.errors.fields }}]', { email: ['is invalid'] })).toBe('{"messages":{"email":"is invalid"},"translated_fields":{"email":"Email"}}|[]')
  })

  it('prints nothing for default_errors, also for a form that has errors (Shopify\'s wording is unrecorded)', async () => {
    expect(await inContact('[{{ form.errors | default_errors }}]', { email: ['is invalid'] })).toBe('[]')
  })

  it('ignores a posted value the form does not keep', async () => {
    expect(await html({ type: 'contact', posted: false, values: { email: 'a@b', toString: 'x', secret: 'y' } })).toContain('[contact false|0|a@b|||||]')
  })
})

describe('form object', () => {
  it('prints through json as it did before a post was carried: same keys in the same order, nothing added', async () => {
    const out = JSON.parse(await inContact('{{ form | json }}'))
    expect(Object.keys(out)).toEqual(['formType', 'errors', 'email', 'body', 'name', 'phone', 'first_name', 'last_name', 'id', 'password_needed', 'posted_successfully?', 'set_as_default_checkbox'])
    expect(out).toMatchObject({ formType: 'contact', errors: null, email: null, id: 'contact_form', 'posted_successfully?': false })
  })

  it('carries the other values shopify.dev lists on the form object, and nil for the ones not posted', async () => {
    const values = { author: 'Ann', message: 'Happy birthday', address1: '1 Main St', address2: 'Suite 2', city: 'Calgary', company: 'Potions', country: 'Canada', province: 'Alberta', zip: 'T1X 0L3' }
    const template = ['author', 'message', 'address1', 'address2', 'city', 'company', 'country', 'province', 'zip'].map(key => `{{ form.${key} }}`).join('|')
    expect(await inContact(template, undefined, values)).toBe('Ann|Happy birthday|1 Main St|Suite 2|Calgary|Potions|Canada|Alberta|T1X 0L3')
    expect(await inContact(template)).toBe('||||||||')
    expect(await inContact('{{ form.author | json }}|{{ form.zip | json }}')).toBe('null|null')
  })
})

// final review B, C1 (and final review A, C1): a posted value reached the page raw, so `value="{{ form.email }}"` ran the script of a cross-site `POST /contact`. Shopify's own Dawn and Timber print these values with no filter, which only works if the platform hands them over escaped
describe('posted values are HTML-safe', () => {
  const ATTRIBUTE = '"><script>alert(document.domain)</script>'
  const TEXTAREA = '</textarea><img src=x onerror=alert(1)>'
  const ESCAPED_ATTRIBUTE = '&quot;&gt;&lt;script&gt;alert(document.domain)&lt;/script&gt;'
  const ESCAPED_TEXTAREA = '&lt;/textarea&gt;&lt;img src=x onerror=alert(1)&gt;'
  const MAIN = ['email', 'body', 'name', 'phone', 'first_name', 'last_name']
  const MORE = ['author', 'message', 'address1', 'address2', 'city', 'company', 'country', 'province', 'zip']

  /** A contact form that echoes every value the way Dawn does: in an attribute, in a textarea and in a text node. */
  const ECHO = `{%- form 'contact' -%}${[...MAIN, ...MORE].map(key => `<input name="${key}" value="{{ form.${key} }}">`).join('')}<textarea>{{ form.body }}</textarea><p>{{ form.name }}</p>{%- endform -%}`
  const rendered = async (values: Record<string, string>, template = ECHO) => {
    const request = requestFromUrl('/', data, { form: { type: 'contact', posted: false, errors: { email: ['is invalid'] }, values } })
    return (await renderPage({ theme: formTheme({ 'templates/index.liquid': template }), templateName: 'index', data, request: request.request })).html
  }

  it('keeps every posted value inside its attribute, its textarea and its text node', async () => {
    const out = await rendered(Object.fromEntries([...MAIN, ...MORE].map(key => [key, key === 'body' ? TEXTAREA : ATTRIBUTE])))
    expect(out).not.toMatch(/<script|<img/)
    for (const key of [...MAIN, ...MORE]) {
      expect(out).toContain(`<input name="${key}" value="${key === 'body' ? ESCAPED_TEXTAREA : ESCAPED_ATTRIBUTE}">`)
    }
    expect(out).toContain(`<textarea>${ESCAPED_TEXTAREA}</textarea>`)
    expect(out).toContain(`<p>${ESCAPED_ATTRIBUTE}</p>`)
  })

  it('does not escape a value a second time when the theme writes escape', async () => {
    const out = await rendered({ email: 'a&b "c"', body: '<b>' }, "{%- form 'contact' -%}[{{ form.email }}|{{ form.email | escape }}|{{ form.email | escape_once }}|{{ form.body | escape }}]{%- endform -%}")
    expect(out.replace(/<form[^>]*>|<input[^>]*>|<\/form>/g, '')).toBe('[a&amp;b &quot;c&quot;|a&amp;b &quot;c&quot;|a&amp;b &quot;c&quot;|&lt;b&gt;]')
  })

  it('reads as the text it stands for to a test, a size and a filter', async () => {
    const out = await rendered({ email: 'a@b', name: '', body: 'one\ntwo' }, "{%- form 'contact' -%}[{% if form.email == 'a@b' %}same{% endif %}|{% if form.name %}set{% else %}unset{% endif %}|{{ form.email | size }}|{{ form.body | newline_to_br }}|{{ form.email | upcase }}|{{ form.email | default: 'none' }}|{{ form.phone | default: 'none' }}]{%- endform -%}")
    expect(out.replace(/<form[^>]*>|<input[^>]*>|<\/form>/g, '')).toBe('[same|set|3|one<br />\ntwo|A@B|a@b|none]')
  })

  it('prints through json as the escaped text, which cannot close a script block either', async () => {
    const out = await rendered({ name: '</script><script>alert(1)</script>' }, "{%- form 'contact' -%}<script>var n = {{ form.name | json }}</script>{%- endform -%}")
    // `json` escapes the `&` and `<` of the escaped text again for a script block, and the block still closes only where the theme closes it
    expect(out).toContain('var n = "\\u0026lt;\\/script\\u0026gt;\\u0026lt;script\\u0026gt;alert(1)\\u0026lt;\\/script\\u0026gt;"')
    expect(out.match(/<\/script>/g)).toHaveLength(1)
  })

  it('escapes the newsletter form too', async () => {
    const request = requestFromUrl('/', data, { form: { type: 'customer', posted: false, errors: { email: ['is invalid'] }, values: { email: ATTRIBUTE } } })
    const theme = formTheme({ 'templates/index.liquid': "{%- form 'customer' -%}<input name=\"contact[email]\" value=\"{{ form.email }}\">{%- endform -%}" })
    const out = (await renderPage({ theme, templateName: 'index', data, request: request.request })).html
    expect(out).toContain(`<input name="contact[email]" value="${ESCAPED_ATTRIBUTE}">`)
    expect(out).not.toContain('<script')
  })

  it('leaves the error messages as they are given', async () => {
    const out = await rendered({}, "{%- form 'contact' -%}{% for field in form.errors %}{{ form.errors.messages[field] }}{% endfor %}{%- endform -%}")
    expect(out.replace(/<form[^>]*>|<input[^>]*>|<\/form>/g, '')).toBe('is invalid')
  })
})

describe('form markup the page probes record', () => {
  for (const name of ['probe-page-home', 'probe-page-fr-eu']) {
    it(`returns the localization form to the page's whole address, its query too (${name})`, async () => {
      const { actual, expected } = await probeMatches(name, (b: any) => b.localization_form)
      expect(actual).toBe(expected)
      expect(actual).toContain('?view=probe" />')
    })
  }

  it('prints nothing for a product form whose product is written with a quoted key, as the parity store does', async () => {
    const { actual, expected } = await probeMatches('probe-page-home', (b: any) => b.product_form)
    expect([actual, expected]).toEqual(['', ''])
  })

  it('prints a product form for a product written as a variable, also with a bracket key that is a variable', async () => {
    const render = async (template: string) => (await renderPage({ theme: formTheme({ 'templates/index.liquid': template }), templateName: 'index', data })).html
    expect(await render("{%- form 'product', all_products[\"hoodie\"] -%}x{%- endform -%}")).toBe('')
    const byVariable = await render("{%- assign p = all_products['hoodie'] -%}{%- form 'product', p -%}x{%- endform -%}")
    expect(byVariable).toMatch(/^<form method="post" action="\/cart\/add" id="product_form_\d+"[^>]*>.*x<input type="hidden" name="product-id" value="\d+" \/><\/form>$/)
    expect(await render("{%- assign h = 'hoodie' -%}{%- form 'product', all_products[h] -%}x{%- endform -%}")).toBe(byVariable)
    expect(await render("{%- assign p = all_products['hoodie'] -%}{%- form 'product', p, id: 'pf' -%}x{%- endform -%}")).toContain('id="pf"')
  })
})
