import { Drop } from '../../drop'

const ITEMS = Symbol('items')
const HIDDEN = Symbol('hidden')
const LISTED = Symbol('listed')
const LISTING = Symbol('listing')

/**
 * A handle-keyed collection such as `collections`, `pages` or `linklists`: `collections['frontpage']` and `collections.frontpage` look an item up, `{% for c in collections %}` iterates the items, and `collections.size` counts them. The drop has no named methods, so a handle such as `values` or `all` is never shadowed; code reads it with the static helpers. `size` is the drop's one named member, and the members every JavaScript object has (`constructor`, `toString`, `valueOf`, `hasOwnProperty`) also win over a handle of the same name, so a collection whose handle is `constructor` or `size` is reached only through `HandleMap.get` (on the Task 12 list; `constructor` is a legal handle). Hidden entries (Shopify's implicit `collections.all`) can be looked up but are not iterated or counted.
 *
 * A `listed` comparator sets the order templates see: `{% for %}` and `size`-based filters walk the items in it, while `HandleMap.values` keeps the order the entries were given in (the store data's), which engine code that breaks ties by store order reads. The `collections` object has one: Shopify lists it alphabetically by title.
 *
 * Follows https://shopify.dev/docs/api/liquid/objects/collections, https://shopify.dev/docs/api/liquid/objects/pages, https://shopify.dev/docs/api/liquid/objects/blogs, https://shopify.dev/docs/api/liquid/objects/all_products, https://shopify.dev/docs/api/liquid/objects/linklists and https://shopify.dev/docs/api/liquid/objects/images. shopify.dev does not pin that these objects iterate or answer `size`; the behaviour is Liquid's own for hash-like collections and is on the "confirm on a development store" list.
 */
export class HandleMap<T = unknown> extends Drop {
  private readonly [ITEMS] = new Map<string, T>()
  private readonly [HIDDEN] = new Map<string, T>()
  /** Kept as a comparator of nothing in particular, so a map of one kind of item stays assignable to a map of a wider one. */
  private readonly [LISTED]?: (a: never, b: never) => number
  private [LISTING]?: T[]

  public constructor (entries: Iterable<[string, T]> = [], hidden: Iterable<[string, T]> = [], listed?: (a: T, b: T) => number) {
    super()
    this[LISTED] = listed
    for (const [handle, item] of entries) this[ITEMS].set(handle, item)
    for (const [handle, item] of hidden) this[HIDDEN].set(handle, item)
  }

  public static get<T> (map: HandleMap<T>, handle: string): T | undefined {
    return map[ITEMS].get(handle) ?? map[HIDDEN].get(handle)
  }

  public static values<T> (map: HandleMap<T>): T[] {
    return [...map[ITEMS].values()]
  }

  /** The listed items and the hidden ones: every item `get` finds. */
  public static every<T> (map: HandleMap<T>): T[] {
    return [...map[ITEMS].values(), ...map[HIDDEN].values()]
  }

  public get size (): number {
    return this[ITEMS].size
  }

  public liquidMethodMissing (key: string | number): T | undefined {
    return HandleMap.get(this, String(key))
  }

  public [Symbol.iterator] (): Iterator<T> {
    const listed = this[LISTED]
    if (!listed) return this[ITEMS].values()
    this[LISTING] ??= [...this[ITEMS].values()].sort(listed as (a: T, b: T) => number)
    return this[LISTING][Symbol.iterator]()
  }
}
