import { spawnSync } from 'child_process'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

const script = resolve(__dirname, '../../../spec/liquid-spec/compare.mjs')
const gemSpecs = '/gems/bundler/gems/liquid-spec-84bf25e/specs'
let dir: string
const resultPath = () => join(dir, 'result.json')
const baselinePath = () => join(dir, 'baseline.json')

type Failure = [string, string]
const failure = (item: Failure) => ({ name: item[1], source_file: `${gemSpecs}/${item[0]}`, line_number: 1, status: 'fail' })
const result = (passed: number, failures: Failure[]) => JSON.stringify({ totals: { passed, failed: failures.length, errors: 0 }, failures: failures.map(failure) })
const baseline = (known: string[], passed = 100) => JSON.stringify({ total_passed: passed, total_failed: known.length, total_errors: 0, known_failures: known })

const one: Failure = ['basics/a.yml', 'one']
const two: Failure = ['basics/a.yml', 'two']
const three: Failure = ['liquid_ruby/b.yml', 'three']
const known = ['basics/a.yml#one', 'basics/a.yml#two', 'liquid_ruby/b.yml#three']

function run (...args: string[]) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })
}
function gate (resultText: string, baselineText: string = baseline(known)) {
  writeFileSync(resultPath(), resultText)
  writeFileSync(baselinePath(), baselineText)
  return run(resultPath(), baselinePath())
}

