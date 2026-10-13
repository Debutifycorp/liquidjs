import { LimitError, LiquidError } from './error'
import { toValueSync } from './async'
import { TokenKind } from '../parser/token-kind'
import type { HTMLToken, TagToken } from '../tokens'
import type { Template } from '../template/template'

const POSITION = /(, file:[^,]+)?, line:\d+, col:\d+$/

// the tags Ruby Liquid calls `blank?`: they print nothing, so it records their errors without printing them
const BLANK_TAGS = ['assign', 'capture', 'comment', '#']
// the tags whose `blank?` follows their bodies (Ruby's `Block#blank?`); `liquid` is one because Ruby merges its tags into the enclosing body
const BLOCK_TAGS = ['if', 'unless', 'case', 'for', 'tablerow', 'liquid']
// the names are compared, never `instanceof`: `extends Error` loses its prototype chain in the ES5 bundles (see `src/util/error.ts`)
const SYNTAX_ERRORS = ['ParseError', 'TokenizationError']

/** The message of `err` as Ruby Liquid words it: the innermost error's own text, without the `, line:1, col:1` position this fork appends. */
export function liquidErrorText (err: Error): string {
  if (LiquidError.is(err) && err.originalError) return liquidErrorText(err.originalError)
  return err.message.replace(POSITION, '')
}

/** Shopify's inline error text: `Liquid error (line 3): message`, with the template name when the error came from a partial. A syntax error reads `Liquid syntax error`, as in Ruby Liquid. */
export function inlineErrorMessage (err: LiquidError): string {
  const [line] = err.token.getPosition()
  const file = err.token.file ? `${err.token.file.replace(/^\.\//, '').replace(/\.liquid$/, '')} ` : ''
  const kind = SYNTAX_ERRORS.includes(err.name) ? 'Liquid syntax error' : 'Liquid error'
  return `${kind} (${file}line ${line}): ${liquidErrorText(err)}`
}

/** Whether `err`, or the error it wraps in `originalError`, is one of the engine's limits (`memoryLimit`, `renderLimit`, `parseLimit`). Use it on what `render` or `parse` throws: a limit hit while rendering arrives wrapped in a `RenderError`, which `LimitError.is()` does not match. `inlineErrors` never handles these: Ruby Liquid re-raises its `MemoryError` rather than print it. */
export function isLimitError (err: unknown): boolean {
  for (let e: unknown = err; e; e = LiquidError.is(e) ? e.originalError : undefined) {
    if (LimitError.is(e)) return true
  }
  return false
}

/** Whether Ruby Liquid records `err` and prints nothing for it: an undefined variable or filter, or any error in a tag that prints nothing (`tpl` is the template that raised it). */
export function isSilentError (err: LiquidError, tpl: Template): boolean {
  return isUndefinedLookup(err) || isBlank(tpl)
}

function isUndefinedLookup (err: LiquidError): boolean {
  if (err.name === 'UndefinedVariableError') return true
  // a parse error is not a failed lookup, even when it quotes one
  if (SYNTAX_ERRORS.includes(err.name)) return false
  const cause = err.originalError
  return cause?.name === 'InternalUndefinedVariableError' || (cause?.name === 'AssertionError' && cause.message.startsWith('undefined filter: '))
}

function isBlank (tpl: Template): boolean {
  const { token } = tpl
  if (token.kind === TokenKind.HTML) return /^\s*$/.test((token as HTMLToken).getContent())
  if (token.kind !== TokenKind.Tag) return false
  // a tag can say for itself, with `blank` or `blank()`, before the name list is asked
  const { blank } = tpl as { blank?: unknown }
  if (blank !== undefined) return !!(typeof blank === 'function' ? blank.call(tpl) : blank)
  const { name } = token as TagToken
  if (BLANK_TAGS.includes(name)) return true
  return BLOCK_TAGS.includes(name) && !!tpl.children && toValueSync(tpl.children(false, true)).every(isBlank)
}
