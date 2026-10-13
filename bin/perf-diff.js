const { execSync, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const version = require(path.join(root, 'package.json')).upstreamLiquidjs

const fileLocal = path.join(root, 'dist/liquid.node.js')
const fileLatest = path.join(root, `dist/liquid.node.${version}.js`)

// same threshold as benchmark/diff.js; one 20 s run is only good to a few percent on a shared runner, so the gate is the median of RUNS runs
const THRESHOLD_PERCENT = -3
const RUNS = 3

if (!fs.existsSync(fileLatest)) {
  const url = `https://unpkg.com/liquidjs@${version}/dist/liquid.node.js`
  console.log(`Downloading liquidjs@${version}...`)
  try {
    execSync(`curl -fsSL -o "${fileLatest}" "${url}"`)
  } catch (err) {
    fs.rmSync(fileLatest, { force: true })
    throw err
  }
}

const diffs = []
for (let run = 1; run <= RUNS; run++) {
  console.log(`\nRun ${run} of ${RUNS}`)
  // benchmark/diff.js exits 1 when its own run is below the threshold, so the exit code says nothing here: the Diff line does
  const result = spawnSync('node', ['benchmark/diff.js', fileLocal, fileLatest], { cwd: root, encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] })
  process.stdout.write(result.stdout)
  const match = /^Diff: (-?\d+(?:\.\d+)?)%$/m.exec(result.stdout)
  if (!match) {
    console.error(`benchmark/diff.js printed no Diff line (exit ${result.status}${result.signal ? `, signal ${result.signal}` : ''})`)
    process.exit(2)
  }
  diffs.push(Number(match[1]))
}

const sorted = [...diffs].sort((a, b) => a - b)
const median = sorted[Math.floor(sorted.length / 2)]
console.log(`\nDiffs: ${diffs.map(diff => `${diff.toFixed(3)}%`).join(', ')}`)
console.log(`Median diff: ${median.toFixed(3)}% (threshold ${THRESHOLD_PERCENT}%)`)
process.exit(median < THRESHOLD_PERCENT ? 1 : 0)
