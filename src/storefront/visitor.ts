import { randomBytes } from 'crypto'
import { DEFAULT_LIMITS } from './types'
import type { CartStore, VisitorState } from './types'

const KEY = /^[A-Za-z0-9_-]{16,128}$/

// a cookie path is any printable ASCII but a space and `;`: a base path with `;` would add cookie attributes
const COOKIE_PATH = /^[\x21-\x3a\x3c-\x7e]*$/

/** A new visitor key: 128 bits from the system's random source, as 32 hex digits. The key is the visitor's only credential, so it is never derived from anything the visitor sends. */
export const newVisitorKey = () => randomBytes(16).toString('hex')

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

/** Visitor states in memory, at most `max` of them (the least recently used goes first), each dropped after `idleMs` without use. Reading and writing both count as use. */
export function memoryCartStore (options: { max?: number, idleMs?: number, now?: () => number } = {}): CartStore {
  const max = options.max ?? DEFAULT_LIMITS.visitors
  const idleMs = options.idleMs ?? DEFAULT_LIMITS.idleMs
  const now = options.now ?? Date.now
  // the map is kept in order of use: an entry is deleted and set again whenever it is used, so the first entry is the least recently used
  const states = new Map<string, { state: VisitorState, seen: number }>()
  const idle = (seen: number) => now() - seen > idleMs
  return {
    async get (visitor) {
      const entry = states.get(visitor)
      if (!entry) return undefined
      states.delete(visitor)
      if (idle(entry.seen)) return undefined
      entry.seen = now()
      states.set(visitor, entry)
      return structuredClone(entry.state)
    },
    async set (visitor, state) {
      states.delete(visitor)
      states.set(visitor, { state: structuredClone(state), seen: now() })
      for (const [key, entry] of states) {
        if (states.size <= max && !idle(entry.seen)) break
        states.delete(key)
      }
    }
  }
}

/** Runs tasks one at a time per key, in the order they were given; a failed task does not stop the next one. */
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
