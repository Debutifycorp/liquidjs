import { join } from 'path'
import { renderPage, renderSection } from './bare-block-ids'
import { legacySampleData } from '../legacy-sample'
import { loadTheme } from './load-fixture'

const theme = loadTheme(join(__dirname, '../fixtures/theme'))

const BAD_SECTION = (schema: string) => `<p>bad</p>{% schema %}${schema}{% endschema %}`

/** A page with the section `bad` first and the footer second, so the footer shows what a bad section leaves alone. */
async function pageWith (files: Record<string, string>, section: Record<string, unknown> = { type: 'bad' }) {
  const all = {
    ...theme.files,
    ...files,
    'templates/t.json': JSON.stringify({ sections: { b: section, f: { type: 'footer' } }, order: ['b', 'f'] })
  }
  return renderPage({ data: legacySampleData, theme: { files: all }, templateName: 't' })
}

describe('shopify/theme/runtime malformed section schema and data', () => {
  const FOOTER = '<div id="shopify-section-template--t__f" class="shopify-section"><footer>Default copyright|template--t__f|2|template</footer>'
  const cases: Array<[string, Record<string, string>, Record<string, unknown>, string]> = [
    ['a schema whose settings is an object', { 'sections/bad.liquid': BAD_SECTION('{ "settings": {} }') }, { type: 'bad' }, 'sections/bad.liquid: schema "settings" must be an array of objects'],
    ['a schema whose settings holds a non-object', { 'sections/bad.liquid': BAD_SECTION('{ "settings": [null] }') }, { type: 'bad' }, 'sections/bad.liquid: schema "settings" must be an array of objects'],
    ['a schema whose blocks is an object', { 'sections/bad.liquid': BAD_SECTION('{ "blocks": {} }') }, { type: 'bad' }, 'sections/bad.liquid: schema "blocks" must be an array of objects'],
    ['a schema whose locales is an array', { 'sections/bad.liquid': BAD_SECTION('{ "locales": [] }') }, { type: 'bad' }, 'sections/bad.liquid: schema "locales" must be an object'],
    ['a schema whose default has blocks that are not an array', { 'sections/bad.liquid': BAD_SECTION('{ "default": { "blocks": {} } }') }, { type: 'bad' }, 'sections/bad.liquid: schema "default" "blocks" must be an array'],
    ['data whose block_order is an object', { 'sections/bad.liquid': BAD_SECTION('{}') }, { type: 'bad', block_order: {} }, 'section template--t__b: "block_order" must be an array'],
    ['data whose settings is a string', { 'sections/bad.liquid': BAD_SECTION('{}') }, { type: 'bad', settings: 'x' }, 'section template--t__b: "settings" must be an object'],
    ['data whose blocks is an array', { 'sections/bad.liquid': BAD_SECTION('{}') }, { type: 'bad', blocks: [] }, 'section template--t__b: "blocks" must be an object']
  ]
  for (const [label, files, section, reason] of cases) {
    it(`keeps ${label} inside its section`, async () => {
      const { html, report } = await pageWith(files, section)
      expect(html).toContain(`<div id="shopify-section-template--t__b" class="shopify-section">Liquid error: ${reason.replace(/"/g, '&quot;')}</div>${FOOTER}`)
      expect(html).toContain('</html>')
      expect(report.sections.slice(0, 2)).toMatchObject([{ id: 'template--t__b', status: 'failed', reason: `Liquid error: ${reason}` }, { id: 'template--t__f', status: 'rendered' }])
      expect(report.sections.filter(entry => entry.status === 'failed')).toHaveLength(1)
    })
  }
  it('keeps a bad section of a section group inside it and leaves the others', async () => {
    const group = { type: 'header', sections: { one: { type: 'bad' }, two: { type: 'footer' } }, order: ['one', 'two'] }
    const files = { ...theme.files, 'sections/bad.liquid': BAD_SECTION('{ "blocks": {} }'), 'sections/header-group.json': JSON.stringify(group) }
    const { html, report } = await renderPage({ data: legacySampleData, theme: { files }, templateName: 'gift_card' })
    expect(html).toBe('<p>Gift card for Sample Store</p>\n')
    const page = await renderPage({ data: legacySampleData, theme: { files }, templateName: 'index' })
    expect(page.html).toContain('<!-- BEGIN sections: header-group --><div id="shopify-section-sections--header-group__one" class="shopify-section shopify-section-group-header-group">Liquid error: sections/bad.liquid: schema &quot;blocks&quot; must be an array of objects</div><div id="shopify-section-sections--header-group__two"')
    expect(page.report.sections.filter(entry => entry.id.startsWith('sections--')).map(entry => `${entry.id}:${entry.status}`)).toEqual(['sections--header-group__one:failed', 'sections--header-group__two:rendered'])
    expect(report.sections).toEqual([])
  })
  it('keeps a bad static section inside it and records it', async () => {
    const files = { ...theme.files, 'sections/footer.liquid': BAD_SECTION('{ "settings": {} }') }
    const { html, report } = await renderPage({ data: legacySampleData, theme: { files }, templateName: 'index' })
    expect(html).toContain('<div id="shopify-section-footer" class="shopify-section">Liquid error: sections/footer.liquid: schema &quot;settings&quot; must be an array of objects</div>')
    expect(report.sections.map(entry => `${entry.id}:${entry.status}`)).toEqual([
      'template--index__hero:rendered',
      'template--index__featured:rendered',
      'template--index__gone:missing',
      'sections--header-group__announcement:rendered',
      'sections--header-group__header:rendered',
      'footer:failed'
    ])
  })
  it('keeps a block with a bad schema inside its own wrapper and leaves its siblings', async () => {
    const files = {
      ...theme.files,
      'blocks/bad.liquid': BAD_SECTION('{ "settings": {} }'),
      'blocks/ok.liquid': 'ok:{{ block.id }}',
      'sections/holder.liquid': "{% content_for 'blocks' %}<hr>"
    }
    const section = { type: 'holder', blocks: { a: { type: 'ok' }, k: { type: 'bad' }, c: { type: 'ok' } }, block_order: ['a', 'k', 'c'] }
    const { html, report } = await pageWith(files, section)
    expect(html).toContain('<div id="shopify-section-template--t__b" class="shopify-section">' +
      '<div id="shopify-block-a" class="shopify-block">ok:a</div>' +
      '<div id="shopify-block-k" class="shopify-block">Liquid error: blocks/bad.liquid: schema &quot;settings&quot; must be an array of objects</div>' +
      '<div id="shopify-block-c" class="shopify-block">ok:c</div><hr></div>' + FOOTER)
    expect(report.sections.slice(0, 2)).toMatchObject([{ status: 'failed', reason: 'Liquid error: blocks/bad.liquid: schema "settings" must be an array of objects' }, { status: 'rendered' }])
    expect(report.errors).toEqual([])
  })
  it('keeps a block whose saved JSON is malformed inside its own wrapper, nested blocks included', async () => {
    const files = {
      ...theme.files,
      'blocks/ok.liquid': "ok:{{ block.id }}{% content_for 'blocks' %}",
      'sections/holder.liquid': "{% content_for 'blocks' %}<hr>"
    }
    const section = { type: 'holder', blocks: { a: { type: 'ok' }, k: { type: 'ok', block_order: 5 }, s: { type: 'ok', settings: 5 }, n: { type: 'ok', blocks: { x: 'y' } }, z: { type: 'ok' } }, block_order: ['a', 'k', 's', 'n', 'z'] }
    const { html, report } = await pageWith(files, section)
    expect(html).toContain('<div id="shopify-block-a" class="shopify-block">ok:a</div>' +
      '<div id="shopify-block-k" class="shopify-block">Liquid error: block k: &quot;block_order&quot; must be an array</div>' +
      '<div id="shopify-block-s" class="shopify-block">Liquid error: block s: &quot;settings&quot; must be an object</div>' +
      '<div id="shopify-block-n" class="shopify-block">ok:n<div id="shopify-block-x" class="shopify-block">Liquid error: block x must be an object</div></div>' +
      '<div id="shopify-block-z" class="shopify-block">ok:z</div><hr></div>' + FOOTER)
    expect(report.sections.slice(0, 2)).toMatchObject([{ status: 'failed', reason: 'Liquid error: block k: "block_order" must be an array' }, { status: 'rendered' }])
    expect(report.errors).toEqual([])
  })
  it('leaves a malformed block out of section.blocks and reports it, without failing its section', async () => {
    const files = { 'sections/bad.liquid': '{% for block in section.blocks %}[{{ block.id }}:{{ block.settings.t }}]{% endfor %}{% schema %}{ "blocks": [{ "type": "x", "settings": [{ "type": "text", "id": "t", "default": "d" }] }] }{% endschema %}' }
    const section = { type: 'bad', blocks: { a: 'x', b: { type: 'x', settings: 3 }, c: { type: 'x', settings: { t: 'saved' } } }, block_order: ['a', 'b', 'c'] }
    const { html, report } = await pageWith(files, section)
    expect(html).toContain('<div id="shopify-section-template--t__b" class="shopify-section">[b:d][c:saved]</div>' + FOOTER)
    expect(report.sections.slice(0, 2)).toMatchObject([{ status: 'rendered' }, { status: 'rendered' }])
    expect(report.unsupported).toEqual([
      { feature: 'blocks', detail: 'section template--t__b: block a is not an object' },
      { feature: 'blocks', detail: 'section template--t__b: block b "settings" is not an object' }
    ])
  })
  it('does not take a block_order entry that names an Object.prototype member for a block', async () => {
    const files = { ...theme.files, 'blocks/ok.liquid': 'ok:{{ block.id }}', 'sections/holder.liquid': "{% content_for 'blocks' %}<hr>" }
    const { html, report } = await pageWith(files, { type: 'holder', blocks: { a: { type: 'ok' } }, block_order: ['a', 'constructor', '__proto__', 'toString', 'hasOwnProperty'] })
    expect(html).toContain('<div id="shopify-section-template--t__b" class="shopify-section"><div id="shopify-block-a" class="shopify-block">ok:a</div><hr></div>' + FOOTER)
    expect(report.missing).toEqual([])
    expect(report.sections.slice(0, 2)).toMatchObject([{ status: 'rendered' }, { status: 'rendered' }])
  })
})

