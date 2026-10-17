import { createShopifyLiquid, renderLiquid, SHOPIFY_DEFAULT_LIMITS } from '../../src/shopify'

describe('createShopifyLiquid', () => {
  const liquid = createShopifyLiquid({ files: { 'snippets/price.liquid': '[{{ amount }}]', 'snippets/sized.liquid': '[{{ size }}]' } })
  const render = (source: string, scope: object = {}) => renderLiquid(liquid, source, scope)

  it('uses Ruby number semantics', async () => expect((await render('{{ 10 | divided_by: 4 }} {{ 2.0 }}')).html).toBe('2 2.0'))
  it('gives a nested loop its parentloop', async () => expect((await render('{% for i in (1..2) %}{% for j in (1..2) %}{{ forloop.parentloop.index }}.{{ forloop.index }} {% endfor %}[{{ forloop.parentloop.index }}]{% endfor %}')).html).toBe('1.1 1.2 []2.1 2.2 []'))
  it('nests comments', async () => expect((await render('a{% comment %}x{% comment %}y{% endcomment %}z{% endcomment %}b')).html).toBe('ab'))
  it('writes render errors inline and keeps going', async () => {
    const { html, report } = await render('a{{ 1 | divided_by: 0 }}b')
    expect(html).toBe('aLiquid error (line 1): divided by 0b')
    expect(report.errors).toEqual([{ message: 'Liquid error (line 1): divided by 0', file: undefined, line: 1 }])
  })
  it('renders an unknown tag as nothing and reports it', async () => {
    const { html, report } = await render('a{% frobnicate %}b{% endfrobnicate %}c')
    expect(html).toBe('abc')
    expect(report.unknownTags.map(entry => entry.name)).toEqual(['frobnicate', 'endfrobnicate'])
  })
  it('passes an unknown filter through and reports it', async () => {
    const { html, report } = await render("{{ 'x' | frobnicate | upcase }}")
    expect(html).toBe('X')
    expect(report.unknownFilters).toEqual([{ name: 'frobnicate', count: 1, files: [] }])
  })
  it('fails the parse on unknown tags when asked to, in Shopify words', async () => {
    const strict = createShopifyLiquid({ unknownTags: 'error' })
    await expect(renderLiquid(strict, '{% frobnicate %}')).rejects.toThrow("Unknown tag 'frobnicate'")
  })
  it('renders snippets from the in-memory files', async () => expect((await render("{% render 'price', amount: 5 %}")).html).toBe('[5]'))
  it('reports a missing snippet in Shopify words', async () => {
    const { html, report } = await render("{% render 'nope' %}")
    expect(html).toBe('Liquid error (line 1): Could not find asset snippets/nope.liquid')
    expect(report.missing).toEqual([{ kind: 'snippet', name: 'snippets/nope.liquid' }])
  })
  it('never reads the disk', async () => expect((await render("{% render '../package' %}")).html).toBe('Liquid error (line 1): Could not find asset snippets/../package.liquid'))
  it('sees an edited snippet on the next render', async () => {
    const files: Record<string, string> = { 'snippets/a.liquid': 'one' }
    const engine = createShopifyLiquid({ files })
    expect((await renderLiquid(engine, "{% render 'a' %}")).html).toBe('one')
    files['snippets/a.liquid'] = 'two'
    expect((await renderLiquid(engine, "{% render 'a' %}")).html).toBe('two')
  })
  it('sets the default limits', () => {
    expect(liquid.options.parseLimit).toBe(SHOPIFY_DEFAULT_LIMITS.parseLimit)
    expect(liquid.options.renderLimit).toBe(SHOPIFY_DEFAULT_LIMITS.renderLimit)
    expect(liquid.options.memoryLimit).toBe(SHOPIFY_DEFAULT_LIMITS.memoryLimit)
  })
  it('lets a caller lower a limit', async () => {
    const small = createShopifyLiquid({ parseLimit: 10 })
    await expect(renderLiquid(small, '{{ "a long template" }}')).rejects.toThrow(/parse length limit exceeded/)
  })
  it('reads an undefined top-level size as nothing, not the number of keys in the globals', async () => {
    expect((await render('[{{ size }}]')).html).toBe('[]')
    expect((await render("{{ size | default: 'M' }}")).html).toBe('M')
    expect((await render('{% if size %}set{% else %}unset{% endif %}')).html).toBe('unset')
    expect((await render("{% render 'sized' %}", {})).html).toBe('[]')
  })
  it('still reads a size that is set, and the size of a value', async () => {
    expect((await render('{{ size }}', { size: 'L' })).html).toBe('L')
    expect((await render("{% assign size = 'S' %}{{ size }}")).html).toBe('S')
    expect((await render("{% render 'sized', size: 'XL' %}")).html).toBe('[XL]')
    expect((await render('{{ list.size }} {{ list | size }} {{ text.size }}', { list: [1, 2], text: 'abc' })).html).toBe('2 2 3')
  })
  it('hides own-property-less values', async () => expect((await render('{{ obj.constructor }}', { obj: {} })).html).toBe(''))
  // Shopify's storefront parses themes with Ruby Liquid's `bug_compatible_whitespace_trimming`. Recorded in liquid-spec (84bf25e) specs/shopify_theme_dawn/index-announcement-bar: Dawn's announcement bar prints its text, then `{%- if block.settings.link != blank -%}`, false there, and Shopify keeps a newline before `</p>`. Shopify's Dawn demo store prints the same kept newline today (`<span>Add to cart\n</span>`, https://theme-dawn-demo.myshopify.com/products/puff-olive-leaf, fetched 2026-10-14).
  it('trims whitespace as the Shopify storefront does', async () => {
    const source = '<p class="announcement-bar__message h5">\n                {{ block.settings.text | escape }}\n                {%- if block.settings.link != blank -%}\n                  {% render \'icon-arrow\' %}\n                {%- endif -%}\n              </p>'
    expect((await render(source, { block: { settings: { text: 'Welcome to our store', link: '' } } })).html).toBe('<p class="announcement-bar__message h5">\n                Welcome to our store\n</p>')
  })
})

