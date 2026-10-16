import { createShopifyLiquid, Drop, SchemaTag } from '../../../src/shopify'
import { engineState, createState, STATE } from '../../../src/shopify/state'
import { buildPaginate } from '../../../src/shopify/tags/paginate'
import { renderWithState } from '../../../src/shopify/render-liquid'

const liquid = createShopifyLiquid()
const render = async (source: string, scope: object = {}, request = {}) => (await renderWithState(liquid, source, scope, { request })).html

describe('raw-body Shopify tags', () => {
  it('renders schema as nothing and keeps Liquid inside it as text', async () => expect(await render('a{% schema %}{"name": "{{ x }}"}{% endschema %}b')).toBe('ab'))
  it('exposes the schema JSON', () => {
    const [tag] = liquid.parse('{% schema %}{"name": "Hero", "settings": []}{% endschema %}')
    expect((tag as SchemaTag).json).toEqual({ name: 'Hero', settings: [] })
  })
  it('renders javascript, stylesheet and doc as nothing', async () => expect(await render('a{% javascript %}if (a < b) {}{% endjavascript %}{% stylesheet %}.a{}{% endstylesheet %}{% doc %}@param {string} x{% enddoc %}b')).toBe('ab'))
  it('closes on end tags with whitespace control', async () => expect(await render('a {%- schema -%} {} {%- endschema -%} b')).toBe('ab'))
  // These bodies only parse when the preset lists the tags in `rawTags`: the tokenizer would otherwise read the `{{` and `{%` as Liquid
  it('does not tokenise Liquid inside the bodies', async () => expect(await render('a{% schema %}{"t": "{{ unclosed"}{% endschema %}{% javascript %}var s = "{%";{% endjavascript %}{% stylesheet %}.a::after { content: "{{" }{% endstylesheet %}{% doc %}{% assign {% enddoc %}b')).toBe('ab'))
  it('throws the JSON error from an invalid schema, only when read', () => {
    const [tag] = liquid.parse('{% schema %}{"name": }{% endschema %}')
    expect(() => (tag as SchemaTag).json).toThrow(SyntaxError)
    expect((tag as SchemaTag).source).toBe('{"name": }')
  })
  it('records javascript and stylesheet bodies once per file', async () => {
    const state = createState()
    await liquid.parseAndRender('{% javascript %}a(){% endjavascript %}{% stylesheet %}.a{}{% endstylesheet %}', {}, { globals: { [STATE]: state } })
    await liquid.parseAndRender('{% javascript %}b(){% endjavascript %}{% stylesheet %}.b{}{% endstylesheet %}', {}, { globals: { [STATE]: state } })
    expect([...state.assets.javascripts]).toEqual([['', 'a()']])
    expect([...state.assets.stylesheets]).toEqual([['', '.a{}']])
  })
  it('records the bodies of different files separately, in the order first rendered', async () => {
    const files = createShopifyLiquid({ files: {
      'snippets/a.liquid': '{% javascript %}a(){% endjavascript %}{% stylesheet %}.a{}{% endstylesheet %}',
      'snippets/b.liquid': '{% javascript %}b(){% endjavascript %}{% stylesheet %}.b{}{% endstylesheet %}'
    } })
    const state = createState()
    await files.parseAndRender("{% render 'b' %}{% render 'a' %}{% render 'b' %}", {}, { globals: { [STATE]: state } })
    expect([...state.assets.javascripts]).toEqual([['snippets/b.liquid', 'b()'], ['snippets/a.liquid', 'a()']])
    expect([...state.assets.stylesheets]).toEqual([['snippets/b.liquid', '.b{}'], ['snippets/a.liquid', '.a{}']])
  })
  it('does not carry assets or the layout from one render into the next', async () => {
    const own = createShopifyLiquid()
    await own.parseAndRender("{% javascript %}a(){% endjavascript %}{% stylesheet %}.a{}{% endstylesheet %}{% layout 'alternate' %}")
    await own.parseAndRender('x')
    const defaults = engineState(own.options.globals)!
    expect(defaults.assets.javascripts.size).toBe(0)
    expect(defaults.assets.stylesheets.size).toBe(0)
    expect(defaults.layout).toBeUndefined()
  })
  // a doc is blank only when empty: Ruby Liquid's `Doc#blank?` is `@body.empty?` (Shopify/liquid lib/liquid/tags/doc.rb)
  it('is blank when it prints nothing, so an error in a block holding only these is not written', () => {
    const tags = liquid.parse('{% schema %}{}{% endschema %}{% javascript %}a{% endjavascript %}{% stylesheet %}.a{}{% endstylesheet %}{% doc %}x{% enddoc %}{% doc %}{% enddoc %}')
    expect(tags.map(tag => (tag as SchemaTag).blank())).toEqual([true, true, true, false, true])
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
  // as the parity store renders them (scenarios `page-home`, `page-contact` and `page-home-fr-ca`): the contact and customer forms post to `/contact` anchored at the form's id, `/contact#ContactForm` for `id: 'ContactForm'`, under the view's prefix
  it('anchors the contact and customer form actions at the form id', async () => {
    expect(await render("{% form 'contact', id: 'ContactForm', class: 'isolate' %}{% endform %}")).toContain('<form method="post" action="/contact#ContactForm" id="ContactForm" accept-charset="UTF-8" class="isolate">')
    expect(await render("{% form 'customer', id: 'ContactFooter-24f2', class: 'footer__newsletter newsletter-form' %}{% endform %}")).toContain('<form method="post" action="/contact#ContactFooter-24f2" id="ContactFooter-24f2" accept-charset="UTF-8" class="footer__newsletter newsletter-form">')
    expect(await render("{% form 'customer', id: 'ContactFooter-24f2' %}{% endform %}", {}, { prefix: '/fr-ca' })).toContain('action="/fr-ca/contact#ContactFooter-24f2" id="ContactFooter-24f2"')
    expect(await render("{% form 'customer' %}{% endform %}")).toContain('action="/contact#contact_form" id="contact_form"')
  })
  it('renders a product form with attributes', async () => expect(await render("{% form 'product', product, id: 'custom-id', class: 'custom-class', data-example: '100' %}<!-- form content -->{% endform %}", { product: { id: 6786188247105 } })).toBe('<form method="post" action="/cart/add" id="custom-id" accept-charset="UTF-8" class="custom-class" enctype="multipart/form-data" data-example="100"><input type="hidden" name="form_type" value="product" /><input type="hidden" name="utf8" value="✓" /><!-- form content --><input type="hidden" name="product-id" value="6786188247105" /></form>'))
  it('renders a product form with its default id and class', async () => expect(await render("{% form 'product', product %}{% endform %}", { product: { id: 7 } })).toBe('<form method="post" action="/cart/add" id="product_form_7" accept-charset="UTF-8" class="shopify-product-form" enctype="multipart/form-data"><input type="hidden" name="form_type" value="product" /><input type="hidden" name="utf8" value="✓" /><input type="hidden" name="product-id" value="7" /></form>'))
  // Shopify's output today, from Shopify's Dawn demo store (https://theme-dawn-demo.myshopify.com/products/puff-olive-leaf, Dawn 15.0.0, fetched 2026-10-14). The source is Dawn 15.0.0 sections/main-product.liquid lines 137–141 (from the first tag on), and no Dawn 15.0.0 file prints a `product-id` or `section-id` input, so both come from the form tag: inside a section it adds the section's id after the product's. https://shopify.dev/docs/api/liquid/tags/form renders its example outside a section and shows no `section-id`. The newline before them is the storefront's bug-compatible trimming.
  it('adds the section id to a product form inside a section', async () => {
    const source = "{%- assign product_form_installment_id = 'product-form-installment-' | append: section.id -%}\n                  {%- form 'product', product, id: product_form_installment_id, class: 'installment caption-large' -%}\n                    <input type=\"hidden\" name=\"id\" value=\"{{ product.selected_or_first_available_variant.id }}\">\n                    {{ form | payment_terms }}\n                  {%- endform -%}"
    const id = 'template--15968258293849__main'
    const frames = [{ kind: 'section' as const, section: { id, type: 'main-product', index: null }, container: {}, sectionObject: null }]
    const { html } = await renderWithState(liquid, source, { section: { id }, product: { id: 6920737783897, selected_or_first_available_variant: { id: 39577057001561 } } }, { frames })
    expect(html).toBe('<form method="post" action="/cart/add" id="product-form-installment-template--15968258293849__main" accept-charset="UTF-8" class="installment caption-large" enctype="multipart/form-data"><input type="hidden" name="form_type" value="product" /><input type="hidden" name="utf8" value="✓" /><input type="hidden" name="id" value="39577057001561">\n                    \n<input type="hidden" name="product-id" value="6920737783897" /><input type="hidden" name="section-id" value="template--15968258293849__main" /></form>')
  })
  it('adds return_to', async () => expect(await render("{% form 'customer_login', return_to: routes.root_url %}{% endform %}", { routes: { root_url: '/' } })).toBe('<form method="post" action="/account/login" id="customer_login" accept-charset="UTF-8" data-login-with-shop-sign-in="true"><input type="hidden" name="form_type" value="customer_login" /><input type="hidden" name="utf8" value="✓" /><input type="hidden" name="return_to" value="/" /></form>'))
  it('renders a guest login form', async () => expect(await render("{% form 'guest_login' %}{% endform %}")).toBe('<form method="post" action="/account/login" id="customer_login_guest" accept-charset="UTF-8"><input type="hidden" name="form_type" value="guest_login" /><input type="hidden" name="utf8" value="✓" /><input type="hidden" name="guest" value="true" /></form>'))
  it('renders a localization form returning to the current page', async () => expect(await render("{% form 'localization', id: 'HeaderCountryForm', class: 'localization-form' %}{% endform %}", {}, { path: '/products/tee' })).toBe('<form method="post" action="/localization" id="HeaderCountryForm" accept-charset="UTF-8" class="localization-form" enctype="multipart/form-data"><input type="hidden" name="form_type" value="localization" /><input type="hidden" name="utf8" value="✓" /><input type="hidden" name="_method" value="put" /><input type="hidden" name="return_to" value="/products/tee" /></form>'))
  it('renders a new comment form for the article', async () => expect(await render("{% form 'new_comment', article %}{% endform %}", { article: { url: '/blogs/news/hello' } })).toBe('<form method="post" action="/blogs/news/hello/comments#comment_form" id="comment_form" accept-charset="UTF-8" class="comment-form"><input type="hidden" name="form_type" value="new_comment" /><input type="hidden" name="utf8" value="✓" /></form>'))
  it('renders a new address form', async () => expect(await render("{% form 'customer_address', customer.new_address %}{% endform %}", { customer: { new_address: {} } })).toBe('<form method="post" action="/account/addresses" id="address_form_new" accept-charset="UTF-8"><input type="hidden" name="form_type" value="customer_address" /><input type="hidden" name="utf8" value="✓" /></form>'))
  it('writes boolean attributes in Shopify form', async () => expect(await render("{% form 'contact', novalidate: true %}{% endform %}")).toContain('class="contact-form" novalidate="novalidate">'))
  it('gives the body a form object with nothing posted', async () => expect(await render("{% form 'contact' %}{{ form.posted_successfully? }}|{{ form.errors | size }}|{{ form.id }}{% endform %}")).toContain('false|0|contact_form</form>'))
  // https://shopify.dev/docs/api/liquid/objects/form
  it('gives a new address form the id new, a successful post and the single-quoted default checkbox', async () => expect(await render("{% form 'customer_address', customer.new_address %}{{ form.id }}|{{ form.posted_successfully? }}|{{ form.set_as_default_checkbox }}{% endform %}", { customer: { new_address: {} } })).toContain("new|true|<input type='checkbox' id='address_default_address_new' name='address[default]' value='1'></form>"))
  it('gives an existing address form its own id', async () => expect(await render("{% form 'customer_address', address %}{{ form.id }}|{{ form.set_as_default_checkbox }}{% endform %}", { address: { id: 42 } })).toContain("42|<input type='checkbox' id='address_default_address_42' name='address[default]' value='1'>"))
  it('says a login needs a password and other forms do not', async () => {
    expect(await render("{% form 'customer_login' %}{{ form.password_needed }}|{{ form.posted_successfully? }}{% endform %}")).toContain('true|false</form>')
    expect(await render("{% form 'contact' %}{{ form.password_needed }}{% endform %}")).toContain('false</form>')
  })
  it('replaces the default return_to instead of adding a second one', async () => {
    const html = await render("{% form 'localization', return_to: '/elsewhere' %}{% endform %}", {}, { path: '/products/tee' })
    expect(html.match(/name="return_to"/g)).toHaveLength(1)
    expect(html).toContain('<input type="hidden" name="return_to" value="/elsewhere" />')
  })
  it('fails inline on an unknown form type', async () => expect(await render("{% form 'nope' %}{% endform %}")).toBe('Liquid error (line 1): Unknown form type: nope'))
})

describe('paginate', () => {
  const products = Array.from({ length: 19 }, (_, i) => ({ title: `P${i + 1}` }))
  const source = '{% paginate collection.products by 5 %}{% for product in collection.products %}{{ product.title }},{% endfor %}{{ paginate | default_pagination }}{% endpaginate %}'

  // Markup from https://shopify.dev/docs/api/liquid/tags/paginate (4 pages, page 1)
  it('slices the array and renders Shopify pagination', async () => expect(await render(source, { collection: { products } }, { path: '/collections/all' })).toBe('P1,P2,P3,P4,P5,<span class="page current">1</span> <span class="page"><a href="/collections/all?page=2" title="">2</a></span> <span class="page"><a href="/collections/all?page=3" title="">3</a></span> <span class="page"><a href="/collections/all?page=4" title="">4</a></span> <span class="next"><a href="/collections/all?page=2" title="">Next &raquo;</a></span>'))
  it('shows the requested page', async () => expect(await render(source, { collection: { products } }, { path: '/collections/all', page: 4 })).toBe('P16,P17,P18,P19,<span class="prev"><a href="/collections/all?page=3" title="">&laquo; Previous</a></span> <span class="page"><a href="/collections/all?page=1" title="">1</a></span> <span class="page"><a href="/collections/all?page=2" title="">2</a></span> <span class="page"><a href="/collections/all?page=3" title="">3</a></span> <span class="page current">4</span>'))
  // The default_pagination page: https://shopify.dev/docs/api/liquid/filters/default_pagination (collection.products holds one page, products_count the total)
  const twoOfFour = { collection: { products: [{ title: 'Draught of Immortality' }, { title: 'Glacier ice' }], products_count: 4 } }
  const resource = { path: '/services/liquid_rendering/resource' }
  const nav = '{{ paginate | default_pagination'
  const pageOne = '<span class="page current">1</span> <span class="page"><a href="/services/liquid_rendering/resource?page=2" title="">2</a></span>'
  it('renders the default_pagination example', async () => expect(await render(`{% paginate collection.products by 2 %}${nav} }}{% endpaginate %}`, twoOfFour, resource)).toBe(`${pageOne} <span class="next"><a href="/services/liquid_rendering/resource?page=2" title="">Next &raquo;</a></span>`))
  it('renders the next example', async () => expect(await render(`{% paginate collection.products by 2 %}${nav}: next: 'Next' }}{% endpaginate %}`, twoOfFour, resource)).toBe(`${pageOne} <span class="next"><a href="/services/liquid_rendering/resource?page=2" title="">Next</a></span>`))
  it('renders the anchor example', async () => expect(await render(`{% paginate collection.products by 2 %}<div id="pagination">${nav}: anchor: 'pagination' }}</div>{% endpaginate %}`, twoOfFour, resource)).toBe('<div id="pagination"><span class="page current">1</span> <span class="page"><a href="/services/liquid_rendering/resource?page=2#pagination" title="">2</a></span> <span class="next"><a href="/services/liquid_rendering/resource?page=2#pagination" title="">Next &raquo;</a></span></div>'))
  it('escapes the anchor', async () => expect(await render(`{% paginate collection.products by 2 %}${nav}: anchor: 'a"b' }}{% endpaginate %}`, twoOfFour, resource)).toContain('?page=2#a&quot;b" title=""'))
  // The previous example only shows page 1, which has no previous link; the output on page 2 follows the same markup (the link text is the previous: argument)
  it('uses the previous text for the previous link', async () => expect(await render(`{% paginate collection.products by 2 %}${nav}: previous: 'Previous' }}{% endpaginate %}`, twoOfFour, { ...resource, page: 2 })).toMatch(/^<span class="prev"><a href="\/services\/liquid_rendering\/resource\?page=1" title="">Previous<\/a><\/span> /))

  // https://shopify.dev/docs/api/liquid/tags/paginate, window_size: 1 (3 products of products_count 19, so 7 pages)
  const windowData = { collection: { products: [{ title: 'Blue Mountain Flower' }, { title: 'Charcoal' }, { title: 'Crocodile tears' }], products_count: 19 } }
  it('renders the window_size example', async () => expect(await render('{% paginate collection.products by 3, window_size: 1 %}{% for product in collection.products %}{{ product.title }},{% endfor %}{{ paginate | default_pagination }}{% endpaginate %}', windowData, resource)).toBe('Blue Mountain Flower,Charcoal,Crocodile tears,<span class="page current">1</span> <span class="deco">&hellip;</span> <span class="page"><a href="/services/liquid_rendering/resource?page=7" title="">7</a></span> <span class="next"><a href="/services/liquid_rendering/resource?page=2" title="">Next &raquo;</a></span>'))
  it('takes an array shorter than products_count to be the page the host already fetched', async () => expect(await render('{% paginate collection.products by 3 %}{% for product in collection.products %}{{ product.title }},{% endfor %}{{ paginate.current_page }}/{{ paginate.pages }}{% endpaginate %}', windowData, { page: 2 })).toBe('Blue Mountain Flower,Charcoal,Crocodile tears,2/7'))
  it('counts pages from products_count when the array is absent, as the part example does', async () => expect(await render('{% paginate collection.products by 5 %}{% for part in paginate.parts %}{{ part.title }}{{ part.is_link }},{% endfor %}{{ paginate.pages }}/{{ paginate.items }}{% endpaginate %}', { collection: { products_count: 19 } })).toBe('1false,2true,3true,4true,4/19'))
  it('keeps the default window of three pages around the current one', async () => expect(await render('{% paginate items by 1 %}{{ paginate | default_pagination: next: "Next", anchor: "top" }}{% endpaginate %}', { items: Array.from({ length: 10 }, (_, i) => i) })).toBe('<span class="page current">1</span> <span class="page"><a href="/?page=2#top" title="">2</a></span> <span class="page"><a href="/?page=3#top" title="">3</a></span> <span class="deco">&hellip;</span> <span class="page"><a href="/?page=10#top" title="">10</a></span> <span class="next"><a href="/?page=2#top" title="">Next</a></span>'))
  it('clamps the page size to 1 through 250', async () => {
    const items = Array.from({ length: 1000 }, (_, i) => i)
    expect(await render('{% paginate items by 300 %}{{ paginate.page_size }}/{{ paginate.pages }}/{{ items | size }}{% endpaginate %}', { items })).toBe('250/4/250')
    expect(await render('{% paginate items by 0 %}{{ paginate.page_size }}/{{ paginate.pages }}/{{ items | size }}{% endpaginate %}', { items })).toBe('1/1000/1')
    expect(await render('{% paginate items by -3 %}{{ paginate.page_size }}/{{ paginate.pages }}/{{ items | size }}{% endpaginate %}', { items })).toBe('1/1000/1')
  })
  // https://shopify.dev/docs/api/liquid/tags/paginate: "to the 25,000th item in the array and no further"; the object page limits items, pages and current_page to 25,000 and current_offset to 24,999
  it('stops at 25,000 items', async () => {
    const items = Array.from({ length: 30000 }, (_, i) => i)
    expect(await render('{% paginate items by 1 %}{{ paginate.items }}/{{ paginate.pages }}/{{ paginate.current_page }}/{{ paginate.current_offset }}/{{ items | first }}{% endpaginate %}', { items }, { page: 26000 })).toBe('25000/25000/25000/24999/24999')
    expect(await render('{% paginate items by 250 %}{{ paginate.items }}/{{ paginate.pages }}/{{ items | size }}{% endpaginate %}', { items }, { page: 100 })).toBe('25000/100/250')
    expect(await render('{% paginate items by 250 %}{{ items | size }}{% endpaginate %}', { items }, { page: 101 })).toBe('0')
    const paginate = buildPaginate(30000, 1, 26000, '/')
    expect([paginate.items, paginate.pages, paginate.current_page, paginate.current_offset]).toEqual([25000, 25000, 25000, 24999])
    expect(buildPaginate(30000, 2, 20000, '/').current_offset).toBe(24999)
  })
  it('replaces a property that is a getter on a Drop, and leaves the Drop a Drop', async () => {
    class Collection extends Drop {
      get products () { return products }
      get title () { return 'All' }
    }
    expect(await render('{% paginate collection.products by 2 %}{{ collection.title }}:{% for product in collection.products %}{{ product.title }},{% endfor %}{{ paginate.pages }}{% endpaginate %}', { collection: new Collection() }, { page: 2 })).toBe('All:P3,P4,10')
  })
  it('exposes the paginate object', async () => expect(await render('{% paginate items by 2 %}{{ paginate.pages }}/{{ paginate.items }}/{{ paginate.current_offset }}{% endpaginate %}', { items: [1, 2, 3] }, { page: 2 })).toBe('2/3/2'))
  it('leaves the array whole outside the block', async () => expect(await render('{% paginate items by 2 %}{{ items | size }}{% endpaginate %}{{ items | size }}', { items: [1, 2, 3] })).toBe('23'))
})

describe('tablerow', () => {
  const potions = { potions: ['Draught', 'Glacier ice', 'Health potion'] }
  it('opens the first row with a line break and closes every row, as shopify.dev prints it', async () => {
    expect(await render('<table>{% tablerow p in potions %}{{ p }}{% endtablerow %}</table>', potions))
      .toBe('<table><tr class="row1">\n<td class="col1">Draught</td><td class="col2">Glacier ice</td><td class="col3">Health potion</td></tr>\n</table>')
  })
  it('breaks the line after a closed row but not after an opened one', async () => {
    expect(await render('{% tablerow p in potions cols: 2 %}{{ p }}{% endtablerow %}', potions))
      .toBe('<tr class="row1">\n<td class="col1">Draught</td><td class="col2">Glacier ice</td></tr>\n<tr class="row2"><td class="col1">Health potion</td></tr>\n')
  })
  it('does not open an extra row when the last row is full', async () => {
    expect(await render('{% tablerow p in (1..4) cols: 2 %}{{ p }}{% endtablerow %}')).toBe('<tr class="row1">\n<td class="col1">1</td><td class="col2">2</td></tr>\n<tr class="row2"><td class="col1">3</td><td class="col2">4</td></tr>\n')
  })
  it('prints an empty row for an empty collection', async () => expect(await render('{% tablerow p in empty %}{{ p }}{% endtablerow %}', { empty: [] })).toBe('<tr class="row1">\n</tr>\n'))
  it('prints nothing for a value that is no collection, and keeps the loop around it', async () => {
    expect(await render('[{% tablerow p in nothing %}{{ p }}{% endtablerow %}]')).toBe('[]')
    expect(await render('[{% tablerow p in off %}{{ p }}{% endtablerow %}]', { off: false })).toBe('[]')
    expect(await render('{% for i in (0..1) %}{% tablerow p in nothing %}{{ p }}{% endtablerow %}{{ i }}{% endfor %}')).toBe('01')
  })
  it('never wraps the row for a cols that is not a positive number', async () => {
    const cells = '<tr class="row1">\n<td class="col1">1</td><td class="col2">2</td><td class="col3">3</td></tr>\n'
    expect(await render('{% tablerow p in (1..3) cols: nothing %}{{ p }}{% endtablerow %}')).toBe(cells)
    expect(await render("{% tablerow p in (1..3) cols: 'abc' %}{{ p }}{% endtablerow %}")).toBe(cells)
    expect(await render('{% tablerow p in (1..3) cols: 0 %}{{ p }}{% endtablerow %}')).toBe(cells)
  })
  it('applies limit and offset', async () => {
    expect(await render('{% tablerow p in potions offset: 1 limit: 1 %}{{ p }}{% endtablerow %}', potions)).toBe('<tr class="row1">\n<td class="col1">Glacier ice</td></tr>\n')
  })
  it('keeps tablerowloop', async () => expect(await render('{% tablerow p in (1..3) cols: 2 %}{{ tablerowloop.row }}.{{ tablerowloop.col }}{% endtablerow %}')).toBe('<tr class="row1">\n<td class="col1">1.1</td><td class="col2">1.2</td></tr>\n<tr class="row2"><td class="col1">2.1</td></tr>\n'))
  it('leaves the root entry as it is', async () => {
    const { Liquid } = await import('../../../src')
    expect(await new Liquid().parseAndRender('{% tablerow p in (1..2) %}{{ p }}{% endtablerow %}')).toBe('<tr class="row1"><td class="col1">1</td><td class="col2">2</td></tr>')
  })
})
