import { createShopifyLiquid, renderLiquid, renderPage, requestFromUrl, storefrontSampleData } from '../../src/shopify'
import type { StoreData } from '../../src/shopify'
import { buildLinklists, buildStore } from '../../src/shopify/store/build'

const THEME = { 'config/settings_schema.json': '[]', 'config/settings_data.json': '{"current":{}}', 'layout/theme.liquid': '{{ content_for_layout }}' }

/** Renders `source` as the page of `url` (or the `index` page) over `data`, with an inline template: the storefront's own pipeline, on the public dataset. */
async function render (source: string, url = '/', data: StoreData = storefrontSampleData): Promise<string> {
  const page = requestFromUrl(url, data)
  const { html } = await renderPage({ theme: { files: { ...THEME, [`templates/${page.templateName}.liquid`]: source } }, templateName: page.templateName, data, request: page.request, locale: page.locale })
  return html
}

const withData = (change: (data: StoreData) => void): StoreData => {
  const data = structuredClone(storefrontSampleData) as StoreData
  change(data)
  return data
}

const variant = (id: number, title: string) => ({ id, title, price: 1000, available: true, option1: title })
const product = (id: number, handle: string, title: string, extra: object = {}) => ({ id, handle, title, variants: [variant(id * 10, 'Default Title')], ...extra })

describe('image alt (rows 21; scenarios page-product and page-collections)', () => {
  it('falls back to the product title for a product image without alt text, as the parity store prints the cards of every page', async () => {
    const out = await render('{% assign p = all_products.hoodie %}{{ p.featured_image.alt }}|{{ p.featured_media.alt }}|{{ p.images[1].alt }}|{{ p.media[2].alt }}|{{ all_products.beanie.featured_media.alt }}')
    expect(out).toBe('Hoodie|Hoodie|Hoodie|Hoodie|Beanie')
  })

  it('reads the title for a variant\'s image too, and leaves the preview image of a media bare (scenario page-product: the modal\'s variant media prints the title, the gallery\'s image_tag of media.preview_image prints alt="")', async () => {
    expect(await render('{% assign v = all_products.hoodie.variants[0] %}[{{ v.featured_image.alt }}][{{ v.image.alt }}][{{ v.featured_media.alt }}][{{ v.featured_media.preview_image.alt }}][{{ all_products.hoodie.featured_media.preview_image.alt }}][{{ all_products.hoodie.media[1].preview_image.alt }}]')).toBe('[Hoodie][Hoodie][Hoodie][][][]')
    expect(await render('{{ all_products.hoodie.featured_media.preview_image | image_url: width: 300 | image_tag }}|{{ all_products.hoodie.featured_media | image_url: width: 300 | image_tag }}')).toMatch(/^<img src="[^"]*" alt="" [^|]*\|<img src="[^"]*" alt="Hoodie" /)
  })

  it('shows the first matching variant\'s media as the bare image in a collection filtered by variant, with alt="" (scenario page-collection-filtered)', async () => {
    const out = await render('{% for p in collection.products %}{{ p.handle }}[{{ p.featured_media.alt }}] {% endfor %}', '/collections/all?filter.v.availability=1&filter.p.product_type=Shoes&sort_by=price-ascending')
    expect(out).toBe('gray-runners[Gray Runners] canvas-sneakers[Canvas Sneakers] white-leather-sneakers[White Leather Sneakers] high-top-sneakers[] gray-leather-sneakers[Gray Leather Sneakers] ')
  })

  it('keeps the alt text an image has', async () => {
    const data = withData(d => {
      d.products = [product(1, 'lamp', 'Lamp', { images: [{ src: '/a.jpg', alt: 'Lamp, lit' }, { src: '/b.jpg' }] })]
    })
    expect(await render('{{ all_products.lamp.images[0].alt }}|{{ all_products.lamp.images[1].alt }}', '/', data)).toBe('Lamp, lit|Lamp')
  })

  it('takes the title in the language of the page', async () => {
    const out = await render('{{ all_products.hoodie.featured_image.alt }}', '/fr-ca/', storefrontSampleData)
    expect(out).toBe('Sweat à capuche')
  })

  it('leaves the alt of images that belong to no product empty', async () => {
    expect(await render('{{ collections.tops.image.alt }}|{{ collections.tops.featured_image.alt }}')).toBe('|')
  })

  it('keeps the alt of a product in JSON null when it has none, with the title only in Liquid', async () => {
    const out = JSON.parse(await render('{{ all_products.hoodie | json }}')) as { media: Array<{ alt: unknown }>, variants: Array<{ featured_image: { alt: unknown }, featured_media: { alt: unknown } }> }
    expect(out.media[0].alt).toBeNull()
    expect(out.variants[0].featured_image.alt).toBeNull()
    expect(out.variants[0].featured_media.alt).toBeNull()
  })
})

