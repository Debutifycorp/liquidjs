// Fails when liquid-spec passes fewer specs than the recorded baseline, and when either file holds no pass count, so a broken run can never pass the gate.
// Usage: node spec/liquid-spec/compare.mjs <result.json> <baseline.json>
// The result is `liquid-spec run --json` output: counts live under `totals` (`passed`, `failed`, `errors`). The baseline is `{ total_passed, total_failed, total_errors }`.
import { readFileSync } from 'node:fs'

function fail (message) {
  console.error(`liquid-spec gate: ${message}`)
  process.exit(1)
}

function readJson (path, what) {
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch (err) {
    return fail(`cannot read ${what} (${path}): ${err.message}`)
  }
  if (!text.trim()) return fail(`${what} (${path}) is empty, the liquid-spec run produced no JSON`)
  try {
    return JSON.parse(text)
  } catch (err) {
    return fail(`${what} (${path}) is not valid JSON, the liquid-spec run did not finish: ${err.message}`)
  }
}

function count (value, label) {
  if (!Number.isInteger(value) || value < 0) fail(`${label} is not a count (found ${JSON.stringify(value)})`)
  return value
}

const [resultPath, baselinePath] = process.argv.slice(2)
if (!resultPath || !baselinePath) fail('usage: node compare.mjs <result.json> <baseline.json>')

const result = readJson(resultPath, 'results JSON')
const baseline = readJson(baselinePath, 'baseline JSON')

const passed = count(result?.totals?.passed, 'results JSON totals.passed')
const failed = count(result?.totals?.failed, 'results JSON totals.failed')
const errors = count(result?.totals?.errors, 'results JSON totals.errors')
const recorded = count(baseline?.total_passed, 'baseline JSON total_passed')
if (recorded === 0) fail('baseline JSON total_passed is 0, so it would accept any run')

const total = passed + failed + errors
console.log(`liquid-spec passed ${passed} of ${total} (${((passed / total) * 100).toFixed(1)}%), baseline ${recorded}, failed ${failed}, errors ${errors}`)
if (passed < recorded) fail(`pass count dropped below the baseline (${passed} < ${recorded})`)
if (passed > recorded) console.log(`liquid-spec passes ${passed - recorded} more than the baseline: raise total_passed in ${baselinePath} to lock the gain in`)
