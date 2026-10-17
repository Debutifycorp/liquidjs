#!/usr/bin/env node
// Writes the font probes from shopify.dev's font page (https://shopify.dev/docs/storefronts/themes/architecture/settings/fonts): test/storefront/font-page.json, the page's two tables as read, and the JSON templates that make the parity store print every font. The parity tool records them (scenarios probe-fonts-library and probe-fonts-retired-1 to -4) and bin/shopify-font-library.mjs turns the recording into src/shopify-library/font-library.ts. Run this again only when shopify.dev's page changes.
//
//   node bin/shopify-font-probes.mjs
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SOURCE = 'https://shopify.dev/docs/storefronts/themes/architecture/settings/fonts.md'
const STOREFRONT = fileURLToPath(new URL('../test/storefront', import.meta.url))
const TEMPLATES = join(STOREFRONT, 'probes/templates')
// a block of the probe section holds eight fonts; a JSON template renders up to 25 sections of up to 50 blocks (https://shopify.dev/docs/storefronts/themes/architecture/templates/json-templates)
const PER_BLOCK = 8
const BLOCKS_PER_TEMPLATE = 50

const response = await fetch(SOURCE)
if (!response.ok) throw new Error(`${SOURCE}: ${response.status}`)
const page = await response.text()

/** The rows of the table under `## <heading>`: `| <family> | `<handles separated by spaces>` |`, and for the deprecated fonts a third cell, the replacement family. */
function table (heading, replacement) {
  const start = page.indexOf(`\n## ${heading}\n`)
  if (start === -1) throw new Error(`${SOURCE} has no "${heading}" section`)
  const rest = page.slice(start + 1)
  const end = rest.indexOf('\n## ', 1)
  const lines = rest.slice(0, end === -1 ? undefined : end).split('\n').filter(line => line.startsWith('|'))
  const [header, separator, ...rows] = lines
  if (!/^\| Font family \| Handles \|/.test(header) || !/^\| - \|/.test(separator)) throw new Error(`the "${heading}" table does not start with the Font family and Handles columns: ${header}`)
  if (!!replacement !== /\| Replacement \|\s*$/.test(header)) throw new Error(`the "${heading}" table has ${replacement ? 'no' : 'a'} Replacement column`)
  return rows.map(row => {
    const match = (replacement ? /^\| (.+?) \| `([^`]*)` \| (.+?) \|\s*$/ : /^\| (.+?) \| `([^`]*)` \|\s*$/).exec(row)
    if (!match) throw new Error(`a row of the "${heading}" table cannot be read: ${row}`)
    const handles = match[2].split(' ').filter(Boolean)
    if (!handles.length) throw new Error(`a row of the "${heading}" table lists no handle: ${row}`)
    return { family: match[1], handles, ...(replacement ? { replacement: match[3] } : {}) }
  })
}

const library = table('Available fonts', false)
const retired = table('Deprecated fonts', true)
for (const [name, rows] of [['library', library], ['retired', retired]]) {
  const handles = rows.flatMap(row => row.handles)
  if (new Set(handles).size !== handles.length) throw new Error(`the ${name} lists a handle twice`)
}
const listed = new Set(library.flatMap(row => row.handles))
const both = retired.flatMap(row => row.handles).filter(handle => listed.has(handle))
if (both.length) throw new Error(`the page lists ${both.join(', ')} as both available and deprecated`)

const read = new Date().toISOString().slice(0, 10)
writeFileSync(join(STOREFRONT, 'font-page.json'), `${JSON.stringify({ read, source: SOURCE, library, retired }, null, 2)}\n`)

/** The template: one `probe-fonts` section, a block of up to eight fonts per `[key, handles]`, each font a `font_picker` setting beside the text setting that names the handle (Liquid cannot read a font's handle back). */
function template (blocks, variants) {
  const entries = blocks.map((handles, index) => [`b${index + 1}`, {
    type: 'fonts',
    settings: Object.fromEntries(handles.flatMap((handle, i) => [[`handle_${i + 1}`, handle], [`font_${i + 1}`, handle]]))
  }])
  return `{
  "layout": false,
  "sections": {
    "fonts": {
      "type": "probe-fonts",
      "settings": ${JSON.stringify({ variants })},
      "blocks": {
${entries.map(([key, block]) => `        ${JSON.stringify(key)}: ${JSON.stringify(block)}`).join(',\n')}
      },
      "block_order": ${JSON.stringify(entries.map(([key]) => key))}
    }
  },
  "order": ["fonts"]
}
`
}

const chunks = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size))

for (const file of readdirSync(TEMPLATES)) if (/^page\.probe-fonts-[a-z0-9-]+\.json$/.test(file)) rmSync(join(TEMPLATES, file))
mkdirSync(TEMPLATES, { recursive: true })

// one handle per library family: the regular one when it has one, else its first
const samples = library.map(row => row.handles.find(handle => handle.endsWith('_n4')) ?? row.handles[0])
const libraryBlocks = chunks(samples, PER_BLOCK)
if (libraryBlocks.length > BLOCKS_PER_TEMPLATE) throw new Error(`${libraryBlocks.length} blocks for the library, more than a section holds`)
writeFileSync(join(TEMPLATES, 'page.probe-fonts-library.json'), template(libraryBlocks, true))

const retiredTemplates = chunks(chunks(retired.flatMap(row => row.handles), PER_BLOCK), BLOCKS_PER_TEMPLATE)
retiredTemplates.forEach((blocks, index) => writeFileSync(join(TEMPLATES, `page.probe-fonts-retired-${index + 1}.json`), template(blocks, false)))

console.log(`${SOURCE} read ${read}: ${library.length} library families and ${listed.size} handles, ${retired.length} retired families and ${retired.flatMap(row => row.handles).length} handles`)
console.log(`page.probe-fonts-library.json: ${libraryBlocks.length} blocks; ${retiredTemplates.map((blocks, index) => `page.probe-fonts-retired-${index + 1}.json: ${blocks.length} blocks`).join('; ')}`)
