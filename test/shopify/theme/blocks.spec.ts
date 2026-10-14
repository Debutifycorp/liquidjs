import { join } from 'path'
import { createShopifyLiquid, renderLiquid, renderPage, renderSection } from '../../../src/shopify'
import { loadTheme } from './load-fixture'

const theme = loadTheme(join(__dirname, '../fixtures/theme'))

describe('shopify/theme/blocks', () => {
  it('renders theme blocks, nested static blocks and section static blocks', async () => {
    const { html, report } = await renderPage({ theme, templateName: 'page.slides' })
    // slide.liquid and slideshow.liquid end with a tag or output, a newline and `{%- schema -%}`: the storefront's bug-compatible trimming keeps that newline
    expect(html).toBe(
      '<div id="shopify-section-template--page-slides__slides" class="shopify-section"><div class="slides">' +
      '<div id="shopify-block-s1" class="shopify-block slide"><h3>First</h3><span class="badge" style="color: red">Sale|badge|template--page-slides__slides</span>\n</div>' +
      '<div id="shopify-block-s3" class="shopify-block slide"><h3>Untitled</h3><span class="badge" style="color: red">New|badge|template--page-slides__slides</span>\n</div>' +
      '</div>4|Untitled\n</div>' +
      '<div id="shopify-section-template--page-slides__promo" class="shopify-section"><aside><span class="badge" style="color: blue">New|promo-badge|template--page-slides__promo</span></aside></div>'
    )
    expect(report.missing).toEqual([{ kind: 'block', name: 'no-such-block' }])
    expect(report.unsupported).toEqual([{ feature: 'app_block', detail: 'slideshow: @app' }])
    expect(report.errors).toEqual([])
  })
  it('reports content_for outside a theme render', async () => {
    const { html, report } = await renderLiquid(createShopifyLiquid(), "[{% content_for 'blocks' %}]")
    expect(html).toBe('[]')
    expect(report.unsupported).toEqual([{ feature: 'content_for', detail: "{% content_for 'blocks' %} outside renderPage" }])
  })
  it('rejects an unknown content_for type inline', async () => {
    const files = { ...theme.files, 'sections/promo.liquid': "{% content_for 'nope' %}" }
    const { html } = await renderPage({ theme: { files }, templateName: 'page.slides' })
    expect(html).toContain('<div id="shopify-section-template--page-slides__promo" class="shopify-section">Liquid error (sections/promo line 1): content_for: unknown type \'nope\'</div>')
  })

  /** A one-section page over `files`, rendered without a layout: the section is `sec` in `templates/x.json`, with `data` as its saved JSON. */
  const page = (files: Record<string, string>, data: object = {}, options: { renderLimit?: number, trustHtmlSettings?: boolean } = {}) =>
    renderPage({
      theme: { files: { 'templates/x.json': JSON.stringify({ layout: false, sections: { main: { type: 'sec', ...data } } }), ...files } },
      templateName: 'x',
      ...options
    })
  const WRAP = (id: string, inner: string, classes = '') => `<div id="shopify-block-${id}" class="shopify-block${classes}">${inner}</div>`
  const SECTION = (inner: string) => `<div id="shopify-section-template--x__main" class="shopify-section">${inner}</div>`

  describe('content_for blocks', () => {
    const files = {
      'sections/sec.liquid': "[{% content_for 'blocks' %}]",
      'blocks/text.liquid': '{{ block.type }}:{{ block.id }}:{{ block.settings.text }}:{{ block.shopify_attributes }}:{{ section.id }}',
      'blocks/group.liquid': "<{{ block.id }}>{% content_for 'blocks' %}</{{ block.id }}>"
    }
    it('renders nested blocks through their own content_for, in block_order', async () => {
      const { html, report } = await page(files, {
        blocks: {
          outer: { type: 'group', blocks: { in2: { type: 'text', settings: { text: 'two' } }, in1: { type: 'text', settings: { text: 'one' } }, hidden: { type: 'text', disabled: true } }, block_order: ['in1', 'in2', 'hidden'] },
          after: { type: 'text', settings: { text: 'last' } }
        },
        block_order: ['outer', 'after']
      })
      expect(html).toBe(SECTION('[' + WRAP('outer', '<outer>' + WRAP('in1', 'text:in1:one::template--x__main') + WRAP('in2', 'text:in2:two::template--x__main') + '</outer>') + WRAP('after', 'text:after:last::template--x__main') + ']'))
      expect(report.errors).toEqual([])
      expect(report.sections.map(entry => entry.status)).toEqual(['rendered'])
    })
    it('renders blocks in the saved order of blocks when there is no block_order, and skips static ones', async () => {
      const { html } = await page(files, { blocks: { b: { type: 'text', settings: { text: 'b' } }, fixed: { type: 'text', static: true }, a: { type: 'text', settings: { text: 'a' } } } })
      expect(html).toBe(SECTION('[' + WRAP('b', 'text:b:b::template--x__main') + WRAP('a', 'text:a:a::template--x__main') + ']'))
    })
    it('renders nothing for a section without blocks', async () => {
      expect((await page(files)).html).toBe(SECTION('[]'))
    })
    // `block.blocks` is not on https://shopify.dev/docs/api/liquid/objects/block, but Shopify's Horizon theme reads it in a theme block (blocks/_carousel-content.liquid: `assign slide_count = block.blocks.size`, then `{% content_for 'blocks' %}`), so a theme block's `blocks` are the children its `content_for 'blocks'` renders. https://shopify.dev/docs/api/liquid/tags/render says a snippet "inside a section can access the `section` object", as it can the other objects outside it that are not created variables.
    it('gives a theme block its own blocks, and a snippet it renders its section and block', async () => {
      const { html } = await page({
        'sections/sec.liquid': "{% content_for 'blocks' %}",
        'blocks/group.liquid': "{{ block.blocks.size }}:{% for child in block.blocks %}{{ child.id }}={{ child.settings.text }},{% endfor %}{% if block.blocks.size == 0 %}{% render 'fallback' %}{% endif %}",
        'blocks/text.liquid': '{{ block.settings.text }}{% schema %}{ "name": "Text", "settings": [{ "type": "text", "id": "text", "label": "Text" }] }{% endschema %}',
        'snippets/fallback.liquid': '({{ section.id }}|{{ block.id }})'
      }, {
        blocks: {
          full: { type: 'group', blocks: { b: { type: 'text', settings: { text: 'two' } }, a: { type: 'text', settings: { text: 'one' } }, fixed: { type: 'text', static: true } }, block_order: ['a', 'b'] },
          empty: { type: 'group' }
        },
        block_order: ['full', 'empty']
      })
      expect(html).toBe(SECTION(WRAP('full', '2:a=one,b=two,') + WRAP('empty', '0:(template--x__main|empty)')))
    })
    // https://shopify.dev/docs/api/liquid/tags/render renders "a snippet or app block", and https://shopify.dev/docs/storefronts/themes/architecture/blocks/app-blocks shows `{% render block %}` in a section's block loop. A theme block given to it renders the way `content_for` renders it: in its `<div id="shopify-block-<id>" class="shopify-block">` wrapper, or bare when its schema has `"tag": null`, with its own blocks. shopify.dev documents only the app-block case, so this is Debutify's reading.
    it('renders a theme block given to render as content_for does, wrapper and children included', async () => {
      const { html, report } = await page({
        'sections/sec.liquid': "{% content_for 'blocks' %}{% for b in section.blocks %}({% render b %}){% endfor %}",
        'blocks/list.liquid': '{% for child in block.blocks %}<li>{% render child %}</li>{% endfor %}',
        'blocks/item.liquid': '{{ block.id }}:{{ block.settings.text }}{% content_for "blocks" %}{% schema %}{ "name": "Item", "settings": [{ "type": "text", "id": "text", "label": "Text" }] }{% endschema %}',
        'blocks/bare.liquid': '[{{ block.id }}]{% schema %}{ "name": "Bare", "tag": null }{% endschema %}'
      }, {
        blocks: {
          l: { type: 'list', blocks: { i1: { type: 'item', settings: { text: 'one' }, blocks: { n: { type: 'bare' } } }, i2: { type: 'bare' }, app: { type: '@app' } }, block_order: ['i1', 'i2', 'app'] }
        },
        block_order: ['l']
      })
      const list = '<li>' + WRAP('i1', 'i1:one[n]') + '</li><li>[i2]</li><li></li>'
      expect(html).toBe(SECTION(WRAP('l', list) + '(' + WRAP('l', list) + ')'))
      expect(report.errors).toEqual([])
      expect(report.unsupported).toEqual([{ feature: 'app_block', detail: 'sec block list l: @app' }])
      expect(report.sections.map(entry => entry.status)).toEqual(['rendered'])
    })
    it('makes a render of a value that is neither a snippet name nor a block a Liquid error', async () => {
      const { html } = await page({ 'sections/sec.liquid': '{% assign n = 5 %}[{% render n %}][{% render section.settings %}]' })
      expect(html).toBe(SECTION('[Liquid error (sections/sec line 1): render needs a snippet name or a block, not a number][Liquid error (sections/sec line 1): render needs a snippet name or a block, not an object]'))
    })
    it('shows a block the page globals and its section but not the variables around it', async () => {
      const { html } = await page({
        'sections/sec.liquid': "{% assign outer = 'o' %}{% content_for 'blocks' %}|{{ inner }}|{{ block.id }}",
        'blocks/text.liquid': "{{ shop.name }}[{{ outer }}]{% assign inner = 'i' %}",
        'blocks/group.liquid': "{% assign mine = 'g' %}{% content_for 'blocks' %}"
      }, { blocks: { g: { type: 'group', blocks: { t: { type: 'text' } }, block_order: ['t'] } }, block_order: ['g'] })
      expect(html).toBe(SECTION(WRAP('g', WRAP('t', 'Sample Store[]')) + '||'))
    })
    it('leaves the frame stack as it found it, so the section renders its own blocks again afterwards', async () => {
      const { html } = await page({
        'sections/sec.liquid': "{% content_for 'blocks' %}|{% content_for 'blocks' %}",
        'blocks/text.liquid': 't{{ block.id }}',
        'blocks/group.liquid': "g{% content_for 'blocks' %}"
      }, { blocks: { g: { type: 'group', blocks: { c: { type: 'text' } }, block_order: ['c'] } }, block_order: ['g'] })
      const once = WRAP('g', 'g' + WRAP('c', 'tc'))
      expect(html).toBe(SECTION(once + '|' + once))
    })
    it('lets a block read the translations of its section schema', async () => {
      const { html } = await page({
        'sections/sec.liquid': "{% content_for 'blocks' %}{% schema %}{ \"locales\": { \"en\": { \"greeting\": \"Hi\" } } }{% endschema %}",
        'blocks/text.liquid': "{{ 'sections.sec.greeting' | t }}"
      }, { blocks: { t: { type: 'text' } } })
      expect(html).toBe(SECTION(WRAP('t', 'Hi')))
    })
    it('does not hold the saved blocks to the types the section schema lists', async () => {
      const { html } = await page({
        'sections/sec.liquid': "{% content_for 'blocks' %}{% schema %}{ \"blocks\": [{ \"type\": \"text\" }] }{% endschema %}",
        'blocks/a-b_c.liquid': 'x'
      }, { blocks: { k: { type: 'a-b_c' } } })
      expect(html).toBe(SECTION(WRAP('k', 'x')))
    })
    it('skips app blocks and reports each kind of type', async () => {
      const { html, report } = await page(files, {
        blocks: {
          one: { type: '@app' },
          two: { type: 'shopify://apps/reviews/blocks/stars/0b1b2c3d-1111-2222-3333-444455556666' },
          bad: { type: 7 },
          none: {},
          ok: { type: 'text', settings: { text: 'ok' } }
        },
        block_order: ['one', 'two', 'bad', 'none', 'ok']
      })
      expect(html).toBe(SECTION('[' + WRAP('ok', 'text:ok:ok::template--x__main') + ']'))
      expect(report.unsupported).toEqual([
        { feature: 'app_block', detail: 'sec: @app' },
        { feature: 'app_block', detail: 'sec: shopify://apps/reviews/blocks/stars/0b1b2c3d-1111-2222-3333-444455556666' }
      ])
      expect(report.missing).toEqual([{ kind: 'block', name: '(no type)' }])
    })
    it('names the block that holds a skipped app block, or the section when it is at the top', async () => {
      const { html, report } = await page(files, {
        blocks: {
          top: { type: '@app' },
          g: { type: 'group', blocks: { inner: { type: '@app' }, kept: { type: 'text', settings: { text: 'k' } } }, block_order: ['inner', 'kept'] }
        },
        block_order: ['top', 'g']
      })
      expect(html).toBe(SECTION('[' + WRAP('g', '<g>' + WRAP('kept', 'text:kept:k::template--x__main') + '</g>') + ']'))
      expect(report.unsupported).toEqual([
        { feature: 'app_block', detail: 'sec: @app' },
        { feature: 'app_block', detail: 'sec block group g: @app' }
      ])
    })
    it('reports content_for blocks and block in a template that is not a section', async () => {
      const files = {
        'templates/y.liquid': "[{% content_for 'blocks' %}{% content_for 'block', type: 'text', id: 'a' %}]",
        'blocks/text.liquid': 'never'
      }
      const { html, report } = await renderPage({ theme: { files }, templateName: 'y' })
      expect(html).toBe('[]')
      expect(report.unsupported).toEqual([
        { feature: 'content_for', detail: "'blocks' outside a section" },
        { feature: 'content_for', detail: "'block' outside a section" }
      ])
    })
  })

  describe('block wrapper', () => {
    it('uses the schema tag and class, or the div with the shopify-block class', async () => {
      const files = {
        'sections/sec.liquid': "{% content_for 'blocks' %}",
        'blocks/pic.liquid': '<img>{% schema %}{ "tag": "picture", "class": "hero wide" }{% endschema %}',
        'blocks/custom.liquid': '.{% schema %}{ "tag": "my-card" }{% endschema %}',
        'blocks/evil.liquid': '.{% schema %}{ "tag": "div onclick=alert(1)", "class": "a\\"b" }{% endschema %}',
        'blocks/numeric.liquid': '.{% schema %}{ "tag": 5 }{% endschema %}',
        'blocks/bare.liquid': '<b>{{ block.id }}</b>{% schema %}{ "tag": null, "class": "ignored" }{% endschema %}',
        'blocks/plain.liquid': '.'
      }
      const { html } = await page(files, {
        blocks: { p: { type: 'pic' }, c: { type: 'custom' }, e: { type: 'evil' }, n: { type: 'numeric' }, b: { type: 'bare' }, d: { type: 'plain' }, 'x"y': { type: 'plain' } },
        block_order: ['p', 'c', 'e', 'n', 'b', 'd', 'x"y']
      }, { trustHtmlSettings: true })
      // a block key with a quote is only kept for a theme trusted with html (see the next test), and the wrapper escapes it
      expect(html).toBe(SECTION(
        '<picture id="shopify-block-p" class="shopify-block hero wide"><img></picture>' +
        '<my-card id="shopify-block-c" class="shopify-block">.</my-card>' +
        '<div id="shopify-block-e" class="shopify-block a&quot;b">.</div>' +
        '<div id="shopify-block-n" class="shopify-block">.</div>' +
        '<b>b</b>' +
        '<div id="shopify-block-d" class="shopify-block">.</div>' +
        '<div id="shopify-block-x&quot;y" class="shopify-block">.</div>'
      ))
    })
    it('skips a block whose key or type is not plain unless the theme is trusted with html, and reports it without the value', async () => {
      const files = { 'sections/sec.liquid': "{% content_for 'blocks' %}|{% for b in section.blocks %}{{ b.id }}={{ b.type }},{% endfor %}", 'blocks/plain.liquid': '.' }
      const data = { blocks: { 'x"y': { type: 'plain' }, ok: { type: 'plain' }, t: { type: 'p"q' } }, block_order: ['x"y', 'ok', 't'] }
      const { html, report } = await page(files, data)
      expect(html).toBe(SECTION(WRAP('ok', '.') + '|ok=plain,'))
      expect(report.unsupported).toEqual([
        { feature: 'unsafe_key', detail: 'a block key with characters other than letters, digits, - and _ was skipped' },
        { feature: 'unsafe_key', detail: 'a block type with characters other than letters, digits, - and _ was skipped' }
      ])
      const trusted = await page(files, data, { trustHtmlSettings: true })
      expect(trusted.html).toContain('x&quot;y')
      expect(trusted.report.unsupported.filter(entry => entry.feature === 'unsafe_key')).toEqual([])
    })
    it('ignores a class that is not a string, and reports it', async () => {
      const files = {
        'sections/sec.liquid': "{% content_for 'blocks' %}{% schema %}{ \"class\": [\"s\", \"t\"] }{% endschema %}",
        'blocks/list.liquid': '.{% schema %}{ "class": ["a", "b"] }{% endschema %}',
        'blocks/object.liquid': '.{% schema %}{ "class": { "x": 1 }, "tag": "p" }{% endschema %}',
        'blocks/number.liquid': '.{% schema %}{ "class": 5, "settings": [] }{% endschema %}'
      }
      const { html, report } = await page(files, { blocks: { l: { type: 'list' }, o: { type: 'object' }, n: { type: 'number' } } })
      expect(html).toBe('<div id="shopify-section-template--x__main" class="shopify-section">' +
        '<div id="shopify-block-l" class="shopify-block">.</div><p id="shopify-block-o" class="shopify-block">.</p><div id="shopify-block-n" class="shopify-block">.</div></div>')
      expect(report.unsupported).toEqual([
        { feature: 'schema', detail: 'sections/sec.liquid: schema "class" is not a string; it is ignored' },
        { feature: 'schema', detail: 'blocks/list.liquid: schema "class" is not a string; it is ignored' },
        { feature: 'schema', detail: 'blocks/object.liquid: schema "class" is not a string; it is ignored' },
        { feature: 'schema', detail: 'blocks/number.liquid: schema "class" is not a string; it is ignored' }
      ])
    })
    it('treats a block whose schema is not valid JSON as one with no schema, and reports it', async () => {
      const { html, report } = await page({ 'sections/sec.liquid': "{% content_for 'blocks' %}", 'blocks/odd.liquid': 'o{% schema %}{ nope }{% endschema %}' }, { blocks: { k: { type: 'odd' } } })
      expect(html).toBe(SECTION(WRAP('k', 'o')))
      expect(report.unsupported).toEqual([expect.objectContaining({ feature: 'schema', detail: expect.stringContaining('blocks/odd.liquid') })])
    })
  })

  describe('content_for block', () => {
    const files = {
      'sections/sec.liquid': "{% for n in (1..3) %}{% content_for 'block', type: 'cell', id: n, color: n %}{% endfor %}",
      'blocks/cell.liquid': '{{ block.id }}={{ block.settings.width }}/{{ color }};{% schema %}{ "tag": null, "settings": [{ "type": "number", "id": "width", "default": 1 }] }{% endschema %}'
    }
    it('finds saved settings by id, in a for loop, and uses the defaults for the rest', async () => {
      const { html } = await page(files, { blocks: { 2: { type: 'cell', static: true, settings: { width: 20 } } } })
      expect(html).toBe(SECTION('1=1/1;2=20/2;3=1/3;'))
    })
    it('takes an id of 0, as a for loop gives it, and only nil or an empty id as missing', async () => {
      const cell = { 'blocks/cell.liquid': '{{ block.id }}={{ block.settings.width }};{% schema %}{ "tag": null, "settings": [{ "type": "number", "id": "width", "default": 1 }] }{% endschema %}' }
      const saved = { blocks: { 0: { type: 'cell', static: true, settings: { width: 7 } } } }
      const byRange = await page({ 'sections/sec.liquid': "{% for n in (0..1) %}{% content_for 'block', type: 'cell', id: n %}{% endfor %}", ...cell }, saved)
      expect(byRange.html).toBe(SECTION('0=7;1=1;'))
      const byIndex = await page({ 'sections/sec.liquid': "{% for n in (5..6) %}{% content_for 'block', type: 'cell', id: forloop.index0 %}{% endfor %}", ...cell }, saved)
      expect(byIndex.html).toBe(SECTION('0=7;1=1;'))
      const missing = await page({ 'sections/sec.liquid': "[{% content_for 'block', type: 'cell', id: nope %}][{% content_for 'block', type: 'cell', id: '' %}][{% content_for 'block', type: nope, id: 'a' %}][{% content_for 'block', type: 0, id: 'a' %}]", ...cell })
      const error = "Liquid error (sections/sec line 1): content_for 'block' needs type and id"
      expect(missing.html).toBe(SECTION(`[${error}][${error}][${error}][]`))
      expect(missing.report.missing).toEqual([{ kind: 'block', name: '0' }])
    })
    it('keeps a saved block that is not static out of the static block of the same id', async () => {
      const files = {
        'sections/sec.liquid': "{% content_for 'blocks' %}|{% content_for 'block', type: 'cell', id: 'a' %}",
        'blocks/text.liquid': 'text:{{ block.settings.text }}',
        'blocks/cell.liquid': '{{ block.settings.width }}/{% content_for "blocks" %}{% schema %}{ "tag": null, "settings": [{ "type": "number", "id": "width", "default": 1 }] }{% endschema %}'
      }
      const { html, report } = await page(files, { blocks: { a: { type: 'text', settings: { text: 'mine', width: 77 }, blocks: { in: { type: 'text' } } } } })
      expect(html).toBe(SECTION(WRAP('a', 'text:mine') + '|1/'))
      expect(report.unsupported).toEqual([{ feature: 'static_block', detail: 'sec: block a is not static, so its saved entry is not used by the static block of that id' }])
    })
    it('passes extra parameters only to the block it renders', async () => {
      const { html } = await page({
        'sections/sec.liquid': "{% content_for 'block', type: 'cell', id: 'a', color: 'red', width: 3 %}{% content_for 'block', type: 'cell', id: 'b' %}[{{ color }}]",
        'blocks/cell.liquid': '{{ color }}{{ width }};{% schema %}{ "tag": null }{% endschema %}'
      })
      expect(html).toBe(SECTION('red3;;[]'))
    })
    it('renders a static block conditionally', async () => {
      const { html } = await page({
        'sections/sec.liquid': "{% if section.settings.show %}{% content_for 'block', type: 'cell', id: 'a' %}{% endif %}{% unless section.settings.show %}no{% endunless %}",
        'blocks/cell.liquid': 'cell{% schema %}{ "tag": null }{% endschema %}'
      })
      expect(html).toBe(SECTION('no'))
    })
    it('renders a saved static block of another type under the tag type and skips a disabled one', async () => {
      const { html } = await page({
        'sections/sec.liquid': "{% content_for 'block', type: 'cell', id: 'a' %}|{% content_for 'block', type: 'cell', id: 'off' %}",
        'blocks/cell.liquid': '{{ block.type }}:{{ block.settings.width }}{% schema %}{ "tag": null, "settings": [{ "type": "number", "id": "width", "default": 1 }] }{% endschema %}'
      }, { blocks: { a: { type: 'other', static: true, settings: { width: 9 } }, off: { type: 'cell', static: true, disabled: true } } })
      expect(html).toBe(SECTION('cell:9|'))
    })
    it('renders in a block with its own saved blocks and in a block that has none', async () => {
      const { html } = await page({
        'sections/sec.liquid': "{% content_for 'blocks' %}",
        'blocks/host.liquid': "{% content_for 'block', type: 'cell', id: 'inner' %}",
        'blocks/cell.liquid': '{{ block.settings.width }}{% schema %}{ "tag": null, "settings": [{ "type": "number", "id": "width", "default": 1 }] }{% endschema %}'
      }, { blocks: { h1: { type: 'host', blocks: { inner: { type: 'cell', static: true, settings: { width: 5 } } } }, h2: { type: 'host' } }, block_order: ['h1', 'h2'] })
      expect(html).toBe(SECTION(WRAP('h1', '5') + WRAP('h2', '1')))
    })
    it('reports a missing block file and a missing type or id', async () => {
      const { html, report } = await page({
        'sections/sec.liquid': "[{% content_for 'block', type: 'ghost', id: 'g' %}][{% content_for 'block', id: 'g' %}][{% content_for 'block', type: 'cell' %}]",
        'blocks/cell.liquid': 'x'
      })
      expect(html).toBe(SECTION("[][Liquid error (sections/sec line 1): content_for 'block' needs type and id][Liquid error (sections/sec line 1): content_for 'block' needs type and id]"))
      expect(report.missing).toEqual([{ kind: 'block', name: 'ghost' }])
      expect(report.sections[0].status).toBe('failed')
    })
    it('does not parse content_for without an argument', async () => {
      const { html } = await page({ 'sections/sec.liquid': '{% content_for %}' })
      expect(html).toBe(SECTION('Liquid syntax error (sections/sec line 1): content_for needs &#39;blocks&#39; or &#39;block&#39;'))
    })
  })

  describe('errors', () => {
    it('prints a block that does not parse inside the default wrapper and fails its section', async () => {
      const { html, report } = await page({ 'sections/sec.liquid': "{% content_for 'blocks' %}<hr>", 'blocks/broken.liquid': '{% if %}' }, { blocks: { k: { type: 'broken' } } })
      expect(html).toBe(SECTION(WRAP('k', 'Liquid syntax error (blocks/broken line 1): invalid value expression: &quot;&quot;') + '<hr>'))
      expect(report.sections).toEqual([expect.objectContaining({ status: 'failed' })])
      expect(report.errors).toHaveLength(1)
    })
    it('prints an error raised while a block renders inside that block and fails its section', async () => {
      const { html, report } = await page({ 'sections/sec.liquid': "{% content_for 'blocks' %}<hr>", 'blocks/div0.liquid': 'a{{ 1 | divided_by: 0 }}b' }, { blocks: { k: { type: 'div0' } } })
      expect(html).toBe(SECTION(WRAP('k', 'aLiquid error (blocks/div0 line 1): divided by 0b') + '<hr>'))
      expect(report.sections).toEqual([expect.objectContaining({ status: 'failed' })])
    })
    it('stops a block that renders itself and prints the error where the tag stands', async () => {
      const files = { 'sections/sec.liquid': "{% content_for 'block', type: 'loop', id: 'x' %}", 'blocks/loop.liquid': "{% content_for 'block', type: 'loop', id: 'x' %}" }
      const { html, report } = await page(files)
      expect(html.match(/id="shopify-block-x"/g)).toHaveLength(99)
      expect(html).toContain('Liquid error (blocks/loop line 1): Nesting too deep')
      expect(report.errors).toHaveLength(1)
      expect(report.sections[0]).toMatchObject({ status: 'failed' })
    })
    it('stops blocks that nest each other through content_for blocks', async () => {
      const files = { 'sections/sec.liquid': "{% content_for 'blocks' %}", 'blocks/deep.liquid': "{% content_for 'blocks' %}" }
      const nested: Record<string, unknown> = { type: 'deep' }
      let level = nested
      for (let i = 0; i < 120; i++) {
        const child: Record<string, unknown> = { type: 'deep' }
        level.blocks = { c: child }
        level = child
      }
      const { html, report } = await page(files, { blocks: { top: nested } })
      expect(html.match(/id="shopify-block-(top|c)"/g)).toHaveLength(99)
      expect(html).toContain('Liquid error (blocks/deep line 1): Nesting too deep')
      expect(report.errors).toHaveLength(1)
    })
    it('rejects the page when a block runs past the render limit, as a section does', async () => {
      const files = { 'sections/sec.liquid': "{% content_for 'blocks' %}", 'blocks/slow.liquid': '{% for i in (1..100) %}{% for j in (1..100000) %}{% endfor %}{% endfor %}' }
      await expect(page(files, { blocks: { k: { type: 'slow' } } }, { renderLimit: 50 })).rejects.toThrow(/render limit exceeded/)
    })
  })

  it('renders the blocks of one section alone', async () => {
    const { html, report } = await renderSection({ theme, templateName: 'page.slides', section: 'promo' })
    expect(html).toBe('<div id="shopify-section-template--page-slides__promo" class="shopify-section"><aside><span class="badge" style="color: blue">New|promo-badge|template--page-slides__promo</span></aside></div>')
    expect(report.errors).toEqual([])
  })
})