describe('shopify/theme/runtime malformed template and group JSON', () => {
  it('reads a template whose order is not an array in the order of its sections', async () => {
    const files = { ...theme.files, 'templates/t.json': '{ "sections": { "f": { "type": "footer" } }, "order": {} }' }
    const { html, report } = await renderPage({ data: legacySampleData, theme: { files }, templateName: 't' })
    expect(html).toContain('<main id="MainContent"><div id="shopify-section-template--t__f"')
    expect(report.unsupported).toEqual([{ feature: 'order', detail: 'templates/t.json "order" is not an array' }])
  })
  it('renders nothing for a template whose sections is not an object, and says so', async () => {
    const files = { ...theme.files, 'templates/t.json': '{ "sections": [], "order": ["f"] }' }
    const { html, report } = await renderPage({ data: legacySampleData, theme: { files }, templateName: 't' })
    expect(html).toContain('<main id="MainContent"></main>')
    expect(report.unsupported).toEqual([{ feature: 'sections', detail: 'templates/t.json "sections" is not an object' }])
  })
  it('ignores a wrapper that is not a string', async () => {
    const files = { ...theme.files, 'templates/t.json': '{ "wrapper": 3, "sections": { "f": { "type": "footer" } }, "order": ["f"] }' }
    const { html, report } = await renderPage({ data: legacySampleData, theme: { files }, templateName: 't' })
    expect(html).toContain('<main id="MainContent"><div id="shopify-section-template--t__f"')
    expect(report.unsupported).toEqual([{ feature: 'wrapper', detail: '3' }])
  })
  it('reads a group whose order is not an array in the order of its sections', async () => {
    const group = { type: 'header', sections: { a: { type: 'footer' } }, order: 'a' }
    const files = { ...theme.files, 'sections/header-group.json': JSON.stringify(group) }
    const { html, report } = await renderPage({ data: legacySampleData, theme: { files }, templateName: 'index' })
    expect(html).toContain('<!-- BEGIN sections: header-group --><div id="shopify-section-sections--header-group__a"')
    expect(report.unsupported).toEqual([{ feature: 'order', detail: 'sections/header-group.json "order" is not an array' }])
  })
  it('skips a group that is not an object and reports it', async () => {
    const files = { ...theme.files, 'sections/header-group.json': '[]' }
    const { html, report } = await renderPage({ data: legacySampleData, theme: { files }, templateName: 'index' })
    expect(html).not.toContain('BEGIN sections')
    expect(report.unsupported).toEqual([{ feature: 'section_group', detail: 'sections/header-group.json is not a JSON object' }])
    expect(report.missing).toEqual([{ kind: 'section', name: 'does-not-exist' }])
  })
  it('affects a contextual group file only when a context is requested, and skips a bad one', async () => {
    const files = { ...theme.files, 'sections/header-group.context.ca.json': '{ nope', 'sections/header-group.context.yy.json': 'null', 'sections/header-group.context.zz.json': '{ "context": { "market": "ca" }, "sections": { "announcement": { "settings": { "text": "From zz" } } } }' }
    const plain = await renderPage({ data: legacySampleData, theme: { files }, templateName: 'index' })
    expect(plain.html).toContain('<p class="announcement">Free shipping|header|1</p>')
    expect(plain.report.unsupported).toEqual([])
    const ca = await renderPage({ data: legacySampleData, theme: { files }, templateName: 'index', request: { context: { market: 'ca' } } })
    expect(ca.html).toContain('<p class="announcement">From zz|header|1</p>')
    expect(ca.report.unsupported).toEqual([
      { feature: 'section_group', detail: expect.stringMatching(/^sections\/header-group\.context\.ca\.json: /) },
      { feature: 'section_group', detail: 'sections/header-group.context.yy.json is not a JSON object' }
    ])
    const us = await renderPage({ data: legacySampleData, theme: { files }, templateName: 'index', request: { context: { market: 'us' } } })
    expect(us.html).toContain('<p class="announcement">Free shipping|header|1</p>')
  })
  it('rejects for a template, settings_data.json or settings_schema.json that is not usable', async () => {
    await expect(renderPage({ data: legacySampleData, theme: { files: { ...theme.files, 'templates/index.json': '{ nope' } }, templateName: 'index' })).rejects.toThrow(/^templates\/index\.json: /)
    await expect(renderPage({ data: legacySampleData, theme: { files: { ...theme.files, 'templates/index.json': '[]' } }, templateName: 'index' })).rejects.toThrow('templates/index.json: must be a JSON object')
    await expect(renderPage({ theme: { files: { ...theme.files, 'config/settings_data.json': '[]' } }, templateName: 'index' })).rejects.toThrow('config/settings_data.json: must be a JSON object')
    await expect(renderPage({ data: legacySampleData, theme: { files: { ...theme.files, 'config/settings_schema.json': '{}' } }, templateName: 'index' })).rejects.toThrow('config/settings_schema.json: must be a JSON array')
  })
  it('reports a group whose JSON is not valid, for renderSection too, without rejecting', async () => {
    const files = { ...theme.files, 'sections/header-group.json': '{ nope' }
    const page = await renderPage({ data: legacySampleData, theme: { files }, templateName: 'index' })
    expect(page.html).toContain('Liquid error (layout/theme line 9): sections/header-group.json: ')
    expect(page.report.errors[0].message).toContain('sections/header-group.json: ')
    const one = await renderSection({ data: legacySampleData, theme: { files }, templateName: 'index', section: 'sections--header-group__header' })
    expect(one.html).toMatch(/^Liquid error: sections\/header-group\.json: /)
    expect(one.report.unsupported).toEqual([{ feature: 'section_group', detail: expect.stringMatching(/^sections\/header-group\.json: /) }])
    expect(one.report.missing).toEqual([])
  })
  it('finds a group section through another split when the first group file is not valid', async () => {
    const files = {
      ...theme.files,
      'sections/hg.json': '{ nope',
      'sections/hg__top.json': '{ "type": "header", "sections": { "bar": { "type": "footer" } }, "order": ["bar"] }'
    }
    const one = await renderSection({ data: legacySampleData, theme: { files }, templateName: 'index', section: 'sections--hg__top__bar' })
    expect(one.html).toBe('<div id="shopify-section-sections--hg__top__bar" class="shopify-section shopify-section-group-hg__top"><footer>Default copyright|sections--hg__top__bar|1|header</footer>\n\n</div>')
    expect(one.report.unsupported).toEqual([])
  })
  it('skips a contextual file whose sections or order has the wrong type and names it', async () => {
    const files = {
      ...theme.files,
      'sections/header-group.context.ca.json': '{ "context": { "market": "ca" }, "sections": "x" }',
      'sections/header-group.context.cb.json': '{ "context": { "market": "ca" }, "order": 5, "sections": { "announcement": { "settings": { "text": "From cb" } } } }',
      'sections/header-group.context.cc.json': '{ "context": { "market": "ca" }, "sections": null }',
      'sections/header-group.context.cd.json': '{ "context": { "market": "ca" }, "sections": { "announcement": { "settings": { "text": "From cd" } } } }'
    }
    const { html, report } = await renderPage({ data: legacySampleData, theme: { files }, templateName: 'index', request: { context: { market: 'ca' } } })
    expect(html).toContain('<p class="announcement">From cd|header|1</p>')
    expect(html).toContain('<header-wrapper id="shopify-section-sections--header-group__header"')
    expect(report.unsupported).toEqual([
      { feature: 'section_group', detail: 'sections/header-group.context.ca.json "sections" is not an object' },
      { feature: 'section_group', detail: 'sections/header-group.context.cb.json "order" is not an array' },
      { feature: 'section_group', detail: 'sections/header-group.context.cc.json "sections" is not an object' }
    ])
    const only = { ...theme.files, 'sections/header-group.context.ca.json': '{ "context": { "market": "ca" }, "sections": "x" }' }
    const base = await renderPage({ data: legacySampleData, theme: { files: only }, templateName: 'index', request: { context: { market: 'ca' } } })
    expect(base.html).toContain('<p class="announcement">Free shipping|header|1</p>')
    expect(base.html).toContain('<header-wrapper id="shopify-section-sections--header-group__header"')
  })
})

