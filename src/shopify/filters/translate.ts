import type { FilterImpl } from '../../template/filter-impl-options'
import { stringify } from '../../util'
import { escapeHtml } from '../util/html'
import { namedForDisplay, splitArgs } from '../util/args'
import { hasOwn } from '../util/own'
import { SafeHtmlDrop } from '../objects/safe-html'
import { sectionLocales, shopifyState } from '../state'
import type { LocaleTree } from '../types'
import type { ShopifyFilterSet } from './types'

const PLACEHOLDER = /\{\{\s*([\w-]+)\s*\}\}/g

/** CLDR plural categories through `Intl.PluralRules`, with an explicit `zero` key winning for a count of 0. https://shopify.dev/docs/storefronts/themes/architecture/locales/storefront-locale-files#pluralize-translations names the CLDR keys and `count`; that an explicit `zero` key wins for 0 in every locale is not pinned by shopify.dev. */
function pluralForm (entry: LocaleTree, count: unknown, locale: string): string | LocaleTree | undefined {
  const n = Number(count)
  if (n === 0 && typeof entry.zero === 'string') return entry.zero
  let category = 'other'
  try {
    category = new Intl.PluralRules(locale).select(n)
  } catch (err) {
    category = n === 1 ? 'one' : 'other'
  }
  return entry[category] ?? entry.other
}

/**
 * `t` / `translate`: a translation from the theme's locale files (or the section schema's `locales`), with `{{ name }}` interpolation and `count` pluralisation. https://shopify.dev/docs/api/liquid/filters/translate says only that it returns the text for a key from a locale file or a section's schema `locales`; interpolation and CLDR plural keys are on https://shopify.dev/docs/storefronts/themes/architecture/locales/storefront-locale-files.
 *
 * The storefront locale files page says translated content is escaped by default and that the `_html` suffix "prevents the output content from being escaped", so an `_html` key's output, interpolated values included, is printed as it is (a template that passes data into one should escape it first), and any other key's output is escaped whole.
 *
 * Not pinned by shopify.dev, so the filter stays `approx` and these go on the "confirm on a development store" list: the text printed for a missing key (`translation missing: <locale>.<key>` here, escaped because the key can come from data), and whether interpolated values count as part of the output content (they do here).
 */
function translate (this: FilterImpl, key: unknown, ...args: unknown[]): string {
  const state = shopifyState(this.context)
  const { named } = splitArgs(args)
  const display = namedForDisplay(args)
  const path = stringify(key)
  const html = /_html$/.test(path)
  let value = state.translator.lookup(path, sectionLocales(state))
  if (value && typeof value === 'object' && hasOwn(named, 'count')) value = pluralForm(value, named.count, state.translator.locale)
  if (typeof value !== 'string') {
    state.report.missing('translation', path)
    return escapeHtml(`translation missing: ${state.translator.locale}.${path}`)
  }
  if (html) {
    return value.replace(PLACEHOLDER, (whole: string, name: string) => hasOwn(named, name) ? stringify(display[name]) : whole)
  }
  // the key's text and each value are escaped alone, so a value that is HTML-safe already (a line item's `title`) is not escaped a second time
  let out = ''
  let from = 0
  for (const found of value.matchAll(PLACEHOLDER)) {
    out += escapeHtml(value.slice(from, found.index))
    const [whole, name] = found
    out += !hasOwn(named, name) ? escapeHtml(whole) : display[name] instanceof SafeHtmlDrop ? stringify(display[name]) : escapeHtml(stringify(display[name]))
    from = found.index + whole.length
  }
  return out + escapeHtml(value.slice(from))
}

export const translateFilters: ShopifyFilterSet = {
  t: { status: 'approx', handler: translate },
  translate: { status: 'approx', handler: translate }
}
