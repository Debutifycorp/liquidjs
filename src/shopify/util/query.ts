/** A name and a value of a query. */
type Pair = readonly [string, string]

/** A query ready to be put after many paths with one pair added or taken out each time: its pairs ordered by name and percent-encoded once (`prepareQuery`). */
export interface PreparedQuery {
  readonly pairs: readonly Pair[]
  readonly encoded: readonly string[]
}

/** A query name or value as Shopify's links write it: everything but letters, digits and `-_.~` percent-encoded and a space a `+`, as Ruby's `CGI.escape` writes it (fixtures `probe-search-q-or`, `-wildcard`, `-group` and `-phrase`: `q=slides+OR+beanie`, `hood%2A`, `%28title%3Ashirt%29`, `%22gray+leather%22`). */
export function encodeQueryComponent (text: string): string {
  return encodeURIComponent(text).replace(/%20/g, '+').replace(/[!'()*]/g, ch => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)
}

const encode = (pair: Pair) => `${encodeQueryComponent(pair[0])}=${encodeQueryComponent(pair[1])}`

/** `pairs` ordered by name (pairs of one name keep their order) and encoded with `encodeQueryComponent`, the form `withQuery` prints them in. */
export function prepareQuery (pairs: readonly Pair[]): PreparedQuery {
  const ordered = [...pairs].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
  return { pairs: ordered, encoded: ordered.map(encode) }
}

/**
 * `path` followed by `query` as its query string, joined to a `?` or, when `path` already has a query, to its end. `change.add` is one more pair, placed after the pairs of its name that `query` has and before those of a later name, where ordering `[...pairs, add]` puts it; `change.drop` names the pairs left out. The same query serves any number of calls, which a page of filter links needs (final review B, I1): sorting and encoding the whole query for each of a thousand links is the cost that a long query multiplied.
 */
export function withPrepared (path: string, query: PreparedQuery, change: { add?: Pair, drop?: (name: string, value: string) => boolean } = {}): string {
  const { add, drop } = change
  const parts: string[] = []
  let placed = add === undefined
  for (let at = 0; at < query.pairs.length; at++) {
    const [name, value] = query.pairs[at]
    if (!placed && add![0] < name) {
      parts.push(encode(add!))
      placed = true
    }
    if (!drop?.(name, value)) parts.push(query.encoded[at])
  }
  if (!placed) parts.push(encode(add!))
  return parts.length ? `${path}${path.includes('?') ? '&' : '?'}${parts.join('&')}` : path
}

/**
 * `path` followed by `pairs` as its query string: the pairs ordered by name (pairs of one name keep their order) and encoded with `encodeQueryComponent`, joined to a `?` or, when `path` already has a query, to its end. The order is the one the parity store prints in filter and pagination links (fixtures `probe-collection-filter-combined` and `probe-collection-types`: `filter.p.tag=…&filter.v.availability=1&page=2&q=…&sort_by=…&view=probe`), and the encoding is the one the search fixtures show (`probe-search-q-*`: a space is `+`). shopify.dev does not describe the form of these links.
 */
export function withQuery (path: string, pairs: readonly Pair[]): string {
  return withPrepared(path, prepareQuery(pairs))
}
