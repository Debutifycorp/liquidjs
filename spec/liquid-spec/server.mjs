// liquid-spec JSON-RPC server for @debutify/liquidjs. Shopify's liquid-spec (Ruby) starts this process and talks newline-delimited JSON-RPC 2.0 over stdin/stdout.
import { createInterface } from 'node:readline'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { Liquid, LiquidFloat, inlineErrorMessage, liquidErrorText } = require('../../dist/liquid.node.js')
const pkg = require('../../package.json')

const templates = new Map()
let nextId = 1

// Keep Ruby's integer/float distinction: liquid-spec sends 2.0 for a Float and 2 for an Integer.
const parse = (line) => JSON.parse(line, (key, value, context) => (typeof value === 'number' && /[.eE]/.test(context?.source ?? '') ? new LiquidFloat(value) : value))
const send = (message) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)

function engine (filesystem) {
  return new Liquid({
    numberSemantics: 'ruby',
    rawTags: ['raw', 'comment'],
    inlineErrors: true,
    extname: '.liquid',
    templates: filesystem ?? {},
    // a runaway spec (endless partial recursion) must end with an error before the harness's own timeout kills the whole server
    renderLimit: 1000
  })
}

function errorShape (type, err) {
  const line = err?.token?.getPosition?.()[0] ?? null
  return { type, message: err instanceof Error ? liquidErrorText(err) : String(err), line }
}

// liquid-spec's adapter (at the pinned ref) raises a render error only from a JSON-RPC error with code -32001; it ignores `result.error` on a render, where it would take `output: null` for an empty page
function sendRenderError (id, err) {
  const { message, ...data } = errorShape('render_error', err)
  // a raised error reads as Ruby's does, `Liquid error (line 5): divided by 0`, with the partial's name when it came from one
  send({ id, error: { code: -32001, message: err?.token ? inlineErrorMessage(err) : message, data } })
}

async function handle (request) {
  const { id, method, params } = request
  if (method === 'initialize') {
    return send({ id, result: { version: '1.0', implementation: pkg.name, liquid_version: pkg.version, features: [] } })
  }
  if (method === 'compile') {
    const liquid = engine(params.filesystem)
    try {
      const template = liquid.parse(params.template)
      const templateId = `tmpl_${nextId++}`
      templates.set(templateId, { liquid, template })
      return send({ id, result: { template_id: templateId } })
    } catch (err) {
      return send({ id, result: { template_id: null, error: errorShape('syntax_error', err) } })
    }
  }
  if (method === 'render') {
    const entry = templates.get(params.template_id)
    if (!entry) return send({ id, error: { code: -32602, message: `unknown template_id ${params.template_id}` } })
    const strict = params.options?.strict_errors === true
    const errors = []
    let output
    try {
      output = await entry.liquid.render(entry.template, params.environment ?? {}, { errors })
    } catch (err) {
      return sendRenderError(id, err)
    }
    if (strict && errors.length) return sendRenderError(id, errors[0])
    return send({ id, result: { output, errors: errors.map((e) => errorShape('render_error', e)) } })
  }
  if (method === 'quit') process.exit(0)
  return send({ id, error: { code: -32601, message: `method not found: ${method}` } })
}

const lines = createInterface({ input: process.stdin })
lines.on('line', (line) => {
  if (!line.trim()) return
  let request
  try {
    request = parse(line)
  } catch (err) {
    return send({ id: null, error: { code: -32700, message: String(err) } })
  }
  handle(request).catch((err) => {
    console.error(err)
    send({ id: request.id ?? null, error: { code: -32603, message: String(err) } })
  })
})
