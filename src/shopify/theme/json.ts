import { escapeHtml } from '../util/html'
import { isRecord, own } from '../util/own'
import { parseJsonc } from '../util/jsonc'

/** Parses a theme JSON file (template, section group, settings, locale) as Shopify does: comments and trailing commas are allowed, including the `/* … *\/` notice the editor writes at the top of the files it generates. https://shopify.dev/docs/storefronts/themes/architecture#json-with-comments. Throws `<file>: <JSON error>`. */
export function parseThemeJson (source: string, file: string): unknown {
  try {
    return parseJsonc(source)
  } catch (err) {
    throw new Error(`${file}: ${(err as Error).message}`)
  }
}

/** Merges `override` into `base` as contextual section group files do: objects merge key by key, everything else (arrays included) is replaced. Neither input is changed, and a `__proto__` key in the override becomes an own key of the result, as `JSON.parse` makes it, never the result's prototype. https://shopify.dev/docs/storefronts/themes/architecture/section-groups#contextual-section-groups says a contextual file "includes the overrides that you make to the section group for a context" and does not say how its values combine with the parent's, so this rule is Debutify's and goes on the "confirm on a development store" list. */
export function deepMerge<T> (base: T, override: unknown): T {
  if (!isRecord(base) || !isRecord(override)) return (override === undefined ? base : override) as T
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(override)) {
    const merged = deepMerge(own(out, key), value)
    Object.defineProperty(out, key, { value: merged, enumerable: true, writable: true, configurable: true })
  }
  return out as T
}

/**
 * Splits a JSON template's `wrapper` (`div#id.class[attr=value]`) into the opening and closing tags. https://shopify.dev/docs/storefronts/themes/architecture/templates/json-templates lists the tags `div`, `main` and `section` and gives one example, `div#div_id.div_class[attribute-one=value]`, but no grammar: the parts here (`#id`, `.class`, `[name=value]`, any number of each) are read from that example and are not pinned. A wrapper that does not parse returns undefined, and so does one with an event-handler attribute (a name starting with `on`) or a `style` attribute unless `trusted` is true, as a wrapper written by whoever edits a template must not be a way to run script.
 */
export function parseWrapper (spec: string, trusted = false): [string, string] | undefined {
  const match = /^(div|main|section)((?:#[\w-]+|\.[\w-]+|\[[\w-]+=[^\]]*\])*)$/.exec(spec.trim())
  if (!match) return undefined
  const [, tag, rest] = match
  let id = ''
  const classes: string[] = []
  const attributes: string[] = []
  for (const part of rest.match(/#[\w-]+|\.[\w-]+|\[[\w-]+=[^\]]*\]/g) ?? []) {
    if (part[0] === '#') id = part.slice(1)
    else if (part[0] === '.') classes.push(part.slice(1))
    else {
      const eq = part.indexOf('=')
      if (!trusted && /^(?:on|style$)/i.test(part.slice(1, eq))) return undefined
      attributes.push(`${part.slice(1, eq)}="${escapeHtml(part.slice(eq + 1, -1))}"`)
    }
  }
  const open = [tag, id && `id="${id}"`, classes.length ? `class="${classes.join(' ')}"` : '', ...attributes].filter(Boolean).join(' ')
  return [`<${open}>`, `</${tag}>`]
}
