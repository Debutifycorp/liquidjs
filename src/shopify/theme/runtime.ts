import { Context } from '../../context'
import type { LookupType } from '../../fs/loader'
import type { Liquid } from '../../liquid'
import type { Template } from '../../template'
import { toPromise } from '../../util/async'
import { LiquidError } from '../../util/error'
import { isLimitError } from '../../util/inline-error'
import { getPerformance } from '../../util/performance'
import { createShopifyLiquid, SHOPIFY_DEFAULT_LIMITS } from '../preset'
import { errorMessage, RenderReport, UnsupportedFeature } from '../report'
import { sampleStoreData } from '../sample/sample-data'
import type { ShopifyServices } from '../services'
import { SettingDefinition, SettingsDrop, SettingsEnv } from '../settings'
import { createState, currentFrame, Frame, ShopifyState, STATE, ThemeHooks } from '../state'
import { buildStore, LiquidObject, setViewCacheSize, StoreObjects } from '../store/build'
import type { CartState } from '../store/cart'
import { buildGlobals, requestedResource, RequestInput } from '../store/globals'
import { resolveView } from '../store/view'
import type { StoreData } from '../store/types'
import { SchemaTag } from '../tags/raw'
import type { ThemeCache } from '../theme-fs'
import { Translator } from '../translations'
import type { BlockData, LocaleTree, SectionData } from '../types'
import { escapeHtml } from '../util/html'
import { hasOwn, isRecord, own, PLAIN_ID } from '../util/own'
import { deepMerge, parseThemeJson, parseWrapper } from './json'
import { contentForHeader, newHeaderMarker, withStoreElements } from './header'
import { bodiesOf, BUNDLED_FILE, compileAssets, CompiledAssets, FileBodies } from './compiled-assets'

/** An Online Store 2.0 theme as a map of its files by path (`sections/header.liquid`). The package never reads the file system. */
export interface ThemeInput {
  files: Record<string, string>
  /** A theme this one is laid over: a file in `files` replaces the base's file at the same path, and every other file comes from the base. The base is parsed once and shared by every theme laid over it, so the AI builder's own sections (item 15) cost only their own parse. Edits to a base's files after an overlay is compiled reach the overlay only for files it takes from the base; give each version of a theme its own object. */
  base?: ThemeInput
}

export interface RenderPageOptions {
  theme: ThemeInput
  /** `index`, `product`, `page.contact`, `customers/login`: `templates/<name>.json` or `templates/<name>.liquid`. https://shopify.dev/docs/storefronts/themes/architecture/templates/json-templates says "A template can only exist as a JSON or Liquid template, not both"; a theme that has both is one Shopify would refuse, and the JSON file wins here. A name without a suffix (`product`) renders the alternate template (`product.probe`) the request's `view` names, or else the resource's `template_suffix`, when the theme has it; `RenderPageResult.templateName` says which rendered. https://shopify.dev/docs/storefronts/themes/architecture/templates/alternate-templates */
  templateName: string
  /** Defaults to the package's public sample store. */
  data?: StoreData
  /** The locale of the theme's translations (its `locales/` files, which `t` reads); defaults to the language `request.language` names when it names one, and to the shop's locale otherwise. `request.locale` and `Shopify.locale` are the language `request.language` names when it names one, and this locale otherwise. The store data's content translations (`StoreData.translations`) follow `request.language`, not this option: `locale: 'fr'` with no request gives French `t` strings and the default language's content. */
  locale?: string
  request?: RequestInput
  /** The cart the page shows, in place of `data.cart`: a visitor's cart as the storefront keeps it (`CartState`). Its lines are priced in the currency of the request's market. */
  cart?: CartState
  services?: Partial<ShopifyServices>
  /** The most views of `data` kept for the next requests (default 16): a view is a full copy of the store's objects for one market, language and URL prefix, so each base path a store is served under (one per preview) holds one. Set on the `data` object, as `setViewCacheSize` sets it, and left as it is when omitted. About 40 MB per view for 5,000 products and 45,000 variants. */
  viewCacheSize?: number
  /** Render the Liquid in `liquid` settings where they print. Off by default: they print as escaped text. Shopify renders them, https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings, so off is Debutify's safety choice for settings it did not write. */
  trustLiquidSettings?: boolean
  /** Lift every other rule for untrusted settings: `html` settings print unsanitised (less `<html>`, `<head>` and `<body>`, which shopify.dev says Shopify removes, https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings), the other setting types are not held to their documented forms, stored keys are not checked, and section keys, block keys and types, group types and the template `wrapper` are not held to the plain-id rule. Off by default, which is Debutify's safety choice and differs from Shopify. `richtext` settings and the escapes of `json` stay on either way. */
  trustHtmlSettings?: boolean
  /** Milliseconds for the whole page (default: the preset's `renderLimit`). A page that runs past it, or past `memoryLimit` or `parseLimit`, rejects. */
  renderLimit?: number
  /** LiquidJS's allocation units for the whole page (default: the preset's `memoryLimit`). */
  memoryLimit?: number
  /**
   * The address the theme's compiled `{% stylesheet %}` and `{% javascript %}` files are served under, ending in `/` (`/compiled_assets/`, `/p/<token>/compiled_assets/`). With it, `content_for_header` links them as Shopify does: `<link rel="stylesheet" media="screen" href="<url>styles.css?v=<version>">`, and `<script id="sections-script" data-sections="<sections>" defer="defer" src="<url>scripts.js?v=<version>"></script>` when the page rendered a section with a `{% javascript %}`; the server serves `CompiledTheme.compiledAssets()` there (the `/storefront` entry does). Without it (or with `''`), for a page rendered with no server behind it, the bodies the page rendered are inlined in `content_for_header`, which needs no second request.
   */
  compiledAssetsUrl?: string
  /** Characters per parsed file (default: the preset's `parseLimit`, 10,000,000). Part of the compiled theme: renders of one `theme` object with different values compile it once per value. */
  parseLimit?: number
  /** `'report'` (default) renders an unknown tag as nothing and reports it; `'error'` makes it a parse error, as for `createShopifyLiquid`. Part of the compiled theme, like `parseLimit`. */
  unknownTags?: 'report' | 'error'
}

/** What `renderSection` takes: `renderPage`'s options and the `section` to render, the id `renderPage` reports for it (`template--product__main`), a key of the JSON template's `sections` (`main`) or a static section's name. The section is looked up in the template that renders, as for `renderPage`: when `view` or the resource's `template_suffix` picks an alternate template (`product.probe`), the ids are that template's (`template--product-probe__main`), and `RenderSectionResult.templateName` says which rendered. */
export interface RenderSectionOptions extends RenderPageOptions {
  section: string
}

export interface RenderPageResult {
  html: string
  report: RenderReport
  /** The template that rendered: `RenderPageOptions.templateName`, or the alternate template (`product.probe`) the request's `view` or the resource's `template_suffix` picked. https://shopify.dev/docs/storefronts/themes/architecture/templates/alternate-templates */
  templateName: string
}

/** What `renderSection` returns: the section's HTML and report, and the bodies of the `{% stylesheet %}` and `{% javascript %}` tags that ran while it rendered. */
export interface RenderSectionResult extends RenderPageResult {
  /** The bodies `renderPage` would inline into `content_for_header` for this section (and the snippets and blocks it rendered), one string per file in the order first rendered, untouched. A caller that swaps a new kind of section into a page puts them where the page's other bodies are. The Section Rendering API (https://shopify.dev/docs/api/ajax/section-rendering) returns a section's HTML alone, and shopify.dev does not say how a section's stylesheet and javascript reach the page there, so returning them is Debutify's. */
  assets: { stylesheets: string[], javascripts: string[] }
}

/** The templates whose resource carries a `template_suffix` (https://shopify.dev/docs/api/liquid/objects/product, https://shopify.dev/docs/api/liquid/objects/collection, https://shopify.dev/docs/api/liquid/objects/page and https://shopify.dev/docs/api/liquid/objects/gift_card, whose `template_suffix` is "the name of the custom template assigned to the gift card"). */
const SUFFIXED_TEMPLATES = new Set(['product', 'collection', 'page', 'gift_card'])

/** The `template_suffix` of the resource the base template `name` shows, the one `buildGlobals` shows (`requestedResource`). Undefined for a template without such a resource, or when the store has none. */
function suffixOf (store: StoreObjects, name: string, resource: string | undefined): string | null | undefined {
  if (!SUFFIXED_TEMPLATES.has(name)) return undefined
  // the gift card is the store's one card, not a resource the request names
  if (name === 'gift_card') return store.gift_card?.template_suffix as string | null | undefined
  return requestedResource(store, name, resource)?.template_suffix as string | null | undefined
}

