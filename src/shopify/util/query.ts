/**
 * `path` followed by `pairs` as its query string: the pairs ordered by name (pairs of one name keep their order) and percent-encoded with `encodeURIComponent`, joined to a `?` or, when `path` already has a query, to its end. The order is the one the parity store prints in filter and pagination links (fixtures `probe-collection-filter-combined` and `probe-collection-types`: `filter.p.tag=…&filter.v.availability=1&page=2&q=…&sort_by=…&view=probe`). shopify.dev does not describe the form of these links; a space encodes as `%20`, which no fixture shows.
 */
export function withQuery (path: string, pairs: ReadonlyArray<readonly [string, string]>): string {
  if (!pairs.length) return path
  const ordered = [...pairs].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
  return `${path}${path.includes('?') ? '&' : '?'}${ordered.map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`).join('&')}`
}