// Ruby Liquid drops the text of an `if`, `unless`, `case` or `for` whose every branch is blank, holding only whitespace and tags that print nothing: `parse` in Shopify/liquid lib/liquid/tags/if.rb, for.rb and case.rb calls `remove_blank_strings`. The cases are Shopify/liquid test/integration/blank_test.rb, recorded in liquid-spec (84bf25e) specs/liquid_ruby/specs.yml as `BlankTest#…`.
describe('blank block bodies', () => {
  const N = 10
  const wrapInFor = (body: string) => `{% for i in (1..${N}) %}${body}{% endfor %}`
  const wrapInIf = (body: string) => `{% if true %}${body}{% endif %}`
  const wrap = (body: string) => wrapInFor(body) + wrapInIf(body)
  const html = async (source: string, files: Record<string, string> = {}) => (await renderLiquid(createShopifyLiquid({ files }), source)).html

  it('loops are blank', async () => expect(await html(wrapInFor(' '))).toBe(''))
  it('if else are blank', async () => expect(await html('{% if true %} {% elsif false %} {% else %} {% endif %}')).toBe(''))
  it('unless is blank', async () => expect(await html(wrap('{% unless true %} {% endunless %}'))).toBe(''))
  it('marks as blank only during parsing', async () => expect(await html(wrap(' {% if false %} this never happens, but still, this block is not blank {% endif %}'))).toBe(' '.repeat(N + 1)))
  it('comments are blank', async () => expect(await html(wrap(' {% comment %} whatever {% endcomment %} '))).toBe(''))
  it('captures are blank', async () => expect(await html(wrap(' {% capture foo %} whatever {% endcapture %} '))).toBe(''))
  it('nested blocks are blank but only if all children are', async () => {
    expect(await html(wrap(wrap(' ')))).toBe('')
    expect(await html(wrap('{% if true %} {% comment %} this is blank {% endcomment %} {% endif %}\n      {% if true %} but this is not {% endif %}'))).toBe('\n       but this is not '.repeat(N + 1))
  })
  it('assigns are blank', async () => expect(await html(wrap(' {% assign foo = "bar" %} '))).toBe(''))
  it('whitespace is blank', async () => {
    expect(await html(wrap(' '))).toBe('')
    expect(await html(wrap('\t'))).toBe('')
  })
  it('whitespace is not blank if other stuff is present', async () => expect(await html(wrap('     x '))).toBe('     x '.repeat(N + 1)))
  it('increment is not blank', async () => expect(await html(wrap('{% assign foo = 0 %} {% increment foo %} {% decrement foo %}'))).toBe(' 0'.repeat(2 * (N + 1))))
  it('cycle is not blank', async () => expect(await html(wrap("{% cycle ' ', ' ' %}"))).toBe('  '.repeat((N + 1) >> 1) + ' '))
  it('raw is not blank', async () => expect(await html(wrap(' {% raw %} {% endraw %}'))).toBe('  '.repeat(N + 1)))
  it('include is not blank', async () => expect(await html(wrap("{% include 'foobar' %}"), { 'snippets/foobar.liquid': 'foobar' })).toBe('foobar'.repeat(N + 1)))
  it('case is blank', async () => {
    expect(await html(wrap(" {% assign foo = 'bar' %} {% case foo %} {% when 'bar' %} {% when 'whatever' %} {% else %} {% endcase %} "))).toBe('')
    expect(await html(wrap(" {% assign foo = 'else' %} {% case foo %} {% when 'bar' %} {% when 'whatever' %} {% else %} {% endcase %} "))).toBe('')
    expect(await html(wrap(" {% assign foo = 'else' %} {% case foo %} {% when 'bar' %} {% when 'whatever' %} {% else %} x {% endcase %} "))).toBe('   x  '.repeat(N + 1))
  })
  // Ruby's `Doc#blank?` (lib/liquid/tags/doc.rb) is `@body.empty?`, so a doc with text in it keeps the whitespace around it
  it('a doc tag with text is not blank', async () => expect(await html(wrap(' {% doc %}x{% enddoc %} '))).toBe('  '.repeat(N + 1)))
  // with bug-compatible trimming the `{%-` puts a newline back in the body (block_body.rb `whitespace_handler`), and the blank body drops it again
  it('drops the newline bug-compatible trimming keeps in a blank body', async () => {
    expect(await html('{% if true %}\n  {%- assign a = 1 %}{% endif %}')).toBe('')
    expect(await html('{% if true %}\n  {%- assign a = 1 %}{{ a }}{% endif %}')).toBe('\n1')
  })
})
