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
import { createState, Frame, ShopifyState, STATE, ThemeHooks } from '../state'
import { buildStore, LiquidObject } from '../store/build'
import { buildGlobals, RequestInput } from '../store/globals'
import type { StoreData } from '../store/types'
import { SchemaTag } from '../tags/raw'
import { Translator } from '../translations'
import type { LocaleTree, SectionData } from '../types'
import { escapeHtml } from '../util/html'
import { deepMerge, parseThemeJson, parseWrapper } from './json'
import { contentForHeader, HEADER_MARKER } from './header'

/** An Online Store 2.0 theme as a map of its files by path (`sections/header.liquid`). The package never reads the file system. */
export interface ThemeInput {
  files: Record<string, string>
}

export interface RenderPageOptions {
  theme: ThemeInput
  /** `index`, `product`, `page.contact`, `customers/login`: `templates/<name>.json` or `templates/<name>.liquid`. https://shopify.dev/docs/storefronts/themes/architecture/templates does not say which wins when a theme has both; the JSON file does here. */
  templateName: string
  /** Defaults to the package's public sample store. */
  data?: StoreData
  /** Defaults to the shop's locale. */
  locale?: string
  request?: RequestInput
  services?: Partial<ShopifyServices>
  trustLiquidSettings?: boolean
  trustHtmlSettings?: boolean
  /** Milliseconds for the whole page (default: the preset's `renderLimit`). A page that runs past it, or past `memoryLimit`, rejects. */
  renderLimit?: number
  memoryLimit?: number
}

export interface RenderPageResult {
  html: string
  report: RenderReport
}

interface SectionSchema {
  tag?: string
  class?: string
  settings?: SettingDefinition[]
  blocks?: Array<{ type: string, settings?: SettingDefinition[] }>
  locales?: Record<string, LocaleTree>
}

interface BlockSchema {
  tag?: string | null
  class?: string
  settings?: SettingDefinition[]
}

interface TemplateJson {
  layout?: string | false
  wrapper?: string
  sections?: Record<string, SectionData>
  order?: string[]
}

interface GroupJson {
  type?: string
  sections?: Record<string, SectionData>
  order?: string[]
}

interface ContextFile {
  context?: { market?: string, b2b?: boolean | string }
  sections?: Record<string, unknown>
  order?: string[]
}

interface Placement {
  id: string
  location: string
  index: number | null
  groupClass?: string
}

const now = () => getPerformance().now()
const LOCALE_FILE = /^locales\/([\w-]+?)(\.default)?(\.schema)?\.json$/
const TAG_NAME = /^[a-z][a-z0-9-]*$/

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

  /** The translations for `locale`: storefront and schema locale files, with the `*.default.json` locale as fallback. https://shopify.dev/docs/storefronts/themes/architecture/locales names the files (`locales/en.default.json`, `locales/fr.json`, and `locales/en.default.schema.json` for the editor's strings). */
  public translator (locale: string): Translator {
    const locales: Record<string, LocaleTree> = {}
    const schemaLocales: Record<string, LocaleTree> = {}
    let defaultLocale = 'en'
    for (const path of this.paths('locales/')) {
      const match = LOCALE_FILE.exec(path)
      if (!match) continue
      const tree = this.json(path) as LocaleTree
      if (match[3]) schemaLocales[match[1]] = tree
      else {
        locales[match[1]] = tree
        if (match[2]) defaultLocale = match[1]
      }
    }
    return new Translator({ locale, defaultLocale, locales, schemaLocales })
  }
}

const compiled = new WeakMap<ThemeInput, CompiledTheme>()

/** The compiled form of `theme`, made on first use and kept as long as the theme object lives. Editing `theme.files[path]` is picked up (the engine and the JSON cache compare each file's contents); replacing `theme.files` with a new map compiles the theme again. */
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
  if (!wanted || !request || !Object.keys(wanted).length) return false
  if (wanted.market !== undefined && wanted.market !== request.market) return false
  if (wanted.b2b !== undefined && String(wanted.b2b) !== String(!!request.b2b)) return false
  return true
}

/** Renders one page; implements the hooks the `section` and `sections` tags call. */
class PageRender implements ThemeHooks {
  public readonly state: ShopifyState
  private readonly started = now()
  private readonly errors: LiquidError[] = []
  private readonly env: SettingsEnv
  private readonly globals: Record<string | symbol, unknown>
  private readonly root: Context
  private readonly current: Record<string, unknown>
  private readonly templateId: string

