import { createShopifyLiquid, createState, renderLiquid, SchemaTag, STATE } from '../../../src/shopify'

const liquid = createShopifyLiquid()
const render = async (source: string, scope: object = {}, request = {}) => (await renderLiquid(liquid, source, scope, { request })).html

describe('raw-body Shopify tags', () => {
  it('renders schema as nothing and keeps Liquid inside it as text', async () => expect(await render('a{% schema %}{"name": "{{ x }}"}{% endschema %}b')).toBe('ab'))
  it('exposes the schema JSON', () => {
    const [tag] = liquid.parse('{% schema %}{"name": "Hero", "settings": []}{% endschema %}')
    expect((tag as SchemaTag).json).toEqual({ name: 'Hero', settings: [] })
  })
  it('renders javascript, stylesheet and doc as nothing', async () => expect(await render('a{% javascript %}if (a < b) {}{% endjavascript %}{% stylesheet %}.a{}{% endstylesheet %}{% doc %}@param {string} x{% enddoc %}b')).toBe('ab'))
  it('closes on end tags with whitespace control', async () => expect(await render('a {%- schema -%} {} {%- endschema -%} b')).toBe('ab'))
  it('records javascript and stylesheet bodies once per file', async () => {
    const state = createState()
    await liquid.parseAndRender('{% javascript %}a(){% endjavascript %}{% stylesheet %}.a{}{% endstylesheet %}', {}, { globals: { [STATE]: state } })
    await liquid.parseAndRender('{% javascript %}b(){% endjavascript %}{% stylesheet %}.b{}{% endstylesheet %}', {}, { globals: { [STATE]: state } })
    expect([...state.assets.javascripts]).toEqual([['', 'a()']])
    expect([...state.assets.stylesheets]).toEqual([['', '.a{}']])
  })
  it('is blank when it prints nothing, so an error in a block holding only these is not written', () => {
    const tags = liquid.parse('{% schema %}{}{% endschema %}{% javascript %}a{% endjavascript %}{% stylesheet %}.a{}{% endstylesheet %}{% doc %}x{% enddoc %}')
    expect(tags.map(tag => (tag as SchemaTag).blank())).toEqual([true, true, true, true])
  })
})

describe('style', () => {
  // https://shopify.dev/docs/api/liquid/tags/style
  it('wraps the rendered body in <style data-shopify>', async () => expect(await render('{% style %}.h1 { color: {{ settings.colors_accent_1 }}; }{% endstyle %}', { settings: { colors_accent_1: '#121212' } })).toBe('<style data-shopify>.h1 { color: #121212; }</style>'))
})

describe('layout', () => {
  it('records the layout and renders nothing', async () => {
    const state = createState()
    const html = await liquid.parseAndRender("a{% layout 'alternate' %}b", {}, { globals: { [STATE]: state } })
    expect(html).toBe('ab')
    expect(state.layout).toBe('alternate')
    await liquid.parseAndRender('{% layout none %}', {}, { globals: { [STATE]: state } })
    expect(state.layout).toBeNull()
  })
})

