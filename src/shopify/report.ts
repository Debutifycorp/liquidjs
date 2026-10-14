import { LiquidError } from '../util/error'
import { inlineErrorMessage } from '../util/inline-error'
import { own } from './util/own'

/** The text Shopify prints for an error: `Liquid syntax error (sections/x line 1): …` for a template that does not parse, `Liquid error (…): …` for a failure while rendering. shopify.dev does not document these texts; they follow liquid-spec `specs/basics/error-handling.yml` (`render_error_line_5_structured`) and the recordings in `specs/shopify_production_recordings/recorded_specs.yml` (`Liquid error (foo line 1): …` for an error inside a snippet), and stay on the "confirm on a development store" list. */
export function errorMessage (err: unknown): string {
  return LiquidError.is(err) ? inlineErrorMessage(err) : `Liquid error: ${(err as Error).message}`
}

/** What a `MissingEntry` names: a theme file the theme does not have (`template`, `layout`, `section`, `section_group`, `block`, `snippet`), a `translation` key, or a store `resource` the data does not hold. */
export type MissingKind = 'template' | 'layout' | 'section' | 'section_group' | 'block' | 'snippet' | 'translation' | 'resource'

/**
 * The `feature` of an `UnsupportedEntry`, in snake_case:
 * - the theme runtime: `app_block` (rendered by its app, so skipped), `content_for`, `section` and `sections` (the tags used outside `renderPage`), `custom_css` (not applied), `disabled_section` (asked of `renderSection`), `locale_file` (not valid JSON), `blocks`, `order`, `schema`, `sections` and `section_group` (JSON of the wrong shape), `static_block`, `unsafe_key` (a key or type that is not a plain id, skipped) and `wrapper` (not applied);
 * - settings: `invalid_setting`, `unsafe_url`, `color_scheme` and `font_picker` (a value that was rejected or not found);
 * - filter input: `date_format` (an unknown named format) and `money_input` (a value `money` cannot read);
 * - requests: `recommendations` (a recommendations request whose intent is not `related` or `complementary`);
 * - a filter's own name, for an input or argument it could not use: the colour filters, the font filters (`font_face`, `font_modify`, `font_url`), the tag filters whose attribute names were dropped (`image_tag`, `video_tag`, `external_video_tag`, `script_tag`, `stylesheet_tag`) and `media_tag`.
 */
export type UnsupportedFeature =
  | 'app_block' | 'blocks' | 'content_for' | 'custom_css' | 'disabled_section' | 'locale_file' | 'order' | 'schema' | 'section' | 'section_group' | 'sections' | 'static_block' | 'unsafe_key' | 'wrapper'
  | 'color_scheme' | 'font_picker' | 'invalid_setting' | 'unsafe_url'
  | 'date_format' | 'money_input'
  | 'recommendations'
  | 'brightness_difference' | 'color_brightness' | 'color_contrast' | 'color_darken' | 'color_desaturate' | 'color_difference' | 'color_extract' | 'color_lighten' | 'color_mix' | 'color_modify' | 'color_saturate' | 'color_to_hex' | 'color_to_hsl' | 'color_to_oklch' | 'color_to_rgb' | 'hex_to_rgba'
  | 'font_face' | 'font_modify' | 'font_url'
  | 'external_video_tag' | 'image_tag' | 'media_tag' | 'script_tag' | 'stylesheet_tag' | 'video_tag'

export interface CountEntry {
  name: string
  count: number
  /** Files the name was used in, as far as the engine knows them. */
  files: string[]
}

export interface ErrorEntry {
  /** The text written into the page: `Liquid error (sections/header line 12): …`. */
  message: string
  file?: string
  line?: number
}

export interface MissingEntry {
  kind: MissingKind
  name: string
}

export interface UnsupportedEntry {
  feature: UnsupportedFeature
  /** What was not rendered and why, as plain text: never a rejected setting value, and with `<` and `>` removed. */
  detail: string
}

