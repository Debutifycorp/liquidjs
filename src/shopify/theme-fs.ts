import type { FS } from '../fs/fs'
import type { LiquidCache } from '../cache'
import type { Template } from '../template'
import type { Liquid } from '../liquid'
import { hasOwn } from './util/own'

/**
 * The theme's files, from memory only: `{% render 'price' %}` reads `snippets/price.liquid` from the map and nothing ever touches the disk (https://shopify.dev/docs/api/liquid/tags/render and https://shopify.dev/docs/api/liquid/tags/include look a snippet up by name; the directory layout is https://shopify.dev/docs/storefronts/themes/architecture).
 *
 * A missing file fails with `Could not find asset snippets/price.liquid`. shopify.dev does not document this text. The wording `Liquid error (line 1): Could not find asset <name>` is recorded from Shopify in liquid-spec `specs/shopify_production_recordings/recorded_specs.yml` (`test_rendering_include_tag_with_file_does_not_exist_does_not_repeat_dot_liquid_extension`); those recordings use their own file system, so the `snippets/` prefix and the `.liquid` suffix are not pinned and stay on the "confirm on a development store" list. A path such as `../package` is looked up literally and never normalised, as liquid-spec `specs/liquid_ruby/filesystem.yml` `fs_dotdot_does_not_match_normalized` records.
 */
export class ThemeFS implements FS {
  public sep = '/'

  public constructor (private readonly files: Record<string, string>) {}

  public async exists (filepath: string) {
    return this.existsSync(filepath)
  }

  /** Always true, so lookups resolve to the first candidate and `readFileSync` reports what is missing in Shopify's words. */
  public existsSync (filepath: string) {
    return true
  }

  public async readFile (filepath: string) {
    return this.readFileSync(filepath)
  }

  public readFileSync (filepath: string) {
    if (!hasOwn(this.files, filepath)) throw new Error(`Could not find asset ${filepath}`)
    return this.files[filepath]
  }

  public resolve (dir: string, file: string, ext: string) {
    const name = file.endsWith(ext) ? file : file + ext
    return dir === '.' || dir === '' ? name : `${dir}/${name}`
  }

  public dirname (filepath: string) {
    return filepath.split('/').slice(0, -1).join('/')
  }
}

/**
 * LiquidJS's parsed-partial cache, kept per theme and checked against the file's current source, so editing one snippet in the theme map re-parses that snippet only. This is Debutify's performance device and has no Shopify counterpart to cite.
 */
export class ThemeCache implements LiquidCache {
  private readonly entries = new Map<string, { source: string | undefined, value: Template[] | Promise<Template[]> }>()
  private liquid?: Liquid

  public constructor (private readonly files: Record<string, string>) {}

  public attach (liquid: Liquid) {
    this.liquid = liquid
  }

  public read (key: string) {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (entry.source !== this.source(key)) {
      this.entries.delete(key)
      return undefined
    }
    return entry.value
  }

  public write (key: string, value: Template[] | Promise<Template[]>) {
    this.entries.set(key, { source: this.source(key), value })
  }

  public remove (key: string) {
    this.entries.delete(key)
  }

  private source (key: string): string | undefined {
    if (!this.liquid) return undefined
    const sep = key.indexOf(':')
    const type = key.slice(0, sep) as 'partials' | 'layouts' | 'root'
    const { fs, extname } = this.liquid.options
    const path = fs.resolve(this.liquid.options[type][0] ?? '.', key.slice(sep + 1), extname)
    return hasOwn(this.files, path) ? this.files[path] : undefined
  }
}
