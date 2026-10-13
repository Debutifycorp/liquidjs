import { join } from 'path'
import { renderPage, renderSection } from '../../../src/shopify'
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
  return renderPage({ theme: { files: all }, templateName: 't' })
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
    ['data whose blocks is an array', { 'sections/bad.liquid': BAD_SECTION('{}') }, { type: 'bad', blocks: [] }, 'section template--t__b: "blocks" must be an object'],
    ['data with a block that is not an object', { 'sections/bad.liquid': BAD_SECTION('{}') }, { type: 'bad', blocks: { a: 'x' } }, 'section template--t__b: block a must be an object'],
    ['data with a block whose settings is a number', { 'sections/bad.liquid': BAD_SECTION('{}') }, { type: 'bad', blocks: { a: { type: 'x', settings: 3 } } }, 'section template--t__b: block a "settings" must be an object']
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
    const { html, report } = await renderPage({ theme: { files }, templateName: 'gift_card' })
    expect(html).toBe('<p>Gift card for Sample Store</p>\n')
    const page = await renderPage({ theme: { files }, templateName: 'index' })
    expect(page.html).toContain('<!-- BEGIN sections: header-group --><div id="shopify-section-sections--header-group__one" class="shopify-section shopify-section-group-header-group">Liquid error: sections/bad.liquid: schema &quot;blocks&quot; must be an array of objects</div><div id="shopify-section-sections--header-group__two"')
    expect(page.report.sections.filter(entry => entry.id.startsWith('sections--')).map(entry => `${entry.id}:${entry.status}`)).toEqual(['sections--header-group__one:failed', 'sections--header-group__two:rendered'])
    expect(report.sections).toEqual([])
  })
  it('keeps a bad static section inside it and records it', async () => {
    const files = { ...theme.files, 'sections/footer.liquid': BAD_SECTION('{ "settings": {} }') }
    const { html, report } = await renderPage({ theme: { files }, templateName: 'index' })
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
  it('keeps a block with a bad schema inside the section that holds it', async () => {
    const files = { ...theme.files, 'blocks/bad.liquid': BAD_SECTION('{ "settings": {} }'), 'sections/holder.liquid': "{% content_for 'blocks' %}<hr>" }
    const { html, report } = await pageWith(files, { type: 'holder', blocks: { k: { type: 'bad' } } })
    expect(html).toContain('<hr></div>' + FOOTER)
    expect(html).toContain('blocks/bad.liquid: schema "settings" must be an array of objects<hr>')
    expect(report.sections.slice(0, 2)).toMatchObject([{ status: 'failed' }, { status: 'rendered' }])
  })
})

describe('shopify/theme/runtime malformed template and group JSON', () => {
  it('reads a template whose order is not an array in the order of its sections', async () => {
    const files = { ...theme.files, 'templates/t.json': '{ "sections": { "f": { "type": "footer" } }, "order": {} }' }
    const { html, report } = await renderPage({ theme: { files }, templateName: 't' })
    expect(html).toContain('<main id="MainContent"><div id="shopify-section-template--t__f"')
    expect(report.unsupported).toEqual([{ feature: 'order', detail: 'templates/t.json "order" is not an array' }])
  })
  it('renders nothing for a template whose sections is not an object, and says so', async () => {
    const files = { ...theme.files, 'templates/t.json': '{ "sections": [], "order": ["f"] }' }
    const { html, report } = await renderPage({ theme: { files }, templateName: 't' })
    expect(html).toContain('<main id="MainContent"></main>')
    expect(report.unsupported).toEqual([{ feature: 'sections', detail: 'templates/t.json "sections" is not an object' }])
  })
  it('ignores a wrapper that is not a string', async () => {
    const files = { ...theme.files, 'templates/t.json': '{ "wrapper": 3, "sections": { "f": { "type": "footer" } }, "order": ["f"] }' }
    const { html, report } = await renderPage({ theme: { files }, templateName: 't' })
    expect(html).toContain('<main id="MainContent"><div id="shopify-section-template--t__f"')
    expect(report.unsupported).toEqual([{ feature: 'wrapper', detail: '3' }])
  })
  it('reads a group whose order is not an array in the order of its sections', async () => {
    const group = { type: 'header', sections: { a: { type: 'footer' } }, order: 'a' }
    const files = { ...theme.files, 'sections/header-group.json': JSON.stringify(group) }
    const { html, report } = await renderPage({ theme: { files }, templateName: 'index' })
    expect(html).toContain('<!-- BEGIN sections: header-group --><div id="shopify-section-sections--header-group__a"')
    expect(report.unsupported).toEqual([{ feature: 'order', detail: 'sections/header-group.json "order" is not an array' }])
  })
  it('skips a group that is not an object and reports it', async () => {
    const files = { ...theme.files, 'sections/header-group.json': '[]' }
    const { html, report } = await renderPage({ theme: { files }, templateName: 'index' })
    expect(html).not.toContain('BEGIN sections')
    expect(report.unsupported).toEqual([{ feature: 'section-group', detail: 'sections/header-group.json is not a JSON object' }])
    expect(report.missing).toEqual([{ kind: 'section', name: 'does-not-exist' }])
  })
  it('affects a contextual group file only when a context is requested, and skips a bad one', async () => {
    const files = { ...theme.files, 'sections/header-group.context.ca.json': '{ nope', 'sections/header-group.context.yy.json': 'null', 'sections/header-group.context.zz.json': '{ "context": { "market": "ca" }, "sections": { "announcement": { "settings": { "text": "From zz" } } } }' }
    const plain = await renderPage({ theme: { files }, templateName: 'index' })
    expect(plain.html).toContain('<p class="announcement">Free shipping|header|1</p>')
    expect(plain.report.unsupported).toEqual([])
    const ca = await renderPage({ theme: { files }, templateName: 'index', request: { context: { market: 'ca' } } })
    expect(ca.html).toContain('<p class="announcement">From zz|header|1</p>')
    expect(ca.report.unsupported).toEqual([
      { feature: 'section-group', detail: expect.stringMatching(/^sections\/header-group\.context\.ca\.json: /) },
      { feature: 'section-group', detail: 'sections/header-group.context.yy.json is not a JSON object' }
    ])
    const us = await renderPage({ theme: { files }, templateName: 'index', request: { context: { market: 'us' } } })
    expect(us.html).toContain('<p class="announcement">Free shipping|header|1</p>')
  })
  it('rejects for a template, settings_data.json or settings_schema.json that is not usable', async () => {
    await expect(renderPage({ theme: { files: { ...theme.files, 'templates/index.json': '{ nope' } }, templateName: 'index' })).rejects.toThrow(/^templates\/index\.json: /)
    await expect(renderPage({ theme: { files: { ...theme.files, 'templates/index.json': '[]' } }, templateName: 'index' })).rejects.toThrow('templates/index.json: must be a JSON object')
    await expect(renderPage({ theme: { files: { ...theme.files, 'config/settings_data.json': '[]' } }, templateName: 'index' })).rejects.toThrow('config/settings_data.json: must be a JSON object')
    await expect(renderPage({ theme: { files: { ...theme.files, 'config/settings_schema.json': '{}' } }, templateName: 'index' })).rejects.toThrow('config/settings_schema.json: must be a JSON array')
    await expect(renderSection({ theme: { files: { ...theme.files, 'sections/header-group.json': '{ nope' } }, templateName: 'index', section: 'sections--header-group__header' })).rejects.toThrow(/^sections\/header-group\.json: /)
  })
})

