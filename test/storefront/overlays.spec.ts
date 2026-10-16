import { Context, compileTheme, createShopifyLiquid, renderLiquid, renderPage, storefrontSampleData as data } from '../../src/shopify'

const base = {
  files: {
    'config/settings_schema.json': '[]',
    'config/settings_data.json': '{"current":{}}',
    'layout/theme.liquid': '<main>{{ content_for_layout }}</main>',
    'snippets/price.liquid': '<b>{{ amount | money }}</b>',
    'sections/hero.liquid': '<h1>Hero {% render "price", amount: 100 %}</h1>{% schema %}{"name":"Hero"}{% endschema %}',
    'templates/index.json': '{"sections":{"hero":{"type":"hero"}},"order":["hero"]}'
  }
}

describe('theme overlays', () => {
  it('renders base files and overlay files together, the overlay winning everywhere', async () => {
    const v1 = { base, files: { 'sections/ai-banner.liquid': '<p>AI {% render "price", amount: 250 %}</p>{% schema %}{"name":"AI banner"}{% endschema %}', 'templates/index.json': '{"sections":{"hero":{"type":"hero"},"ai":{"type":"ai-banner"}},"order":["hero","ai"]}' } }
    const { html } = await renderPage({ theme: v1, templateName: 'index', data })
    expect(html).toContain('<h1>Hero <b>$1.00</b></h1>')
    expect(html).toContain('<p>AI <b>$2.50</b></p>')
    const v2 = { base, files: { ...v1.files, 'snippets/price.liquid': '<i>{{ amount | money }}</i>' } }
    const replaced = (await renderPage({ theme: v2, templateName: 'index', data })).html
    expect(replaced).toContain('<h1>Hero <i>$1.00</i></h1>')
    expect(replaced).toContain('<p>AI <i>$2.50</i></p>')
    expect((await renderPage({ theme: base, templateName: 'index', data })).html).toContain('<h1>Hero <b>$1.00</b></h1>')
  })
  it('parses the base once while the overlay\'s section is swapped for a new version', async () => {
    const shared = { files: { ...base.files } }
    await renderPage({ theme: shared, templateName: 'index', data })
    const parsedBase = compileTheme(shared).parseCount
    expect(parsedBase).toBeGreaterThan(0)
    // the template places the overlay's section next to the base's `hero`
    const placed = '{"sections":{"hero":{"type":"hero"},"x":{"type":"ai-x"}},"order":["hero","x"]}'
    const v1 = { base: shared, files: { 'sections/ai-x.liquid': '<p>x1 {% render "price", amount: 100 %}</p>{% schema %}{"name":"X"}{% endschema %}', 'templates/index.json': placed } }
    const first = (await renderPage({ theme: v1, templateName: 'index', data })).html
    expect(first).toContain('<h1>Hero <b>$1.00</b></h1>')
    expect(first).toContain('<p>x1 <b>$1.00</b></p>')
    expect(compileTheme(shared).parseCount).toBe(parsedBase)
    expect(compileTheme(v1).parseCount).toBe(1)
    // a new version of the overlay's section: a new overlay object over the same base
    const v2 = { base: shared, files: { ...v1.files, 'sections/ai-x.liquid': '<p>x2 {% render "price", amount: 100 %}</p>{% schema %}{"name":"X"}{% endschema %}' } }
    const second = (await renderPage({ theme: v2, templateName: 'index', data })).html
    expect(second).toContain('<h1>Hero <b>$1.00</b></h1>')
    expect(second).toContain('<p>x2 <b>$1.00</b></p>')
    expect(second).not.toContain('x1')
    expect(compileTheme(shared).parseCount).toBe(parsedBase)
    expect(compileTheme(v2).parseCount).toBe(1)
  })
  it('looks an included snippet up through the overlay too', async () => {
    const withInclude = { files: { ...base.files, 'sections/hero.liquid': '<h1>Hero {% include "price", amount: 100 %}</h1>{% schema %}{"name":"Hero"}{% endschema %}' } }
    const overlay = { base: withInclude, files: { 'snippets/price.liquid': '<i>{{ amount | money }}</i>' } }
    expect((await renderPage({ theme: overlay, templateName: 'index', data })).html).toContain('<h1>Hero <i>$1.00</i></h1>')
    expect((await renderPage({ theme: withInclude, templateName: 'index', data })).html).toContain('<h1>Hero <b>$1.00</b></h1>')
  })
  it('fails a snippet neither theme has as a theme without a base does', async () => {
    const broken = { files: { ...base.files, 'sections/hero.liquid': '<h1>{% render "nope" %}</h1>{% schema %}{"name":"Hero"}{% endschema %}' } }
    const plain = (await renderPage({ theme: broken, templateName: 'index', data })).html
    expect(plain).toContain('Could not find asset snippets/nope.liquid')
    const overlay = { base: broken, files: { 'snippets/price.liquid': '<i>{{ amount | money }}</i>' } }
    const layered = (await renderPage({ theme: overlay, templateName: 'index', data })).html
    expect(layered).toBe(plain)
  })
  it('lays an overlay over an overlay, each file coming from the nearest theme that has it', async () => {
    const mid = { base, files: { 'snippets/price.liquid': '<i>{{ amount | money }}</i>', 'sections/mid.liquid': '<p>mid {% render "price", amount: 300 %}</p>{% schema %}{"name":"Mid"}{% endschema %}' } }
    const top = { base: mid, files: { 'templates/index.json': '{"sections":{"hero":{"type":"hero"},"mid":{"type":"mid"}},"order":["hero","mid"]}' } }
    const { html } = await renderPage({ theme: top, templateName: 'index', data })
    expect(html).toContain('<h1>Hero <i>$1.00</i></h1>')
    expect(html).toContain('<p>mid <i>$3.00</i></p>')
    const top2 = { base: mid, files: { ...top.files, 'snippets/price.liquid': '<u>{{ amount | money }}</u>' } }
    const replaced = (await renderPage({ theme: top2, templateName: 'index', data })).html
    expect(replaced).toContain('<h1>Hero <u>$1.00</u></h1>')
    expect(replaced).toContain('<p>mid <u>$3.00</u></p>')
    expect(compileTheme(top).parseCount).toBe(0)
    expect(compileTheme(top).has('sections/mid.liquid')).toBe(true)
    expect(compileTheme(top).has('sections/nope.liquid')).toBe(false)
  })
  it('reads settings and locales from the base unless the overlay has its own', async () => {
    const themed = { files: { ...base.files, 'config/settings_schema.json': '[{"name":"x","settings":[{"type":"text","id":"label","default":"base"}]}]', 'layout/theme.liquid': '<main>{{ settings.label }}|{{ "hi" | t }}|{{ content_for_layout }}</main>', 'locales/en.default.json': '{"hi":"Hello"}' } }
    expect((await renderPage({ theme: { base: themed, files: {} }, templateName: 'index', data })).html).toContain('<main>base|Hello|')
    const overlay = { base: themed, files: { 'config/settings_data.json': '{"current":{"label":"mine"}}', 'locales/en.default.json': '{"hi":"Howdy"}' } }
    expect((await renderPage({ theme: overlay, templateName: 'index', data })).html).toContain('<main>mine|Howdy|')
    expect(compileTheme(overlay).paths('locales/')).toEqual(['locales/en.default.json'])
  })
  it('compiles an overlay again when its base is replaced, and picks up edits to its own files', async () => {
    const root = { files: { ...base.files } }
    const overlay = { base: root, files: { 'snippets/price.liquid': '<i>{{ amount | money }}</i>' } }
    const first = compileTheme(overlay)
    expect(compileTheme(overlay)).toBe(first)
    expect((await renderPage({ theme: overlay, templateName: 'index', data })).html).toContain('<h1>Hero <i>$1.00</i></h1>')
    overlay.files['snippets/price.liquid'] = '<u>{{ amount | money }}</u>'
    expect((await renderPage({ theme: overlay, templateName: 'index', data })).html).toContain('<h1>Hero <u>$1.00</u></h1>')
    root.files = { ...root.files, 'sections/hero.liquid': '<h1>New hero {% render "price", amount: 100 %}</h1>{% schema %}{"name":"Hero"}{% endschema %}' }
    expect((await renderPage({ theme: overlay, templateName: 'index', data })).html).toContain('<h1>New hero <u>$1.00</u></h1>')
    expect(compileTheme(overlay)).not.toBe(first)
  })
  it('shares one parse of a base file among overlays, even when the base was not rendered first', async () => {
    const fresh = { files: { ...base.files } }
    const a = { base: fresh, files: { 'snippets/price.liquid': '<i>{{ amount | money }}</i>' } }
    const b = { base: fresh, files: { 'snippets/price.liquid': '<u>{{ amount | money }}</u>' } }
    expect((await renderPage({ theme: a, templateName: 'index', data })).html).toContain('<h1>Hero <i>$1.00</i></h1>')
    const parsed = compileTheme(fresh).parseCount
    expect(parsed).toBeGreaterThan(0)
    expect((await renderPage({ theme: b, templateName: 'index', data })).html).toContain('<h1>Hero <u>$1.00</u></h1>')
    expect(compileTheme(fresh).parseCount).toBe(parsed)
    expect(compileTheme(a).parseCount).toBe(1)
    expect(compileTheme(b).parseCount).toBe(1)
  })
  it('reports a parse error in a base file as a theme without a base does', async () => {
    const broken = { files: { ...base.files, 'snippets/price.liquid': '<b>{% if %}</b>' } }
    const plain = await renderPage({ theme: broken, templateName: 'index', data })
    expect(plain.html).toContain('snippets/price line 1')
    const layered = await renderPage({ theme: { base: broken, files: { 'snippets/other.liquid': 'x' } }, templateName: 'index', data })
    expect(layered.html).toBe(plain.html)
    expect(layered.report.errors).toEqual(plain.report.errors)
  })
  it('layers section groups, contextual groups, static sections, theme blocks, assets and schema locales', async () => {
    const group = (text: string) => JSON.stringify({ type: 'header', name: 'Header', sections: { top: { type: 'bar', settings: { text } }, sub: { type: 'bar' } }, order: ['top', 'sub'] })
    const barSchema = '{% schema %}{"name":"Bar","settings":[{"type":"text","id":"text","default":"t:sections.bar.default"}]}{% endschema %}'
    const noteSchema = '{% schema %}{"name":"Note","settings":[{"type":"text","id":"text"}]}{% endschema %}'
    const holderSchema = '{% schema %}{"name":"Holder","blocks":[{"type":"@theme"}]}{% endschema %}'
    const themed = {
      files: {
        'config/settings_schema.json': '[]',
        'config/settings_data.json': '{"current":{}}',
        'layout/theme.liquid': '<head>{{ content_for_header }}</head><body>{% sections "header-group" %}<main>{{ content_for_layout }}</main>{% section "footer" %}</body>',
        'sections/header-group.json': group('Base bar'),
        'sections/bar.liquid': `<p>{{ section.settings.text }}|{% render "badge" %}</p>${barSchema}`,
        'sections/footer.liquid': '<footer>base footer</footer>{% schema %}{"name":"Footer"}{% endschema %}',
        'sections/holder.liquid': `<div>{% content_for 'blocks' %}</div>${holderSchema}`,
        'snippets/badge.liquid': '<i>base badge</i>{% stylesheet %}.badge { color: red }{% endstylesheet %}',
        'blocks/note.liquid': `<em>{{ block.settings.text }} base block</em>${noteSchema}`,
        'locales/en.default.schema.json': '{"sections":{"bar":{"default":"Base title"}}}',
        'templates/index.json': '{"sections":{"main":{"type":"holder","blocks":{"n1":{"type":"note","settings":{"text":"hello"}}},"block_order":["n1"]}},"order":["main"]}'
      }
    }
    const overlay = {
      base: themed,
      files: {
        'sections/header-group.json': group('Overlay bar'),
        'sections/header-group.context.eu.json': JSON.stringify({ parent: 'header-group.json', context: { market: 'eu' }, sections: { top: { settings: { text: 'EU bar' } } } }),
        'sections/footer.liquid': '<footer>overlay footer</footer>{% schema %}{"name":"Footer"}{% endschema %}',
        'snippets/badge.liquid': '<i>overlay badge</i>{% stylesheet %}.badge { color: blue }{% endstylesheet %}',
        'blocks/note.liquid': `<em>{{ block.settings.text }} overlay block</em>${noteSchema}`,
        'locales/en.default.schema.json': '{"sections":{"bar":{"default":"Overlay title"}}}'
      }
    }
    const rendered = (await renderPage({ theme: overlay, templateName: 'index', data })).html
    expect(rendered).toContain('<p>Overlay bar|<i>overlay badge</i></p>')
    expect(rendered).toContain('<p>Overlay title|<i>overlay badge</i></p>')
    expect(rendered).toContain('<footer>overlay footer</footer>')
    expect(rendered).toContain('hello overlay block')
    expect(rendered).toContain('.badge { color: blue }')
    expect(rendered).not.toMatch(/base (badge|block|footer)|Base (bar|title)|color: red/)
    const eu = (await renderPage({ theme: overlay, templateName: 'index', data, request: { context: { market: 'eu' } } })).html
    expect(eu).toContain('<p>EU bar|<i>overlay badge</i></p>')
    expect(compileTheme(overlay).paths('sections/header-group.')).toEqual(['sections/header-group.json', 'sections/header-group.context.eu.json'])
    // the base is untouched, with the market too: it has no contextual file
    for (const request of [undefined, { context: { market: 'eu' } }]) {
      const plain = (await renderPage({ theme: themed, templateName: 'index', data, request })).html
      expect(plain).toContain('<p>Base bar|<i>base badge</i></p>')
      expect(plain).toContain('<p>Base title|<i>base badge</i></p>')
      expect(plain).toContain('<footer>base footer</footer>')
      expect(plain).toContain('hello base block')
      expect(plain).toContain('.badge { color: red }')
      expect(plain).not.toMatch(/overlay|EU bar|color: blue/)
    }
  })
  it('reaches an in-place edit of a base file through an overlay that takes the file from the base', async () => {
    const root = { files: { ...base.files } }
    const overlay = { base: root, files: { 'snippets/other.liquid': 'x' } }
    expect((await renderPage({ theme: overlay, templateName: 'index', data })).html).toContain('<h1>Hero <b>$1.00</b></h1>')
    root.files['snippets/price.liquid'] = '<s>{{ amount | money }}</s>'
    expect((await renderPage({ theme: overlay, templateName: 'index', data })).html).toContain('<h1>Hero <s>$1.00</s></h1>')
  })
  it('layers nested snippets in an overlay engine rendered through renderLiquid', async () => {
    const root = { files: { 'snippets/card.liquid': '<card>{% render "badge" %}</card>', 'snippets/badge.liquid': '<i>base-badge</i>' } }
    const overlay = { base: root, files: { 'snippets/badge.liquid': '<i>overlay-badge</i>' } }
    const { html } = await renderLiquid(compileTheme(overlay).liquid, '{% render "card" %}|{% include "card" %}')
    expect(html).toBe('<card><i>overlay-badge</i></card>|<card><i>overlay-badge</i></card>')
    expect((await renderLiquid(compileTheme(root).liquid, '{% render "card" %}')).html).toBe('<card><i>base-badge</i></card>')
  })
  it('refuses a base chain that loops', () => {
    const a: { files: Record<string, string>, base?: unknown } = { files: {} }
    const b = { files: {}, base: a }
    a.base = b
    expect(() => compileTheme(a as never)).toThrow('theme base chain loops')
    const self: { files: Record<string, string>, base?: unknown } = { files: {} }
    self.base = self
    expect(() => compileTheme(self as never)).toThrow('theme base chain loops')
    // a theme that only shares a base with another is not a loop
    const shared = { files: { 'snippets/s.liquid': 's' } }
    expect(() => compileTheme({ files: {}, base: shared })).not.toThrow()
    expect(() => compileTheme({ files: {}, base: shared })).not.toThrow()
  })
  it('renders a snippet by name in a context without Shopify state, as the plain engine does', async () => {
    const engine = createShopifyLiquid({ files: { 'snippets/badge.liquid': 'B' } })
    const ctx = new Context({}, engine.options, { globals: {} }, { liquid: engine })
    expect(await engine.render(engine.parse('x{% render "badge" %}y{% include "badge" %}z'), ctx)).toBe('xByBz')
  })
})
