import type { LocaleTree } from './types'

export interface TranslationsInput {
  /** The locale being rendered (`fr`). */
  locale: string
  /** The theme's default locale: the one with a `locales/<locale>.default.json` file. */
  defaultLocale: string
  /** Storefront locale files by locale (`locales/fr.json` as `fr`, `locales/en.default.json` as `en`). */
  locales: Record<string, LocaleTree>
  /** Schema locale files by locale (`locales/fr.schema.json` as `fr`), used for `t:` strings in schemas. */
  schemaLocales?: Record<string, LocaleTree>
}

/** The `locales` of the section schema being rendered, reachable as `sections.<type>.<key>`. */
export interface SectionLocales {
  type: string
  locales: Record<string, LocaleTree>
}

function dig (tree: LocaleTree | undefined, path: string[]): string | LocaleTree | undefined {
  let node: string | LocaleTree | undefined = tree
  for (const part of path) {
    if (!node || typeof node !== 'object' || !Object.prototype.hasOwnProperty.call(node, part)) return undefined
    node = node[part]
  }
  return node
}

function forLocale<T> (map: Record<string, T> | undefined, locale: string): T | undefined {
  if (!map) return undefined
  if (Object.prototype.hasOwnProperty.call(map, locale)) return map[locale]
  const language = locale.split('-')[0]
  return Object.prototype.hasOwnProperty.call(map, language) ? map[language] : undefined
}

/**
 * Translation lookup with Shopify's sources: the storefront locale file of the locale being rendered, then the default locale's file, each followed by the section schema's `locales` for `sections.<type>.<key>` keys. https://shopify.dev/docs/storefronts/themes/architecture/locales/storefront-locale-files and https://shopify.dev/docs/storefronts/themes/architecture/sections/section-schema#locales
 *
 * The file naming (`fr-CA.json`, or the 2-letter `fr.json` when a language is not region specific) is on the first page. That page does not say that a missing key falls back to the default locale, that `fr-CA` falls back to `fr`, or in which order a locale file and a section's `locales` are searched, so these three are not pinned by shopify.dev and go on the "confirm on a development store" list.
 */
export class Translator {
  public readonly locale: string
  public readonly defaultLocale: string

  public constructor (private readonly input: TranslationsInput) {
    this.locale = input.locale
    this.defaultLocale = input.defaultLocale
  }

  public lookup (key: string, section?: SectionLocales): string | LocaleTree | undefined {
    const path = key.split('.')
    const locales = this.locale === this.defaultLocale ? [this.locale] : [this.locale, this.defaultLocale]
    for (const locale of locales) {
      const fromFile = dig(forLocale(this.input.locales, locale), path)
      if (fromFile !== undefined) return fromFile
      if (section && path[0] === 'sections' && path[1] === section.type) {
        const fromSchema = dig(forLocale(section.locales, locale), path.slice(2))
        if (fromSchema !== undefined) return fromSchema
      }
    }
    return undefined
  }

  /** A schema string: `t:sections.header.name` resolved through the schema locale files, anything else unchanged. https://shopify.dev/docs/storefronts/themes/architecture/locales/schema-locale-files (`"name": "t:sections.product.name"` in a `{% schema %}`). The page does not say what a missing key prints; the `t:` string is kept, which is not pinned. */
  public schemaText (value: unknown): unknown {
    if (typeof value !== 'string' || !value.startsWith('t:')) return value
    const path = value.slice(2).split('.')
    for (const locale of [this.locale, this.defaultLocale]) {
      const text = dig(forLocale(this.input.schemaLocales, locale), path)
      if (typeof text === 'string') return text
    }
    return value
  }
}

export function emptyTranslator (locale = 'en'): Translator {
  return new Translator({ locale, defaultLocale: locale, locales: {} })
}