describe('the default order of a collection (row 22; scenarios page-home, page-cart-empty)', () => {
  const handles = '{% for p in collection.products %}{{ p.handle }},{% endfor %}'

  it('lists collections.all in its default order, by title, wherever it is read', async () => {
    const out = await render('{% for p in collections.all.products limit: 4 %}{{ p.handle }},{% endfor %}|{% for p in collections["all"].products %}{{ p.title }}~{% endfor %}')
    const [first, titles] = out.split('|')
    expect(first).toBe('beanie,black-sunnies,canvas-sneakers,clear-sunnies,')
    const collator = new Intl.Collator('en')
    expect(titles.split('~').slice(0, -1).map(title => title.replace('&#39;', "'"))).toEqual((storefrontSampleData.products ?? []).map(p => p.title).sort(collator.compare))
  })

  it('lists a collection in its own default order: best selling puts the newest first when nothing sold', async () => {
    const data = withData(d => {
      d.products = [product(1, 'a', 'A', { created_at: '2020-01-01T00:00:00Z' }), product(2, 'b', 'B', { created_at: '2022-01-01T00:00:00Z' }), product(3, 'c', 'C', { created_at: '2021-01-01T00:00:00Z' })]
      d.collections = [{ id: 1, handle: 'sold', title: 'Sold', sort_order: 'best-selling', products: ['a', 'b', 'c'] }, { id: 2, handle: 'cheap', title: 'Cheap', sort_order: 'title-descending', products: ['a', 'b', 'c'] }, { id: 3, handle: 'hand', title: 'Hand', products: ['c', 'a', 'b'] }]
    })
    expect(await render('{% for p in collections.sold.products %}{{ p.handle }},{% endfor %}|{% for p in collections.cheap.products %}{{ p.handle }},{% endfor %}|{% for p in collections.hand.products %}{{ p.handle }},{% endfor %}', '/', data)).toBe('b,c,a,|c,b,a,|c,a,b,')
  })

  it('keeps the collection page\'s own sort: the data order is the manual one', async () => {
    const data = withData(d => {
      d.collections = [{ id: 1, handle: 'sold', title: 'Sold', sort_order: 'best-selling', products: ['hoodie', 'beanie', 'slides'] }]
    })
    expect(await render(handles, '/collections/sold?sort_by=manual', data)).toBe('hoodie,beanie,slides,')
    expect(await render(handles, '/collections/sold?sort_by=title-ascending', data)).toBe('beanie,hoodie,slides,')
    expect(await render(`${handles}|{{ collection.default_sort_by }}|{{ collection.sort_by }}`, '/collections/sold', data)).toBe('hoodie,beanie,slides,|best-selling|')
  })

  it('keeps the all collection\'s page order', async () => {
    expect(await render('{% for p in collection.products limit: 3 %}{{ p.handle }},{% endfor %}', '/collections/all')).toBe('beanie,black-sunnies,canvas-sneakers,')
    expect(await render('{% for p in collection.products limit: 3 %}{{ p.handle }},{% endfor %}', '/collections/all?sort_by=manual')).toBe('beanie,black-sunnies,canvas-sneakers,')
  })
})

