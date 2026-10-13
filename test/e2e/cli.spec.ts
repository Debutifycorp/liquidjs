import { spawnSync } from 'child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

const bin = resolve(__dirname, '../../bin/liquid.js')

function cli (args: string[], input?: string) {
  const { status, stdout, stderr } = spawnSync(process.execPath, [bin, ...args], { input: input ?? '', encoding: 'utf8', env: { ...process.env, TZ: 'UTC' } })
  return { status, stdout, stderr }
}

describe('bin/liquid.js', () => {
  let dir: string
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'liquidjs-cli-'))
    writeFileSync(join(dir, 'page.liquid'), 'Hello {{ name }}{% include "part" %}')
    mkdirSync(join(dir, 'partials'))
    writeFileSync(join(dir, 'partials', 'part.liquid'), '!')
    writeFileSync(join(dir, 'context.json'), '{"name":"file"}')
  })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('renders an inline template', () => {
    expect(cli(['-t', '{{ 1 | plus: 1 }}'])).toEqual({ status: 0, stdout: '2', stderr: '' })
  })
  it('renders a template file with a JSON context', () => {
    expect(cli(['-t', `@${join(dir, 'page.liquid')}`, '-c', '{"name":"inline"}', '--partials', join(dir, 'partials'), '--extname', '.liquid'])).toEqual({ status: 0, stdout: 'Hello inline!', stderr: '' })
  })
  it('reads the context from a file', () => {
    expect(cli(['-t', 'Hi {{ name }}', '-c', `@${join(dir, 'context.json')}`])).toEqual({ status: 0, stdout: 'Hi file', stderr: '' })
  })
  it('reads the template from stdin', () => {
    expect(cli(['-t', '@-', '-c', '{"name":"stdin"}'], '{{ name | upcase }}')).toEqual({ status: 0, stdout: 'STDIN', stderr: '' })
  })
  it('reads the context from stdin', () => {
    expect(cli(['-t', '{{ a.b }}', '-c', '@-'], '{"a":{"b":3}}')).toEqual({ status: 0, stdout: '3', stderr: '' })
  })
  it('refuses stdin for both template and context', () => {
    expect(cli(['-t', '@-', '-c', '@-'], 'x')).toEqual({ status: 1, stdout: '', stderr: "The stdin input specifier '@-' must only be used once.\n" })
  })
  it('writes to --output', () => {
    const out = join(dir, 'out.txt')
    expect(cli(['-t', 'written', '-o', out])).toEqual({ status: 0, stdout: '', stderr: '' })
    expect(readFileSync(out, 'utf8')).toBe('written')
  })
  it('passes engine flags through', () => {
    expect(cli(['-t', '{% if "" %}t{% else %}f{% endif %}', '--js-truthy'])).toEqual({ status: 0, stdout: 'f', stderr: '' })
    expect(cli(['-t', '  {%- if true %}x{% endif %}', '--trim-tag-left'])).toEqual({ status: 0, stdout: 'x', stderr: '' })
    expect(cli(['-t', '{{ 0 | date: "%H:%M" }}', '--timezone-offset', 'Asia/Shanghai'])).toEqual({ status: 0, stdout: '08:00', stderr: '' })
    expect(cli(['-t', '{{ x }}', '--cache', '10'])).toEqual({ status: 0, stdout: '', stderr: '' })
  })
  it('honours --no-dynamic-partials and --root', () => {
    expect(cli(['-t', '{% include part.liquid %}', '--no-dynamic-partials', '--root', join(dir, 'partials')])).toEqual({ status: 0, stdout: '!', stderr: '' })
  })
  it('reports render errors on stderr with exit code 1', () => {
    const { status, stdout, stderr } = cli(['-t', '{{ missing }}', '--strict-variables'])
    expect({ status, stdout }).toEqual({ status: 1, stdout: '' })
    expect(stderr).toMatch(/^undefined variable: missing, line:1, col:4\n/)
  })
  it('requires --template once options are given', () => {
    const { status, stdout, stderr } = cli(['-c', '{}'])
    expect({ status, stdout }).toEqual({ status: 1, stdout: '' })
    expect(stderr).toContain("error: required option '-t, --template <liquid | @path>' not specified")
  })
  it('ignores excess arguments', () => {
    expect(cli(['-t', 'x', 'extra'])).toEqual({ status: 0, stdout: 'x', stderr: '' })
  })
  it('rejects an unknown option', () => {
    const { status, stderr } = cli(['-t', 'x', '--nope'])
    expect(status).toBe(1)
    expect(stderr).toContain("error: unknown option '--nope'")
  })
  it('prints help', () => {
    const { status, stdout } = cli(['--help'])
    expect(status).toBe(0)
    expect(stdout).toContain('Usage: liquidjs [options]')
    expect(stdout).toContain('-t, --template <liquid | @path>')
    expect(stdout).toContain('--no-dynamic-partials')
  })
  it('keeps the legacy stdin mode with no arguments', () => {
    expect(cli([], '{{ "legacy" | upcase }}')).toEqual({ status: 0, stdout: 'LEGACY', stderr: 'Reading template from stdin. This mode will be removed in next major version, use --template option instead.\n' })
  })
  it('keeps the legacy stdin mode with a context argument', () => {
    expect(cli(['{"n":5}'], '{{ n | times: 2 }}').stdout).toBe('10')
  })
})
