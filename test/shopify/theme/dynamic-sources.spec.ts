import { sampleStoreData, storefrontSampleData } from '../../../src/shopify'
import { renderPage } from './bare-block-ids'
import type { RequestInput } from '../../../src/shopify/store/globals'

const schema = (settings: object[], extra: object = {}) => `{% schema %}${JSON.stringify({ name: 'S', settings, ...extra })}{% endschema %}`

/** A page of one JSON template `t` whose sections are `sections` (a key to its saved JSON), rendered without a layout over `files`. */
const page = (files: Record<string, string>, sections: Record<string, object>, templateName = 'product', request: RequestInput = { resource: 'hoodie' }) =>
  renderPage({
    theme: { files: { [`templates/${templateName}.json`]: JSON.stringify({ layout: false, sections, order: Object.keys(sections) }), ...files } },
    templateName,
    request
  })
const SECTION = (template: string, key: string, inner: string) => `<div id="shopify-section-template--${template}__${key}" class="shopify-section">${inner}</div>`
const WRAP = (id: string, inner: string) => `<div id="shopify-block-${id}" class="shopify-block">${inner}</div>`

/**
 * https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings (`color_palette`): "you access individual palette colors through `settings.<id>`", "Each color is returned as a `color` object", "Iterating over the palette yields each color as a `color` object in JSON key order", merchant changes "take precedence over the defaults" and new default keys "appear automatically", and a deleted colour "is stored as a reference to the replacement, for example `{{ settings.colors.accent }}`". The same page (`color`, `color_background`, "Cross-setting references"): a palette colour as the `default` of a `color` setting, or embedded in a `color_background` gradient, written `{{ settings.colors.primary }}`.
 */
describe('shopify/theme color_palette and palette references', () => {
  const settingsSchema = JSON.stringify([
    { name: 'theme_info' },
    {
      name: 'Colours',
      settings: [
        { type: 'color_palette', id: 'colors', default: { primary: '#121212', secondary: '#ffffff', spare: '#00ff00' } },
        { type: 'color', id: 'text_color', label: 'Text', default: '{{ settings.colors.primary }}' },
        { type: 'color', id: 'saved_color', label: 'Saved', default: '#000000' },
        { type: 'color_background', id: 'hero', label: 'Hero', default: 'linear-gradient(180deg, {{ settings.colors.primary }}, {{ settings.colors.secondary }} 100%)' }
      ]
    }
  ])
  const settingsData = JSON.stringify({ current: { colors: { primary: '#334fb4', secondary: '#ffffff', accent: '{{ settings.colors.primary }}' }, saved_color: '{{ settings.colors.accent }}' } })
  const files = { 'config/settings_schema.json': settingsSchema, 'config/settings_data.json': settingsData }

  it('gives the palette as colour objects by key and in saved order, then the default keys the saved palette lacks', async () => {
    const { html, report } = await page({
      ...files,
      'sections/s.liquid': '{{ settings.colors.primary }}|{{ settings.colors.primary.rgb }}|{% for c in settings.colors %}{{ c }}/{{ c.alpha }},{% endfor %}|{{ settings.colors.size }}|{{ settings.colors.accent.red }}'
    }, { main: { type: 's' } })
    expect(html).toBe(SECTION('product', 'main', '#334fb4|51 79 180|#334fb4/1.0,#ffffff/1.0,#334fb4/1.0,#00ff00/1.0,|4|51'))
    expect(report.unsupported).toEqual([])
  })
  // shopify.dev does not say what the palette prints as a whole or through `json`: it prints as a list of its colours does, and `json` gives each key's colour as saved (README, not pinned)
  it('prints the palette as its colours in order, and json as each key with its colour', async () => {
    const { html } = await page({ ...files, 'sections/s.liquid': '{{ settings.colors }}|{{ settings.colors | json }}' }, { main: { type: 's' } })
    expect(html).toBe(SECTION('product', 'main', '#334fb4#ffffff#334fb4#00ff00|{"primary":"#334fb4","secondary":"#ffffff","accent":"#334fb4","spare":"#00ff00"}'))
  })
  it('resolves palette references in global colour defaults, saved values and gradients', async () => {
    const { html, report } = await page({
      ...files,
      'sections/s.liquid': '{{ settings.text_color }}|{{ settings.text_color.rgba }}|{{ settings.saved_color }}|{{ settings.hero }}'
    }, { main: { type: 's' } })
    expect(html).toBe(SECTION('product', 'main', '#334fb4|51 79 180 / 1.0|#334fb4|linear-gradient(180deg, #334fb4, #ffffff 100%)'))
    expect(report.unsupported).toEqual([])
  })
  it('resolves them in the defaults and saved values of section and block colour settings', async () => {
    const { html, report } = await page({
      ...files,
      'sections/s.liquid': `<b style="color: {{ section.settings.fg }}; background: rgb({{ section.settings.bg.rgba }})">{% content_for 'blocks' %}</b>${schema([{ type: 'color', id: 'fg', label: 'Fg', default: '{{ settings.colors.secondary }}' }, { type: 'color', id: 'bg', label: 'Bg', default: '#000000' }])}`,
      'blocks/chip.liquid': `<i>{{ block.settings.c }}</i>${schema([{ type: 'color', id: 'c', label: 'C', default: '{{ settings.colors.primary }}' }])}`
    }, { main: { type: 's', settings: { bg: '{{ settings.colors.primary }}' }, blocks: { a: { type: 'chip' }, b: { type: 'chip', settings: { c: '{{ settings.colors.spare }}' } } }, block_order: ['a', 'b'] } })
    expect(html).toBe(SECTION('product', 'main', `<b style="color: #ffffff; background: rgb(51 79 180 / 1.0)">${WRAP('a', '<i>#334fb4</i>')}${WRAP('b', '<i>#00ff00</i>')}</b>`))
    expect(report.unsupported).toEqual([])
  })
  it('replaces a reference to a colour the palette does not have by the default, and reports it', async () => {
    const { html, report } = await page({
      ...files,
      'sections/s.liquid': `[{{ section.settings.c }}][{{ section.settings.d }}]${schema([{ type: 'color', id: 'c', label: 'C', default: '{{ settings.colors.primary }}' }, { type: 'color', id: 'd', label: 'D' }])}`
    }, { main: { type: 's', settings: { c: '{{ settings.colors.gone }}', d: '{{ settings.colors.gone }}' } } })
    expect(html).toBe(SECTION('product', 'main', '[#334fb4][]'))
    expect(report.unsupported).toEqual([
      { feature: 'invalid_setting', detail: 'color setting c names a palette colour the palette does not have and was replaced by its default' },
      { feature: 'invalid_setting', detail: 'color setting d names a palette colour the palette does not have and was replaced by its default' }
    ])
  })
})

