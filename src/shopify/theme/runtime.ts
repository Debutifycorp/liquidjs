import { Context } from '../../context'
import type { Liquid } from '../../liquid'
import type { Template } from '../../template'
import { toPromise } from '../../util/async'
import { LiquidError } from '../../util/error'
import { isLimitError } from '../../util/inline-error'
import { getPerformance } from '../../util/performance'
import { createShopifyLiquid } from '../preset'
import { errorMessage, RenderReport } from '../report'
import { sampleStoreData } from '../sample/sample-data'
import type { ShopifyServices } from '../services'
import { SettingDefinition, SettingsDrop, SettingsEnv } from '../settings'
import { createState, currentFrame, Frame, ShopifyState, STATE, ThemeHooks } from '../state'
import { buildStore, LiquidObject } from '../store/build'
import { buildGlobals, RequestInput } from '../store/globals'
import type { StoreData } from '../store/types'
import { SchemaTag } from '../tags/raw'
import { Translator } from '../translations'
import type { BlockData, LocaleTree, SectionData } from '../types'
import { escapeHtml } from '../util/html'
import { deepMerge, parseThemeJson, parseWrapper } from './json'
import { contentForHeader, newHeaderMarker } from './header'

/** An Online Store 2.0 theme as a map of its files by path (`sections/header.liquid`). The package never reads the file system. */
export interface ThemeInput {
  files: Record<string, string>
}

export interface RenderPageOptions {
  theme: ThemeInput
  /** `index`, `product`, `page.contact`, `customers/login`: `templates/<name>.json` or `templates/<name>.liquid`. https://shopify.dev/docs/storefronts/themes/architecture/templates/json-templates says "A template can only exist as a JSON or Liquid template, not both"; a theme that has both is one Shopify would refuse, and the JSON file wins here. */
  templateName: string
  /** Defaults to the package's public sample store. */
  data?: StoreData
  /** Defaults to the shop's locale. */
  locale?: string
  request?: RequestInput
  services?: Partial<ShopifyServices>
  trustLiquidSettings?: boolean
  trustHtmlSettings?: boolean
  /** Milliseconds for the whole page (default: the preset's `renderLimit`). A page that runs past it, or past `memoryLimit` or the engine's `parseLimit` (10,000,000 characters per file), rejects. */
  renderLimit?: number
  memoryLimit?: number
}

export interface RenderPageResult {
  html: string
  report: RenderReport
}