/** The template a page renders: `templates/<name>.<suffix>` for the request's `view`, else for the resource's `template_suffix`, when the theme has it (JSON or Liquid); `name` otherwise. https://shopify.dev/docs/storefronts/themes/architecture/templates/alternate-templates. The page names the two ways to apply an alternate template (assign it to a resource in the admin, or `?view=<suffix>`) but not which wins when both apply, nor what a `view` that names no template does, so the order (view first, then the suffix, then the base template) is Debutify's, on the confirm-on-a-development-store list; no fixture holds both. `view` applies to every base template (cart, search, 404, `customers/*` and the rest, not only product, collection and page), as the page lists no supported types. A `view` or suffix holding `/` names no template (a suffix is a plain part of a file name, and a `/` would read as a directory in `template.name`), so it falls back to the base template. A name that already has a suffix (`page.contact`) is rendered as given. */
function chooseTemplate (theme: CompiledTheme, name: string, view: string | undefined, suffix: string | null | undefined): string {
  for (const candidate of [view, suffix]) {
    if (!candidate || candidate.includes('/') || name.includes('.')) continue
    const full = `${name}.${candidate}`
    // https://shopify.dev/docs/storefronts/themes/architecture/templates/gift-card-liquid: "This template can't be a JSON template", so a gift card's alternate is a Liquid file only
    if ((name !== 'gift_card' && theme.has(`templates/${full}.json`)) || theme.has(`templates/${full}.liquid`)) return full
  }
  return name
}

interface SectionSchema {
  tag?: string
  class?: string
  settings?: SettingDefinition[]
  blocks?: Array<{ type: string, settings?: SettingDefinition[] }>
  locales?: Record<string, LocaleTree>
  default?: Record<string, unknown>
}

interface BlockSchema {
  tag?: string | null
  class?: string
  settings?: SettingDefinition[]
}

interface TemplateJson {
  layout?: string | false
  wrapper?: unknown
  sections?: unknown
  order?: unknown
}

interface GroupJson {
  type?: unknown
  sections?: unknown
  order?: unknown
}

interface ContextFile {
  context?: { market?: string, b2b?: boolean | string }
  sections?: unknown
  order?: unknown
}

interface Placement {
  id: string
  location: string
  index: number | null
  groupClass?: string
  /** A static section with no saved entry in `settings_data.json` takes the schema's `default`. */
  useSchemaDefault?: boolean
}

/** A section of a template or group, as `renderPage` places it. A `disabled` one is listed so `renderSection` can say it is disabled; it takes no index. */
interface Entry {
  key: string
  data: SectionData
  placement: Placement
  disabled: boolean
}

const now = () => getPerformance().now()
const LOCALE_FILE = /^locales\/([\w-]+?)(\.default)?(\.schema)?\.json$/
const TAG_NAME = /^[a-z][a-z0-9-]*$/
const GROUP_ID_PREFIX = 'sections--'

/** How many sections and theme blocks may be open inside one another. Ruby Liquid stops a render nested deeper than `Liquid::Block::MAX_DEPTH`, 100, with `Nesting too deep` (`Liquid::Context#check_overflow` and `#overflow?` in Shopify/liquid, `lib/liquid/context.rb` and `lib/liquid/block.rb`). shopify.dev does not document a section nesting limit, so applying that depth to `{% section %}`, `{% sections %}` and `{% content_for %}` is Debutify's choice. */
const MAX_NESTING_DEPTH = 100

/** The ways `rest` (what follows `sections--` in a group section's id) splits at a `__` into a group name and the section's key, shortest group name first. A key may hold `__` or start with `_`, and a group name may hold `__`, so the id alone does not say where the name ends. */
function groupSplits (rest: string): Array<[string, string]> {
  const splits: Array<[string, string]> = []
  for (let at = rest.indexOf('__', 1); at !== -1; at = rest.indexOf('__', at + 1)) {
    if (at + 2 < rest.length) splits.push([rest.slice(0, at), rest.slice(at + 2)])
  }
  return splits
}

/** A block `type` when the theme is not trusted with html: a key, or an app block's `@app` or `shopify://apps/<app>/blocks/<block>/<id>` (https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration). */
const SAFE_BLOCK_TYPE = /^(?:[A-Za-z0-9_-]+|@app|shopify:\/\/apps\/[A-Za-z0-9_-]+\/blocks\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+)$/
/** A section group's `type` when the theme is not trusted with html: `header`, `footer`, `aside` or `custom.<name>` (https://shopify.dev/docs/storefronts/themes/architecture/section-groups). */
const SAFE_GROUP_TYPE = /^[A-Za-z0-9_.-]+$/

/** A name from the saved JSON as the report shows it: as it is when plain (letters, digits and `. _ - / : @`, up to 100 characters), else `(unsafe name)`, because the report may be shown as HTML. */
const reportName = (name: string): string => /^[\w.\-/:@]{1,100}$/.test(name) ? name : '(unsafe name)'

/** A block of an app, https://shopify.dev/docs/storefronts/themes/architecture/blocks/app-blocks (`@app` in a schema) and https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration (`shopify://apps/<app_name>/blocks/<block_name>/<unique_ID>` as the `type` in saved JSON). */
function isAppBlock (type: unknown): boolean {
  return typeof type === 'string' && (type === '@app' || type.startsWith('shopify://apps/'))
}

/** Throws when `value` is not undefined or an array of objects (`schema.settings`, `schema.blocks`). */
function objectList (value: unknown, where: string): void {
  if (value !== undefined && !(Array.isArray(value) && value.every(isRecord))) throw new Error(`${where} must be an array of objects`)
}

/** Throws when `value` is not undefined or an object. */
function optionalObject (value: unknown, where: string): void {
  if (value !== undefined && value !== null && !isRecord(value)) throw new Error(`${where} must be an object`)
}

/** A schema `default` or preset: `settings` and a `blocks` array whose entries are presets in turn. https://shopify.dev/docs/storefronts/themes/architecture/sections/section-schema ("the same attributes as the preset object") */
function presetShape (preset: unknown, where: string): void {
  if (!isRecord(preset)) throw new Error(`${where} must be an object`)
  optionalObject(preset.settings, `${where} "settings"`)
  if (preset.blocks !== undefined) {
    if (!Array.isArray(preset.blocks)) throw new Error(`${where} "blocks" must be an array`)
    preset.blocks.forEach((block, i) => presetShape(block, `${where} block ${i + 1}`))
  }
}

/** A schema `default` as the JSON data of a section: its `blocks` array becomes `blocks` and `block_order`, with ids `block-1`, `block-2`… among siblings (shopify.dev does not say what ids Shopify gives them). An entry that carries a string `id` and `"static": true` is a static block, https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks/static-blocks: it keeps its `id` as its key and `static`, and stays out of `block_order`, so `{% content_for 'block' %}` finds it and `{% content_for 'blocks' %}` does not render it. A `static` entry without a string `id` cannot be named by `content_for 'block'`, so it stays a dynamic block. */
function presetData (preset: Record<string, unknown>): { settings?: Record<string, unknown>, blocks?: Record<string, BlockData>, block_order?: string[] } {
  const out: ReturnType<typeof presetData> = {}
  if (isRecord(preset.settings)) out.settings = preset.settings
  if (Array.isArray(preset.blocks)) {
    out.blocks = {}
    out.block_order = []
    preset.blocks.forEach((block: Record<string, unknown>, i) => {
      const isStatic = block.static === true && typeof block.id === 'string' && block.id !== ''
      const id = isStatic ? block.id as string : `block-${i + 1}`
      out.blocks![id] = { ...presetData(block), type: String(block.type), ...(isStatic ? { static: true } : {}) }
      if (!isStatic) out.block_order!.push(id)
    })
  }
  return out
}

/** One theme, parsed once: an engine over its files and its parsed JSON, both re-read only when a file's contents change. Of its members only `templates(path)` and `compiledAssets()` are public API; the rest serve `renderPage` and may change in any release. */
export class CompiledTheme {
  public readonly liquid: Liquid
  private readonly cache: ThemeCache
  private readonly jsonCache = new Map<string, { source: string, value: unknown }>()
  /** The last `compiledAssets()`, with the paths and sources it was made from. */
  private assets?: { paths: string[], sources: Array<string | undefined>, value: CompiledAssets }
  /** The `{% stylesheet %}` and `{% javascript %}` bodies of this theme's own files, by path, with the source they were read from. */
  private readonly bodyCache = new Map<string, { source: string, bodies: FileBodies }>()