/** Liquid's `empty` matches a value whose `empty?` is true (Ruby Liquid's `Condition` calls `empty?` on the value). A settings object holds the settings its schema declares, so it is not empty: Horizon's `snippets/resource-list.liquid` guards with `unless settings != empty` and receives `section.settings`. */
describe('shopify/theme settings and empty', () => {
  it('tests section, block and global settings as not empty, and a section without settings as empty', async () => {
    const { html } = await page({
      'config/settings_schema.json': JSON.stringify([{ name: 'theme_info' }, { name: 'G', settings: [{ type: 'text', id: 'g', label: 'G' }] }]),
      'sections/s.liquid': `{% if section.settings != empty %}a{% endif %}{% if section.settings == empty %}b{% endif %}{% if settings != empty %}c{% endif %}{% render 'list', settings: section.settings %}{% content_for 'blocks' %}${schema([{ type: 'text', id: 'title', label: 'T' }])}`,
      'snippets/list.liquid': '{%- assign settings = settings | default: empty -%}{%- if settings != empty -%}[{{ settings.title }}]{%- else -%}<!-- Error -->{%- endif -%}',
      'blocks/b.liquid': `{% if block.settings != empty %}d{% endif %}${schema([{ type: 'text', id: 'x', label: 'X' }])}`,
      'sections/bare.liquid': '{% if section.settings == empty %}empty{% endif %}{% if section.settings != empty %}full{% endif %}'
    }, { main: { type: 's', settings: { title: 'Hi' }, blocks: { k: { type: 'b' } } }, bare: { type: 'bare' } })
    expect(html).toBe(SECTION('product', 'main', `ac[Hi]${WRAP('k', 'd')}`) + SECTION('product', 'bare', 'empty'))
  })
})

