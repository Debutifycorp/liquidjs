import { harness, harnessTheme } from './harness'

// https://shopify.dev/docs/api/ajax/reference/product-recommendations: GET /recommendations/products?product_id=…&section_id=… answers the HTML of the section rendered with `recommendations`. A theme's product page asks for its own section by `section.id`, `template--<product template>__<key>`, which the engine renders as the index template.

const theme = () => {
  const base = harnessTheme()
  return {
    files: {
      ...base.files,
      'templates/product.json': '{"sections":{"related":{"type":"related","settings":{}}},"order":["related"]}',
      'sections/related.liquid': '<ul>{% for product in recommendations.products %}<li>{{ product.handle }}</li>{% endfor %}</ul><i>{{ recommendations.intent }}</i>'
    }
  }
}

describe('GET /recommendations/products with a section of the product template', () => {
  it('renders the section with the product\'s related products', async () => {
    const { send } = harness({ theme: theme() })
    const response = await send('GET', '/recommendations/products?product_id=10489561382934&section_id=template--product__related&limit=3&intent=related')
    expect(response.status).toBe(200)
    expect(response.text).toContain('<li>')
    expect(response.text).not.toContain('<li>hoodie</li>')
    expect(response.text).toContain('<i>related</i>')
  })

  it('answers 404 for a section the theme lacks', async () => {
    const { send } = harness({ theme: theme() })
    expect((await send('GET', '/recommendations/products?product_id=10489561382934&section_id=template--product__missing')).status).toBe(404)
  })
})