describe('the collections list (row 23; scenario page-collections)', () => {
  it('lists collections alphabetically by title, with the Home page collection of the parity store', async () => {
    const out = await render('{% for c in collections %}{{ c.handle }}={{ c.title }},{% endfor %}{{ collections.size }}|{{ collections.frontpage.url }}|{{ collections.frontpage.products_count }}')
    expect(out).toBe('accessories=Accessories,bottoms=Bottoms,featured=Featured,frontpage=Home page,men=Men,shoes=Shoes,tops=Tops,unisex=Unisex,women=Women,9|/collections/frontpage|0')
  })

  it('sorts a store\'s collections by title whatever order its data has, without case, and keeps the implicit all collection out of the list', async () => {
    const data = withData(d => {
      d.products = [product(1, 'a', 'A')]
      d.collections = [{ id: 1, handle: 'z', title: 'zebra', products: [] }, { id: 2, handle: 'm', title: 'Mid', products: ['a'] }, { id: 3, handle: 'a', title: 'Apple', products: [] }]
    })
    expect(await render('{% for c in collections %}{{ c.handle }},{% endfor %}{{ collections.size }}|{{ collections.all.products_count }}', '/', data)).toBe('a,m,z,3|1')
  })

  it('does not invent a Home page collection the data does not have: a store may delete it, so it belongs to the sample data', () => {
    const data = withData(d => {
      d.collections = [{ id: 1, handle: 'only', title: 'Only', products: [] }]
    })
    expect([...buildStore(data).collections].map(c => c.handle)).toEqual(['only'])
  })
})

describe('blog articles (row 24; scenario page-blog)', () => {
  it('lists articles newest first', async () => {
    expect(await render('{% for a in blogs.news.articles %}{{ a.handle }},{% endfor %}{{ blogs.news.articles_count }}')).toBe('liquidpeak-450,new-line-of-tennis-products,making-liquid,3')
  })

  it('sorts by the time an article holds whatever its UTC offset, keeps the order of articles published at the same time, and puts one with no date last', async () => {
    const article = (id: number, handle: string, publishedAt: string) => ({ id, handle, title: handle, content: '', published_at: publishedAt })
    const data = withData(d => {
      d.blogs = [{ id: 1, handle: 'b', title: 'B', articles: [article(1, 'old', '2020-01-01T00:00:00Z'), article(2, 'tie-first', '2022-01-01T12:00:00Z'), article(3, 'odd', 'not a date'), article(4, 'offset', '2022-01-01T10:00:00-05:00'), article(5, 'tie-second', '2022-01-01T12:00:00Z')] }]
    })
    expect(await render('{% for a in blogs.b.articles %}{{ a.handle }},{% endfor %}', '/', data)).toBe('offset,tie-first,tie-second,old,odd,')
  })

  it('pages a blog newest first', async () => {
    expect(await render('{% paginate blog.articles by 2 %}{% for a in blog.articles %}{{ a.handle }},{% endfor %}{% endpaginate %}', '/blogs/news')).toBe('liquidpeak-450,new-line-of-tennis-products,')
  })
})

describe('menu links (row 26; scenarios page-collection, page-collection-filtered, page-article)', () => {
  const lists = [{
    handle: 'm',
    title: 'M',
    links: [{ title: 'Collections', url: '/collections' }, { title: 'Tops', url: '/collections/tops' }, { title: 'News', url: '/blogs/news' }, { title: 'Hoodie', url: '/products/hoodie' }]
  }]
  const liquid = createShopifyLiquid()
  const show = async (path: string) => (await renderLiquid(liquid, '{% for l in linklists.m.links %}{{ l.title }}:{{ l.active }}:{{ l.current }} {% endfor %}', { linklists: buildLinklists(lists, path) })).html.trim()

  it('does not mark the collections list active on a collection page, nor on a filtered one', async () => {
    expect(await show('/collections/tops')).toBe('Collections:false:false Tops:true:true News:false:false Hoodie:false:false')
    expect(await show('/collections/tops?filter.v.availability=1&sort_by=price-ascending')).toBe('Collections:false:false Tops:true:true News:false:false Hoodie:false:false')
    expect(await show('/collections/all')).toBe('Collections:false:false Tops:false:false News:false:false Hoodie:false:false')
  })

  it('marks the collections list on its own page, and a blog on its articles', async () => {
    expect(await show('/collections')).toBe('Collections:true:true Tops:false:false News:false:false Hoodie:false:false')
    expect(await show('/blogs/news/liquidpeak-450')).toBe('Collections:false:false Tops:false:false News:true:false Hoodie:false:false')
  })

  it('marks a collection active on a product reached through it', async () => {
    expect(await show('/collections/tops/products/hoodie')).toBe('Collections:false:false Tops:true:false News:false:false Hoodie:true:true')
  })
})

