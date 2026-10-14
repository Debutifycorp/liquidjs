#!/usr/bin/env node
// Parses every .liquid file of a local Shopify theme, renders every template with the package's public sample data, and prints parse errors, what the render reports found, and timings. For checking private themes on a developer's machine: the theme is read from the given directory and nothing is written anywhere.
// WARNING: the output names private theme files (with line numbers), section types, template names, unknown tag and filter names and resource handles, and with --json the theme's path. It must not be committed, pasted into issues or pull requests, put in CI logs or placed in the public fork: only aggregate numbers (counts and timings) may leave the machine.
// Usage: pnpm run build && node bin/shopify-smoke.mjs <theme directory> [--json] [--presets] [--strict] [--allow=<file>]
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'

const require = createRequire(import.meta.url)
const { compileTheme, renderPage, renderSection } = require('../dist/shopify.node.js')

// realpathSync.native, not realpathSync: on a case-insensitive volume the plain one keeps the case it is given, so a case alias of a path inside the repository would slip past the refusal below.
const repo = realpathSync.native(resolve(fileURLToPath(new URL('..', import.meta.url))))
const args = process.argv.slice(2)
const flags = args.filter(arg => arg.startsWith('--'))
const dirArg = args.find(arg => !arg.startsWith('--'))
if (!dirArg) {
  console.error('usage: node bin/shopify-smoke.mjs <theme directory> [--json] [--presets] [--strict] [--allow=<file>]')
  console.error('warning: the output names private theme files, section types, template names, resource handles and (with --json) the theme path. Never commit it, paste it into an issue or pull request, or put it in the public fork; only aggregate numbers (counts and timings) may leave this machine.')
  process.exit(2)
}
let dir
try {
  dir = realpathSync.native(resolve(dirArg))
} catch (err) {
  console.error(`cannot read ${resolve(dirArg)}: ${err.message}`)
  process.exit(2)
}
if (dir === repo || dir.startsWith(repo + sep)) {
  console.error(`refusing to read a theme inside this repository (${dir}): keep private themes out of the fork`)
  process.exit(2)
}

const allowFlag = flags.find(flag => flag.startsWith('--allow='))
let allowed = new Set()
if (allowFlag && !flags.includes('--strict')) {
  console.error('--allow needs --strict')
  process.exit(2)
}
if (allowFlag) {
  const allowPath = allowFlag.slice('--allow='.length)
  try {
    const allowJson = JSON.parse(readFileSync(allowPath, 'utf8'))
    if (allowJson === null || typeof allowJson !== 'object') throw new Error('expected a JSON array of problem keys or a JSON object whose keys are problem keys')
    allowed = new Set(Array.isArray(allowJson) ? allowJson : Object.keys(allowJson))
  } catch (err) {
    console.error(`cannot read allow file ${allowPath}: ${err.message}`)
    process.exit(2)
  }
}

function loadTheme (root) {
  const files = {}
  const walk = (path) => {
    for (const name of readdirSync(path)) {
      if (name === '.git' || name === 'node_modules') continue
      const full = join(path, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.(liquid|json)$/.test(name)) files[relative(root, full).split(sep).join('/')] = readFileSync(full, 'utf8')
    }
  }
  walk(root)
  return { files }
}

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(p / 100 * sorted.length) - 1)] : 0
}
const add = (map, key, count = 1) => map.set(key, (map.get(key) ?? 0) + count)