  /** `own` are the files this theme owns; with a `base`, every other file comes from it, parsed once by it. */
  public constructor (public readonly own: Record<string, string>, options: Pick<RenderPageOptions, 'parseLimit' | 'unknownTags'> = {}, public readonly base?: CompiledTheme) {
    this.liquid = createShopifyLiquid({ files: own, base: base && { cache: base.cache, parse: key => base.parseKey(key) }, parseLimit: options.parseLimit, unknownTags: options.unknownTags })
    this.cache = this.liquid.options.cache as ThemeCache
  }

  /** How many files this theme parsed itself (cache writes): files it takes from its base cost the base's parse, not this theme's. For tests and reports. */
  public get parseCount (): number {
    return this.cache.writes
  }

  /** Parses one file by its cache key (`partials:price`) into this theme's cache. */
  public parseKey (key: string): Template[] {
    const sep = key.indexOf(':')
    return this.liquid.parseFileSync(key.slice(sep + 1), key.slice(0, sep) as LookupType)
  }

  public has (path: string): boolean {
    return hasOwn(this.own, path) || !!this.base?.has(path)
  }

  /** The text of the file at `path`, this theme's own or its base's; undefined when neither has it. */
  public source (path: string): string | undefined {
    return hasOwn(this.own, path) ? this.own[path] : this.base?.source(path)
  }

  /**
   * The theme's compiled `{% stylesheet %}` and `{% javascript %}` files, `styles.css` and `scripts.js`, which a server serves at `RenderPageOptions.compiledAssetsUrl` (see `compileAssets` for what they hold and in what form). Made from every `.liquid` file of `sections/`, `blocks/` and `snippets/`, each parsed for it once while it is unchanged, and made again only when one of them changes, so their versions change with their bodies.
   */
  public compiledAssets (): CompiledAssets {
    const paths = ['sections/', 'blocks/', 'snippets/'].flatMap(folder => this.paths(folder).filter(path => BUNDLED_FILE.test(path)).sort())
    const sources = paths.map(path => this.source(path))
    const last = this.assets
    if (last && last.paths.length === paths.length && last.paths.every((path, i) => path === paths[i] && last.sources[i] === sources[i])) return last.value
    const value = compileAssets(paths.map(path => ({ path, bodies: this.bodies(path) })))
    this.assets = { paths, sources, value }
    return value
  }

  /** The `{% stylesheet %}` and `{% javascript %}` bodies of the file at `path`, read from a parse of its own (the render cache may hold a file a render parsed as a promise, which a synchronous read cannot take), kept while the file is unchanged; a file the theme takes from its base is read by the base. A file that does not parse has none. */
  private bodies (path: string): FileBodies {
    if (!hasOwn(this.own, path)) return this.base?.bodies(path) ?? {}
    const source = this.own[path]
    const cached = this.bodyCache.get(path)
    if (cached && cached.source === source) return cached.bodies
    let bodies: FileBodies
    try {
      bodies = bodiesOf(this.liquid.parse(source, path))
    } catch {
      bodies = {}
    }
    this.bodyCache.set(path, { source, bodies })
    return bodies
  }

  /** Paths starting with `prefix`, in key order: the base's, then the overlay's own that the base lacks (the order of `{ ...base.files, ...own }`). */
  public paths (prefix: string): string[] {
    const own = Object.keys(this.own).filter(path => path.startsWith(prefix))
    const base = this.base
    return base ? [...base.paths(prefix), ...own.filter(path => !base.has(path))] : own
  }

  /** The parsed JSON file, undefined when it does not exist. Throws when it is not valid JSON. */
  public json (path: string): unknown {
    if (!hasOwn(this.own, path)) return this.base?.json(path)
    const source = this.own[path]
    const cached = this.jsonCache.get(path)
    if (cached && cached.source === source) return cached.value
    const value = parseThemeJson(source, path)
    this.jsonCache.set(path, { source, value })
    return value
  }

  /** The parsed Liquid file at `path` (`sections/header.liquid`), from the engine's cache when unchanged. Throws the parse error, so a caller can check every file of a theme before rendering it. */
  public templates (path: string): Template[] {
    return this.liquid.parseFileSync(path.replace(/\.liquid$/, ''))
  }

  /**
   * The translations for `locale`: storefront and schema locale files, with the `*.default.json` locale as fallback. https://shopify.dev/docs/storefronts/themes/architecture/locales names the files (`locales/en.default.json`, `locales/fr.json`, and `locales/en.default.schema.json` for the editor's strings).
   *
   * A locale file is read the first time a translation looks in it, so a file that is not valid JSON affects only renders that look in it: a lookup skips it, and `onError` hears of it once (the message names the file).
   */
  public translator (locale: string, onError?: (message: string) => void): Translator {
    const locales: Record<string, LocaleTree> = {}
    const schemaLocales: Record<string, LocaleTree> = {}
    let defaultLocale = 'en'
    const failed = new Set<string>()
    const read = (path: string): LocaleTree | undefined => {
      if (failed.has(path)) return undefined
      try {
        const tree = this.json(path)
        if (isRecord(tree)) return tree as LocaleTree
        throw new Error(`${path}: must be a JSON object`)
      } catch (err) {
        failed.add(path)
        onError?.((err as Error).message)
        return undefined
      }
    }
    for (const path of this.paths('locales/')) {
      const match = LOCALE_FILE.exec(path)
      if (!match) continue
      if (!match[3] && match[2]) defaultLocale = match[1]
      Object.defineProperty(match[3] ? schemaLocales : locales, match[1], { enumerable: true, configurable: true, get: () => read(path) })
    }
    return new Translator({ locale, defaultLocale, locales, schemaLocales })
  }
}

/** Compiled themes by theme object, then by the engine options they were compiled with (`parseLimit` and `unknownTags`). */
const compiled = new WeakMap<ThemeInput, Map<string, CompiledTheme>>()

/**
 * The compiled form of `theme`, made on first use and kept as long as the theme object lives; `renderPage` and `renderSection` use it, so calling it first parses a theme ahead of its first render. Pass the same `parseLimit` and `unknownTags` the renders will get: a theme is compiled once for each combination. Editing `theme.files[path]` is picked up (the engine and the JSON cache compare each file's contents); replacing `theme.files` with a new map compiles the theme again.
 *
 * The compiled theme reads `theme.files` live, so a render that is still running when a file is edited can mix the old and new versions of different files. Give each saved version of a theme its own `theme` object (or its own `files` map) and do not edit a map a render is using.
 *
 * A theme with a `base` is compiled over the base's compiled theme (compiled first, with the same options, and shared by every theme laid over it): the overlay parses only its own files. Replacing `theme.files` or compiling a new base compiles the overlay again.
 */
export function compileTheme (theme: ThemeInput, options: Pick<RenderPageOptions, 'parseLimit' | 'unknownTags'> = {}): CompiledTheme {
  const engine = { parseLimit: options.parseLimit ?? SHOPIFY_DEFAULT_LIMITS.parseLimit, unknownTags: options.unknownTags ?? 'report' }
  return compileLaidOver(theme, engine, new Set())
}

/** `compileTheme` for options already read; `chain` holds the themes whose bases are being compiled, so a base that leads back to one of them fails instead of recursing without end. */
function compileLaidOver (theme: ThemeInput, engine: { parseLimit: number, unknownTags: 'report' | 'error' }, chain: Set<ThemeInput>): CompiledTheme {
  if (chain.has(theme)) throw new Error('theme base chain loops: a theme is laid over itself, directly or through its bases')
  chain.add(theme)
  const key = `${engine.parseLimit}:${engine.unknownTags}`
  let byOptions = compiled.get(theme)
  if (!byOptions) {
    byOptions = new Map()
    compiled.set(theme, byOptions)
  }
  const base = theme.base && compileLaidOver(theme.base, engine, chain)
  let result = byOptions.get(key)
  if (!result || result.own !== theme.files || result.base !== base) {
    result = new CompiledTheme(theme.files, engine, base)
    byOptions.set(key, result)
  }
  return result
}

/** A contextual section group file applies when every key it names matches the request's context. https://shopify.dev/docs/storefronts/themes/architecture/section-groups#contextual-section-groups says its `context` holds `"market": "market-handle"` or `"b2b": true`; combining both keys is not pinned. */
function matchesContext (wanted: ContextFile['context'], request: RequestInput['context']): boolean {
  if (!isRecord(wanted) || !request || !Object.keys(wanted).length) return false
  if (wanted.market !== undefined && wanted.market !== request.market) return false
  if (wanted.b2b !== undefined && String(wanted.b2b) !== String(!!request.b2b)) return false
  return true
}