describe('liquid-spec regression gate', () => {
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'liquid-spec-compare-')) })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  describe('the pass count', () => {
    it('passes when the same specs fail', () => {
      const out = gate(result(100, [one, two, three]))
      expect(out.status).toBe(0)
      expect(out.stdout).toMatch(/passed 100 of 103/)
    })
    it('fails when the pass count drops, for instance because specs were skipped', () => {
      const out = gate(result(99, [one, two, three]))
      expect(out.status).toBe(1)
      expect(out.stderr).toMatch(/dropped below the baseline \(99 < 100\)/)
    })
  })

  describe('the failing specs', () => {
    it('fails when a spec fails that is not in the baseline, even though as many others now pass', () => {
      const out = gate(result(100, [one, two, ['liquid_ruby/c.yml', 'fresh']]))
      expect(out.status).toBe(1)
      expect(out.stderr).toMatch(/1 spec fails that the baseline does not list/)
      expect(out.stderr).toContain('liquid_ruby/c.yml#fresh')
      expect(out.stderr).not.toContain('basics/a.yml#one')
    })
    it('fails when a spec fails that is not in the baseline and the pass count grew', () => {
      const out = gate(result(110, [one, two, three, ['liquid_ruby/c.yml', 'fresh']]))
      expect(out.status).toBe(1)
      expect(out.stderr).toContain('liquid_ruby/c.yml#fresh')
    })
    it('passes and lists a spec that failed before and passes now', () => {
      const out = gate(result(101, [one, two]))
      expect(out.status).toBe(0)
      expect(out.stdout).toMatch(/1 spec in the baseline now passes/)
      expect(out.stdout).toContain('liquid_ruby/b.yml#three')
      expect(out.stdout).toMatch(/--write-baseline/)
    })
    it('tells two specs of one name apart by their file', () => {
      const out = gate(result(100, [one, two, ['liquid_ruby_lax/b.yml', 'three']]))
      expect(out.status).toBe(1)
      expect(out.stderr).toContain('liquid_ruby_lax/b.yml#three')
    })
    it('reads the same key wherever the gem is installed', () => {
      const text = JSON.stringify({
        totals: { passed: 100, failed: 3, errors: 0 },
        failures: [
          { name: 'one', source_file: '/home/runner/work/liquidjs/liquidjs/spec/liquid-spec/vendor/bundle/ruby/3.4.0/bundler/gems/liquid-spec-84bf25e/specs/basics/a.yml' },
          { name: 'two', source_file: 'spec/liquid-spec/vendor/bundle/ruby/3.4.0/bundler/gems/liquid-spec-84bf25e/specs/basics/a.yml' },
          { name: 'three', source_file: 'specs/liquid_ruby/b.yml' }
        ]
      })
      expect(gate(text).status).toBe(0)
    })
  })

  describe('a broken run', () => {
    it.each([
      ['an empty file', '', /empty/],
      ['a truncated file', '{"totals": {"pass', /not valid JSON/],
      ['JSON without totals', '{}', /totals\.passed is not a count/],
      ['a result with the pass count at the top level', '{"total_passed": 500}', /totals\.passed is not a count/],
      ['a result whose pass count is not a number', '{"totals": {"passed": "100", "failed": 0, "errors": 0}}', /totals\.passed is not a count/],
      ['a result without a failures list', '{"totals": {"passed": 100, "failed": 0, "errors": 0}}', /failures is not a list/],
      ['a result whose failures list is shorter than its counts', '{"totals": {"passed": 100, "failed": 2, "errors": 1}, "failures": []}', /lists 0 failures but the counts say 3/]
    ])('fails on %s, so a broken run never passes', (_name, text, message) => {
      const out = gate(text)
      expect(out.status).toBe(1)
      expect(out.stderr).toMatch(message)
    })
    it('fails when the baseline holds no pass count', () => {
      const out = gate(result(100, [one, two, three]), '{}')
      expect(out.status).toBe(1)
      expect(out.stderr).toMatch(/baseline JSON total_passed is not a count/)
    })
    it('fails when the baseline lists no failing specs and says how to write it', () => {
      const out = gate(result(100, [one, two, three]), '{"total_passed": 100}')
      expect(out.status).toBe(1)
      expect(out.stderr).toMatch(/known_failures is not a list/)
      expect(out.stderr).toMatch(/--write-baseline/)
    })
    it('fails when the baseline is zero, which would accept any run', () => expect(gate(result(100, []), baseline([], 0)).status).toBe(1))
  })

  describe('--write-baseline', () => {
    it('writes the counts and the sorted keys, and the gate then accepts the same run', () => {
      const text = result(100, [three, two, one])
      writeFileSync(resultPath(), text)
      const out = run('--write-baseline', resultPath(), baselinePath())
      expect(out.status).toBe(0)
      expect(JSON.parse(readFileSync(baselinePath(), 'utf8'))).toEqual({ total_passed: 100, total_failed: 3, total_errors: 0, known_failures: known })
      expect(run(resultPath(), baselinePath()).status).toBe(0)
    })
    it('lets a regression through only once it is written', () => {
      writeFileSync(resultPath(), result(100, [one, two, ['liquid_ruby/c.yml', 'fresh']]))
      writeFileSync(baselinePath(), baseline(known))
      expect(run(resultPath(), baselinePath()).status).toBe(1)
      expect(run('--write-baseline', resultPath(), baselinePath()).status).toBe(0)
      expect(run(resultPath(), baselinePath()).status).toBe(0)
    })
    it('refuses a broken result and leaves the baseline alone', () => {
      writeFileSync(baselinePath(), baseline(known))
      writeFileSync(resultPath(), '')
      expect(run('--write-baseline', resultPath(), baselinePath()).status).toBe(1)
      writeFileSync(resultPath(), '{"totals": {"passed": 100, "failed": 2, "errors": 1}, "failures": []}')
      expect(run('--write-baseline', resultPath(), baselinePath()).status).toBe(1)
      expect(readFileSync(baselinePath(), 'utf8')).toBe(baseline(known))
    })
    it('needs a result file', () => {
      const out = run('--write-baseline')
      expect(out.status).toBe(1)
      expect(out.stderr).toMatch(/usage/)
    })
    it('creates the baseline when there is none', () => {
      const target = join(dir, 'fresh-baseline.json')
      writeFileSync(resultPath(), result(100, [one]))
      expect(existsSync(target)).toBe(false)
      expect(run('--write-baseline', resultPath(), target).status).toBe(0)
      expect(JSON.parse(readFileSync(target, 'utf8')).known_failures).toEqual(['basics/a.yml#one'])
    })
  })
})
