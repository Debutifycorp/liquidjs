// Quick check of the liquid-spec JSON-RPC server without Ruby: starts `server.mjs`, sends the requests liquid-spec would send, and compares the answers. Run after `pnpm run build`: node spec/liquid-spec/server-check.mjs
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const server = spawn(process.execPath, [fileURLToPath(new URL('./server.mjs', import.meta.url))], { stdio: ['pipe', 'pipe', 'inherit'] })
const pending = new Map()
createInterface({ input: server.stdout }).on('line', (line) => {
  const message = JSON.parse(line)
  pending.get(message.id)?.(message)
  pending.delete(message.id)
})
let nextId = 1
const call = (method, params) => new Promise((resolve) => {
  const id = nextId++
  pending.set(id, resolve)
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
})

async function render (template, { environment = {}, filesystem = {}, registers, strict = false } = {}) {
  const compiled = await call('compile', { template, options: { error_mode: 'strict2' }, filesystem })
  if (!compiled.result?.template_id) return `compile error: ${compiled.result?.error?.message ?? compiled.error?.message}`
  const rendered = await call('render', { template_id: compiled.result.template_id, environment, options: { strict_errors: strict, registers } })
  // liquid-spec raises a render error only from a JSON-RPC error with code -32001; a `result.error` it would read as an empty page
  if (rendered.error) return `render error ${rendered.error.code}: ${rendered.error.message}`
  return rendered.result?.output
}

const checks = [
  ['initialize reports the Shopify features', async () => (await call('initialize', { version: '1.0' })).result.features.join(','), 'shopify_tags,shopify_objects,shopify_filters'],
  ['Ruby numbers, the spec clock and flat partials', () => render('{{ 10 | divided_by: 4 }} {{ 2.0 }} {{ "now" | date: "%Y-%m-%d %H:%M" }} {% render "child", x: 1 %}', { filesystem: { 'child.liquid': '[{{ x }}]' }, registers: { current_time: '2024-01-01T00:01:58Z' } }), '2 2.0 2024-01-01 00:01 [1]'],
  ['a partial found without its extension', () => render('{% render "child" %}', { filesystem: { child: 'ok' } }), 'ok'],
  ['a partial sees the spec environment (static environments) but not the assigns around it', () => render("{% assign x = 'a' %}{% render 'c' %}", { environment: { shop_name: 'S' }, filesystem: { 'c.liquid': '[{{ shop_name }}{{ x }}]' } }), '[S]'],
  ['a missing partial is named as the template wrote it', () => render("{% render 'Nope' %}"), 'Liquid error (line 1): Could not find asset Nope'],
  ['an undefined size prints nothing', () => render('[{{ size }}]', { environment: { a: 1, b: 2 } }), '[]'],
  ['the Shopify preset is on: asset_url, schema and section settings fall back to schema defaults', () => render("{{ 'base.css' | asset_url }} {{ section.settings.heading }}{% schema %}{\"settings\":[{\"type\":\"text\",\"id\":\"heading\",\"default\":\"Hi\"}]}{% endschema %}", { environment: { section: { settings: {} } } }), '/assets/base.css Hi'],
  ['a saved section setting wins over the schema default', () => render('{{ section.settings.heading }}{% schema %}{"settings":[{"type":"text","id":"heading","default":"Hi"}]}{% endschema %}', { environment: { section: { settings: { heading: 'Saved' } } } }), 'Saved'],
  ['an unknown tag is a syntax error', () => render('{% nonexistent_tag %}'), "compile error: Unknown tag 'nonexistent_tag'"],
  ['a render error is raised with -32001 when errors are strict', () => render('{{ 1 | divided_by: 0 }}', { strict: true }), 'render error -32001: Liquid error (line 1): divided by 0'],
  ['a render error prints inline when errors are not strict', () => render('a{{ 1 | divided_by: 0 }}b'), 'aLiquid error (line 1): divided by 0b']
]

let failed = 0
for (const [name, run, expected] of checks) {
  const actual = await run()
  if (actual === expected) {
    console.log(`ok   ${name}`)
  } else {
    failed++
    console.log(`FAIL ${name}\n     expected ${JSON.stringify(expected)}\n     actual   ${JSON.stringify(actual)}`)
  }
}
server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: nextId++, method: 'quit' })}\n`)
console.log(`${checks.length - failed} of ${checks.length} checks passed`)
process.exitCode = failed ? 1 : 0
