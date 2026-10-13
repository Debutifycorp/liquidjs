import terser from '@rollup/plugin-terser'
import typescript from 'rollup-plugin-typescript2'
import replace from '@rollup/plugin-replace'
import { createRequire } from 'module'

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

const bundles = []
const env = process.env.BUNDLES || ''
if (env.includes('cjs')) bundles.push(nodeCjs, shopifyCjs)
if (env.includes('esm')) bundles.push(nodeEsm, browserEsm, shopifyEsm)
if (env.includes('umd')) bundles.push(browserUmd)
if (env.includes('min')) bundles.push(browserMin)
if (bundles.length === 0) bundles.push(nodeCjs, nodeEsm, browserEsm, browserUmd, browserMin, shopifyCjs, shopifyEsm)

export default bundles
