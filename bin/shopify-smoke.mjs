#!/usr/bin/env node
// Parses every .liquid file of a local Shopify theme, renders every template with the package's public sample data, and prints parse errors, what the render reports found, and timings. For checking private themes on a developer's machine: the theme is read from the given directory and nothing is written anywhere.
// Usage: pnpm run build && node bin/shopify-smoke.mjs <theme directory> [--json]
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'

const require = createRequire(import.meta.url)
const { compileTheme, renderPage, renderSection } = require('../dist/shopify.node.js')

const repo = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))))
const args = process.argv.slice(2)
const flags = args.filter(arg => arg.startsWith('--'))
const dirArg = args.find(arg => !arg.startsWith('--'))
if (!dirArg) {
  console.error('usage: node bin/shopify-smoke.mjs <theme directory> [--json]')
  process.exit(2)
}
let dir
try {
  dir = realpathSync(resolve(dirArg))
} catch (err) {
  console.error(`cannot read ${resolve(dirArg)}: ${err.message}`)
  process.exit(2)
}
if (dir === repo || dir.startsWith(repo + sep)) {
  console.error(`refusing to read a theme inside this repository (${dir}): keep private themes out of the fork`)
  process.exit(2)
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
const rows = []
const cold = []
for (const templateName of templates) {
  const started = performance.now()
  try {
    const { html, report } = await renderPage({ theme, templateName })
    const ms = performance.now() - started
    cold.push(ms)
    for (const entry of report.unknownTags) add(totals.unknownTags, entry.name, entry.count)
    for (const entry of report.unknownFilters) add(totals.unknownFilters, entry.name, entry.count)
    for (const entry of report.stubbedFilters) add(totals.stubbedFilters, entry.name, entry.count)
    for (const entry of report.missing) add(totals.missing, `${entry.kind} ${entry.name}`)
    for (const entry of report.unsupported) add(totals.unsupported, `${entry.feature}: ${entry.detail}`)
    for (const entry of report.errors) add(totals.errors, entry.message)
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
for (const templateName of templates) {
  const json = theme.files[`templates/${templateName}.json`]
  if (!json) continue
  for (const key of Object.keys(JSON.parse(json.replace(/^\s*\/\*[\s\S]*?\*\//, '')).sections ?? {})) {
    const started = performance.now()
    await renderSection({ theme, templateName, section: key })
    sectionTimes.push(performance.now() - started)
  }
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
  timing: {
    pageFirstP50: Math.round(percentile(cold, 50)),
    pageWarmP50: Math.round(percentile(warm, 50)),
    pageWarmP95: Math.round(percentile(warm, 95)),
    sectionP50: Math.round(percentile(sectionTimes, 50)),
    sectionP95: Math.round(percentile(sectionTimes, 95))
  }
}
if (flags.includes('--json')) {
  console.log(JSON.stringify(summary, null, 2))
} else {
  console.log(`parsed: ${summary.parsed.files} .liquid files in ${summary.parsed.ms} ms, errors:`, JSON.stringify(parseErrors))
  for (const row of rows) console.log(row.threw ? `${row.template}: THREW ${row.threw}` : `${row.template}: ${row.sections} sections, ${row.bytes} bytes, ${row.ms} ms${row.notRendered.length ? ` (${row.notRendered.join(', ')})` : ''}`)
  for (const key of ['unknownTags', 'unknownFilters', 'stubbedFilters', 'errors']) console.log(`${key}:`, JSON.stringify(summary[key]))
  console.log('missing:', JSON.stringify(summary.missing))
  console.log('unsupported:', JSON.stringify(summary.unsupported))
  console.log('timing (ms):', JSON.stringify(summary.timing))
}
