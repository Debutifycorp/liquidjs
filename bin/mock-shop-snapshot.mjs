#!/usr/bin/env node
// Writes src/shopify/sample/mock-shop.ts: a snapshot of Shopify's mock.shop `demostore` catalogue (https://mock.shop), the default apparel sample of its auth-free Storefront API. The sample datasets build on it. Run it again only to take a new snapshot; the output is committed, so tests never reach the network.
//
//   node bin/mock-shop-snapshot.mjs
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const API = 'https://mock.shop/api'
const HOST = 'https://demostore.hydrogen.mock.shop'
const OUT = fileURLToPath(new URL('../src/shopify/sample/mock-shop.ts', import.meta.url))

const QUERY = `{
  products(first: 100, sortKey: ID) { edges { node { id handle title descriptionHtml vendor productType tags createdAt publishedAt
    options { name }
    images(first: 30) { edges { node { id url altText width height } } }
    variants(first: 100) { edges { node { id title sku price { amount } compareAtPrice { amount } availableForSale quantityAvailable selectedOptions { name value } image { id } } } }
  } } }
  collections(first: 50) { edges { node { id handle title descriptionHtml image { id url altText width height } products(first: 100) { edges { node { handle } } } } } }
  pages(first: 50) { edges { node { id handle title body createdAt } } }
  blogs(first: 10) { edges { node { id handle title articles(first: 50) { edges { node { id handle title contentHtml excerptHtml publishedAt tags authorV2 { name } image { id url altText width height } } } } } } }
  main: menu(handle: "main-menu") { handle title items { title url items { title url } } }
  footer: menu(handle: "footer") { handle title items { title url items { title url } } }
}`

const nodes = connection => connection.edges.map(edge => edge.node)
const gidNumber = gid => Number(gid.split('?')[0].split('/').pop())
const cents = amount => Math.round(Number(amount) * 100)
const image = img => img ? { src: img.url, width: img.width, height: img.height, alt: img.altText ?? '', id: gidNumber(img.id) } : null
const path = url => url.startsWith(HOST) ? url.slice(HOST.length) || '/' : url
const link = item => ({ title: item.title, url: path(item.url), ...(item.items?.length ? { links: item.items.map(link) } : {}) })

// A product with its variants as rows, [id, title, option values, price, available, inventory quantity, index of the variant's image in `images` or -1, compare-at price?], so a variant does not repeat its image. The option values are kept apart from the title: Shopify titles a variant by its option values joined with ' / ' as a rule, but not always (the soft cotton hoodies' variants are titled by size alone).
function product (p) {
  const images = nodes(p.images).map(image)
  const options = p.options.map(option => option.name)
  const rows = nodes(p.variants).map(v => {
    const values = options.map(name => v.selectedOptions.find(selected => selected.name === name)?.value)
    if (v.sku) throw new Error(`${p.handle}: variant ${v.title} has a SKU, which the rows do not carry`)
    const row = [gidNumber(v.id), v.title, values, cents(v.price.amount), v.availableForSale, v.quantityAvailable ?? 0, v.image ? images.findIndex(img => img.id === gidNumber(v.image.id)) : -1]
    return v.compareAtPrice ? [...row, cents(v.compareAtPrice.amount)] : row
  })
  return {
    product: { id: gidNumber(p.id), handle: p.handle, title: p.title, description: p.descriptionHtml, vendor: p.vendor, type: p.productType, tags: p.tags, images, options, created_at: p.createdAt, published_at: p.publishedAt },
    rows
  }
}