describe('shopify/theme/runtime malformed locale files', () => {
  it('affects only the renders that look in the file', async () => {
    const files = { ...theme.files, 'locales/de.json': '{ nope', 'locales/fr.schema.json': '{ nope' }
    const english = await renderPage({ data: legacySampleData, theme: { files }, templateName: 'index' })
    expect(english.report.unsupported).toEqual([])
    expect(english.html).toContain('<p>Hello, Sample Store!</p>')
    const german = await renderPage({ data: legacySampleData, theme: { files }, templateName: 'index', locale: 'de' })
    expect(german.html).toContain('<html lang="de">')
    expect(german.html).toContain('<p>Hello, Sample Store!</p>')
    expect(german.report.unsupported).toEqual([{ feature: 'locale_file', detail: expect.stringMatching(/^locales\/de\.json: /) }])
    const gift = await renderPage({ data: legacySampleData, theme: { files }, templateName: 'gift_card', locale: 'fr' })
    expect(gift.report.unsupported).toEqual([])
    const french = await renderPage({ data: legacySampleData, theme: { files }, templateName: 'index', locale: 'fr' })
    expect(french.html).toContain('<p>Bonjour, Sample Store !</p><p>Fait avec soin</p><p>Schema subheading</p>')
    expect(french.report.unsupported).toEqual([{ feature: 'locale_file', detail: expect.stringMatching(/^locales\/fr\.schema\.json: /) }])
  })
})

