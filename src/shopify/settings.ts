import { Drop } from '../drop'
import type { Context } from '../context'
import type { Liquid } from '../liquid'
import type { Template } from '../template'
import { ColorDrop } from './objects/color'
import { FontDrop } from './objects/font'
import { HandleMap } from './objects/handle-map'
import { ImageDrop } from './objects/image'
import type { ReportCollector } from './report'
import type { ShopifyServices } from './services'
import type { LiquidObject, StoreObjects } from './store/build'
import type { Translator } from './translations'
import { escapeHtml } from './util/html'
import { own } from './util/own'
import { isSafeUrl, sanitizeHtml } from './util/sanitize'

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
   * Which setting values print as written. Both default to false, which is Debutify's safety choice for themes written by people or models it does not control, and it differs from Shopify, where a merchant's settings always print as entered (https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings).
   *
   * Without `liquidSettings`, `liquid` settings print as escaped text. Without `htmlSettings`: `html` settings are sanitised; a `url` or `video_url` setting whose scheme is not `http`, `https`, `mailto` or `tel`, or a relative or Shopify route (`/…`, `#…`, `shopify://…`), is dropped (prints empty) and reported as unsupported; and every other text-like value (`text`, `textarea`, `select`, a stored value no setting declares, a `default`) is passed through unchanged unless it contains `<`, when it goes through the sanitiser. Plain text therefore stays byte-identical to Shopify, so a theme's own `| escape` keeps working. `richtext` and `inline_richtext` are always sanitised, whatever this says.
   */
  trust: { liquidSettings: boolean, htmlSettings: boolean }
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
const RESOURCE_URL = /^shopify:\/\/(collections|products|pages|blogs|policies)\/(.+)$/

/** The storefront path a `url` setting's `shopify://` value points at; other values pass through, blanks are nil. shopify.dev documents the Liquid side only (a `url` setting is "a string that contains the selected URL", nil when empty, https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings#url); the stored `shopify://` forms are taken from exported themes and are on the "confirm on a development store" list. */
export function settingUrl (value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  if (value === 'shopify://search' || value === 'shopify://search/') return '/search'
  if (value === 'shopify://cart') return '/cart'
  const match = RESOURCE_URL.exec(value)
  return match ? `/${match[1]}/${match[2]}` : value
}

function fromFileReference (value: unknown, prefix: string): string | undefined {
  return typeof value === 'string' && value.startsWith(prefix) ? value.slice(prefix.length) : undefined
}

const TRANSLATABLE = new Set(['text', 'textarea', 'richtext', 'inline_richtext', 'html', 'liquid'])

/** A text-like value as it prints: unchanged, unless the theme is not trusted with html and the value contains `<`, when it goes through the sanitiser. See `SettingsEnv.trust`. */
function safeText (value: string, env: SettingsEnv): string {
  return env.trust.htmlSettings || !value.includes('<') ? value : sanitizeHtml(value)
}

/** Stored data no setting declares (and nested data inside it), made safe the way `safeText` makes a string safe. */
function safeData (value: unknown, env: SettingsEnv, depth = 0): unknown {
  if (typeof value === 'string') return safeText(value, env)
  if (env.trust.htmlSettings || !value || typeof value !== 'object') return value
  if (depth > 8) return null
  if (Array.isArray(value)) return value.map(item => safeData(item, env, depth + 1))
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, safeData(item, env, depth + 1)]))
}

/** A URL setting's value as it prints: unchanged for trusted themes; otherwise only relative and Shopify routes and the schemes `http`, `https`, `mailto` and `tel` pass, and anything else is dropped and reported. */
function safeUrl (definition: SettingDefinition, url: string | null, env: SettingsEnv): string | null {
  if (url === null || env.trust.htmlSettings || url.startsWith('shopify://') || isSafeUrl(url)) return url
  env.report.unsupported('unsafe_url', `${[definition.type, 'setting', definition.id].filter(Boolean).join(' ')} has a URL scheme other than http, https, mailto or tel and was dropped`)
  return null
}

/**
 * Converts one stored value (or the definition's default) into what Liquid sees for that setting type, as https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings lists them: `color` a `color` object, `font_picker` a `font`, `image_picker` an `image` (nil when unset or missing), `video` a `video`, `video_url` the URL with `id` and `type`, `url` a string, `link_list` a `linklist`, `product`, `collection`, `page`, `blog` and `article` their objects, and the list types arrays of them (missing entries are dropped and reported). Text-like defaults written as `t:` keys read the schema locales. `liquid` settings stay escaped unless trusted and `html` settings are sanitised unless trusted; `richtext` and `inline_richtext` are always sanitised (see `SettingsEnv.trust`). Other types pass their value through.
 */
