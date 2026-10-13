/** Shopify's editor writes a `/* … *\/` notice at the top of the JSON files it generates (templates, section groups, `settings_data.json`); JSON.parse does not accept it. shopify.dev does not describe the notice. */
const LEADING_COMMENT = /^\s*\/\*[\s\S]*?\*\//

/** Parses a theme JSON file (template, section group, settings, locale), allowing Shopify's leading comment. Throws `<file>: <JSON error>`. */
export function parseThemeJson (source: string, file: string): unknown {
  try {
    return JSON.parse(source.replace(LEADING_COMMENT, ''))
  } catch (err) {
    throw new Error(`${file}: ${(err as Error).message}`)
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

/** Merges `override` into `base` as contextual section group files do: objects merge key by key, everything else (arrays included) is replaced. Neither input is changed, and a `__proto__` key in the override becomes an own key of the result, as `JSON.parse` makes it, never the result's prototype. https://shopify.dev/docs/storefronts/themes/architecture/section-groups#contextual-section-groups says a contextual file "includes the overrides that you make to the section group for a context" and does not say how its values combine with the parent's, so this rule is Debutify's and goes on the "confirm on a development store" list. */
export function deepMerge<T> (base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) return (override === undefined ? base : override) as T
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(override)) {
    const merged = deepMerge(Object.prototype.hasOwnProperty.call(out, key) ? out[key] : undefined, value)
    Object.defineProperty(out, key, { value: merged, enumerable: true, writable: true, configurable: true })
  }
  return out as T
}

/**
 * Splits a JSON template's `wrapper` (`div#id.class[attr=value]`) into the opening and closing tags. https://shopify.dev/docs/storefronts/themes/architecture/templates/json-templates lists the tags `div`, `main` and `section` and gives one example, `div#div_id.div_class[attribute-one=value]`, but no grammar: the parts here (`#id`, `.class`, `[name=value]`, any number of each) are read from that example and are not pinned. A wrapper that does not parse returns undefined.
 */
export function parseWrapper (spec: string): [string, string] | undefined {
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
      attributes.push(`${part.slice(1, eq)}="${part.slice(eq + 1, -1).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`)
    }
  }
  const open = [tag, id && `id="${id}"`, classes.length ? `class="${classes.join(' ')}"` : '', ...attributes].filter(Boolean).join(' ')
  return [`<${open}>`, `</${tag}>`]
}
