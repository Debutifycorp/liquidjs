import { createHash } from 'crypto'
import type { Template } from '../../template'
import { toValueSync } from '../../util/async'
import { JavascriptTag, StylesheetTag } from '../tags/raw'

/** One compiled file: its text and the version its address carries (`?v=`), which changes whenever the text does. */
export interface CompiledFile {
  body: string
  version: string
}

/** The theme's compiled `{% stylesheet %}` and `{% javascript %}` files, each `null` when the theme has no body for it. See `compileAssets`. */
export interface CompiledAssets {
  /** `styles.css`: the stylesheet bodies of every section, block and snippet. */
  styles: CompiledFile | null
  /** `scripts.js`: the javascript bodies of every section. */
  scripts: CompiledFile | null
}

/** A file whose `{% stylesheet %}` goes into `styles.css`: a `.liquid` file of `sections/`, `blocks/` or `snippets/`. Its folder and name. */
export const BUNDLED_FILE = /^(sections|blocks|snippets)\/([^/]+)\.liquid$/

/** A section file, whose `{% javascript %}` goes into `scripts.js`; its name. */
export const SECTION_FILE = /^sections\/([^/]+)\.liquid$/

/** The folders in the order Shopify's `styles.css` lists them, with the words of its headings and markers. */
const FOLDERS = [
  { folder: 'sections', kind: 'section', marker: 'SECTION' },
  { folder: 'blocks', kind: 'block', marker: 'BLOCK' },
  { folder: 'snippets', kind: 'snippet', marker: 'SNIPPET' }
] as const

/** The `{% stylesheet %}` and `{% javascript %}` bodies of one file. */
export interface FileBodies {
  stylesheet?: string
  javascript?: string
}

/** A file of the theme for `compileAssets`: its path and its bodies. */
export interface AssetSource {
  path: string
  bodies: FileBodies
}

/** The first `{% stylesheet %}` and `{% javascript %}` body of a parsed file, in document order, looking inside blocks (`if`, `for`, `case` and the rest) but not into the partials a file renders. A file can hold one of each (shopify.dev: "Each file can only have one"), and the tag records the first one it renders. */
export function bodiesOf (templates: Template[]): FileBodies {
  const found: FileBodies = {}
  const walk = (list: Template[]) => {
    for (const template of list) {
      if (template instanceof StylesheetTag) found.stylesheet ??= template.source
      else if (template instanceof JavascriptTag) found.javascript ??= template.source
      else if (template.children) walk(toValueSync(template.children(false, true)))
    }
  }
  walk(templates)
  return found
}

/** A name safe inside a CSS comment: a star followed by a slash, which would end the comment, gets a space between them. Shopify's file names never hold one; a theme map here could. */
const commentSafe = (name: string) => name.replace(/\*\//g, '* /')

const version = (body: string) => createHash('sha256').update(body).digest('hex').slice(0, 20)

/**
 * The theme's `styles.css` and `scripts.js`, as Shopify compiles them. https://shopify.dev/docs/storefronts/themes/best-practices/javascript-and-stylesheet-tags says Shopify "collects the content from `{% stylesheet %}` tags across sections, blocks, and snippets" into "a single `styles.css` file" that `content_for_header` links, and "concatenates the content from `{% javascript %}` tags across all section, block and snippet files" into `scripts.js` (sections), `block-scripts.js` and `snippet-scripts.js`, each body "wrapped in a self-executing anonymous function", loaded with `defer`; Liquid is not rendered inside either tag.
 *
 * The form is the parity store's, read from the source maps of its files (`compiled_assets/styles.css.map` and `scripts.js.map` of Horizon 4.3.0): `styles.css` opens with `/* SHOPIFY_STYLESHEETS_VERSION: 1.0 *\/`, then the sections, the blocks and the snippets, each group under `/* CSS from section stylesheet tags *\/` (`block`, `snippet`) and in file name order, each body trimmed between `/* START_SECTION:<name> (INDEX:<n>) *\/` and `/* END_SECTION:<name> *\/`, where `<n>` counts the `.liquid` files of the three folders, the sections first, each folder in name order, whether they have a stylesheet or not. The file holds every stylesheet of the theme, on every page: the parity store links one address on all 19 recorded pages of Horizon, and the file of its home page holds the `password` section's styles. The doc's "Shopify subsets this CSS so that each page only loads the styles from files in its render tree" is not what the recordings show (no page names a subset), so the file is not subset here. `scripts.js` runs a section's body only when the page's `<script id="sections-script">` names the section in `data-sections`, as the parity store's file does.
 *
 * Debutify's, not pinned: the file is served as written here, where Shopify serves it minified (with the source map's text as its source); a body that is only white space is left out; the version is a hash of the file's text (Shopify's is a number of its own that the recordings cannot derive); a file that does not parse adds nothing (see `CompiledTheme.compiledAssets`). The `{% javascript %}` of blocks and snippets is not compiled: Shopify's `block-scripts.js` and `snippet-scripts.js` are in no recording, so how a page loads them is not known, and the page inlines those bodies (see `contentForHeader`).
 */
export function compileAssets (sources: AssetSource[]): CompiledAssets {
  const groups = new Map<string, Array<{ name: string, index: number, body: string }>>()
  const sections: Array<{ name: string, body: string }> = []
  sources.forEach(({ path, bodies }, index) => {
    const match = BUNDLED_FILE.exec(path)
    if (!match) return
    const css = bodies.stylesheet?.trim()
    if (css) {
      const group = groups.get(match[1]) ?? []
      group.push({ name: match[2], index, body: css })
      groups.set(match[1], group)
    }
    if (match[1] === 'sections' && bodies.javascript !== undefined && bodies.javascript.trim() !== '') sections.push({ name: match[2], body: bodies.javascript })
  })
  const parts = FOLDERS.filter(({ folder }) => groups.has(folder)).map(({ folder, kind, marker }) =>
    `/* CSS from ${kind} stylesheet tags */\n` + groups.get(folder)!.map(({ name, index, body }) => `/* START_${marker}:${commentSafe(name)} (INDEX:${index}) */\n${body}\n/* END_${marker}:${commentSafe(name)} */`).join('\n\n'))
  const styles = parts.length ? `/* SHOPIFY_STYLESHEETS_VERSION: 1.0 */\n\n\n${parts.join('\n\n')}` : ''
  const scripts = sections.length
    ? "(function() {\n  var __sections__ = {};\n  (function() {\n    for(var i = 0, s = document.getElementById('sections-script').getAttribute('data-sections').split(','); i < s.length; i++)\n      __sections__[s[i]] = true;\n    })();\n    " +
      sections.map(({ name, body }) => `(function() {\n  if (!__sections__[${JSON.stringify(name)}]) return;\n  try {\n    ${body}\n  } catch(e) { console.error(e); }\n})();\n`).join('') +
      '})();\n'
    : ''
  return {
    styles: styles ? { body: styles, version: version(styles) } : null,
    scripts: scripts ? { body: scripts, version: version(scripts) } : null
  }
}
