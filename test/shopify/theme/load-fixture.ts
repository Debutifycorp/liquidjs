import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

/** Reads a fixture theme directory into the `{ files }` map `renderPage` takes. Tests may read the disk; the package never does. */
export function loadTheme (dir: string): { files: Record<string, string> } {
  const files: Record<string, string> = {}
  const walk = (path: string) => {
    for (const name of readdirSync(path)) {
      const full = join(path, name)
      if (statSync(full).isDirectory()) walk(full)
      else files[relative(dir, full).split('\\').join('/')] = readFileSync(full, 'utf8')
    }
  }
  walk(dir)
  return { files }
}
