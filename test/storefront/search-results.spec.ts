import { renderPage, requestFromUrl, storefrontSampleData as data } from '../../src/shopify'

/** What a search page template made of `template` prints for `url`. */
async function searchPage (url: string, template: string): Promise<string> {
  const theme = { files: { 'config/settings_schema.json': '[]', 'config/settings_data.json': '{"current":{}}', 'layout/theme.liquid': '{{ content_for_layout }}', 'templates/search.liquid': `{%- layout none -%}${template}` } }
  const page = requestFromUrl(url, data)
  return (await renderPage({ theme, templateName: 'search', data, request: page.request, locale: page.locale })).html
}

// final review B, M2: a search result was `{ ...product }`, which drops the product's hidden marker and the image roles, so `json` printed the engine's raw key order (45,650 characters for the first hoodie result) where `all_products[handle] | json` prints the parity store's form (33,348)
describe('search results keep what a built object carries', () => {
  it('prints a product result through json as the same product from all_products', async () => {
    const html = await searchPage('/search?q=hoodie&type=product', '{{ search.results.first | json }}###{{ all_products[search.results.first.handle] | json }}')
    const [result, product] = html.split('###')
    expect(result.length).toBeGreaterThan(30000)
    expect(result).toBe(product)
  })

  it('does the same for every product result, and under a variant filter, whose url is the variant\'s', async () => {
    const html = await searchPage('/search?q=sneakers&type=product', '{% for r in search.results %}{{ r | json }}###{{ all_products[r.handle] | json }}@@@{% endfor %}')
    const pairs = html.split('@@@').filter(Boolean).map(pair => pair.split('###'))
    expect(pairs.length).toBeGreaterThan(1)
    for (const [result, product] of pairs) expect(result).toBe(product)
    const linked = await searchPage('/search?q=sneakers&type=product&filter.v.option.size=12', '{% for r in search.results %}{{ r.handle }}={{ r.url }};{% endfor %}')
    expect(linked).toMatch(/=\/products\/[a-z-]+\?variant=\d+;/)
  })

  it('still names each result\'s kind, prints it as its handle, and leaves the store\'s objects alone', async () => {
    const html = await searchPage('/search?q=shirt', '{% for r in search.results %}{{ r.object_type }}:{{ r }}:{{ r.handle }};{% endfor %}|{{ all_products["men-t-shirt"].object_type }}|{{ all_products["men-t-shirt"] }}')
    expect(html).toBe('product:men-t-shirt:men-t-shirt;product:women-t-shirt:women-t-shirt;product:workout-shirt:workout-shirt;article:news/new-line-of-tennis-products:news/new-line-of-tennis-products;article:news/liquidpeak-450:news/liquidpeak-450;||men-t-shirt')
  })
})