  public constructor (private readonly theme: CompiledTheme, private readonly options: RenderPageOptions) {
    const store = buildStore(options.data ?? sampleStoreData)
    const locale = options.locale ?? String(store.shop.locale)
    const translator = theme.translator(locale)
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
    // `current` is an object on https://shopify.dev/docs/storefronts/themes/architecture/config/settings-data-json; a preset name there is the older shape, not pinned by shopify.dev
    const settingsData = (theme.json('config/settings_data.json') ?? {}) as { current?: string | Record<string, unknown>, presets?: Record<string, Record<string, unknown>> }
    this.current = (typeof settingsData.current === 'string' ? settingsData.presets?.[settingsData.current] : settingsData.current) ?? {}
    const values = Object.fromEntries(Object.entries(this.current).filter(([key]) => !['sections', 'content_for_index', 'blocks'].includes(key)))
    const schema = (theme.json('config/settings_schema.json') ?? []) as Array<{ settings?: SettingDefinition[] }>
    this.globals = { ...page.globals, settings: new SettingsDrop(schema.flatMap(group => group.settings ?? []), values, this.env), [STATE]: this.state }
    this.templateId = options.templateName.replace(/[^\w-]/g, '-')
    this.root = new Context({}, theme.liquid.options, { sync: false, globals: this.globals, renderLimit: options.renderLimit, memoryLimit: options.memoryLimit }, { liquid: theme.liquid, errors: this.errors })
  }

  public async page (): Promise<RenderPageResult> {
    const html = await toPromise(this.renderDocument())
    return { html, report: this.state.report.toReport(this.errors, now() - this.started) }
  }

  public async section (key: string): Promise<RenderPageResult> {
    const html = await toPromise(this.renderOneSection(key))
    return { html, report: this.state.report.toReport(this.errors, now() - this.started) }
  }

  /** A context for one section or block: the page's globals plus `extra`, sharing the page's limits and error list. */
  private child (extra: Record<string, unknown>, scope: object = {}): Context {
    return new Context(scope, this.root.opts, { sync: false, globals: { ...this.globals, ...extra }, strictVariables: this.root.strictVariables, ownPropertyOnly: this.root.ownPropertyOnly }, { renderLimit: this.root.renderLimit, memoryLimit: this.root.memoryLimit, liquid: this.theme.liquid, errors: this.errors })
  }

  /**
   * The template renders first, then the layout around it with the template's output as `content_for_layout`, then `content_for_header` is filled in so it can include every stylesheet and javascript body the page rendered. https://shopify.dev/docs/storefronts/themes/architecture/layouts says `content_for_layout` "dynamically outputs the content for each template" and goes in the `<body>`, and `content_for_header` goes in the `<head>`; rendering the template before the layout is not pinned by shopify.dev. A layout that is missing renders the template alone and is reported; a layout that does not parse prints its error before the template.
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
    const html = (yield this.theme.liquid.renderer.renderTemplates(templates, this.child({ content_for_layout: content, content_for_header: HEADER_MARKER }))) as string
    return html.split(HEADER_MARKER).join(contentForHeader(this.state, this.globals))
  }

  /** Records an error that stopped a whole file and returns the message Shopify would print in its place. */
  private fail (err: unknown): string {
    if (LiquidError.is(err)) this.errors.push(err)
    return errorMessage(err)
  }

  private templateJson (): TemplateJson | undefined {
    return this.theme.json(`templates/${this.options.templateName}.json`) as TemplateJson | undefined
  }

  /**
   * A JSON template renders its `sections` in `order` (a `disabled` section is skipped) inside its `wrapper`, and names its `layout` (`false` for none, `theme` when absent). https://shopify.dev/docs/storefronts/themes/architecture/templates/json-templates
   *
   * A Liquid template renders as Liquid and chooses its layout with `{% layout %}`; `{% layout none %}` renders it alone, https://shopify.dev/docs/api/liquid/tags/layout ("By default, the `theme.liquid` layout is used"). One that does not parse prints its error as `content_for_layout`. A template that does not exist rejects: there is no page to show.
   */
  private * renderTemplate (): Generator<unknown, { content: string, layout: string | null }, unknown> {
    const name = this.options.templateName
    const template = this.templateJson()
    if (template) {
      let out = ''
      let index = 0
      for (const key of template.order ?? Object.keys(template.sections ?? {})) {
        const data = template.sections?.[key]
        if (!data || data.disabled) continue
        out += (yield this.renderSection(data, { id: `template--${this.templateId}__${key}`, location: 'template', index: ++index })) as string
      }
      const wrapper = template.wrapper ? parseWrapper(template.wrapper) : undefined
      if (template.wrapper && !wrapper) this.state.report.unsupported('wrapper', template.wrapper)
      return { content: wrapper ? wrapper[0] + out + wrapper[1] : out, layout: template.layout === false ? null : typeof template.layout === 'string' ? template.layout : 'theme' }
    }
    const file = `templates/${name}.liquid`
    if (!this.theme.has(file)) {
      this.state.report.missing('template', name)
      throw new Error(`template not found: templates/${name}.json or templates/${name}.liquid`)
    }
    let templates: Template[]
    try {
      templates = this.theme.templates(file)
    } catch (err) {
      return { content: escapeHtml(this.fail(err)), layout: 'theme' }
    }
    const content = (yield this.theme.liquid.renderer.renderTemplates(templates, this.child({}))) as string
    return { content, layout: this.state.layout === undefined ? 'theme' : this.state.layout }
  }