describe('variants as JSON (row 27; scenarios page-product, page-product-variant)', () => {
  const SHOPIFY_KEYS = ['id', 'title', 'option1', 'option2', 'option3', 'sku', 'requires_shipping', 'taxable', 'featured_image', 'available', 'name', 'public_title', 'options', 'price', 'weight', 'compare_at_price', 'inventory_management', 'barcode', 'featured_media', 'requires_selling_plan', 'selling_plan_allocations', 'quantity_rule']

  it('prints the keys and order of the parity store, which are those of the variants in product | json', async () => {
    const variants = JSON.parse(await render('{{ all_products.hoodie.variants | json }}')) as Array<Record<string, unknown>>
    const inProduct = (JSON.parse(await render('{{ all_products.hoodie | json }}')) as { variants: unknown[] }).variants
    expect(variants).toHaveLength(inProduct.length)
    expect(Object.keys(variants[0])).toEqual(SHOPIFY_KEYS)
    expect(JSON.stringify(variants)).toBe(JSON.stringify(inProduct))
    expect(variants[0].sku).toBeNull()
    expect(Object.keys(variants[0].featured_image as object)).toEqual(['id', 'product_id', 'position', 'created_at', 'updated_at', 'alt', 'width', 'height', 'src', 'variant_ids'])
  })

  it('prints a single variant the same way, also the selected one, with no back reference', async () => {
    const variant = JSON.parse(await render('{{ product.selected_or_first_available_variant | json }}', '/products/hoodie?variant=43695847538710')) as Record<string, unknown>
    expect(Object.keys(variant)).toEqual(SHOPIFY_KEYS)
    expect(variant.id).toBe(43695847538710)
  })

  it('never prints the internal data key of an image', async () => {
    const out = await render('{{ all_products.hoodie.variants | json }}|{{ all_products.hoodie.featured_image | json }}|{{ all_products.hoodie.media | json }}|{{ all_products.hoodie.images | json }}|{{ all_products.hoodie.variants[0].featured_media | json }}|{{ images | json }}')
    expect(out).not.toContain('"data"')
    expect(JSON.parse(out.split('|')[1])).toMatchObject({ src: expect.stringContaining('https://') })
  })

  it('leaves a product page\'s variants alone', async () => {
    const out = await render('{{ product.variants | json }}', '/products/hoodie?variant=43695847538710')
    const variants = JSON.parse(out) as Array<Record<string, unknown>>
    expect(variants.map(v => v.id)).toContain(43695847538710)
    expect(Object.keys(variants[0])).toEqual(SHOPIFY_KEYS)
  })
})

describe('enabled payment types (row 33; every page scenario)', () => {
  it('lists the six card types the parity store accepts, in its order', async () => {
    expect(await render('{{ shop.enabled_payment_types | join: "," }}')).toBe('visa,master,american_express,paypal,diners_club,discover')
  })

  it('has none for a store whose data names none: which types a store accepts depends on its payments setup', async () => {
    const data = withData(d => {
      delete d.shop.enabled_payment_types
    })
    expect(await render('[{{ shop.enabled_payment_types | join: "," }}]', '/', data)).toBe('[]')
  })

  it('draws an icon for each', async () => {
    const out = await render('{% for type in shop.enabled_payment_types %}{{ type | payment_type_svg_tag }}{% endfor %}')
    for (const type of ['visa', 'master', 'american_express', 'paypal', 'diners_club', 'discover']) expect(out).toContain(`aria-labelledby="pi-${type}"`)
  })
})
