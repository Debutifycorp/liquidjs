import { spawnSync } from 'child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

const bin = resolve(__dirname, '../../bin/shopify-smoke.mjs')

function smoke (args: string[]) {
  const { status, stdout, stderr } = spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' })
  return { status, stdout, stderr }
}

function writeTheme (dir: string, files: Record<string, string>) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
}

const base = {
  'layout/theme.liquid': '<!doctype html><html><head>{{ content_for_header }}</head><body>{{ content_for_layout }}</body></html>',
  'config/settings_schema.json': '[]',
  'config/settings_data.json': '{"current":{}}',
  'locales/en.default.json': '{}',
  'templates/index.json': '{"sections":{"hero":{"type":"hero"}},"order":["hero"]}',
  'sections/hero.liquid': '<h1>{{ section.settings.heading }}</h1>{% schema %}{"name":"Hero","settings":[{"type":"text","id":"heading","default":"Hi"}],"presets":[{"name":"Hero"}]}{% endschema %}'
}

describe('bin/shopify-smoke.mjs', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'liquidjs-smoke-')) })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('renders every schema preset alone with --presets', () => {
    writeTheme(dir, { ...base, 'sections/banner.liquid': '<p>{{ section.blocks.size }}</p>{% schema %}{"name":"Banner","blocks":[{"type":"line","name":"Line"}],"presets":[{"name":"Banner","blocks":[{"type":"line"},{"type":"line"}]}]}{% endschema %}' })
    const { status, stdout } = smoke([dir, '--json', '--presets'])
    expect(status).toBe(0)
    const summary = JSON.parse(stdout)
    expect(summary.presets).toEqual({ rendered: 2, failed: {} })
  })

  it('passes --strict on a clean theme', () => {
    writeTheme(dir, base)
    expect(smoke([dir, '--strict']).status).toBe(0)
  })

  it('fails --strict on a problem only a preset reaches, and names it', () => {
    writeTheme(dir, { ...base, 'sections/odd.liquid': "{{ 'x' | nope_filter }}{% schema %}{\"name\":\"Odd\",\"presets\":[{\"name\":\"Odd\"}]}{% endschema %}" })
    expect(smoke([dir, '--strict']).status).toBe(0)
    const { status, stderr } = smoke([dir, '--strict', '--presets'])
    expect(status).toBe(1)
    expect(stderr).toContain('unknownFilters: nope_filter')
  })

  it('ignores problems listed with --allow', () => {
    writeTheme(dir, { ...base, 'sections/odd.liquid': "{{ 'x' | nope_filter }}{% schema %}{\"name\":\"Odd\",\"presets\":[{\"name\":\"Odd\"}]}{% endschema %}" })
    const allow = join(dir, '..', `${Date.now()}-allow.json`)
    writeFileSync(allow, JSON.stringify({ 'unknownFilters: nope_filter': 'TF-001' }))
    expect(smoke([dir, '--strict', '--presets', `--allow=${allow}`]).status).toBe(0)
    rmSync(allow)
  })
})