  private * renderOneSection (key: string): Generator<unknown, string, unknown> {
    const template = this.templateJson()
    const order = template ? (template.order ?? Object.keys(template.sections ?? {})).filter(id => template.sections?.[id] && !template.sections[id].disabled) : []
    const data = template?.sections?.[key]
    if (data && order.includes(key)) return (yield this.renderSection(data, { id: `template--${this.templateId}__${key}`, location: 'template', index: order.indexOf(key) + 1 })) as string
    return (yield this.renderStaticSection(key)) as string
  }

  /** A file's `{% schema %}` JSON, `{}` when it has none or its JSON is invalid (the invalid case is reported). https://shopify.dev/docs/storefronts/themes/architecture/sections/section-schema */
  private schema<T> (templates: Template[], file: string): T {
    const tag = templates.find((template): template is SchemaTag => template instanceof SchemaTag)
    if (!tag) return {} as T
    try {
      const json = tag.json
      return (json && typeof json === 'object' ? json : {}) as T
    } catch (err) {
      this.state.report.unsupported('schema', `${file}: ${(err as Error).message}`)
      return {} as T
    }
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

  /** `section.blocks`: the section's non-static blocks in `block_order`, each with settings over its definition's defaults. A `disabled` block is skipped (https://shopify.dev/docs/storefronts/themes/architecture/templates/json-templates lists `disabled` on sections; for blocks it is not pinned). https://shopify.dev/docs/api/liquid/objects/block */
  private sectionBlocks (data: SectionData, schema: SectionSchema): LiquidObject[] {
    const blocks: LiquidObject[] = []
    for (const id of data.block_order ?? Object.keys(data.blocks ?? {})) {
      const block = data.blocks?.[id]
      if (!block || block.disabled || block.static) continue
      blocks.push({ id, type: block.type, settings: new SettingsDrop(this.blockDefinitions(block.type, schema), block.settings, this.env), shopify_attributes: '' })
    }
    return blocks
  }

  /**
   * One section in Shopify's wrapper, `<div id="shopify-section-<id>" class="shopify-section [group class] [schema class]">`, with the `section` object (`id`, `settings` over the schema's defaults, `blocks`, `index`, `index0`, `location`) and the schema's `locales` in scope. https://shopify.dev/docs/storefronts/themes/architecture/sections/section-schema#tag and https://shopify.dev/docs/api/liquid/objects/section
   *
   * A section that does not parse, or whose render raised an error, keeps its wrapper and prints the error inside it, and the report records it as `failed`; a section file that does not exist renders nothing and is reported as `missing`. shopify.dev documents neither (the Section Rendering API page, https://shopify.dev/docs/api/ajax/section-rendering, says only that a section that fails comes back as `null`). A `renderLimit` or `memoryLimit` hit is Debutify's safety limit, not an error of the section, so it is not caught here and rejects the whole render.
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
    const schema = this.schema<SectionSchema>(templates, file)
    const section = {
      id: placement.id,
      settings: new SettingsDrop(schema.settings, data.settings, this.env),
      blocks: this.sectionBlocks(data, schema),
      index: placement.index,
      index0: placement.index === null ? null : placement.index - 1,
      location: placement.location
    }
    if (data.custom_css?.length) this.state.report.unsupported('custom_css', `${data.type}: custom CSS is not applied`)
    const frame: Frame = { kind: 'section', section: { id: placement.id, type: data.type, index: placement.index, locales: schema.locales }, container: data, sectionObject: section }
    this.state.frames.push(frame)
    const errorsBefore = this.errors.length
    let html: string
    try {
      html = (yield this.theme.liquid.renderer.renderTemplates(templates, this.child({ section }))) as string
      if (this.errors.length > errorsBefore) report('failed', errorMessage(this.errors[errorsBefore]))
      else report('rendered')
    } catch (err) {
      if (isLimitError(err)) throw err
      const message = this.fail(err)
      html = escapeHtml(message)
      report('failed', message)
    } finally {
      this.state.frames.pop()
    }
    return this.wrapSection(placement, schema, html)
  }

  private wrapSection (placement: Placement, schema: SectionSchema, html: string): string {
    const tag = typeof schema.tag === 'string' && TAG_NAME.test(schema.tag) ? schema.tag : 'div'
    const classes = ['shopify-section', placement.groupClass, schema.class].filter(Boolean).join(' ')
    return `<${tag} id="shopify-section-${escapeHtml(placement.id)}" class="${escapeHtml(classes)}">${html}</${tag}>`
  }

  /**
   * `{% section 'name' %}`: renders `sections/<name>.liquid` statically, with the id `<name>`, `section.index` nil and `section.location` `static`. https://shopify.dev/docs/api/liquid/objects/section ("Static sections use their filename without `.liquid`" as their ID; `index` is nil for a static section; `location` is `static`).
   *
   * Its settings come from `current.sections[name]` in `config/settings_data.json`, else the schema's defaults. shopify.dev does not say where a static section's saved settings live (https://shopify.dev/docs/storefronts/themes/architecture/config/settings-data-json describes only `current`, `presets` and `platform_customizations`), so `sections` under `current` is the shape exported themes use, and goes on the "confirm on a development store" list.
   */
  public * renderStaticSection (name: string): Generator<unknown, string, unknown> {
    const stored = (this.current.sections as Record<string, SectionData> | undefined)?.[name]
    return (yield this.renderSection({ ...stored, type: name }, { id: name, location: 'static', index: null })) as string
  }

  /**
   * `{% sections 'name' %}`: renders the section group `sections/<name>.json`, its sections in `order`, each as `sections--<name>__<key>` with the group's `type` as its `location` and a 1-based `index`. https://shopify.dev/docs/storefronts/themes/architecture/section-groups and https://shopify.dev/docs/api/liquid/tags/sections. A group file that does not exist renders nothing and is reported.
   *
   * A contextual file `<name>.context.<context>.json` whose `context` (`market`, `b2b`) matches the request's overrides the group; the first match in file order wins, and several matching is not pinned. https://shopify.dev/docs/storefronts/themes/architecture/section-groups#contextual-section-groups
   *
   * The `<!-- BEGIN sections: <name> -->` comments around the group are not pinned by shopify.dev (the page says only that sections render "with no markup between the sections").
   */
  public * renderSectionGroup (name: string): Generator<unknown, string, unknown> {
    let group = this.theme.json(`sections/${name}.json`) as GroupJson | undefined
    if (!group) {
      this.state.report.missing('section-group', name)
      return ''
    }
    for (const path of this.theme.paths(`sections/${name}.context.`)) {
      const variant = this.theme.json(path) as ContextFile
      if (matchesContext(variant.context, this.options.request?.context)) {
        group = deepMerge(group, { sections: variant.sections, order: variant.order })
        break
      }
    }
    let out = ''
    let index = 0
    for (const key of group.order ?? Object.keys(group.sections ?? {})) {
      const data = group.sections?.[key]
      if (!data || data.disabled) continue
      out += (yield this.renderSection(data, { id: `sections--${name}__${key}`, location: group.type ?? name, index: ++index, groupClass: `shopify-section-group-${name}` })) as string
    }
    return `<!-- BEGIN sections: ${name} -->${out}<!-- END sections: ${name} -->`
  }
}

/** Renders one page of an Online Store 2.0 theme with store data and returns the HTML and the render report. The theme is parsed once per `theme` object. Every call has its own Shopify state, report and error list, so concurrent renders of one theme do not see each other. */
export async function renderPage (options: RenderPageOptions): Promise<RenderPageResult> {
  return new PageRender(compileTheme(options.theme), options).page()
}

/** Renders one section of the page, as `renderPage` would place it (same id, `index` and `location`): a key of the JSON template's `sections`, else a static section's name. For re-rendering an edited section. https://shopify.dev/docs/api/ajax/section-rendering returns a section's HTML alone, as this does, but the section object's page says `index` is nil there, where this keeps the index the section has on the page so the section matches its place in a preview. */
export async function renderSection (options: RenderPageOptions & { section: string }): Promise<RenderPageResult> {
  return new PageRender(compileTheme(options.theme), options).section(options.section)
}
