import { Tag } from '../../template/tag'
import { Hash } from '../../template/hash'
import type { Template } from '../../template'
import type { Liquid } from '../../liquid'
import type { Parser } from '../../parser'
import type { Context } from '../../context'
import type { Emitter } from '../../emitters'
import type { TagToken, TopLevelToken, ValueToken } from '../../tokens'
import { Drop } from '../../drop'
import { evalToken } from '../../render'
import { isTagToken, stringify, toValue } from '../../util'
import { withPrefix } from '../store/view'
import { attribute, escapeHtml } from '../util/html'
import { plainValue } from '../util/args'
import { currentFrame, shopifyState } from '../state'
import type { ShopifyState } from '../state'
import type { FormOutcome } from '../store/globals'
import { hasOwn } from '../util/own'

type Resource = Record<string, unknown> | undefined

interface FormType {
  action: (resource: Resource) => string
  /** The action carries `#` and the form's id, as the parity store prints a contact or customer form (scenarios `page-home`, `page-contact`). */
  anchored?: boolean
  /** The action is built from a resource URL that already sits under the view's prefix (`new_comment`), so the prefix is not put before it again. */
  prefixed?: boolean
  id?: (resource: Resource) => string
  /** What `form.id` returns when it is not the markup's `id`. */
  formId?: (resource: Resource) => string
  className?: string
  multipart?: boolean
  /** Attributes Shopify adds after `accept-charset` (`data-login-with-shop-sign-in`). */
  extra?: Array<[string, string]>
  /** Hidden inputs after `form_type` and `utf8`. */
  before?: (request: { path: string, query?: ReadonlyArray<readonly [string, string]> }) => Array<[string, string]>
  /** Hidden inputs after the form's content; `section` is the id of the section being rendered, if any. */
  after?: (resource: Resource, section?: string) => Array<[string, string]>
}

const prop = (resource: Resource, key: string) => (resource ? stringify(toValue(resource[key])) : '')

/** The address of the page being rendered, its query included: where a `localization` form returns the shopper, as the parity store prints it (fixtures `probe-page-home` and `probe-page-fr-eu`: `/pages/about?view=probe` and `/fr-eu/pages/about?view=probe`, the page's path, prefix included, as `request.path` prints it, then the query). The pairs keep the address's order, each name and value encoded with `encodeURIComponent`; the fixtures hold one pair, so the order and encoding of several are not pinned. The deprecated `currency` form, which no fixture records, returns the same way. */
const pageAddress = (request: { path: string, query?: ReadonlyArray<readonly [string, string]> }) => {
  const pairs = request.query ?? []
  return pairs.length ? `${request.path}?${pairs.map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`).join('&')}` : request.path
}

/** Liquid's `VariableSignature`, repeated: the characters `FORM_FORMAT` in Shopify's theme-check (lib/theme_check/tags.rb, whose header says its tag parsing was copied from the storefront renderer) allows in a form's object, a name with dots and square brackets, so `all_products['hoodie']` falls outside it. theme-check agrees on the character set only: its anchored pattern raises a syntax error for such an object, where the storefront printed an empty string, so the rule built on it is Debutify's inference. */
const READABLE_OBJECT = /^[\w\-.[\]()]+$/

/** The form types and their markup, from the examples on https://shopify.dev/docs/api/liquid/tags/form. `customer_address` for an existing address is not documented there and is approximate. An action is the unprefixed path; `render` puts the view's prefix before it (the base path and locale prefix: the parity store posts its localization form to `/fr-ca/localization` under `/fr-ca`, fixture `probe-page-fr-ca`, and shopify.dev's examples show only the unprefixed actions), except for an action built from an article's URL, which carries it already (`prefixed`). */
const FORM_TYPES: Record<string, FormType> = {
  activate_customer_password: { action: () => '/account/activate' },
  cart: { action: () => '/cart', id: () => 'cart_form', className: 'shopify-cart-form', multipart: true },
  contact: { action: () => '/contact', anchored: true, id: () => 'contact_form', className: 'contact-form' },
  create_customer: { action: () => '/account', id: () => 'create_customer', extra: [['data-login-with-shop-sign-up', 'true']] },
  currency: { action: () => '/cart/update', id: () => 'currency_form', className: 'shopify-currency-form', multipart: true, before: request => [['return_to', pageAddress(request)]] },
  customer: { action: () => '/contact', anchored: true, id: () => 'contact_form', className: 'contact-form' },
  customer_address: {
    action: address => (address && prop(address, 'id') ? `/account/addresses/${prop(address, 'id')}` : '/account/addresses'),
    id: address => (address && prop(address, 'id') ? `address_form_${prop(address, 'id')}` : 'address_form_new'),
    // https://shopify.dev/docs/api/liquid/objects/form shows `"id": "new"` for a new address; the id of an existing address is the address's own id (not pinned)
    formId: address => (address && prop(address, 'id') ? prop(address, 'id') : 'new')
  },
  customer_login: { action: () => '/account/login', id: () => 'customer_login', extra: [['data-login-with-shop-sign-in', 'true']] },
  guest_login: { action: () => '/account/login', id: () => 'customer_login_guest', after: () => [['guest', 'true']] },
  localization: { action: () => '/localization', id: () => 'localization_form', className: 'shopify-localization-form', multipart: true, before: request => [['_method', 'put'], ['return_to', pageAddress(request)]] },
  new_comment: { action: article => `${prop(article, 'url')}/comments#comment_form`, prefixed: true, id: () => 'comment_form', className: 'comment-form' },
  // `section-id` is not on shopify.dev, whose example renders outside a section; Shopify's Dawn demo store prints it after `product-id` in a product form inside a section, and no Dawn file prints it
  product: { action: () => '/cart/add', id: product => `product_form_${prop(product, 'id')}`, className: 'shopify-product-form', multipart: true, after: (product, section) => [['product-id', prop(product, 'id')], ...(section === undefined ? [] : [['section-id', section] as [string, string]])] },
  recover_customer_password: { action: () => '/account/recover' },
  reset_customer_password: { action: () => '/account/reset' },
  storefront_password: { action: () => '/password', id: () => 'login_form', className: 'storefront-password-form' }
}

