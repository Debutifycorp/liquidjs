import type { FS } from '../fs/fs'
import type { LiquidCache } from '../cache'
import type { Template } from '../template'
import type { Liquid } from '../liquid'

const has = (files: Record<string, string>, path: string) => Object.prototype.hasOwnProperty.call(files, path)

/**
 * The theme's files, from memory only: `{% render 'price' %}` reads `snippets/price.liquid` from the map and nothing ever touches the disk. A missing file fails with Shopify's message, `Could not find asset snippets/price.liquid`.
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
    if (!has(this.files, filepath)) throw new Error(`Could not find asset ${filepath}`)
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
 * LiquidJS's parsed-partial cache, kept per theme and checked against the file's current source, so editing one snippet in the theme map re-parses that snippet only.
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
    return has(this.files, path) ? this.files[path] : undefined
  }
}
