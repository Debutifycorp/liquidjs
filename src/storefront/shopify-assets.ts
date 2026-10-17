import { QRCODE_LIBRARY, QRCODE_NOTICE } from './qrcode-vendor'

interface Asset {
  type: string
  body: string
  length: string
  etag: string
}

// The three files that the gift card templates of the private theme, Horizon and Dawn load through `shopify_asset_url` (https://shopify.dev/docs/api/liquid/filters/shopify_asset_url: "returns the CDN URL for a global asset", a file Shopify hosts for every theme). Shopify serves them from hashed addresses under `/cdn/shopifycloud/storefront/assets/` that cannot be known ahead of time, so the storefront answers `<base path>/shopify-assets/<path>` itself, with stand-ins by design: the MIT library Shopify's `vendor/qrcode.js` is, and art of Debutify's own for the two images.

/** A neutral gift card, 570 by 380 as the themes' `<img>` is (Dawn and the private theme print `height="{{ 570 | divided_by: 1.5 }}"`): a soft card with a ribbon across it and a bow. */
const CARD_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="570" height="380" viewBox="0 0 570 380">',
  '<defs><clipPath id="card"><rect width="570" height="380" rx="28"/></clipPath></defs>',
  '<rect width="570" height="380" rx="28" fill="#eceff1"/>',
  '<g clip-path="url(#card)">',
  '<rect x="245" width="80" height="380" fill="#cfd8dc"/>',
  '<rect y="150" width="570" height="80" fill="#b0bec5"/>',
  '<rect x="245" y="150" width="80" height="80" fill="#a2b2ba"/>',
  '</g>',
  '<path d="M285 190C250 110 170 80 165 130C160 175 240 200 285 190Z" fill="#78909c"/>',
  '<path d="M285 190C320 110 400 80 405 130C410 175 330 200 285 190Z" fill="#78909c"/>',
  '<path d="M285 190C255 125 195 105 191 135C188 165 245 190 285 190Z" fill="#90a4ae"/>',
  '<path d="M285 190C315 125 375 105 379 135C382 165 325 190 285 190Z" fill="#90a4ae"/>',
  '<rect x="259" y="164" width="52" height="52" rx="14" fill="#607d8b"/>',
  '<rect x="40" y="318" width="120" height="10" rx="5" fill="#cfd8dc"/>',
  '<rect x="40" y="338" width="72" height="10" rx="5" fill="#cfd8dc"/>',
  '</svg>'
].join('')

/** A neutral stand-in for the "Add to Apple Wallet" badge, 120 by 40 as the themes' `<img>` is, reading its words in plain text; it is not Apple's artwork. */
const WALLET_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40" viewBox="0 0 120 40">',
  '<title>Add to Apple Wallet</title>',
  '<rect x=".5" y=".5" width="119" height="39" rx="6" fill="#111" stroke="#8a8a8a"/>',
  '<text x="60" y="25" fill="#fff" font-family="system-ui,-apple-system,Helvetica,Arial,sans-serif" font-size="11" text-anchor="middle">Add to Apple Wallet</text>',
  '</svg>'
].join('')

/** FNV-1a of the text, in hex: the validator of a file that changes only with the package. */
function fingerprint (text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193)
  return (hash >>> 0).toString(16)
}

function asset (type: string, body: string): Asset {
  const length = new TextEncoder().encode(body).length
  return { type, body, length: String(length), etag: `"${fingerprint(body)}-${length}"` }
}

const ASSETS = new Map<string, Asset>([
  ['vendor/qrcode.js', asset('application/javascript; charset=utf-8', QRCODE_NOTICE + QRCODE_LIBRARY)],
  ['gift-card/card.svg', asset('image/svg+xml', CARD_SVG)],
  ['gift-card/add-to-apple-wallet.svg', asset('image/svg+xml', WALLET_SVG)]
])

/** The files are not addressed by a hash, so they are kept for a week and checked with their validator after it, not `immutable`. */
export const ASSET_CACHE = 'public, max-age=604800'

const SECURITY = { 'x-content-type-options': 'nosniff' }

/** Whether the request's `If-None-Match` names `etag` (a weak form or `*` too). */
function held (request: Request, etag: string): boolean {
  const given = request.headers.get('if-none-match')
  return given !== null && given.split(',').some(tag => { const bare = tag.trim().replace(/^W\//, ''); return bare === '*' || bare === etag })
}

/** The answer for `GET <base path>/shopify-assets/<path>`: the file with its type, a week's cache, its validator and `nosniff`, a 304 for a request that holds it, and 404 for any path that is not one of the three. */
export function shopifyAssetResponse (path: string, request: Request): Response {
  const found = ASSETS.get(path)
  if (!found) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', ...SECURITY } })
  const headers = { etag: found.etag, 'cache-control': ASSET_CACHE, ...SECURITY }
  if (held(request, found.etag)) return new Response(null, { status: 304, headers })
  return new Response(found.body, { headers: { ...headers, 'content-type': found.type, 'content-length': found.length } })
}
