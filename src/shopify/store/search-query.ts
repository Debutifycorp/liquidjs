/**
 * The syntax of a storefront search query, as https://help.shopify.com/en/manual/online-store/storefront-search/search-behavior and https://shopify.dev/docs/api/usage/search-syntax describe it: `field:value` (no space after the colon), `OR` and `AND` (OR binds tighter, and `AND` is implied between terms), `-term` and `NOT term`, parentheses, and a quoted phrase.
 */
export type QueryNode =
  | { type: 'word', word: string }
  | { type: 'phrase', phrase: string }
  | { type: 'field', field: string, value: string }
  | { type: 'neutral' }
  | { type: 'not', item: QueryNode }
  | { type: 'and' | 'or', items: QueryNode[] }

/** A parsed query: the tree, and the plain words of a query that uses no syntax. */
export interface ParsedQuery {
  /** The tree of a query that uses syntax: a field, a quoted phrase, a negation, a group or a wildcard. */
  tree?: QueryNode
  /** The words of a query that uses none, in order, an `AND` or `OR` among them being a word like any other. */
  words?: string[]
}

type Token =
  | { type: 'open' | 'close' | 'and' | 'or' | 'not' }
  | { type: 'word' | 'phrase', text: string }
  | { type: 'field', field: string, value: string, compared: boolean }

const FIELD = /^([A-Za-z_][\w.]*):(<=|>=|<|>)?/

/** Reads a quoted string starting at `at` (a `"` or `'`), up to the same quote or the end: the text, and where the scan goes on. */
function quoted (text: string, at: number): [string, number] {
  const quote = text[at]
  const end = text.indexOf(quote, at + 1)
  return end < 0 ? [text.slice(at + 1), text.length] : [text.slice(at + 1, end), end + 1]
}

function tokenize (text: string): Token[] {
  const tokens: Token[] = []
  let at = 0
  while (at < text.length) {
    const ch = text[at]
    if (/\s/.test(ch)) {
      at++
      continue
    }
    if (ch === '(' || ch === ')') {
      tokens.push({ type: ch === '(' ? 'open' : 'close' })
      at++
      continue
    }
    if (ch === '"' || ch === "'") {
      const [phrase, next] = quoted(text, at)
      tokens.push({ type: 'phrase', text: phrase })
      at = next
      continue
    }
    if (ch === '-' && at + 1 < text.length && !/[\s)]/.test(text[at + 1])) {
      tokens.push({ type: 'not' })
      at++
      continue
    }
    let end = at
    while (end < text.length && !/[\s()]/.test(text[end])) end++
    const word = text.slice(at, end)
    const field = FIELD.exec(word)
    if (field) {
      const rest = at + field[0].length
      if (text[rest] === '"' || text[rest] === "'") {
        const [value, next] = quoted(text, rest)
        tokens.push({ type: 'field', field: field[1].toLowerCase(), value, compared: field[2] !== undefined })
        at = next
      } else {
        tokens.push({ type: 'field', field: field[1].toLowerCase(), value: text.slice(rest, end), compared: field[2] !== undefined })
        at = end
      }
      continue
    }
    at = end
    if (word === 'AND') tokens.push({ type: 'and' })
    else if (word === 'OR') tokens.push({ type: 'or' })
    else if (word === 'NOT' && /\s/.test(text[at] ?? '')) tokens.push({ type: 'not' })
    else tokens.push({ type: 'word', text: word })
  }
  return tokens
}

/** Whether a word is one a wildcard (`hood*`) or an operator character makes: the storefront search does not read it as the word. */
const wildcard = (word: string) => word.includes('*')

function parseTokens (tokens: Token[]): QueryNode {
  let at = 0
  const primary = (): QueryNode | undefined => {
    const token = tokens[at]
    if (!token) return undefined
    if (token.type === 'open') {
      at++
      const inner = andExpression()
      if (tokens[at]?.type === 'close') at++
      return inner
    }
    if (token.type === 'close' || token.type === 'and' || token.type === 'or') return undefined
    at++
    if (token.type === 'phrase') return { type: 'phrase', phrase: token.text }
    if (token.type === 'field') return token.value === '' || token.compared || wildcard(token.value) ? { type: 'neutral' } : { type: 'field', field: token.field, value: token.value }
    if (token.type === 'word') return wildcard(token.text) ? { type: 'neutral' } : { type: 'word', word: token.text }
    return { type: 'neutral' }
  }
  const unary = (): QueryNode | undefined => {
    if (tokens[at]?.type === 'not') {
      at++
      const item = unary()
      return item ? { type: 'not', item } : undefined
    }
    return primary()
  }
  const orExpression = (): QueryNode | undefined => {
    const first = unary()
    if (!first) return undefined
    const items = [first]
    while (tokens[at]?.type === 'or') {
      at++
      const next = unary()
      if (next) items.push(next)
    }
    return items.length === 1 ? first : { type: 'or', items }
  }
  function andExpression (): QueryNode {
    const items: QueryNode[] = []
    while (at < tokens.length && tokens[at].type !== 'close') {
      if (tokens[at].type === 'and') {
        at++
        continue
      }
      const before = at
      const next = orExpression()
      if (next) items.push(next)
      if (at === before) at++
    }
    return items.length === 1 ? items[0] : { type: 'and', items }
  }
  const tree = andExpression()
  return tree
}

/** Whether a token makes the query one that uses syntax: a field with a value, a quoted phrase, a negation, a group or a wildcard. `AND` and `OR` alone do not (see `parseQuery`). */
const syntactic = (token: Token) => token.type === 'open' || token.type === 'close' || token.type === 'not' || token.type === 'phrase' ||
  (token.type === 'field' && token.value !== '') || (token.type === 'word' && wildcard(token.text))

/**
 * Reads a search query. A query that uses syntax (`syntactic`) is a tree; any other is its words. The storefront search of the parity store reads the two differently (fixtures `probe-search-q-*`): see `buildSearch`.
 */
export function parseQuery (text: string): ParsedQuery {
  const tokens = tokenize(text)
  if (tokens.some(syntactic)) return { tree: parseTokens(tokens) }
  return { words: tokens.flatMap(token => token.type === 'word' ? [token.text] : token.type === 'and' ? ['AND'] : token.type === 'or' ? ['OR'] : []) }
}
