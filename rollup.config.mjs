import terser from '@rollup/plugin-terser'
import typescript from 'rollup-plugin-typescript2'
import replace from '@rollup/plugin-replace'
import { createRequire } from 'module'
import { dirname, isAbsolute, resolve } from 'path'

const pkg = createRequire(import.meta.url)('./package.json')
const version = process.env.VERSION || pkg.version
const sourcemap = true
const banner = `/*
 * @debutify/liquidjs@${version} (fork of liquidjs@${pkg.upstreamLiquidjs}), https://github.com/Debutifycorp/liquidjs
 * (c) 2016-${new Date().getFullYear()} harttle
 * Released under the MIT License.
 */`
const treeshake = {
  propertyReadSideEffects: false
}
const tsconfig = (target) => ({
  check: target !== 'es5',
  tsconfigOverride: {
    include: ['src'],
    exclude: ['test', 'benchmark', 'src/**/*.spec.ts'],
    compilerOptions: {
      target,
      module: 'ES2015',
      moduleResolution: 'node10',
      rootDir: 'src',
      downlevelIteration: true,
      // target es5, downlevelIteration and node10 resolution are deprecated in TypeScript 6 and gone in 7; the ES5 browser bundles need the first two
      ignoreDeprecations: '6.0'
    }
  }
})
// `export const version = '[VI]{version}[/VI]'` in src/index.ts becomes the package version
const versionInjection = replace({
  include: './src/index.ts',
  delimiters: ['', ''],
  preventAssignment: true,
  values: { '[VI]{version}[/VI]': version }
})
const input = './src/index.ts'
const browserFS = {
  include: './src/liquid-options.ts',
  delimiters: ['', ''],
  preventAssignment: true,
  values: { './fs/fs-impl': './build/fs-impl-browser' }
}
const browserBase64 = {
  include: './src/filters/base64.ts',
  delimiters: ['', ''],
  preventAssignment: true,
  values: { './base64-impl': '../build/base64-impl-browser' }
}
const browserCrypto = {
  include: './src/filters/crypto.ts',
  delimiters: ['', ''],
  preventAssignment: true,
  values: { './crypto-impl': '../build/crypto-impl-browser' }
}
const browserStream = {
  include: './src/emitters/index.ts',
  delimiters: ['', ''],
  preventAssignment: true,
  values: { './streamed-emitter': '../build/streamed-emitter-browser' }
}
const esmRequire = {
  include: './src/fs/fs-impl.ts',
  delimiters: ['', ''],
  preventAssignment: true,
  values: { './node-require': '../build/node-require.mjs' }
}

const nodeCjs = {
  output: [{
    file: 'dist/liquid.node.js',
    format: 'cjs',
    esModule: true,
    banner
  }],
  external: ['path', 'fs', 'stream', 'crypto'],
  plugins: [versionInjection, typescript(tsconfig('ES2020'))],
  treeshake,
  input
}

const nodeEsm = {
  output: [{
    file: 'dist/liquid.node.mjs',
    format: 'esm',
    banner
  }],
  external: ['path', 'fs', 'stream', 'crypto'],
  plugins: [
    versionInjection,
    replace(esmRequire),
    typescript(tsconfig('es6'))
  ],
  treeshake,
  input
}

const browserEsm = {
  output: [{
    file: 'dist/liquid.browser.mjs',
    format: 'esm',
    banner
  }],
  external: ['path', 'fs'],
  plugins: [
    versionInjection,
    replace(browserFS),
    replace(browserBase64),
    replace(browserCrypto),
    replace(browserStream),
    typescript(tsconfig('es6'))
  ],
  treeshake,
  input
}

const browserUmd = {
  output: [{
    file: 'dist/liquid.browser.umd.js',
    name: 'liquidjs',
    format: 'umd',
    esModule: true,
    sourcemap,
    banner
  }],
  plugins: [
    versionInjection,
    replace(browserFS),
    replace(browserBase64),
    replace(browserCrypto),
    replace(browserStream),
    typescript(tsconfig('es5'))
  ],
  treeshake,
  input
}

const browserMin = {
  output: [{
    file: 'dist/liquid.browser.min.js',
    name: 'liquidjs',
    format: 'umd',
    esModule: true,
    sourcemap,
    banner
  }],
  plugins: [
    versionInjection,
    replace(browserFS),
    replace(browserBase64),
    replace(browserCrypto),
    replace(browserStream),
    typescript(tsconfig('es5')),
    terser()
  ],
  treeshake,
  input
}

