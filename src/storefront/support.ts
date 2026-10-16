import type { Context } from './handler'
import { decode } from './router'
import type { StorefrontOptions, StorefrontReport } from './types'

/** The `Cache-Control` of every answer: a response may hold or depend on one visitor's state, so no cache keeps it. */
export const PRIVATE = 'private, no-store'

/** Hands a report to the caller's `onReport`. A reporter that throws, or returns a promise that rejects, must not fail the page it reports on (or, from the error path, the whole call): its failure is dropped. */
export function report (options: StorefrontOptions, entry: StorefrontReport, request: Request): void {
  try {
    const result: unknown = options.onReport?.(entry, request)
    if (result && typeof (result as Promise<unknown>).catch === 'function') (result as Promise<unknown>).catch(() => undefined)
  } catch {
    // the caller's reporter is not ours to fix
  }
}

export const asError = (error: unknown): Error => error instanceof Error ? error : new Error(String(error))

/** The store's root under the request's base path and locale prefix, where a plain page's link back goes. */
export const storeRoot = (ctx: Context) => `${ctx.basePath}${ctx.routed.localePrefix}` || '/'

/** `path` without the base path, which is a prefix of whole segments compared as the router compares them, decoded (final review A, M3): `/p/tok` is the base of `/p/tok/cart`, `/p/%74ok/cart`, `/p/tok?x` and `/p/tok#top`, not of `/p/token`. A path with an empty segment after the base (`/p/tok//x`) comes back as `//x`, which is not a path on the store, and the callers refuse it. */
export function withoutBase (ctx: Context, path: string): string {
  const base = ctx.basePath
  if (base === '') return path
  const end = path.search(/[?#]/)
  const have = (end < 0 ? path : path.slice(0, end)).split('/')
  const want = base.split('/')
  if (want.length > have.length || !want.every((segment, i) => decode(segment) === decode(have[i]))) return path
  return `/${have.slice(want.length).join('/')}${end < 0 ? '' : path.slice(end)}`
}

/** `value` when it is a whole number of at least zero (a limit or a store option), else a `TypeError` that names it: `NaN`, a negative number, a fraction, infinity and anything that is not a number would otherwise build and fail on a request (a body limit of `NaN` makes every `POST` a 500, one of `-1` refuses every `?sections=`). Final review A, M6. */
export function checkWhole (name: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new TypeError(`${name} must be a whole number of at least zero, not ${typeof value === 'number' ? String(value) : typeof value}`)
  return value
}