describe('shopify/theme/runtime malformed locale files', () => {
  it('affects only the renders that look in the file', async () => {
    const files = { ...theme.files, 'locales/de.json': '{ nope', 'locales/fr.schema.json': '{ nope' }
    const english = await renderPage({ theme: { files }, templateName: 'index' })
    expect(english.report.unsupported).toEqual([])
    expect(english.html).toContain('<p>Hello, Sample Store!</p>')
    const german = await renderPage({ theme: { files }, templateName: 'index', locale: 'de' })
    expect(german.html).toContain('<html lang="de">')
    expect(german.html).toContain('<p>Hello, Sample Store!</p>')
    expect(german.report.unsupported).toEqual([{ feature: 'locale file', detail: expect.stringMatching(/^locales\/de\.json: /) }])
    const gift = await renderPage({ theme: { files }, templateName: 'gift_card', locale: 'fr' })
    expect(gift.report.unsupported).toEqual([])
    const french = await renderPage({ theme: { files }, templateName: 'index', locale: 'fr' })
    expect(french.html).toContain('<p>Bonjour, Sample Store !</p><p>Fait avec soin</p><p>Schema subheading</p>')
    expect(french.report.unsupported).toEqual([{ feature: 'locale file', detail: expect.stringMatching(/^locales\/fr\.schema\.json: /) }])
  })
})

describe('shopify/theme/runtime limits and recursion', () => {
  it('rejects for a section file past the parse limit instead of printing it in the section', async () => {
    const files = { ...theme.files, 'sections/huge.liquid': ' '.repeat(10000001), 'templates/t.json': '{ "sections": { "h": { "type": "huge" }, "f": { "type": "footer" } }, "order": ["h", "f"] }' }
    await expect(renderPage({ theme: { files }, templateName: 't' })).rejects.toThrow('parse length limit exceeded')
  })
  it('stops a section that renders itself and prints the error where the tag stands', async () => {
    const files = { ...theme.files, 'sections/loop.liquid': '<i>{% section "loop" %}</i>', 'templates/t.json': '{ "sections": { "a": { "type": "loop" } }, "order": ["a"] }' }
    const { html, report } = await renderPage({ theme: { files }, templateName: 't' })
    expect(html.match(/id="shopify-section-loop"/g)).toHaveLength(99)
    expect(html).toContain('<i>Liquid error (sections/loop line 1): Nesting too deep</i>')
    expect(report.errors).toHaveLength(1)
    expect(report.sections.at(-1)).toMatchObject({ id: 'footer', status: 'rendered' })
  })
  it('stops a section group that renders itself', async () => {
    const files = {
      ...theme.files,
      'sections/again.json': '{ "type": "header", "sections": { "a": { "type": "again-section" } }, "order": ["a"] }',
      'sections/again-section.liquid': '{% sections "again" %}',
      'layout/bare.liquid': '{% sections "again" %}',
      'templates/t.json': '{ "layout": "bare", "sections": {}, "order": [] }'
    }
    const { html, report } = await renderPage({ theme: { files }, templateName: 't' })
    expect(html).toContain('Liquid error (sections/again-section line 1): Nesting too deep')
    expect(report.errors).toHaveLength(1)
  })
})
