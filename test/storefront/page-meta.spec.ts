import { renderPage, requestFromUrl, storefrontSampleData as data } from '../../src/shopify'
import type { StoreData } from '../../src/shopify'

// Storefront Task 8, lane P1 (page metadata): each case names the parity store's page recording it follows. The recordings are private, so the layouts here are minimal inline templates over the public sample data.

const EMPTY = '{"sections":{},"order":[]}'
const TEMPLATES = ['index', 'product', 'collection', 'list-collections', 'page', 'blog', 'article', 'cart', 'search', '404']

/** A theme of empty templates around a layout, to read what the layout prints. */
const layoutTheme = (layout: string) => ({ files: { 'config/settings_schema.json': '[]', 'config/settings_data.json': '{"current":{}}', 'layout/theme.liquid': layout, ...Object.fromEntries(TEMPLATES.map(name => [`templates/${name}.json`, EMPTY])) } })

async function print (url: string, layout: string, store: StoreData = data): Promise<string> {
  const page = requestFromUrl(url, store)
  return (await renderPage({ theme: layoutTheme(layout), templateName: page.templateName, data: store, request: page.request, locale: page.locale })).html
}

/** The description a page hands the layout, in brackets so a blank one shows. */
const description = (url: string, store?: StoreData) => print(url, '[{{ page_description }}]', store).then(html => html.slice(1, -1))

const text = (html: string) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
const product = (handle: string) => data.products!.find(p => p.handle === handle)!

describe('page_description', () => {
  // https://shopify.dev/docs/api/liquid/objects/page_description says only "The meta description of the current page". The rules below are what the parity store's recordings show: `page-product`, `page-collection`, `page-page`, `page-faq`, `page-track-order` and `page-article` print the text of the page's own body, with its tags taken out; `page-article` and `page-product-requires-plan` stop at 320 characters, in the middle of a word and with no ellipsis.
  it('is the text of the resource\'s own description or body', async () => {
    expect(await description('/products/hoodie')).toBe(text(product('hoodie').description!))
    expect(await description('/products/slides')).toBe(text(product('slides').description!))
    expect(await description('/pages/about')).toBe('We make everyday clothing.')
    expect(await description('/pages/faq')).toBe('Answers to common questions.')
    expect(await description('/pages/track-order')).toBe('Where is it?')
    expect(await description('/collections/tops')).toBe(text(data.collections!.find(c => c.handle === 'tops')!.description!))
  })

  it('is the article\'s body, not its excerpt, with the line breaks between its blocks as single spaces and cut at 320 characters', async () => {
    const article = await description('/blogs/news/making-liquid')
    expect(article).toHaveLength(320)
    expect(article.startsWith('At Liquid, we are committed to providing our customers with high-quality streetwear')).toBe(true)
    expect(article.endsWith('for all of our products. Organic Cotton: T')).toBe(true)
    expect(article).not.toContain('\n')
    const frontpack = await description('/products/frontpack')
    expect(frontpack).toBe(text(product('frontpack').description!).slice(0, 320))
    expect(frontpack.endsWith('ensures your items stay dry and s')).toBe(true)
  })

  it('is blank for a resource without text, and for the pages that have no description of their own', async () => {
    // `page-contact` (an empty page), `page-collection-filtered` (`/collections/all`), `page-blog`, `page-cart-empty`, `page-collections`, `page-search` and `page-not-found` print no description meta
    for (const url of ['/pages/contact', '/collections/accessories', '/collections/all', '/products/white-leather-sneakers', '/blogs/news', '/cart', '/collections', '/search?q=shirt', '/search', '/nowhere']) {
      expect([url, await description(url)]).toEqual([url, ''])
    }
  })

  it('is the shop\'s description on the home page, in the language of the page', async () => {
    // recordings `page-home` and `page-home-fr-ca`
    expect(await description('/')).toBe('Everyday clothing, made well.')
    expect(await description('/fr-ca')).toBe('Des vêtements du quotidien, bien faits.')
    expect(await description('/', { ...data, shop: { ...data.shop, description: '' } })).toBe('')
  })

  it('is plain text: entities decoded, script and style blocks left out', async () => {
    const store: StoreData = { ...data, products: [{ ...product('hoodie'), description: '<p>Salt &amp; pepper, it&#39;s &quot;fine&quot;&nbsp;now &lt;3 &#x41;</p><style>p{}</style><script>x()</script>' }] }
    // the layout's own `escape` is the one place the text is escaped again
    expect(await print('/products/hoodie', '[{{ page_description }}]|{{ page_description | escape }}', store)).toBe('[Salt & pepper, it\'s "fine" now <3 A]|Salt &amp; pepper, it&#39;s &quot;fine&quot; now &lt;3 A')
  })

  it('counts characters, not UTF-16 units, so the 320th does not split an emoji', async () => {
    const store: StoreData = { ...data, products: [{ ...product('hoodie'), description: `<p>${'😀'.repeat(400)}</p>` }] }
    expect(Array.from(await description('/products/hoodie', store))).toHaveLength(320)
  })
})

