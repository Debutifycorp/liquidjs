import type { FilterImpl } from '../../template/filter-impl-options'
import { stringify } from '../../util'
import { escapeHtml } from '../util/html'
import { namedForDisplay, splitArgs } from '../util/args'
import { hasOwn } from '../util/own'
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
 * Not pinned by shopify.dev, so the filter stays `approx` and these go on the "confirm on a development store" list: the text printed for a missing key (`translation missing: <locale>.<key>` here, escaped because the key can come from data), whether interpolated values in `_html` keys are escaped (they are here, and the translation is left as written), and whether other translations are escaped whole (they are here).
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
  const text = value.replace(PLACEHOLDER, (whole: string, name: string) => {
    if (!hasOwn(named, name)) return whole
    return html ? escapeHtml(display[name]) : stringify(display[name])
  })
  return html ? text : escapeHtml(text)
}

export const translateFilters: ShopifyFilterSet = {
  t: { status: 'approx', handler: translate },
  translate: { status: 'approx', handler: translate }
}