/** Renders one page; implements the hooks the `section`, `sections` and `content_for` tags call. */
class PageRender implements ThemeHooks {
  public readonly state: ShopifyState
  /** Which setting values print as written, from `RenderPageOptions`; see `SettingsEnv.trust`. */
  private readonly trust: SettingsEnv['trust']
  private readonly started = now()
  private readonly errors: LiquidError[] = []
  /** The messages `fail` printed for errors that have no file and line (a schema or saved JSON of the wrong shape), in the order printed. */
  private readonly failures: string[] = []
  private readonly env: SettingsEnv
  private readonly globals: Record<string | symbol, unknown>
  private readonly root: Context
  private readonly current: Record<string, unknown>
  private readonly templateId: string
  /** The template this page renders, after `chooseTemplate`. */
  private readonly templateName: string
  private readonly headerMarker = newHeaderMarker()
  /** The saved JSON behind each block object of `section.blocks` and `block.blocks`, for `{% render block %}`. */
  private readonly blockObjects = new WeakMap<object, { id: string, data: BlockData }>()

  public constructor (private readonly theme: CompiledTheme, private readonly options: RenderPageOptions) {
    const data = options.data ?? sampleStoreData
    if (options.viewCacheSize !== undefined) setViewCacheSize(data, options.viewCacheSize)
    const store = buildStore(data, resolveView(data, options.request ?? {}))
    this.templateName = chooseTemplate(theme, options.templateName, options.request?.view, suffixOf(store, options.templateName, options.request?.resource))
    // the theme's locale file is "the locale file for the active language" (https://shopify.dev/docs/storefronts/themes/architecture/locales/storefront-locale-files), the language the page is shown in, which is the one the request names, as the parity store prints it in `request.locale` (fixtures `probe-page-fr-ca` and `probe-page-fr-eu`: `fr`); a request that names none renders in the shop's locale
    const locale = options.locale ?? options.request?.language ?? String(store.shop.locale)
    const translator = theme.translator(locale, message => this.state.report.unsupported('locale_file', message))
    this.trust = { liquidSettings: !!options.trustLiquidSettings, htmlSettings: !!options.trustHtmlSettings }
    this.state = createState({
      liquid: theme.liquid,
      services: options.services,
      translator,
      moneyFormat: store.currency.money_format,
      moneyWithCurrencyFormat: store.currency.money_with_currency_format,
      runtime: this
    })
    this.state.currency = { iso_code: store.currency.iso_code, rate: store.currency.rate }
    const page = buildGlobals({ store, data, templateName: this.templateName, request: options.request ?? {}, locale, report: this.state.report, cart: options.cart })
    this.state.request = page.request
    this.state.form = options.request?.form
    const env: SettingsEnv = { store, linklists: page.linklists, services: this.state.services, translator, report: this.state.report, trust: this.trust, prefix: page.request.prefix }
    const settingsData = theme.json('config/settings_data.json') ?? {}
    if (!isRecord(settingsData)) throw new Error('config/settings_data.json: must be a JSON object')
    // `current` is an object on https://shopify.dev/docs/storefronts/themes/architecture/config/settings-data-json; a preset name there is the older shape, not pinned by shopify.dev
    const presets = isRecord(settingsData.presets) ? settingsData.presets : {}
    const current = typeof settingsData.current === 'string' ? own(presets, settingsData.current) : settingsData.current
    this.current = isRecord(current) ? current : {}
    const values = Object.fromEntries(Object.entries(this.current).filter(([key]) => !['sections', 'content_for_index', 'blocks'].includes(key)))
    const schema = theme.json('config/settings_schema.json') ?? []
    if (!Array.isArray(schema)) throw new Error('config/settings_schema.json: must be a JSON array')
    const definitions = schema.flatMap(group => isRecord(group) && Array.isArray(group.settings) ? group.settings.filter(isRecord) : []) as SettingDefinition[]
    const settings = new SettingsDrop(definitions, values, env)
    // Sections and blocks choose their `color_scheme` settings from the schemes the global `color_scheme_group` holds (https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings#color_scheme: "Shopify returns the selected `color_scheme` object from `color_scheme_group`", and nil "If the theme doesn't have `color_scheme_group` data in `settings_data.json`"), so their settings are built over the global settings' group.
    this.env = { ...env, colorSchemes: SettingsDrop.colorSchemes(settings) }
    this.globals = { ...page.globals, settings, [STATE]: this.state }
    this.templateId = this.templateName.replace(/[^\w-]/g, '-')
    this.root = new Context({}, theme.liquid.options, { sync: false, globals: this.globals, renderLimit: options.renderLimit, memoryLimit: options.memoryLimit }, { liquid: theme.liquid, errors: this.errors })
  }

  public themeFile (path: string): string | undefined {
    return this.theme.source(path)
  }

  public async page (): Promise<RenderPageResult> {
    const html = withStoreElements(await toPromise(this.renderDocument()), this.state, this.globals)
    return { html, report: this.state.report.toReport(this.errors, now() - this.started), templateName: this.templateName }
  }

  public async section (key: string): Promise<RenderSectionResult> {
    const html = await toPromise(this.renderOneSection(key))
    const { stylesheets, javascripts } = this.state.assets
    return { html, report: this.state.report.toReport(this.errors, now() - this.started), templateName: this.templateName, assets: { stylesheets: [...stylesheets.values()], javascripts: [...javascripts.values()] } }
  }

  /** A context for one section or block: the page's globals plus `extra`, sharing the page's limits and error list. */
  private child (extra: Record<string, unknown>, scope: object = {}): Context {
    return new Context(scope, this.root.opts, { sync: false, globals: { ...this.globals, ...extra }, strictVariables: this.root.strictVariables, ownPropertyOnly: this.root.ownPropertyOnly }, { renderLimit: this.root.renderLimit, memoryLimit: this.root.memoryLimit, liquid: this.theme.liquid, errors: this.errors })
  }

  /**
   * The template renders first, then the layout around it with the template's output as `content_for_layout`, then `content_for_header` is filled in so it can include every stylesheet and javascript body the page rendered. https://shopify.dev/docs/storefronts/themes/architecture/layouts says `content_for_layout` "dynamically outputs the content for each template" and goes in the `<body>`, and `content_for_header` goes in the `<head>`.
   *
   * The order is a departure from Shopify: that page says Shopify "can start sending the page to the browser when the layout reaches `{{ content_for_header }}`" and does so "before your template's sections render", so a layout there runs before the template. Here the template runs first so its output and every stylesheet and javascript body are known when the header is written. One consequence: a variable a Liquid template assigns is not visible in its layout (Shopify does not pin that either).
   *
   * A layout that is missing renders the template alone and is reported; a layout that does not parse prints its error before the template.
   */
  private * renderDocument (): Generator<unknown, string, unknown> {
    const { content, layout } = (yield this.renderTemplate()) as { content: string, layout: string | null }
    if (layout === null) return content
    const file = `layout/${layout}.liquid`
    if (!this.theme.has(file)) {
      this.state.report.missing('layout', layout)
      return content
    }
    let templates: Template[]
    try {
      templates = this.theme.templates(file)
    } catch (err) {
      return `${escapeHtml(this.fail(err))}${content}`
    }
    const html = (yield this.theme.liquid.renderer.renderTemplates(templates, this.child({ content_for_layout: content, content_for_header: this.headerMarker }))) as string
    // an empty address would make the links relative to the page; it is read as none
    const url = this.options.compiledAssetsUrl
    return html.split(this.headerMarker).join(contentForHeader(this.state, this.globals, url ? { url, assets: this.theme.compiledAssets() } : undefined))
  }

  /**
   * Records an error that stopped a whole file, section or block and returns the message printed in its place. This is the one place that decides where such an error is listed. A Liquid error (a file that does not parse) goes to `report.errors` with its file and line. Any other error is a schema or saved JSON of the wrong shape, which has no line, so it stays out of `report.errors`; `renderSection` reports the section it was printed in as `failed`, with the message as its `reason`. A `renderLimit`, `memoryLimit` or `parseLimit` hit is Debutify's safety limit, not an error of the file, so it is not turned into a message: it rejects the render.
   */
  private fail (err: unknown): string {
    if (isLimitError(err)) throw err
    const message = errorMessage(err)
    if (LiquidError.is(err)) this.errors.push(err)
    else this.failures.push(message)
    return message
  }

