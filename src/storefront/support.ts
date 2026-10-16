import type { Context } from './handler'
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