const theme = loadTheme(dir)
const liquidFiles = Object.keys(theme.files).filter(path => path.endsWith('.liquid')).sort()
const parseErrors = {}
const parseStarted = performance.now()
const compiled = compileTheme(theme)
for (const path of liquidFiles) {
  try {
    compiled.templates(path)
  } catch (err) {
    parseErrors[path] = err.message
  }
}
const parseMs = performance.now() - parseStarted
const templates = Object.keys(theme.files).filter(path => /^templates\/.+\.(json|liquid)$/.test(path)).map(path => path.slice('templates/'.length).replace(/\.(json|liquid)$/, '')).sort()
const totals = { unknownTags: new Map(), unknownFilters: new Map(), stubbedFilters: new Map(), missing: new Map(), unsupported: new Map(), errors: new Map() }
const collect = (report) => {
  for (const entry of report.unknownTags) add(totals.unknownTags, entry.name, entry.count)
  for (const entry of report.unknownFilters) add(totals.unknownFilters, entry.name, entry.count)
  for (const entry of report.stubbedFilters) add(totals.stubbedFilters, entry.name, entry.count)
  for (const entry of report.missing) add(totals.missing, `${entry.kind} ${entry.name}`)
  for (const entry of report.unsupported) add(totals.unsupported, `${entry.feature}: ${entry.detail}`)
  for (const entry of report.errors) add(totals.errors, entry.message)
}
const rows = []
const cold = []
for (const templateName of templates) {
  const started = performance.now()
  try {
    const { html, report } = await renderPage({ theme, templateName })
    const ms = performance.now() - started
    cold.push(ms)
    collect(report)
    const notRendered = report.sections.filter(section => section.status !== 'rendered').map(section => `${section.type} ${section.status}`)
    rows.push({ template: templateName, bytes: html.length, ms: Math.round(ms), sections: report.sections.length, notRendered })
  } catch (err) {
    rows.push({ template: templateName, threw: err.message })
  }
}
const warm = []
for (const templateName of templates) {
  const started = performance.now()
  try {
    await renderPage({ theme, templateName })
  } catch {}
  warm.push(performance.now() - started)
}
const sectionTimes = []
const sectionFailures = {}
const failSection = (path, err) => {
  const entry = sectionFailures[path] ??= { failed: 0, message: err.message }
  entry.failed++
}
for (const templateName of templates) {
  const path = `templates/${templateName}.json`
  const json = theme.files[path]
  if (!json) continue
  let keys
  try {
    keys = Object.keys(JSON.parse(json.replace(/^\s*\/\*[\s\S]*?\*\//, '')).sections ?? {})
  } catch (err) {
    failSection(path, err)
    continue
  }
  for (const key of keys) {
    const started = performance.now()
    try {
      await renderSection({ theme, templateName, section: key })
    } catch (err) {
      failSection(path, err)
      continue
    }
    sectionTimes.push(performance.now() - started)
  }
}
const SCHEMA = /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/
// A preset lists its blocks as an array, or as an object keyed by block id with a sibling block_order array (at the preset and inside a block): the given order wins over the key order. An array entry gets its own string id, or one built from its path (`b0`, `b0_1`, `b0_1_2`) so no two blocks of one section share an id; an object key is the block's id as written. A static block is addressed by its id and stays out of block_order, so an array entry is static only when it carries a string id of its own, as the engine reads a schema default (`presetData`).
const toBlocks = (list, order, prefix = 'b') => {
  const array = Array.isArray(list)
  const entries = array ? list.map((block, index) => [typeof block.id === 'string' && block.id !== '' ? block.id : `${prefix}${index}`, block]) : Object.entries(list ?? {})
  const blocks = {}
  const dynamic = []
  for (const [id, block] of entries) {
    const isStatic = block.static === true && (!array || id === block.id)
    blocks[id] = { type: block.type, settings: block.settings ?? {}, ...(isStatic ? { static: true } : {}) }
    if (!isStatic) dynamic.push(id)
    if (block.blocks) Object.assign(blocks[id], toBlocks(block.blocks, block.block_order, `${id}_`))
  }
  return { blocks, block_order: !array && Array.isArray(order) ? order : dynamic }
}
const presets = { rendered: 0, failed: {} }
const presetTimes = []
if (flags.includes('--presets')) {
  const templatePath = 'templates/page.smoke-preset.json'
  for (const path of liquidFiles.filter(file => /^sections\/[^/]+\.liquid$/.test(file))) {
    const type = path.slice('sections/'.length, -'.liquid'.length)
    let list
    try {
      const match = SCHEMA.exec(theme.files[path])
      list = match ? JSON.parse(match[1]).presets ?? [] : []
      if (!Array.isArray(list)) throw new Error('"presets" must be an array')
    } catch (err) {
      presets.failed[`${path}#schema`] = err.message
      continue
    }
    for (const [index, preset] of list.entries()) {
      const started = performance.now()
      try {
        theme.files[templatePath] = JSON.stringify({ sections: { main: { type, settings: preset.settings ?? {}, ...toBlocks(preset.blocks, preset.block_order) } }, order: ['main'] })
        const { report } = await renderSection({ theme, templateName: 'page.smoke-preset', section: 'main', request: { resource: 'about' } })
        presetTimes.push(performance.now() - started)
        collect(report)
        const notRendered = report.sections.filter(section => section.status !== 'rendered')
        if (notRendered.length) presets.failed[`${path}#${index}`] = notRendered.map(section => section.status).join(', ')
        else presets.rendered++
      } catch (err) {
        presets.failed[`${path}#${index}`] = err.message
      }
    }
  }
  delete theme.files[templatePath]
}
const summary = {
  theme: dir,
  parsed: { files: liquidFiles.length, ms: Math.round(parseMs), errors: parseErrors },
  templates: rows,
  unknownTags: Object.fromEntries(totals.unknownTags),
  unknownFilters: Object.fromEntries(totals.unknownFilters),
  stubbedFilters: Object.fromEntries(totals.stubbedFilters),
  missing: [...totals.missing.keys()],
  unsupported: [...totals.unsupported.keys()],
  errors: Object.fromEntries(totals.errors),
  sectionFailures,
  presets,
  timing: {
    pageFirstP50: Math.round(percentile(cold, 50)),
    pageWarmP50: Math.round(percentile(warm, 50)),
    pageWarmP95: Math.round(percentile(warm, 95)),
    sectionP50: Math.round(percentile(sectionTimes, 50)),
    sectionP95: Math.round(percentile(sectionTimes, 95)),
    presetP95: Math.round(percentile(presetTimes, 95))
  }
}
if (flags.includes('--json')) {
  console.log(JSON.stringify(summary, null, 2))
} else {
  console.log(`parsed: ${summary.parsed.files} .liquid files in ${summary.parsed.ms} ms, errors:`, JSON.stringify(parseErrors))
  for (const row of rows) console.log(row.threw ? `${row.template}: THREW ${row.threw}` : `${row.template}: ${row.sections} sections, ${row.bytes} bytes, ${row.ms} ms${row.notRendered.length ? ` (${row.notRendered.join(', ')})` : ''}`)
  for (const key of ['unknownTags', 'unknownFilters', 'stubbedFilters', 'errors', 'sectionFailures', 'presets']) console.log(`${key}:`, JSON.stringify(summary[key]))
  console.log('missing:', JSON.stringify(summary.missing))
  console.log('unsupported:', JSON.stringify(summary.unsupported))
  console.log('timing (ms):', JSON.stringify(summary.timing))
}

if (flags.includes('--strict')) {
  const matched = new Set()
  const problems = [
    ...Object.keys(parseErrors).map(path => `parse: ${path}`),
    ...rows.filter(row => row.threw).map(row => `threw: ${row.template}`),
    ...rows.flatMap(row => (row.notRendered ?? []).map(entry => `notRendered: ${row.template} ${entry}`)),
    ...Object.keys(summary.unknownTags).map(name => `unknownTags: ${name}`),
    ...Object.keys(summary.unknownFilters).map(name => `unknownFilters: ${name}`),
    ...Object.keys(summary.stubbedFilters).map(name => `stubbedFilters: ${name}`),
    ...summary.missing.map(entry => `missing: ${entry}`),
    ...summary.unsupported.map(entry => `unsupported: ${entry}`),
    ...Object.keys(summary.errors).map(message => `errors: ${message}`),
    ...Object.keys(sectionFailures).map(path => `sectionFailures: ${path}`),
    ...Object.keys(presets.failed).map(key => `presetFailures: ${key}`)
  ].filter(problem => {
    if (!allowed.has(problem)) return true
    matched.add(problem)
    return false
  })
  if (problems.length) {
    console.error(`strict: ${problems.length} problem(s) not in the allow list`)
    for (const problem of problems) console.error(`  ${problem}`)
    process.exitCode = 1
  }
  const stale = [...allowed].filter(entry => !matched.has(entry))
  if (stale.length) {
    console.error(`allow: ${stale.length} ${stale.length === 1 ? 'entry' : 'entries'} matched nothing:`)
    for (const entry of stale) console.error(`  ${entry}`)
  }
}