  /** Reports something the render ignored because its JSON has the wrong shape. */
  private ignored (feature: UnsupportedFeature, where: string, expected: string) {
    this.state.report.unsupported(feature, `${where} is not ${expected}`)
  }

  /** `value` as the object it should be; a value of another type is reported and read as empty. */
  private objectOf (value: unknown, feature: UnsupportedFeature, where: string): Record<string, unknown> {
    if (value === undefined || value === null) return {}
    if (isRecord(value)) return value
    this.ignored(feature, where, 'an object')
    return {}
  }

  /**
   * Whether a section or block key of the saved JSON may be used. Unless the theme is trusted with html (`trustHtmlSettings`) only keys of letters, digits, `-` and `_` are, because the key becomes `section.id` or `block.id` and themes print those in ids, class names, attributes and `<style>`; any other key is skipped and reported (feature `unsafe_key`) without the key, as the report may be shown as HTML.
   */
  private keyAllowed (key: string, what: 'section' | 'block'): boolean {
    if (this.trust.htmlSettings || PLAIN_ID.test(key)) return true
    this.state.report.unsupported('unsafe_key', `a ${what} key with characters other than letters, digits, - and _ was skipped`)
    return false
  }

  /** Whether a saved block `type` may be used, on the same terms as `keyAllowed`; a `type` that is not a string is left to the block's own check. */
  private blockTypeAllowed (type: unknown): boolean {
    if (this.trust.htmlSettings || typeof type !== 'string' || SAFE_BLOCK_TYPE.test(type)) return true
    this.state.report.unsupported('unsafe_key', 'a block type with characters other than letters, digits, - and _ was skipped')
    return false
  }

  /** The ids of `sections` in `order`; without a usable `order`, in the order the JSON lists them. */
  private orderOf (order: unknown, sections: Record<string, unknown>, where: string): string[] {
    if (Array.isArray(order)) return order.filter((key): key is string => typeof key === 'string')
    if (order !== undefined && order !== null) this.ignored('order', `${where} "order"`, 'an array')
    return Object.keys(sections)
  }

  /**
   * The sections of a template or group in `order`, each placed as `renderPage` places it: a 1-based `index` among those that are not `disabled` (a section whose file is missing keeps its index), and the id, `location` and class `place` gives it. https://shopify.dev/docs/storefronts/themes/architecture/templates/json-templates and https://shopify.dev/docs/storefronts/themes/architecture/section-groups (`sections`, `order`, `disabled`).
   */
  private entries (container: { sections?: unknown, order?: unknown }, where: string, place: (key: string, index: number | null) => Placement): Entry[] {
    const sections = this.objectOf(container.sections, 'sections', `${where} "sections"`)
    const entries: Entry[] = []
    let index = 0
    for (const key of this.orderOf(container.order, sections, where)) {
      const data = own(sections, key) as SectionData | undefined
      if (!data || !this.keyAllowed(key, 'section')) continue
      const disabled = !!data.disabled
      entries.push({ key, data, disabled, placement: place(key, disabled ? null : ++index) })
    }
    return entries
  }

  private templateEntries (template: TemplateJson): Entry[] {
    return this.entries(template, `templates/${this.templateName}.json`, (key, index) => ({ id: `template--${this.templateId}__${key}`, location: 'template', index }))
  }

  private templateJson (): TemplateJson | undefined {
    const path = `templates/${this.templateName}.json`
    if (!this.theme.has(path)) return undefined
    const template = this.theme.json(path)
    if (!isRecord(template)) throw new Error(`${path}: must be a JSON object`)
    return template
  }

  /** The JSON template, or undefined for a Liquid template. A template that does not exist rejects: there is no page to show. */
  private requireTemplate (): TemplateJson | undefined {
    const name = this.templateName
    const template = this.templateJson()
    if (!template && !this.theme.has(`templates/${name}.liquid`)) {
      this.state.report.missing('template', name)
      throw new Error(`template not found: templates/${name}.json or templates/${name}.liquid`)
    }
    return template
  }

  /**
   * A JSON template renders its `sections` in `order` (a `disabled` section is skipped) inside its `wrapper`, and names its `layout` (`false` for none, `theme` when absent). https://shopify.dev/docs/storefronts/themes/architecture/templates/json-templates
   *
   * A Liquid template renders as Liquid and chooses its layout with `{% layout %}`; `{% layout none %}` renders it alone, https://shopify.dev/docs/api/liquid/tags/layout ("By default, the `theme.liquid` layout is used"). One that does not parse prints its error as `content_for_layout`.
   */
  private * renderTemplate (): Generator<unknown, { content: string, layout: string | null }, unknown> {
    const name = this.templateName
    const template = this.requireTemplate()
    if (template) {
      let out = ''
      for (const entry of this.templateEntries(template)) {
        if (!entry.disabled) out += (yield this.renderSection(entry.data, entry.placement)) as string
      }
      const wrapper = typeof template.wrapper === 'string' ? parseWrapper(template.wrapper, this.trust.htmlSettings) : undefined
      if (template.wrapper !== undefined && !wrapper) this.state.report.unsupported('wrapper', typeof template.wrapper === 'number' || typeof template.wrapper === 'boolean' ? String(template.wrapper) : 'the template wrapper is not a div, main or section with #id, .class and [name=value] parts, or has an event-handler or style attribute the theme is not trusted with, and was not applied')
      return { content: wrapper ? wrapper[0] + out + wrapper[1] : out, layout: template.layout === false ? null : typeof template.layout === 'string' ? template.layout : 'theme' }
    }
    let templates: Template[]
    try {
      templates = this.theme.templates(`templates/${name}.liquid`)
    } catch (err) {
      return { content: escapeHtml(this.fail(err)), layout: 'theme' }
    }
    const content = (yield this.theme.liquid.renderer.renderTemplates(templates, this.child({}))) as string
    return { content, layout: this.state.layout === undefined ? 'theme' : this.state.layout }
  }

  /**
   * One section of the page, found by the id `renderPage` reports for it. The Section Rendering API addresses a section the same way, by a static file name (`social`), `sections--<id>__<name>` for a section of a group and `template--<id>__<name>` for one of a template: https://shopify.dev/docs/api/ajax/section-rendering. In order:
   *
   * 1. `template--<template>__<key>`: the section `<key>` of the template.
   * 2. `sections--<group>__<key>`: the section `<key>` of the group, with the request's contextual file applied. A key may hold `__` or start with `_`, and so may a group name, so every `__` in the id is tried as the split, shortest group name first, and the first group file that exists and holds the key is the one. When no group file exists at all, the last split names the missing group in the report.
   * 3. A bare key of the template's `sections` (`featured`), so a caller need not build the id.
   * 4. A static section's name.
   *
   * A key the template or group does not have renders nothing and is reported as a missing section; a `disabled` section renders nothing and is reported, and is never rendered as a static section of the same name. The template must exist, as for `renderPage`, or the promise rejects.
   *
   * A bare template key comes before a static name, so a static section whose name is also a key of the template (`{% section 'hero' %}` in the layout and a template section keyed `hero`) can be reached only as `renderPage` reports the other one, not by its name. A group whose JSON is not valid does not reject, as `renderPage` does not: the error is reported (`section-group`) and printed, escaped, as the section's html.
   */
  private * renderOneSection (key: string): Generator<unknown, string, unknown> {
    const template = this.requireTemplate()
    const templateEntries = template ? this.templateEntries(template) : []
    const templatePrefix = `template--${this.templateId}__`
    const splits = key.startsWith(GROUP_ID_PREFIX) ? groupSplits(key.slice(GROUP_ID_PREFIX.length)) : []
    let entry: Entry | undefined
    if (key.startsWith(templatePrefix)) {
      entry = templateEntries.find(candidate => candidate.key === key.slice(templatePrefix.length))
    } else if (splits.length) {
      const found = this.findGroupEntry(splits)
      if (typeof found === 'string') return found
      entry = found
    } else {
      entry = templateEntries.find(candidate => candidate.key === key)
      if (!entry) return (yield this.renderStaticSection(key)) as string
    }
    if (!entry) {
      this.state.report.missing('section', reportName(key))
      return ''
    }
    if (entry.disabled) {
      this.state.report.unsupported('disabled_section', `${entry.placement.id} is disabled: nothing rendered`)
      return ''
    }
    return (yield this.renderSection(entry.data, entry.placement)) as string
  }

