export type Fields = Record<string, unknown>

export class BodyError extends Error {
  public constructor (public readonly status: 400 | 413, message: string) {
    super(message)
    this.name = 'BodyError'
  }
}

const UNSAFE = new Set(['__proto__', 'constructor', 'prototype'])

// the names whose numeric parts are keys, not positions: `updates[<variant id>]` (https://shopify.dev/docs/api/ajax/reference/cart: "If you use the variant ID, then the key can be either an integer or a string"), and the free-form names of `properties` and `attributes`
const KEYED = new Set(['updates', 'properties', 'attributes'])

const INDEX = /^\d{1,9}$/
const MAX_PARTS = 5
const NAME = /^([^[\]]+)((?:\[[^[\]]*\])*)$/

const conflict = () => new BodyError(400, 'The request body names one field both as a value and as a group of fields.')

class Branch {
  public readonly entries = new Map<string, Branch | string>()
  public appended = false
  public next = 0
}

/** The parts of a bracket name: `items[0][id]` is `items`, `0`, `id`; `updates[]` is `updates`, ``. Undefined for a name it cannot read, one of more than five parts, or one with a part that could reach a prototype. */
function nameParts (name: string): string[] | undefined {
  const match = NAME.exec(name)
  if (!match) return undefined
  const parts = match[2] ? [match[1], ...match[2].slice(1, -1).split('][')] : [match[1]]
  return parts.length > MAX_PARTS || parts.some(part => UNSAFE.has(part)) ? undefined : parts
}

/** A branch as the array or object it stands for. A branch is a list when it was appended to with `[]`, or when every key is an index and `name` is not one of the keyed names; a list is ordered by its indexes with the gaps closed, so a huge index never builds a sparse array. */
function build (branch: Branch, name: string | null): unknown[] | Fields {
  const entries = [...branch.entries]
  const indexed = entries.every(([key]) => INDEX.test(key))
  if (branch.appended && !indexed) throw conflict()
  const child = ([key, value]: [string, Branch | string]) => typeof value === 'string' ? value : build(value, key)
  if (name !== null && (branch.appended || (indexed && !KEYED.has(name)))) return entries.sort((a, b) => Number(a[0]) - Number(b[0])).map(child)
  const out: Fields = {}
  for (const entry of entries) out[entry[0]] = child(entry)
  return out
}

/**
 * Reads `items[0][id]`, `properties[Engraving]`, `updates[]` and `updates[<id>]` into nested objects and arrays, the way Rack reads form names. https://shopify.dev/docs/api/ajax/reference/cart documents the form names `updates[<variant id>]`, `attributes[<name>]` and `properties[<name>]` (`formData.append("updates[794864053]", 2)`); the indexed `items[0][id]` is the same convention, and neither that page nor a fixture pins it. The last of two values for one name wins. A name part of `__proto__`, `constructor` or `prototype`, a name of more than five parts and a name that is not bracket syntax drop the field. A name used as a value and as a group of fields (`a=1&a[b]=2`) is a 400, as Rack's query parser rejects it (`ParameterTypeError`); no fixture pins the parity store's answer.
 */
export function nestFields (pairs: Array<[string, string]>): Fields {
  const root = new Branch()
  for (const [name, value] of pairs) {
    const parts = nameParts(name)
    if (!parts) continue
    let at = root
    parts.forEach((part, i) => {
      let key = part
      if (key === '') {
        key = String(at.next)
        at.appended = true
      }
      if (INDEX.test(key)) at.next = Math.max(at.next, Number(key) + 1)
      const existing = at.entries.get(key)
      if (i === parts.length - 1) {
        if (existing instanceof Branch) throw conflict()
        at.entries.set(key, value)
        return
      }
      if (typeof existing === 'string') throw conflict()
      const branch = existing ?? new Branch()
      at.entries.set(key, branch)
      at = branch
    })
  }
  return build(root, null) as Fields
}

async function bytes (request: Request, limit: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > limit) throw new BodyError(413, 'The request body is too large.')
  if (!request.body) return new Uint8Array()
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  let tooLarge = false
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) {
        tooLarge = true
        break
      }
      chunks.push(value)
    }
  } catch {
    throw new BodyError(400, 'The request body could not be read.')
  }
  if (tooLarge) {
    // the unread rest is left to the host's server to discard: cancelling the stream of a body built from a `FormData` makes Node's `fetch` reject a promise nobody holds, which ends the process (seen on Node 24)
    reader.releaseLock()
    throw new BodyError(413, 'The request body is too large.')
  }
  const out = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

/** `JSON.parse`'s reviver: a key that could reach a prototype is dropped at any depth, as `nestFields` drops it from a form. */
const dropUnsafe = (key: string, value: unknown) => UNSAFE.has(key) ? undefined : value

/**
 * The body of a storefront request as one shape: a JSON object, or the fields of a url-encoded or multipart form read by `nestFields`; Shopify themes post all three to the Cart API (https://shopify.dev/docs/api/ajax/reference/cart: JSON with `Content-Type: application/json`, a `FormData` of the add-to-cart form, or "a serialized cart form"). Any other type, or none, is read as url-encoded, as a form posts it. File fields are dropped (the spec: file properties are not kept). A body over `limit` bytes is a 413; one that cannot be parsed, or JSON that is not an object, is a 400. The messages of both are fixed sentences.
 */
export async function readBody (request: Request, limit: number): Promise<Fields> {
  const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  const raw = await bytes(request, limit)
  if (!raw.byteLength) return {}
  if (type === 'application/json' || type.endsWith('+json')) {
    let value: unknown
    try {
      value = JSON.parse(new TextDecoder().decode(raw), dropUnsafe)
    } catch {
      throw new BodyError(400, 'The request body is not valid JSON.')
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BodyError(400, 'The request body must be a JSON object.')
    return value as Fields
  }
  if (type === 'multipart/form-data') {
    let form: FormData
    try {
      form = await new Response(raw as BodyInit, { headers: { 'content-type': request.headers.get('content-type') ?? '' } }).formData()
    } catch {
      throw new BodyError(400, 'The request body is not a valid form.')
    }
    return nestFields([...form.entries()].filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  }
  return nestFields([...new URLSearchParams(new TextDecoder().decode(raw)).entries()])
}
