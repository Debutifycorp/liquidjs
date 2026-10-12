// The liquid-spec regression gate. It fails when a spec fails that the baseline does not list (so a regression cannot hide behind a spec that newly passes), when the pass count drops below the baseline (so skipped or removed specs are caught), and when either file holds no usable counts (so a broken run can never pass).
// Usage: node spec/liquid-spec/compare.mjs <result.json> <baseline.json>
//        node spec/liquid-spec/compare.mjs --write-baseline <result.json> [baseline.json]   (rewrites the baseline from a run; defaults to spec/liquid-spec/baseline.json)
// The result is `liquid-spec run --json` output: counts under `totals` (`passed`, `failed`, `errors`) and every failing spec in `failures`. The baseline is `{ total_passed, total_failed, total_errors, known_failures }`, where each known failure is `<spec file relative to the gem's specs/ directory>#<spec name>`.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const COMMITTED_BASELINE = fileURLToPath(new URL('./baseline.json', import.meta.url))
const SHOWN = 40

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

// the spec file's path starts with wherever the gem is installed, so keep what follows the last `specs/` directory
function specKey (failure) {
  const { source_file: file, name } = failure ?? {}
  if (typeof file !== 'string' || typeof name !== 'string') fail('results JSON has a failure without a source_file and a name')
  return `${file.replace(/^(?:.*\/)?specs\/(.+)$/, '$1')}#${name}`
}

function readResult (path) {
  const result = readJson(path, 'results JSON')
  const totals = {
    passed: count(result?.totals?.passed, 'results JSON totals.passed'),
    failed: count(result?.totals?.failed, 'results JSON totals.failed'),
    errors: count(result?.totals?.errors, 'results JSON totals.errors')
  }
  if (!Array.isArray(result.failures)) fail('results JSON failures is not a list')
  // a truncated list would hide failures from the comparison
  if (result.failures.length !== totals.failed + totals.errors) {
    fail(`results JSON lists ${result.failures.length} failures but the counts say ${totals.failed + totals.errors}`)
  }
  return { totals, failing: new Set(result.failures.map(specKey)) }
}

function list (keys) {
  const sorted = [...keys].sort()
  const lines = sorted.slice(0, SHOWN).map((key) => `  ${key}`)
  if (sorted.length > SHOWN) lines.push(`  ... and ${sorted.length - SHOWN} more`)
  return lines.join('\n')
}

const spec = (n) => `${n} spec${n === 1 ? '' : 's'}`

const args = process.argv.slice(2)

if (args[0] === '--write-baseline') {
  const [, resultPath, baselinePath = COMMITTED_BASELINE] = args
  if (!resultPath) fail('usage: node compare.mjs --write-baseline <result.json> [baseline.json]')
  const { totals, failing } = readResult(resultPath)
  if (totals.passed === 0) fail('refusing to write a baseline with no passing specs')
  const baseline = { total_passed: totals.passed, total_failed: totals.failed, total_errors: totals.errors, known_failures: [...failing].sort() }
  writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`)
  console.log(`liquid-spec baseline written to ${baselinePath}: ${totals.passed} passing, ${failing.size} failing`)
} else {
  const [resultPath, baselinePath] = args
  if (!resultPath || !baselinePath) fail('usage: node compare.mjs <result.json> <baseline.json>')

  const { totals, failing } = readResult(resultPath)
  const baseline = readJson(baselinePath, 'baseline JSON')
  const recorded = count(baseline?.total_passed, 'baseline JSON total_passed')
  if (recorded === 0) fail('baseline JSON total_passed is 0, so it would accept any run')
  if (!Array.isArray(baseline.known_failures)) fail(`baseline JSON known_failures is not a list: run \`node spec/liquid-spec/compare.mjs --write-baseline ${resultPath}\` to write it`)
  const known = new Set(baseline.known_failures)

  const total = totals.passed + totals.failed + totals.errors
  console.log(`liquid-spec passed ${totals.passed} of ${total} (${((totals.passed / total) * 100).toFixed(1)}%), baseline ${recorded}, failed ${totals.failed}, errors ${totals.errors}`)

  const fresh = [...failing].filter((key) => !known.has(key))
  const fixed = [...known].filter((key) => !failing.has(key))
  if (fixed.length) {
    console.log(`${spec(fixed.length)} in the baseline now ${fixed.length === 1 ? 'passes' : 'pass'}, run \`node spec/liquid-spec/compare.mjs --write-baseline ${resultPath}\` to take ${fixed.length === 1 ? 'it' : 'them'} off the list:\n${list(fixed)}`)
  }
  if (fresh.length) console.error(`liquid-spec gate: ${spec(fresh.length)} fail${fresh.length === 1 ? 's' : ''} that the baseline does not list:\n${list(fresh)}`)
  if (totals.passed < recorded) console.error(`liquid-spec gate: pass count dropped below the baseline (${totals.passed} < ${recorded})`)
  if (fresh.length || totals.passed < recorded) process.exit(1)
}