/** What `renderSection` returns: the section's HTML and report, and the bodies of the `{% stylesheet %}` and `{% javascript %}` tags that ran while it rendered. */
export interface RenderSectionResult extends RenderPageResult {
  /** The bodies `renderPage` would inline into `content_for_header` for this section (and the snippets and blocks it rendered), one string per file in the order first rendered, untouched. A caller that swaps a new kind of section into a page puts them where the page's other bodies are. The Section Rendering API (https://shopify.dev/docs/api/ajax/section-rendering) returns a section's HTML alone, and shopify.dev does not say how a section's stylesheet and javascript reach the page there, so returning them is Debutify's. */
  assets: { stylesheets: string[], javascripts: string[] }
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
const GROUP_SECTION_ID = /^sections--(.+)__(.+)$/

/** How many sections may be open inside one another. Ruby Liquid stops a render nested deeper than `Liquid::Block::MAX_DEPTH`, 100, with `Nesting too deep` (`Liquid::Context#check_overflow` and `#overflow?` in Shopify/liquid, `lib/liquid/context.rb` and `lib/liquid/block.rb`). shopify.dev does not document a section nesting limit, so applying that depth to `{% section %}` and `{% sections %}` is Debutify's choice. */
const MAX_SECTION_DEPTH = 100

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

/** A key's own value: a JSON key such as `constructor` is not looked up on the prototype. */
const own = (object: Record<string, unknown>, key: string): unknown => Object.prototype.hasOwnProperty.call(object, key) ? object[key] : undefined

/** A block of an app, https://shopify.dev/docs/storefronts/themes/architecture/blocks/app-blocks (`@app` in a schema) and https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration (`shopify://apps/<app_name>/blocks/<block_name>/<unique_ID>` as the `type` in saved JSON). */
function isAppBlock (type: unknown): boolean {
  return typeof type === 'string' && (type === '@app' || type.startsWith('shopify://apps/'))
}

/** Throws when `value` is not undefined or an array of objects (`schema.settings`, `schema.blocks`). */
function objectList (value: unknown, where: string): void {
  if (value !== undefined && !(Array.isArray(value) && value.every(isObject))) throw new Error(`${where} must be an array of objects`)
}

/** Throws when `value` is not undefined or an object. */
function optionalObject (value: unknown, where: string): void {
  if (value !== undefined && value !== null && !isObject(value)) throw new Error(`${where} must be an object`)
}

/** A schema `default` or preset: `settings` and a `blocks` array whose entries are presets in turn. https://shopify.dev/docs/storefronts/themes/architecture/sections/section-schema ("the same attributes as the preset object") */
function presetShape (preset: unknown, where: string): void {
  if (!isObject(preset)) throw new Error(`${where} must be an object`)
  optionalObject(preset.settings, `${where} "settings"`)
  if (preset.blocks !== undefined) {
    if (!Array.isArray(preset.blocks)) throw new Error(`${where} "blocks" must be an array`)
    preset.blocks.forEach((block, i) => presetShape(block, `${where} block ${i + 1}`))
  }
}

/** A schema `default` as the JSON data of a section: its `blocks` array becomes `blocks` and `block_order`, with ids `block-1`, `block-2`… among siblings. shopify.dev does not say what ids Shopify gives them. */
function presetData (preset: Record<string, unknown>): { settings?: Record<string, unknown>, blocks?: Record<string, BlockData>, block_order?: string[] } {
  const out: ReturnType<typeof presetData> = {}
  if (isObject(preset.settings)) out.settings = preset.settings
  if (Array.isArray(preset.blocks)) {
    out.blocks = {}
    out.block_order = []
    preset.blocks.forEach((block: Record<string, unknown>, i) => {
      const id = `block-${i + 1}`
      out.blocks![id] = { ...presetData(block), type: String(block.type) }
      out.block_order!.push(id)
    })
  }
  return out
}

/** One theme, parsed once: an engine over its files and its parsed JSON, both re-read only when a file's contents change. */
export class CompiledTheme {
  public readonly liquid: Liquid
  private readonly jsonCache = new Map<string, { source: string, value: unknown }>()

  public constructor (public readonly files: Record<string, string>) {
    this.liquid = createShopifyLiquid({ files })
  }

  public has (path: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.files, path)
  }

  /** Paths starting with `prefix`, in key order. */
  public paths (prefix: string): string[] {
    return Object.keys(this.files).filter(path => path.startsWith(prefix))
  }

  /** The parsed JSON file, undefined when it does not exist. Throws when it is not valid JSON. */
  public json (path: string): unknown {
    if (!this.has(path)) return undefined
    const source = this.files[path]
    const cached = this.jsonCache.get(path)
    if (cached && cached.source === source) return cached.value
    const value = parseThemeJson(source, path)
    this.jsonCache.set(path, { source, value })
    return value
  }

  /** The parsed Liquid file, from the engine's cache when unchanged. Throws the parse error. */
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
        if (isObject(tree)) return tree as LocaleTree
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

const compiled = new WeakMap<ThemeInput, CompiledTheme>()

/**
 * The compiled form of `theme`, made on first use and kept as long as the theme object lives. Editing `theme.files[path]` is picked up (the engine and the JSON cache compare each file's contents); replacing `theme.files` with a new map compiles the theme again.
 *
 * The compiled theme reads `theme.files` live, so a render that is still running when a file is edited can mix the old and new versions of different files. Give each saved version of a theme its own `theme` object (or its own `files` map) and do not edit a map a render is using.
 */
export function compileTheme (theme: ThemeInput): CompiledTheme {
  let result = compiled.get(theme)
  if (!result || result.files !== theme.files) {
    result = new CompiledTheme(theme.files)
    compiled.set(theme, result)
  }
  return result
}

/** A contextual section group file applies when every key it names matches the request's context. https://shopify.dev/docs/storefronts/themes/architecture/section-groups#contextual-section-groups says its `context` holds `"market": "market-handle"` or `"b2b": true`; combining both keys is not pinned. */
function matchesContext (wanted: ContextFile['context'], request: RequestInput['context']): boolean {
  if (!isObject(wanted) || !request || !Object.keys(wanted).length) return false
  if (wanted.market !== undefined && wanted.market !== request.market) return false
  if (wanted.b2b !== undefined && String(wanted.b2b) !== String(!!request.b2b)) return false
  return true
}

/** Renders one page; implements the hooks the `section`, `sections` and `content_for` tags call. */
class PageRender implements ThemeHooks {
  public readonly state: ShopifyState
  private readonly started = now()
  private readonly errors: LiquidError[] = []
  private readonly env: SettingsEnv
  private readonly globals: Record<string | symbol, unknown>
  private readonly root: Context
  private readonly current: Record<string, unknown>
  private readonly templateId: string
  private readonly headerMarker = newHeaderMarker()

