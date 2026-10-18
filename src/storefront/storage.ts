import type { Fields } from './body'
import type { Context, RouteHandler } from './handler'
import type { VisitorState } from './types'

type Storage = NonNullable<VisitorState['storage']>

/** The most names one storage keeps; the body limit holds the sizes. */
const MAX_NAMES = 500

/** The names and values of `value` that are text, at most `MAX_NAMES` of them; anything else is not a storage and gives none. A name is a data property of a null-prototype object, so no name can reach a prototype. */
function entries (value: unknown): Record<string, string> {
  const out: Record<string, string> = Object.create(null)
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return out
  let count = 0
  for (const [name, item] of Object.entries(value)) {
    if (typeof item !== 'string' || count >= MAX_NAMES) continue
    out[name] = item
    count++
  }
  return out
}

/** The storage a request body carries, `{ local: {…}, session: {…} }`. */
export function storageOf (fields: Fields): Storage {
  return { local: { ...entries(fields.local) }, session: { ...entries(fields.session) } }
}

/**
 * `POST /storefront-storage`: the client script of a sandboxed page saves the page's `localStorage` and `sessionStorage` here, so the next page of the visitor starts with them (`storefrontClientScript`). Both are replaced whole, the last post wins, and the answer is 204 with no body. A page that is not sandboxed has real storage and no use for the route, so it answers as an unknown address does, 404, and so does a request made without the sandbox's visitor.
 */
export const storage: RouteHandler = async (ctx: Context) => {
  if (!ctx.sandbox) return { response: new Response('', { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } }), fragment: true }
  return { response: new Response(null, { status: 204 }), state: { ...ctx.visitor, storage: storageOf(ctx.fields) }, fragment: true }
}

export const STORAGE_HANDLERS: Partial<Record<'storage', RouteHandler>> = { storage }
