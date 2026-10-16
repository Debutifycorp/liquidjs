import { renderPage, renderSection, requestFromUrl, storefrontSampleData as data } from '../../src/shopify'
import { probeMatches } from './expect-probe'
import { probeTheme } from './probe'

const EMPTY = '{"sections":{},"order":[]}'

const theme = { files: { ...probeTheme().files, 'templates/product.json': EMPTY, 'templates/collection.json': EMPTY, 'templates/page.json': EMPTY } }

async function chosen (url: string, files: Record<string, string> = theme.files) {
  const page = requestFromUrl(url, data)
  return renderPage({ theme: { files }, templateName: page.templateName, data, request: page.request, locale: page.locale })
}

describe('alternate templates', () => {
  it('picks the view, then the resource suffix, then the base template', async () => {
    const name = async (url: string) => (await chosen(url)).templateName
    expect(await name('/products/hoodie?view=probe')).toBe('product.probe')
    expect(await name('/products/white-leather-sneakers')).toBe('product.probe')
    expect(await name('/products/hoodie')).toBe('product')
    expect(await name('/products/hoodie?view=missing')).toBe('product')
    expect(await name('/collections/featured')).toBe('collection.probe')
    expect(await name('/pages/about?view=probe')).toBe('page.probe')
  })

  it('takes the suffix when the view names no template the theme has', async () => {
    expect((await chosen('/products/white-leather-sneakers?view=missing')).templateName).toBe('product.probe')
  })

  it('renders the base template when the theme lacks the suffix its resource names', async () => {
    expect(data.pages?.find(page => page.handle === 'contact')?.template_suffix).toBe('contact')
    expect((await chosen('/pages/contact')).templateName).toBe('page')
  })

  it('renders a template name that already has a suffix as it is given', async () => {
    const result = await renderPage({ theme, templateName: 'product.probe', data, request: { resource: 'white-leather-sneakers', view: 'other' } })
    expect(result.templateName).toBe('product.probe')
  })

  it('finds a JSON alternate template and ids its sections by the chosen name', async () => {
    const files = {
      'config/settings_schema.json': '[]',
      'config/settings_data.json': '{"current":{}}',
      'layout/theme.liquid': '[{{ template }}|{{ template.name }}|{{ template.suffix }}]{{ content_for_layout }}',
      'sections/plain.liquid': 'plain {{ section.id }}',
      'sections/alt.liquid': 'alt {{ section.id }}',
      'templates/product.json': '{"sections":{"main":{"type":"plain"}},"order":["main"]}',
      'templates/product.alt.json': '{"sections":{"main":{"type":"alt"}},"order":["main"]}'
    }
    const alternate = await chosen('/products/hoodie?view=alt', files)
    expect(alternate.html).toBe('[product.alt|product|alt]<div id="shopify-section-template--product-alt__main" class="shopify-section">alt template--product-alt__main</div>')
    expect(alternate.templateName).toBe('product.alt')
    expect(alternate.report.sections.map(section => section.id)).toEqual(['template--product-alt__main'])
    expect((await chosen('/products/hoodie', files)).html).toBe('[product|product|]<div id="shopify-section-template--product__main" class="shopify-section">plain template--product__main</div>')
    const page = requestFromUrl('/products/hoodie?view=alt', data)
    const section = await renderSection({ theme: { files }, templateName: page.templateName, section: 'main', data, request: page.request })
    expect(section.html).toBe('<div id="shopify-section-template--product-alt__main" class="shopify-section">alt template--product-alt__main</div>')
    expect(section.templateName).toBe('product.alt')
  })
})

describe('against the parity store', () => {
  // the template a resource's suffix picks, and the `template_suffix` the resource carries (fixtures `probe-product-suffix` and `probe-collection-suffix`)
  it.each(['probe-product-suffix', 'probe-collection-suffix'])('%s', async name => {
    const { actual, expected } = await probeMatches(name, (b: any) => [b.template, b.template_suffix])
    expect(actual).toEqual(expected)
    expect(expected).toEqual([{ name: expect.any(String), suffix: 'probe' }, 'probe'])
  })
})