  public constructor (private readonly theme: CompiledTheme, private readonly options: RenderPageOptions) {
    const store = buildStore(options.data ?? sampleStoreData)
    const locale = options.locale ?? String(store.shop.locale)
    const translator = theme.translator(locale, message => this.state.report.unsupported('locale file', message))
    this.state = createState({
      services: options.services,
      translator,
      moneyFormat: String(store.shop.money_format),
      moneyWithCurrencyFormat: String(store.shop.money_with_currency_format),
      trustLiquidSettings: options.trustLiquidSettings,
      trustHtmlSettings: options.trustHtmlSettings,
      runtime: this
    })
    const page = buildGlobals({ store, templateName: options.templateName, request: options.request ?? {}, locale, report: this.state.report })
    this.state.request = page.request
    this.env = { store, linklists: page.linklists, services: this.state.services, translator, report: this.state.report, trust: this.state.trust }
    const settingsData = theme.json('config/settings_data.json') ?? {}
    if (!isObject(settingsData)) throw new Error('config/settings_data.json: must be a JSON object')
    // `current` is an object on https://shopify.dev/docs/storefronts/themes/architecture/config/settings-data-json; a preset name there is the older shape, not pinned by shopify.dev
    const presets = isObject(settingsData.presets) ? settingsData.presets : {}
    const current = typeof settingsData.current === 'string' ? own(presets, settingsData.current) : settingsData.current
    this.current = isObject(current) ? current : {}
    const values = Object.fromEntries(Object.entries(this.current).filter(([key]) => !['sections', 'content_for_index', 'blocks'].includes(key)))
    const schema = theme.json('config/settings_schema.json') ?? []
    if (!Array.isArray(schema)) throw new Error('config/settings_schema.json: must be a JSON array')
    const definitions = schema.flatMap(group => isObject(group) && Array.isArray(group.settings) ? group.settings.filter(isObject) : []) as SettingDefinition[]
    this.globals = { ...page.globals, settings: new SettingsDrop(definitions, values, this.env), [STATE]: this.state }
    this.templateId = options.templateName.replace(/[^\w-]/g, '-')
    this.root = new Context({}, theme.liquid.options, { sync: false, globals: this.globals, renderLimit: options.renderLimit, memoryLimit: options.memoryLimit }, { liquid: theme.liquid, errors: this.errors })
  }

  public async page (): Promise<RenderPageResult> {
    const html = await toPromise(this.renderDocument())
    return { html, report: this.state.report.toReport(this.errors, now() - this.started) }
  }

  public async section (key: string): Promise<RenderSectionResult> {
    const html = await toPromise(this.renderOneSection(key))
    const { stylesheets, javascripts } = this.state.assets
    return { html, report: this.state.report.toReport(this.errors, now() - this.started), assets: { stylesheets: [...stylesheets.values()], javascripts: [...javascripts.values()] } }
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
    return html.split(this.headerMarker).join(contentForHeader(this.state, this.globals))
  }

  /** Records an error that stopped a whole file and returns the message Shopify would print in its place. A `renderLimit`, `memoryLimit` or `parseLimit` hit is Debutify's safety limit, not an error of the file, so it is not turned into a message: it rejects the render. */
  private fail (err: unknown): string {
    if (isLimitError(err)) throw err
    if (LiquidError.is(err)) this.errors.push(err)
    return errorMessage(err)
  }

  /** Reports something the render ignored because its JSON has the wrong shape. */
  private ignored (feature: string, where: string, expected: string) {
    this.state.report.unsupported(feature, `${where} is not ${expected}`)
  }

