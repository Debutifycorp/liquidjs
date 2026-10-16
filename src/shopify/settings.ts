import { Drop } from '../drop'
import type { Context } from '../context'
import type { Liquid } from '../liquid'
import type { Template } from '../template'
import { ColorDrop } from './objects/color'
import { ColorSchemeDrop } from './objects/color-scheme'
import { FontDrop } from './objects/font'
import { HandleMap } from './objects/handle-map'
import { ImageDrop } from './objects/image'
import type { ReportCollector, UnsupportedFeature } from './report'
import type { ShopifyServices } from './services'
import { STATE } from './state'
import type { ImageData } from './types'
import type { LiquidObject, StoreObjects } from './store/build'
import type { Translator } from './translations'
import { withPrefix } from './store/view'
import { escapeHtml } from './util/html'
import { isRecord, own, PLAIN_ID } from './util/own'
import { isSafeUrl, removeDocumentTags, sanitizeHtml } from './util/sanitize'

/** One entry of a `settings` array in a section, block or `settings_schema.json`. https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings */
export interface SettingDefinition {
  type: string
  id?: string
  default?: unknown
  [key: string]: unknown
}

export interface SettingsEnv {
  store: StoreObjects
  /** The request's `linklists`, for `link_list` settings. */
  linklists: HandleMap<LiquidObject>
  services: ShopifyServices
  translator: Translator
  report: ReportCollector
  /**
   * Which setting values print as written. Both default to false, which is Debutify's safety choice for themes whose settings are written by people or models it does not control, and it differs from Shopify, where a merchant's settings always print as entered (https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings). Shopify's editor only writes a value in its type's documented form, so the checks below cost fidelity only for out-of-form values that nothing in Shopify writes. Every value they reject is reported (`RenderReport.unsupported`) and replaced by the setting's default, or nil.
   *
   * Without `liquidSettings`, `liquid` settings print as escaped text. Without `htmlSettings`:
   * - `html` settings are sanitised, and `richtext` and `inline_richtext` always are;
   * - `url` and `video_url` values are dropped (feature `unsafe_url`) when they contain a quote, an angle bracket, a backtick, whitespace or a control character, which a URL never carries unencoded, or a character reference to a quote or a number (`&#`, `&quot`, `&apos`), or have a scheme other than `http`, `https`, `mailto` and `tel` (relative paths, `/…`, `#…` and `shopify://…` pass);
   * `select`, `radio` and `text_alignment` values must be one of the setting's options, `range` and `number` values finite numbers (a `range` is clamped to its `min` and `max`), `checkbox` values booleans, `color` values colours (`#rgb`, `#rrggbb`, `rgb()`, `hsl()` and their alpha forms), `color_background` values a colour or a gradient made of letters, digits and `#%.,()/+-` and spaces that calls only gradient and colour functions (not `url()`), and an `image_picker` given as data a URL-shaped `src` and numeric `width`, `height`, `id` and `focal_point`, and an `alt` whose apostrophes become typographic ones and that is free of double quotes, angle brackets, backticks and control characters (dropped, with the image kept, when it is not);
   * every other text-like value (`text`, `textarea`, a stored value no setting declares, a `default`) is passed through unchanged unless it contains `<`, when it goes through the sanitiser, so plain text stays byte-identical to Shopify and a theme's own `| escape` keeps working;
   * stored keys (undeclared setting ids and keys inside undeclared data) with a quote, an angle bracket, a backtick or a control character are dropped (feature `unsafe_key`), and so are colour-scheme ids with anything but letters, digits, `-` and `_` (feature `color_scheme`).
   *
   * The theme runtime (`renderPage`) holds section keys, block keys and block types, group types and the template `wrapper` to the same flag.
   *
   * `json` and `inspect` escape `<`, `>` and `&` whatever these say (see `jsonFilters`).
   */
  trust: { liquidSettings: boolean, htmlSettings: boolean }
  /**
   * The theme's colour schemes, which `color_scheme` settings choose from. A `SettingsDrop` built from definitions that hold a `color_scheme_group` uses its own group; for the settings of sections and blocks, pass the global settings' group: `colorSchemes: SettingsDrop.colorSchemes(globalSettings)`. Without a group a `color_scheme` setting is nil and reported as unsupported, which is what shopify.dev gives for a theme without `color_scheme_group` data.
   */
  colorSchemes?: HandleMap<ColorSchemeDrop>
  /** The prefix every URL of the page's view starts with (the base path, then the locale prefix; empty or absent for none), which a `url` setting that names a page of the shop takes. */
  prefix?: string
}

