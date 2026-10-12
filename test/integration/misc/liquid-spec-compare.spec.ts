import { spawnSync } from 'child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

const script = resolve(__dirname, '../../../spec/liquid-spec/compare.mjs')
const baseline = JSON.stringify({ total_passed: 100, total_failed: 20, total_errors: 5 })
let dir: string

function gate (result: string, baselineText = baseline) {
  writeFileSync(join(dir, 'result.json'), result)
  writeFileSync(join(dir, 'baseline.json'), baselineText)
  return spawnSync(process.execPath, [script, join(dir, 'result.json'), join(dir, 'baseline.json')], { encoding: 'utf8' })
}
const totals = (passed: number) => JSON.stringify({ totals: { passed, failed: 20, errors: 5 } })

describe('liquid-spec regression gate', () => {
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'liquid-spec-compare-')) })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('passes when the pass count holds', () => {
    const run = gate(totals(100))
    expect(run.status).toBe(0)
    expect(run.stdout).toMatch(/passed 100 of 125/)
  })
  it('passes when the pass count grows', () => expect(gate(totals(101)).status).toBe(0))
  it('fails when the pass count drops', () => {
    const run = gate(totals(99))
    expect(run.status).toBe(1)
    expect(run.stderr).toMatch(/dropped below the baseline/)
  })
  it.each([
    ['an empty file', '', /empty/],
    ['a truncated file', '{"totals": {"pass', /not valid JSON/],
    ['JSON without totals', '{}', /totals\.passed is not a count/],
    ['a result with the pass count at the top level', '{"total_passed": 500}', /totals\.passed is not a count/],
    ['a result whose pass count is not a number', '{"totals": {"passed": "100", "failed": 0, "errors": 0}}', /totals\.passed is not a count/]
  ])('fails on %s, so a broken run never passes', (_name, result, message) => {
    const run = gate(result)
    expect(run.status).toBe(1)
    expect(run.stderr).toMatch(message)
  })
  it('fails when the baseline holds no pass count', () => {
    const run = gate(totals(100), '{}')
    expect(run.status).toBe(1)
    expect(run.stderr).toMatch(/baseline JSON total_passed is not a count/)
  })
  it('fails when the baseline is zero, which would accept any run', () => expect(gate(totals(100), '{"total_passed": 0}').status).toBe(1))
})