describe('form', () => {
  // Expected markup from the examples on https://shopify.dev/docs/api/liquid/tags/form
  it('renders a contact form', async () => expect(await render("{% form 'contact' %}{% endform %}")).toBe('<form method="post" action="/contact#contact_form" id="contact_form" accept-charset="UTF-8" class="contact-form"><input type="hidden" name="form_type" value="contact" /><input type="hidden" name="utf8" value="✓" /></form>'))
  it('renders a product form with attributes', async () => expect(await render("{% form 'product', product, id: 'custom-id', class: 'custom-class', data-example: '100' %}<!-- form content -->{% endform %}", { product: { id: 6786188247105 } })).toBe('<form method="post" action="/cart/add" id="custom-id" accept-charset="UTF-8" class="custom-class" enctype="multipart/form-data" data-example="100"><input type="hidden" name="form_type" value="product" /><input type="hidden" name="utf8" value="✓" /><!-- form content --><input type="hidden" name="product-id" value="6786188247105" /></form>'))
  it('renders a product form with its default id and class', async () => expect(await render("{% form 'product', product %}{% endform %}", { product: { id: 7 } })).toBe('<form method="post" action="/cart/add" id="product_form_7" accept-charset="UTF-8" class="shopify-product-form" enctype="multipart/form-data"><input type="hidden" name="form_type" value="product" /><input type="hidden" name="utf8" value="✓" /><input type="hidden" name="product-id" value="7" /></form>'))
  it('adds return_to', async () => expect(await render("{% form 'customer_login', return_to: routes.root_url %}{% endform %}", { routes: { root_url: '/' } })).toBe('<form method="post" action="/account/login" id="customer_login" accept-charset="UTF-8" data-login-with-shop-sign-in="true"><input type="hidden" name="form_type" value="customer_login" /><input type="hidden" name="utf8" value="✓" /><input type="hidden" name="return_to" value="/" /></form>'))
  it('renders a guest login form', async () => expect(await render("{% form 'guest_login' %}{% endform %}")).toBe('<form method="post" action="/account/login" id="customer_login_guest" accept-charset="UTF-8"><input type="hidden" name="form_type" value="guest_login" /><input type="hidden" name="utf8" value="✓" /><input type="hidden" name="guest" value="true" /></form>'))
  it('renders a localization form returning to the current page', async () => expect(await render("{% form 'localization', id: 'HeaderCountryForm', class: 'localization-form' %}{% endform %}", {}, { path: '/products/tee' })).toBe('<form method="post" action="/localization" id="HeaderCountryForm" accept-charset="UTF-8" class="localization-form" enctype="multipart/form-data"><input type="hidden" name="form_type" value="localization" /><input type="hidden" name="utf8" value="✓" /><input type="hidden" name="_method" value="put" /><input type="hidden" name="return_to" value="/products/tee" /></form>'))
  it('renders a new comment form for the article', async () => expect(await render("{% form 'new_comment', article %}{% endform %}", { article: { url: '/blogs/news/hello' } })).toBe('<form method="post" action="/blogs/news/hello/comments#comment_form" id="comment_form" accept-charset="UTF-8" class="comment-form"><input type="hidden" name="form_type" value="new_comment" /><input type="hidden" name="utf8" value="✓" /></form>'))
  it('renders a new address form', async () => expect(await render("{% form 'customer_address', customer.new_address %}{% endform %}", { customer: { new_address: {} } })).toBe('<form method="post" action="/account/addresses" id="address_form_new" accept-charset="UTF-8"><input type="hidden" name="form_type" value="customer_address" /><input type="hidden" name="utf8" value="✓" /></form>'))
  it('writes boolean attributes in Shopify form', async () => expect(await render("{% form 'contact', novalidate: true %}{% endform %}")).toContain('class="contact-form" novalidate="novalidate">'))
  it('gives the body a form object with nothing posted', async () => expect(await render("{% form 'contact' %}{{ form.posted_successfully? }}|{{ form.errors | size }}|{{ form.id }}{% endform %}")).toContain('false|0|contact_form</form>'))
  it('fails inline on an unknown form type', async () => expect(await render("{% form 'nope' %}{% endform %}")).toBe('Liquid error (line 1): Unknown form type: nope'))
})

describe('paginate', () => {
  const products = Array.from({ length: 19 }, (_, i) => ({ title: `P${i + 1}` }))
  const source = '{% paginate collection.products by 5 %}{% for product in collection.products %}{{ product.title }},{% endfor %}{{ paginate | default_pagination }}{% endpaginate %}'

  // Markup from https://shopify.dev/docs/api/liquid/tags/paginate (4 pages, page 1)
  it('slices the array and renders Shopify pagination', async () => expect(await render(source, { collection: { products } }, { path: '/collections/all' })).toBe('P1,P2,P3,P4,P5,<span class="page current">1</span> <span class="page"><a href="/collections/all?page=2" title="">2</a></span> <span class="page"><a href="/collections/all?page=3" title="">3</a></span> <span class="page"><a href="/collections/all?page=4" title="">4</a></span> <span class="next"><a href="/collections/all?page=2" title="">Next &raquo;</a></span>'))
  it('shows the requested page', async () => expect(await render(source, { collection: { products } }, { path: '/collections/all', page: 4 })).toBe('P16,P17,P18,P19,<span class="prev"><a href="/collections/all?page=3" title="">&laquo; Previous</a></span> <span class="page"><a href="/collections/all?page=1" title="">1</a></span> <span class="page"><a href="/collections/all?page=2" title="">2</a></span> <span class="page"><a href="/collections/all?page=3" title="">3</a></span> <span class="page current">4</span>'))
  it('collapses distant pages', async () => expect(await render('{% paginate items by 1 %}{{ paginate | default_pagination: next: "Next", anchor: "top" }}{% endpaginate %}', { items: Array.from({ length: 10 }, (_, i) => i) })).toBe('<span class="page current">1</span> <span class="page"><a href="/?page=2#top" title="">2</a></span> <span class="page"><a href="/?page=3#top" title="">3</a></span> <span class="page"><a href="/?page=4#top" title="">4</a></span> <span class="deco">&hellip;</span> <span class="page"><a href="/?page=10#top" title="">10</a></span> <span class="next"><a href="/?page=2#top" title="">Next</a></span>'))
  it('exposes the paginate object', async () => expect(await render('{% paginate items by 2 %}{{ paginate.pages }}/{{ paginate.items }}/{{ paginate.current_offset }}{% endpaginate %}', { items: [1, 2, 3] }, { page: 2 })).toBe('2/3/2'))
  it('leaves the array whole outside the block', async () => expect(await render('{% paginate items by 2 %}{{ items | size }}{% endpaginate %}{{ items | size }}', { items: [1, 2, 3] })).toBe('23'))
})