  /** The section a group section's id names, trying each split (see `renderOneSection`); undefined when a group exists but has no such section; a string (the html to return) when no group file exists or the only candidate's JSON is not valid. */
  private findGroupEntry (splits: Array<[string, string]>): Entry | string | undefined {
    let error: string | undefined
    let found = false
    for (const [name, key] of splits) {
      if (!this.theme.has(`sections/${name}.json`)) continue
      found = true
      let group: GroupJson | undefined
      try {
        group = this.resolveGroup(name)
      } catch (err) {
        error = error ?? (err as Error).message
        continue
      }
      const entry = group && this.groupEntries(name, group).find(candidate => candidate.key === key)
      if (entry) return entry
    }
    if (error !== undefined) {
      this.state.report.unsupported('section_group', error)
      return escapeHtml(`Liquid error: ${error}`)
    }
    if (found) return undefined
    this.state.report.missing('section_group', splits[splits.length - 1][0])
    return ''
  }

  /** A file's `{% schema %}` JSON, `{}` when it has none or its JSON is invalid (the invalid case is reported). Valid JSON of the wrong shape (`settings` or `blocks` that are not arrays of objects, `locales` or `default` that are not objects) throws: the section or block that reads it fails. A `class` that is not a string is ignored and reported, as the wrapper cannot print it. https://shopify.dev/docs/storefronts/themes/architecture/sections/section-schema */
  private schema<T> (templates: Template[], file: string): T {
    const tag = templates.find((template): template is SchemaTag => template instanceof SchemaTag)
    if (!tag) return {} as T
    let json: unknown
    try {
      json = tag.json
    } catch (err) {
      this.state.report.unsupported('schema', `${file}: ${(err as Error).message}`)
      return {} as T
    }
    if (!isRecord(json)) return {} as T
    objectList(json.settings, `${file}: schema "settings"`)
    objectList(json.blocks, `${file}: schema "blocks"`)
    optionalObject(json.locales, `${file}: schema "locales"`)
    if (json.default !== undefined) presetShape(json.default, `${file}: schema "default"`)
    if (json.class !== undefined && typeof json.class !== 'string') {
      this.ignored('schema', `${file}: schema "class"`, 'a string; it is ignored')
      return { ...json, class: undefined } as T
    }
    return json as T
  }

  private blockDefinitions (type: string, schema: SectionSchema): SettingDefinition[] {
    const local = schema.blocks?.find(definition => definition.type === type && Array.isArray(definition.settings))
    if (local) return local.settings ?? []
    const file = `blocks/${type}.liquid`
    if (!this.theme.has(file)) return []
    try {
      return this.schema<BlockSchema>(this.theme.templates(file), file).settings ?? []
    } catch (err) {
      if (isLimitError(err)) throw err
      return []
    }
  }

  /** Throws when the saved JSON of a section or block (`where` names it) has one of its own fields of the wrong type: `settings` and `blocks` objects, `block_order` an array. The entries of `blocks` are not looked at here: each block is checked where it is used (`sectionBlocks`, `renderThemeBlock`), so a malformed block fails alone and leaves its section and siblings be. */
  private checkContainer (data: { settings?: unknown, blocks?: unknown, block_order?: unknown }, where: string): void {
    optionalObject(data.settings, `${where}: "settings"`)
    optionalObject(data.blocks, `${where}: "blocks"`)
    if (data.block_order !== undefined && data.block_order !== null && !Array.isArray(data.block_order)) throw new Error(`${where}: "block_order" must be an array`)
  }

  /** `section.blocks`: the section's non-static blocks in `block_order`, each with settings over its definition's defaults. A `disabled` block is skipped (https://shopify.dev/docs/storefronts/themes/architecture/templates/json-templates lists `disabled` on sections; for blocks it is not pinned). A saved block that is not an object is left out, and `settings` that are not an object read as empty; both are reported (feature `blocks`), as the list has nowhere to print an error. https://shopify.dev/docs/api/liquid/objects/block */
  private sectionBlocks (data: SectionData, schema: SectionSchema, where: string): LiquidObject[] {
    const blocks: LiquidObject[] = []
    for (const id of data.block_order ?? Object.keys(data.blocks ?? {})) {
      const block: unknown = data.blocks ? own(data.blocks, id) : undefined
      if (block === undefined || block === null) continue
      if (!isRecord(block)) {
        if (this.keyAllowed(id, 'block')) this.ignored('blocks', `${where}: block ${id}`, 'an object')
        continue
      }
      if (block.disabled || block.static || !this.keyAllowed(id, 'block') || !this.blockTypeAllowed(block.type)) continue
      const settings = block.settings === undefined || block.settings === null || isRecord(block.settings) ? block.settings : undefined
      if (settings !== block.settings) this.ignored('blocks', `${where}: block ${id} "settings"`, 'an object')
      const object: LiquidObject = { id, type: block.type, settings: new SettingsDrop(this.blockDefinitions(block.type as string, schema), settings ?? undefined, this.env), shopify_attributes: '' }
      this.blockObjects.set(object, { id, data: block as unknown as BlockData })
      blocks.push(object)
    }
    return blocks
  }

  /**
   * One section in Shopify's wrapper, `<div id="shopify-section-<id>" class="shopify-section [group class] [schema class]">`, with the `section` object (`id`, `settings` over the schema's defaults, `blocks`, `index`, `index0`, `location`) and the schema's `locales` in scope. https://shopify.dev/docs/storefronts/themes/architecture/sections/section-schema#tag and https://shopify.dev/docs/api/liquid/objects/section
   *
   * A section that does not parse, whose schema or own saved JSON has a field of the wrong type, or in which an error was printed (by its render, or by a block of the wrong shape, see `fail`), keeps its wrapper and prints the error inside it, and the report records it as `failed` with the error as its `reason`; a section file that does not exist renders nothing and is reported as `missing`. An error the engine records without printing (an undefined variable, a failed `assign`) is listed in `report.errors` and does not make the section `failed`. shopify.dev documents none of this (the Section Rendering API page, https://shopify.dev/docs/api/ajax/section-rendering, says only that a section that fails comes back as `null`). A `renderLimit`, `memoryLimit` or `parseLimit` hit is Debutify's safety limit, not an error of the section, so it is not caught here and rejects the whole render.
   *
   * The group's `shopify-section-group-<name>` class follows the example response on the Section Rendering API page, https://shopify.dev/docs/api/ajax/section-rendering (which writes the attribute as `className`, apparently a typo). Not pinned by shopify.dev: accepting a schema `tag` outside the documented `article`, `aside`, `div`, `footer`, `header` and `section` (any element name is used, as themes do with custom elements), and ignoring `custom_css`, which is reported.
   */
  private * renderSection (data: SectionData, placement: Placement): Generator<unknown, string, unknown> {
    const started = now()
    const type = typeof data.type === 'string' ? data.type : '(no type)'
    const report = (status: 'rendered' | 'missing' | 'failed', reason?: string, shown = type) => this.state.report.section({ id: placement.id, type: shown, location: placement.location, status, ms: now() - started, reason })
    const file = `sections/${type}.liquid`
    if (typeof data.type !== 'string' || !this.theme.has(file)) {
      const shown = typeof data.type === 'string' ? reportName(type) : type
      this.state.report.missing('section', shown)
      report('missing', undefined, shown)
      return ''
    }
    let templates: Template[]
    try {
      templates = this.theme.templates(file)
    } catch (err) {
      const message = this.fail(err)
      report('failed', message)
      return this.wrapSection(placement, {}, escapeHtml(message))
    }
    let schema: SectionSchema = {}
    const errorsBefore = this.errors.length
    const failuresBefore = this.failures.length
    let html: string
    try {
      schema = this.schema<SectionSchema>(templates, file)
      const saved = placement.useSchemaDefault && schema.default ? { ...presetData(schema.default), ...data } : data
      this.checkContainer(saved, `section ${placement.id}`)
      const section = {
        id: placement.id,
        settings: new SettingsDrop(schema.settings, saved.settings ?? undefined, this.env),
        blocks: this.sectionBlocks(saved, schema, `section ${placement.id}`),
        index: placement.index,
        index0: placement.index === null ? null : placement.index - 1,
        location: placement.location
      }
      if (saved.custom_css?.length) this.state.report.unsupported('custom_css', `${type}: custom CSS is not applied`)
      const frame: Frame = { kind: 'section', section: { id: placement.id, type, index: placement.index, locales: schema.locales }, container: saved, sectionObject: section }
      this.state.frames.push(frame)
      try {
        html = (yield this.theme.liquid.renderer.renderTemplates(templates, this.child({ section }))) as string
      } finally {
        this.state.frames.pop()
      }
      const printed = [...this.errors.slice(errorsBefore).map(errorMessage), ...this.failures.slice(failuresBefore)].find(message => html.includes(message) || html.includes(escapeHtml(message)))
      if (printed) report('failed', printed)
      else report('rendered')
    } catch (err) {
      const message = this.fail(err)
      html = escapeHtml(message)
      report('failed', message)
    }
    return this.wrapSection(placement, schema, html)
  }

