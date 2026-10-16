import { PRIVATE } from './support'

const escape = (text: string) => text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)

const page = (status: number, title: string, body: string) => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title><style>body{font:16px/1.5 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;padding:24px;box-sizing:border-box;text-align:center}a{color:inherit}</style></head><body><main>${body}</main></body></html>`, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': PRIVATE } })

/** The page checkout and the account pages answer with: status 200, "Available in your own store", and a link back. It loads no theme files. */
export function noticePage (kind: 'checkout' | 'account', back: string): Response {
  const what = kind === 'checkout' ? 'Checkout' : 'Customer accounts'
  return page(200, 'Available in your own store', `<h1>Available in your own store</h1><p>${escape(what)} work once this store is published on Shopify.</p><p><a href="${escape(back)}">Back to the store</a></p>`)
}

/** The answer when a render fails: a plain page with status 500 that loads no theme files and shows no detail. */
export const errorPage = () => page(500, 'Something went wrong', '<h1>Something went wrong</h1><p>This page could not be shown.</p>')

/** The answer for an address the store does not serve when the theme cannot show its own `404` template (it has none, or it fails to render): a plain page with status 404 that loads no theme files. */
export const notFoundPage = (back: string) => page(404, 'Page not found', `<h1>Page not found</h1><p>The page you were looking for does not exist.</p><p><a href="${escape(back)}">Back to the store</a></p>`)

/** A cart form error, shown as Shopify shows one on its own page: the description and a link back. */
export const cartErrorPage = (status: number, description: string, back: string) => page(status, 'Cart error', `<h1>Cart error</h1><p>${escape(description)}</p><p><a href="${escape(back)}">Back</a></p>`)
