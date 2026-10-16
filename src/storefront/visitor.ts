import { createHash, randomBytes } from 'crypto'
import { checkWhole } from './support'
import { DEFAULT_LIMITS } from './types'
import type { CartStore, VisitorState } from './types'

const KEY = /^[A-Za-z0-9_-]{16,128}$/

// a cookie path is any printable ASCII but a space and `;`: a base path with `;` would add cookie attributes
const COOKIE_PATH = /^[\x21-\x3a\x3c-\x7e]*$/

/** A new visitor key: 128 bits from the system's random source, as 32 hex digits. The key is the visitor's only credential, so it is never derived from anything the visitor sends. */
export const newVisitorKey = () => randomBytes(16).toString('hex')

/** The `token` a visitor's cart prints in `/cart.js` and in the cart object of a page. In a sandbox the key is already in the page's address (the base path) and the token is the key. Otherwise the key is the `cart` cookie, which is `HttpOnly` because the key is the visitor's only credential, and a token that were the key would hand it to any script on the page that reads `/cart.js`: the token is then a one-way derivation of it, the first 32 digits of its SHA-256. */
export const cartToken = (key: string, sandbox: boolean) => sandbox ? key : createHash('sha256').update(key).digest('hex').slice(0, 32)

export function emptyVisitor (key: string): VisitorState {
  return { cart: { token: key, lines: [], note: null, attributes: {}, discountCodes: [] } }
}

/** The visitor key of the `cart` cookie, as Shopify keys a cart (the storefront's `cart` cookie, https://www.shopify.com/legal/cookies); a value that is not a plain key is ignored, so a tampered or foreign cookie starts a fresh visitor. */
export function cookieVisitor (request: Request): string | undefined {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const at = part.indexOf('=')
    if (at < 0 || part.slice(0, at).trim() !== 'cart') continue
    const value = part.slice(at + 1).trim()
    if (KEY.test(value)) return value
  }
  return undefined
}

/** The `Set-Cookie` value for a visitor key: HttpOnly and SameSite=Lax, under the base path (spec "Units", `visitor`). It has no expiry, so it ends with the browser session, where Shopify's `cart` cookie lasts two weeks (https://www.shopify.com/legal/cookies). A key that is not a plain key, or a base path that is not a plain path, is a `TypeError`. */
export function visitorCookie (key: string, basePath: string): string {
  const path = `/${basePath.replace(/^\/+|\/+$/g, '')}`
  if (!KEY.test(key)) throw new TypeError('visitorCookie: the visitor key is not a plain key')
  if (!COOKIE_PATH.test(path)) throw new TypeError('visitorCookie: the base path is not a plain path')
  return `cart=${key}; Path=${path}; HttpOnly; SameSite=Lax`
}

/** The bytes a state is counted for in the store's budget: two for each character of its JSON, which is what V8 spends on a string that holds a character above U+00FF, so the budget is not under-counted for text in another script. Object overhead is not counted, so the memory a full store holds is a small multiple of its budget: a few hundred bytes for each visitor. */
const sizeOf = (state: VisitorState) => JSON.stringify(state).length * 2

/**
 * Visitor states in memory, at most `max` of them and at most `maxBytes` in all (the least recently used go first), each dropped after `idleMs` without use. Reading and writing both count as use. `maxBytes` is the store's memory ceiling (final review A, I2): a state is counted as two bytes for each character of its JSON (`sizeOf`), and a state that is alone over the budget is not kept (the visitor's earlier state goes with it) and evicts no one. The defaults are `DEFAULT_LIMITS.visitors`, `DEFAULT_LIMITS.idleMs` and `DEFAULT_LIMITS.storeBytes`; each must be a whole number of at least zero.
 */
export function memoryCartStore (options: { max?: number, maxBytes?: number, idleMs?: number, now?: () => number } = {}): CartStore {
  const max = checkWhole('max', options.max ?? DEFAULT_LIMITS.visitors)
  const maxBytes = checkWhole('maxBytes', options.maxBytes ?? DEFAULT_LIMITS.storeBytes)
  const idleMs = checkWhole('idleMs', options.idleMs ?? DEFAULT_LIMITS.idleMs)
  const now = options.now ?? Date.now
  // the map is kept in order of use: an entry is deleted and set again whenever it is used, so the first entry is the least recently used
  const states = new Map<string, { state: VisitorState, seen: number, bytes: number }>()
  let held = 0
  const idle = (seen: number) => now() - seen > idleMs
  const drop = (visitor: string) => {
    const entry = states.get(visitor)
    if (entry) held -= entry.bytes
    states.delete(visitor)
  }
  return {
    async get (visitor) {
      const entry = states.get(visitor)
      if (!entry) return undefined
      states.delete(visitor)
      if (idle(entry.seen)) {
        held -= entry.bytes
        return undefined
      }
      entry.seen = now()
      states.set(visitor, entry)
      return structuredClone(entry.state)
    },
    async set (visitor, state) {
      drop(visitor)
      const bytes = sizeOf(state)
      if (bytes > maxBytes) return
      states.set(visitor, { state: structuredClone(state), seen: now(), bytes })
      held += bytes
      for (const [key, entry] of states) {
        if (states.size <= max && held <= maxBytes && !idle(entry.seen)) break
        held -= entry.bytes
        states.delete(key)
      }
    }
  }
}

/** Runs tasks one at a time per key, in the order they were given; a failed task does not stop the next one. A task must not run another task of its own key (it would wait for itself forever), and a task that never settles blocks its key for good: the host's request timeouts bound it. */
export class VisitorQueue {
  private readonly tails = new Map<string, Promise<unknown>>()

  public run<T> (key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve()
    const result = previous.then(task, task)
    const tail = result.catch(() => undefined)
    this.tails.set(key, tail)
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key)
    })
    return result
  }
}
