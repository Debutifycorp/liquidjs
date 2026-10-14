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
import { attribute, escapeHtml } from '../util/html'
import { plainValue } from '../util/args'
import { currentFrame, shopifyState } from '../state'

type Resource = Record<string, unknown> | undefined

interface FormType {
  action: (resource: Resource) => string
  id?: (resource: Resource) => string
  /** What `form.id` returns when it is not the markup's `id`. */
  formId?: (resource: Resource) => string
  className?: string
  multipart?: boolean
  /** Attributes Shopify adds after `accept-charset` (`data-login-with-shop-sign-in`). */
  extra?: Array<[string, string]>
  /** Hidden inputs after `form_type` and `utf8`. */
  before?: (request: { path: string }) => Array<[string, string]>
  /** Hidden inputs after the form's content; `section` is the id of the section being rendered, if any. */
  after?: (resource: Resource, section?: string) => Array<[string, string]>
}

const prop = (resource: Resource, key: string) => (resource ? stringify(toValue(resource[key])) : '')

/** The form types and their markup, from the examples on https://shopify.dev/docs/api/liquid/tags/form. `customer_address` for an existing address is not documented there and is approximate. */
const FORM_TYPES: Record<string, FormType> = {
  activate_customer_password: { action: () => '/account/activate' },
  cart: { action: () => '/cart', id: () => 'cart_form', className: 'shopify-cart-form', multipart: true },
  contact: { action: () => '/contact#contact_form', id: () => 'contact_form', className: 'contact-form' },
  create_customer: { action: () => '/account', id: () => 'create_customer', extra: [['data-login-with-shop-sign-up', 'true']] },
  currency: { action: () => '/cart/update', id: () => 'currency_form', className: 'shopify-currency-form', multipart: true, before: request => [['return_to', request.path]] },
  customer: { action: () => '/contact#contact_form', id: () => 'contact_form', className: 'contact-form' },
  customer_address: {
    action: address => (address && prop(address, 'id') ? `/account/addresses/${prop(address, 'id')}` : '/account/addresses'),
    id: address => (address && prop(address, 'id') ? `address_form_${prop(address, 'id')}` : 'address_form_new'),
    // https://shopify.dev/docs/api/liquid/objects/form shows `"id": "new"` for a new address; the id of an existing address is the address's own id (not pinned)
    formId: address => (address && prop(address, 'id') ? prop(address, 'id') : 'new')
  },
  customer_login: { action: () => '/account/login', id: () => 'customer_login', extra: [['data-login-with-shop-sign-in', 'true']] },
  guest_login: { action: () => '/account/login', id: () => 'customer_login_guest', after: () => [['guest', 'true']] },
  localization: { action: () => '/localization', id: () => 'localization_form', className: 'shopify-localization-form', multipart: true, before: request => [['_method', 'put'], ['return_to', request.path]] },
  new_comment: { action: article => `${prop(article, 'url')}/comments#comment_form`, id: () => 'comment_form', className: 'comment-form' },
  // `section-id` is not on shopify.dev, whose example renders outside a section; Shopify's Dawn demo store prints it after `product-id` in a product form inside a section, and no Dawn file prints it
  product: { action: () => '/cart/add', id: product => `product_form_${prop(product, 'id')}`, className: 'shopify-product-form', multipart: true, after: (product, section) => [['product-id', prop(product, 'id')], ...(section === undefined ? [] : [['section-id', section] as [string, string]])] },
  recover_customer_password: { action: () => '/account/recover' },
  reset_customer_password: { action: () => '/account/reset' },
  storefront_password: { action: () => '/password', id: () => 'login_form', className: 'storefront-password-form' }
}

const hidden = (name: string, value: string) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`

/** The `form` object inside `{% form %}`: nothing has been posted in a preview. https://shopify.dev/docs/api/liquid/objects/form: `password_needed` is `true` for `customer_login`, `posted_successfully?` always `true` for `customer_address`, `id` is `new` and `set_as_default_checkbox` the single-quoted `<input type='checkbox' id='address_default_address_new' …>` in its example. The page's example key is `password_needed?` while its property list says `password_needed`, so only the latter exists here. The other fields are `null` (the page shows address fields filled from the posted address, which a preview has none of), and `form.id` for the other form types is the markup's `id` (the page gives no example). */
export class FormDrop extends Drop {
  public readonly errors = null
  public readonly 'posted_successfully?': boolean
  public readonly id: string
  public readonly email = null
  public readonly body = null
  public readonly name = null
  public readonly phone = null
  public readonly first_name = null
  public readonly last_name = null
  public readonly password_needed: boolean
  public readonly set_as_default_checkbox: string

  public constructor (public readonly formType: string, public readonly resource: Resource, id: string) {
    super()
    this.id = id
    this.password_needed = formType === 'customer_login'
    this['posted_successfully?'] = formType === 'customer_address'
    this.set_as_default_checkbox = `<input type='checkbox' id='address_default_address_${escapeHtml(id)}' name='address[default]' value='1'>`
  }
}

/** `{% form 'type', resource, attribute: value %}`. https://shopify.dev/docs/api/liquid/tags/form */
export class FormTag extends Tag {
  private readonly type: ValueToken
  private readonly resource?: ValueToken
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
      if (!isAttribute) this.resource = tokenizer.readValue()
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
    const resource = this.resource ? toValue(yield evalToken(this.resource, ctx)) as Resource : undefined
    const attributes = (yield this.hash.render(ctx)) as Record<string, unknown>
    const id = 'id' in attributes ? stringify(plainValue(attributes.id)) : spec.id?.(resource)
    const className = 'class' in attributes ? stringify(plainValue(attributes.class)) : spec.className
    let open = `<form method="post" action="${escapeHtml(spec.action(resource))}"`
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
    ctx.push({ form: new FormDrop(formType, resource, spec.formId?.(resource) ?? id ?? '') })
    yield this.liquid.renderer.renderTemplates(this.templates, ctx, emitter)
    ctx.pop()
    emitter.write((spec.after?.(resource, currentFrame(state)?.section.id) ?? []).map(([name, value]) => hidden(name, value)).join('') + '</form>')
  }

  public * children (): Generator<unknown, Template[]> {
    return this.templates
  }
}
