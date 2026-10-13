// liquid-spec JSON-RPC server for @debutify/liquidjs. Shopify's liquid-spec (Ruby) starts this process and talks newline-delimited JSON-RPC 2.0 over stdin/stdout. Every suite runs on the Shopify preset (`@debutify/liquidjs/shopify`), the configuration the package ships for themes.
import { createInterface } from 'node:readline'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createShopifyLiquid, LiquidFloat, SchemaTag, inlineErrorMessage, liquidErrorText } = require('../../dist/shopify.node.js')
const pkg = require('../../package.json')

const templates = new Map()
let nextId = 1
// the host clock of the render in progress: liquid-spec sends it in `registers.current_time`, and `now` and `today` read it
let clock = null

// Keep Ruby's integer/float distinction: liquid-spec sends 2.0 for a Float and 2 for an Integer.
const parse = (line) => JSON.parse(line, (key, value, context) => (typeof value === 'number' && /[.eE]/.test(context?.source ?? '') ? new LiquidFloat(value) : value))
const send = (message) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)

// liquid-spec's filesystem is flat and read the way its Ruby `SimpleFileSystem` reads it (lib/liquid/spec/lazy_spec.rb): the name is lower-cased and gets `.liquid` unless it ends with it, so `child`, `Child` and `child.liquid` are one file, and a missing one reads `Could not find asset <name as written>`. It is not the theme layout the preset reads (`snippets/<name>.liquid`), which is what the preset's own tests cover
const flatName = (name) => {
  const lower = String(name).toLowerCase()
  return lower.endsWith('.liquid') ? lower : `${lower}.liquid`
}

class FlatFS {
  constructor (filesystem) {
    this.sep = '/'
    this.sources = new Map()
    for (const [name, source] of Object.entries(filesystem)) if (!this.sources.has(flatName(name))) this.sources.set(flatName(name), source)
  }

  // every name exists, so a lookup resolves to it and `readFileSync` says what is missing
  existsSync () {
    return true
  }

  async exists () {
    return true
  }

  resolve (dir, file) {
    return file
  }

  dirname (file) {
    return file.split('/').slice(0, -1).join('/')
  }

  readFileSync (name) {
    const source = this.sources.get(flatName(name))
    if (source === undefined) throw new Error(`Could not find asset ${name}`)
    return source
  }

  async readFile (name) {
    return this.readFileSync(name)
  }
}

function engine (filesystem) {
  return createShopifyLiquid({
    unknownTags: 'error',
    services: { currentTime: () => clock ?? new Date() },
    // wall-clock milliseconds for one render() call, partials included. A runaway spec (endless partial recursion) must end with an error before the harness's own timeout kills the whole server
    renderLimit: 1000,
    engine: { fs: new FlatFS(filesystem ?? {}) }
  })
}

// A section renders with its schema defaults under the settings it was saved with, and the Dawn recordings save none
function schemaDefaults (template) {
  const schema = template.find((node) => node instanceof SchemaTag)
  if (!schema) return null
  try {
    return Object.fromEntries((schema.json.settings ?? []).filter((setting) => setting.id && setting.default !== undefined).map((setting) => [setting.id, setting.default]))
  } catch {
    return null
  }
}

function errorShape (type, err) {
  const line = err?.token?.getPosition?.()[0] ?? null
  return { type, message: err instanceof Error ? liquidErrorText(err) : String(err), line }
}

// liquid-spec's adapter (at the pinned ref) raises a render error only from a JSON-RPC error with code -32001; it ignores `result.error` on a render, where it would take `output: null` for an empty page
function sendRenderError (id, err, strict) {
  const { message, ...data } = errorShape('render_error', err)
  // a raised error reads as Ruby's does, `Liquid error (line 5): divided by 0`, with the partial's name when it came from one. The adapter writes the inline form itself (`Liquid error: <message>`), so when errors are not strict the message is the bare text
  send({ id, error: { code: -32001, message: strict && err?.token ? inlineErrorMessage(err) : message, data } })
}

async function handle (request) {
  const { id, method, params } = request
  if (method === 'initialize') {
    return send({ id, result: { version: '1.0', implementation: pkg.name, liquid_version: pkg.version, features: ['shopify_tags', 'shopify_objects', 'shopify_filters'] } })
  }
  if (method === 'compile') {
    const liquid = engine(params.filesystem)
    try {
      const template = liquid.parse(params.template)
      const templateId = `tmpl_${nextId++}`
      // liquid-spec renders a template right after compiling it, so only the latest one is kept
      templates.clear()
      templates.set(templateId, { liquid, template, defaults: schemaDefaults(template) })
      return send({ id, result: { template_id: templateId } })
    } catch (err) {
      return send({ id, result: { template_id: null, error: errorShape('syntax_error', err) } })
    }
  }
  if (method === 'render') {
    const entry = templates.get(params.template_id)
    if (!entry) return send({ id, error: { code: -32602, message: `unknown template_id ${params.template_id}` } })
    const strict = params.options?.strict_errors === true
    const environment = { ...(params.environment ?? {}) }
    if (entry.defaults && environment.section && typeof environment.section === 'object') {
      environment.section = { ...environment.section, settings: { ...entry.defaults, ...environment.section.settings } }
    }
    const errors = []
    const currentTime = params.options?.registers?.current_time
    clock = currentTime ? new Date(currentTime) : null
    let output
    try {
      output = await entry.liquid.render(entry.template, {}, { errors, globals: environment })
    } catch (err) {
      return sendRenderError(id, err, strict)
    } finally {
      clock = null
    }
    if (strict && errors.length) return sendRenderError(id, errors[0], strict)
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