  private wrapSection (placement: Placement, schema: SectionSchema, html: string): string {
    const tag = typeof schema.tag === 'string' && TAG_NAME.test(schema.tag) ? schema.tag : 'div'
    const classes = ['shopify-section', placement.groupClass, typeof schema.class === 'string' ? schema.class : ''].filter(Boolean).join(' ')
    return `<${tag} id="shopify-section-${escapeHtml(placement.id)}" class="${escapeHtml(classes)}">${html}</${tag}>`
  }

  /** Stops `{% section %}`, `{% sections %}` and `{% content_for %}` that open one another without end; the tag that goes too deep prints `Nesting too deep` in the section or block that holds it. See `MAX_NESTING_DEPTH`. */
  private checkDepth (): void {
    if (this.state.frames.length >= MAX_NESTING_DEPTH) throw new Error('Nesting too deep')
  }

  /**
   * `{% section 'name' %}`: renders `sections/<name>.liquid` statically, with the id `<name>`, `section.index` nil and `section.location` `static`. https://shopify.dev/docs/api/liquid/objects/section ("Static sections use their filename without `.liquid`" as their ID; `index` is nil for a static section; `location` is `static`).
   *
   * Its settings come from `current.sections[name]` in `config/settings_data.json`; with no such entry, from the schema's `default` object (its `settings`, and its `blocks` array as the section's blocks), then the schema's per-setting defaults. https://shopify.dev/docs/storefronts/themes/architecture/sections/section-schema says that for a statically rendered section "you can define a default configuration with the `default` object", which "has the same attributes as the preset object"; the ids given to its blocks are not pinned. shopify.dev does not say where a static section's saved settings live (https://shopify.dev/docs/storefronts/themes/architecture/config/settings-data-json describes only `current`, `presets` and `platform_customizations`), so `sections` under `current` is the shape exported themes use, and goes on the "confirm on a development store" list.
   */
  public * renderStaticSection (name: string): Generator<unknown, string, unknown> {
    this.checkDepth()
    const sections = this.current.sections
    const stored = isRecord(sections) ? own(sections, name) : undefined
    const saved = isRecord(stored)
    return (yield this.renderSection({ ...(saved ? stored : {}), type: name } as SectionData, { id: name, location: 'static', index: null, useSchemaDefault: !saved })) as string
  }

  /**
   * The group `sections/<name>.json` with the request's contextual file applied, or undefined (and reported) when the file does not exist. A group that is not an object is reported and read as undefined too. A contextual file `<name>.context.<context>.json` whose `context` (`market`, `b2b`) matches the request's overrides the group; the first match in file order wins, and several matching is not pinned. A request with no `context` reads none of them, and one that is not valid JSON, not an object, or whose `sections` is not an object or `order` not an array (when its `context` matches) is reported under its own path and skipped, so the group the base file describes still renders and it affects only a request that has a context. https://shopify.dev/docs/storefronts/themes/architecture/section-groups#contextual-section-groups
   */
  private resolveGroup (name: string): GroupJson | undefined {
    const file = `sections/${name}.json`
    const found = this.theme.json(file)
    if (found === undefined) {
      this.state.report.missing('section_group', name)
      return undefined
    }
    if (!isRecord(found)) {
      this.ignored('section_group', file, 'a JSON object')
      return undefined
    }
    let group: GroupJson = found
    const requested = this.options.request?.context
    if (!requested) return group
    for (const path of this.theme.paths(`sections/${name}.context.`)) {
      let variant: unknown
      try {
        variant = this.theme.json(path)
      } catch (err) {
        this.state.report.unsupported('section_group', (err as Error).message)
        continue
      }
      if (!isRecord(variant)) {
        this.ignored('section_group', path, 'a JSON object')
        continue
      }
      if (matchesContext(variant.context as ContextFile['context'], requested)) {
        const sectionsOk = variant.sections === undefined || isRecord(variant.sections)
        const orderOk = variant.order === undefined || Array.isArray(variant.order)
        if (!sectionsOk) this.ignored('section_group', `${path} "sections"`, 'an object')
        if (!orderOk) this.ignored('section_group', `${path} "order"`, 'an array')
        if (!sectionsOk || !orderOk) continue
        group = deepMerge(group, { sections: variant.sections, order: variant.order })
        break
      }
    }
    return group
  }

  /** The sections of a group as `renderPage` places them: ids `sections--<name>__<key>`, the group's `type` as `location` (the name when it has none), a 1-based `index`, and the class `shopify-section-group-<name>`. */
  private groupEntries (name: string, group: GroupJson): Entry[] {
    let location = typeof group.type === 'string' ? group.type : name
    if (!this.trust.htmlSettings && !SAFE_GROUP_TYPE.test(location)) {
      this.state.report.unsupported('unsafe_key', `sections/${name}.json has a type with characters other than letters, digits, ., - and _ and was replaced by the group name`)
      location = name
    }
    return this.entries(group, `sections/${name}.json`, (key, index) => ({ id: `sections--${name}__${key}`, location, index, groupClass: `shopify-section-group-${name}` }))
  }

  /**
   * `{% sections 'name' %}`: renders the section group `sections/<name>.json`, its sections in `order`, each as `sections--<name>__<key>` with the group's `type` as its `location` and a 1-based `index`. https://shopify.dev/docs/storefronts/themes/architecture/section-groups and https://shopify.dev/docs/api/liquid/tags/sections. A group file that does not exist renders nothing and is reported.
   *
   * See `resolveGroup` for the contextual files. The `<!-- BEGIN sections: <name> -->` comments around the group are not pinned by shopify.dev (the page says only that sections render "with no markup between the sections").
   */
  public * renderSectionGroup (name: string): Generator<unknown, string, unknown> {
    this.checkDepth()
    const group = this.resolveGroup(name)
    if (!group) return ''
    let out = ''
    for (const entry of this.groupEntries(name, group)) {
      if (!entry.disabled) out += (yield this.renderSection(entry.data, entry.placement)) as string
    }
    return `<!-- BEGIN sections: ${name} -->${out}<!-- END sections: ${name} -->`
  }

  /**
   * `{% content_for 'blocks' %}`: the theme blocks of the section or block being rendered, in `block_order` (the order of the saved `blocks` when there is none), each as `renderThemeBlock` renders it. https://shopify.dev/docs/api/liquid/tags/content_for ("renders theme blocks as configured in the JSON template or section groups") and https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks ("The content is rendered in the order that's stored in the JSON template"; a theme block can accept other theme blocks as children, and its own `content_for 'blocks'` renders those).
   *
   * A `disabled` block and a `static` one are skipped: https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks/static-blocks says static block ids are not in `block_order` and a static block is placed by its own `content_for 'block'`. shopify.dev does not say whether `disabled` is a key of a block (https://shopify.dev/docs/storefronts/themes/architecture/templates/json-templates documents it for sections only), so skipping it follows `section.blocks` (Task 8).
   *
   * An app block is rendered by its app, so it is skipped and reported. https://shopify.dev/docs/storefronts/themes/architecture/blocks/app-blocks says `content_for 'blocks'` "handles block rendering, including app blocks".
   */
  public * renderBlocks (): Generator<unknown, string, unknown> {
    const frame = currentFrame(this.state)
    if (!frame) {
      this.state.report.unsupported('content_for', "'blocks' outside a section")
      return ''
    }
    let out = ''
    for (const id of frame.container.block_order ?? Object.keys(frame.container.blocks ?? {})) {
      const data = frame.container.blocks ? own(frame.container.blocks, id) as BlockData | undefined : undefined
      if (!data || data.disabled || data.static || !this.keyAllowed(id, 'block') || !this.blockTypeAllowed(data.type)) continue
      if (isAppBlock(data.type)) {
        this.state.report.unsupported('app_block', `${frame.block ? `${frame.section.type} block ${frame.block.type} ${frame.block.id}` : frame.section.type}: ${typeof data.type === 'string' ? reportName(data.type) : String(data.type)}`)
        continue
      }
      out += (yield this.renderThemeBlock(id, data, {}, frame)) as string
    }
    return out
  }

