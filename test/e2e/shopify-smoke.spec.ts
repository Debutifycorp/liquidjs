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

const odd = "{{ 'x' | nope_filter }}{% schema %}{\"name\":\"Odd\",\"presets\":[{\"name\":\"Odd\"}]}{% endschema %}"

describe('bin/shopify-smoke.mjs', () => {
  let dir: string
  let aux: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'liquidjs-smoke-'))
    aux = mkdtempSync(join(tmpdir(), 'liquidjs-smoke-aux-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    rmSync(aux, { recursive: true, force: true })
  })

  it('renders every schema preset alone with --presets, blocks included', () => {
    writeTheme(dir, {
      ...base,
      'sections/banner.liquid': "{% if section.blocks.size != 2 %}{{ 'x' | blocks_missing }}{% endif %}<p>{{ section.blocks.size }}</p>{% schema %}{\"name\":\"Banner\",\"blocks\":[{\"type\":\"line\",\"name\":\"Line\"}],\"presets\":[{\"name\":\"Banner\",\"blocks\":[{\"type\":\"line\"},{\"type\":\"line\"}]}]}{% endschema %}"
    })
    const { status, stdout, stderr } = smoke([dir, '--json', '--presets', '--strict'])
    expect(stderr).toBe('')
    expect(status).toBe(0)
    const summary = JSON.parse(stdout)
    expect(summary.presets).toEqual({ rendered: 2, failed: {} })
    expect(summary.unknownFilters).toEqual({})
  })

  it('keeps the order of object-form preset blocks given by block_order, and gives every nested block its own id', () => {
    writeTheme(dir, {
      ...base,
      'sections/stack.liquid': "{% assign order = section.blocks | map: 'id' | join: ',' %}{% unless order == 'first,second' %}{{ 'x' | order_wrong }}{% endunless %}{% schema %}{\"name\":\"Stack\",\"blocks\":[{\"type\":\"line\",\"name\":\"Line\"}],\"presets\":[{\"name\":\"Stack\",\"blocks\":{\"second\":{\"type\":\"line\"},\"first\":{\"type\":\"line\"}},\"block_order\":[\"first\",\"second\"]}]}{% endschema %}",
      'sections/deck.liquid': "{% capture all %}{% content_for 'blocks' %}{% endcapture %}{% unless all == '[a][c]' %}{{ 'x' | nested_wrong }}{% endunless %}{% schema %}{\"name\":\"Deck\",\"blocks\":[{\"type\":\"@theme\"}],\"presets\":[{\"name\":\"Deck\",\"blocks\":{\"row-1\":{\"type\":\"row\",\"blocks\":{\"c\":{\"type\":\"cell\"},\"a\":{\"type\":\"cell\"}},\"block_order\":[\"a\",\"c\"]}},\"block_order\":[\"row-1\"]}]}{% endschema %}",
      'sections/tree.liquid': "{% capture all %}{% content_for 'blocks' %}{% endcapture %}{% unless all == '[b0_0][mine][b1_0][b1_1]' %}{{ 'x' | ids_wrong }}{% endunless %}{% schema %}{\"name\":\"Tree\",\"blocks\":[{\"type\":\"@theme\"}],\"presets\":[{\"name\":\"Tree\",\"blocks\":[{\"type\":\"row\",\"blocks\":[{\"type\":\"cell\"},{\"type\":\"cell\",\"id\":\"mine\"}]},{\"type\":\"row\",\"blocks\":[{\"type\":\"cell\"},{\"type\":\"cell\"}]}]}]}{% endschema %}",
      'blocks/row.liquid': "{% content_for 'blocks' %}{% schema %}{\"name\":\"Row\",\"tag\":null,\"blocks\":[{\"type\":\"@theme\"}]}{% endschema %}",
      'blocks/cell.liquid': '[{{ block.id }}]{% schema %}{"name":"Cell","tag":null}{% endschema %}'
    })
    const { status, stdout, stderr } = smoke([dir, '--json', '--presets', '--strict'])
    expect(stderr).toBe('')
    expect(status).toBe(0)
    const summary = JSON.parse(stdout)
    expect(summary.presets).toEqual({ rendered: 4, failed: {} })
    expect(summary.unknownFilters).toEqual({})
  })

  it('reads a static preset block as the engine does: static only with an id of its own', () => {
    writeTheme(dir, {
      ...base,
      'sections/pinned.liquid': "{% capture all %}{% content_for 'block', type: 'tag', id: 'pin' %}{% content_for 'blocks' %}{% endcapture %}{% unless all == '[saved][default][default]' %}{{ 'x' | static_wrong }}{% endunless %}{% schema %}{\"name\":\"Pinned\",\"blocks\":[{\"type\":\"@theme\"}],\"presets\":[{\"name\":\"Pinned\",\"blocks\":[{\"type\":\"tag\",\"static\":true,\"id\":\"pin\",\"settings\":{\"label\":\"saved\"}},{\"type\":\"tag\",\"static\":true},{\"type\":\"tag\"}]}]}{% endschema %}",
      'blocks/tag.liquid': '[{{ block.settings.label }}]{% schema %}{"name":"Tag","tag":null,"settings":[{"type":"text","id":"label","label":"Label","default":"default"}]}{% endschema %}'
    })
    const { status, stdout, stderr } = smoke([dir, '--json', '--presets', '--strict'])
    expect(stderr).toBe('')
    expect(status).toBe(0)
    expect(JSON.parse(stdout).presets).toEqual({ rendered: 2, failed: {} })
  })

  it('passes --strict on a clean theme', () => {
    writeTheme(dir, base)
    expect(smoke([dir, '--strict']).status).toBe(0)
  })

  it('fails --strict on a problem only a preset reaches, and names it', () => {
    writeTheme(dir, { ...base, 'sections/odd.liquid': odd })
    expect(smoke([dir, '--strict']).status).toBe(0)
    const { status, stderr } = smoke([dir, '--strict', '--presets'])
    expect(status).toBe(1)
    expect(stderr).toContain('unknownFilters: nope_filter')
  })

  it('ignores problems listed with --allow, as an object or as an array', () => {
    writeTheme(dir, { ...base, 'sections/odd.liquid': odd })
    const asObject = join(aux, 'allow-object.json')
    const asArray = join(aux, 'allow-array.json')
    writeFileSync(asObject, JSON.stringify({ 'unknownFilters: nope_filter': 'TF-001' }))
    writeFileSync(asArray, JSON.stringify(['unknownFilters: nope_filter']))
    for (const allow of [asObject, asArray]) {
      const { status, stderr } = smoke([dir, '--strict', '--presets', `--allow=${allow}`])
      expect(stderr).toBe('')
      expect(status).toBe(0)
    }
  })

  it('refuses --allow without --strict', () => {
    writeTheme(dir, base)
    const allow = join(aux, 'allow.json')
    writeFileSync(allow, '[]')
    const { status, stderr } = smoke([dir, `--allow=${allow}`])
    expect(status).toBe(2)
    expect(stderr).toContain('--allow needs --strict')
  })

  it('warns about --allow entries that matched nothing, and still passes', () => {
    writeTheme(dir, base)
    const one = join(aux, 'one.json')
    const two = join(aux, 'two.json')
    writeFileSync(one, JSON.stringify(['unknownFilters: gone']))
    writeFileSync(two, JSON.stringify({ 'unknownFilters: gone': 'TF-001', 'missing: section gone': 'TF-002' }))
    const single = smoke([dir, '--strict', `--allow=${one}`])
    expect(single.status).toBe(0)
    expect(single.stderr).toContain('allow: 1 entry matched nothing:\n  unknownFilters: gone')
    const both = smoke([dir, '--strict', `--allow=${two}`])
    expect(both.status).toBe(0)
    expect(both.stderr).toContain('allow: 2 entries matched nothing:\n  unknownFilters: gone\n  missing: section gone')
  })

  it('exits 2 before rendering when the --allow file is missing or not valid', () => {
    writeTheme(dir, base)
    const missing = join(aux, 'missing.json')
    const absent = smoke([dir, '--strict', `--allow=${missing}`])
    expect(absent.status).toBe(2)
    expect(absent.stderr).toContain(`cannot read allow file ${missing}:`)
    const broken = join(aux, 'broken.json')
    writeFileSync(broken, '{ nope')
    const invalid = smoke([dir, '--strict', `--allow=${broken}`])
    expect(invalid.status).toBe(2)
    expect(invalid.stderr).toContain(`cannot read allow file ${broken}:`)
    const scalar = join(aux, 'scalar.json')
    writeFileSync(scalar, '"unknownFilters: nope_filter"')
    const wrongShape = smoke([dir, '--strict', `--allow=${scalar}`])
    expect(wrongShape.status).toBe(2)
    expect(wrongShape.stderr).toContain(`cannot read allow file ${scalar}:`)
  })
})