export function resolveSettingValue (definition: SettingDefinition, stored: unknown, env: SettingsEnv): unknown {
  let value = stored === undefined ? definition.default : stored
  if (TRANSLATABLE.has(definition.type) && typeof value === 'string' && value.startsWith('t:')) value = env.translator.schemaText(value)
  switch (definition.type) {
    case 'color': {
      if (typeof value !== 'string' || !value) return value ?? null
      return ColorDrop.from(value) ?? safeText(value, env)
    }
    case 'font_picker': {
      const info = typeof value === 'string' ? env.services.fontInfo(value) : undefined
      if (!info && value) env.report.unsupported('font_picker', `unknown font ${String(value)}`)
      return info ? new FontDrop(info, env.services.fontInfo) : null
    }
    case 'image_picker': {
      if (value && typeof value === 'object') {
        if (value instanceof ImageDrop) return value
        const data = safeData(value, env) as { src?: unknown } | null
        return data && typeof data.src === 'string' && (env.trust.htmlSettings || isSafeUrl(data.src)) ? new ImageDrop(data as never) : null
      }
      const name = fromFileReference(value, 'shopify://shop_images/')
      const found = name === undefined ? undefined : HandleMap.get(env.store.images, name)
      if (name !== undefined && !found) env.report.missing('resource', `image ${name}`)
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
      return safeUrl(definition, settingUrl(value), env)
    case 'product':
      return lookup(env, env.store.products, value, 'product')
    case 'collection':
      return lookup(env, env.store.collections, value, 'collection')
    case 'page':
      return lookup(env, env.store.pages, value, 'page')
    case 'blog':
      return lookup(env, env.store.blogs, value, 'blog')
    case 'article':
      return lookup(env, env.store.articles, value, 'article')
    case 'link_list':
      return lookup(env, env.linklists, value, 'menu')
    case 'product_list':
      return Array.isArray(value) ? value.map(handle => lookup(env, env.store.products, handle, 'product')).filter(Boolean) : []
    case 'collection_list':
      return Array.isArray(value) ? value.map(handle => lookup(env, env.store.collections, handle, 'collection')).filter(Boolean) : []
    case 'liquid':
      return typeof value === 'string' ? new LiquidSetting(value) : null
    case 'html':
      return typeof value === 'string' ? (env.trust.htmlSettings ? value : sanitizeHtml(value)) : null
    case 'richtext':
    case 'inline_richtext':
      return typeof value === 'string' ? sanitizeHtml(value) : null
    default:
      return typeof value === 'string' ? safeText(value, env) : safeData(value ?? null, env)
  }
}

function lookup (env: SettingsEnv, map: HandleMap<LiquidObject>, handle: unknown, kind: string): LiquidObject | null {
  if (typeof handle !== 'string' || !handle) return null
  const found = HandleMap.get(map, handle)
  if (!found) env.report.missing('resource', `${kind} ${handle}`)
  return found ?? null
}

/** The templates of each `liquid` setting once parsed. Kept off the setting, so the parse cache is not part of what `json` and `inspect` walk. */
const PARSED = new WeakMap<LiquidSetting, Template[]>()

/** How many `liquid` settings may be rendering inside one another; a setting that prints `settings` again would otherwise recurse until a render limit stops it. */
const MAX_LIQUID_SETTING_DEPTH = 5
const DEPTH = new WeakMap<Context, number>()

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

/**
 * A `settings` object (global, section or block), https://shopify.dev/docs/api/liquid/objects/settings (global) and https://shopify.dev/docs/api/liquid/objects/section (`section.settings`, `block.settings`). Settings saved as `null` or left out, as a block's often are, read as empty and the schema defaults apply. Values are not own properties, so a setting id such as `size`, `values`, `first` or `last` never collides with a drop member; the drop's own members (`toJSON`, `liquidMethodMissing`) and the ones every JavaScript object has (`constructor`, `toString`, `valueOf`, `hasOwnProperty`, `__proto__`) still win over a setting of the same name, so a setting with such an id reads as empty or as `[object Object]` (on the Task 12 list; no theme names a setting that). Values stored without a definition (settings of a removed schema entry) are kept, and made safe like text. `liquid` settings are escaped text unless the theme is trusted (`SettingsEnv.trust.liquidSettings`, a Debutify safety choice that differs from Shopify), in which case they render where they are printed, with the scope of that place, to at most `MAX_LIQUID_SETTING_DEPTH` levels. `json` and `inspect` print the same strings `{{ settings.x }}` does, never a `liquid` setting's raw source.
 */
export class SettingsDrop extends Drop {
  private readonly [VALUES] = new Map<string, unknown>()
  private readonly [TRUSTED]: boolean

  public constructor (definitions: SettingDefinition[] | null = [], stored: Record<string, unknown> | null = {}, env: SettingsEnv) {
    super()
    this[TRUSTED] = env.trust.liquidSettings
    const values = isRecord(stored) ? stored : {}
    for (const definition of Array.isArray(definitions) ? definitions : []) {
      if (isRecord(definition) && definition.id) this[VALUES].set(definition.id, resolveSettingValue(definition, own(values, definition.id), env))
    }
    for (const [id, value] of Object.entries(values)) {
      if (!this[VALUES].has(id)) this[VALUES].set(id, safeData(value, env))
    }
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
  const depth = DEPTH.get(ctx) ?? 0
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
  DEPTH.set(ctx, depth + 1)
  try {
    return (yield liquid.renderer.renderTemplates(templates, ctx)) as string
  } finally {
    DEPTH.set(ctx, depth)
  }
}