/**
 * https://shopify.dev/docs/storefronts/themes/architecture/settings/dynamic-sources: `text`, `inline_richtext` and `richtext` settings (and resource settings) connect to "The resource associated with the template that the section is in" and "The resource settings in the context of the current setting"; a `default` can reference one ("Featuring: {{ product.title }}"), and "Additional Liquid is invalid when using this method, so you can only reference the value directly". https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks/dynamic-sources stores them in the template JSON as written (`"text": "<p>{{ closest.product.title }}</p>"`, `"product": "{{ closest.product }}"`). The parity store prints Horizon's product page with `<h1>Hoodie</h1>` and the product's description where those settings stand (recording `page-product` of the Horizon theme).
 */
describe('shopify/theme dynamic sources in setting values', () => {
  const text = (id: string, type = 'text', extra: object = {}) => ({ type, id, label: id, ...extra })
  const info = `{{ section.settings.heading }}|{{ section.settings.body }}|{{ section.settings.missing }}|{{ section.settings.vendor }}|{{ section.settings.intro }}|{{ section.settings.filtered }}${schema([text('heading', 'inline_richtext'), text('body', 'richtext'), text('missing', 'inline_richtext'), text('vendor'), text('intro', 'text', { default: 'Featuring: {{ product.title }}' }), text('filtered')])}`

  it('resolves references in text, inline_richtext and richtext settings against the page', async () => {
    const { html, report } = await page({ 'sections/info.liquid': info }, {
      main: { type: 'info', settings: { heading: '<h1>{{ closest.product.title }}</h1>', body: '{{ closest.product.description }}', missing: '<h2>{{ closest.collection.title }}</h2>', vendor: 'By {{ product.vendor }}', filtered: '{{ product.title | upcase }}' } }
    })
    const description = "<p>This hoodie is the perfect choice for comfort and warmth. Meticulously crafted from 100% cotton, the hoodie features a soft, plush fleece interior and a unisex sizing design. Soft and lightweight, it's sure to be your go-to for chilly days.</p>"
    expect(html).toBe(SECTION('product', 'main', `<h1>Hoodie</h1>|${description}|<h2></h2>|By Mock.shop|Featuring: Hoodie|{{ product.title | upcase }}`))
    expect(report.unsupported).toEqual([{ feature: 'invalid_setting', detail: 'text setting filtered holds Liquid other than a reference to an object, which Shopify does not accept in a setting value, and is read as written' }])
  })
  it('reads a value that names a member every object has as written', async () => {
    const { html, report } = await page({ 'sections/info.liquid': info }, { main: { type: 'info', settings: { vendor: '{{ product.featured_image.constructor }}' } } })
    expect(html).toBe(SECTION('product', 'main', '|||{{ product.featured_image.constructor }}|Featuring: Hoodie|'))
    expect(report.unsupported.map(entry => entry.detail)).toEqual(['text setting vendor holds Liquid other than a reference to an object, which Shopify does not accept in a setting value, and is read as written'])
  })
  // the sanitiser drops a `javascript:` URL typed into rich text, so one that a dynamic source puts into a URL attribute is dropped too, as a `url` setting drops it
  it('drops a URL a reference puts into an href or src when its scheme is not a safe one, and reports it', async () => {
    const data = structuredClone(sampleStoreData)
    const hoodie = data.products!.find(product => product.handle === 'hoodie')!
    hoodie.metafields = { custom: { link: 'javascript:alert(1)', half: 'java', site: 'https://example.com/a?b=1&c=2' } }
    const sections = { main: { type: 's', settings: { rt: '<p><a href="{{ closest.product.metafields.custom.link }}">x</a><a href="{{ closest.product.metafields.custom.half }}{{ closest.product.metafields.custom.link }}">y</a><a href="{{ closest.product.metafields.custom.site }}" title="{{ closest.product.metafields.custom.link }}">z</a></p>', irt: '<img src="{{ closest.product.metafields.custom.link }}" alt="a">' } } }
    const { html, report } = await renderPage({
      theme: { files: { 'templates/product.json': JSON.stringify({ layout: false, sections, order: ['main'] }), 'sections/s.liquid': `{{ section.settings.rt }}|{{ section.settings.irt }}${schema([text('rt', 'richtext'), text('irt', 'inline_richtext')])}` } },
      templateName: 'product',
      request: { resource: 'hoodie' },
      data
    })
    expect(html).toBe(SECTION('product', 'main', '<p><a href="">x</a><a href="">y</a><a href="https://example.com/a?b=1&amp;c=2" title="javascript:alert(1)">z</a></p>|<img src="" alt="a">'))
    // the report lists a repeated entry once
    expect(report.unsupported.filter(entry => entry.feature === 'unsafe_url').map(entry => entry.detail)).toEqual([
      'richtext setting rt has a dynamic source that puts a URL with a scheme other than http, https, mailto or tel into an href or src, which was dropped',
      'inline_richtext setting irt has a dynamic source that puts a URL with a scheme other than http, https, mailto or tel into an href or src, which was dropped'
    ])
  })
  it('prints a reference to nothing as nothing', async () => {
    const { html } = await page({ 'sections/info.liquid': info }, { main: { type: 'info', settings: { heading: '<h1>{{ closest.product.title }}</h1>', vendor: '[{{ product.vendor }}]' } } }, 'index', {})
    expect(html).toBe(SECTION('index', 'main', '<h1></h1>|||[]|Featuring: |'))
  })
  it('reads a section or block resource setting in a block setting, through section.blocks too', async () => {
    const { html, report } = await page({
      'sections/featured.liquid': `{% content_for 'blocks' %}|{% for b in section.blocks %}{{ b.settings.line }};{% endfor %}${schema([text('product', 'product')])}`,
      'blocks/line.liquid': `{{ block.settings.line }}${schema([text('product', 'product'), text('line')])}`
    }, { main: { type: 'featured', settings: { product: 'slides' }, blocks: { a: { type: 'line', settings: { line: '{{ section.settings.product.title }} by {{ section.settings.product.vendor }}' } }, b: { type: 'line', settings: { product: 'beanie', line: '{{ block.settings.product.title }}, not {{ product.title }}' } } }, block_order: ['a', 'b'] } })
    expect(html).toBe(SECTION('product', 'main', `${WRAP('a', 'Slides by Mock.shop')}${WRAP('b', 'Beanie, not Hoodie')}|Slides by Mock.shop;Beanie, not Hoodie;`))
    expect(report.unsupported).toEqual([])
  })
  it('resolves a resource setting that holds {{ closest.product }} to the closest product, nil where there is none', async () => {
    const files = { 'sections/recs.liquid': `[{{ section.settings.product.title }}]{% if section.settings.product == blank %}none{% endif %}${schema([text('product', 'product')])}` }
    const product = await page(files, { main: { type: 'recs', settings: { product: '{{ closest.product }}' } } })
    expect(product.html).toBe(SECTION('product', 'main', '[Hoodie]'))
    expect(product.report.missing).toEqual([])
    const index = await page(files, { main: { type: 'recs', settings: { product: '{{ closest.product }}' } } }, 'index', {})
    expect(index.html).toBe(SECTION('index', 'main', '[]none'))
    expect(index.report.missing).toEqual([])
  })
  // the order for a resource setting that holds `{{ closest.product }}` is the context setter, the ancestor blocks, the section and the template ("Usage in theme block presets"): a sibling setting of the same section or block is not in it
  it('reads a resource setting that holds {{ closest.product }} from further up, never from a sibling setting', async () => {
    const defs = [text('a', 'product'), text('b', 'product'), text('x', 'inline_richtext')]
    const two = await page({ 'sections/s.liquid': `[{{ section.settings.a.title }}|{{ section.settings.b.title }}|{{ section.settings.x }}|{{ closest.product.title }}]${schema(defs)}` }, { main: { type: 's', settings: { a: '{{ closest.product }}', b: '{{ closest.product }}', x: '{{ closest.product.title }}' } } })
    expect(two.html).toBe(SECTION('product', 'main', '[Hoodie|Hoodie|Hoodie|Hoodie]'))
    const sibling = await page({ 'sections/s.liquid': `[{{ section.settings.a.title }}|{{ section.settings.b.title }}]${schema(defs)}` }, { main: { type: 's', settings: { a: '{{ closest.product }}', b: 'slides' } } })
    expect(sibling.html).toBe(SECTION('product', 'main', '[Hoodie|Slides]'))
    const block = await page({
      'sections/s.liquid': `{% content_for 'blocks' %}${schema([text('sp', 'product')])}`,
      'blocks/b.liquid': `[{{ block.settings.p.title }}|{{ block.settings.q.title }}|{{ closest.product.title }}]${schema([text('p', 'product'), text('q', 'product')])}`
    }, { main: { type: 's', settings: { sp: 'beanie' }, blocks: { k: { type: 'b', settings: { p: '{{ closest.product }}', q: '{{ closest.product }}' } } }, block_order: ['k'] } })
    expect(block.html).toBe(SECTION('product', 'main', WRAP('k', '[Beanie|Beanie|Beanie]')))
  })
  // a `liquid` setting is Debutify's trusted-mode feature, rendered where the theme prints it; a dynamic source reads values, never runs code, so one that names a `liquid` setting reads nil, through `json` too
  it('reads a liquid setting a reference names as nil, in trusted mode and through json first', async () => {
    const section = `{{ section.settings.label }}|{{ section.settings.code }}{% schema %}${JSON.stringify({ name: 'S', settings: [text('label'), text('code', 'liquid')] })}{% endschema %}`
    const sections = { main: { type: 's', settings: { label: '[{{ section.settings.code }}]', code: '{{ product.title }}' } } }
    const run = (source: string) => renderPage({ theme: { files: { 'templates/product.json': JSON.stringify({ layout: false, sections, order: ['main'] }), 'sections/s.liquid': source } }, templateName: 'product', request: { resource: 'hoodie' }, trustLiquidSettings: true })
    expect((await run(section)).html).toBe(SECTION('product', 'main', '[]|Hoodie'))
    expect((await run(`{{ section.settings | json }}${section.replace(/\{\{ section.settings.label \}\}\|/, '')}`)).html).toBe(SECTION('product', 'main', '{"label":"[]","code":"{{ product.title }}"}Hoodie'))
  })
  it('gives json the resolved values', async () => {
    const { html } = await page({ 'sections/info.liquid': `{{ section.settings | json }}${schema([text('heading', 'inline_richtext'), text('product', 'product')])}` }, { main: { type: 'info', settings: { heading: '<h1>{{ product.title }}</h1>', product: '{{ closest.product }}' } } })
    expect(html).toContain('{"heading":"\\u003ch1\\u003eHoodie\\u003c\\/h1\\u003e","product":{"id":10489561382934,"handle":"hoodie"')
  })
})