// TypeScript source for a plain value: single-quoted strings and bare keys where they are identifiers, as the fork's ESLint style wants.
function literal (value, indent = '') {
  const inner = indent + '  '
  if (value === null) return 'null'
  if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`
  if (typeof value !== 'object') return String(value)
  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    const flat = item => item === null || typeof item !== 'object'
    if (value.every(item => flat(item) || (Array.isArray(item) && item.every(flat)))) return `[${value.map(item => literal(item)).join(', ')}]`
    return `[\n${value.map(item => inner + literal(item, inner)).join(',\n')}\n${indent}]`
  }
  const entries = Object.entries(value).map(([key, item]) => `${/^[A-Za-z_$][\w$]*$/.test(key) ? key : literal(key)}: ${literal(item, inner)}`)
  if (!entries.length) return '{}'
  const flat = `{ ${entries.join(', ')} }`
  return flat.length + indent.length <= 160 && !flat.includes('\n') ? flat : `{\n${entries.map(entry => inner + entry).join(',\n')}\n${indent}}`
}

const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Shopify-Storefront-Access-Token': 'public' }, body: JSON.stringify({ query: QUERY }) })
const body = await res.json()
if (body.errors || !body.data) throw new Error(`mock.shop: ${JSON.stringify(body.errors ?? body).slice(0, 500)}`)
const data = body.data

// mock.shop's five "Soft Cotton Hoodie in <colour>" products are the colour children of `hoodie` (a combined listing) and reuse its variant ids. Shopify gives every variant its own id and carts key lines by it, so the ids stay with the product that lists most of them, and every other product's copy gets the next free id above it.
function uniqueVariantIds (products) {
  const owners = new Map()
  for (const entry of products) for (const row of entry.rows) owners.set(row[0], [...(owners.get(row[0]) ?? []), entry])
  const taken = new Set(owners.keys())
  for (const [id, sharers] of owners) {
    if (sharers.length < 2) continue
    const keeper = sharers.reduce((best, entry) => entry.rows.length > best.rows.length ? entry : best)
    for (const entry of sharers) {
      if (entry === keeper) continue
      let next = id + 1
      while (taken.has(next)) next++
      taken.add(next)
      entry.rows.find(row => row[0] === id)[0] = next
    }
  }
  return products
}

const catalog = {
  products: uniqueVariantIds(nodes(data.products).map(product)),
  collections: nodes(data.collections).map(c => ({ id: gidNumber(c.id), handle: c.handle, title: c.title, description: c.descriptionHtml, image: image(c.image), products: nodes(c.products).map(p => p.handle) })),
  pages: nodes(data.pages).map(p => ({ id: gidNumber(p.id), handle: p.handle, title: p.title, content: p.body, published_at: p.createdAt })),
  blogs: nodes(data.blogs).map(b => ({
    id: gidNumber(b.id),
    handle: b.handle,
    title: b.title,
    articles: nodes(b.articles).map(a => ({ id: gidNumber(a.id), handle: a.handle, title: a.title, content: a.contentHtml, ...(a.excerptHtml ? { excerpt: a.excerptHtml } : {}), author: a.authorV2?.name ?? '', published_at: a.publishedAt, tags: a.tags, ...(a.image ? { image: image(a.image) } : {}) }))
  })),
  linklists: [data.main, data.footer].filter(Boolean).map(menu => ({ handle: menu.handle, title: menu.title, links: menu.items.map(link) }))
}

const taken = new Date().toISOString().slice(0, 10)
const rowsOf = catalog.products.map(entry => entry.rows)
const productsSource = catalog.products.map(entry => `    product(${literal(entry.product, '    ')}, [\n${entry.rows.map(row => `      ${literal(row)}`).join(',\n')}\n    ])`).join(',\n')
const rest = { collections: catalog.collections, pages: catalog.pages, blogs: catalog.blogs, linklists: catalog.linklists }
writeFileSync(OUT, `// Generated by bin/mock-shop-snapshot.mjs on ${taken}; do not edit by hand. Run it again for a new snapshot.
import type { ProductData, StoreData } from '../store/types'

/** A variant: [id, title, option values, price, available, inventory quantity, index of its image in the product's \`images\` or -1, compare-at price?]. */
type VariantRow = [number, string, string[], number, boolean, number, number, number?]

/** A product from its fields and variant rows. */
function product (fields: Omit<ProductData, 'variants'>, rows: VariantRow[]): ProductData {
  const images = fields.images ?? []
  return {
    ...fields,
    variants: rows.map(([id, title, values, price, available, quantity, image, compareAtPrice]) => {
      return { id, title, price, ...(compareAtPrice === undefined ? {} : { compare_at_price: compareAtPrice }), available, option1: values[0] ?? null, option2: values[1] ?? null, option3: values[2] ?? null, image: images[image] ?? null, inventory_quantity: quantity }
    })
  }
}

/**
 * Shopify's mock.shop \`demostore\` catalogue (https://mock.shop, the default apparel sample of its auth-free Storefront API), as taken on ${taken}: every product with its variants and images, every collection, page, blog article and the main and footer menus. Images stay on Shopify's CDN (\`cdn.shopify.com\`), which serves every \`?width=\` the \`image_url\` filter asks for. Prices are the catalogue's amounts in the minor unit; the store's own currency is the caller's. Product types are empty and every vendor is \`Mock.shop\`, as in the catalogue.
 */
export const mockShopCatalog: Required<Pick<StoreData, 'products' | 'collections' | 'pages' | 'blogs' | 'linklists'>> = {
  products: [
${productsSource}
  ],
${Object.entries(rest).map(([key, value]) => `  ${key}: ${literal(value, '  ')}`).join(',\n')}
}
`)
console.log(`${OUT}: ${catalog.products.length} products, ${rowsOf.flat().length} variants, ${catalog.collections.length} collections, ${catalog.pages.length} pages, ${catalog.blogs.reduce((n, b) => n + b.articles.length, 0)} articles, ${catalog.linklists.length} menus`)