const hidden = (name: string, value: string) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`

/** The values a form keeps from a post, https://shopify.dev/docs/api/liquid/objects/form: `email`, `body`, `name`, `phone`, `first_name` and `last_name` (`null` when not posted), and the others the page lists (`author` of `new_comment`, `message` of the gift card in a `product` form, and the address fields of `customer_address`), which are nil when not posted and so are not set then. */
type PostedValue = 'email' | 'body' | 'name' | 'phone' | 'first_name' | 'last_name'
const MORE_POSTED_VALUES = ['author', 'message', 'address1', 'address2', 'city', 'company', 'country', 'province', 'zip']

/** The title of a field as a last resort: `first_name` is `First name`. */
const capitalised = (field: string) => {
  const words = field.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const fieldsOf = (errors: FormErrorsDrop) => Object.keys(errors.messages)

/** https://shopify.dev/docs/api/liquid/objects/form_errors: iterating gives the field names (its keys are `author`, `body`, `email`, `form` and `password`); `messages[field]` and `translated_fields[field]` give the field's message and its name. A field with several messages prints them joined with `, `: the page shows one message per field and does not say what several look like. The page calls the object an array, so `size`, `length`, `first`, `last` and an index (`form.errors[0]`, `form.errors[-1]`) read the field names as an array's items. */
export class FormErrorsDrop extends Drop {
  public readonly messages: Record<string, string>
  public readonly translated_fields: Record<string, string>

  public constructor (fields: Record<string, string[]>, translate: (field: string) => string) {
    super()
    this.messages = Object.fromEntries(Object.entries(fields).map(([field, messages]) => [field, messages.join(', ')]))
    this.translated_fields = Object.fromEntries(Object.keys(fields).map(field => [field, translate(field)]))
  }

  public * [Symbol.iterator] () {
    yield * fieldsOf(this)
  }

  /** What `for` and `contains` read: the field names. */
  public valueOf () {
    return fieldsOf(this)
  }

  public get size () {
    return fieldsOf(this).length
  }

  public get length () {
    return this.size
  }

  public get first () {
    return fieldsOf(this)[0]
  }

  public get last () {
    return fieldsOf(this).pop()
  }

  public liquidMethodMissing (key: string | number) {
    const index = typeof key === 'number' ? key : /^-?\d+$/.test(key) ? Number(key) : NaN
    const fields = fieldsOf(this)
    return Number.isInteger(index) ? fields[index < 0 ? fields.length + index : index] : undefined
  }
}

/**
 * The `form` object inside `{% form %}`. https://shopify.dev/docs/api/liquid/objects/form: `password_needed` is `true` for `customer_login`, `posted_successfully?` always `true` for `customer_address`, `id` is `new` and `set_as_default_checkbox` the single-quoted `<input type='checkbox' id='address_default_address_new' …>` in its example. The page's example key is `password_needed?` while its property list says `password_needed`, so only the latter exists here. `form.id` for the other form types is the markup's `id` (the page gives no example).
 *
 * A form of the type the request's outcome (`RequestInput.form`) names shows it: `posted_successfully?` is `posted`, `errors` is a `FormErrorsDrop` over the outcome's errors (`null` when it has none, as the page says "or nil if none"), and the posted values (`PostedValue`, `MORE_POSTED_VALUES`). Every other form is as nothing had been posted: not posted, no errors, and `null` for the six main fields and nil for the rest (the page shows address fields filled from the posted address, which a preview has none of). The properties are assigned in the order they had before a post was carried, so a form with no outcome prints through `json` as it did.
 */
export class FormDrop extends Drop {
  public readonly errors: FormErrorsDrop | null
  public readonly 'posted_successfully?': boolean
  public readonly id: string
  public readonly email: string | null
  public readonly body: string | null
  public readonly name: string | null
  public readonly phone: string | null
  public readonly first_name: string | null
  public readonly last_name: string | null
  public readonly password_needed: boolean
  public readonly set_as_default_checkbox: string

  public constructor (public readonly formType: string, public readonly resource: Resource, id: string, outcome?: FormOutcome, translate: (field: string) => string = capitalised) {
    super()
    const values = outcome?.values ?? {}
    const posted = (key: PostedValue) => (hasOwn(values, key) ? values[key] : null)
    this.errors = outcome?.errors && Object.keys(outcome.errors).length ? new FormErrorsDrop(outcome.errors, translate) : null
    this.email = posted('email')
    this.body = posted('body')
    this.name = posted('name')
    this.phone = posted('phone')
    this.first_name = posted('first_name')
    this.last_name = posted('last_name')
    this.id = id
    this.password_needed = formType === 'customer_login'
    this['posted_successfully?'] = formType === 'customer_address' || !!outcome?.posted
    this.set_as_default_checkbox = `<input type='checkbox' id='address_default_address_${escapeHtml(id)}' name='address[default]' value='1'>`
    for (const key of MORE_POSTED_VALUES) {
      if (hasOwn(values, key)) this[key] = values[key]
    }
  }
}

/**
 * The name of a field in `form.errors.translated_fields`. https://shopify.dev/docs/api/liquid/objects/form_errors calls them "the translated names" and does not say where they come from; https://shopify.dev/docs/storefronts/themes/architecture/locales/storefront-locale-files says Shopify's system messages sit under the reserved `shopify` key of the locale files, which a theme overrides by adding the key. The keys of the form messages are not listed there, so `shopify.<form type>.form.<field>` (`shopify.contact.form.email`) is Debutify's choice, found in the locale of the page and then the theme's default one, and the field's own name, capitalised, stands in when the theme has none (no fixture records Shopify's text: its bot challenge answers every scripted contact post).
 */
function fieldName (state: ShopifyState, formType: string, field: string): string {
  const text = state.translator.lookup(`shopify.${formType}.form.${field}`)
  return typeof text === 'string' ? text : capitalised(field)
}

/**
 * `{% form 'type', resource, attribute: value %}`. https://shopify.dev/docs/api/liquid/tags/form
 *
 * Recorded: `{% form 'product', all_products['hoodie'] %}{% endform %}`, with an empty body, prints `""` on the parity store's page (fixtures `probe-page-*`: `product_form`); shopify.dev's page says only that the product form "requires a product object as a parameter". Debutify's rule, inferred from the character set of `READABLE_OBJECT`: a `product` form whose object is written with any other character (a quoted key) prints nothing, its content included. Not recorded: whether the content is dropped, an unquoted key (`all_products[handle]`, which prints the form here), a nil or missing object (which prints `<form … id="product_form_">` here), and the other form types with such an object, which read the whole expression here.
 */
export class FormTag extends Tag {
  private readonly type: ValueToken
  private readonly resource?: ValueToken
  /** The object is written in a form Shopify's tag does not read as one. */
  private readonly unreadable: boolean = false
  private readonly hash: Hash
  private readonly templates: Template[] = []

  public constructor (token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(token, remainTokens, liquid)
    const tokenizer = this.tokenizer
    const type = tokenizer.readValue()
    if (!type) throw new Error('form needs a form type')
    this.type = type
    tokenizer.skipBlank()
    if (tokenizer.peek() === ',') {
      tokenizer.advance()
      const begin = tokenizer.p
      const name = tokenizer.readIdentifier()
      tokenizer.skipBlank()
      const isAttribute = name.content !== '' && tokenizer.peek() === ':'
      tokenizer.p = begin
      if (!isAttribute) {
        this.resource = tokenizer.readValue()
        this.unreadable = !!this.resource && !READABLE_OBJECT.test(this.resource.getText())
      }
    }
    this.hash = new Hash(tokenizer, liquid.options.keyValueSeparator)
    while (remainTokens.length) {
      const next = remainTokens.shift()!
      if (isTagToken(next) && next.name === 'endform') return
      this.templates.push(parser.parseToken(next, remainTokens))
    }
    throw new Error(`tag ${token.getText()} not closed`)
  }

  public * render (ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    const state = shopifyState(ctx)
    const formType = stringify(yield evalToken(this.type, ctx))
    const spec = FORM_TYPES[formType]
    if (!spec) throw new Error(`Unknown form type: ${formType}`)
    if (formType === 'product' && this.unreadable) return
    const resource = this.resource ? toValue(yield evalToken(this.resource, ctx)) as Resource : undefined
    const attributes = (yield this.hash.render(ctx)) as Record<string, unknown>
    const id = 'id' in attributes ? stringify(plainValue(attributes.id)) : spec.id?.(resource)
    const className = 'class' in attributes ? stringify(plainValue(attributes.class)) : spec.className
    const path = spec.prefixed ? spec.action(resource) : withPrefix(state.request.prefix, spec.action(resource))
    const action = spec.anchored && id !== undefined ? `${path}#${id}` : path
    let open = `<form method="post" action="${escapeHtml(action)}"`
    if (id !== undefined) open += attribute('id', id)
    open += ' accept-charset="UTF-8"'
    if (className !== undefined) open += attribute('class', className)
    if (spec.multipart) open += ' enctype="multipart/form-data"'
    for (const [name, value] of spec.extra ?? []) open += attribute(name, value)
    for (const [name, value] of Object.entries(attributes)) {
      if (name !== 'id' && name !== 'class' && name !== 'return_to') open += attribute(name, plainValue(value))
    }
    open += '>' + hidden('form_type', formType) + hidden('utf8', '✓')
    const before = spec.before?.(state.request) ?? []
    if ('return_to' in attributes) {
      // an explicit `return_to` replaces the form type's own (`currency`, `localization`); Shopify's output for both is not pinned by shopify.dev
      const returnTo: [string, string] = ['return_to', stringify(plainValue(attributes.return_to))]
      const existing = before.findIndex(([name]) => name === 'return_to')
      if (existing === -1) before.push(returnTo)
      else before[existing] = returnTo
    }
    for (const [name, value] of before) open += hidden(name, value)
    emitter.write(open)
    // the outcome of the post belongs to the form of its type; any other form on the page is as nothing was posted
    const outcome = state.form?.type === formType ? state.form : undefined
    ctx.push({ form: new FormDrop(formType, resource, spec.formId?.(resource) ?? id ?? '', outcome, field => fieldName(state, formType, field)) })
    yield this.liquid.renderer.renderTemplates(this.templates, ctx, emitter)
    ctx.pop()
    emitter.write((spec.after?.(resource, currentFrame(state)?.section.id) ?? []).map(([name, value]) => hidden(name, value)).join('') + '</form>')
  }

  public * children (): Generator<unknown, Template[]> {
    return this.templates
  }
}
