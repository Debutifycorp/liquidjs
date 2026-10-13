import { Drop } from '../../drop'

const ITEMS = Symbol('items')
const HIDDEN = Symbol('hidden')

/**
 * A handle-keyed collection such as `collections`, `pages` or `linklists`: `collections['frontpage']` and `collections.frontpage` look an item up, `{% for c in collections %}` iterates the items, and `collections.size` counts them. The drop has no named methods, so a handle such as `values` or `all` is never shadowed; code reads it with the static helpers. Only `size` and the members every JavaScript object has (`constructor`, `toString`, `valueOf`) win over a handle of the same name, and no real handle is called that. Hidden entries (Shopify's implicit `collections.all`) can be looked up but are not iterated or counted.
 *
 * Follows https://shopify.dev/docs/api/liquid/objects/collections, https://shopify.dev/docs/api/liquid/objects/pages, https://shopify.dev/docs/api/liquid/objects/blogs, https://shopify.dev/docs/api/liquid/objects/all_products, https://shopify.dev/docs/api/liquid/objects/linklists and https://shopify.dev/docs/api/liquid/objects/images. shopify.dev does not pin that these objects iterate or answer `size`; the behaviour is Liquid's own for hash-like collections and is on the "confirm on a development store" list.
 */
export class HandleMap<T = unknown> extends Drop {
  private readonly [ITEMS] = new Map<string, T>()
  private readonly [HIDDEN] = new Map<string, T>()

  public constructor (entries: Iterable<[string, T]> = [], hidden: Iterable<[string, T]> = []) {
    super()
    for (const [handle, item] of entries) this[ITEMS].set(handle, item)
    for (const [handle, item] of hidden) this[HIDDEN].set(handle, item)
  }

  public static get<T> (map: HandleMap<T>, handle: string): T | undefined {
    return map[ITEMS].get(handle) ?? map[HIDDEN].get(handle)
  }

  public static values<T> (map: HandleMap<T>): T[] {
    return [...map[ITEMS].values()]
  }

  public get size (): number {
    return this[ITEMS].size
  }

  public liquidMethodMissing (key: string | number): T | undefined {
    return HandleMap.get(this, String(key))
  }

  public [Symbol.iterator] (): Iterator<T> {
    return this[ITEMS].values()
  }
}