/**
 * A `liquid` setting's source. Shopify renders it where it is printed, accepting "HTML and limited Liquid markup" and withholding some objects and tags such as `section` and `settings` (https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings#liquid); this layer renders it with the printing place's scope and does not enforce that restriction. It prints as escaped text unless `SettingsEnv.trust.liquidSettings` is set.
 */
export class LiquidSetting {
  public constructor (public readonly source: string) {}
}

/** A `video_url` setting: prints as the URL; `id` and `type` name the video, https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings#video_url ("access to the `id` and `type` (YouTube or Vimeo) of the video"). The URL forms that are recognised are not listed by shopify.dev. */
export class VideoUrlDrop extends Drop {
  public readonly id: string | null
  public readonly type: 'youtube' | 'vimeo' | null

  public constructor (public readonly url: string) {
    super()
    const youtube = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/.exec(url)
    const vimeo = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url)
    this.id = youtube?.[1] ?? vimeo?.[1] ?? null
    this.type = youtube ? 'youtube' : vimeo ? 'vimeo' : null
  }

  public valueOf () {
    return this.url
  }
}

const VALUES = Symbol('values')
const TRUSTED = Symbol('trusted')
const SCHEMES = Symbol('colorSchemes')
const RESOURCE_URL = /^shopify:\/\/(collections|products|pages|blogs|policies)\/(.+)$/

/** The storefront path a `url` setting's `shopify://` value points at, under `prefix`; other values pass through, blanks are nil. shopify.dev documents the Liquid side only (a `url` setting is "a string that contains the selected URL", nil when empty, https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings#url); the stored `shopify://` forms are taken from exported themes and are on the "confirm on a development store" list. The prefix is the parity store's (scenario `page-home-fr-ca`: `shopify://collections/all` prints `/fr-ca/collections/all`); a path or an address written out is not a resource link and stays as written, which no recording pins. */
export function settingUrl (value: unknown, prefix = ''): string | null {
  if (typeof value !== 'string' || !value) return null
  if (value === 'shopify://search' || value === 'shopify://search/') return withPrefix(prefix, '/search')
  if (value === 'shopify://cart') return withPrefix(prefix, '/cart')
  const match = RESOURCE_URL.exec(value)
  return match ? withPrefix(prefix, `/${match[1]}/${match[2]}`) : value
}

function fromFileReference (value: unknown, prefix: string): string | undefined {
  return typeof value === 'string' && value.startsWith(prefix) ? value.slice(prefix.length) : undefined
}

const TRANSLATABLE = new Set(['text', 'textarea', 'richtext', 'inline_richtext', 'html', 'liquid'])