// The Shopify layer, `@debutify/liquidjs/shopify`: Node only. It re-exports the engine, so inside this entry Drops and the engine are one copy; the root entry is a separate bundle with its own. Node loads the CJS builds (the `exports` map's `default`), so `require` and `import` share one copy of each entry; bundlers read the ESM builds through the `module` condition.
const shopifyInput = './src/shopify/index.ts'

const shopifyCjs = {
  output: [{
    file: 'dist/shopify.node.js',
    format: 'cjs',
    esModule: true,
    banner
  }],
  external: ['path', 'fs', 'stream', 'crypto'],
  plugins: [versionInjection, typescript(tsconfig('ES2020'))],
  treeshake,
  input: shopifyInput
}

const shopifyEsm = {
  output: [{
    file: 'dist/shopify.node.mjs',
    format: 'esm',
    banner
  }],
  external: ['path', 'fs', 'stream', 'crypto'],
  plugins: [
    versionInjection,
    replace(esmRequire),
    typescript(tsconfig('es6'))
  ],
  treeshake,
  input: shopifyInput
}

// The storefront, `@debutify/liquidjs/storefront`: Node only. Its source imports the engine as `../shopify`; that import becomes the external module `@debutify/liquidjs/shopify`, so the engine is one copy per process (Node resolves the package's own name through its `exports`). A plugin names it external under that id: with `external` and `paths`, Rollup makes the relative id absolute first and writes a path relative to the bundle. The same plugin fails the build on any other import from `src/storefront` that is not a sibling file (`./…`) or `crypto`, which Rollup would otherwise inline (`../shopify/store/build`) or leave as a Node import (`fs`). `tslib`, the compiler's helper module, is let through: Rollup inlines it.
const storefrontInput = './src/storefront/index.ts'
const storefrontDir = resolve('src/storefront')
const shopifyEntry = resolve('src/shopify/index.ts')
const storefrontEngine = {
  name: 'storefront-engine-external',
  resolveId (source, importer) {
    if (importer === undefined || dirname(importer) !== storefrontDir) return null
    if (source === '../shopify') return { id: '@debutify/liquidjs/shopify', external: true }
    // for a file that imports only the engine's types, rpt2 hands Rollup the entry's absolute path: left alone, the module reads nothing the bundle uses and Rollup drops it. Naming it external instead fails the build (rpt2 loads every id it was handed to emit declarations and cannot load an external one), so the engine is read and tree-shaken away, and `versionInjection` below keeps the declarations it re-emits right (final review C, I2 and M7)
    if (source === shopifyEntry) return null
    // the helpers the es6 bundle's compiler adds for `async` functions and `for … of` (`__awaiter`, `__values`): rpt2 resolves `tslib` and Rollup inlines it, so the bundle imports nothing for it
    if (source === 'tslib') return null
    // a sibling file, written as `./x` or, once rpt2 has resolved it, as its absolute path
    if (source.startsWith('./') || (isAbsolute(source) && dirname(source) === storefrontDir)) return null
    return this.error(`${importer} imports '${source}': src/storefront may import only './…', '../shopify' and 'crypto'`)
  }
}

const storefrontCjs = {
  output: [{
    file: 'dist/storefront.node.js',
    format: 'cjs',
    esModule: true,
    banner
  }],
  external: ['crypto'],
  plugins: [storefrontEngine, versionInjection, typescript(tsconfig('ES2020'))],
  treeshake,
  input: storefrontInput
}

const storefrontEsm = {
  output: [{
    file: 'dist/storefront.node.mjs',
    format: 'esm',
    banner
  }],
  external: ['crypto'],
  plugins: [storefrontEngine, versionInjection, typescript(tsconfig('es6'))],
  treeshake,
  input: storefrontInput
}

const bundles = []
const env = process.env.BUNDLES || ''
if (env.includes('cjs')) bundles.push(nodeCjs, shopifyCjs, storefrontCjs)
if (env.includes('esm')) bundles.push(nodeEsm, browserEsm, shopifyEsm, storefrontEsm)
if (env.includes('umd')) bundles.push(browserUmd)
if (env.includes('min')) bundles.push(browserMin)
if (bundles.length === 0) bundles.push(nodeCjs, nodeEsm, browserEsm, browserUmd, browserMin, shopifyCjs, shopifyEsm, storefrontCjs, storefrontEsm)

export default bundles