export interface SectionEntry {
  id: string
  type: string
  location: string
  /** `missing`: the section's file does not exist. `failed`: the file does not parse, its schema or saved JSON has a field of the wrong type, or an error was printed in it, by its render or by a block whose file, schema or saved JSON is broken (`reason` says which). An error the engine records without printing (an undefined variable, a failed `assign`) leaves the section `rendered` and is listed in `errors` only. */
  status: 'rendered' | 'missing' | 'failed'
  ms: number
  reason?: string
}

/** What a render could not do as Shopify would. Unknown and stubbed names render empty (or, for unknown filters, pass their input through as Shopify does) and are listed here. Debutify's own report: shopify.dev has no counterpart. Every string in it is plain text: escape it before showing it as HTML. */
export interface RenderReport {
  unknownTags: CountEntry[]
  unknownFilters: CountEntry[]
  stubbedFilters: CountEntry[]
  missing: MissingEntry[]
  unsupported: UnsupportedEntry[]
  errors: ErrorEntry[]
  sections: SectionEntry[]
  timing: { totalMs: number }
}

/** Names and details as the report keeps them: `<` and `>` removed, so text that came from a theme or its data cannot turn into markup where a report is shown without escaping. Callers should still escape report strings. */
const plain = (text: string): string => text.replace(/[<>]/g, '')

function bump (map: Map<string, CountEntry>, rawName: string, rawFile?: string) {
  const name = plain(rawName)
  const file = rawFile === undefined ? undefined : plain(rawFile)
  let entry = map.get(name)
  if (!entry) {
    entry = { name, count: 0, files: [] }
    map.set(name, entry)
  }
  entry.count++
  if (file && !entry.files.includes(file)) entry.files.push(file)
}

const MISSING_ASSET = /Could not find asset (\S+)/

const ASSET_KINDS: Record<string, MissingKind> = { snippets: 'snippet', layout: 'layout', sections: 'section', blocks: 'block', templates: 'template' }

/** The kind of a missing theme file, from the directory its path starts with. */
function assetKind (path: string): MissingKind {
  const dir = path.split('/')[0]
  return own(ASSET_KINDS, dir) ?? 'resource'
}

export class ReportCollector {
  private readonly tags = new Map<string, CountEntry>()
  private readonly filters = new Map<string, CountEntry>()
  private readonly stubs = new Map<string, CountEntry>()
  private readonly missingEntries = new Map<string, MissingEntry>()
  private readonly unsupportedEntries: UnsupportedEntry[] = []
  public readonly sections: SectionEntry[] = []

  public unknownTag (name: string, file?: string) {
    bump(this.tags, name, file)
  }

  public unknownFilter (name: string, file?: string) {
    bump(this.filters, name, file)
  }

  public stubbedFilter (name: string, file?: string) {
    bump(this.stubs, name, file)
  }

  public missing (kind: MissingKind, rawName: string) {
    const name = plain(rawName)
    this.missingEntries.set(`${kind}:${name}`, { kind, name })
  }

  public unsupported (feature: UnsupportedFeature, rawDetail: string) {
    const detail = plain(rawDetail)
    if (!this.unsupportedEntries.some(entry => entry.feature === feature && entry.detail === detail)) this.unsupportedEntries.push({ feature, detail })
  }

  public section (entry: SectionEntry) {
    this.sections.push(entry)
  }

  public toReport (errors: LiquidError[], totalMs: number): RenderReport {
    const errorEntries = errors.map(err => {
      const asset = MISSING_ASSET.exec(String(err.originalError?.message ?? err.message))
      if (asset) this.missing(assetKind(asset[1]), asset[1])
      return { message: errorMessage(err), file: err.token?.file, line: err.token ? err.token.getPosition()[0] : undefined }
    })
    return {
      unknownTags: [...this.tags.values()],
      unknownFilters: [...this.filters.values()],
      stubbedFilters: [...this.stubs.values()],
      missing: [...this.missingEntries.values()],
      unsupported: [...this.unsupportedEntries],
      errors: errorEntries,
      sections: [...this.sections],
      timing: { totalMs }
    }
  }
}