describe('shopify/theme/runtime limits and recursion', () => {
  it('rejects for a block file past the parse limit that only the section data lists', async () => {
    const files = { ...theme.files, 'blocks/big.liquid': ' '.repeat(10000001), 'sections/holder.liquid': '<i>no content_for</i>' }
    await expect(pageWith(files, { type: 'holder', blocks: { k: { type: 'big' } } })).rejects.toThrow('parse length limit exceeded')
  })
  it('rejects for a section file past the parse limit instead of printing it in the section', async () => {
    const files = { ...theme.files, 'sections/huge.liquid': ' '.repeat(10000001), 'templates/t.json': '{ "sections": { "h": { "type": "huge" }, "f": { "type": "footer" } }, "order": ["h", "f"] }' }
    await expect(renderPage({ data: legacySampleData, theme: { files }, templateName: 't' })).rejects.toThrow('parse length limit exceeded')
  })
  it('stops a section that renders itself and prints the error where the tag stands', async () => {
    const files = { ...theme.files, 'sections/loop.liquid': '<i>{% section "loop" %}</i>', 'templates/t.json': '{ "sections": { "a": { "type": "loop" } }, "order": ["a"] }' }
    const { html, report } = await renderPage({ data: legacySampleData, theme: { files }, templateName: 't' })
    expect(html.match(/id="shopify-section-loop"/g)).toHaveLength(99)
    expect(html).toContain('<i>Liquid error (sections/loop line 1): Nesting too deep</i>')
    expect(report.errors).toHaveLength(1)
    expect(report.sections[report.sections.length - 1]).toMatchObject({ id: 'footer', status: 'rendered' })
  })
  it('stops a section group that renders itself', async () => {
    const files = {
      ...theme.files,
      'sections/again.json': '{ "type": "header", "sections": { "a": { "type": "again-section" } }, "order": ["a"] }',
      'sections/again-section.liquid': '{% sections "again" %}',
      'layout/bare.liquid': '{% sections "again" %}',
      'templates/t.json': '{ "layout": "bare", "sections": {}, "order": [] }'
    }
    const { html, report } = await renderPage({ data: legacySampleData, theme: { files }, templateName: 't' })
    expect(html).toContain('Liquid error (sections/again-section line 1): Nesting too deep')
    expect(report.errors).toHaveLength(1)
  })
})