  /** `value` as the object it should be; a value of another type is reported and read as empty. */
  private objectOf (value: unknown, feature: string, where: string): Record<string, unknown> {
    if (value === undefined || value === null) return {}
    if (isObject(value)) return value
    this.ignored(feature, where, 'an object')
    return {}
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
      if (!data) continue
      const disabled = !!data.disabled
      entries.push({ key, data, disabled, placement: place(key, disabled ? null : ++index) })
    }
    return entries
  }

  private templateEntries (template: TemplateJson): Entry[] {
    return this.entries(template, `templates/${this.options.templateName}.json`, (key, index) => ({ id: `template--${this.templateId}__${key}`, location: 'template', index }))
  }

  private templateJson (): TemplateJson | undefined {
    const path = `templates/${this.options.templateName}.json`
    if (!this.theme.has(path)) return undefined
    const template = this.theme.json(path)
    if (!isObject(template)) throw new Error(`${path}: must be a JSON object`)
    return template
  }

  /** The JSON template, or undefined for a Liquid template. A template that does not exist rejects: there is no page to show. */
  private requireTemplate (): TemplateJson | undefined {
    const name = this.options.templateName
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
    const name = this.options.templateName
    const template = this.requireTemplate()
    if (template) {
      let out = ''
      for (const entry of this.templateEntries(template)) {
        if (!entry.disabled) out += (yield this.renderSection(entry.data, entry.placement)) as string
      }
      const wrapper = typeof template.wrapper === 'string' ? parseWrapper(template.wrapper) : undefined
      if (template.wrapper !== undefined && !wrapper) this.state.report.unsupported('wrapper', String(template.wrapper))
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
   * 2. `sections--<group>__<key>`: the section `<key>` of the group (split at the last `__`), with the request's contextual file applied.
   * 3. A bare key of the template's `sections` (`featured`), so a caller need not build the id.
   * 4. A static section's name.
   *
   * A key the template or group does not have renders nothing and is reported as a missing section; a `disabled` section renders nothing and is reported, and is never rendered as a static section of the same name. The template must exist, as for `renderPage`.
   */
  private * renderOneSection (key: string): Generator<unknown, string, unknown> {
    const template = this.requireTemplate()
    const templateEntries = template ? this.templateEntries(template) : []
    const templatePrefix = `template--${this.templateId}__`
    const group = key.startsWith(templatePrefix) ? null : GROUP_SECTION_ID.exec(key)
    let entry: Entry | undefined
    if (key.startsWith(templatePrefix)) {
      entry = templateEntries.find(candidate => candidate.key === key.slice(templatePrefix.length))
    } else if (group) {
      const found = this.resolveGroup(group[1])
      if (found) entry = this.groupEntries(group[1], found).find(candidate => candidate.key === group[2])
      else return ''
    } else {
      entry = templateEntries.find(candidate => candidate.key === key)
      if (!entry) return (yield this.renderStaticSection(key)) as string
    }
    if (!entry) {
      this.state.report.missing('section', key)
      return ''
    }
    if (entry.disabled) {
      this.state.report.unsupported('disabled section', `${entry.placement.id} is disabled: nothing rendered`)
      return ''
    }
    return (yield this.renderSection(entry.data, entry.placement)) as string
  }

  /** A file's `{% schema %}` JSON, `{}` when it has none or its JSON is invalid (the invalid case is reported). Valid JSON of the wrong shape (`settings` or `blocks` that are not arrays of objects, `locales` or `default` that are not objects) throws: the section or block that reads it fails. https://shopify.dev/docs/storefronts/themes/architecture/sections/section-schema */
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
    if (!isObject(json)) return {} as T
    objectList(json.settings, `${file}: schema "settings"`)
    objectList(json.blocks, `${file}: schema "blocks"`)
    optionalObject(json.locales, `${file}: schema "locales"`)
    if (json.default !== undefined) presetShape(json.default, `${file}: schema "default"`)
    return json as T
  }

  private blockDefinitions (type: string, schema: SectionSchema): SettingDefinition[] {
    const local = schema.blocks?.find(definition => definition.type === type && Array.isArray(definition.settings))
    if (local) return local.settings ?? []
    const file = `blocks/${type}.liquid`
    if (!this.theme.has(file)) return []
    try {
      return this.schema<BlockSchema>(this.theme.templates(file), file).settings ?? []
    } catch {
      return []
    }
  }

  /** Throws when a section's JSON has a field of the wrong type: `settings` and `blocks` objects, `block_order` an array, every block an object with `settings` an object. */
  private checkSectionData (data: SectionData, id: string): void {
    const where = `section ${id}`
    optionalObject(data.settings, `${where}: "settings"`)
    optionalObject(data.blocks, `${where}: "blocks"`)
    if (data.block_order !== undefined && data.block_order !== null && !Array.isArray(data.block_order)) throw new Error(`${where}: "block_order" must be an array`)
    for (const [blockId, block] of Object.entries(data.blocks ?? {})) {
      if (!isObject(block)) throw new Error(`${where}: block ${blockId} must be an object`)
      optionalObject(block.settings, `${where}: block ${blockId} "settings"`)
    }
  }

  /** `section.blocks`: the section's non-static blocks in `block_order`, each with settings over its definition's defaults. A `disabled` block is skipped (https://shopify.dev/docs/storefronts/themes/architecture/templates/json-templates lists `disabled` on sections; for blocks it is not pinned). https://shopify.dev/docs/api/liquid/objects/block */
  private sectionBlocks (data: SectionData, schema: SectionSchema): LiquidObject[] {
    const blocks: LiquidObject[] = []
    for (const id of data.block_order ?? Object.keys(data.blocks ?? {})) {
      const block = data.blocks ? own(data.blocks, id) as BlockData | undefined : undefined
      if (!block || block.disabled || block.static) continue
      blocks.push({ id, type: block.type, settings: new SettingsDrop(this.blockDefinitions(block.type, schema), block.settings ?? undefined, this.env), shopify_attributes: '' })
    }
    return blocks
  }

  /**
   * One section in Shopify's wrapper, `<div id="shopify-section-<id>" class="shopify-section [group class] [schema class]">`, with the `section` object (`id`, `settings` over the schema's defaults, `blocks`, `index`, `index0`, `location`) and the schema's `locales` in scope. https://shopify.dev/docs/storefronts/themes/architecture/sections/section-schema#tag and https://shopify.dev/docs/api/liquid/objects/section
   *
   * A section that does not parse, whose schema or data has a field of the wrong type, or whose render raised an error that was printed, keeps its wrapper and prints the error inside it, and the report records it as `failed` with the error as its `reason`; a section file that does not exist renders nothing and is reported as `missing`. An error the engine records without printing (an undefined variable, a failed `assign`) is listed in `report.errors` and does not make the section `failed`. shopify.dev documents none of this (the Section Rendering API page, https://shopify.dev/docs/api/ajax/section-rendering, says only that a section that fails comes back as `null`). A `renderLimit`, `memoryLimit` or `parseLimit` hit is Debutify's safety limit, not an error of the section, so it is not caught here and rejects the whole render.
   *
   * Not pinned by shopify.dev: the group's `shopify-section-group-<name>` class, accepting a schema `tag` outside the documented `article`, `aside`, `div`, `footer`, `header` and `section` (any element name is used, as themes do with custom elements), and ignoring `custom_css`, which is reported.
   */
  private * renderSection (data: SectionData, placement: Placement): Generator<unknown, string, unknown> {
    const started = now()
    const type = typeof data.type === 'string' ? data.type : '(no type)'
    const report = (status: 'rendered' | 'missing' | 'failed', reason?: string) => this.state.report.section({ id: placement.id, type, location: placement.location, status, ms: now() - started, reason })
    const file = `sections/${type}.liquid`
    if (typeof data.type !== 'string' || !this.theme.has(file)) {
      this.state.report.missing('section', type)
      report('missing')
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
    let html: string
    try {
      schema = this.schema<SectionSchema>(templates, file)
      const saved = placement.useSchemaDefault && schema.default ? { ...presetData(schema.default), ...data } : data
      this.checkSectionData(saved, placement.id)
      const section = {
        id: placement.id,
        settings: new SettingsDrop(schema.settings, saved.settings ?? undefined, this.env),
        blocks: this.sectionBlocks(saved, schema),
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
      const printed = this.errors.slice(errorsBefore).find(err => html.includes(errorMessage(err)) || html.includes(escapeHtml(errorMessage(err))))
      if (printed) report('failed', errorMessage(printed))
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

  /** Stops `{% section %}` and `{% sections %}` that open one another without end; the tag that goes too deep prints `Nesting too deep` in the section that holds it. See `MAX_SECTION_DEPTH`. */
  private checkDepth (): void {
    if (this.state.frames.length >= MAX_SECTION_DEPTH) throw new Error('Nesting too deep')
  }

  /**
   * `{% section 'name' %}`: renders `sections/<name>.liquid` statically, with the id `<name>`, `section.index` nil and `section.location` `static`. https://shopify.dev/docs/api/liquid/objects/section ("Static sections use their filename without `.liquid`" as their ID; `index` is nil for a static section; `location` is `static`).
   *
   * Its settings come from `current.sections[name]` in `config/settings_data.json`; with no such entry, from the schema's `default` object (its `settings`, and its `blocks` array as the section's blocks), then the schema's per-setting defaults. https://shopify.dev/docs/storefronts/themes/architecture/sections/section-schema says that for a statically rendered section "you can define a default configuration with the `default` object", which "has the same attributes as the preset object"; the ids given to its blocks are not pinned. shopify.dev does not say where a static section's saved settings live (https://shopify.dev/docs/storefronts/themes/architecture/config/settings-data-json describes only `current`, `presets` and `platform_customizations`), so `sections` under `current` is the shape exported themes use, and goes on the "confirm on a development store" list.
   */
  public * renderStaticSection (name: string): Generator<unknown, string, unknown> {
    this.checkDepth()
    const sections = this.current.sections
    const stored = isObject(sections) ? own(sections, name) : undefined
    const saved = isObject(stored)
    return (yield this.renderSection({ ...(saved ? stored : {}), type: name } as SectionData, { id: name, location: 'static', index: null, useSchemaDefault: !saved })) as string
  }

  /**
   * The group `sections/<name>.json` with the request's contextual file applied, or undefined (and reported) when the file does not exist. A group that is not an object is reported and read as undefined too. A contextual file `<name>.context.<context>.json` whose `context` (`market`, `b2b`) matches the request's overrides the group; the first match in file order wins, and several matching is not pinned. A request with no `context` reads none of them, and one that is not valid JSON or not an object is reported and skipped, so it affects only a request that has a context. https://shopify.dev/docs/storefronts/themes/architecture/section-groups#contextual-section-groups
   */
  private resolveGroup (name: string): GroupJson | undefined {
    const file = `sections/${name}.json`
    const found = this.theme.json(file)
    if (found === undefined) {
      this.state.report.missing('section-group', name)
      return undefined
    }
    if (!isObject(found)) {
      this.ignored('section-group', file, 'a JSON object')
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
        this.state.report.unsupported('section-group', (err as Error).message)
        continue
      }
      if (!isObject(variant)) {
        this.ignored('section-group', path, 'a JSON object')
        continue
      }
      if (matchesContext(variant.context as ContextFile['context'], requested)) {
        group = deepMerge(group, { sections: variant.sections, order: variant.order })
        break
      }
    }
    return group
  }

  /** The sections of a group as `renderPage` places them: ids `sections--<name>__<key>`, the group's `type` as `location` (the name when it has none), a 1-based `index`, and the class `shopify-section-group-<name>`. */
  private groupEntries (name: string, group: GroupJson): Entry[] {
    const location = typeof group.type === 'string' ? group.type : name
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
      const data = frame.container.blocks?.[id]
      if (!data || data.disabled || data.static) continue
      if (isAppBlock(data.type)) {
        this.state.report.unsupported('app block', `${frame.section.type}: ${data.type}`)
        continue
      }
      out += (yield this.renderThemeBlock(id, data, {}, frame)) as string
    }
    return out
  }

  /**
   * `{% content_for 'block', type: 'slide', id: 'slide-1', color: '#111' %}`: one static block. https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks/static-blocks says the `id` is required and only has to be unique among its siblings, that Shopify never generates it, and that extra parameters are passed to the block as variables. Its saved settings are the entry of the same `id` in the `blocks` of the section or block it is rendered in, which is also where that page's JSON puts a static block (with `"static": true`); a block with no saved entry uses the schema's default settings ("will always get added … using the default settings values").
   *
   * A saved entry of another `type` keeps its settings under the tag's type, and a saved entry marked `disabled` renders nothing, like a dynamic block. shopify.dev pins neither, so both go on the "confirm on a development store" list.
   */
  public * renderStaticBlock (type: string, id: string, params: Record<string, unknown>): Generator<unknown, string, unknown> {
    const frame = currentFrame(this.state)
    if (!frame) {
      this.state.report.unsupported('content_for', "'block' outside a section")
      return ''
    }
    const stored = frame.container.blocks?.[id]
    if (stored?.disabled) return ''
    return (yield this.renderThemeBlock(id, { ...stored, type, static: true }, params, frame)) as string
  }

  /**
   * One theme block, from `blocks/<type>.liquid`, in Shopify's wrapper `<div id="shopify-block-<id>" class="shopify-block [schema class]">`, or bare when its schema says `"tag": null`. https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks/schema#tag and #class give the wrapper, its `id`, and the appended class.
   *
   * The block renders in a context of its own: the page's globals, the `section` object of the section that holds it, `block` (`id`, `type`, `settings` over the schema's defaults, and an empty `shopify_attributes`) and the static block's extra parameters. https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks says a block can read global objects and the `section` object but "can't see variables from outside the block", and https://shopify.dev/docs/api/liquid/objects/block says `shopify_attributes` returns no value outside the theme editor, which this package never is. The block is pushed on the frame stack, so its own `content_for 'blocks'` and static blocks use its `blocks`.
   *
   * A block file that does not exist renders nothing and is reported as `missing`. One that does not parse prints its error inside the default wrapper, as a section does, and one whose render raises an error prints it inline in its content; either error fails the section that holds the block (the report lists it as `failed`). A `renderLimit` or `memoryLimit` hit is not caught: it rejects the page, as in a section. Not pinned by shopify.dev: those cases, the wrapper of a block that does not parse (the default one is used), any `tag` other than a lowercase element name (`div` is used; the schema page allows "any string up to a limit of 50 characters", and what Shopify renders for a longer or invalid one is not stated), and whether `class` applies when `tag` is `null` (it does not here).
   */
  private * renderThemeBlock (id: string, data: BlockData, params: Record<string, unknown>, frame: Frame): Generator<unknown, string, unknown> {
    const type = typeof data.type === 'string' ? data.type : '(no type)'
    const file = `blocks/${type}.liquid`
    if (typeof data.type !== 'string' || !this.theme.has(file)) {
      this.state.report.missing('block', type)
      return ''
    }
    let templates: Template[]
    try {
      templates = this.theme.templates(file)
    } catch (err) {
      return this.wrapBlock(id, {}, escapeHtml(this.fail(err)))
    }
    const schema = this.schema<BlockSchema>(templates, file)
    const block = { id, type, settings: new SettingsDrop(schema.settings, data.settings, this.env), shopify_attributes: '' }
    this.state.frames.push({ kind: 'block', section: frame.section, container: data, sectionObject: frame.sectionObject })
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
  return new PageRender(compileTheme(options.theme), options).page()
}

/**
 * Renders one section of the page, as `renderPage` would place it (same id, `index`, `location` and group class), for re-rendering an edited section. `section` is the id `renderPage` reports for it (`report.sections[].id`): `template--<template>__<key>`, `sections--<group>__<key>` (with the request's `context` applied to the group), a bare key of the JSON template's `sections` (`featured`), or a static section's name, tried in that order. A key the page does not have, or a disabled section, renders nothing and is reported; a template that does not exist rejects, as `renderPage` does.
 *
 * https://shopify.dev/docs/api/ajax/section-rendering returns a section's HTML alone, as this does, and addresses sections by these ids, but the section object's page says `index` is nil there, where this keeps the index the section has on the page so the section matches its place in a preview. The `assets` of the result hold the section's `{% stylesheet %}` and `{% javascript %}` bodies; see `RenderSectionResult`.
 */
export async function renderSection (options: RenderPageOptions & { section: string }): Promise<RenderSectionResult> {
  return new PageRender(compileTheme(options.theme), options).section(options.section)
}