describe('page_title', () => {
  // recordings `page-cart-empty`, `page-collections`, `page-not-found` and `page-search` print these titles; the other templates print their resource's title (or the shop's name on the home page), as before
  it('names the templates that have no resource', async () => {
    expect(await print('/cart', '{{ page_title }}')).toBe('Your Shopping Cart')
    expect(await print('/collections', '{{ page_title }}')).toBe('Collections')
    expect(await print('/nowhere', '{{ page_title }}')).toBe('404 Not Found')
    expect(await print('/', '{{ page_title }}')).toBe('Debutify Parity')
    expect(await print('/products/hoodie', '{{ page_title }}')).toBe('Hoodie')
    expect(await print('/blogs/news', '{{ page_title }}')).toBe('News')
  })

  it('gives the search page the number of results and the term, the term escaped as the recorded `<title>` prints it', async () => {
    // `Search: 5 results found for &quot;shirt&quot;` in both `<title>` and `og:title` (the layout escapes it again and Shopify leaves it as it is)
    const layout = '{{ search.results_count }}|{{ page_title }}|{{ page_title | escape }}|{{ page_title | default: shop.name }}|{% if page_title contains "results found" %}contains{% endif %}'
    const [count, title, escaped, defaulted, contains] = (await print('/search?q=shirt', layout)).split('|')
    expect(Number(count)).toBeGreaterThan(1)
    expect([title, escaped, defaulted, contains]).toEqual([`Search: ${count} results found for &quot;shirt&quot;`, `Search: ${count} results found for &quot;shirt&quot;`, `Search: ${count} results found for &quot;shirt&quot;`, 'contains'])
  })

  it('escapes a search term that holds markup, and counts none and one', async () => {
    expect(await print('/search?q=%3Cqzx%3E', '{{ page_title }}')).toBe('Search: 0 results found for &quot;&lt;qzx&gt;&quot;')
    // English pluralisation; the recordings hold only five results
    expect(await print('/search?q=sweatpants', '{{ search.results_count }}|{{ page_title }}')).toBe('1|Search: 1 result found for &quot;sweatpants&quot;')
  })

  it('is just "Search" without a term', async () => {
    expect(await print('/search', '{{ page_title }}')).toBe('Search')
    expect(await print('/search?q=', '{{ page_title }}')).toBe('Search')
  })
})

describe('canonical_url', () => {
  // recording `page-search`: `rel="canonical"` and `og:url` are `/search?q=shirt`; every other page recorded has the path alone (`page-collection-filtered`, `page-product-variant`)
  it('keeps the search term', async () => {
    expect(await print('/search?q=shirt', '{{ canonical_url }}')).toBe(`https://${data.shop.domain}/search?q=shirt`)
    expect(await print('/fr-ca/search?q=red+shirt&type=product', '{{ canonical_url }}')).toBe(`https://${data.shop.domain}/fr-ca/search?q=red+shirt`)
    expect(await print('/search?q=a%22b%3Cc', '{{ canonical_url }}')).toBe(`https://${data.shop.domain}/search?q=a%22b%3Cc`)
  })

  it('has no query on a search without a term, or on any other page', async () => {
    expect(await print('/search', '{{ canonical_url }}')).toBe(`https://${data.shop.domain}/search`)
    expect(await print('/search?q=', '{{ canonical_url }}')).toBe(`https://${data.shop.domain}/search`)
    expect(await print('/products/hoodie?variant=67774841192747&q=x', '{{ canonical_url }}')).toBe(`https://${data.shop.domain}/products/hoodie`)
    expect(await print('/collections/all?filter.v.availability=1&sort_by=price-ascending', '{{ canonical_url }}')).toBe(`https://${data.shop.domain}/collections/all`)
  })
})

