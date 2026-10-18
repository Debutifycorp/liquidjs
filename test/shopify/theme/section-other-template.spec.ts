import { renderSection, storefrontSampleData as data } from '../../../src/shopify'
import type { ThemeInput } from '../../../src/shopify'

// https://shopify.dev/docs/api/ajax/section-rendering: "this parameter can be used to render a section in the context of any page", and a requested section that "exists in a template" takes that template's settings. The Product Recommendations API asks for a product template's section at /recommendations/products, which the engine renders as the index template.

const theme: ThemeInput = {
  files: {
    'config/settings_schema.json': '[]',
    'config/settings_data.json': '{"current":{}}',
    'layout/theme.liquid': '{{ content_for_layout }}',
    'templates/index.json': '{"sections":{"hero":{"type":"hero","settings":{}}},"order":["hero"]}',
    'templates/product.json': '{"sections":{"related":{"type":"related","settings":{"title":"You may also like"}}},"order":["related"]}',
    'templates/product.probe.json': '{"sections":{"related":{"type":"related","settings":{"title":"Probe related"}}},"order":["related"]}',
    'sections/hero.liquid': '<p>hero</p>',
    'sections/related.liquid': '<h2>{{ section.settings.title }}</h2>{{ section.id }}|{{ section.location }}|{{ recommendations.products_count }}'
  }
}

const request = { path: '/recommendations/products', recommendations: { productId: data.products?.find(p => p.handle === 'hoodie')?.id ?? 0, limit: 3 } }

async function render (section: string): Promise<{ html: string, missing: string[] }> {
  const result = await renderSection({ theme, templateName: 'index', data, section, request })
  return { html: result.html, missing: result.report.missing.map(entry => entry.name) }
}

describe('a section id that names another template', () => {
  it('finds the section in that template with its settings, on a page of the requested template', async () => {
    const { html, missing } = await render('template--product__related')
    expect(html).toContain('<h2>You may also like</h2>template--product__related|template|3')
    expect(missing).toEqual([])
  })

  it('finds the section of an alternate template by its id', async () => {
    expect((await render('template--product-probe__related')).html).toContain('<h2>Probe related</h2>')
  })

  it('still renders a section of the rendering template', async () => {
    expect((await render('template--index__hero')).html).toContain('<p>hero</p>')
  })

  it('reports a section the named template lacks, and a template the theme lacks', async () => {
    expect(await render('template--product__nothing')).toMatchObject({ html: '', missing: ['template--product__nothing'] })
    expect((await render('template--blog__related')).html).toBe('')
  })
})
