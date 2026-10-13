import importX from 'eslint-plugin-import-x'
import neostandard from 'neostandard'
import tseslint from 'typescript-eslint'

// standard 12's `standard/array-bracket-even-spacing: either`: the brackets of a one-line array are spaced alike on both sides, by at most one space. neostandard only has array-bracket-spacing, which cannot say "either", and eslint-plugin-standard reads tokens through context methods ESLint 10 removed.
const arrayBracketEvenSpacing = {
  meta: { type: 'layout', schema: [], messages: { uneven: 'Expected consistent spacing' } },
  create (context) {
    const sourceCode = context.sourceCode
    function check (node) {
      if (node.elements.length === 0) return
      const first = sourceCode.getFirstToken(node)
      const second = sourceCode.getTokenAfter(first)
      const last = sourceCode.getLastToken(node)
      const penultimate = sourceCode.getTokenBefore(last)
      if (first.loc.start.line !== last.loc.start.line) return
      const opening = second.range[0] - first.range[1]
      const closing = last.range[0] - penultimate.range[1]
      if (closing !== opening || closing > 1) context.report({ node, messageId: 'uneven' })
    }
    return { ArrayPattern: check, ArrayExpression: check }
  }
}

// LiquidJS's lint rules (eslint-config-standard 12 and @typescript-eslint/recommended, with upstream's overrides) on ESLint's flat config. neostandard is standard's flat-config successor; the rules it adds since standard 12 are off, so upstream's code keeps its style and upstream merges stay clean, and the rules standard 12 had that neostandard dropped are switched back on with their old options.
export default [
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },
  { ignores: ['node_modules/', 'dist/', 'demo/', 'coverage/', 'docs/', '**/private.*', 'spec/liquid-spec/', '**/.*'] },
  ...neostandard({ ts: true, noJsx: true, env: ['browser', 'node', 'mocha'] }),
  ...tseslint.configs.recommended.map(config => ({ ...config, files: ['**/*.ts'] })),
  {
    rules: {
      'no-var': 'error',
      'prefer-const': 'error',
      'no-unused-vars': 'off',
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true, allowTemplateLiterals: 'always' }],
      '@stylistic/lines-between-class-members': 'off',
      '@stylistic/quote-props': 'off',
      '@stylistic/array-bracket-spacing': 'off',
      '@stylistic/object-curly-newline': 'off',
      'object-shorthand': 'off',
      'no-prototype-builtins': 'off',
      'no-void': 'off',
      '@stylistic/indent': ['error', 2],
      '@stylistic/no-extra-semi': 'error'
    }
  },
  {
    plugins: { 'import-x': importX, local: { rules: { 'array-bracket-even-spacing': arrayBracketEvenSpacing } } },
    rules: {
      'import-x/first': 'error',
      'import-x/no-duplicates': 'error',
      'import-x/no-named-default': 'error',
      'import-x/no-webpack-loader-syntax': 'error',
      'local/array-bracket-even-spacing': 'error',
      '@stylistic/comma-dangle': ['error', { arrays: 'never', objects: 'never', imports: 'never', exports: 'never', functions: 'never', enums: 'ignore', generics: 'ignore', tuples: 'ignore' }],
      'no-label-var': 'error',
      // ESLint 7 reported a function declaration in any nested block; since ESLint 9 strict code is exempt unless blockScopedFunctions is 'disallow'
      'no-inner-declarations': ['error', 'functions', { blockScopedFunctions: 'disallow' }],
      // standard 12 also had no-return-await; ESLint deprecated it in 8.46, so it is not restored
      'no-use-before-define': ['error', { functions: false, classes: false, variables: false }]
    }
  },
  {
    files: ['**/*.ts'],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      'no-dupe-class-members': 'off',
      'no-useless-constructor': 'off',
      '@typescript-eslint/adjacent-overload-signatures': 'error',
      '@typescript-eslint/no-deprecated': 'error',
      '@typescript-eslint/no-inferrable-types': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-use-before-define': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { vars: 'all', args: 'none', caughtErrors: 'none', ignoreRestSiblings: false }]
    }
  },
  // the old config ran @typescript-eslint/no-unused-vars on JavaScript files too
  { files: ['**/*.js', '**/*.cjs', '**/*.mjs'], rules: { 'no-unused-vars': ['error', { vars: 'all', args: 'none', caughtErrors: 'none', ignoreRestSiblings: false }] } },
  { files: ['**/filters/*.ts', 'src/shopify/**/*.ts', 'test/shopify/**/*.ts'], rules: { camelcase: 'off' } },
  { files: ['**/*.js', '**/*.cjs', '**/*.mjs', 'test/**/*.ts'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
  { files: ['test/**/*.ts'], rules: { '@typescript-eslint/no-deprecated': 'off', 'no-unused-expressions': 'off', '@typescript-eslint/no-unused-expressions': 'off', 'no-new': 'off' } },
  { files: ['test/e2e/**'], rules: { 'no-var': 'off', 'prefer-const': 'off' } },
  { files: ['benchmark/**'], rules: { 'no-unused-expressions': 'off' } }
]