/** What a URL never carries unencoded: whitespace, control characters, quotes, angle brackets and the backtick. One of them in a URL setting could end the attribute or the element the URL is printed in. */
// eslint-disable-next-line no-control-regex
const UNSAFE_URL_CHARACTER = /[\s\u0000-\u001f\u007f-\u009f"'<>`]/
/** A character reference to a quote or to anything by number (`&#39;`, `&#x27;`, `&quot;`, `&apos;`), which a browser decodes inside an attribute value or a script string where the URL is printed: a pasted URL carries `&` but not these. */
const CHARACTER_REFERENCE = /&(?:#|quot|apos)/i
/** What a stored key or an option value must not carry, as it may be printed in text or in an attribute. */
// eslint-disable-next-line no-control-regex
const UNSAFE_KEY_CHARACTER = /["'<>`\u0000-\u001f\u007f-\u009f\u2028\u2029]/
/** A gradient as `color_background` stores it: function names, numbers, colours, units and separators, no quote, semicolon, brace, colon, backslash or angle bracket. */
const GRADIENT = /^[A-Za-z0-9#%.,()/+\s-]{1,2000}$/
/** The only CSS functions a `color_background` value may call when the theme is not trusted with html: the gradients and the colour notations (a function such as `url(` or `image-set(` would make the page fetch from a host the value names). */
const BACKGROUND_FUNCTIONS = /^(?:(?:repeating-)?(?:linear|radial|conic)-gradient|rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)$/
const NUMERIC = /^\s*-?\d+(?:\.\d+)?\s*$/

/** Reports a value that was rejected, without the value (the report may be shown as HTML), under `feature`. */
function reject (env: SettingsEnv, feature: UnsupportedFeature, definition: SettingDefinition, reason: string): void {
  env.report.unsupported(feature, `${[definition.type, 'setting', definition.id].filter(Boolean).join(' ')} ${reason}`)
}

/** A text-like value as it prints: unchanged, unless the theme is not trusted with html and the value contains `<`, when it goes through the sanitiser. See `SettingsEnv.trust`. */
function safeText (value: string, env: SettingsEnv): string {
  return env.trust.htmlSettings || !value.includes('<') ? value : sanitizeHtml(value)
}

/** Stored data no setting declares (and nested data inside it), made safe the way `safeText` makes a string safe; keys with an unsafe character are dropped and reported. */
function safeData (value: unknown, env: SettingsEnv, depth = 0): unknown {
  if (typeof value === 'string') return safeText(value, env)
  if (env.trust.htmlSettings || !value || typeof value !== 'object') return value
  if (depth > 8) return null
  if (Array.isArray(value)) return value.map(item => safeData(item, env, depth + 1))
  return Object.fromEntries(Object.entries(value).filter(([key]) => safeKey(key, env)).map(([key, item]) => [key, safeData(item, env, depth + 1)]))
}

/** Whether a stored key may be kept; a key with an unsafe character is reported (without the key) and dropped, unless the theme is trusted with html. */
function safeKey (key: string, env: SettingsEnv): boolean {
  if (env.trust.htmlSettings || !UNSAFE_KEY_CHARACTER.test(key)) return true
  env.report.unsupported('unsafe_key', 'a stored settings key with a quote, angle bracket, backtick or control character was dropped')
  return false
}

/** A URL setting's value as it prints: unchanged for trusted themes; otherwise it must have none of the characters a URL never carries unencoded, no character reference to a quote or a number, and only a relative or Shopify route or the schemes `http`, `https`, `mailto` and `tel`, or it is dropped and reported (feature `unsafe_url`). */
function safeUrl (definition: SettingDefinition, url: string | null, env: SettingsEnv): string | null {
  if (url === null || env.trust.htmlSettings) return url
  if (UNSAFE_URL_CHARACTER.test(url) || CHARACTER_REFERENCE.test(url)) {
    reject(env, 'unsafe_url', definition, 'has a URL with a quote, angle bracket, backtick, space, control character or character reference and was dropped')
    return null
  }
  if (url.startsWith('shopify://') || isSafeUrl(url)) return url
  reject(env, 'unsafe_url', definition, 'has a URL scheme other than http, https, mailto or tel and was dropped')
  return null
}

const rawOptionValues = (definition: SettingDefinition): string[] => Array.isArray(definition.options) ? definition.options.map(option => isRecord(option) ? option.value : undefined).filter((value): value is string => typeof value === 'string') : []
const optionValues = (definition: SettingDefinition): string[] => rawOptionValues(definition).filter(value => !UNSAFE_KEY_CHARACTER.test(value))

/**
 * A `select`, `radio` or `text_alignment` value. Without a saved value, the setting's `default`; with no `default` either, the first option ("If `default` is unspecified, then the first option is selected by default", for `select` and `radio`; "If no default is set, `left` applies", for `text_alignment`). Untrusted themes only get one of the setting's options, except that a `select` or `radio` keeps a saved value that is no longer an option when it is a plain token (`PLAIN_ID`, see below); any other saved value that is not an option is replaced by the default if that is an option, else (when the setting has no `default`) by the first option, else nil, and reported. https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings (`select` and `radio` "return a string", the chosen option's `value`; `text_alignment` accepts `left`, `right` and `center`).
 */
function choice (definition: SettingDefinition, stored: unknown, env: SettingsEnv): unknown {
  const alignment = definition.type === 'text_alignment'
  const options = alignment ? ['left', 'center', 'right'] : env.trust.htmlSettings ? rawOptionValues(definition) : optionValues(definition)
  const first = alignment ? 'left' : options[0] ?? null
  const fallback = definition.default === undefined ? first : !env.trust.htmlSettings && !(typeof definition.default === 'string' && options.includes(definition.default)) ? null : definition.default
  if (env.trust.htmlSettings) return stored === undefined ? fallback : stored
  if (typeof stored === 'string' && options.includes(stored)) return stored
  // as the parity store renders it (scenario `page-faq`: the template stores `"layout": "none"` for a select whose options are `vertical` and `horizontal`, and the section prints `layout-none`): a saved value that is no longer an option still prints. Only a `select` or `radio` keeps one, and only a plain token, so nothing it carries can leave an attribute, a class name or a CSS selector
  if (!alignment && typeof stored === 'string' && PLAIN_ID.test(stored)) return stored
  if (stored !== undefined) reject(env, 'invalid_setting', definition, 'has a value that is not one of its options and was replaced by its default')
  return fallback
}

/** A finite number from a stored number or numeric string, else undefined. */
function toNumber (value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : typeof value === 'string' && NUMERIC.test(value) ? Number(value) : NaN
  return Number.isFinite(number) ? number : undefined
}

/** A `range` or `number` value: untrusted themes only get a finite number, clamped to a `range`'s `min` and `max`; else the default, else nil. https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings (`range`, `number`: "data is returned as a number"). */
function numeric (definition: SettingDefinition, stored: unknown, env: SettingsEnv): unknown {
  if (env.trust.htmlSettings) return stored === undefined ? definition.default ?? null : stored
  let number = toNumber(stored === undefined ? definition.default : stored)
  if (number === undefined && stored !== undefined) {
    reject(env, 'invalid_setting', definition, 'has a value that is not a number and was replaced by its default')
    number = toNumber(definition.default)
  }
  if (number === undefined) return null
  const { min, max } = definition
  const clamped = definition.type === 'range' ? Math.min(typeof max === 'number' ? max : Infinity, Math.max(typeof min === 'number' ? min : -Infinity, number)) : number
  if (clamped !== number) reject(env, 'invalid_setting', definition, 'has a value outside its min and max and was clamped')
  return clamped
}

/** A `checkbox` value: untrusted themes only get a boolean, else the default if that is one, else false. https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings (`checkbox`: "If `default` is unspecified, then the value is `false` by default"). */
function boolean (definition: SettingDefinition, stored: unknown, env: SettingsEnv): unknown {
  if (env.trust.htmlSettings) return stored === undefined ? definition.default ?? false : stored
  if (typeof stored === 'boolean') return stored
  if (stored !== undefined) reject(env, 'invalid_setting', definition, 'has a value that is not a boolean and was replaced by its default')
  return typeof definition.default === 'boolean' ? definition.default : false
}

/** A `color` value: untrusted themes only get a colour `ColorDrop.from` reads, else the default if that is one, else nil. https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings (`color` returns a `color` object, blank when nothing is selected). */
function colour (definition: SettingDefinition, stored: unknown, env: SettingsEnv): unknown {
  const value = stored === undefined ? definition.default : stored
  if (value === undefined || value === null || value === '') return value ?? null
  const drop = typeof value === 'string' ? ColorDrop.from(value) : undefined
  if (drop) return drop
  if (env.trust.htmlSettings) return value
  reject(env, 'invalid_setting', definition, 'has a value that is not a colour and was replaced by its default')
  const fallback = stored !== undefined && typeof definition.default === 'string' ? ColorDrop.from(definition.default) : undefined
  return fallback ?? null
}

/** The names of the CSS functions a value calls: each word before a parenthesis, in lower case. */
const functionsOf = (value: string): string[] => (value.match(/[A-Za-z-]+(?=\s*\()/g) ?? []).map(name => name.toLowerCase())

/** A `color_background` value: a string, https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings ("a string", an empty one when nothing is entered); untrusted themes only get a colour or a gradient of the characters `GRADIENT` allows that calls only the functions `BACKGROUND_FUNCTIONS` lists, else the default if that is one, else nil. */
function background (definition: SettingDefinition, stored: unknown, env: SettingsEnv): unknown {
  const value = stored === undefined ? definition.default : stored
  if (env.trust.htmlSettings || value === undefined || value === null) return value ?? null
  const ok = (candidate: unknown): candidate is string => typeof candidate === 'string' && (candidate === '' || !!ColorDrop.from(candidate) || (GRADIENT.test(candidate) && functionsOf(candidate).every(name => BACKGROUND_FUNCTIONS.test(name))))
  if (ok(value)) return value
  reject(env, 'invalid_setting', definition, 'has a value that is not a colour or gradient and was replaced by its default')
  return stored !== undefined && ok(definition.default) ? definition.default : null
}

/** The `alt` of an `image_picker` stored as data, for a theme that is not trusted with html (`imageData` has returned the image as it is for one that is). Themes print it in an `alt` attribute (Dawn escapes it, others do not), so an apostrophe becomes a typographic one (U+2019, as in `Women’s`), which reads the same and cannot end a single-quoted attribute; an alt that still holds a double quote, angle bracket, backtick or control character is dropped, and the image stays, and the alt is reported (feature `invalid_setting`) without its text. */
function safeAlt (definition: SettingDefinition, alt: string, env: SettingsEnv): { alt?: string } {
  const typographic = alt.replace(/'/g, '\u2019')
  if (!UNSAFE_KEY_CHARACTER.test(typographic)) return { alt: typographic }
  reject(env, 'invalid_setting', definition, 'has an image alt with a quote, angle bracket, backtick or control character and the alt was dropped')
  return {}
}

/** An `image_picker` stored as data rather than as a file reference: untrusted themes get an image only when its `src` has the shape of a URL with a safe scheme, and its numbers are numbers, and its `alt` is dropped when it is not quote-free (see `safeAlt`), so no field can carry markup or an attribute. */
function imageData (definition: SettingDefinition, value: Record<string, unknown>, env: SettingsEnv): ImageDrop | null {
  const trusted = env.trust.htmlSettings
  if (typeof value.src !== 'string' || !value.src) return null
  if (!trusted && (UNSAFE_URL_CHARACTER.test(value.src) || CHARACTER_REFERENCE.test(value.src) || !isSafeUrl(value.src))) {
    reject(env, 'unsafe_url', definition, 'has an image whose src is not a safe URL and was dropped')
    return null
  }
  if (trusted) return new ImageDrop(value as unknown as ImageData)
  const focal = isRecord(value.focal_point) && toNumber(value.focal_point.x) !== undefined && toNumber(value.focal_point.y) !== undefined ? { x: toNumber(value.focal_point.x) as number, y: toNumber(value.focal_point.y) as number } : undefined
  return new ImageDrop({
    src: value.src,
    ...(typeof value.width === 'number' && Number.isFinite(value.width) ? { width: value.width } : {}),
    ...(typeof value.height === 'number' && Number.isFinite(value.height) ? { height: value.height } : {}),
    ...(typeof value.id === 'number' && Number.isFinite(value.id) ? { id: value.id } : {}),
    ...(typeof value.alt === 'string' ? safeAlt(definition, value.alt, env) : {}),
    ...(focal ? { focal_point: focal } : {})
  })
}

/**
 * Converts one stored value (or the definition's default) into what Liquid sees for that setting type, as https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings lists them: `color` a `color` object, `font_picker` a `font`, `image_picker` an `image` (nil when unset or missing), `video` a `video`, `video_url` the URL with `id` and `type`, `url` a string, `link_list` a `linklist`, `product`, `collection`, `page`, `blog` and `article` their objects, and the list types arrays of them (missing entries are dropped and reported). Text-like defaults written as `t:` keys read the schema locales. Without `SettingsEnv.trust` every type is held to its documented form: `liquid` settings stay escaped, `html` settings are sanitised, and `url`, `select`, `radio`, `text_alignment`, `range`, `number`, `checkbox`, `color`, `color_background` and `image_picker` values that are not in their type's form are replaced and reported; `richtext` and `inline_richtext` are always sanitised. Other types pass their value through, made safe like text.
 */
export function resolveSettingValue (definition: SettingDefinition, stored: unknown, env: SettingsEnv): unknown {
  let value = stored === undefined ? definition.default : stored
  if (TRANSLATABLE.has(definition.type) && typeof value === 'string' && value.startsWith('t:')) value = env.translator.schemaText(value)
  // https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings: for `text`, `textarea`, `html`, `richtext`, `inline_richtext` and `liquid`, "An `empty` object, if nothing has been entered". The empty string is what `== empty` and `== blank` match, prints as nothing and is not nil, as that object is.
  if (TRANSLATABLE.has(definition.type) && (value === undefined || value === null || value === '')) return ''
  switch (definition.type) {
    case 'color':
      return colour(definition, stored, env)
    case 'color_background':
      return background(definition, stored, env)
    case 'select':
    case 'radio':
    case 'text_alignment':
      return choice(definition, stored, env)
    case 'range':
    case 'number':
      return numeric(definition, stored, env)
    case 'checkbox':
      return boolean(definition, stored, env)
    case 'color_scheme_group':
      return buildColorSchemes(definition, stored, env)
    case 'color_scheme': {
      const group = env.colorSchemes
      if (!group) {
        env.report.unsupported('color_scheme', `${definition.id ?? 'color_scheme'} has no color_scheme_group data`)
        return null
      }
      // The order shopify.dev gives: the selected scheme, the setting's default, the group's first scheme, nil.
      const pick = (id: unknown) => typeof id === 'string' ? HandleMap.get(group, id) : undefined
      return pick(stored) ?? pick(definition.default) ?? HandleMap.values(group)[0] ?? null
    }
    case 'font_picker': {
      const info = typeof value === 'string' ? env.services.fontInfo(value) : undefined
      if (!info && value) env.report.unsupported('font_picker', `${['font_picker', 'setting', definition.id].filter(Boolean).join(' ')} has a font that is not known`)
      return info ? new FontDrop(info, env.services.fontInfo) : null
    }
    case 'image_picker': {
      if (value && typeof value === 'object') {
        if (value instanceof ImageDrop) return value
        return isRecord(value) ? imageData(definition, value, env) : null
      }
      const name = fromFileReference(value, 'shopify://shop_images/')
      const found = name === undefined ? undefined : HandleMap.get(env.store.images, name)
      if (name !== undefined && !found) env.report.missing('resource', `image of setting ${definition.id ?? 'image_picker'}`)
      return found ?? null
    }
    case 'video': {
      const name = fromFileReference(value, 'shopify://files/videos/')
      return name === undefined ? null : own(env.store.videos, name) ?? null
    }
    case 'video_url': {
      const url = safeUrl(definition, typeof value === 'string' && value ? value : null, env)
      return url ? new VideoUrlDrop(url) : null
    }
    case 'url':
      return safeUrl(definition, settingUrl(value, env.prefix), env)
    case 'product':
      return lookup(env, definition, env.store.products, value, 'product')
    case 'collection':
      return lookup(env, definition, env.store.collections, value, 'collection')
    case 'page':
      return lookup(env, definition, env.store.pages, value, 'page')
    case 'blog':
      return lookup(env, definition, env.store.blogs, value, 'blog')
    case 'article':
      return lookup(env, definition, env.store.articles, value, 'article')
    case 'link_list':
      return lookup(env, definition, env.linklists, value, 'menu')
    case 'product_list':
      return Array.isArray(value) ? value.map(handle => lookup(env, definition, env.store.products, handle, 'product')).filter(Boolean) : []
    case 'collection_list':
      return Array.isArray(value) ? value.map(handle => lookup(env, definition, env.store.collections, handle, 'collection')).filter(Boolean) : []
    case 'liquid':
      return typeof value === 'string' ? new LiquidSetting(value) : null
    case 'html':
      return typeof value === 'string' ? (env.trust.htmlSettings ? removeDocumentTags(value) : sanitizeHtml(value)) : null
    case 'richtext':
    case 'inline_richtext':
      return typeof value === 'string' ? sanitizeHtml(value) : null
    // Also `metaobject` and `metaobject_list`, which https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings returns as objects or blank: this package holds no metaobjects, so a stored value is data, and a string follows the text rule like the text of any setting no case above names.
    default:
      return typeof value === 'string' ? safeText(value, env) : safeData(value ?? null, env)
  }
}

/**
 * A `color_scheme_group` setting as `settings.color_schemes` reads it: the schemes saved for the theme, each as a `color_scheme` object. The saved data is `{ "<scheme id>": { "settings": { … } } }`; every setting the group's `definition` declares is resolved like any other setting (defaults from the schema, `color` settings as `color` objects). A theme with no saved schemes has an empty group. The `role` attribute maps definition ids to the editor's preview and has no effect in Liquid, so it is not read.
 *
 * https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings (`color_scheme_group`: `definition`, `role`), https://shopify.dev/docs/api/liquid/objects/color_scheme_group (`{% for scheme in settings.color_schemes %}`), https://shopify.dev/docs/api/liquid/objects/color_scheme. shopify.dev documents the Liquid side only: the saved shape above is taken from exported themes, and whether a group can be looked up by scheme id (`settings.color_schemes['scheme-1']`) is not pinned, so this one can.
 */
function buildColorSchemes (definition: SettingDefinition, stored: unknown, env: SettingsEnv): HandleMap<ColorSchemeDrop> {
  const fields = Array.isArray(definition.definition) ? definition.definition.filter(isRecord) as SettingDefinition[] : []
  const schemes: Array<[string, ColorSchemeDrop]> = []
  for (const [id, entry] of isRecord(stored) ? Object.entries(stored) : []) {
    if (!env.trust.htmlSettings && !PLAIN_ID.test(id)) {
      reject(env, 'color_scheme', definition, 'has a color scheme whose id has characters other than letters, digits, - and _ and was dropped')
      continue
    }
    const saved = isRecord(entry) && isRecord(entry.settings) ? entry.settings : {}
    const settings: Array<[string, unknown]> = []
    for (const field of fields) {
      if (field.id) settings.push([field.id, resolveSettingValue(field, own(saved, field.id), env)])
    }
    for (const [key, value] of Object.entries(saved)) {
      if (!fields.some(field => field.id === key) && safeKey(key, env)) settings.push([key, safeData(value, env)])
    }
    schemes.push([id, new ColorSchemeDrop(id, Object.fromEntries(settings))])
  }
  return new HandleMap(schemes)
}

/** The object a handle names, or nil. A handle that names nothing is reported by the setting's id, never by the handle, as the handle is saved data and the report may be shown as HTML. */
function lookup (env: SettingsEnv, definition: SettingDefinition, map: HandleMap<LiquidObject>, handle: unknown, kind: string): LiquidObject | null {
  if (typeof handle !== 'string' || !handle) return null
  const found = HandleMap.get(map, handle)
  if (!found) env.report.missing('resource', `${kind} of setting ${definition.id ?? definition.type}`)
  return found ?? null
}

/** The templates of each `liquid` setting once parsed. Kept off the setting, so the parse cache is not part of what `json` and `inspect` walk. */
const PARSED = new WeakMap<LiquidSetting, Template[]>()

/** How many `liquid` settings may be rendering inside one another; a setting that prints `settings` again would otherwise recurse until a render limit stops it. */
const MAX_LIQUID_SETTING_DEPTH = 5
/** The render's Shopify state is shared by its partials (`render`, `include`, sections and blocks), where a `Context` is not, so the depth is counted per state. */
const DEPTH = new WeakMap<object, number>()
const depthKey = (ctx: Context): object => (ctx.globals as Record<symbol, object | undefined>)[STATE] ?? ctx

/**
 * A `settings` object (global, section or block), https://shopify.dev/docs/api/liquid/objects/settings (global) and https://shopify.dev/docs/api/liquid/objects/section (`section.settings`, `block.settings`). Settings saved as `null` or left out, as a block's often are, read as empty and the schema defaults apply. Values are not own properties, so a setting id such as `size`, `values`, `first` or `last` never collides with a drop member; the drop's own members (`toJSON`, `liquidMethodMissing`) and the ones every JavaScript object has (`constructor`, `toString`, `valueOf`, `hasOwnProperty`, `__proto__`) still win over a setting of the same name, so a setting with such an id reads as empty, as `[object Object]`, as `false` or as a `Liquid error` (`{{ s.constructor }}` prints nothing, `{{ s.toString }}` prints `[object Object]`, `{{ s.hasOwnProperty }}` prints `false`, and `{{ s.toJSON }}` raises "Cannot convert object to primitive value"; on the Task 12 list, and no theme names a setting that). Values stored without a definition (settings of a removed schema entry) are kept, and made safe like text. `liquid` settings are escaped text unless the theme is trusted (`SettingsEnv.trust.liquidSettings`, a Debutify safety choice that differs from Shopify), in which case they render where they are printed, with the scope of that place, to at most `MAX_LIQUID_SETTING_DEPTH` levels. `json` and `inspect` print the same strings `{{ settings.x }}` does, never a `liquid` setting's raw source.
 */
export class SettingsDrop extends Drop {
  private readonly [VALUES] = new Map<string, unknown>()
  private readonly [TRUSTED]: boolean
  private readonly [SCHEMES]?: HandleMap<ColorSchemeDrop>

  public constructor (definitions: SettingDefinition[] | null = [], stored: Record<string, unknown> | null = {}, env: SettingsEnv) {
    super()
    this[TRUSTED] = env.trust.liquidSettings
    const values = isRecord(stored) ? stored : {}
    const list = (Array.isArray(definitions) ? definitions : []).filter(definition => isRecord(definition) && definition.id)
    // The colour schemes come first: `color_scheme` settings of the same list choose from them.
    for (const definition of list.filter(item => item.type === 'color_scheme_group')) {
      const group = resolveSettingValue(definition, own(values, definition.id as string), env) as HandleMap<ColorSchemeDrop>
      this[VALUES].set(definition.id as string, group)
      this[SCHEMES] = this[SCHEMES] ?? group
    }
    const withSchemes = this[SCHEMES] ? { ...env, colorSchemes: this[SCHEMES] } : env
    for (const definition of list.filter(item => item.type !== 'color_scheme_group')) {
      this[VALUES].set(definition.id as string, resolveSettingValue(definition, own(values, definition.id as string), withSchemes))
    }
    for (const [id, value] of Object.entries(values)) {
      if (!this[VALUES].has(id) && safeKey(id, env)) this[VALUES].set(id, safeData(value, env))
    }
  }

  /** The colour schemes of a settings object whose definitions hold a `color_scheme_group` (the global settings), to pass as `SettingsEnv.colorSchemes` when building the settings of sections and blocks. */
  public static colorSchemes (settings: SettingsDrop): HandleMap<ColorSchemeDrop> | undefined {
    return settings[SCHEMES]
  }

  /** The resolved value of a setting, for code (templates read settings as properties). */
  public static value (settings: SettingsDrop, id: string): unknown {
    return settings[VALUES].get(id)
  }

  public liquidMethodMissing (key: string | number, ctx?: Context): unknown {
    const value = this[VALUES].get(String(key))
    if (!(value instanceof LiquidSetting)) return value
    if (!this[TRUSTED] || !ctx) return escapeHtml(value.source)
    return renderLiquidSetting(value, ctx)
  }

  /** What `json` and `inspect` print: the settings as templates read them, a `liquid` setting as its string (escaped unless trusted). */
  public toJSON () {
    return Object.fromEntries([...this[VALUES]].map(([id, value]) => [id, value instanceof LiquidSetting ? (this[TRUSTED] ? value.source : escapeHtml(value.source)) : value]))
  }
}

function * renderLiquidSetting (setting: LiquidSetting, ctx: Context): Generator<unknown, string, unknown> {
  const key = depthKey(ctx)
  const depth = DEPTH.get(key) ?? 0
  if (depth >= MAX_LIQUID_SETTING_DEPTH) throw new Error(`liquid setting is nested more than ${MAX_LIQUID_SETTING_DEPTH} levels deep`)
  const liquid = ctx.liquid as Liquid
  let templates = PARSED.get(setting)
  if (!templates) {
    try {
      templates = liquid.parse(setting.source)
    } catch (err) {
      return `Liquid syntax error: ${(err as Error).message}`
    }
    PARSED.set(setting, templates)
  }
  DEPTH.set(key, depth + 1)
  try {
    return (yield liquid.renderer.renderTemplates(templates, ctx)) as string
  } finally {
    DEPTH.set(key, depth)
  }
}