/**
 * https://shopify.dev/docs/api/liquid/objects/closest: the resources "closest to the current context", from "The currently rendered section or theme block resource setting of the same type", "The currently rendered theme block's ancestor resource setting of the same type", "The currently rendered template resource of the same type" and "Assigned via {% content_for %} tag". https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks/dynamic-sources: the order is the same block's setting, a parent block's, the section's, then the template's; an empty product setting still holds its descendants ("Because no closest product is currently set, the nested blocks will display placeholders"); `{% content_for "blocks", closest.product: <Product Drop> %}` and the same on `content_for "block"` pass a resource down, `closest.metaobject.<definition_type>` a metaobject, and "If the resource type doesn't match one of these parameters, then an error is returned".
 */
describe('shopify/theme closest', () => {
  const title = { 'blocks/title.liquid': '[{{ closest.product.title }}]' }
  const group = { 'blocks/group.liquid': "{% content_for 'blocks' %}" }

  it('is the template resource in a section and in its nested blocks', async () => {
    const { html } = await page({ ...title, ...group, 'sections/s.liquid': "{{ closest.product.title }}:{% content_for 'blocks' %}" }, { main: { type: 's', blocks: { g: { type: 'group', blocks: { t: { type: 'title' } }, block_order: ['t'] } }, block_order: ['g'] } })
    expect(html).toBe(SECTION('product', 'main', `Hoodie:${WRAP('g', WRAP('t', '[Hoodie]'))}`))
  })
  it('is the resource of each template', async () => {
    const files = { 'sections/s.liquid': '{{ closest.product.title }}|{{ closest.collection.title }}|{{ closest.page.title }}|{{ closest.blog.title }}|{{ closest.article.title }}' }
    const render = async (template: string, resource?: string) => (await page(files, { main: { type: 's' } }, template, resource ? { resource } : {})).html
    expect(await render('collection', 'men')).toBe(SECTION('collection', 'main', '|Men|||'))
    expect(await render('page', 'contact')).toContain('||Contact||')
    expect(await render('blog', 'news')).toBe(SECTION('blog', 'main', '|||News|'))
    expect(await render('article', 'news/making-liquid')).toBe(SECTION('article', 'main', '|||News|Making Liquid'))
    expect(await render('index')).toBe(SECTION('index', 'main', '||||'))
  })
  it('is the nearest resource setting: the block, then a parent block, then the section, declared but empty included', async () => {
    const { html } = await page({
      ...title,
      'sections/s.liquid': `{{ closest.product.title }}:{% content_for 'blocks' %}${schema([{ type: 'product', id: 'p', label: 'P' }])}`,
      'blocks/card.liquid': `<{{ closest.product.title }}>{% content_for 'blocks' %}${schema([{ type: 'product', id: 'p', label: 'P' }])}`,
      ...group
    }, {
      main: {
        type: 's',
        settings: { p: 'slides' },
        blocks: {
          g: { type: 'group', blocks: { t: { type: 'title' } }, block_order: ['t'] },
          c: { type: 'card', settings: { p: 'beanie' }, blocks: { t2: { type: 'title' } }, block_order: ['t2'] },
          e: { type: 'card', blocks: { t3: { type: 'title' } }, block_order: ['t3'] }
        },
        block_order: ['g', 'c', 'e']
      }
    })
    expect(html).toBe(SECTION('product', 'main', `Slides:${WRAP('g', WRAP('t', '[Slides]'))}${WRAP('c', `<Beanie>${WRAP('t2', '[Beanie]')}`)}${WRAP('e', `<>${WRAP('t3', '[]')}`)}`))
  })
  it("takes a resource from content_for 'block' and 'blocks', for the block, its settings and its children", async () => {
    const { html, report } = await page({
      ...title,
      'sections/s.liquid': "{% assign picks = 'slides,beanie' | split: ',' %}{% for h in picks %}{% content_for 'block', type: 'card', id: 'card', closest.product: all_products[h], label: h %}{% endfor %}{% content_for 'block', type: 'card', id: 'empty', closest.product: null %}{% content_for 'block', type: 'list', id: 'list', closest.collection: collections.men %}",
      'blocks/card.liquid': `({{ label }}|{{ closest.product.title }}|{{ block.settings.product.title }}){% content_for 'blocks', closest.product: closest.product %}${schema([{ type: 'product', id: 'product', label: 'P' }])}`,
      'blocks/list.liquid': "{% content_for 'blocks' %}",
      'blocks/heading.liquid': `{{ closest.collection.title }}/{{ block.settings.text }}${schema([{ type: 'inline_richtext', id: 'text', label: 'T' }])}`
    }, {
      main: {
        type: 's',
        blocks: {
          card: { type: 'card', static: true, settings: { product: '{{ closest.product }}' }, blocks: { t: { type: 'title' } }, block_order: ['t'] },
          empty: { type: 'card', static: true, settings: { product: '{{ closest.product }}' } },
          list: { type: 'list', static: true, blocks: { h: { type: 'heading', settings: { text: '<b>{{ closest.collection.title }}</b>' } } }, block_order: ['h'] }
        }
      }
    })
    expect(html).toBe(SECTION('product', 'main', `${WRAP('card', `(slides|Slides|Slides)${WRAP('t', '[Slides]')}`)}${WRAP('card-1', `(beanie|Beanie|Beanie)${WRAP('t-1', '[Beanie]')}`)}${WRAP('empty', '(||)')}${WRAP('list', WRAP('h', 'Men/<b>Men</b>'))}`))
    expect(report.errors).toEqual([])
  })
  it('passes a metaobject by its definition type, and rejects a type closest does not hold', async () => {
    const { html } = await page({
      'sections/s.liquid': "{% content_for 'block', type: 'm', id: 'm', closest.metaobject.material: 'wool' %}{% content_for 'blocks', closest.thing: 1 %}",
      'blocks/m.liquid': '[{{ closest.metaobject.material }}|{{ closest.metaobject.other }}]'
    }, { main: { type: 's' } })
    expect(html).toBe(SECTION('product', 'main', `${WRAP('m', '[wool|]')}Liquid error (sections/s line 1): content_for: closest.thing is not a resource type closest holds`))
  })
})