describe('page_image', () => {
  // https://shopify.dev/docs/api/liquid/objects/page_image: "The resource's featured image for product and collection pages, and blog posts, is used", otherwise the store's social sharing image (the data holds none). Recordings `page-product*` and `page-collection` print og:image, og:image:secure_url, og:image:width and og:image:height for it; `page-product-variant` prints the product's own image with a variant selected; `page-collection-filtered` (`/collections/all`, which has no image), `page-page`, `page-blog`, `page-article` (no image in the data) and the rest print none.
  const show = '{{ page_image.src }}|{{ page_image.width }}|{{ page_image.height }}'

  it('is a product\'s featured image', async () => {
    const first = product('hoodie').images![0]
    expect(await print('/products/hoodie', show)).toBe(`${first.src}|4096|4096`)
    expect(await print('/products/hoodie?variant=67774841192747', show)).toBe(`${first.src}|4096|4096`)
    expect(await print('/en-eu/products/hoodie', show)).toBe(`${first.src}|4096|4096`)
    expect(await print('/products/frontpack', show)).toBe(`${product('frontpack').images![0].src}|4096|4096`)
  })

  it('is a collection\'s own image', async () => {
    const image = data.collections!.find(c => c.handle === 'tops')!.image!
    expect(await print('/collections/tops', show)).toBe(`${image.src}|1024|1024`)
    expect(await print('/collections/tops?sort_by=price-ascending', show)).toBe(`${image.src}|1024|1024`)
  })

  it('is an article\'s image when it has one', async () => {
    const image = { src: 'https://cdn.example/a.jpg', width: 800, height: 600 }
    const store: StoreData = { ...data, blogs: data.blogs!.map(blog => ({ ...blog, articles: blog.articles.map(article => article.handle === 'making-liquid' ? { ...article, image } : article) })) }
    expect(await print('/blogs/news/making-liquid', show, store)).toBe('https://cdn.example/a.jpg|800|600')
    expect(await print('/blogs/news/new-line-of-tennis-products', show, store)).toBe('||')
  })

  it('is nothing for a product without images, a collection without an image, and every other page', async () => {
    const store: StoreData = { ...data, products: [{ ...product('hoodie'), images: [] }] }
    expect(await print('/products/hoodie', show, store)).toBe('||')
    for (const url of ['/', '/collections/all', '/pages/about', '/blogs/news', '/blogs/news/making-liquid', '/cart', '/collections', '/search?q=shirt', '/nowhere']) {
      expect([url, await print(url, `[${show}]`)]).toEqual([url, '[||]'])
    }
  })
})

