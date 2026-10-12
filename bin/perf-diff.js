const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const version = require(path.join(root, 'package.json')).upstreamLiquidjs

const fileLocal = path.join(root, 'dist/liquid.node.js')
const fileLatest = path.join(root, `dist/liquid.node.${version}.js`)

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

execSync(`node benchmark/diff.js "${fileLocal}" "${fileLatest}"`, { cwd: root, stdio: 'inherit' })
