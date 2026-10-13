import { join } from 'path'
import { createShopifyLiquid, renderLiquid, renderPage, renderSection } from '../../../src/shopify'
import { loadTheme } from './load-fixture'

const theme = loadTheme(join(__dirname, '../fixtures/theme'))

describe('shopify/theme/blocks', () => {
  it('renders theme blocks, nested static blocks and section static blocks', async () => {
    const { html, report } = await renderPage({ theme, templateName: 'page.slides' })
    expect(html).toBe(
      '<div id="shopify-section-template--page-slides__slides" class="shopify-section"><div class="slides">' +
      '<div id="shopify-block-s1" class="shopify-block slide"><h3>First</h3><span class="badge" style="color: red">Sale|badge|template--page-slides__slides</span></div>' +
      '<div id="shopify-block-s3" class="shopify-block slide"><h3>Untitled</h3><span class="badge" style="color: red">New|badge|template--page-slides__slides</span></div>' +
      '</div>4|Untitled</div>' +
      '<div id="shopify-section-template--page-slides__promo" class="shopify-section"><aside><span class="badge" style="color: blue">New|promo-badge|template--page-slides__promo</span></aside></div>'
    )
    expect(report.missing).toEqual([{ kind: 'block', name: 'no-such-block' }])
    expect(report.unsupported).toEqual([{ feature: 'app block', detail: 'slideshow: @app' }])
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
  const page = (files: Record<string, string>, data: object = {}, options: { renderLimit?: number } = {}) =>
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
        { feature: 'app block', detail: 'sec: @app' },
        { feature: 'app block', detail: 'sec: shopify://apps/reviews/blocks/stars/0b1b2c3d-1111-2222-3333-444455556666' }
      ])
      expect(report.missing).toEqual([{ kind: 'block', name: '(no type)' }])
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
      })
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
    it('rejects the page when a block runs past the render limit, as a section does', async () => {
      const files = { 'sections/sec.liquid': "{% content_for 'block', type: 'loop', id: 'x' %}", 'blocks/loop.liquid': "{% content_for 'block', type: 'loop', id: 'x' %}" }
      await expect(page(files, {}, { renderLimit: 100 })).rejects.toThrow(/render limit exceeded/)
    })
  })

  it('renders the blocks of one section alone', async () => {
    const { html, report } = await renderSection({ theme, templateName: 'page.slides', section: 'promo' })
    expect(html).toBe('<div id="shopify-section-template--page-slides__promo" class="shopify-section"><aside><span class="badge" style="color: blue">New|promo-badge|template--page-slides__promo</span></aside></div>')
    expect(report.errors).toEqual([])
  })
})