/** Not on https://shopify.dev/docs/api/liquid/objects/block, but Shopify's Horizon theme reads `block.blocks` (blocks/_carousel-content.liquid), so the entries of `section.blocks` have their children too; `shopify_attributes` "returns no value outside the theme editor" for a block, and a section's is the same here. */
describe('shopify/theme blocks of section.blocks', () => {
  it('lists the children of each entry of section.blocks, and gives sections empty shopify_attributes', async () => {
    const { html } = await page({
      'sections/s.liquid': '{% for b in section.blocks %}{{ b.id }}:{{ b.blocks.size }}:{% for c in b.blocks %}{{ c.settings.text }}{% endfor %};{% endfor %}[{{ section.shopify_attributes }}]{{ section.shopify_attributes | json }}',
      'blocks/text.liquid': schema([{ type: 'text', id: 'text', label: 'T' }])
    }, { main: { type: 's', blocks: { g: { type: 'group', blocks: { x: { type: 'text', settings: { text: 'one' } }, y: { type: 'text', settings: { text: 'two' } } }, block_order: ['x', 'y'] }, t: { type: 'text' } }, block_order: ['g', 't'] } })
    expect(html).toBe(SECTION('product', 'main', 'g:2:onetwo;t:0:;[]""'))
  })
})

/** The parity store numbers each repeat of a static block in a loop, and the blocks inside it take the same number: Horizon's blog page prints `shopify-block-…__static-blog-post-card`, then `…-1` and `…-2`, with `…__blog-post-details-1` and the text block class `text-block--…__heading-1` inside the second card, and its home page prints the dynamic blocks of the second product card as `product_title_…-1` (recordings `page-blog` and `page-home` of the Horizon theme). shopify.dev does not document it. */
describe('shopify/theme static blocks rendered more than once', () => {
  it('numbers the repeats of a static block, and the blocks inside a repeat take its number', async () => {
    const { html } = await page({
      'sections/s.liquid': "{% for i in (1..3) %}{% content_for 'block', type: 'card', id: 'card' %}{% endfor %}{% content_for 'block', type: 'card', id: 'other' %}",
      'blocks/card.liquid': "<{{ block.id }}>{% content_for 'block', type: 'leaf', id: 'heading' %}{% content_for 'blocks' %}",
      'blocks/leaf.liquid': '({{ block.id }})'
    }, { main: { type: 's', blocks: { card: { type: 'card', static: true, blocks: { t: { type: 'leaf' } }, block_order: ['t'] } } } })
    const card = (suffix: string) => WRAP(`card${suffix}`, `<card${suffix}>${WRAP(`heading${suffix}`, `(heading${suffix})`)}${WRAP(`t${suffix}`, `(t${suffix})`)}`)
    expect(html).toBe(SECTION('product', 'main', `${card('')}${card('-1')}${card('-2')}${WRAP('other', `<other>${WRAP('heading', '(heading)')}`)}`))
  })
})

/** Every shop has the collection `all` (https://shopify.dev/docs/api/liquid/objects/collections); the parity store titles it `Produits` in French, where a featured collection section picks it (Dawn's home page on `/fr-ca`: "Afficher tous les produits de la collection Produits", recording `page-home-fr-ca` of the Dawn theme). */
describe('shopify/theme the collection all in another language', () => {
  it('titles the collection all in the language of the page, through a collection setting too', async () => {
    const files = { 'sections/s.liquid': `{{ collections.all.title }}|{{ section.settings.collection.title }}${schema([{ type: 'collection', id: 'collection', label: 'C' }])}` }
    const sections = { main: { type: 's', settings: { collection: 'all' } } }
    const render = (request: RequestInput) => renderPage({ theme: { files: { 'templates/index.json': JSON.stringify({ layout: false, sections, order: ['main'] }), ...files } }, templateName: 'index', data: storefrontSampleData, request })
    expect((await render({ market: 'ca', language: 'fr' })).html).toBe(SECTION('index', 'main', 'Produits|Produits'))
    expect((await render({})).html).toBe(SECTION('index', 'main', 'Products|Products'))
  })
})