describe('shop.secure_url', () => {
  // recordings `page-home-fr-ca` and `page-product-en-eu`: `new URL("https://<host>/en-ca")` on the French page of the Canada market, `/en-eu` on the Europe market's; the primary market's pages print the host alone (`page-home`, `page-product`). It is the market's root in its default language, not the page's language.
  const origin = `https://${data.shop.domain}`

  it('carries the root of the market, in its default language', async () => {
    expect(await print('/', '{{ shop.secure_url }}')).toBe(origin)
    expect(await print('/fr-ca', '{{ shop.secure_url }}')).toBe(`${origin}/en-ca`)
    expect(await print('/en-ca', '{{ shop.secure_url }}')).toBe(`${origin}/en-ca`)
    expect(await print('/en-eu/products/hoodie', '{{ shop.secure_url }}')).toBe(`${origin}/en-eu`)
    expect(await print('/fr-eu', '{{ shop.secure_url }}')).toBe(`${origin}/en-eu`)
  })

  it('is the primary market\'s host alone on its other languages, and for a store with one market', async () => {
    const twoLanguages: StoreData = { ...data, markets: data.markets!.map(market => market.primary ? { ...market, languages: ['en', 'fr'] } : market) }
    expect(await print('/fr', '{{ shop.secure_url }}', twoLanguages)).toBe(origin)
    expect(await print('/', '{{ shop.secure_url }}', { shop: { name: 'One', domain: 'one.example', currency: 'USD' } })).toBe('https://one.example')
  })

  it('is the root of a market whose default language is not English', async () => {
    const other: StoreData = {
      shop: { name: 'Other', domain: 'other.example', currency: 'GBP', locale: 'en' },
      markets: [
        { handle: 'uk', name: 'United Kingdom', primary: true, countries: [{ iso_code: 'GB', name: 'United Kingdom' }], currency: { iso_code: 'GBP', symbol: '£', rate: 1 }, languages: ['en'] },
        { handle: 'de', name: 'Germany', countries: [{ iso_code: 'DE', name: 'Germany' }], currency: { iso_code: 'EUR', symbol: '€', rate: 1.17 }, languages: ['de', 'en'], subfolder: 'de' }
      ],
      languages: [{ iso_code: 'en', name: 'English', endonym_name: 'English' }, { iso_code: 'de', name: 'German', endonym_name: 'Deutsch' }]
    }
    expect(await print('/en-de', '{{ shop.secure_url }}', other)).toBe('https://other.example/de-de')
    expect(await print('/', '{{ shop.secure_url }}', other)).toBe('https://other.example')
  })
})

describe('shop.money_format', () => {
  // recording `page-product-en-eu`: `data-money-format=" €{{amount_with_comma_separator}}"` on the Europe market's page, where the primary market's pages print `${{amount}}` (`page-product`). The money filters already print in the market's currency; only the shop's own formats stayed the shop's.
  const layout = '{{ shop.money_format }}|{{ shop.money_with_currency_format }}|{{ 1999 | money_without_currency }}'

  it('follows the currency of the market', async () => {
    expect(await print('/', layout)).toBe('${{amount}}|${{amount}} USD|19.99') // eslint-disable-line no-template-curly-in-string
    expect(await print('/en-eu/products/hoodie', layout)).toBe('€{{amount_with_comma_separator}}|€{{amount_with_comma_separator}} EUR|19,99')
    expect(await print('/en-ca', layout)).toMatch(/^\$\{\{amount\}\}\|\$\{\{amount\}\} CAD\|/) // eslint-disable-line no-template-curly-in-string
  })

  it('keeps the formats a market gives, and a store without markets as it was', async () => {
    const own = { ...data, markets: data.markets!.map(market => market.handle === 'eu' ? { ...market, currency: { ...market.currency, money_format: '{{amount}} €', money_with_currency_format: '{{amount}} € EUR' } } : market) }
    expect(await print('/en-eu', '{{ shop.money_format }}|{{ shop.money_with_currency_format }}', own)).toBe('{{amount}} €|{{amount}} € EUR')
    const single: StoreData = { shop: { name: 'One', domain: 'one.example', currency: 'GBP', money_format: '£{{amount}}', money_with_currency_format: '£{{amount}} GBP' } }
    expect(await print('/', '{{ shop.money_format }}|{{ shop.money_with_currency_format }}', single)).toBe('£{{amount}}|£{{amount}} GBP')
  })
})

describe('default on HTML-safe markup', () => {
  // the theme that recorded `page-search` does `assign og_title = page_title | default: shop.name` and prints `{{ og_title | escape }}`: the title keeps its `&quot;` through both, as Shopify's HTML-safe string does
  it('keeps the search title HTML-safe through default and assign, so escape leaves it', async () => {
    const layout = '{% assign og_title = page_title | default: shop.name %}{{ og_title | escape }}|{{ "a&b" | default: "x" | escape }}|{{ nothing | default: "<b>" | escape }}'
    expect(await print('/search?q=shirt', layout)).toMatch(/^Search: \d+ results found for &quot;shirt&quot;\|a&amp;b\|&lt;b&gt;$/)
  })
})
