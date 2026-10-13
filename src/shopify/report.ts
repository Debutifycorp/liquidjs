import { LiquidError } from '../util/error'
import { inlineErrorMessage } from '../util/inline-error'

/** The text Shopify prints for an error: `Liquid syntax error (sections/x line 1): …` for a template that does not parse, `Liquid error (…): …` for a failure while rendering. */
export function errorMessage (err: unknown): string {
  return LiquidError.is(err) ? inlineErrorMessage(err) : `Liquid error: ${(err as Error).message}`
}

export type MissingKind = 'template' | 'layout' | 'section' | 'section-group' | 'block' | 'snippet' | 'translation' | 'resource'

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
  feature: string
  detail: string
}

export interface SectionEntry {
  id: string
  type: string
  location: string
  status: 'rendered' | 'missing' | 'failed'
  ms: number
  reason?: string
}

/** What a render could not do as Shopify would. Unknown and stubbed names render empty (or, for unknown filters, pass their input through as Shopify does) and are listed here. */
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

function bump (map: Map<string, CountEntry>, name: string, file?: string) {
  let entry = map.get(name)
  if (!entry) {
    entry = { name, count: 0, files: [] }
    map.set(name, entry)
  }
  entry.count++
  if (file && !entry.files.includes(file)) entry.files.push(file)
}

const MISSING_ASSET = /Could not find asset (\S+)/

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

  public missing (kind: MissingKind, name: string) {
    this.missingEntries.set(`${kind}:${name}`, { kind, name })
  }

  public unsupported (feature: string, detail: string) {
    if (!this.unsupportedEntries.some(entry => entry.feature === feature && entry.detail === detail)) this.unsupportedEntries.push({ feature, detail })
  }

  public section (entry: SectionEntry) {
    this.sections.push(entry)
  }

  public toReport (errors: LiquidError[], totalMs: number): RenderReport {
    const errorEntries = errors.map(err => {
      const asset = MISSING_ASSET.exec(String(err.originalError?.message ?? err.message))
      if (asset) this.missing('snippet', asset[1])
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