  /** `{% render block %}` for a block of `section.blocks` or `block.blocks`: a theme block renders as `renderThemeBlock` renders it under `content_for`, and an app block prints nothing and is reported. `undefined` for a value that is not one of this page's blocks. See `ShopifyRenderTag`. */
  public * renderBlockObject (value: object): Generator<unknown, string | undefined, unknown> {
    const entry = this.blockObjects.get(value)
    const frame = currentFrame(this.state)
    if (!entry || !frame) return undefined
    if (isAppBlock(entry.data.type)) {
      this.state.report.unsupported('app_block', `${frame.block ? `${frame.section.type} block ${frame.block.type} ${frame.block.id}` : frame.section.type}: ${reportName(entry.data.type as string)}`)
      return ''
    }
    return (yield this.renderThemeBlock(entry.id, entry.data, {}, frame)) as string
  }

  /**
   * `{% content_for 'block', type: 'slide', id: 'slide-1', color: '#111' %}`: one static block. https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks/static-blocks says the `id` is required and only has to be unique among its siblings, that Shopify never generates it, and that extra parameters are passed to the block as variables. Its saved settings are the entry of the same `id` in the `blocks` of the section or block it is rendered in, which is also where that page's JSON puts a static block (with `"static": true`); a block with no saved entry uses the schema's default settings ("will always get added … using the default settings values").
   *
   * A saved entry of another `type` keeps its settings under the tag's type, and a saved entry marked `disabled` renders nothing, like a dynamic block. shopify.dev pins neither, so both go on the "confirm on a development store" list. Only an entry with `"static": true` is a static block's: a non-static sibling with the same id (shopify.dev says ids are unique among siblings, so this is invalid input) keeps its settings and its blocks to itself, and the collision is reported.
   */
  public * renderStaticBlock (type: string, id: string, params: Record<string, unknown>): Generator<unknown, string, unknown> {
    const frame = currentFrame(this.state)
    if (!frame) {
      this.state.report.unsupported('content_for', "'block' outside a section")
      return ''
    }
    const found = frame.container.blocks ? own(frame.container.blocks, id) as BlockData | undefined : undefined
    const stored = found?.static ? found : undefined
    if (found && !stored) this.state.report.unsupported('static_block', `${frame.section.type}: block ${id} is not static, so its saved entry is not used by the static block of that id`)
    if (stored?.disabled) return ''
    return (yield this.renderThemeBlock(id, { ...stored, type, static: true }, params, frame)) as string
  }

  /**
   * One theme block, from `blocks/<type>.liquid`, in Shopify's wrapper `<div id="shopify-block-<id>" class="shopify-block [schema class]">`, or bare when its schema says `"tag": null`. https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks/schema#tag and #class give the wrapper, its `id`, and the appended class.
   *
   * The block renders in a context of its own: the page's globals, the `section` object of the section that holds it, `block` (`id`, `type`, `settings` over the schema's defaults, and an empty `shopify_attributes`) and the static block's extra parameters. https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks says a block can read global objects and the `section` object but "can't see variables from outside the block", and https://shopify.dev/docs/api/liquid/objects/block says `shopify_attributes` returns no value outside the theme editor, which this package never is. The block is pushed on the frame stack, so its own `content_for 'blocks'` and static blocks use its `blocks`.
   *
   * A block file that does not exist renders nothing and is reported as `missing`. One that does not parse, whose schema has a field of the wrong type, or whose saved JSON is not an object or has a field of the wrong type (`settings` or `blocks` not objects, `block_order` not an array) prints its error inside the default wrapper, as a section does, and one whose render raises an error prints it inline in its content; either error fails the section that holds the block (the report lists it as `failed`) and leaves the block's siblings alone. A parse error is listed in `report.errors` with its line; a schema or saved JSON of the wrong shape has no line and is not (see `fail`). A `renderLimit` or `memoryLimit` hit is not caught: it rejects the page, as in a section. Not pinned by shopify.dev: those cases, the wrapper of a block that does not parse (the default one is used), any `tag` other than a lowercase element name (`div` is used; the schema page allows "any string up to a limit of 50 characters", and what Shopify renders for a longer or invalid one is not stated), and whether `class` applies when `tag` is `null` (it does not here).
   */
  private * renderThemeBlock (id: string, data: BlockData, params: Record<string, unknown>, frame: Frame): Generator<unknown, string, unknown> {
    this.checkDepth()
    if (!isRecord(data)) return this.wrapBlock(id, {}, escapeHtml(this.fail(new Error(`block ${id} must be an object`))))
    const type = typeof data.type === 'string' ? data.type : '(no type)'
    const file = `blocks/${type}.liquid`
    if (typeof data.type !== 'string' || !this.theme.has(file)) {
      this.state.report.missing('block', typeof data.type === 'string' ? reportName(type) : type)
      return ''
    }
    let templates: Template[]
    let schema: BlockSchema
    let block: LiquidObject
    try {
      templates = this.theme.templates(file)
      schema = this.schema<BlockSchema>(templates, file)
      this.checkContainer(data, `block ${id}`)
      // `blocks` is not on https://shopify.dev/docs/api/liquid/objects/block; Shopify's Horizon theme reads `block.blocks.size` in a theme block (blocks/_carousel-content.liquid) as the children its `content_for 'blocks'` renders, so it lists them as `section.blocks` lists a section's
      block = { id, type, settings: new SettingsDrop(schema.settings, data.settings ?? undefined, this.env), blocks: this.sectionBlocks(data as SectionData, {}, `block ${id}`), shopify_attributes: '' }
    } catch (err) {
      return this.wrapBlock(id, {}, escapeHtml(this.fail(err)))
    }
    this.state.frames.push({ kind: 'block', block: { id, type }, section: frame.section, container: data, sectionObject: frame.sectionObject })
    let html: string
    try {
      html = (yield this.theme.liquid.renderer.renderTemplates(templates, this.child({ section: frame.sectionObject, block }, { ...params }))) as string
    } finally {
      this.state.frames.pop()
    }
    return this.wrapBlock(id, schema, html)
  }

  private wrapBlock (id: string, schema: BlockSchema, html: string): string {
    if (schema.tag === null) return html
    const tag = typeof schema.tag === 'string' && TAG_NAME.test(schema.tag) ? schema.tag : 'div'
    const classes = ['shopify-block', schema.class].filter(Boolean).join(' ')
    return `<${tag} id="shopify-block-${escapeHtml(id)}" class="${escapeHtml(classes)}">${html}</${tag}>`
  }
}

/**
 * Renders one page of an Online Store 2.0 theme with store data and returns the HTML and the render report. The theme is parsed once per `theme` object. Every call has its own Shopify state, report and error list, so concurrent renders of one theme do not see each other.
 *
 * It rejects when there is no page to show: the template does not exist or is not a JSON object, `config/settings_data.json` or `config/settings_schema.json` is not valid, or the page runs past `renderLimit`, `memoryLimit` or `parseLimit`. Anything narrower is reported and the page still renders: a section, block, layout or section group that is missing or broken, a locale file or contextual group file that is not valid JSON, a `wrapper` or `order` of the wrong type.
 */
export async function renderPage (options: RenderPageOptions): Promise<RenderPageResult> {
  return new PageRender(compileTheme(options.theme, options), options).page()
}

/**
 * Renders one section of the page, as `renderPage` would place it (same id, `index`, `location` and group class), for re-rendering an edited section. `section` is the id `renderPage` reports for it (`report.sections[].id`): `template--<template>__<key>`, `sections--<group>__<key>` (with the request's `context` applied to the group), a bare key of the JSON template's `sections` (`featured`), or a static section's name, tried in that order. A key the page does not have, or a disabled section, renders nothing and is reported; a template that does not exist rejects, as `renderPage` does. The template is the one `renderPage` would choose for the same options (the alternate template a `view` or `template_suffix` picks), so a section id names that template (`template--product-probe__main`), not the base one.
 *
 * https://shopify.dev/docs/api/ajax/section-rendering returns a section's HTML alone, as this does, and addresses sections by these ids, but the section object's page says `index` is nil there, where this keeps the index the section has on the page so the section matches its place in a preview. The `assets` of the result hold the section's `{% stylesheet %}` and `{% javascript %}` bodies; see `RenderSectionResult`.
 */
export async function renderSection (options: RenderSectionOptions): Promise<RenderSectionResult> {
  return new PageRender(compileTheme(options.theme, options), options).section(options.section)
}
